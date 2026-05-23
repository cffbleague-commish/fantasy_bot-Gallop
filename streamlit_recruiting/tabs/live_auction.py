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
from data.mfl_api import fetch_auction_budgets
from models.config import POSITIONS, CONFERENCES, COPIES_PER_CONFERENCE, get_league_year
from components import (
    render_kpi_row,
    render_live_indicator,
    plotly_layout_defaults,
    nfl_logo_url,
    position_badge_url,
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

# Sort priority for tie-breaking when transactions share the same timestamp.
# WON first (closes current copy session), then INIT (opens the next), then BID.
# This ensures a closing WON is processed before the next copy's opening INIT
# when both events land on the same MFL timestamp (same Unix second).
_TXN_SORT_ORDER = {"AUCTION_WON": 0, "AUCTION_INIT": 1, "AUCTION_BID": 2}

CONFERENCE_LIST = sorted(CONFERENCES.keys())


# ---------------------------------------------------------------------------
# Data helpers (reused from views/live_auction.py)
# ---------------------------------------------------------------------------

def _resolve_winning_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Resolve AUCTION_WON prices from AUCTION_BID history.

    MFL stores $0 in AUCTION_WON records — the actual winning price is the
    highest AUCTION_BID for the same player+franchise.  When CopySession is
    available the lookup is scoped to the same conference and copy session so
    that bids from a different copy (or a different conference) cannot leak in.
    """
    bids = df[df["TransactionType"] == "AUCTION_BID"]
    if bids.empty:
        return df

    has_sessions = "CopySession" in df.columns and (df["CopySession"] > 0).any()

    if has_sessions:
        max_bids = bids.groupby(
            ["PlayerID", "FranchiseID", "Conference", "CopySession"]
        )["BidAmount"].max()
    else:
        max_bids = bids.groupby(["PlayerID", "FranchiseID"])["BidAmount"].max()

    def _resolve(row):
        if row["TransactionType"] != "AUCTION_WON" or row["BidAmount"] > 0:
            return row["BidAmount"]

        # 1. Exact match scoped to conference + copy session (if available)
        if has_sessions:
            key = (row["PlayerID"], row["FranchiseID"],
                   row["Conference"], row["CopySession"])
        else:
            key = (row["PlayerID"], row["FranchiseID"])
        if key in max_bids.index:
            return max_bids[key]

        # 2. Any franchise in the same conference + copy session
        if has_sessions:
            session_bids = bids[
                (bids["PlayerID"] == row["PlayerID"])
                & (bids["Conference"] == row["Conference"])
                & (bids["CopySession"] == row["CopySession"])
            ]
            if not session_bids.empty:
                return session_bids["BidAmount"].max()

        # 3. Same conference, any session (covers nominator-won w/ no BID)
        conf_bids = bids[
            (bids["PlayerID"] == row["PlayerID"])
            & (bids["Conference"] == row["Conference"])
        ]
        if not conf_bids.empty:
            return conf_bids["BidAmount"].max()

        # 4. Last resort — any bid for this player (cross-conference)
        player_bids = bids[bids["PlayerID"] == row["PlayerID"]]
        if not player_bids.empty:
            return player_bids["BidAmount"].max()

        return row["BidAmount"]

    df = df.copy()
    won_mask = df["TransactionType"] == "AUCTION_WON"
    df.loc[won_mask, "BidAmount"] = df.loc[won_mask].apply(_resolve, axis=1)
    return df


def _assign_copy_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Assign CopySession numbers per conference using INIT/WON lifecycle.

    Each conference auctions its copies independently (max 1 active at a time).
    Rules:
    - AUCTION_INIT always opens a new session (increments counter).
    - AUCTION_WON closes the current session.
    - Any transaction after a closed session (even without an explicit INIT)
      opens a new session.  This prevents two WON events from sharing a session
      and ensures Copy #1 is always resolved before Copy #2 begins.

    Within the same timestamp the sort order is WON → INIT → BID so that
    a closing WON is processed before the next copy's opening INIT.
    """
    if df.empty:
        return df
    df = df.copy()
    df["CopySession"] = 0
    df["_txn_sort"] = df["TransactionType"].map(_TXN_SORT_ORDER).fillna(1)
    for (_, conference), group in df.groupby(["PlayerID", "Conference"]):
        if not conference or str(conference) == "nan":
            continue
        idx_sorted = group.sort_values(
            ["Timestamp", "_txn_sort"], ascending=[True, True]
        ).index
        counter = 0
        session_closed = True  # no active session at start
        for i in idx_sorted:
            txn_type = df.at[i, "TransactionType"]
            if txn_type == "AUCTION_INIT":
                # Explicit nomination — always starts a new copy session
                counter += 1
                session_closed = False
            elif session_closed:
                # Previous session was closed (won) or we haven't started yet;
                # this transaction implicitly opens the next copy session.
                counter += 1
                session_closed = False
            df.at[i, "CopySession"] = counter
            if txn_type == "AUCTION_WON":
                session_closed = True
    df.drop(columns=["_txn_sort"], inplace=True)
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


def _build_franchise_id_to_name() -> dict:
    """Build FranchiseID -> TeamName mapping."""
    fl = load_franchise_lookup()
    if fl.empty:
        return {}
    return {
        row["FranchiseID"]: row["TeamName"]
        for _, row in fl.iterrows()
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
    """Assign copy sessions, resolve prices, add labels.

    Copy sessions are assigned *before* winning-price resolution so that the
    resolver can scope its bid lookup to the correct conference + copy session.
    This prevents cross-session and cross-conference price contamination.
    """
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)
    df = _assign_copy_sessions(df)
    df = _resolve_winning_prices(df)
    df["Type"] = df["TransactionType"].map(TRANS_TYPE_LABELS).fillna(df["TransactionType"])
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

    # Scope to rookie auction transactions only
    if "IsRookie" in df.columns:
        df = df[df["IsRookie"]].copy()

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
    if "NFLTeam" in df.columns:
        df["NFLLogo"] = df["NFLTeam"].apply(nfl_logo_url)
    if "Position" in df.columns:
        df["PosBadge"] = df["Position"].apply(position_badge_url)

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

    render_kpi_row([
        {"label": "Total Events", "value": str(len(df))},
        {"label": "Completed", "value": str(len(won_df)), "hero": is_live},
        {"label": "Total Spent", "value": f"${won_df['BidAmount'].sum():,.0f}" if not won_df.empty else "$0"},
        {"label": "Avg Win", "value": f"${won_df['BidAmount'].mean():.1f}" if not won_df.empty else "$0"},
        {"label": "Highest Win", "value": f"${won_df['BidAmount'].max():.0f}" if not won_df.empty else "$0"},
        {"label": "Players Won", "value": str(won_df["PlayerName"].nunique()) if not won_df.empty else "0"},
    ])

    st.markdown("")

    # --- Filters ---
    col_f1, col_f2, col_f3 = st.columns(3)
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

    filtered = df.copy()
    if type_filter != "All":
        filtered = filtered[filtered["Type"] == type_filter]
    if pos_filter != "All":
        filtered = filtered[filtered["Position"] == pos_filter]
    if conf_filter != "All":
        filtered = filtered[filtered["Conference"] == conf_filter]

    if filtered.empty:
        st.info("No transactions match the current filters.")
        return

    # --- Two-column layout: timeline + summary panels ---
    col_left, col_right = st.columns([60, 40], gap="medium")

    with col_left:
        _render_auction_timeline(filtered)

    with col_right:
        _render_summary_panels(filtered)

    st.markdown("---")

    # --- Conference Auction Board ---
    st.markdown("#### Conference Auction Board")
    st.caption("Live auction state per conference — active nominations with current bids and recent completions.")

    # Fetch auction budget data from MFL league settings
    auction_budgets = {}
    if auction_year:
        fid_to_name = _build_franchise_id_to_name()
        raw_budgets = fetch_auction_budgets(auction_year)
        # Re-key from FranchiseID → FranchiseName for easy lookup
        auction_budgets = {
            fid_to_name.get(fid, fid): budget
            for fid, budget in raw_budgets.items()
            if fid in fid_to_name
        }

    _render_auction_board(df, logo_lookup, auction_budgets)

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


def _render_summary_panels(filtered: pd.DataFrame):
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


def _render_auction_board(df: pd.DataFrame, logo_lookup: dict, auction_budgets: dict | None = None):
    """Render per-conference auction boards showing active auctions, budget, and completions."""
    if df.empty:
        st.info("No auction data available.")
        return

    if auction_budgets is None:
        auction_budgets = {}

    # Determine which conferences have data
    conferences_with_data = sorted(
        [c for c in CONFERENCE_LIST if c in df["Conference"].unique()]
    )
    if not conferences_with_data:
        st.info("No conference-specific auction data available.")
        return

    conf_tabs = st.tabs(conferences_with_data)

    for conf_tab, conf in zip(conf_tabs, conferences_with_data):
        with conf_tab:
            conf_df = df[df["Conference"] == conf].copy()
            if conf_df.empty:
                st.info(f"No auction activity in {conf}.")
                continue

            # --- Identify active vs completed copy sessions ---
            group_cols = ["PlayerID", "PlayerName", "CopySession"]
            active_rows = []
            completed_rows = []

            for (pid, pname, copy_num), grp in conf_df.groupby(group_cols, sort=False):
                if copy_num <= 0:
                    continue

                types = set(grp["TransactionType"].unique())
                init_rows = grp[grp["TransactionType"] == "AUCTION_INIT"]
                bid_rows = grp[grp["TransactionType"] == "AUCTION_BID"]
                won_rows = grp[grp["TransactionType"] == "AUCTION_WON"]

                first = grp.iloc[0]
                photo = first.get("PlayerPhoto", "")
                pos_badge = first.get("PosBadge", "")
                nfl_logo = first.get("NFLLogo", "")

                if "AUCTION_WON" in types:
                    won_row = won_rows.iloc[0]
                    winner_logo = logo_lookup.get(won_row["FranchiseName"], "")
                    completed_rows.append({
                        "Photo": photo,
                        "Player": pname,
                        "Pos": pos_badge,
                        "NFL": nfl_logo,
                        "Copy #": f"#{int(copy_num)}",
                        "Price": f"${won_row['BidAmount']:.0f}",
                        "Winner": winner_logo,
                        "Team": won_row["FranchiseName"],
                        "Bids": len(bid_rows),
                        "Timestamp": won_row.get("Timestamp", ""),
                        "_price_num": won_row["BidAmount"],
                        "_ts": pd.to_datetime(won_row.get("Timestamp", ""), errors="coerce"),
                    })
                else:
                    if not bid_rows.empty:
                        high_bid_idx = bid_rows["BidAmount"].idxmax()
                        high_bid_row = bid_rows.loc[high_bid_idx]
                        current_bid = high_bid_row["BidAmount"]
                        current_bidder = high_bid_row["FranchiseName"]
                    elif not init_rows.empty:
                        init_row = init_rows.iloc[0]
                        current_bid = init_row["BidAmount"]
                        current_bidder = init_row["FranchiseName"]
                    else:
                        current_bid = 0
                        current_bidder = ""

                    bidder_logo = logo_lookup.get(current_bidder, "")
                    latest_ts = grp["Timestamp"].max()

                    active_rows.append({
                        "Photo": photo,
                        "Player": pname,
                        "Pos": pos_badge,
                        "NFL": nfl_logo,
                        "Copy #": f"#{int(copy_num)}",
                        "Current Bid": f"${current_bid:.0f}",
                        "High Bidder": bidder_logo,
                        "Team": current_bidder,
                        "Bids": len(bid_rows),
                        "_bid_num": current_bid,
                        "_ts": pd.to_datetime(latest_ts, errors="coerce"),
                    })

            # --- Side-by-side: Active Auctions + Team Budgets ---
            col_active, col_budget = st.columns([60, 40], gap="medium")

            with col_active:
                if active_rows:
                    st.markdown(
                        f'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                        f'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
                        f'background:#2D7A4E;animation:pulse 2s infinite;"></span>'
                        f'<span style="color:#f0f0ed;font-weight:600;">Active Auctions</span>'
                        f'<span style="color:#9A9A9A;">({len(active_rows)})</span>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
                    active_df = pd.DataFrame(active_rows)
                    active_df = active_df.sort_values("_bid_num", ascending=False)
                    display_cols = ["Photo", "Player", "Pos", "NFL", "Copy #",
                                    "Current Bid", "High Bidder", "Team", "Bids"]
                    active_display = active_df[display_cols]

                    col_config = {
                        "Photo": st.column_config.ImageColumn("", width="small"),
                        "Pos": st.column_config.ImageColumn("Pos", width="small"),
                        "NFL": st.column_config.ImageColumn("", width="small"),
                        "High Bidder": st.column_config.ImageColumn("High Bidder", width="small"),
                    }
                    st.dataframe(
                        active_display,
                        column_config=col_config,
                        hide_index=True,
                        use_container_width=True,
                        height=min(400, 38 + len(active_rows) * 35),
                    )
                else:
                    st.info(f"No active auctions in {conf}.")

            with col_budget:
                _render_team_budget(conf_df, conf, auction_budgets, logo_lookup)

            # --- Recent Completions ---
            if completed_rows:
                st.markdown(
                    f'<div style="display:flex;align-items:center;gap:8px;margin-top:16px;margin-bottom:4px;">'
                    f'<span style="color:#f0f0ed;font-weight:600;">Completed</span>'
                    f'<span style="color:#9A9A9A;">({len(completed_rows)})</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
                completed_df = pd.DataFrame(completed_rows)
                completed_df = completed_df.sort_values("_ts", ascending=False, na_position="last")
                display_cols = ["Photo", "Player", "Pos", "NFL", "Copy #",
                                "Price", "Winner", "Team", "Bids"]
                completed_display = completed_df[display_cols]

                col_config = {
                    "Photo": st.column_config.ImageColumn("", width="small"),
                    "Pos": st.column_config.ImageColumn("Pos", width="small"),
                    "NFL": st.column_config.ImageColumn("", width="small"),
                    "Winner": st.column_config.ImageColumn("Winner", width="small"),
                }
                st.dataframe(
                    completed_display,
                    column_config=col_config,
                    hide_index=True,
                    use_container_width=True,
                    height=min(500, 38 + len(completed_rows) * 35),
                )


def _render_team_budget(conf_df: pd.DataFrame, conf: str, auction_budgets: dict, logo_lookup: dict):
    """Render team budget summary for a conference.

    Shows every franchise in the conference (from FranchiseLookup) with their
    spending derived from auction data.  When MFL budget data is available,
    Starting $ and Remaining columns are included.
    """
    # Get all franchises in this conference from the lookup table
    fl = load_franchise_lookup()
    if fl.empty:
        # Fall back to franchises that appear in the auction data
        conf_franchises = sorted(conf_df["FranchiseName"].unique().tolist())
    else:
        conf_fl = fl[fl["Conference"] == conf]
        conf_franchises = sorted(conf_fl["TeamName"].unique().tolist())
        # Include any franchises in the auction data not in the lookup
        for name in conf_df["FranchiseName"].unique():
            if name not in conf_franchises:
                conf_franchises.append(name)

    if not conf_franchises:
        return

    won_df = conf_df[conf_df["TransactionType"] == "AUCTION_WON"]
    has_budgets = bool(auction_budgets)

    budget_rows = []
    for franchise in conf_franchises:
        team_won = won_df[won_df["FranchiseName"] == franchise]
        spent = team_won["BidAmount"].sum() if not team_won.empty else 0
        players_won = len(team_won)

        row = {
            "Logo": logo_lookup.get(franchise, ""),
            "Team": franchise,
            "Spent": f"${spent:.0f}",
            "Won": players_won,
            "_spent_num": spent,
        }

        if has_budgets:
            budget = auction_budgets.get(franchise)
            if budget is not None:
                remaining = budget - spent
                remaining_pct = (remaining / budget * 100) if budget > 0 else 0
                row["Starting $"] = f"${budget:.0f}"
                row["Remaining"] = f"${remaining:.0f}"
                row["% Left"] = f"{remaining_pct:.0f}%"
                row["_remaining"] = remaining
            else:
                row["Starting $"] = "—"
                row["Remaining"] = "—"
                row["% Left"] = "—"
                row["_remaining"] = 0

        budget_rows.append(row)

    st.markdown(
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
        '<span style="color:#f0f0ed;font-weight:600;">Team Budgets</span>'
        '</div>',
        unsafe_allow_html=True,
    )
    budget_df = pd.DataFrame(budget_rows)

    if has_budgets:
        budget_df = budget_df.sort_values("_remaining", ascending=True)
        display_cols = ["Logo", "Team", "Starting $", "Spent", "Remaining", "% Left", "Won"]
    else:
        budget_df = budget_df.sort_values("_spent_num", ascending=False)
        display_cols = ["Logo", "Team", "Spent", "Won"]

    budget_display = budget_df[display_cols]

    col_config = {
        "Logo": st.column_config.ImageColumn("", width="small"),
    }
    st.dataframe(
        budget_display,
        column_config=col_config,
        hide_index=True,
        use_container_width=True,
        height=min(400, 38 + len(budget_rows) * 35),
    )


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
    ).reset_index()
    team_summary = team_summary.sort_values("TotalSpent", ascending=False)
    team_summary["Logo"] = team_summary["FranchiseName"].map(logo_lookup).fillna("")
    team_summary = team_summary[["Logo", "FranchiseName", "Wins", "TotalSpent", "AvgBid", "MaxBid"]]
    team_summary.columns = ["Logo", "Team", "Wins", "Total", "Avg", "Max"]

    team_display = team_summary.copy()
    for col in ["Total", "Avg", "Max"]:
        team_display[col] = team_display[col].apply(lambda x: f"${x:.0f}")

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
    top_cols = ["PlayerPhoto", "PlayerName", "PosBadge", "NFLLogo", "NFLTeam",
                "FranchiseLogo", "BidAmount", "CopySession"]
    top_available = [c for c in top_cols if c in top.columns]
    top_display = top[top_available].copy()
    top_display.rename(columns={
        "PlayerPhoto": "Photo", "PlayerName": "Player", "PosBadge": "Pos",
        "NFLLogo": "NFL", "NFLTeam": "Team",
        "FranchiseLogo": "Franchise",
        "BidAmount": "Bid", "CopySession": "Copy #",
    }, inplace=True)
    top_display["Bid"] = top_display["Bid"].apply(lambda x: f"${x:.0f}")
    if "Copy #" in top_display.columns:
        top_display["Copy #"] = top_display["Copy #"].apply(
            lambda x: f"#{int(x)}" if x > 0 else ""
        )

    top_col_config = {
        "Franchise": st.column_config.ImageColumn("", width="small"),
    }
    if "Photo" in top_display.columns:
        top_col_config["Photo"] = st.column_config.ImageColumn("", width="small")
    if "Pos" in top_display.columns:
        top_col_config["Pos"] = st.column_config.ImageColumn("Pos", width="small")
    if "NFL" in top_display.columns:
        top_col_config["NFL"] = st.column_config.ImageColumn("", width="small")
    st.dataframe(top_display, column_config=top_col_config, hide_index=True, use_container_width=True)


def _show_player_deep_dive_auction(player_name: str, df: pd.DataFrame, auction_year: int | None, logo_lookup: dict):
    """Show the player deep dive in auction context."""
    from data.sheets import load_recruiting_board
    board_df = load_recruiting_board(auction_year)

    from modals.player_deep_dive import show_player_deep_dive
    show_player_deep_dive(player_name, board_df, auction_year, context="auction")
