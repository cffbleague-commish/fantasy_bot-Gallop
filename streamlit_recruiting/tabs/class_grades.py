"""
Class Grades tab — leaderboard of team recruiting class grades.
Evaluation mode: KPI row, two-column layout (leaderboard + team preview),
click a row in the leaderboard to see team detail on the right.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_recruiting_grades, load_player_grades, load_franchise_lookup, get_available_years
from models.config import CONFERENCES
from grading import compute_class_grades
from components import (
    render_kpi_row,
    render_grade_badge,
    render_rank_badge,
    render_conference_badge,
    render_commit_composition_bar,
    plotly_layout_defaults,
    _html,
)


def render():
    """Render the Class Grades tab."""
    # --- Inline filters ---
    years = get_available_years()
    if not years:
        st.info("No data found.")
        return

    col_y, col_c = st.columns(2)
    year_options = ["All Years"] + years
    year_selection = col_y.selectbox("Draft Year", year_options, key="grades_year")
    show_all_years = year_selection == "All Years"
    year = None if show_all_years else year_selection
    conference_filter = col_c.selectbox("Conference", ["All"] + sorted(CONFERENCES.keys()), key="grades_conf")

    grades_df = load_recruiting_grades(year)

    if grades_df.empty:
        st.info(f"No recruiting grades available{'' if show_all_years else f' for {year}'}. Generate them in Google Sheets first.")
        return

    # Ensure grades are computed
    grades_df = compute_class_grades(grades_df)

    # Apply conference filter
    if conference_filter != "All":
        grades_df = grades_df[grades_df["Conference"] == conference_filter]

    if grades_df.empty:
        st.info("No teams match the current conference filter.")
        return

    # Sort by ClassScore descending (leaderboard)
    grades_df = grades_df.sort_values("ClassScore", ascending=False).reset_index(drop=True)

    # --- KPI Row ---
    total_five = int(grades_df["FiveStar"].sum()) if "FiveStar" in grades_df.columns else 0
    total_four = int(grades_df["FourStar"].sum()) if "FourStar" in grades_df.columns else 0
    avg_score = grades_df["ClassScore"].mean() if "ClassScore" in grades_df.columns else 0

    render_kpi_row([
        {"label": "Teams Graded", "value": str(len(grades_df))},
        {"label": "Avg Class Score", "value": f"{avg_score:.1f}" if pd.notna(avg_score) else "N/A", "hero": True},
        {"label": "Total 5-Stars", "value": str(total_five)},
        {"label": "Total 4-Stars", "value": str(total_four)},
    ])

    st.markdown("")  # spacer

    # --- Two-column layout: leaderboard + league overview ---
    col_left, col_right = st.columns([65, 35], gap="medium")

    with col_left:
        st.markdown("#### Class Leaderboard")

        # Build display table
        display_rows = []
        for idx, row in grades_df.iterrows():
            five = int(row.get("FiveStar", 0) or 0)
            four = int(row.get("FourStar", 0) or 0)
            three = int(row.get("ThreeStar", 0) or 0)
            two = int(row.get("TwoStar", 0) or 0)

            row_data = {"Rank": idx + 1}
            if show_all_years:
                row_data["Year"] = int(row["DraftYear"]) if pd.notna(row.get("DraftYear")) else ""
            row_data.update({
                "Team": row.get("FranchiseLogo", ""),
                "Grade": row.get("OverallGrade", ""),
                "Score": round(row.get("ClassScore", 0) or 0, 1),
                "5\u2605": five,
                "4\u2605": four,
                "3\u2605": three,
                "2\u2605": two,
            })
            display_rows.append(row_data)

        display_df = pd.DataFrame(display_rows)

        column_config = {}
        if "Team" in display_df.columns:
            column_config["Team"] = st.column_config.ImageColumn("Team", width="small")

        # Row-selectable dataframe
        selection = st.dataframe(
            display_df,
            column_config=column_config,
            hide_index=True,
            use_container_width=True,
            height=min(len(display_df) * 35 + 38, 700),
            on_select="rerun",
            selection_mode="single-row",
            key="grades_leaderboard",
        )

        # Get selected row index
        selected_rows = selection.selection.rows if selection and selection.selection else []

    with col_right:
        _render_league_overview(grades_df, conference_filter)

    # --- Full team detail below leaderboard when a row is selected ---
    if selected_rows:
        row_idx = selected_rows[0]
        if row_idx < len(grades_df):
            team_name = grades_df.iloc[row_idx]["Franchise"]
            dive_year = year
            if show_all_years:
                dive_year = grades_df.iloc[row_idx].get("DraftYear")
            st.markdown("---")
            _show_team_deep_dive(team_name, grades_df, dive_year)

    # --- Conference Comparison Chart (below fold) ---
    if conference_filter == "All" and len(grades_df) > 5:
        st.markdown("---")
        st.markdown("#### Conference Comparison")

        if show_all_years and "DraftYear" in grades_df.columns:
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


def _render_league_overview(grades_df: pd.DataFrame, conference_filter: str):
    """Render the right-panel league overview when no team is selected."""
    st.markdown("#### League Overview")

    # Grade distribution
    if "OverallGrade" in grades_df.columns:
        grade_counts = grades_df["OverallGrade"].value_counts()
        for grade in ["A+", "A", "B+", "B", "C", "D", "F"]:
            count = grade_counts.get(grade, 0)
            if count > 0:
                badge = render_grade_badge(grade, size="sm")
                _html(f'<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">'
                      f'{badge} <span style="color:#9A9A9A;">{count} team{"s" if count != 1 else ""}</span></div>')

    st.markdown("")

    # Top 3 spenders
    if "TotalSpent" in grades_df.columns:
        st.markdown("**Top Spenders**")
        top = grades_df.nlargest(3, "TotalSpent")
        for _, row in top.iterrows():
            spent = row.get("TotalSpent", 0)
            st.caption(f"{row.get('Franchise', '')} — ${spent:.0f}")


def _render_team_preview(team_name: str, grades_df: pd.DataFrame, year: int):
    """Render a team preview panel on the right side."""
    team_row = grades_df[grades_df["Franchise"] == team_name]
    if team_row.empty:
        return

    team = team_row.iloc[0]
    rank = team_row.index[0] + 1

    # Team header
    logo = team.get("FranchiseLogo", "")
    if logo and str(logo).startswith("http"):
        st.image(logo, width=60)

    grade = team.get("OverallGrade", "N/A")
    _html(f'<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">'
          f'<span class="cffb-display-3">{team_name}</span>'
          f'{render_grade_badge(grade, size="lg")}'
          f'</div>')

    conf = team.get("Conference", "")
    if conf:
        _html(f'<div style="margin-bottom:12px;">'
              f'{render_conference_badge(conf)} '
              f'{render_rank_badge(rank, size="sm")} overall'
              f'</div>')

    # Star composition bar
    stars_dict = {
        5: int(team.get("FiveStar", 0) or 0),
        4: int(team.get("FourStar", 0) or 0),
        3: int(team.get("ThreeStar", 0) or 0),
        2: int(team.get("TwoStar", 0) or 0),
    }
    _html(render_commit_composition_bar(stars_dict, show_legend=True))

    st.markdown("")

    # Key metrics
    col1, col2 = st.columns(2)
    col1.metric("Total Spent", f"${team.get('TotalSpent', 0):.0f}" if pd.notna(team.get("TotalSpent")) else "N/A")
    col2.metric("Avg Savings", f"${team.get('AvgSavings', 0):.1f}" if pd.notna(team.get("AvgSavings")) else "N/A")

    col3, col4 = st.columns(2)
    col3.metric("Efficiency", team.get("EfficiencyGrade", "N/A"))
    col4.metric("Score", f"{team.get('ClassScore', 0):.1f}" if pd.notna(team.get("ClassScore")) else "N/A")

    # View full detail button
    if st.button("View Full Team Detail", key=f"team_detail_{team_name}"):
        _show_team_deep_dive(team_name, grades_df, year)


def _show_team_deep_dive(team_name: str, grades_df: pd.DataFrame, year: int):
    """Open the Team Deep Dive modal."""
    from modals.team_deep_dive import show_team_deep_dive
    show_team_deep_dive(team_name, grades_df, year)
