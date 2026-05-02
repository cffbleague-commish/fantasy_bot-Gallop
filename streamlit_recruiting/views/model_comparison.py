"""
Model Comparison tab — scatter plots, metrics, and per-player price tables
comparing the current model, gradient boosting, and replacement-level approaches.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from data.sheets import load_recruiting_board, load_auction_data, load_dlf_adp, load_espn_prospects
from models.current_model import build_pricing_model, predict_price, calc_scarcity_prices
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import calc_replacement_prices, DEFAULT_REPLACEMENT_ADP
from models.comparison import calc_model_metrics
from models.config import POSITIONS, COLORS


def render_comparison_tab(year: int, position_filter: str):
    """Render the Model Comparison tab."""
    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    if board_df.empty:
        st.info(f"No board data for {year}.")
        return

    if auction_df.empty:
        st.warning("No auction data available — models cannot be trained.")
        return

    # Keep full board for replacement model (budget must be split across all positions)
    full_board_df = board_df.copy()

    # Apply position filter for display
    if position_filter != "All":
        board_df = board_df[board_df["Position"] == position_filter]

    # --- Replacement-level ADP sliders ---
    st.markdown("#### Replacement-Level Thresholds")
    st.caption("Adjust the ADP where a player becomes 'freely available' at each position.")

    slider_cols = st.columns(4)
    replacement_adps = {}
    for i, pos in enumerate(POSITIONS):
        default = DEFAULT_REPLACEMENT_ADP[pos]
        replacement_adps[pos] = slider_cols[i].slider(
            f"{pos}", min_value=50, max_value=400, value=default,
            step=10, key=f"repl_{pos}",
        )

    # --- Build/train models ---
    pricing_model = build_pricing_model(auction_df, adp_df, espn_df)

    gb_model, gb_metrics = train_gradient_boosting(auction_df, adp_df, espn_df)

    # --- Generate predictions for current board ---
    current_prices = {}
    gb_prices = {}

    for _, row in board_df.iterrows():
        name = row["Player"]
        pos = row["Position"]

        # Current model prediction (from sheet — already computed)
        if pd.notna(row.get("PredictedCost")):
            current_prices[name] = row["PredictedCost"]

        # Gradient boosting prediction
        if gb_model is not None:
            gb_prices[name] = predict_gb(
                gb_model, pos,
                row.get("StartupADP"), row.get("ESPNGrade"),
                row.get("OverallPick"), copy_number=1,
            )

    # Replacement-level predictions (use FULL board so budget splits correctly)
    repl_df = pd.DataFrame()
    if pricing_model:
        repl_df = calc_replacement_prices(
            full_board_df, pricing_model["conference_budgets"],
            pricing_model.get("copy_discount_curve", {}),
            replacement_adps,
        )
    replacement_prices = {}
    if not repl_df.empty:
        for _, row in repl_df.iterrows():
            replacement_prices[row["Player"]] = row.get("copy1_16", 0)

    # --- Metrics cards ---
    st.markdown("---")
    st.markdown("#### Model Performance")

    metric_cols = st.columns(3)

    with metric_cols[0]:
        st.markdown("**Current (ADP Regression)**")
        if pricing_model and pricing_model.get("adp_regression"):
            regs = pricing_model["adp_regression"]
            avg_r2 = sum(r["r2"] for r in regs.values()) / len(regs) if regs else 0
            avg_n = sum(r["n"] for r in regs.values()) / len(regs) if regs else 0
            st.metric("Avg R\u00b2", f"{avg_r2:.3f}")
            st.metric("Avg Sample", f"{avg_n:.0f}")
            st.metric("Positions Fit", f"{len(regs)}/{len(POSITIONS)}")
        else:
            st.caption("No regression available")

    with metric_cols[1]:
        st.markdown("**Multi-Feature (Gradient Boosting)**")
        if gb_metrics and "error" not in gb_metrics:
            st.metric("R\u00b2 (train)", f"{gb_metrics['r2']:.3f}")
            st.metric("MAE", f"${gb_metrics['mae']:.1f}")
            st.metric("CV MAE", f"${gb_metrics['cv_mae']:.1f} \u00b1 {gb_metrics['cv_mae_std']:.1f}")
            st.metric("Training Rows", gb_metrics["n_train"])
        else:
            st.caption(gb_metrics.get("error", "Not available"))

    with metric_cols[2]:
        st.markdown("**Replacement-Level (VAR)**")
        st.caption("No training — arithmetic model")
        st.metric("Budget (16-tm)", f"${pricing_model['conference_budgets'].get(16, 0):,.0f}" if pricing_model else "N/A")
        st.metric("Budget (20-tm)", f"${pricing_model['conference_budgets'].get(20, 0):,.0f}" if pricing_model else "N/A")

    # --- Feature importance (GB) ---
    if gb_metrics and "feature_importances" in gb_metrics:
        st.markdown("---")
        st.markdown("#### Feature Importance (Gradient Boosting)")
        imp = gb_metrics["feature_importances"]
        imp_df = pd.DataFrame({
            "Feature": list(imp.keys()),
            "Importance": list(imp.values()),
        }).sort_values("Importance", ascending=True)

        fig = px.bar(
            imp_df, x="Importance", y="Feature", orientation="h",
            color_discrete_sequence=[COLORS["accent"]],
        )
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["surface"],
            height=300,
            margin=dict(l=0, r=0, t=10, b=0),
        )
        st.plotly_chart(fig, use_container_width=True)

    # --- Per-player comparison table ---
    st.markdown("---")
    st.markdown("#### Per-Player Price Comparison")

    rows = []
    for _, player in board_df.iterrows():
        name = player["Player"]
        rows.append({
            "Player": name,
            "Pos": player["Position"],
            "ADP": player.get("StartupADP"),
            "Stars": player.get("Rating"),
            "Current": f"${current_prices[name]:.0f}" if name in current_prices else "",
            "Multi-Feature": f"${gb_prices[name]:.0f}" if name in gb_prices else "",
            "Replacement": f"${replacement_prices[name]:.0f}" if name in replacement_prices else "",
        })

    comparison_df = pd.DataFrame(rows)
    st.dataframe(comparison_df, hide_index=True, use_container_width=True, height=600)

    # --- Scatter: Current vs GB ---
    if current_prices and gb_prices:
        st.markdown("---")
        st.markdown("#### Current Model vs Multi-Feature Model")

        scatter_data = []
        for name in set(current_prices.keys()) & set(gb_prices.keys()):
            pos_row = board_df[board_df["Player"] == name]
            pos = pos_row["Position"].iloc[0] if not pos_row.empty else ""
            scatter_data.append({
                "Player": name,
                "Position": pos,
                "Current": current_prices[name],
                "Multi-Feature": gb_prices[name],
            })

        if scatter_data:
            scatter_df = pd.DataFrame(scatter_data)
            fig = px.scatter(
                scatter_df, x="Current", y="Multi-Feature",
                color="Position", hover_name="Player",
                color_discrete_map=COLORS["positions"],
            )
            # Add diagonal line
            max_val = max(scatter_df["Current"].max(), scatter_df["Multi-Feature"].max())
            fig.add_trace(go.Scatter(
                x=[0, max_val], y=[0, max_val],
                mode="lines", line=dict(dash="dash", color="#555"),
                showlegend=False,
            ))
            fig.update_layout(
                template="plotly_dark",
                paper_bgcolor=COLORS["background"],
                plot_bgcolor=COLORS["surface"],
                height=500,
                xaxis_title="Current Model ($)",
                yaxis_title="Multi-Feature Model ($)",
            )
            st.plotly_chart(fig, use_container_width=True)
