"""
Recruiting Analytics Dashboard — Main Entrypoint

Read-only Streamlit dashboard for fantasy football recruiting analysis.
Connects to Google Sheets for data, provides pricing models,
live auction tracking, and recruiting class evaluation.

Refactored: 4 tabs (Board, Pricing Predictor, Live Auction, Class Grades).
"""

import streamlit as st

from data.sheets import get_available_years
from styles import inject_global_css
from tabs.board import render as render_board
from tabs.pricing_predictor import render as render_pricing_predictor
from tabs.live_auction import render as render_live_auction
from tabs.class_grades import render as render_class_grades
from models.config import POSITIONS, CONFERENCES, get_league_year

# Page config
st.set_page_config(
    page_title="Recruiting Analytics",
    page_icon="\U0001f3c8",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Global design system CSS
inject_global_css()

# --- Sidebar ---
league_year = get_league_year()

with st.sidebar:
    st.markdown("## Recruiting Analytics")
    st.caption("Fantasy Football Draft Dashboard")

    # Year selector (applies to Board + Class Grades + Live Auction)
    years = get_available_years()
    if not years:
        st.error("No data found. Check your Google Sheet connection in .streamlit/secrets.toml")
        st.stop()

    selected_year = st.selectbox("Draft Year", years, key="year_selector")

    # Position filter
    position_options = ["All"] + POSITIONS
    selected_position = st.selectbox("Position", position_options, key="position_filter")

    # Conference filter
    conference_options = ["All"] + sorted(CONFERENCES.keys())
    selected_conference = st.selectbox("Conference", conference_options, key="conference_filter")

    st.markdown("---")
    st.caption(f"League Year: {league_year}")
    st.caption("Board & Class Grades use the draft year selector.")
    st.caption("Live Auction uses the draft year (current year = live mode).")
    st.caption("Pricing Predictor uses the league year.")
    st.caption("Data refreshes every 5 minutes.")

# --- Main content ---
st.markdown(f"# {selected_year} Recruiting Dashboard")

tab_board, tab_pricing, tab_auction, tab_grades = st.tabs([
    "Board",
    "Pricing Predictor",
    "Live Auction",
    "Class Grades",
])

with tab_board:
    render_board(selected_year, selected_position, selected_conference)

with tab_pricing:
    render_pricing_predictor(league_year, selected_position)

with tab_auction:
    render_live_auction(selected_year)

with tab_grades:
    render_class_grades(selected_year, selected_conference)
