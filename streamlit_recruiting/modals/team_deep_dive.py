"""
Team Deep Dive modal — detailed view of a team's recruiting class.

Shows:
- Team header with logo, grade, rank
- KPI row (Total Spent, Score, Efficiency, Rank, Best Value, Biggest Overpay)
- Star composition bar
- Single player acquisition table with position badges
- Value analysis scatter chart
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_player_grades, load_recruiting_board, load_franchise_lookup
from components import (
    render_kpi_row,
    render_grade_badge,
    render_rank_badge,
    render_conference_badge,
    render_commit_composition_bar,
    render_star_rating,
    render_value_delta,
    plotly_layout_defaults,
    _html,
    college_logo_url,
    grade_badge_url,
    position_badge_url,
)


def show_team_deep_dive(
    team_name: str,
    grades_df: pd.DataFrame,
    year: int,
):
    """Display the Team Deep Dive in the current Streamlit container.

    Called inline — wrap in st.dialog at the call site if desired.
    """
    team_row = grades_df[grades_df["Franchise"] == team_name]
    if team_row.empty:
        st.warning(f"No grade data found for {team_name}.")
        return

    team = team_row.iloc[0]
    rank = team_row.index[0] + 1

    # --- Header ---
    logo = team.get("FranchiseLogo", "")
    if logo and str(logo).startswith("http"):
        st.image(logo, width=140)

    grade = team.get("OverallGrade", "N/A")
    conf = team.get("Conference", "")

    _html(
        f'<div style="display:flex;align-items:center;gap:16px;margin:8px 0;">'
        f'<span class="cffb-display-2">{team_name}</span>'
        f'{render_grade_badge(grade, size="lg")}'
        f'{render_conference_badge(conf)}'
        f'{render_rank_badge(rank, size="md")}'
        f'</div>'
    )

    st.markdown("")

    # --- Load player data early so we can compute best/worst for KPIs ---
    player_grades = load_player_grades(year)
    best_value_amt = "N/A"
    best_value_name = ""
    worst_value_amt = "N/A"
    worst_value_name = ""

    if not player_grades.empty:
        # Join headshot URLs and college names from the recruiting board
        board_df = load_recruiting_board(year)
        if not board_df.empty:
            if "HeadshotURL" in board_df.columns:
                headshot_map = board_df.set_index("Player")["HeadshotURL"].to_dict()
                player_grades["HeadshotURL"] = player_grades["Player"].map(headshot_map).fillna("")
            if "College" in board_df.columns and "College" not in player_grades.columns:
                college_map = board_df.set_index("Player")["College"].to_dict()
                player_grades["College"] = player_grades["Player"].map(college_map).fillna("")
        if "College" in player_grades.columns:
            player_grades["CollegeLogo"] = player_grades["College"].apply(college_logo_url)

        team_players = player_grades[player_grades["Franchise"] == team_name].copy()

        if not team_players.empty and "Savings" in team_players.columns:
            savings_valid = team_players.dropna(subset=["Savings"])
            if not savings_valid.empty:
                best = savings_valid.nlargest(1, "Savings").iloc[0]
                worst = savings_valid.nsmallest(1, "Savings").iloc[0]
                best_value_amt = f"${best['Savings']:+.1f}"
                best_value_name = best["Player"]
                worst_value_amt = f"${worst['Savings']:+.1f}"
                worst_value_name = worst["Player"]
    else:
        team_players = pd.DataFrame()

    # --- KPI Row ---
    render_kpi_row([
        {"label": "Total Spent", "value": f"${team.get('TotalSpent', 0):.0f}" if pd.notna(team.get("TotalSpent")) else "N/A"},
        {"label": "Class Score", "value": f"{team.get('ClassScore', 0):.1f}" if pd.notna(team.get("ClassScore")) else "N/A", "hero": True},
        {"label": "Efficiency", "value": str(team.get("EfficiencyGrade", "N/A"))},
        {"label": "Class Rank", "value": f"#{rank}"},
        {"label": "Best Value", "value": best_value_amt, "sub": best_value_name, "sub_type": "pos"},
        {"label": "Biggest Overpay", "value": worst_value_amt, "sub": worst_value_name, "sub_type": "neg"},
    ])

    st.markdown("")

    # Star composition bar
    stars_dict = {
        5: int(team.get("FiveStar", 0) or 0),
        4: int(team.get("FourStar", 0) or 0),
        3: int(team.get("ThreeStar", 0) or 0),
        2: int(team.get("TwoStar", 0) or 0),
    }
    _html(render_commit_composition_bar(stars_dict, show_legend=True))

    st.markdown("---")

    if team_players.empty:
        st.info(f"No player acquisitions found for {team_name}.")
        return

    team_players = team_players.sort_values("RecruitScore", ascending=False)

    # --- Single player acquisition table + scatter ---
    col_left, col_right = st.columns([55, 45], gap="medium")

    with col_left:
        st.markdown("#### Player Acquisitions")

        # Add position badge column
        if "Position" in team_players.columns:
            team_players["PosBadge"] = team_players["Position"].apply(position_badge_url)

        display_cols = ["HeadshotURL", "Player", "PosBadge", "CollegeLogo", "Stars", "RecruitScore", "BidAmount", "PredictedCost", "Savings", "PlayerGrade"]
        available = [c for c in display_cols if c in team_players.columns]
        display = team_players[available].copy()

        # Format columns
        if "HeadshotURL" in display.columns:
            display.rename(columns={"HeadshotURL": "Photo"}, inplace=True)
        if "PosBadge" in display.columns:
            display.rename(columns={"PosBadge": "Pos"}, inplace=True)
        if "CollegeLogo" in display.columns:
            display.rename(columns={"CollegeLogo": "School"}, inplace=True)
        if "RecruitScore" in display.columns:
            display.rename(columns={"RecruitScore": "Score"}, inplace=True)
        if "BidAmount" in display.columns:
            display["BidAmount"] = display["BidAmount"].apply(
                lambda x: f"${x:.0f}" if pd.notna(x) else ""
            )
            display.rename(columns={"BidAmount": "Paid"}, inplace=True)
        if "PredictedCost" in display.columns:
            display["PredictedCost"] = display["PredictedCost"].apply(
                lambda x: f"${x:.0f}" if pd.notna(x) else ""
            )
            display.rename(columns={"PredictedCost": "Predicted"}, inplace=True)
        if "Savings" in display.columns:
            display["Savings"] = display["Savings"].apply(
                lambda x: f"${x:+.1f}" if pd.notna(x) else ""
            )
        if "PlayerGrade" in display.columns:
            display["PlayerGrade"] = display["PlayerGrade"].apply(
                lambda x: grade_badge_url(x) if pd.notna(x) else ""
            )
            display.rename(columns={"PlayerGrade": "Grade"}, inplace=True)
        if "Stars" in display.columns:
            display["Stars"] = display["Stars"].apply(
                lambda x: f"{'★' * int(x)}{'☆' * (5 - int(x))}" if pd.notna(x) else ""
            )

        col_config = {}
        if "Photo" in display.columns:
            col_config["Photo"] = st.column_config.ImageColumn("", width="small")
        if "Pos" in display.columns:
            col_config["Pos"] = st.column_config.ImageColumn("Pos", width="small")
        if "School" in display.columns:
            col_config["School"] = st.column_config.ImageColumn("", width="small")
        if "Grade" in display.columns:
            col_config["Grade"] = st.column_config.ImageColumn("Grade", width="small")

        st.dataframe(display, column_config=col_config, hide_index=True, use_container_width=True)

    with col_right:
        st.markdown("#### Value Analysis")

        # Scatter: recruit score vs price paid
        if "RecruitScore" in team_players.columns and "BidAmount" in team_players.columns:
            scatter_df = team_players.dropna(subset=["RecruitScore", "BidAmount"])
            if not scatter_df.empty:
                fig = px.scatter(
                    scatter_df,
                    x="RecruitScore",
                    y="BidAmount",
                    color="Position",
                    hover_name="Player",
                    color_discrete_map={"QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#6A6A6A"},
                )
                layout = plotly_layout_defaults()
                layout.update(
                    height=350,
                    xaxis_title="Recruit Score",
                    yaxis_title="Price Paid ($)",
                    title="Score vs Price",
                )
                fig.update_layout(**layout)
                st.plotly_chart(fig, use_container_width=True)
