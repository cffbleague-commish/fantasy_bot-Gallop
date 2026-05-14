"""
Board tab — browse and evaluate available college players.
Research mode: KPI row, search, sortable table, click a row for player detail.
"""

import streamlit as st
import pandas as pd

from data.sheets import load_recruiting_board, get_available_years
from models.config import POSITIONS, CONFERENCES
from components import render_kpi_row


def render():
    """Render the Board tab."""
    # --- Inline filters ---
    years = get_available_years()
    if not years:
        st.info("No data found. Check your Google Sheet connection.")
        return

    col_y, col_p, col_c = st.columns(3)
    year_options = ["All Years"] + years
    year_selection = col_y.selectbox("Draft Year", year_options, key="board_year")
    show_all_years = year_selection == "All Years"
    year = None if show_all_years else year_selection
    position_filter = col_p.selectbox("Position", ["All"] + POSITIONS, key="board_pos")
    conference_filter = col_c.selectbox("Conference", ["All"] + sorted(CONFERENCES.keys()), key="board_conf")

    df = load_recruiting_board(year)

    if df.empty:
        st.info(f"No recruiting board data available{'' if show_all_years else f' for {year}'}.")
        return

    # Apply filters
    if position_filter != "All":
        df = df[df["Position"] == position_filter]

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

    # --- Placeholder for player detail (renders above the table) ---
    player_detail_slot = st.empty()

    # --- Sortable table with row selection ---
    display_cols = {"Rank": "#", "HeadshotURL": "Photo"}
    if show_all_years:
        display_cols["DraftYear"] = "Year"
    display_cols.update({
        "Player": "Player",
        "Position": "Pos",
        "College": "College",
        "Rating": "Stars",
        "RecruitScore": "Score",
        "ESPNGrade": "ESPN",
        "PredictedCost": "Predicted",
        "ADPTier": "Tier",
    })

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

    column_config = {}
    if "Photo" in display_df.columns:
        column_config["Photo"] = st.column_config.ImageColumn("Photo", width="small")

    selection = st.dataframe(
        display_df,
        column_config=column_config,
        hide_index=True,
        use_container_width=True,
        height=min(len(display_df) * 35 + 38, 700),
        on_select="rerun",
        selection_mode="single-row",
        key="board_table",
    )

    # Show player deep dive above the table when a row is selected
    selected_rows = selection.selection.rows if selection and selection.selection else []
    if selected_rows:
        row_idx = selected_rows[0]
        if row_idx < len(filtered_df):
            player_name = filtered_df.iloc[row_idx]["Player"]
            # For deep dive, use the player's specific year when showing all
            dive_year = year
            if show_all_years and "DraftYear" in filtered_df.columns:
                dive_year = filtered_df.iloc[row_idx].get("DraftYear")
            with player_detail_slot.container():
                _show_player_deep_dive(player_name, df, dive_year)



def _show_player_deep_dive(player_name: str, board_df: pd.DataFrame, year: int):
    """Open the Player Deep Dive modal in board context."""
    from modals.player_deep_dive import show_player_deep_dive
    show_player_deep_dive(player_name, board_df, year, context="board")
