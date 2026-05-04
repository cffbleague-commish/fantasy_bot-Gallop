"""
Live Auction tab — real-time view of auction transactions from MFL.
Reads from the LiveAuction sheet (populated by Apps Script timed trigger).
Shows nominations, bids, and completed auctions with bid history per player.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_live_auction, load_franchise_lookup
from models.config import POSITIONS, COLORS, CONFERENCES, COPIES_PER_CONFERENCE

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

CONFERENCE_LIST = sorted(CONFERENCES.keys())


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


def _resolve_winning_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Resolve AUCTION_WON prices from AUCTION_BID history.

    MFL stores $0 in AUCTION_WON records — the actual winning price is the
    highest AUCTION_BID for the same player+franchise (the winning team's max bid).
    """
    bids = df[df["TransactionType"] == "AUCTION_BID"]
    if bids.empty:
        return df

    # For each player+franchise combo, find the max bid amount
    max_bids = bids.groupby(["PlayerID", "FranchiseID"])["BidAmount"].max()

    def _resolve(row):
        if row["TransactionType"] != "AUCTION_WON" or row["BidAmount"] > 0:
            return row["BidAmount"]
        key = (row["PlayerID"], row["FranchiseID"])
        if key in max_bids.index:
            return max_bids[key]
        # Fallback: max bid from any franchise for this player
        player_bids = bids[bids["PlayerID"] == row["PlayerID"]]
        if not player_bids.empty:
            return player_bids["BidAmount"].max()
        return row["BidAmount"]

    df = df.copy()
    won_mask = df["TransactionType"] == "AUCTION_WON"
    df.loc[won_mask, "BidAmount"] = df.loc[won_mask].apply(_resolve, axis=1)
    return df


def _compute_copy_numbers(won_df: pd.DataFrame) -> pd.DataFrame:
    """Assign copy numbers to AUCTION_WON rows, ordered by timestamp per player."""
    if won_df.empty:
        return won_df
    sorted_won = won_df.sort_values("Timestamp", ascending=True).copy()
    sorted_won["CopyNumber"] = sorted_won.groupby("PlayerID").cumcount() + 1
    return sorted_won


