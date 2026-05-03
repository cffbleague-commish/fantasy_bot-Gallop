"""
Team Recruiting tab — leaderboard-style display of team recruiting class grades.
Reads from RecruitingGrades and PlayerGrades sheets.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_recruiting_grades, load_player_grades, load_franchise_lookup
from models.config import COLORS


def render_team_recruiting_tab(year: int, conference_filter: str):
    """Render the Team Recruiting tab."""
    grades_df = load_recruiting_grades(year)

    if grades_df.empty:
        st.info(f"No recruiting grades available for {year}. Generate them in Google Sheets first.")
        return

    # Apply conference filter
    if conference_filter != "All":
        grades_df = grades_df[grades_df["Conference"] == conference_filter]

    if grades_df.empty:
        st.info("No teams match the current conference filter.")
        return

    # Sort by ClassScore descending (leaderboard)
    grades_df = grades_df.sort_values("ClassScore", ascending=False).reset_index(drop=True)

    st.markdown(f"### {year} Recruiting Class Leaderboard")

    # Summary metrics
    metric_cols = st.columns(4)
    metric_cols[0].metric("Teams Graded", len(grades_df))
    metric_cols[1].metric("Avg Class Score", f"{grades_df['ClassScore'].mean():.1f}")

    total_five = int(grades_df["FiveStar"].sum()) if "FiveStar" in grades_df.columns else 0
    total_four = int(grades_df["FourStar"].sum()) if "FourStar" in grades_df.columns else 0
    metric_cols[2].metric("Total 5-Stars", total_five)
    metric_cols[3].metric("Total 4-Stars", total_four)

    st.markdown("---")

    # Leaderboard table
    display_rows = []
    for idx, row in grades_df.iterrows():
        display_rows.append({
            "Rank": idx + 1,
            "Logo": row.get("FranchiseLogo", ""),
            "Team": row.get("Franchise", ""),
            "Conf": row.get("Conference", ""),
            "Grade": row.get("OverallGrade", ""),
            "Score": round(row.get("ClassScore", 0) or 0, 1),
            "5\u2605": int(row.get("FiveStar", 0) or 0),
            "4\u2605": int(row.get("FourStar", 0) or 0),
            "3\u2605": int(row.get("ThreeStar", 0) or 0),
            "2\u2605": int(row.get("TwoStar", 0) or 0),
            "1\u2605": int(row.get("OneStar", 0) or 0),
            "Players": int(row.get("TotalPlayers", 0) or 0),
            "Spent": f"${row.get('TotalSpent', 0):.0f}" if pd.notna(row.get("TotalSpent")) else "",
            "Efficiency": row.get("EfficiencyGrade", "N/A"),
            "Avg Savings": f"${row.get('AvgSavings', 0):.1f}" if pd.notna(row.get("AvgSavings")) else "N/A",
        })

    display_df = pd.DataFrame(display_rows)

    column_config = {}
    if "Logo" in display_df.columns:
        column_config["Logo"] = st.column_config.ImageColumn("Logo", width="small")

    st.dataframe(
        display_df,
        column_config=column_config,
        hide_index=True,
        use_container_width=True,
        height=min(len(display_df) * 35 + 38, 800),
    )

    # Conference breakdown chart
    if conference_filter == "All" and len(grades_df) > 5:
        st.markdown("---")
        st.markdown("#### Conference Comparison")

        conf_avg = grades_df.groupby("Conference")["ClassScore"].mean().reset_index()
        conf_avg.columns = ["Conference", "Avg Score"]
        conf_avg = conf_avg.sort_values("Avg Score", ascending=False)

        fig = px.bar(
            conf_avg, x="Conference", y="Avg Score",
            color_discrete_sequence=[COLORS["accent"]],
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["surface"],
            height=350,
            margin=dict(l=0, r=0, t=10, b=0),
        )
        st.plotly_chart(fig, use_container_width=True)

    # Team detail selector
    st.markdown("---")
    st.markdown("#### Team Details")

    team_select = st.selectbox(
        "Select a team",
        ["-- Select a team --"] + grades_df["Franchise"].tolist(),
        key="recruiting_team_select",
    )

    if team_select != "-- Select a team --":
        _render_team_detail(team_select, grades_df, year)


def _render_team_detail(team_name: str, grades_df: pd.DataFrame, year: int):
    """Render detailed view for a selected team's recruiting class."""
    team_row = grades_df[grades_df["Franchise"] == team_name]
    if team_row.empty:
        return

    team = team_row.iloc[0]

    # Team header with logo
    col_logo, col_info = st.columns([1, 4])
    with col_logo:
        logo = team.get("FranchiseLogo", "")
        if logo and str(logo).startswith("http"):
            st.image(logo, width=80)
    with col_info:
        grade = team.get("OverallGrade", "N/A")
        grade_letter = grade[0] if grade else ""
        grade_color = COLORS["grades"].get(grade_letter, "#999")
        st.markdown(
            f"### {team_name} "
            f'<span style="color:{grade_color};font-size:0.8em;">({grade})</span>',
            unsafe_allow_html=True,
        )
        st.caption(
            f"{team.get('Conference', '')} | "
            f"Rank #{int(team.get('ClassRank', 0) or 0)} Overall | "
            f"#{int(team.get('ConfRank', 0) or 0)} in Conference"
        )

    # Star breakdown
    star_cols = st.columns(5)
    for i, (star_val, col_name) in enumerate([
        (5, "FiveStar"), (4, "FourStar"), (3, "ThreeStar"),
        (2, "TwoStar"), (1, "OneStar"),
    ]):
        count = int(team.get(col_name, 0) or 0)
        star_cols[i].metric(f"{star_val}-Star", count)

    # Spending stats
    spend_cols = st.columns(3)
    spend_cols[0].metric(
        "Total Spent",
        f"${team.get('TotalSpent', 0):.0f}" if pd.notna(team.get("TotalSpent")) else "N/A",
    )
    spend_cols[1].metric(
        "Avg Savings",
        f"${team.get('AvgSavings', 0):.1f}" if pd.notna(team.get("AvgSavings")) else "N/A",
    )
    spend_cols[2].metric("Efficiency Grade", team.get("EfficiencyGrade", "N/A"))

    # Individual player grades
    player_grades = load_player_grades(year)
    if not player_grades.empty:
        team_players = player_grades[player_grades["Franchise"] == team_name].copy()
        if not team_players.empty:
            team_players = team_players.sort_values("RecruitScore", ascending=False)

            st.markdown("##### Player Acquisitions")
            display_cols = ["Player", "Position", "Stars", "RecruitScore",
                            "BidAmount", "PredictedCost", "Savings", "PlayerGrade"]
            available = [c for c in display_cols if c in team_players.columns]
            display = team_players[available].copy()

            for col in ["BidAmount", "PredictedCost"]:
                if col in display.columns:
                    display[col] = display[col].apply(
                        lambda x: f"${x:.0f}" if pd.notna(x) else ""
                    )
            if "Savings" in display.columns:
                display["Savings"] = display["Savings"].apply(
                    lambda x: f"${x:+.1f}" if pd.notna(x) else ""
                )

            st.dataframe(display, hide_index=True, use_container_width=True)
