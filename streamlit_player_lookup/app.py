"""
CFFB Player Lookup — Main Entrypoint

Standalone Streamlit app for searching players and viewing
all 12 copies with ownership, redshirt, awards, and transaction history.
Uses the CFFB Design System for visual consistency with the recruiting dashboard.
"""

import streamlit as st

from styles import inject_global_css
from config import get_league_year
from views.search_results import render as render_search

# Page config
st.set_page_config(
    page_title="CFFB Player Lookup",
    page_icon="\U0001f50d",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Global design system CSS
inject_global_css()

# --- Sidebar ---
with st.sidebar:
    st.markdown("## CFFB Player Lookup")
    st.caption("League Player Copy Database")
    st.markdown("---")
    league_year = get_league_year()
    st.caption(f"League Year: {league_year}")
    st.caption("Data refreshes every 5 minutes.")

# --- App caption (panel header lives inside the view) ---
st.caption("Player information is manually updated at select times of the year. Direct any questions to the commissioner.")

# --- Main view ---
render_search()
