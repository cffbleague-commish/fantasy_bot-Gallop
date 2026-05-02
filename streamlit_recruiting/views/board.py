"""
Recruiting Board tab — interactive table with headshots, star ratings, and pricing.
Reads pre-computed data from the RecruitingBoard sheet.
"""

import streamlit as st
import pandas as pd

from data.sheets import load_recruiting_board
from views.components import star_html, position_badge


def render_board_tab(year: int, position_filter: str, conference_filter: str):
    """Render the Recruiting Board tab."""
    df = load_recruiting_board(year)

    if df.empty:
        st.info(f"No recruiting board data available for {year}.")
        return

    # Apply filters
    if position_filter != "All":
        df = df[df["Position"] == position_filter]
    if conference_filter != "All":
        # Filter by college conference — not directly in board, skip for now
        pass

    if df.empty:
        st.info("No players match the current filters.")
        return

    st.markdown(f"### {year} Recruiting Board ({len(df)} players)")

    # Search filter
    search = st.text_input("Search players", placeholder="Player name, college...", key="board_search")
    if search:
        mask = (
            df["Player"].str.contains(search, case=False, na=False) |
            df["College"].str.contains(search, case=False, na=False)
        )
        df = df[mask]

    # Build display dataframe
    display_cols = {
        "StarsDisplay": "Stars",
        "Player": "Player",
        "Position": "Pos",
        "College": "College",
        "ESPNGrade": "ESPN",
        "DraftRd": "Rd",
        "OverallPick": "Pick",
        "StartupADP": "ADP",
        "ADPTier": "Tier",
        "RecruitScore": "Score",
        "PredictedCost": "Predicted",
        "Copy1_16": "C1 (16)",
        "Copy2_16": "C2 (16)",
        "Copy1_20": "C1 (20)",
        "Copy2_20": "C2 (20)",
        "PriceSource": "Source",
        "ConfidenceLabel": "Conf",
    }

    # Only include columns that exist
    available_cols = [c for c in display_cols.keys() if c in df.columns]
    display_df = df[available_cols].copy()
    display_df.rename(columns={k: v for k, v in display_cols.items() if k in available_cols}, inplace=True)

    # Format numeric columns
    for col in ["Predicted", "C1 (16)", "C2 (16)", "C1 (20)", "C2 (20)"]:
        if col in display_df.columns:
            display_df[col] = display_df[col].apply(
                lambda x: f"${x:.0f}" if pd.notna(x) else ""
            )

    if "Score" in display_df.columns:
        display_df["Score"] = display_df["Score"].apply(
            lambda x: f"{x:.1f}" if pd.notna(x) else ""
        )

    if "ESPN" in display_df.columns:
        display_df["ESPN"] = display_df["ESPN"].apply(
            lambda x: f"{x:.0f}" if pd.notna(x) else ""
        )

    st.dataframe(
        display_df,
        hide_index=True,
        use_container_width=True,
        height=min(len(display_df) * 35 + 38, 800),
    )

    # Summary metrics
    col1, col2, col3, col4 = st.columns(4)
    for stars_val, col in [(5, col1), (4, col2), (3, col3), (2, col4)]:
        count = len(df[df["Rating"] == stars_val])
        col.metric(f"{stars_val}-Star", count)
