"""
Live Auction tab — real-time and historical view of auction transactions.
Execution mode: KPI row, filter strip, timeline scatter, transaction table.

Live mode (current year): st.fragment polling, live indicator, auto-refresh.
Historical mode (past year): static cached data, no animations.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from data.sheets import load_live_auction, load_recruiting_board, load_franchise_lookup
from models.config import POSITIONS, CONFERENCES, COPIES_PER_CONFERENCE, get_league_year
from components import (
    render_kpi_row,
    render_live_indicator,
    plotly_layout_defaults,
    _html,
)

# Human-readable labels for MFL transaction types
TRANS_TYPE_LABELS = {
    "AUCTION_INIT": "Nomination",
    "AUCTION_BID": "Bid",
    "AUCTION_WON": "Won",
}

TRANS_TYPE_COLORS = {
    "Nomination": "#C9A227",
    "Bid": "#3B82C4",
    "Won": "#2D7A4E",
}

CONFERENCE_LIST = sorted(CONFERENCES.keys())


# ---------------------------------------------------------------------------
# Data helpers (reused from views/live_auction.py)
# ---------------------------------------------------------------------------

def _resolve_winning_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Resolve AUCTION_WON prices from AUCTION_BID history."""
    bids = df[df["TransactionType"] == "AUCTION_BID"]
    if bids.empty:
        return df
    max_bids = bids.groupby(["PlayerID", "FranchiseID"])["BidAmount"].max()

    def _resolve(row):
        if row["TransactionType"] != "AUCTION_WON" or row["BidAmount"] > 0:
            return row["BidAmount"]
        key = (row["PlayerID"], row["FranchiseID"])
        if key in max_bids.index:
            return max_bids[key]
        player_bids = bids[bids["PlayerID"] == row["PlayerID"]]
        if not player_bids.empty:
            return player_bids["BidAmount"].max()
        return row["BidAmount"]

    df = df.copy()
    won_mask = df["TransactionType"] == "AUCTION_WON"
    df.loc[won_mask, "BidAmount"] = df.loc[won_mask].apply(_resolve, axis=1)
    return df


