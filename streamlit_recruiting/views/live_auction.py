"""
Live Auction tab — real-time view of auction transactions from MFL.
Reads from the LiveAuction sheet (populated by Apps Script timed trigger).
Shows nominations, bids, and completed auctions with bid history per player.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_live_auction, load_franchise_lookup
from models.config import POSITIONS, COLORS

# Human-readable labels for MFL transaction types
TRANS_TYPE_LABELS = {
    "AUCTION_INIT": "Nomination",
    "AUCTION_BID": "Bid",
    "AUCTION_WON": "Won",
}

TRANS_TYPE_COLORS = {
    "Nomination": "#f1c40f",
    "Bid": "#3498db",
    "Won": "#2ecc71",
}


def _label_type(raw_type: str) -> str:
    """Convert MFL transaction type to display label."""
    return TRANS_TYPE_LABELS.get(raw_type, raw_type)


def _build_logo_lookup() -> dict:
    """Build FranchiseName -> Logo URL mapping from FranchiseLookup sheet."""
    fl = load_franchise_lookup()
    if fl.empty:
        return {}
    return {
        row["TeamName"]: row["Logo"]
        for _, row in fl.iterrows()
        if row.get("Logo") and str(row["Logo"]).startswith("http")
    }


def render_live_auction_tab():
    """Render the Live Auction tab."""
    df = load_live_auction()

    if df.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting Analytics menu to begin importing."
        )
        return

    # Add display-friendly type label
    df["Type"] = df["TransactionType"].apply(_label_type)

    # Merge franchise logos
    logo_lookup = _build_logo_lookup()
    df["FranchiseLogo"] = df["FranchiseName"].map(logo_lookup).fillna("")

    st.markdown("### Live Auction Transactions")
    st.caption(f"{len(df)} transactions loaded. Data refreshes every 5 minutes (sheet syncs hourly).")

    # Summary metrics — split by transaction type
    won_df = df[df["TransactionType"] == "AUCTION_WON"]

    metric_cols = st.columns(6)
    metric_cols[0].metric("Total Events", len(df))
    metric_cols[1].metric("Completed", len(won_df))
    metric_cols[2].metric("Total Spent", f"${won_df['BidAmount'].sum():,.0f}" if not won_df.empty else "$0")
    metric_cols[3].metric("Avg Win", f"${won_df['BidAmount'].mean():.1f}" if not won_df.empty else "$0")
    metric_cols[4].metric("Highest Win", f"${won_df['BidAmount'].max():.0f}" if not won_df.empty else "$0")

    rookie_won = int(won_df["IsRookie"].sum()) if not won_df.empty else 0
    metric_cols[5].metric("Rookie Wins", rookie_won)

    st.markdown("---")

    # Filters
    col_f1, col_f2, col_f3 = st.columns(3)
    type_filter = col_f1.selectbox(
        "Transaction Type",
        ["All", "Nomination", "Bid", "Won"],
        key="auction_trans_type_filter",
    )
    pos_filter = col_f2.selectbox(
        "Position", ["All"] + POSITIONS, key="auction_pos_filter"
    )
    rookie_filter = col_f3.selectbox(
        "Player Type", ["All", "Rookies Only", "Veterans Only"], key="auction_rookie_filter"
    )

    filtered = df.copy()
    if type_filter != "All":
        filtered = filtered[filtered["Type"] == type_filter]
    if pos_filter != "All":
        filtered = filtered[filtered["Position"] == pos_filter]
    if rookie_filter == "Rookies Only":
        filtered = filtered[filtered["IsRookie"]]
    elif rookie_filter == "Veterans Only":
        filtered = filtered[~filtered["IsRookie"]]

    if filtered.empty:
        st.info("No transactions match the current filters.")
        return

    # Recent transactions
    st.markdown("#### Recent Transactions")

    recent = filtered.sort_values("Timestamp", ascending=False).head(50)

    display_cols = ["Timestamp", "Type", "PlayerName", "Position", "NFLTeam",
                    "FranchiseLogo", "FranchiseName", "Conference", "BidAmount", "IsRookie"]
    available = [c for c in display_cols if c in recent.columns]
    display = recent[available].copy()
    display.rename(columns={
        "PlayerName": "Player",
        "NFLTeam": "Team",
        "FranchiseLogo": "Logo",
        "FranchiseName": "Franchise",
        "Conference": "Conf",
        "BidAmount": "Bid",
        "IsRookie": "Rookie",
    }, inplace=True)
    display["Bid"] = display["Bid"].apply(lambda x: f"${x:.0f}")
    display["Rookie"] = display["Rookie"].apply(lambda x: "Yes" if x else "No")

    col_config = {}
    if "Logo" in display.columns:
        col_config["Logo"] = st.column_config.ImageColumn("", width="small")

    st.dataframe(display, column_config=col_config, hide_index=True, use_container_width=True, height=500)

    st.markdown("---")

    # Bid history for a specific player
    st.markdown("#### Player Bid History")
    st.caption("Select a player to see all auction activity (nomination \u2192 bids \u2192 won).")

    # Build player list from all transaction types
    players_with_activity = sorted(df["PlayerName"].unique().tolist())
    player_select = st.selectbox(
        "Select player",
        ["-- Select a player --"] + players_with_activity,
        key="auction_bid_history_player",
    )

    if player_select != "-- Select a player --":
        _render_bid_history(player_select, df)

    st.markdown("---")

    # By-team spending summary (AUCTION_WON only)
    st.markdown("#### Team Spending Summary")
    st.caption("Based on completed auctions (Won) only.")

    won_filtered = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if won_filtered.empty:
        st.info("No completed auctions match the current filters.")
    else:
        team_summary = won_filtered.groupby("FranchiseName").agg(
            Wins=("BidAmount", "count"),
            TotalSpent=("BidAmount", "sum"),
            AvgBid=("BidAmount", "mean"),
            MaxBid=("BidAmount", "max"),
            Rookies=("IsRookie", "sum"),
        ).reset_index()
        team_summary = team_summary.sort_values("TotalSpent", ascending=False)
        team_summary["Logo"] = team_summary["FranchiseName"].map(logo_lookup).fillna("")
        team_summary = team_summary[["Logo", "FranchiseName", "Wins", "TotalSpent", "AvgBid", "MaxBid", "Rookies"]]
        team_summary.columns = ["Logo", "Team", "Wins", "Total", "Avg", "Max", "Rookies"]

        team_display = team_summary.copy()
        for col in ["Total", "Avg", "Max"]:
            team_display[col] = team_display[col].apply(lambda x: f"${x:.0f}")
        team_display["Rookies"] = team_display["Rookies"].astype(int)

        team_col_config = {"Logo": st.column_config.ImageColumn("", width="small")}
        st.dataframe(team_display, column_config=team_col_config, hide_index=True, use_container_width=True)

    st.markdown("---")

    # By-position spending charts (AUCTION_WON only)
    st.markdown("#### Spending by Position")

    if won_filtered.empty:
        st.info("No completed auctions to chart.")
    else:
        pos_summary = won_filtered.groupby("Position").agg(
            Count=("BidAmount", "count"),
            Total=("BidAmount", "sum"),
            Avg=("BidAmount", "mean"),
        ).reset_index()
        pos_summary = pos_summary[pos_summary["Position"].isin(POSITIONS)]

        if not pos_summary.empty:
            col_chart1, col_chart2 = st.columns(2)

            with col_chart1:
                fig = px.bar(
                    pos_summary, x="Position", y="Total",
                    color="Position",
                    color_discrete_map=COLORS["positions"],
                    title="Total Spending by Position",
                )
                fig.update_layout(
                    template="plotly_dark",
                    paper_bgcolor=COLORS["background"],
                    plot_bgcolor=COLORS["surface"],
                    height=350,
                    showlegend=False,
                )
                st.plotly_chart(fig, use_container_width=True)

            with col_chart2:
                fig = px.bar(
                    pos_summary, x="Position", y="Avg",
                    color="Position",
                    color_discrete_map=COLORS["positions"],
                    title="Average Win by Position",
                )
                fig.update_layout(
                    template="plotly_dark",
                    paper_bgcolor=COLORS["background"],
                    plot_bgcolor=COLORS["surface"],
                    height=350,
                    showlegend=False,
                )
                st.plotly_chart(fig, use_container_width=True)

    # Transaction type breakdown chart
    st.markdown("---")
    st.markdown("#### Transaction Activity")

    type_counts = filtered.groupby("Type").size().reset_index(name="Count")
    if not type_counts.empty:
        fig = px.pie(
            type_counts, names="Type", values="Count",
            color="Type",
            color_discrete_map=TRANS_TYPE_COLORS,
            title="Transaction Breakdown",
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["surface"],
            height=350,
        )
        st.plotly_chart(fig, use_container_width=True)

    # Top acquisitions
    st.markdown("---")
    st.markdown("#### Top Acquisitions")

    top_won = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if top_won.empty:
        st.info("No completed auctions to display.")
    else:
        top = top_won.nlargest(20, "BidAmount")
        top_display = top[["PlayerName", "Position", "NFLTeam",
                            "FranchiseLogo", "FranchiseName",
                            "BidAmount", "IsRookie"]].copy()
        top_display.rename(columns={
            "PlayerName": "Player", "NFLTeam": "Team",
            "FranchiseLogo": "Logo", "FranchiseName": "Franchise",
            "BidAmount": "Bid", "IsRookie": "Rookie",
        }, inplace=True)
        top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
        top_display["Rookie"] = top_display["Rookie"].apply(lambda x: "Yes" if x else "No")

        top_col_config = {"Logo": st.column_config.ImageColumn("", width="small")}
        st.dataframe(top_display, column_config=top_col_config, hide_index=True, use_container_width=True)


def _render_bid_history(player_name: str, df: pd.DataFrame):
    """Show chronological bid history for a player: nomination -> bids -> won."""
    player_txns = df[df["PlayerName"] == player_name].copy()
    if player_txns.empty:
        st.info(f"No transactions found for {player_name}.")
        return

    player_txns = player_txns.sort_values("Timestamp", ascending=True)

    # Player info header
    first = player_txns.iloc[0]
    pos = first.get("Position", "")
    team = first.get("NFLTeam", "")
    st.markdown(f"**{player_name}** \u2014 {pos} | {team}")

    # Summary of this player's auction
    won_row = player_txns[player_txns["TransactionType"] == "AUCTION_WON"]
    bid_count = len(player_txns[player_txns["TransactionType"] == "AUCTION_BID"])
    init_row = player_txns[player_txns["TransactionType"] == "AUCTION_INIT"]

    info_cols = st.columns(4)
    if not init_row.empty:
        opener = init_row.iloc[0]
        info_cols[0].metric("Opening Bid", f"${opener['BidAmount']:.0f}")
        info_cols[1].metric("Nominated By", opener.get("FranchiseName", "Unknown"))
    info_cols[2].metric("Total Bids", bid_count)
    if not won_row.empty:
        winner = won_row.iloc[0]
        info_cols[3].metric("Won By", f"{winner.get('FranchiseName', '?')} (${winner['BidAmount']:.0f})")

    # Full chronological table
    history_display = player_txns[["Timestamp", "Type", "FranchiseLogo", "FranchiseName", "BidAmount"]].copy()
    history_display.rename(columns={
        "FranchiseLogo": "Logo",
        "FranchiseName": "Franchise",
        "BidAmount": "Bid",
    }, inplace=True)
    history_display["Bid"] = history_display["Bid"].apply(lambda x: f"${x:.0f}")

    hist_col_config = {"Logo": st.column_config.ImageColumn("", width="small")}
    st.dataframe(history_display, column_config=hist_col_config, hide_index=True, use_container_width=True)
