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

from data.sheets import (
    load_player_grades,
    load_recruiting_board,
    load_franchise_lookup,
    load_recruiting_writeups,
)
from utils.parsing import normalize_name
from descriptions import DESCRIPTIONS
from components import (
    render_kpi_row,
    render_grade_badge,
    render_rank_badge,
    render_conference_badge,
    render_commit_composition_bar,
    render_player_card_compact,
    render_recruiting_take,
    plotly_layout_defaults,
    _html,
    college_logo_url,
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
        # Join headshot URLs and college names from the recruiting board.
        # PlayerGrades names are MFL format ("Last, First"); RecruitingBoard
        # names are ESPN format ("First Last") — `normalize_name` collapses both
        # to a common key so the lookup actually hits.
        board_df = load_recruiting_board(None)
        if not board_df.empty:
            brd = board_df.copy()
            brd["_key"] = brd["Player"].apply(normalize_name)
            brd = brd[brd["_key"] != ""].drop_duplicates(subset="_key", keep="last")
            pg_key = player_grades["Player"].apply(normalize_name)
            if "HeadshotURL" in brd.columns:
                headshot_map = dict(zip(brd["_key"], brd["HeadshotURL"]))
                player_grades["HeadshotURL"] = pg_key.map(headshot_map).fillna("")
                player_grades.loc[~player_grades["HeadshotURL"].str.startswith("http", na=False), "HeadshotURL"] = ""
            if "College" in brd.columns and "College" not in player_grades.columns:
                college_map = dict(zip(brd["_key"], brd["College"]))
                player_grades["College"] = pg_key.map(college_map).fillna("")
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
        {"label": "Class Score", "value": f"{team.get('ClassScore', 0):.2f}" if pd.notna(team.get("ClassScore")) else "N/A", "hero": True},
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

    # --- Dual-analyst writeups ---
    writeups = load_recruiting_writeups(year)
    if not writeups.empty:
        team_writeup = writeups[writeups["Franchise"] == team_name]
        if not team_writeup.empty:
            row = team_writeup.iloc[0]
            total_players = int(team.get("TotalPlayers", 0) or 0)
            sub_line = f"{total_players} commits · Class Rank #{rank}"
            subject = f"{team_name} · {year} Class"

            corso_quote = str(row.get("CorsoAnalysis", "") or "").strip()
            herb_quote = str(row.get("HerbstreitAnalysis", "") or "").strip()

            if corso_quote:
                _html(render_recruiting_take(
                    variant="headgear",
                    persona="The Headgear Pick",
                    subject=subject,
                    sub=sub_line,
                    grade=str(row.get("CorsoGrade", "") or ""),
                    quote=corso_quote,
                    byline_label="Corso",
                ))
            if herb_quote:
                _html(render_recruiting_take(
                    variant="analyst",
                    persona="The Analyst",
                    subject=subject,
                    sub=sub_line,
                    grade=str(row.get("HerbstreitGrade", "") or ""),
                    quote=herb_quote,
                    byline_label="Herbstreit",
                ))

    with st.expander("How are value and efficiency measured?", expanded=False):
        st.markdown(DESCRIPTIONS["savings"])
        st.markdown("---")
        st.markdown(DESCRIPTIONS["efficiency_grade"])

    st.markdown("---")

    if team_players.empty:
        st.info(f"No player acquisitions found for {team_name}.")
        return

    team_players = team_players.sort_values("RecruitScore", ascending=False)

    # --- Player Acquisitions ---
    st.markdown("#### Player Acquisitions")

    def _maybe(value):
        return value if pd.notna(value) else None

    for _, p in team_players.iterrows():
        stars_val = p.get("Stars")
        try:
            stars_int = int(stars_val) if pd.notna(stars_val) else 0
        except (TypeError, ValueError):
            stars_int = 0
        _html(render_player_card_compact(
            name=str(p.get("Player", "") or ""),
            position=str(p.get("Position", "") or ""),
            college=str(p.get("College", "") or ""),
            stars=stars_int,
            predicted_cost=_maybe(p.get("PredictedCost")),
            paid=_maybe(p.get("BidAmount")),
            savings=_maybe(p.get("BlendedSavings")),
            savings_vs_predicted=_maybe(p.get("SavingsVsPredicted")),
            savings_vs_league_avg=_maybe(p.get("SavingsVsLeagueAvg")),
            grade=str(p.get("PlayerGrade", "") or ""),
            headshot_url=str(p.get("HeadshotURL", "") or ""),
        ))

    # --- Value Analysis (below acquisitions) ---
    if "RecruitScore" in team_players.columns and "BidAmount" in team_players.columns:
        scatter_df = team_players.dropna(subset=["RecruitScore", "BidAmount"])
        if not scatter_df.empty:
            st.markdown("#### Value Analysis")
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
