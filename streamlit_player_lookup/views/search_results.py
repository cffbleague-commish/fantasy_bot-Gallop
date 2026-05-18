"""
Search & filter view — main landing page for the Player Lookup app.

Shows a search bar, dropdown filters, and a results table.
Selecting a row opens the player detail view inline above the table.
"""

import streamlit as st
import pandas as pd

from config import POSITIONS, CONFERENCES
from data.sheets import (
    load_player_copies_enriched,
    load_franchise_lookup,
    get_unique_players,
    get_available_draft_classes,
)


def render():
    """Render the search bar, filters, results table, and detail view."""

    # --- Search bar ---
    search = st.text_input(
        "Search Players",
        placeholder="Type a player name\u2026",
        key="player_search",
    )

    # --- Filter row ---
    col_pos, col_conf, col_class = st.columns(3)

    with col_pos:
        position_filter = st.selectbox(
            "Position",
            ["All"] + POSITIONS,
            key="lookup_pos",
        )

    with col_conf:
        conference_filter = st.selectbox(
            "Conference",
            ["All"] + CONFERENCES,
            key="lookup_conf",
        )

    with col_class:
        draft_classes = get_available_draft_classes()
        class_options = ["All"] + [str(y) for y in draft_classes]
        class_filter = st.selectbox(
            "Draft Class",
            class_options,
            key="lookup_class",
        )

    # --- Load data ---
    unique_players = get_unique_players()
    copies_df = load_player_copies_enriched()
    franchise_df = load_franchise_lookup()

    if unique_players.empty:
        st.info("No player data available. Check your Google Sheet connection.")
        return

    # --- Apply filters ---
    filtered = unique_players.copy()

    if search:
        mask = filtered["PlayerName"].str.contains(search, case=False, na=False)
        filtered = filtered[mask]

    if position_filter != "All":
        filtered = filtered[filtered["Position"] == position_filter]

    if conference_filter != "All":
        conf_ids = copies_df[copies_df["Conference"] == conference_filter][
            "MFL_Player_ID"
        ].unique()
        filtered = filtered[filtered["MFL_Player_ID"].isin(conf_ids)]

    if class_filter != "All":
        filtered = filtered[filtered["CreatedSeason"] == int(class_filter)]

    # --- Placeholder for detail view (renders above table when a row is selected) ---
    detail_slot = st.empty()

    # --- Results table ---
    if filtered.empty:
        st.info("No players match your search / filters.")
        return

    st.caption(f"{len(filtered)} player{'s' if len(filtered) != 1 else ''} found")

    display_df = filtered[
        ["PlayerName", "Position", "CreatedSeason", "ActiveCopies", "TotalCopies", "TotalAwards"]
    ].copy()
    display_df.rename(
        columns={
            "PlayerName": "Player",
            "Position": "Pos",
            "CreatedSeason": "Draft Class",
            "ActiveCopies": "Active",
            "TotalCopies": "Copies",
            "TotalAwards": "Awards",
        },
        inplace=True,
    )

    selection = st.dataframe(
        display_df,
        hide_index=True,
        use_container_width=True,
        height=min(len(display_df) * 35 + 38, 600),
        on_select="rerun",
        selection_mode="single-row",
        key="player_results_table",
    )

    # --- Handle row selection → render detail view ---
    selected_rows = selection.selection.rows if selection and selection.selection else []
    if selected_rows:
        row_idx = selected_rows[0]
        if row_idx < len(filtered):
            selected = filtered.iloc[row_idx]
            with detail_slot.container():
                st.markdown("---")
                from views.player_detail import render_player_detail

                render_player_detail(
                    mfl_player_id=selected["MFL_Player_ID"],
                    player_name=selected["PlayerName"],
                    copies_df=copies_df,
                    franchise_df=franchise_df,
                    conference_filter=(
                        conference_filter if conference_filter != "All" else None
                    ),
                )
