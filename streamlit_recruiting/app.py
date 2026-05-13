"""
Recruiting Analytics Dashboard — Main Entrypoint

Read-only Streamlit dashboard for fantasy football recruiting analysis.
Connects to Google Sheets for data, provides pricing models,
live auction tracking, and recruiting class evaluation.

Refactored: 4 tabs (Board, Pricing Predictor, Live Auction, Class Grades).
"""

import streamlit as st

from styles import inject_global_css
from tabs.board import render as render_board
from tabs.pricing_predictor import render as render_pricing_predictor
from tabs.live_auction import render as render_live_auction
from tabs.class_grades import render as render_class_grades
from models.config import get_league_year

# Page config
st.set_page_config(
    page_title="CFFB Recruiting Analytics",
    page_icon="\U0001f3c8",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Global design system CSS
inject_global_css()

# --- Sidebar (app info only) ---
with st.sidebar:
    st.markdown("## CFFB Recruiting Analytics")
    st.caption("Fantasy College Football Recruiting Dashboard")
    st.markdown("---")
    league_year = get_league_year()
    st.caption(f"League Year: {league_year}")
    st.caption("Data refreshes every 5 minutes.")

# --- App title ---
st.markdown("# CFFB Recruiting Analytics")

# --- Tabs ---
tab_board, tab_pricing, tab_auction, tab_grades = st.tabs([
    "Board",
    "Pricing Predictor",
    "Live Auction",
    "Class Grades",
])

with tab_board:
    render_board()

with tab_pricing:
    render_pricing_predictor()

with tab_auction:
    render_live_auction()

with tab_grades:
    render_class_grades()
