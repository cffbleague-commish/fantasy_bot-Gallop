"""
Budget Tool tab — interactive draft planner with running budget tracking.
Port of the Budget Tool from the existing WebApp.
"""

import streamlit as st
import pandas as pd

from data.sheets import load_recruiting_board
from models.config import STAR_WEIGHTS, POSITIONS
from views.components import star_html, position_badge


def render_budget_tool_tab(year: int, position_filter: str):
    """Render the Budget Tool tab."""
    board_df = load_recruiting_board(year)

    if board_df.empty:
        st.info(f"No board data for {year}.")
        return

    # Initialize session state
    if "budget_picks" not in st.session_state:
        st.session_state.budget_picks = {}

    # Budget and conference settings
    col1, col2 = st.columns(2)
    budget = col1.number_input("Auction Budget ($)", min_value=0, max_value=1000, value=100, step=5)
    conf_type = col2.selectbox("Conference Type", ["16-Team", "20-Team"])

    price_col = "Copy1_16" if conf_type == "16-Team" else "Copy1_20"

    # Calculate haul stats
    picks = st.session_state.budget_picks
    total_spent = sum(picks.values())
    remaining = budget - total_spent

    # Haul summary
    st.markdown("---")
    haul_cols = st.columns(4)
    haul_cols[0].metric("Budget", f"${budget}")
    haul_cols[1].metric("Spent", f"${total_spent:.0f}")
    haul_cols[2].metric("Remaining", f"${remaining:.0f}",
                        delta=f"-${total_spent:.0f}" if total_spent > 0 else None)
    haul_cols[3].metric("Players", len(picks))

    # Class score
    if picks:
        class_score = 0
        for name in picks:
            player_row = board_df[board_df["Player"] == name]
            if not player_row.empty:
                stars = player_row.iloc[0].get("Rating", 1) or 1
                score = player_row.iloc[0].get("RecruitScore", 0) or 0
                weight = STAR_WEIGHTS.get(stars, 0.3)
                class_score += score * weight
        st.metric("Class Score", f"{class_score:.1f}")

    # Your Haul
    if picks:
        st.markdown("#### Your Haul")
        haul_data = []
        for name, cost in picks.items():
            player_row = board_df[board_df["Player"] == name]
            if not player_row.empty:
                p = player_row.iloc[0]
                haul_data.append({
                    "Player": name,
                    "Pos": p.get("Position", ""),
                    "Stars": p.get("Rating", 1),
                    "Cost": f"${cost:.0f}",
                })
        if haul_data:
            haul_df = pd.DataFrame(haul_data)
            st.dataframe(haul_df, hide_index=True, use_container_width=True)

        if st.button("Clear Haul", type="secondary"):
            st.session_state.budget_picks = {}
            st.rerun()

        # Export for Discord
        if st.button("Copy for Discord"):
            lines = [f"**{year} Draft Haul** (Budget: ${budget})"]
            for name, cost in picks.items():
                player_row = board_df[board_df["Player"] == name]
                if not player_row.empty:
                    p = player_row.iloc[0]
                    stars = int(p.get("Rating", 1) or 1)
                    star_str = "\u2b50" * stars
                    lines.append(f"- {name} ({p.get('Position', '')}) - ${cost:.0f} {star_str}")
            lines.append(f"\nTotal: ${total_spent:.0f} | Remaining: ${remaining:.0f}")
            st.code("\n".join(lines))

    st.markdown("---")

    # Available players
    st.markdown("#### Available Players")

    # Apply position filter
    available = board_df[~board_df["Player"].isin(picks.keys())]
    if position_filter != "All":
        available = available[available["Position"] == position_filter]

    search = st.text_input("Search", placeholder="Player name...", key="budget_search")
    if search:
        available = available[available["Player"].str.contains(search, case=False, na=False)]

    # Display with add buttons
    for _, player in available.head(30).iterrows():
        name = player["Player"]
        pos = player.get("Position", "")
        stars = int(player.get("Rating", 1) or 1)
        suggested = player.get(price_col)
        predicted = player.get("PredictedCost")

        price_display = ""
        if pd.notna(suggested):
            price_display = f"Copy1: ${suggested:.0f}"
        elif pd.notna(predicted):
            price_display = f"Predicted: ${predicted:.0f}"

        col1, col2, col3 = st.columns([3, 1, 1])
        col1.markdown(f"**{name}** ({pos}) {'⭐' * stars} — {price_display}")

        # Custom bid amount
        default_bid = suggested if pd.notna(suggested) else (predicted if pd.notna(predicted) else 1)
        bid = col2.number_input(
            "Bid", min_value=0, max_value=int(remaining),
            value=int(default_bid) if default_bid else 1,
            key=f"bid_{name}", label_visibility="collapsed",
        )

        if col3.button("Add", key=f"add_{name}"):
            if bid <= remaining:
                st.session_state.budget_picks[name] = bid
                st.rerun()
            else:
                st.warning(f"${bid} exceeds remaining budget (${remaining:.0f})")
