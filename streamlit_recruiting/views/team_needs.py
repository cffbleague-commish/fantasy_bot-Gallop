"""
Team Needs tab — MFL roster integration with positional need analysis.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_franchise_lookup, load_recruiting_board
from data.mfl_api import get_roster_composition
from models.config import POSITIONS, COLORS


# Default target roster composition (adjustable in UI)
DEFAULT_TARGETS = {"QB": 3, "RB": 6, "WR": 8, "TE": 3}


def _calc_need_level(current: int, target: int) -> str:
    """Classify positional need as high/moderate/low."""
    if target <= 0:
        return "low"
    deficit_pct = (target - current) / target
    if deficit_pct > 0.50:
        return "high"
    if deficit_pct > 0.25:
        return "moderate"
    return "low"


def render_needs_tab(year: int, position_filter: str, conference_filter: str):
    """Render the Team Needs tab."""
    st.markdown("#### Roster Targets")
    st.caption("Adjust target roster composition to calibrate need scores.")

    target_cols = st.columns(4)
    targets = {}
    for i, pos in enumerate(POSITIONS):
        targets[pos] = target_cols[i].number_input(
            pos, min_value=0, max_value=20,
            value=DEFAULT_TARGETS[pos], key=f"target_{pos}",
        )

    # Fetch roster data
    roster_comp = get_roster_composition(year)
    franchises = load_franchise_lookup()

    if roster_comp.empty:
        st.warning("Could not fetch roster data from MFL. Check API key and league ID in secrets.")
        return

    if franchises.empty:
        st.warning("No franchise lookup data available.")
        return

    # Merge with franchise info
    merged = roster_comp.merge(
        franchises[["FranchiseID", "TeamName", "Conference", "Logo"]],
        on="FranchiseID", how="left",
    )

    # Apply conference filter
    if conference_filter != "All":
        merged = merged[merged["Conference"] == conference_filter]

    # Calculate need scores
    for pos in POSITIONS:
        merged[f"{pos}_need"] = merged[pos].apply(
            lambda x: _calc_need_level(int(x), targets[pos])
        )
        merged[f"{pos}_deficit"] = targets[pos] - merged[pos]

    # Sort by total deficit (most needy teams first)
    merged["total_deficit"] = sum(
        merged[f"{pos}_deficit"].clip(lower=0) for pos in POSITIONS
    )
    merged = merged.sort_values("total_deficit", ascending=False)

    st.markdown("---")

    # --- Team selector ---
    team_names = merged["TeamName"].tolist()
    selected_team = st.selectbox(
        "Select a team for detailed view",
        options=["All Teams"] + team_names,
        key="needs_team_selector",
    )

    if selected_team != "All Teams":
        _render_team_detail(selected_team, merged, targets, year, position_filter)
    else:
        _render_needs_overview(merged, targets)


def _render_needs_overview(merged: pd.DataFrame, targets: dict):
    """Render the overview heatmap of all teams."""
    st.markdown("#### Positional Needs Overview")
    st.caption("Red = acute need, Yellow = moderate, Green = sufficient")

    # Build display table
    display_rows = []
    for _, row in merged.iterrows():
        entry = {
            "Logo": row.get("Logo", ""),
            "Team": row.get("TeamName", ""),
            "Conf": row.get("Conference", ""),
        }
        for pos in POSITIONS:
            current = int(row.get(pos, 0))
            target = targets[pos]
            need = row.get(f"{pos}_need", "low")
            if need == "high":
                entry[pos] = f"{current}/{target}"
            elif need == "moderate":
                entry[pos] = f"{current}/{target}"
            else:
                entry[pos] = f"{current}/{target}"
        entry["Total Deficit"] = int(row.get("total_deficit", 0))
        display_rows.append(entry)

    display_df = pd.DataFrame(display_rows)

    column_config = {}
    if "Logo" in display_df.columns:
        column_config["Logo"] = st.column_config.ImageColumn("Logo", width="small")

    st.dataframe(
        display_df, column_config=column_config,
        hide_index=True, use_container_width=True,
        height=min(len(display_df) * 35 + 38, 800),
    )


def _render_team_detail(
    team_name: str, merged: pd.DataFrame, targets: dict,
    year: int, position_filter: str,
):
    """Render detailed view for a selected team."""
    team_row = merged[merged["TeamName"] == team_name]
    if team_row.empty:
        st.warning(f"No data for {team_name}")
        return

    team = team_row.iloc[0]

    # Team header
    col1, col2 = st.columns([1, 4])
    with col1:
        logo = team.get("Logo", "")
        if logo:
            st.image(logo, width=80)
    with col2:
        st.markdown(f"### {team_name}")
        st.caption(f"{team.get('Conference', '')} Conference")

    # Position breakdown
    st.markdown("#### Roster Composition")
    need_cols = st.columns(4)
    for i, pos in enumerate(POSITIONS):
        current = int(team.get(pos, 0))
        target = targets[pos]
        need = team.get(f"{pos}_need", "low")
        color = COLORS["needs"].get(need, "#999")

        with need_cols[i]:
            st.metric(pos, f"{current} / {target}")
            need_label = {"high": "NEED", "moderate": "WATCH", "low": "OK"}.get(need, "")
            st.markdown(f'<span style="color:{color}; font-weight:700;">{need_label}</span>',
                        unsafe_allow_html=True)

    # Recommended targets from board
    st.markdown("---")
    st.markdown("#### Recommended Targets")

    board_df = load_recruiting_board(year)
    if board_df.empty:
        st.info("No board data to recommend from.")
        return

    # Filter to positions this team needs
    need_positions = [
        pos for pos in POSITIONS
        if team.get(f"{pos}_need") in ("high", "moderate")
    ]

    if position_filter != "All":
        need_positions = [p for p in need_positions if p == position_filter]

    if not need_positions:
        st.info(f"{team_name} has no acute positional needs.")
        return

    recs = board_df[board_df["Position"].isin(need_positions)].head(15)

    display_cols = ["HeadshotURL", "Player", "Position", "College",
                    "Rating", "RecruitScore", "PredictedCost", "Copy1_16"]
    available = [c for c in display_cols if c in recs.columns]
    display = recs[available].copy()

    # Format
    for col in ["PredictedCost", "Copy1_16"]:
        if col in display.columns:
            display[col] = display[col].apply(lambda x: f"${x:.0f}" if pd.notna(x) else "")

    column_config = {}
    if "HeadshotURL" in display.columns:
        column_config["HeadshotURL"] = st.column_config.ImageColumn("Photo", width="small")

    st.dataframe(display, column_config=column_config, hide_index=True, use_container_width=True)
