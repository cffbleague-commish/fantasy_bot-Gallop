"""Live Auction tab — Auction Board (top) + Copy Tracker (below).

This tab is a thin wrapper. All payload construction lives in
``data/auction_payload.py``; the UI is rendered by two iframe components in
``components_html/`` (auction_board, copy_tracker).
"""

import streamlit as st

from data.sheets import load_live_auction
from data.auction_payload import (
    build_auction_board_payload,
    build_copy_tracker_payload,
)
from models.config import get_league_year
from components import render_live_indicator, _html
from components_html.auction_board import render_auction_board
from components_html.copy_tracker import render_copy_tracker


def _infer_auction_year(df) -> int | None:
    if df.empty or "AuctionYear" not in df.columns:
        return None
    years = df["AuctionYear"].dropna().unique()
    if len(years) == 1:
        return int(years[0])
    if len(years) == 0:
        return None
    # Multi-year sheet: default to the most recent year so the components show
    # something useful.
    try:
        return int(max(int(y) for y in years))
    except (TypeError, ValueError):
        return None


def render():
    """Render the Live Auction tab."""
    league_year = get_league_year()

    raw = load_live_auction()
    if raw.empty:
        st.info(
            "No live auction data available. "
            "Run **Start Live Auction Sync** from the Google Sheets Recruiting "
            "Analytics menu to begin importing."
        )
        return

    if "IsRookie" in raw.columns:
        raw = raw[raw["IsRookie"]].copy()

    auction_year = _infer_auction_year(raw)
    is_live = (auction_year == league_year) if auction_year else False

    # --- Header
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

    # --- Auction Board
    board_payload = build_auction_board_payload(auction_year)
    board_payload["isLive"] = is_live
    render_auction_board(board_payload, height=1400)

    st.markdown("---")

    # --- Copy Tracker
    tracker_payload = build_copy_tracker_payload(auction_year)
    picked = render_copy_tracker(tracker_payload, height=1100)
    if picked and isinstance(picked, dict) and picked.get("action") == "pick":
        st.session_state["auction_copy_tracker_pick"] = picked.get("value")
