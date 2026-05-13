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
    highest AUCTION_BID for the same player+franchise.
    """
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
    """Assign a CopySession number to every row based on AUCTION_INIT boundaries."""
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
    if player_row.empty:
        st.warning(f"No board data found for {player_name}.")
        return

    p = player_row.iloc[0]

    # --- Common header ---
    stars = int(p.get("Rating", 1) or 1)
    headshot = p.get("HeadshotURL", "")
    facts = [
        {"label": "Recruit Score", "value": f"{p.get('RecruitScore', 0):.1f}" if pd.notna(p.get("RecruitScore")) else "N/A", "hero": True},
        {"label": "ESPN Grade", "value": f"{p.get('ESPNGrade', 0):.0f}" if pd.notna(p.get("ESPNGrade")) else "N/A"},
        {"label": "ADP", "value": f"{int(p['StartupADP'])}" if pd.notna(p.get("StartupADP")) else "N/A"},
        {"label": "Rank", "value": f"#{int(p.get('Rank', 0))}" if p.get("Rank") else "N/A"},
    ]

    _html(render_player_card_expanded(
        name=player_name,
        position=p.get("Position", ""),
        college=p.get("College", ""),
        stars=stars,
        headshot_url=str(headshot) if headshot else "",
        conference="",
        facts=facts,
    ))

    st.markdown("")  # spacer

    # --- Context-specific content ---
    if context == "board":
        _render_board_context(p, player_name, year)
    elif context == "auction":
        _render_auction_context(player_name, year)
    elif context == "pricing":
        _render_pricing_context(p, player_name, year)


# ---------------------------------------------------------------------------
# Board context — scouting & pricing
# ---------------------------------------------------------------------------

def _render_board_context(p, player_name: str, year: int):
    """Show scouting stats and three-model price estimates."""

    # Key stats KPI row
    render_kpi_row([
        {"label": "Recruit Score", "value": f"{p.get('RecruitScore', 0):.1f}" if pd.notna(p.get("RecruitScore")) else "N/A", "hero": True},
        {"label": "ESPN Grade", "value": f"{p.get('ESPNGrade', 0):.0f}" if pd.notna(p.get("ESPNGrade")) else "N/A"},
        {"label": "Startup ADP", "value": f"{int(p['StartupADP'])}" if pd.notna(p.get("StartupADP")) else "N/A"},
        {"label": "ADP Tier", "value": str(p.get("ADPTier", "N/A") or "N/A")},
    ])

    st.markdown("")

    # Additional stats
    col1, col2, col3, col4 = st.columns(4)
    draft_str = f"Rd {p.get('DraftRd', '')}" if p.get("DraftRd") else "N/A"
    if pd.notna(p.get("OverallPick")):
        draft_str += f", Pick {int(p['OverallPick'])}"
    col1.metric("Draft", draft_str)
    col2.metric("ESPN Rank", f"#{int(p['ESPNRank'])}" if pd.notna(p.get("ESPNRank")) else "N/A")
    col3.metric("Pos Rank", f"#{int(p['PosRank'])}" if pd.notna(p.get("PosRank")) else "N/A")
    col4.metric("Confidence", p.get("ConfidenceLabel", "N/A") or "N/A")

    # Three-model price estimates
    st.markdown("#### Price Estimates")

    current_price = p.get("PredictedCost")
    gb_price = _get_gb_price(p)
    repl_price = _build_replacement_lookup(year).get(player_name)

    price_cols = st.columns(3)

    with price_cols[0]:
        st.markdown("**Current (ADP Regression)**")
        if pd.notna(current_price):
            _html(
                f'<div class="cffb-display-2" style="color:#C9A227;">'
                f'${current_price:.0f}</div>'
            )
            # Price range
            p25 = p.get("Copy1_16")
            p75 = p.get("Copy2_16")
            if pd.notna(p25) and pd.notna(p75):
                st.caption(f"Range: ${p25:.0f} — ${p75:.0f}")
        else:
            st.caption("N/A")

    with price_cols[1]:
        st.markdown("**Multi-Feature (GB)**")
        if gb_price is not None:
            _html(
                f'<div class="cffb-display-2" style="color:#C9A227;">'
                f'${gb_price:.0f}</div>'
            )
        else:
            st.caption("N/A")

    with price_cols[2]:
        st.markdown("**Replacement-Level (VAR)**")
        if repl_price is not None:
            _html(
                f'<div class="cffb-display-2" style="color:#C9A227;">'
                f'${repl_price:.0f}</div>'
            )
        else:
            st.caption("N/A")

    st.caption(f"Price Source: {p.get('PriceSource', 'N/A') or 'N/A'}")


# ---------------------------------------------------------------------------
# Auction context — copy tracking & bid history
# ---------------------------------------------------------------------------

def _render_auction_context(player_name: str, year: int):
    """Show copy availability, per-copy auction summaries, and bid timelines."""
    df = load_live_auction(year)
    if df.empty:
        st.info("No live auction data available for this year.")
        return

    df = _resolve_winning_prices(df)
    df["BidAmount"] = pd.to_numeric(df["BidAmount"], errors="coerce").fillna(0)
    df = _assign_copy_sessions(df)

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
    total_sessions = int(player_txns["CopySession"].max()) if not player_txns.empty else 0

    kpi_tiles = [
        {"label": "Total Copies", "value": str(total_copies)},
        {"label": "Sold", "value": str(sold_count), "hero": True},
        {"label": "Available", "value": str(available_count)},
        {"label": "Copies Nominated", "value": str(total_sessions)},
    ]
    if sold_count > 0:
        kpi_tiles.append({"label": "Avg Price", "value": f"${player_won['BidAmount'].mean():.0f}"})
    else:
        total_bids = len(player_txns[player_txns["TransactionType"] == "AUCTION_BID"])
        kpi_tiles.append({"label": "Total Bids", "value": str(total_bids)})

    render_kpi_row(kpi_tiles)
    st.markdown("")

    # --- Per-Conference Availability ---
    conf_sold = player_won.groupby("Conference").size().to_dict() if not player_won.empty else {}
    conf_rows = []
    for conf in CONFERENCE_LIST:
        sold = conf_sold.get(conf, 0)
        avail = COPIES_PER_CONFERENCE - sold
        conf_rows.append({
            "Conference": conf,
            "Teams": CONFERENCES[conf],
            "Sold": sold,
            "Available": avail,
            "Status": "Available" if avail > 0 else "Full",
        })
    st.dataframe(pd.DataFrame(conf_rows), hide_index=True, use_container_width=True)

    # --- Per-Copy Auction Summary ---
    st.markdown("#### Copy Auction Summary")

    if total_sessions == 0:
        st.info("No auction sessions found for this player.")
    else:
        copy_summary_rows = []
        for session_num in range(1, total_sessions + 1):
            session = player_txns[player_txns["CopySession"] == session_num]
            if session.empty:
                continue

            init_rows = session[session["TransactionType"] == "AUCTION_INIT"]
            bid_rows = session[session["TransactionType"] == "AUCTION_BID"]
            won_rows = session[session["TransactionType"] == "AUCTION_WON"]

            nominated_by = init_rows.iloc[0]["FranchiseName"] if not init_rows.empty else ""
            opening_bid = init_rows.iloc[0]["BidAmount"] if not init_rows.empty else 0
            num_bids = len(bid_rows)
            max_bid = bid_rows["BidAmount"].max() if not bid_rows.empty else 0

            if not won_rows.empty:
                winner = won_rows.iloc[0]
                won_by = winner["FranchiseName"]
                winning_price = winner["BidAmount"]
                conference = winner.get("Conference", "")
                status = "Sold"
            else:
                won_by = ""
                winning_price = 0
                conference = ""
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
                "Copy #": f"#{session_num}",
                "Status": status,
                "Nominated By": nominated_by,
                "Opening": f"${opening_bid:.0f}",
                "# Bids": num_bids,
                "Max Bid": f"${max_bid:.0f}" if max_bid > 0 else "",
                "Won By": won_by,
                "Price": f"${winning_price:.0f}" if winning_price > 0 else "",
                "Conf": conference,
                "Duration": duration,
            })

        if copy_summary_rows:
            st.dataframe(
                pd.DataFrame(copy_summary_rows),
                hide_index=True,
                use_container_width=True,
            )

    # --- Per-Copy Bid History (expanders) ---
    st.markdown("#### Bid History by Copy")

    for session_num in range(1, total_sessions + 1):
        session = player_txns[player_txns["CopySession"] == session_num].copy()
        if session.empty:
            continue

        init_rows = session[session["TransactionType"] == "AUCTION_INIT"]
        won_rows = session[session["TransactionType"] == "AUCTION_WON"]

        header_parts = [f"**Copy #{session_num}**"]
        if not init_rows.empty:
            header_parts.append(f"Nominated by {init_rows.iloc[0]['FranchiseName']} at ${init_rows.iloc[0]['BidAmount']:.0f}")
        if not won_rows.empty:
            header_parts.append(f"Won by {won_rows.iloc[0]['FranchiseName']} at ${won_rows.iloc[0]['BidAmount']:.0f}")
        else:
            header_parts.append("In Progress")

        with st.expander(" \u2014 ".join(header_parts)):
            hist = session[["Timestamp", "Type", "FranchiseName", "BidAmount", "Note"]].copy()
            hist.rename(columns={"FranchiseName": "Team", "BidAmount": "Bid"}, inplace=True)
            hist["Bid"] = hist["Bid"].apply(lambda x: f"${x:.0f}")
            hist["Note"] = hist["Note"].fillna("")
            st.dataframe(hist, hide_index=True, use_container_width=True)

    # --- Per-Copy Timeline Chart ---
    _render_copy_timeline(player_name, player_txns)


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

    fig = go.Figure()
    sessions = sorted(timeline_df["CopySession"].unique())
    copy_colors = [
        "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
        "#1abc9c", "#e67e22", "#2980b9", "#27ae60", "#c0392b",
    ]

    for i, session_num in enumerate(sessions):
        session_data = timeline_df[timeline_df["CopySession"] == session_num].sort_values("DateTime")
        color = copy_colors[i % len(copy_colors)]

        hover_text = session_data.apply(
            lambda r: (
                f"<b>{r['Type']}</b><br>"
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
            name=f"Copy #{int(session_num)}",
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