def render_live_auction_tab():
    """Render the Live Auction tab."""
    df = load_live_auction()

    if df.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting Analytics menu to begin importing."
        )
        return

    # Resolve winning prices from bid history (MFL stores $0 in AUCTION_WON)
    df = _resolve_winning_prices(df)
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)

    # Add display-friendly type label
    df["Type"] = df["TransactionType"].apply(_label_type)

    # Merge franchise logos
    logo_lookup = _build_logo_lookup()
    df["FranchiseLogo"] = df["FranchiseName"].map(logo_lookup).fillna("")

    # Compute copy numbers for won transactions
    won_all = df[df["TransactionType"] == "AUCTION_WON"].copy()
    won_with_copies = _compute_copy_numbers(won_all)
    if not won_with_copies.empty:
        copy_map = won_with_copies.set_index(won_with_copies.index)["CopyNumber"]
        df["CopyNumber"] = df.index.map(copy_map)
    else:
        df["CopyNumber"] = pd.NA

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
    col_f1, col_f2, col_f3, col_f4 = st.columns(4)
    type_filter = col_f1.selectbox(
        "Transaction Type",
        ["All", "Nomination", "Bid", "Won"],
        key="auction_trans_type_filter",
    )
    pos_filter = col_f2.selectbox(
        "Position", ["All"] + POSITIONS, key="auction_pos_filter"
    )
    conf_filter = col_f3.selectbox(
        "Conference", ["All"] + CONFERENCE_LIST, key="auction_conf_filter"
    )
    rookie_filter = col_f4.selectbox(
        "Player Type", ["All", "Rookies Only", "Veterans Only"], key="auction_rookie_filter"
    )

    filtered = df.copy()
    if type_filter != "All":
        filtered = filtered[filtered["Type"] == type_filter]
    if pos_filter != "All":
        filtered = filtered[filtered["Position"] == pos_filter]
    if conf_filter != "All":
        filtered = filtered[filtered["Conference"] == conf_filter]
    if rookie_filter == "Rookies Only":
        filtered = filtered[filtered["IsRookie"]]
    elif rookie_filter == "Veterans Only":
        filtered = filtered[~filtered["IsRookie"]]

    if filtered.empty:
        st.info("No transactions match the current filters.")
        return

    # Auction timeline
    st.markdown("#### Auction Timeline")
    _render_auction_timeline(filtered)

    st.markdown("---")

    # Recent transactions
    st.markdown("#### Recent Transactions")

    recent = filtered.sort_values("Timestamp", ascending=False).head(50)

    display_cols = ["Timestamp", "Type", "PlayerName", "Position", "NFLTeam",
                    "FranchiseLogo", "Conference", "BidAmount", "CopyNumber", "Note", "IsRookie"]
    available = [c for c in display_cols if c in recent.columns]
    display = recent[available].copy()
    display.rename(columns={
        "PlayerName": "Player",
        "NFLTeam": "Team",
        "FranchiseLogo": "Franchise",
        "Conference": "Conf",
        "BidAmount": "Bid",
        "CopyNumber": "Copy #",
        "IsRookie": "Rookie",
    }, inplace=True)
    if "Note" in display.columns:
        display["Note"] = display["Note"].fillna("")
    display["Bid"] = display["Bid"].apply(lambda x: f"${x:.0f}")
    display["Rookie"] = display["Rookie"].apply(lambda x: "Yes" if x else "No")
    if "Copy #" in display.columns:
        display["Copy #"] = display["Copy #"].apply(
            lambda x: f"#{int(x)}" if pd.notna(x) else ""
        )

    col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
    st.dataframe(display, column_config=col_config, hide_index=True, use_container_width=True, height=500)

    st.markdown("---")

    # Player copy availability search
    st.markdown("#### Player Copy Tracker")
    st.caption("Search for a player to see which copies have been sold and which conferences still have availability.")

    won_players = sorted(won_df["PlayerName"].unique().tolist()) if not won_df.empty else []
    all_players = sorted(df["PlayerName"].unique().tolist())
    remaining = [p for p in all_players if p not in won_players]
    player_copy_list = won_players + remaining

    player_copy_select = st.selectbox(
        "Search player",
        ["-- Select a player --"] + player_copy_list,
        key="auction_copy_tracker_player",
    )

    if player_copy_select != "-- Select a player --":
        _render_copy_tracker(player_copy_select, df, won_with_copies, logo_lookup)

    st.markdown("---")

    # Bid history for a specific player
    st.markdown("#### Player Bid History")
    st.caption("Select a player to see all auction activity (nomination \u2192 bids \u2192 won).")

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
                            "FranchiseLogo", "BidAmount",
                            "CopyNumber", "IsRookie"]].copy()
        top_display.rename(columns={
            "PlayerName": "Player", "NFLTeam": "Team",
            "FranchiseLogo": "Franchise",
            "BidAmount": "Bid", "CopyNumber": "Copy #",
            "IsRookie": "Rookie",
        }, inplace=True)
        top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
        top_display["Rookie"] = top_display["Rookie"].apply(lambda x: "Yes" if x else "No")
        if "Copy #" in top_display.columns:
            top_display["Copy #"] = top_display["Copy #"].apply(
                lambda x: f"#{int(x)}" if pd.notna(x) else ""
            )

        top_col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
        st.dataframe(top_display, column_config=top_col_config, hide_index=True, use_container_width=True)


def _render_auction_timeline(filtered: pd.DataFrame):
    """Render an interactive auction timeline with a time-range slider."""
    # Parse timestamps into datetime for plotting
    timeline_df = filtered.copy()
    timeline_df["DateTime"] = pd.to_datetime(timeline_df["Timestamp"], errors="coerce")
    timeline_df = timeline_df.dropna(subset=["DateTime"])

    if timeline_df.empty:
        st.info("No timestamped transactions to plot.")
        return

    min_dt = timeline_df["DateTime"].min()
    max_dt = timeline_df["DateTime"].max()

    # Only show slider if there's a meaningful time range
    if min_dt == max_dt:
        time_filtered = timeline_df
    else:
        date_range = st.slider(
            "Time range",
            min_value=min_dt.to_pydatetime(),
            max_value=max_dt.to_pydatetime(),
            value=(min_dt.to_pydatetime(), max_dt.to_pydatetime()),
            format="MM/DD HH:mm",
            key="auction_timeline_slider",
        )
        time_filtered = timeline_df[
            (timeline_df["DateTime"] >= date_range[0])
            & (timeline_df["DateTime"] <= date_range[1])
        ]

    if time_filtered.empty:
        st.info("No transactions in the selected time range.")
        return

    # Build hover text
    time_filtered = time_filtered.copy()
    time_filtered["HoverText"] = time_filtered.apply(
        lambda r: (
            f"<b>{r['PlayerName']}</b> ({r['Position']})<br>"
            f"Franchise: {r['FranchiseName']}<br>"
            f"Bid: ${r['BidAmount']:.0f}<br>"
            f"Type: {r['Type']}<br>"
            + (f"Note: {r['Note']}" if pd.notna(r.get("Note")) and str(r.get("Note", "")).strip() else "")
        ),
        axis=1,
    )

    fig = px.scatter(
        time_filtered,
        x="DateTime",
        y="BidAmount",
        color="Type",
        color_discrete_map=TRANS_TYPE_COLORS,
        hover_name="PlayerName",
        custom_data=["HoverText"],
        title="Auction Activity Over Time",
    )
    fig.update_traces(
        hovertemplate="%{customdata[0]}<extra></extra>",
        marker=dict(size=8, opacity=0.7),
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["surface"],
        height=400,
        xaxis_title="Time",
        yaxis_title="Bid Amount ($)",
        legend_title_text="Type",
    )
    st.plotly_chart(fig, use_container_width=True)

    # Show count in selected range
    range_counts = time_filtered["Type"].value_counts()
    st.caption(
        f"Showing {len(time_filtered)} transactions in range: "
        + ", ".join(f"{t}: {c}" for t, c in range_counts.items())
    )


