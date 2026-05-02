"""
Value Finder tab — identify players where pricing models disagree,
suggesting potential mispricings and arbitrage opportunities.
"""

import streamlit as st
import pandas as pd
import plotly.express as px

from data.sheets import load_recruiting_board, load_auction_data, load_dlf_adp, load_espn_prospects
from models.current_model import build_pricing_model
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import calc_replacement_prices, DEFAULT_REPLACEMENT_ADP
from models.config import POSITIONS, COLORS


def render_value_finder_tab(year: int, position_filter: str):
    """Render the Value Finder tab."""
    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    if board_df.empty:
        st.info(f"No board data for {year}.")
        return

    # Apply position filter
    if position_filter != "All":
        board_df = board_df[board_df["Position"] == position_filter]

    # Filters
    col1, col2 = st.columns(2)
    min_stars = col1.slider("Min Stars", 1, 5, 2, key="vf_min_stars")
    max_price = col2.slider("Max Predicted Cost ($)", 0, 200, 100, step=5, key="vf_max_price")

    board_df = board_df[board_df["Rating"] >= min_stars]
    if max_price > 0:
        board_df = board_df[
            (board_df["PredictedCost"].isna()) |
            (board_df["PredictedCost"] <= max_price)
        ]

    if board_df.empty:
        st.info("No players match the current filters.")
        return

    # Build models
    pricing_model = build_pricing_model(auction_df, adp_df, espn_df)
    gb_model, gb_metrics = train_gradient_boosting(auction_df, adp_df, espn_df)

    # Compute replacement prices for ALL players at once (budget is split across pool)
    repl_lookup = {}
    if pricing_model:
        repl_df = calc_replacement_prices(
            board_df,
            pricing_model["conference_budgets"],
            pricing_model.get("copy_discount_curve", {}),
        )
        if not repl_df.empty:
            for _, r in repl_df.iterrows():
                repl_lookup[r["Player"]] = r.get("copy1_16", 0)

    # Generate predictions
    rows = []
    for _, player in board_df.iterrows():
        name = player["Player"]
        pos = player["Position"]

        current = player.get("PredictedCost")
        gb_price = None

        if gb_model is not None:
            gb_price = predict_gb(
                gb_model, pos,
                player.get("StartupADP"), player.get("ESPNGrade"),
                player.get("OverallPick"), copy_number=1,
            )

        repl_price = repl_lookup.get(name)

        # Calculate value divergence
        prices = [p for p in [current, gb_price, repl_price] if p is not None and p > 0]
        if len(prices) >= 2:
            divergence = max(prices) - min(prices)
            avg_price = sum(prices) / len(prices)
        else:
            divergence = 0
            avg_price = prices[0] if prices else 0

        rows.append({
            "Player": name,
            "Pos": pos,
            "Stars": player.get("Rating"),
            "ADP": player.get("StartupADP"),
            "Current": f"${current:.0f}" if pd.notna(current) else "",
            "Multi-Feature": f"${gb_price:.0f}" if gb_price is not None else "",
            "Replacement": f"${repl_price:.0f}" if repl_price is not None else "",
            "Divergence": divergence,
            "Avg Price": avg_price,
        })

    results_df = pd.DataFrame(rows)

    # Sort by divergence descending (biggest disagreements first)
    results_df = results_df.sort_values("Divergence", ascending=False)

    st.markdown(f"#### Value Opportunities ({len(results_df)} players)")
    st.caption("Players sorted by model disagreement — larger gaps suggest potential mispricings.")

    # Display table
    display_cols = ["Player", "Pos", "Stars", "ADP",
                    "Current", "Multi-Feature", "Replacement", "Divergence"]
    display = results_df[display_cols].copy()
    display["Divergence"] = display["Divergence"].apply(lambda x: f"${x:.0f}" if x > 0 else "")

    st.dataframe(
        display, column_config=column_config,
        hide_index=True, use_container_width=True,
        height=min(len(display) * 35 + 38, 700),
    )

    # Divergence chart
    top_divergent = results_df[results_df["Divergence"] > 0].head(20)
    if not top_divergent.empty:
        st.markdown("---")
        st.markdown("#### Top Model Disagreements")

        fig = px.bar(
            top_divergent, x="Player", y="Divergence",
            color="Pos", color_discrete_map=COLORS["positions"],
            hover_data=["Current", "Multi-Feature", "Replacement"],
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["surface"],
            height=400,
            xaxis_title="", yaxis_title="Price Divergence ($)",
            xaxis_tickangle=-45,
        )
        st.plotly_chart(fig, use_container_width=True)
