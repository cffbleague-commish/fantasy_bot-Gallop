"""
Class Grades tab — leaderboard of team recruiting class grades.
Renders the CFFB design-system RecruitingClassTable component; team-click
opens the right-column deep dive.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_recruiting_grades, get_available_years
from grading import compute_class_grades
from descriptions import DESCRIPTIONS
from components import (
    render_kpi_row,
    render_grade_badge,
    plotly_layout_defaults,
    _html,
)
from components_html.recruiting_class_table import render_recruiting_class_table
from utils.viewport import responsive_columns


# Conference code mapping: Sheet/Config key → component dropdown code.
_CONF_CODE = {
    "ACC": "acc",
    "B10": "b1g",
    "B12": "big12",
    "P12": "pac",
    "SEC": "sec",
    "AAC": "aac",
}


def render():
    """Render the Class Grades tab."""
    years = get_available_years()
    if not years:
        st.info("No data found.")
        return

    grades_df = load_recruiting_grades(None)
    if grades_df.empty:
        st.info("No recruiting grades available. Generate them in Google Sheets first.")
        return

    grades_df = compute_class_grades(grades_df)
    grades_df = grades_df.sort_values("ClassScore", ascending=False).reset_index(drop=True)

    # --- KPI Row ---
    total_five = int(grades_df["FiveStar"].sum()) if "FiveStar" in grades_df.columns else 0
    total_four = int(grades_df["FourStar"].sum()) if "FourStar" in grades_df.columns else 0
    avg_score = grades_df["ClassScore"].mean() if "ClassScore" in grades_df.columns else 0

    render_kpi_row([
        {"label": "Teams Graded", "value": str(len(grades_df))},
        {"label": "Avg Class Score", "value": f"{avg_score:.2f}" if pd.notna(avg_score) else "N/A", "hero": True},
        {"label": "Total 5-Stars", "value": str(total_five)},
        {"label": "Total 4-Stars", "value": str(total_four)},
    ])

    st.markdown("")

    with st.expander("How are class grades calculated?", expanded=False):
        st.markdown(DESCRIPTIONS["class_score"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["overall_grade"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["efficiency_grade"])

    _render_league_overview(grades_df)

    st.markdown("---")

    # --- Two-column layout: leaderboard + team deep dive ---
    col_left, col_right = responsive_columns([45, 55], gap="medium")

    with col_left:
        component_rows = _build_component_rows(grades_df)
        selected = render_recruiting_class_table(
            component_rows,
            selected_team=st.session_state.get("grades_selected_team"),
            key="grades_class_table",
        )
        # Sync selection into session state and rerun so the right column updates.
        if selected != st.session_state.get("grades_selected_team"):
            st.session_state["grades_selected_team"] = selected
            st.rerun()

    with col_right:
        team_name = st.session_state.get("grades_selected_team")
        if team_name:
            team_rows = grades_df[grades_df["Franchise"] == team_name]
            if not team_rows.empty:
                team_rows = team_rows.sort_values("DraftYear", ascending=False)
                dive_year = team_rows.iloc[0].get("DraftYear")
                year_label = int(dive_year) if pd.notna(dive_year) else ""
                st.markdown(f"#### {year_label} Class Detail" if year_label else "#### Class Detail")
                _show_team_deep_dive(team_name, grades_df, dive_year)
            else:
                st.caption(f"No grade data found for {team_name}.")
        else:
            st.caption("Click a team logo in the leaderboard to view their recruiting detail.")

    # --- Conference Comparison Chart ---
    if len(grades_df) > 5:
        st.markdown("---")
        st.markdown("#### Conference Comparison")

        if "DraftYear" in grades_df.columns and grades_df["DraftYear"].nunique() > 1:
            conf_avg = grades_df.groupby(["Conference", "DraftYear"])["ClassScore"].mean().reset_index()
            conf_avg.columns = ["Conference", "Year", "Avg Score"]
            conf_avg["Year"] = conf_avg["Year"].astype(str)
            conf_avg = conf_avg.sort_values("Avg Score", ascending=False)

            fig = px.bar(
                conf_avg,
                x="Conference",
                y="Avg Score",
                color="Year",
                barmode="group",
            )
        else:
            conf_avg = grades_df.groupby("Conference")["ClassScore"].mean().reset_index()
            conf_avg.columns = ["Conference", "Avg Score"]
            conf_avg = conf_avg.sort_values("Avg Score", ascending=False)

            fig = px.bar(
                conf_avg,
                x="Conference",
                y="Avg Score",
                color_discrete_sequence=["#C9A227"],
            )
        layout = plotly_layout_defaults()
        layout.update(height=350)
        fig.update_layout(**layout)
        st.plotly_chart(fig, use_container_width=True)


_ALL_GRADES = [
    "A+", "A", "A-",
    "B+", "B", "B-",
    "C+", "C", "C-",
    "D+", "D", "D-",
    "F",
]


def _build_component_rows(grades_df: pd.DataFrame) -> list[dict]:
    """Transform the grades DataFrame into row dicts for the iframe component.

    Rank is recomputed client-side based on the currently visible rows, so we
    don't ship a baked rank from here.
    """
    if grades_df.empty:
        return []

    out: list[dict] = []
    for _, row in grades_df.iterrows():
        out.append({
            "team": str(row.get("Franchise", "")),
            "abbr": "",
            "conf": _CONF_CODE.get(str(row.get("Conference", "")).strip(), ""),
            "year": _to_int(row.get("DraftYear")),
            "confRank": _to_int(row.get("ConfRank")),
            "s5": _to_int(row.get("FiveStar")),
            "s4": _to_int(row.get("FourStar")),
            "s3": _to_int(row.get("ThreeStar")),
            "s2": _to_int(row.get("TwoStar")),
            "total": _to_int(row.get("TotalPlayers")),
            "score": _to_float(row.get("ClassScore")),
            "grade": str(row.get("OverallGrade", "")).strip(),
            "logo": str(row.get("FranchiseLogo", "")).strip(),
        })
    return out


def _to_int(v) -> int:
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0
        return int(float(v))
    except (ValueError, TypeError):
        return 0


def _to_float(v) -> float:
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0.0
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _render_league_overview(grades_df: pd.DataFrame):
    """Render league overview — full 13-tier grade distribution."""
    if "OverallGrade" not in grades_df.columns:
        return

    st.markdown("**Grade Distribution**")
    grade_counts = grades_df["OverallGrade"].value_counts()
    badges_html = ""
    for grade in _ALL_GRADES:
        count = int(grade_counts.get(grade, 0))
        badge = render_grade_badge(grade, size="sm")
        opacity = "1" if count > 0 else "0.28"
        count_color = "#F5F5F5" if count > 0 else "#5A5A5A"
        badges_html += (
            f'<span style="display:inline-flex;align-items:center;gap:4px;'
            f'margin-right:14px;opacity:{opacity};">'
            f'{badge} <span style="color:{count_color};font-size:13px;font-variant-numeric:tabular-nums;">{count}</span>'
            f'</span>'
        )
    _html(f'<div style="display:flex;flex-wrap:wrap;gap:6px 0;">{badges_html}</div>')


def _show_team_deep_dive(team_name: str, grades_df: pd.DataFrame, year):
    """Open the Team Deep Dive."""
    from modals.team_deep_dive import show_team_deep_dive
    show_team_deep_dive(team_name, grades_df, year)
