"""
Board tab — browse and evaluate available college players.
Research mode: KPI row, search, sortable table, click-to-modal player detail.
"""

import streamlit as st
import pandas as pd

from data.sheets import load_recruiting_board
from components import render_kpi_row, _html


def render(year: int, position_filter: str, conference_filter: str):
    """Render the Board tab."""
    df = load_recruiting_board(year)

    if df.empty:
        st.info(f"No recruiting board data available for {year}.")
        return

    # Apply filters
    if position_filter != "All":
        df = df[df["Position"] == position_filter]
    # Note: conference_filter for Board applies to college conference if the column exists
    # The current data uses Position-based filtering; conference filtering via sidebar

    if df.empty:
        st.info("No players match the current filters.")
        return

    # Sort by Recruit Score descending, add rank
    df = df.sort_values("RecruitScore", ascending=False).reset_index(drop=True)
    df["Rank"] = range(1, len(df) + 1)

    # --- KPI Row ---
    five_stars = int((df["Rating"] == 5).sum()) if "Rating" in df.columns else 0
    four_stars = int((df["Rating"] == 4).sum()) if "Rating" in df.columns else 0
    avg_score = df["RecruitScore"].mean() if "RecruitScore" in df.columns else 0

    render_kpi_row([
        {"label": "Total Players", "value": str(len(df))},
        {"label": "5-Star", "value": str(five_stars), "hero": True},
        {"label": "4-Star", "value": str(four_stars)},
        {"label": "Avg Score", "value": f"{avg_score:.1f}" if pd.notna(avg_score) else "N/A"},
    ])

    st.markdown("")  # spacer

    # --- Search ---
    search = st.text_input(
        "Search players",
        placeholder="Player name or college...",
        key="board_search",
    )
    filtered_df = df
    if search:
        mask = (
            df["Player"].str.contains(search, case=False, na=False)
            | df["College"].str.contains(search, case=False, na=False)
        )
        filtered_df = df[mask]

    if filtered_df.empty:
        st.info("No players match your search.")
        return

    # --- Player select for deep dive modal ---
    player_names = filtered_df["Player"].tolist()
    selected_player = st.selectbox(
        "Select player for detail view",
        ["-- Select a player --"] + player_names,
        key="board_player_select",
        label_visibility="collapsed",
    )

    if selected_player != "-- Select a player --":
        _show_player_deep_dive(selected_player, df, year)

    # --- Sortable table ---
    display_cols = {
        "Rank": "#",
        "Player": "Player",
        "Position": "Pos",
        "College": "College",
        "Rating": "Stars",
        "RecruitScore": "Score",
        "ESPNGrade": "ESPN",
        "PredictedCost": "Predicted",
        "ADPTier": "Tier",
    }

    available = [c for c in display_cols if c in filtered_df.columns]
    display_df = filtered_df[available].copy()
    display_df.rename(
        columns={k: v for k, v in display_cols.items() if k in available},
        inplace=True,
    )

    if "Score" in display_df.columns:
        display_df["Score"] = display_df["Score"].apply(
            lambda x: f"{x:.1f}" if pd.notna(x) else ""
        )
    if "ESPN" in display_df.columns:
        display_df["ESPN"] = display_df["ESPN"].apply(
            lambda x: f"{x:.0f}" if pd.notna(x) else ""
        )
    if "Predicted" in display_df.columns:
        display_df["Predicted"] = display_df["Predicted"].apply(
            lambda x: f"${x:.0f}" if pd.notna(x) else ""
        )
    if "Stars" in display_df.columns:
        display_df["Stars"] = display_df["Stars"].apply(
            lambda x: f"{'★' * int(x)}{'☆' * (5 - int(x))}" if pd.notna(x) else ""
        )

    st.dataframe(
        display_df,
        hide_index=True,
        use_container_width=True,
        height=min(len(display_df) * 35 + 38, 700),
    )


def _show_player_deep_dive(player_name: str, board_df: pd.DataFrame, year: int):
    """Open the Player Deep Dive modal in board context."""
    from modals.player_deep_dive import show_player_deep_dive
    show_player_deep_dive(player_name, board_df, year, context="board")
