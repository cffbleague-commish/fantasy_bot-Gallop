"""
Recruiting Analytics Dashboard — Main Entrypoint

Read-only Streamlit dashboard for fantasy football recruiting analysis.
Connects to Google Sheets for data, provides three pricing models,
team needs analysis, and interactive draft planning.
"""

import streamlit as st

from data.sheets import get_available_years
from views.components import inject_custom_css
from views.board import render_board_tab
from views.model_comparison import render_comparison_tab
from views.team_needs import render_needs_tab
from views.value_finder import render_value_finder_tab
from views.budget_tool import render_budget_tool_tab
from models.config import POSITIONS, CONFERENCES

# Page config
st.set_page_config(
    page_title="Recruiting Analytics",
    page_icon="\U0001f3c8",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS
inject_custom_css()

# --- Sidebar ---
with st.sidebar:
    st.markdown("## Recruiting Analytics")
    st.caption("Fantasy Football Draft Dashboard")

    # Year selector
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
    st.caption("Data refreshes every 5 minutes.")
    st.caption("Read-only — changes are made in Google Sheets.")

# --- Main content ---
st.markdown(f"# {selected_year} Recruiting Dashboard")

tab_board, tab_models, tab_needs, tab_values, tab_budget = st.tabs([
    "\U0001f4cb Board",
    "\U0001f4ca Models",
    "\U0001f3af Team Needs",
    "\U0001f4b0 Value Finder",
    "\U0001f4b5 Budget Tool",
])

with tab_board:
    render_board_tab(selected_year, selected_position, selected_conference)

with tab_models:
    render_comparison_tab(selected_year, selected_position)

with tab_needs:
    render_needs_tab(selected_year, selected_position, selected_conference)

with tab_values:
    render_value_finder_tab(selected_year, selected_position)

with tab_budget:
    render_budget_tool_tab(selected_year, selected_position)