def _render_copy_tracker(player_name: str, df: pd.DataFrame,
                          won_with_copies: pd.DataFrame, logo_lookup: dict):
    """Show copy availability breakdown by conference for a player."""
    total_copies = len(CONFERENCE_LIST) * COPIES_PER_CONFERENCE

    # Get all won transactions for this player
    player_won = won_with_copies[won_with_copies["PlayerName"] == player_name].copy()
    sold_count = len(player_won)
    available_count = total_copies - sold_count

    # Player info
    player_rows = df[df["PlayerName"] == player_name]
    if player_rows.empty:
        st.info(f"No data found for {player_name}.")
        return
    first = player_rows.iloc[0]
    pos = first.get("Position", "")
    team = first.get("NFLTeam", "")

    st.markdown(f"**{player_name}** \u2014 {pos} | {team}")

    # Summary metrics
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Total Copies", total_copies)
    m2.metric("Sold", sold_count)
    m3.metric("Available", available_count)
    if sold_count > 0:
        avg_price = player_won["BidAmount"].mean()
        m4.metric("Avg Price", f"${avg_price:.0f}")

    # Per-conference breakdown
    conf_sold = player_won.groupby("Conference").size().to_dict() if not player_won.empty else {}

    conf_rows = []
    for conf in CONFERENCE_LIST:
        sold = conf_sold.get(conf, 0)
        avail = COPIES_PER_CONFERENCE - sold
        status = "\u2705 Available" if avail > 0 else "\u274c Full"
        conf_rows.append({
            "Conference": conf,
            "Teams": CONFERENCES[conf],
            "Sold": sold,
            "Available": avail,
            "Status": status,
        })

    conf_df = pd.DataFrame(conf_rows)
    st.dataframe(conf_df, hide_index=True, use_container_width=True)

    # Owners table — who has each copy
    if not player_won.empty:
        st.markdown("**Owners**")
        owners = player_won.sort_values("CopyNumber")[
            ["CopyNumber", "FranchiseLogo", "FranchiseName", "Conference", "BidAmount", "Timestamp"]
        ].copy()
        owners.rename(columns={
            "CopyNumber": "Copy #",
            "FranchiseLogo": "Franchise",
            "FranchiseName": "Team",
            "BidAmount": "Bid",
        }, inplace=True)
        owners["Copy #"] = owners["Copy #"].apply(lambda x: f"#{int(x)}" if pd.notna(x) else "")
        owners["Bid"] = owners["Bid"].apply(lambda x: f"${x:.0f}")

        owners_col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
        st.dataframe(owners, column_config=owners_col_config, hide_index=True, use_container_width=True)


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
    history_display = player_txns[["Timestamp", "Type", "FranchiseLogo", "FranchiseName", "BidAmount", "Note"]].copy()
    history_display.rename(columns={
        "FranchiseLogo": "Franchise",
        "FranchiseName": "Team",
        "BidAmount": "Bid",
    }, inplace=True)
    history_display["Bid"] = history_display["Bid"].apply(lambda x: f"${x:.0f}")
    history_display["Note"] = history_display["Note"].fillna("")

    hist_col_config = {"Franchise": st.column_config.ImageColumn("Franchise", width="small")}
    st.dataframe(history_display, column_config=hist_col_config, hide_index=True, use_container_width=True)