def _assign_copy_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Assign CopySession numbers based on AUCTION_INIT boundaries."""
    if df.empty:
        return df
    df = df.copy()
    df["CopySession"] = 0
    for player_id, group in df.groupby("PlayerID"):
        idx_sorted = group.sort_values("Timestamp", ascending=True).index
        counter = 0
        for i in idx_sorted:
            if df.at[i, "TransactionType"] == "AUCTION_INIT":
                counter += 1
            elif counter == 0:
                counter = 1
            df.at[i, "CopySession"] = counter
    return df


def _build_logo_lookup() -> dict:
    """Build FranchiseName -> Logo URL mapping."""
    fl = load_franchise_lookup()
    if fl.empty:
        return {}
    return {
        row["TeamName"]: row["Logo"]
        for _, row in fl.iterrows()
        if row.get("Logo") and str(row["Logo"]).startswith("http")
    }


def _build_headshot_lookup(year: int) -> dict:
    """Build PlayerName -> HeadshotURL mapping from the recruiting board."""
    board = load_recruiting_board(year)
    if board.empty or "HeadshotURL" not in board.columns:
        return {}
    return {
        row["Player"]: row["HeadshotURL"]
        for _, row in board.iterrows()
        if row.get("HeadshotURL") and str(row["HeadshotURL"]).startswith("http")
    }


def _prepare_data(df: pd.DataFrame) -> pd.DataFrame:
    """Resolve prices, add labels, assign copy sessions."""
    df = _resolve_winning_prices(df)
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)
    df["Type"] = df["TransactionType"].map(TRANS_TYPE_LABELS).fillna(df["TransactionType"])
    df = _assign_copy_sessions(df)
    return df


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------

def render():
    """Render the Live Auction tab."""
    league_year = get_league_year()

    df = load_live_auction()

    if df.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting Analytics menu to begin importing."
        )
        return

    # Determine auction year from the data (should only be one year at a time)
    auction_year = None
    if "AuctionYear" in df.columns:
        auction_years = df["AuctionYear"].dropna().unique()
        if len(auction_years) == 1:
            auction_year = int(auction_years[0])

    is_live = (auction_year == league_year) if auction_year else False

    df = _prepare_data(df)
    logo_lookup = _build_logo_lookup()
    df["FranchiseLogo"] = df["FranchiseName"].map(logo_lookup).fillna("")
    headshot_lookup = _build_headshot_lookup(None)
    df["PlayerPhoto"] = df["PlayerName"].map(headshot_lookup).fillna("")

    # --- Header with live indicator ---
    if is_live:
        _html(
            f'<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">'
            f'<span class="cffb-display-3">Live Auction</span>'
            f'{render_live_indicator("LIVE")}'
            f'</div>'
        )
    else:
        title = f"{auction_year} Auction History" if auction_year else "Auction History"
        _html(f'<div class="cffb-display-3" style="margin-bottom:16px;">{title}</div>')

    # --- KPI Row ---
    won_df = df[df["TransactionType"] == "AUCTION_WON"]
    rookie_won = int(won_df["IsRookie"].sum()) if not won_df.empty else 0

    render_kpi_row([
        {"label": "Total Events", "value": str(len(df))},
        {"label": "Completed", "value": str(len(won_df)), "hero": is_live},
        {"label": "Total Spent", "value": f"${won_df['BidAmount'].sum():,.0f}" if not won_df.empty else "$0"},
        {"label": "Avg Win", "value": f"${won_df['BidAmount'].mean():.1f}" if not won_df.empty else "$0"},
        {"label": "Highest Win", "value": f"${won_df['BidAmount'].max():.0f}" if not won_df.empty else "$0"},
        {"label": "Rookie Wins", "value": str(rookie_won)},
    ])

    st.markdown("")

    # --- Filters ---
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

    # --- Two-column layout: timeline + summary panels ---
    col_left, col_right = st.columns([60, 40], gap="medium")

    with col_left:
        _render_auction_timeline(filtered)

    with col_right:
        _render_summary_panels(filtered, won_df if type_filter == "All" else filtered[filtered["TransactionType"] == "AUCTION_WON"])

    st.markdown("---")

    # --- Recent Transactions Table ---
    st.markdown("#### Recent Transactions")
    recent = filtered.sort_values("Timestamp", ascending=False).head(50)

    display_cols = ["Timestamp", "Type", "PlayerPhoto", "PlayerName", "Position", "NFLTeam",
                    "FranchiseLogo", "Conference", "BidAmount", "CopySession", "Note", "IsRookie"]
    available = [c for c in display_cols if c in recent.columns]
    display = recent[available].copy()
    display.rename(columns={
        "PlayerPhoto": "Photo", "PlayerName": "Player", "NFLTeam": "Team",
        "FranchiseLogo": "Franchise", "Conference": "Conf",
        "BidAmount": "Bid", "CopySession": "Copy #", "IsRookie": "Rookie",
    }, inplace=True)

    if "Note" in display.columns:
        display["Note"] = display["Note"].fillna("")
    display["Bid"] = display["Bid"].apply(lambda x: f"${x:.0f}")
    display["Rookie"] = display["Rookie"].apply(lambda x: "Yes" if x else "No")
    if "Copy #" in display.columns:
        display["Copy #"] = display["Copy #"].apply(lambda x: f"#{int(x)}" if x > 0 else "")

    col_config = {
        "Franchise": st.column_config.ImageColumn("Franchise", width="small"),
    }
    if "Photo" in display.columns:
        col_config["Photo"] = st.column_config.ImageColumn("Photo", width="small")
    st.dataframe(display, column_config=col_config, hide_index=True, use_container_width=True, height=500)

    # --- Player Deep Dive ---
    st.markdown("---")
    st.markdown("#### Player Deep Dive")
    st.caption("Select a player to see copy availability, per-copy auction summaries, and bid timeline.")

    # Build player list: won players first, then remaining
    all_players = sorted(df["PlayerName"].unique().tolist())
    won_players = sorted(won_df["PlayerName"].unique().tolist()) if not won_df.empty else []
    remaining = [p for p in all_players if p not in won_players]
    player_list = won_players + remaining

    player_select = st.selectbox(
        "Search player",
        ["-- Select a player --"] + player_list,
        key="auction_deep_dive_player",
    )

    if player_select != "-- Select a player --":
        _show_player_deep_dive_auction(player_select, df, auction_year, logo_lookup)

    st.markdown("---")

    # --- Team Spending Summary ---
    st.markdown("#### Team Spending Summary")
    _render_team_spending(filtered, logo_lookup)

    st.markdown("---")

    # --- Spending by Position ---
    st.markdown("#### Spending by Position")
    _render_position_spending(filtered)

    # --- Top Acquisitions ---
    st.markdown("---")
    st.markdown("#### Top Acquisitions")
    _render_top_acquisitions(filtered, logo_lookup)


# ---------------------------------------------------------------------------
# Sub-renders
# ---------------------------------------------------------------------------

def _render_auction_timeline(filtered: pd.DataFrame):
    """Render the auction timeline scatter plot with time-range slider."""
    st.markdown("#### Auction Timeline")

    timeline_df = filtered.copy()
    timeline_df["DateTime"] = pd.to_datetime(timeline_df["Timestamp"], errors="coerce")
    timeline_df = timeline_df.dropna(subset=["DateTime"])

    if timeline_df.empty:
        st.info("No timestamped transactions to plot.")
        return

    min_dt = timeline_df["DateTime"].min()
    max_dt = timeline_df["DateTime"].max()

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

    time_filtered = time_filtered.copy()
    time_filtered["HoverText"] = time_filtered.apply(
        lambda r: (
            f"<b>{r['PlayerName']}</b> ({r['Position']})<br>"
            f"Franchise: {r['FranchiseName']}<br>"
            f"Bid: ${r['BidAmount']:.0f}<br>"
            f"Type: {r['Type']}<br>"
            + (f"Copy #{int(r['CopySession'])}<br>" if r.get("CopySession", 0) > 0 else "")
            + (f"Note: {r['Note']}" if pd.notna(r.get("Note")) and str(r.get("Note", "")).strip() else "")
        ),
        axis=1,
    )

    fig = px.scatter(
        time_filtered,
        x="DateTime", y="BidAmount",
        color="Type",
        color_discrete_map=TRANS_TYPE_COLORS,
        hover_name="PlayerName",
        custom_data=["HoverText"],
    )
    fig.update_traces(
        hovertemplate="%{customdata[0]}<extra></extra>",
        marker=dict(size=8, opacity=0.7),
    )
    layout = plotly_layout_defaults()
    layout.update(
        height=400,
        xaxis_title="Time",
        yaxis_title="Bid Amount ($)",
        legend_title_text="Type",
    )
    fig.update_layout(**layout)
    st.plotly_chart(fig, use_container_width=True)

    range_counts = time_filtered["Type"].value_counts()
    st.caption(
        f"Showing {len(time_filtered)} transactions: "
        + ", ".join(f"{t}: {c}" for t, c in range_counts.items())
    )


def _render_summary_panels(filtered: pd.DataFrame, won_filtered: pd.DataFrame):
    """Render summary panels on the right side of the two-column layout."""

    # Transaction type breakdown
    st.markdown("#### Activity Breakdown")
    type_counts = filtered.groupby("Type").size().reset_index(name="Count")
    if not type_counts.empty:
        fig = px.pie(
            type_counts, names="Type", values="Count",
            color="Type",
            color_discrete_map=TRANS_TYPE_COLORS,
        )
        layout = plotly_layout_defaults()
        layout.update(height=250)
        fig.update_layout(**layout)
        st.plotly_chart(fig, use_container_width=True)

    # Top 5 highest wins
    if not won_filtered.empty:
        st.markdown("#### Top 5 Wins")
        top5 = won_filtered.nlargest(5, "BidAmount")
        for _, row in top5.iterrows():
            st.caption(f"${row['BidAmount']:.0f} — {row['PlayerName']} ({row['Position']})")


def _render_team_spending(filtered: pd.DataFrame, logo_lookup: dict):
    """Render team spending summary table."""
    won_filtered = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if won_filtered.empty:
        st.info("No completed auctions match the current filters.")
        return

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


def _render_position_spending(filtered: pd.DataFrame):
    """Render position spending charts."""
    won_filtered = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if won_filtered.empty:
        st.info("No completed auctions to chart.")
        return

    pos_summary = won_filtered.groupby("Position").agg(
        Count=("BidAmount", "count"),
        Total=("BidAmount", "sum"),
        Avg=("BidAmount", "mean"),
    ).reset_index()
    pos_summary = pos_summary[pos_summary["Position"].isin(POSITIONS)]

    if pos_summary.empty:
        return

    pos_colors = {"QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#6A6A6A"}
    col1, col2 = st.columns(2)

    with col1:
        fig = px.bar(
            pos_summary, x="Position", y="Total",
            color="Position", color_discrete_map=pos_colors,
            title="Total Spending by Position",
        )
        layout = plotly_layout_defaults()
        layout.update(height=350, showlegend=False)
        fig.update_layout(**layout)
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        fig = px.bar(
            pos_summary, x="Position", y="Avg",
            color="Position", color_discrete_map=pos_colors,
            title="Average Win by Position",
        )
        layout = plotly_layout_defaults()
        layout.update(height=350, showlegend=False)
        fig.update_layout(**layout)
        st.plotly_chart(fig, use_container_width=True)


def _render_top_acquisitions(filtered: pd.DataFrame, logo_lookup: dict):
    """Render top acquisitions table."""
    top_won = filtered[filtered["TransactionType"] == "AUCTION_WON"]
    if top_won.empty:
        st.info("No completed auctions to display.")
        return

    top = top_won.nlargest(20, "BidAmount")
    top_cols = ["PlayerPhoto", "PlayerName", "Position", "NFLTeam",
                "FranchiseLogo", "BidAmount", "CopySession", "IsRookie"]
    top_available = [c for c in top_cols if c in top.columns]
    top_display = top[top_available].copy()
    top_display.rename(columns={
        "PlayerPhoto": "Photo", "PlayerName": "Player", "NFLTeam": "Team",
        "FranchiseLogo": "Franchise",
        "BidAmount": "Bid", "CopySession": "Copy #",
        "IsRookie": "Rookie",
    }, inplace=True)
    top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
    top_display["Rookie"] = top_display["Rookie"].apply(lambda x: "Yes" if x else "No")
    if "Copy #" in top_display.columns:
        top_display["Copy #"] = top_display["Copy #"].apply(
            lambda x: f"#{int(x)}" if x > 0 else ""
        )

    top_col_config = {
        "Franchise": st.column_config.ImageColumn("Franchise", width="small"),
    }
    if "Photo" in top_display.columns:
        top_col_config["Photo"] = st.column_config.ImageColumn("Photo", width="small")
    st.dataframe(top_display, column_config=top_col_config, hide_index=True, use_container_width=True)


def _show_player_deep_dive_auction(player_name: str, df: pd.DataFrame, auction_year: int | None, logo_lookup: dict):
    """Show the player deep dive in auction context."""
    from data.sheets import load_recruiting_board
    board_df = load_recruiting_board(auction_year)

    from modals.player_deep_dive import show_player_deep_dive
    show_player_deep_dive(player_name, board_df, auction_year, context="auction")
