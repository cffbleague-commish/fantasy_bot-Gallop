"""
Player Deep Dive modal — context-sensitive dialog for player detail.

Contexts:
- "board": scouting & pricing (recruit score, ESPN grade, 3-model prices)
- "auction": copy tracking & bid history (copy availability, per-copy timeline)
- "pricing": model estimates with prediction intervals
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go

from data.sheets import (
    load_recruiting_board,
    load_auction_data,
    load_dlf_adp,
    load_espn_prospects,
    load_live_auction,
    load_franchise_lookup,
)
from models.current_model import build_pricing_model
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import calc_replacement_prices
from models.config import CONFERENCES, COPIES_PER_CONFERENCE
from components import (
    render_player_card_expanded,
    render_kpi_row,
    render_grade_badge,
    render_value_delta,
    render_conference_badge,
    plotly_layout_defaults,
    _html,
)
from descriptions import DESCRIPTIONS


# ---------------------------------------------------------------------------
# Cached model helpers (reused from views/board.py)
# ---------------------------------------------------------------------------

@st.cache_data(ttl=300)
def _train_gb_model():
    """Cache the trained gradient boosting model."""
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()
    if auction_df.empty:
        return None
    model, _ = train_gradient_boosting(auction_df, adp_df, espn_df)
    return model


def _get_gb_price(player_row) -> float | None:
    """Get gradient boosting prediction for a single player."""
    model = _train_gb_model()
    if model is None:
        return None
    return predict_gb(
        model,
        player_row.get("Position", ""),
        player_row.get("StartupADP"),
        player_row.get("ESPNGrade"),
        player_row.get("OverallPick"),
        copy_number=1,
    )


@st.cache_data(ttl=300)
def _build_replacement_lookup(year: int) -> dict:
    """Cache replacement-level prices for the full board."""
    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()
    if board_df.empty or auction_df.empty:
        return {}
    pricing_model = build_pricing_model(auction_df, adp_df, espn_df)
    if not pricing_model:
        return {}
    repl_df = calc_replacement_prices(
        board_df,
        pricing_model["conference_budgets"],
        pricing_model.get("copy_discount_curve", {}),
    )
    lookup = {}
    if not repl_df.empty:
        for _, row in repl_df.iterrows():
            lookup[row["Player"]] = row.get("copy1_16", 0)
    return lookup


# ---------------------------------------------------------------------------
# Auction helpers (reused from views/live_auction.py)
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


# Sort priority for tie-breaking when transactions share the same timestamp.
_TXN_SORT_ORDER = {"AUCTION_WON": 0, "AUCTION_INIT": 1, "AUCTION_BID": 2}


def _assign_copy_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Assign CopySession numbers per conference using INIT/WON lifecycle.

    Each conference auctions its copies independently (max 1 active at a time).
    A new copy session starts only when there is no session currently open —
    i.e. after an AUCTION_WON closes the previous session (or at the very
    start when no session exists yet).

    Key rule: AUCTION_INIT does NOT unconditionally start a new session.
    If a session is already open (no WON yet), a subsequent INIT is treated
    as a re-nomination of the same copy (e.g. the player passed and was
    put back up) and stays in the current session.

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
            if session_closed:
                # No active session — open a new copy session.
                counter += 1
                session_closed = False
            df.at[i, "CopySession"] = counter
            if df.at[i, "TransactionType"] == "AUCTION_WON":
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


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def show_player_deep_dive(
    player_name: str,
    board_df: pd.DataFrame,
    year: int,
    context: str = "board",
):
    """Display the Player Deep Dive in the current Streamlit container.

    This is called inline (not as a @st.dialog) for compatibility — wrapping
    in st.dialog is done at the call site if desired.

    Args:
        context: "board", "auction", or "pricing"
    """
    player_row = board_df[board_df["Player"] == player_name]
    has_board_data = not player_row.empty

    if has_board_data:
        p = player_row.iloc[0]

        # --- Common header ---
        stars = int(p.get("Rating", 1) or 1)
        headshot = p.get("HeadshotURL", "")

        # Build draft string
        draft_str = f"Rd {p.get('DraftRd', '')}" if p.get("DraftRd") else "N/A"
        if pd.notna(p.get("OverallPick")):
            draft_str += f", Pick {int(p['OverallPick'])}"

        facts = [
            {"label": "Recruit Score", "value": f"{p.get('RecruitScore', 0):.2f}" if pd.notna(p.get("RecruitScore")) else "N/A", "hero": True},
            {"label": "ESPN Grade", "value": f"{p.get('ESPNGrade', 0):.0f}" if pd.notna(p.get("ESPNGrade")) else "N/A"},
            {"label": "ADP", "value": f"{p['StartupADP']:.2f}" if pd.notna(p.get("StartupADP")) else "N/A"},
            {"label": "ADP Tier", "value": str(p.get("ADPTier", "N/A") or "N/A")},
            {"label": "Rank", "value": f"#{int(p.get('Rank', 0))}" if p.get("Rank") else "N/A"},
            {"label": "ESPN Rank", "value": f"#{int(p['ESPNRank'])}" if pd.notna(p.get("ESPNRank")) else "N/A"},
            {"label": "Pos Rank", "value": f"#{int(p['PosRank'])}" if pd.notna(p.get("PosRank")) else "N/A"},
            {"label": "Draft", "value": draft_str},
            {"label": "Confidence", "value": p.get("ConfidenceLabel", "N/A") or "N/A"},
        ]

        headshot_url_str = str(headshot) if headshot and str(headshot).startswith("http") else ""

        _html(render_player_card_expanded(
            name=player_name,
            position=p.get("Position", ""),
            college=p.get("College", ""),
            stars=stars,
            headshot_url=headshot_url_str,
            conference="",
            facts=facts,
        ))

        st.markdown("")  # spacer
    else:
        # No board match — show a minimal header (auction context can still render)
        _html(f'<div class="cffb-display-3" style="margin-bottom:16px;">{player_name}</div>')

    # --- Context-specific content ---
    if context == "board":
        if has_board_data:
            _render_board_context(p, player_name, year)
        else:
            st.info(f"No board data found for {player_name}.")
    elif context == "auction":
        _render_auction_context(player_name, year)
    elif context == "pricing":
        if has_board_data:
            _render_pricing_context(p, player_name, year)
        else:
            st.info(f"No board data found for {player_name}.")


# ---------------------------------------------------------------------------
# Board context — scouting & pricing
# ---------------------------------------------------------------------------

def _render_board_context(p, player_name: str, year: int):
    """Show three-model price estimates as KPI tiles."""

    current_price = p.get("PredictedCost")
    gb_price = _get_gb_price(p)
    repl_price = _build_replacement_lookup(year).get(player_name)

    # Build price range subtitle for current model
    range_str = ""
    p25 = p.get("Copy1_16")
    p75 = p.get("Copy2_16")
    if pd.notna(p25) and pd.notna(p75):
        range_str = f"${p25:.0f} — ${p75:.0f}"

    st.markdown("#### Price Estimates")

    render_kpi_row([
        {
            "label": "ADP Regression",
            "value": f"${current_price:.0f}" if pd.notna(current_price) else "N/A",
            "hero": True,
        },
        {
            "label": "Multi-Feature (GB)",
            "value": f"${gb_price:.0f}" if gb_price is not None else "N/A",
        },
        {
            "label": "Replacement-Level",
            "value": f"${repl_price:.0f}" if repl_price is not None else "N/A",
        },
    ])

    if range_str:
        st.caption(f"ADP Regression range: {range_str}")
    st.caption(f"Price Source: {p.get('PriceSource', 'N/A') or 'N/A'}")

    with st.expander("How are prices estimated?", expanded=False):
        st.markdown(DESCRIPTIONS["adp_regression"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["gradient_boosting"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["replacement_level"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["confidence_labels"])


# ---------------------------------------------------------------------------
# Auction context — copy tracking & bid history
# ---------------------------------------------------------------------------

def _render_auction_context(player_name: str, year: int):
    """Show copy availability, per-copy auction summaries, and bid timelines."""
    df = load_live_auction()
    if df.empty:
        st.info("No live auction data available.")
        return

    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)
    df = _assign_copy_sessions(df)
    df = _resolve_winning_prices(df)

    TRANS_TYPE_LABELS = {"AUCTION_INIT": "Nomination", "AUCTION_BID": "Bid", "AUCTION_WON": "Won"}
    df["Type"] = df["TransactionType"].map(TRANS_TYPE_LABELS).fillna(df["TransactionType"])

    logo_lookup = _build_logo_lookup()
    df["FranchiseLogo"] = df["FranchiseName"].map(logo_lookup).fillna("")

    player_txns = df[df["PlayerName"] == player_name].copy()
    if player_txns.empty:
        st.info(f"No auction transactions found for {player_name}.")
        return

    player_txns = player_txns.sort_values("Timestamp", ascending=True)

    # --- Copy Availability KPIs ---
    CONFERENCE_LIST = sorted(CONFERENCES.keys())
    total_copies = len(CONFERENCE_LIST) * COPIES_PER_CONFERENCE
    player_won = player_txns[player_txns["TransactionType"] == "AUCTION_WON"]
    sold_count = len(player_won)
    available_count = total_copies - sold_count

    # Count unique (Conference, CopySession) pairs — each is one copy auction
    active_txns = player_txns[player_txns["CopySession"] > 0]
    copy_keys = (
        active_txns[["Conference", "CopySession"]]
        .drop_duplicates()
        .sort_values(["Conference", "CopySession"])
    )
    total_nominated = len(copy_keys)

    kpi_tiles = [
        {"label": "Total Copies", "value": str(total_copies)},
        {"label": "Sold", "value": str(sold_count), "hero": True},
        {"label": "Available", "value": str(available_count)},
        {"label": "Copies Nominated", "value": str(total_nominated)},
    ]
    if sold_count > 0:
        kpi_tiles.append({"label": "Avg Price", "value": f"${player_won['BidAmount'].mean():.0f}"})
    else:
        total_bids = len(player_txns[player_txns["TransactionType"] == "AUCTION_BID"])
        kpi_tiles.append({"label": "Total Bids", "value": str(total_bids)})

    render_kpi_row(kpi_tiles)
    st.markdown("")

    # --- Per-Copy Auction Summary (includes availability rows) ---
    st.markdown("#### Copy Auction Summary")
    st.caption("Select a copy to view its bid history and timeline.")

    # Build summary rows for every conference copy (nominated or available)
    # Track which (conf, session) pairs have transaction data
    conf_sessions: dict[str, set[int]] = {}
    for _, key in copy_keys.iterrows():
        conf_sessions.setdefault(key["Conference"], set()).add(int(key["CopySession"]))

    copy_summary_rows = []
    # row_keys maps row index → (conf, session_num) for selection lookup
    row_keys: list[tuple[str, int]] = []

    for conf in CONFERENCE_LIST:
        sessions_used = conf_sessions.get(conf, set())
        for copy_num in range(1, COPIES_PER_CONFERENCE + 1):
            copy_label = f"{conf} #{copy_num}"

            if copy_num in sessions_used:
                # This copy has auction data — build a real summary row
                session = player_txns[
                    (player_txns["Conference"] == conf)
                    & (player_txns["CopySession"] == copy_num)
                ]
                if session.empty:
                    continue

                init_rows = session[session["TransactionType"] == "AUCTION_INIT"]
                bid_rows = session[session["TransactionType"] == "AUCTION_BID"]
                won_rows = session[session["TransactionType"] == "AUCTION_WON"]

                nom_name = init_rows.iloc[0]["FranchiseName"] if not init_rows.empty else ""
                nom_logo = logo_lookup.get(nom_name, "") if nom_name else ""
                opening_bid = init_rows.iloc[0]["BidAmount"] if not init_rows.empty else 0
                num_bids = len(bid_rows)
                max_bid = bid_rows["BidAmount"].max() if not bid_rows.empty else 0

                if not won_rows.empty:
                    winner = won_rows.iloc[0]
                    won_name = winner["FranchiseName"]
                    won_logo = logo_lookup.get(won_name, "")
                    winning_price = winner["BidAmount"]
                    status = "Sold"
                else:
                    won_logo = ""
                    winning_price = 0
                    status = "In Progress"

                # Duration
                start_time = pd.to_datetime(session["Timestamp"].iloc[0], errors="coerce")
                end_time = pd.to_datetime(session["Timestamp"].iloc[-1], errors="coerce")
                if pd.notna(start_time) and pd.notna(end_time) and start_time != end_time:
                    delta = end_time - start_time
                    total_seconds = int(delta.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, _ = divmod(remainder, 60)
                    duration = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
                else:
                    duration = ""

                copy_summary_rows.append({
                    "Copy": copy_label,
                    "Status": status,
                    "Nominated By": nom_logo,
                    "Opening": f"${opening_bid:.0f}",
                    "# Bids": num_bids,
                    "Max Bid": f"${max_bid:.0f}" if max_bid > 0 else "",
                    "Won By": won_logo,
                    "Price": f"${winning_price:.0f}" if winning_price > 0 else "",
                    "Duration": duration,
                })
            else:
                # No auction data for this copy — mark as Available
                copy_summary_rows.append({
                    "Copy": copy_label,
                    "Status": "Available",
                    "Nominated By": "",
                    "Opening": "",
                    "# Bids": "",
                    "Max Bid": "",
                    "Won By": "",
                    "Price": "",
                    "Duration": "",
                })

            row_keys.append((conf, copy_num))

    if copy_summary_rows:
        summary_col_config = {
            "Nominated By": st.column_config.ImageColumn("Nominated By", width="small"),
            "Won By": st.column_config.ImageColumn("Won By", width="small"),
        }
        selection = st.dataframe(
            pd.DataFrame(copy_summary_rows),
            column_config=summary_col_config,
            hide_index=True,
            use_container_width=True,
            on_select="rerun",
            selection_mode="single-row",
            key="copy_summary_table",
        )

        # --- Selection-driven Bid History + Timeline ---
        selected_rows = selection.selection.rows if selection and selection.selection else []
        if selected_rows:
            sel_idx = selected_rows[0]
            if sel_idx < len(row_keys):
                sel_conf, sel_session = row_keys[sel_idx]
                sel_label = f"{sel_conf} #{sel_session}"
                sel_status = copy_summary_rows[sel_idx]["Status"]

                if sel_status == "Available":
                    st.info(f"{sel_label} has not been nominated yet.")
                else:
                    # Filter transactions to the selected copy
                    sel_txns = player_txns[
                        (player_txns["Conference"] == sel_conf)
                        & (player_txns["CopySession"] == sel_session)
                    ].copy()

                    if not sel_txns.empty:
                        # Bid history table
                        st.markdown(f"#### Bid History — {sel_label}")
                        hist = sel_txns[["Timestamp", "Type", "FranchiseLogo", "FranchiseName", "BidAmount", "Note"]].copy()
                        hist.rename(columns={"FranchiseLogo": "Team", "FranchiseName": "Name", "BidAmount": "Bid"}, inplace=True)
                        hist["Bid"] = hist["Bid"].apply(lambda x: f"${x:.0f}")
                        hist["Note"] = hist["Note"].fillna("")
                        hist_col_config = {"Team": st.column_config.ImageColumn("Team", width="small")}
                        st.dataframe(hist, column_config=hist_col_config, hide_index=True, use_container_width=True)

                        # Timeline chart for this copy only
                        _render_copy_timeline(player_name, sel_txns)
    else:
        st.info("No auction sessions found for this player.")


def _render_copy_timeline(player_name: str, player_txns: pd.DataFrame):
    """Render per-copy timeline showing bid escalation for each copy session."""
    st.markdown("#### Copy Auction Timeline")

    timeline_df = player_txns.copy()
    timeline_df["DateTime"] = pd.to_datetime(timeline_df["Timestamp"], errors="coerce")
    timeline_df = timeline_df.dropna(subset=["DateTime"])
    timeline_df = timeline_df[timeline_df["CopySession"] > 0]

    if timeline_df.empty:
        st.info("No timestamped auction data to plot.")
        return

    # Build unique (Conference, CopySession) pairs for the legend traces
    copy_keys = (
        timeline_df[["Conference", "CopySession"]]
        .drop_duplicates()
        .sort_values(["Conference", "CopySession"])
    )

    fig = go.Figure()
    copy_colors = [
        "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
        "#1abc9c", "#e67e22", "#2980b9", "#27ae60", "#c0392b",
    ]

    for i, (_, key) in enumerate(copy_keys.iterrows()):
        conf = key["Conference"]
        session_num = int(key["CopySession"])
        copy_label = f"{conf} #{session_num}"

        session_data = timeline_df[
            (timeline_df["Conference"] == conf)
            & (timeline_df["CopySession"] == session_num)
        ].sort_values("DateTime")
        color = copy_colors[i % len(copy_colors)]

        hover_text = session_data.apply(
            lambda r: (
                f"<b>{r['Type']}</b><br>"
                f"Conference: {r['Conference']}<br>"
                f"Franchise: {r['FranchiseName']}<br>"
                f"Bid: ${r['BidAmount']:.0f}<br>"
                + (f"Note: {r['Note']}" if pd.notna(r.get("Note")) and str(r.get("Note", "")).strip() else "")
            ),
            axis=1,
        )

        fig.add_trace(go.Scatter(
            x=session_data["DateTime"],
            y=session_data["BidAmount"],
            mode="lines+markers",
            name=copy_label,
            line=dict(color=color, width=2),
            marker=dict(
                size=10, color=color,
                symbol=[
                    "diamond" if t == "Nomination"
                    else "star" if t == "Won"
                    else "circle"
                    for t in session_data["Type"]
                ],
            ),
            customdata=hover_text.values,
            hovertemplate="%{customdata}<extra></extra>",
        ))

    layout = plotly_layout_defaults()
    layout.update(
        height=400,
        title=f"{player_name} \u2014 Bid Escalation by Copy",
        xaxis_title="Time",
        yaxis_title="Bid Amount ($)",
        legend_title_text="Copy",
    )
    fig.update_layout(**layout)
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Diamond = Nomination, Circle = Bid, Star = Won")


# ---------------------------------------------------------------------------
# Pricing context — model estimates with intervals
# ---------------------------------------------------------------------------

def _render_pricing_context(p, player_name: str, year: int):
    """Show three-model price estimates with prediction intervals."""
    _render_board_context(p, player_name, year)
