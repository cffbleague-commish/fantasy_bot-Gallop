"""
Class Grades tab — leaderboard of team recruiting class grades.
Renders the CFFB design-system RecruitingClassTable component; team-click
opens the right-column deep dive built from the TeamClassDetail component.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import (
    load_recruiting_grades,
    load_player_grades,
    load_recruiting_board,
    load_recruiting_writeups,
    get_available_years,
)
from grading import compute_class_grades
from descriptions import DESCRIPTIONS
from components import (
    render_kpi_row,
    render_grade_badge,
    plotly_layout_defaults,
    _html,
)
from components_html.recruiting_class_table import render_recruiting_class_table
from components_html.team_class_detail import render_team_class_detail
from utils.parsing import normalize_name
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
            # Reset the detail year when team changes — we pick the team's most
            # recent year on the next render.
            st.session_state.pop("grades_detail_year", None)
            st.rerun()

    with col_right:
        team_name = st.session_state.get("grades_selected_team")
        if team_name:
            _render_team_detail(team_name, grades_df)
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
    """Transform the grades DataFrame into row dicts for the iframe component."""
    if grades_df.empty:
        return []

    df = grades_df.sort_values("ClassScore", ascending=False).reset_index(drop=True)

    out: list[dict] = []
    for idx, row in df.iterrows():
        out.append({
            "rank": int(idx) + 1,
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


# ---------------------------------------------------------------------------
# Team detail (right column)
# ---------------------------------------------------------------------------

def _render_team_detail(team_name: str, grades_df: pd.DataFrame):
    """Render the right-column class detail via the CFFB TeamClassDetail component."""
    team_rows = grades_df[grades_df["Franchise"] == team_name]
    if team_rows.empty:
        st.caption(f"No grade data found for {team_name}.")
        return

    # Years for this team (newest first), used to populate the year selector.
    available_years = sorted(
        {int(y) for y in team_rows["DraftYear"].dropna() if pd.notna(y)},
        reverse=True,
    )
    if not available_years:
        st.caption(f"No draft years recorded for {team_name}.")
        return

    # Resolved year: explicit session pick, else the team's most recent year.
    desired_year = st.session_state.get("grades_detail_year")
    year = int(desired_year) if desired_year in available_years else available_years[0]

    payload = _build_team_detail_payload(team_name, year, grades_df, available_years)

    # Stable key + timestamp-dedup so reruns don't reprocess a stale click.
    # The component stamps each interaction with `ts` (epoch ms); we compare
    # against the last one we acted on so each click only fires once.
    result = render_team_class_detail(payload, key="team_detail_panel")
    if isinstance(result, dict):
        ts = result.get("ts")
        last_ts = st.session_state.get("grades_detail_last_ts")
        if ts and ts != last_ts:
            st.session_state["grades_detail_last_ts"] = ts
            action = result.get("action")
            if action == "year":
                new_year = int(result.get("value") or year)
                if new_year in available_years and new_year != year:
                    st.session_state["grades_detail_year"] = new_year
                    st.rerun()
            elif action == "back":
                st.session_state.pop("grades_selected_team", None)
                st.session_state.pop("grades_detail_year", None)
                st.session_state.pop("grades_detail_last_ts", None)
                st.rerun()

    # Analyst takes — kept below the detail card so the narrative stays available.
    _render_analyst_takes(team_name, year, payload.get("rank", 0), payload.get("totalCommits", 0))


def _render_analyst_takes(team_name: str, year: int, rank: int, total_commits: int):
    """Render the dual-analyst writeups under the detail card."""
    _CORSO_PHOTO_URL = "https://www.elevenwarriors.com/sites/default/files/styles/904x490/public/c/2023/09/141056_h.jpg?itok=y0da6yGF"
    _HERBSTREIT_PHOTO_URL = "https://a57.foxnews.com/static.foxnews.com/foxnews.com/content/uploads/2024/12/1200/675/kirk-herbstreit.jpg?ve=1&tl=1"
    from components import render_recruiting_take

    writeups = load_recruiting_writeups(year)
    if writeups.empty:
        return
    team_writeup = writeups[writeups["Franchise"] == team_name]
    if team_writeup.empty:
        return
    row = team_writeup.iloc[0]
    corso_quote = str(row.get("CorsoAnalysis", "") or "").strip()
    herb_quote = str(row.get("HerbstreitAnalysis", "") or "").strip()
    if not (corso_quote or herb_quote):
        return

    st.markdown("#### Analyst Takes")
    sub_line = f"{total_commits} commits · Class Rank #{rank}"
    subject = f"{team_name} · {year} Class"

    if corso_quote:
        _html(render_recruiting_take(
            variant="headgear",
            persona="The Headgear Pick",
            subject=subject,
            sub=sub_line,
            grade=str(row.get("CorsoGrade", "") or ""),
            quote=corso_quote,
            byline_label="Corso",
            image_url=_CORSO_PHOTO_URL,
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
            image_url=_HERBSTREIT_PHOTO_URL,
        ))


def _build_team_detail_payload(
    team_name: str,
    year: int,
    grades_df: pd.DataFrame,
    available_years: list[int],
) -> dict:
    """Assemble the dict the TeamClassDetail iframe expects.

    Pulls team-level KPIs from `grades_df` (already ranked) and the per-recruit
    rows from `load_player_grades(year)`, joining headshots + college from the
    recruiting board. Position deltas are computed against league-wide position
    averages within the same draft year.
    """
    # Re-rank against the chosen year so "#1 of N · league" describes the
    # year-specific class rank rather than the overall (multi-year) rank.
    year_df = grades_df[grades_df["DraftYear"] == year].copy()
    year_df = year_df.sort_values("ClassScore", ascending=False).reset_index(drop=True)
    year_team = year_df[year_df["Franchise"] == team_name]
    if year_team.empty:
        # Fall back to the team's row from the unfiltered df (shouldn't happen).
        year_team = grades_df[grades_df["Franchise"] == team_name]
        rank = int(grades_df.index[grades_df["Franchise"] == team_name][0]) + 1 if not year_team.empty else 0
    else:
        rank = int(year_team.index[0]) + 1
    team = year_team.iloc[0] if not year_team.empty else None

    # Class score gap vs #2 (or vs #1 if this team isn't #1).
    score = float(team.get("ClassScore", 0) or 0) if team is not None else 0.0
    score_sub = None
    score_sub_type = None
    if len(year_df) >= 2:
        if rank == 1:
            gap = score - float(year_df.iloc[1].get("ClassScore", 0) or 0)
            score_sub = f"+{gap:.1f} vs #2"
            score_sub_type = "pos"
        else:
            gap = score - float(year_df.iloc[0].get("ClassScore", 0) or 0)
            score_sub = f"{gap:+.1f} vs #1"
            score_sub_type = "neg" if gap < 0 else "pos"

    total_spent = float(team.get("TotalSpent", 0) or 0) if team is not None else 0.0
    avg_savings = float(team.get("AvgSavings", 0) or 0) if team is not None else 0.0
    total_commits = int(team.get("TotalPlayers", 0) or 0) if team is not None else 0
    total_savings = avg_savings * total_commits if total_commits else 0.0
    spend_sub = None
    spend_sub_type = None
    if total_commits:
        sign = "+" if total_savings >= 0 else "−"
        spend_sub = f"{sign}${abs(total_savings):.0f} value"
        spend_sub_type = "pos" if total_savings >= 0 else "neg"

    eff_grade = str(team.get("EfficiencyGrade", "")).strip() if team is not None else ""
    eff_sub = None
    if total_spent > 0:
        eff_sub = f"{score / total_spent:.2f} pts / $"

    overall_grade = str(team.get("OverallGrade", "")).strip() if team is not None else ""

    # --- Recruits + composition counts ---
    player_grades = load_player_grades(year)
    recruits_payload: list[dict] = []
    star_counts = {5: 0, 4: 0, 3: 0, 2: 0}
    pos_counts = {"QB": 0, "RB": 0, "WR": 0, "TE": 0}

    if not player_grades.empty:
        # Position avg bid (league-wide for this year, all teams).
        pos_avg_bid: dict[str, float] = {}
        if "BidAmount" in player_grades.columns and "Position" in player_grades.columns:
            grp = player_grades.dropna(subset=["BidAmount"]).groupby("Position")["BidAmount"].mean()
            pos_avg_bid = {str(k).upper(): float(v) for k, v in grp.items()}

        # Join headshots + college from the recruiting board (name normalization
        # bridges MFL "Last, First" → ESPN "First Last").
        board_df = load_recruiting_board(None)
        headshot_map: dict[str, str] = {}
        college_map: dict[str, str] = {}
        if not board_df.empty:
            brd = board_df.copy()
            brd["_key"] = brd["Player"].apply(normalize_name)
            brd = brd[brd["_key"] != ""].drop_duplicates(subset="_key", keep="last")
            if "HeadshotURL" in brd.columns:
                headshot_map = dict(zip(brd["_key"], brd["HeadshotURL"]))
            if "College" in brd.columns:
                college_map = dict(zip(brd["_key"], brd["College"]))

        team_players = player_grades[player_grades["Franchise"] == team_name].copy()
        if not team_players.empty:
            team_players["_key"] = team_players["Player"].apply(normalize_name)
            team_players = team_players.sort_values("RecruitScore", ascending=False)

            for _, p in team_players.iterrows():
                pos = str(p.get("Position", "") or "").strip().upper()
                bid = _safe_num(p.get("BidAmount"))
                stars = int(p.get("Stars", 0) or 0)
                if stars in star_counts:
                    star_counts[stars] += 1
                if pos in pos_counts:
                    pos_counts[pos] += 1

                pos_avg = pos_avg_bid.get(pos)
                vs_pos = (pos_avg - bid) if (pos_avg is not None and bid is not None) else None

                # College, then headshot — when no headshot, the component
                # falls back to initials and the meta line shows the college.
                key = p["_key"]
                college = college_map.get(key, "")
                headshot = headshot_map.get(key, "")
                if not isinstance(headshot, str) or not headshot.startswith("http"):
                    headshot = ""

                recruits_payload.append({
                    "name": str(p.get("Player", "") or ""),
                    "position": pos,
                    "meta": college,
                    "stars": stars,
                    "headshotUrl": headshot,
                    "score": _safe_num(p.get("RecruitScore")),
                    "final": bid,
                    "predicted": _safe_num(p.get("PredictedCost")),
                    "vsMkt": _safe_num(p.get("SavingsVsLeagueAvg")),
                    "vsMdl": _safe_num(p.get("SavingsVsPredicted")),
                    "vsPos": vs_pos,
                    "grade": str(p.get("PlayerGrade", "") or "").strip(),
                })

    # Fall back to the grades-sheet star counts when player_grades is empty,
    # so the bar still renders.
    if sum(star_counts.values()) == 0 and team is not None:
        star_counts = {
            5: int(team.get("FiveStar", 0) or 0),
            4: int(team.get("FourStar", 0) or 0),
            3: int(team.get("ThreeStar", 0) or 0),
            2: int(team.get("TwoStar", 0) or 0),
        }

    league_size = int(len(year_df)) if not year_df.empty else 0
    logo_url = str(team.get("FranchiseLogo", "") or "") if team is not None else ""

    tiles = [
        {
            "label": "Class Rank",
            "value": f"#{rank}",
            "hero": True,
            "sub": f"of {league_size} · league" if league_size else None,
        },
        {
            "label": "Class Score",
            "value": f"{score:.1f}",
            "sub": score_sub,
            "subType": score_sub_type,
        },
        {
            "label": "Total Spend",
            "value": f"${total_spent:.0f}",
            "sub": spend_sub,
            "subType": spend_sub_type,
        },
        {
            "label": "Efficiency Grade",
            "value": eff_grade or "—",
            "sub": eff_sub,
        },
    ]

    return {
        "team": team_name,
        "logo": logo_url,
        "year": year,
        "availableYears": available_years,
        "grade": overall_grade,
        "rank": rank,
        "tiles": tiles,
        "totalCommits": total_commits or sum(star_counts.values()),
        "stars": [{"tier": t, "count": star_counts.get(t, 0)} for t in (5, 4, 3, 2)],
        "positions": [{"pos": p, "count": pos_counts.get(p, 0)} for p in ("QB", "RB", "WR", "TE")],
        "recruits": recruits_payload,
    }


def _safe_num(v):
    """Return float or None — used for JSON payloads where NaN must not leak."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if pd.isna(f):
        return None
    return f
