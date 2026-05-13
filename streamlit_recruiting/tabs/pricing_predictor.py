"""
Pricing Predictor tab — surface pricing model predictions.
Preparation mode: KPI row, model metrics, per-player comparison table, scatter plots.
Preserves all existing model code from models/ package.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from data.sheets import load_recruiting_board, load_auction_data, load_dlf_adp, load_espn_prospects, get_available_years
from models.current_model import build_pricing_model
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import calc_replacement_prices, DEFAULT_REPLACEMENT_ADP
from models.config import POSITIONS, get_league_year
from components import render_kpi_row, plotly_layout_defaults, _html


def render():
    """Render the Pricing Predictor tab."""
    # --- Inline filters ---
    years = get_available_years()
    if not years:
        st.info("No data found.")
        return

    col_y, col_p = st.columns(2)
    league_year = get_league_year()
    default_idx = years.index(league_year) if league_year in years else 0
    year = col_y.selectbox("Draft Year", years, index=default_idx, key="pricing_year")
    position_filter = col_p.selectbox("Position", ["All"] + POSITIONS, key="pricing_pos")

    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    if board_df.empty:
        st.info(f"No board data for {year}.")
        return

    if auction_df.empty:
        st.warning("No auction data available \u2014 models cannot be trained.")
        return

    # Keep full board for replacement model (budget split across all positions)
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

    # --- KPI Row: Model Performance ---
    avg_r2 = 0.0
    total_n = 0
    pos_fit = 0
    if pricing_model and pricing_model.get("adp_regression"):
        regs = pricing_model["adp_regression"]
        avg_r2 = sum(r["r2"] for r in regs.values()) / len(regs) if regs else 0
        total_n = sum(r["n"] for r in regs.values())
        pos_fit = len(regs)

    render_kpi_row([
        {"label": "Avg R\u00b2", "value": f"{avg_r2:.3f}", "hero": True},
        {"label": "Positions Fit", "value": f"{pos_fit}/{len(POSITIONS)}"},
        {"label": "Training Samples", "value": str(total_n)},
        {"label": "GB MAE", "value": f"${gb_metrics.get('mae', 0):.1f}" if gb_metrics and "error" not in gb_metrics else "N/A"},
    ])

    st.markdown("")

    # --- Generate predictions ---
    current_prices = {}
    gb_prices = {}

    for _, row in board_df.iterrows():
        name = row["Player"]
        pos = row["Position"]

        # Current model prediction (from sheet)
        if pd.notna(row.get("PredictedCost")):
            current_prices[name] = row["PredictedCost"]

        # Gradient boosting prediction
        if gb_model is not None:
            gb_prices[name] = predict_gb(
                gb_model, pos,
                row.get("StartupADP"), row.get("ESPNGrade"),
                row.get("OverallPick"), copy_number=1,
            )

    # Replacement-level predictions (use full board)
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

    # --- Two-column layout: table + charts ---
    col_left, col_right = st.columns([60, 40], gap="medium")

    with col_left:
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

    with col_right:
        # Model Performance Cards
        st.markdown("#### Model Details")

        with st.expander("Current (ADP Regression)", expanded=False):
            if pricing_model and pricing_model.get("adp_regression"):
                regs = pricing_model["adp_regression"]
                for pos, reg in regs.items():
                    st.caption(f"{pos}: R\u00b2={reg['r2']:.3f}, n={reg['n']}")
            else:
                st.caption("No regression available")

        with st.expander("Multi-Feature (Gradient Boosting)", expanded=False):
            if gb_metrics and "error" not in gb_metrics:
                st.metric("R\u00b2 (train)", f"{gb_metrics['r2']:.3f}")
                st.metric("MAE", f"${gb_metrics['mae']:.1f}")
                st.metric("CV MAE", f"${gb_metrics['cv_mae']:.1f} \u00b1 {gb_metrics['cv_mae_std']:.1f}")
                st.metric("Training Rows", gb_metrics["n_train"])
            else:
                st.caption(gb_metrics.get("error", "Not available") if gb_metrics else "Not available")

        with st.expander("Replacement-Level (VAR)", expanded=False):
            st.caption("No training \u2014 arithmetic model")
            if pricing_model:
                st.metric("Budget (16-tm)", f"${pricing_model['conference_budgets'].get(16, 0):,.0f}")
                st.metric("Budget (20-tm)", f"${pricing_model['conference_budgets'].get(20, 0):,.0f}")

        # Feature importance (GB)
        if gb_metrics and "feature_importances" in gb_metrics:
            st.markdown("#### Feature Importance")
            imp = gb_metrics["feature_importances"]
            imp_df = pd.DataFrame({
                "Feature": list(imp.keys()),
                "Importance": list(imp.values()),
            }).sort_values("Importance", ascending=True)

            fig = px.bar(
                imp_df, x="Importance", y="Feature", orientation="h",
                color_discrete_sequence=["#C9A227"],
            )
            layout = plotly_layout_defaults()
            layout.update(height=300)
            fig.update_layout(**layout)
            st.plotly_chart(fig, use_container_width=True)

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
            pos_colors = {"QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#6A6A6A"}

            fig = px.scatter(
                scatter_df, x="Current", y="Multi-Feature",
                color="Position", hover_name="Player",
                color_discrete_map=pos_colors,
            )
            # Diagonal reference line
            max_val = max(scatter_df["Current"].max(), scatter_df["Multi-Feature"].max())
            fig.add_trace(go.Scatter(
                x=[0, max_val], y=[0, max_val],
                mode="lines", line=dict(dash="dash", color="#555"),
                showlegend=False,
            ))
            layout = plotly_layout_defaults()
            layout.update(
                height=500,
                xaxis_title="Current Model ($)",
                yaxis_title="Multi-Feature Model ($)",
            )
            fig.update_layout(**layout)
            st.plotly_chart(fig, use_container_width=True)
