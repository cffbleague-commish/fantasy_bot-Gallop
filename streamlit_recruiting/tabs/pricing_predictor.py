"""
Pricing Predictor tab — surface pricing model predictions.
Preparation mode: KPI row, model metrics, per-player comparison table, scatter plots.
Live mode: conference-aware dynamic pricing using live auction state.
Preserves all existing model code from models/ package.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from data.sheets import (
    load_recruiting_board, load_auction_data, load_dlf_adp,
    load_espn_prospects, get_available_years, load_live_auction,
    load_franchise_lookup,
)
from data.mfl_api import fetch_auction_budgets
from models.current_model import build_pricing_model
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import (
    calc_replacement_prices, calc_dynamic_replacement_prices,
    calc_conference_budget_remaining,
)
from models.config import POSITIONS, CONFERENCES, get_league_year
from components import render_kpi_row, plotly_layout_defaults, college_logo_url, position_badge_url
from descriptions import DESCRIPTIONS

# Import copy session assignment from live auction tab
from tabs.live_auction import _assign_copy_sessions, _resolve_winning_prices


def render():
    """Render the Pricing Predictor tab."""
    # --- Inline filters ---
    years = get_available_years()
    if not years:
        st.info("No data found.")
        return

    col_y, col_p = st.columns(2)
    league_year = get_league_year()
    year_options = ["All Years"] + years
    default_idx = year_options.index(league_year) if league_year in year_options else 0
    year_selection = col_y.selectbox("Draft Year", year_options, index=default_idx, key="pricing_year")
    show_all_years = year_selection == "All Years"
    year = None if show_all_years else year_selection
    position_filter = col_p.selectbox("Position", ["All"] + POSITIONS, key="pricing_pos")

    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    if board_df.empty:
        st.info(f"No board data{'' if show_all_years else f' for {year}'}.")
        return

    if auction_df.empty:
        st.warning("No auction data available \u2014 models cannot be trained.")
        return

    # Keep full board for replacement model (budget split across all positions)
    full_board_df = board_df.copy()

    # Apply position filter for display
    if position_filter != "All":
        board_df = board_df[board_df["Position"] == position_filter]

    # --- Build/train models ---
    pricing_model = build_pricing_model(auction_df, adp_df, espn_df)
    gb_model, gb_metrics = train_gradient_boosting(auction_df, adp_df, espn_df)

    # --- Replacement-Level Mode Toggle ---
    st.markdown("#### Replacement-Level Pricing Mode")
    repl_mode = st.radio(
        "Mode", ["Static", "Live"],
        horizontal=True, key="repl_mode",
        help="Static: pre-auction baseline. Live: adjusts based on auction activity.",
    )

    # Live mode controls
    live_prices = {}
    live_statuses = {}
    live_breakdowns = {}  # player -> breakdown dict for tooltip
    franchise_remaining_budget = None

    if repl_mode == "Live":
        conf_list = sorted(CONFERENCES.keys())
        col_conf, col_fran = st.columns(2)
        selected_conf = col_conf.selectbox(
            "Conference", conf_list, key="pricing_conf",
        )

        # Load franchise data for this conference
        fl_df = load_franchise_lookup()
        if not fl_df.empty:
            conf_franchises = fl_df[fl_df["Conference"] == selected_conf]["TeamName"].tolist()
        else:
            conf_franchises = []

        selected_franchise = col_fran.selectbox(
            "Your Team", conf_franchises if conf_franchises else ["(none)"],
            key="pricing_franchise",
        )

        # Load live auction data and budgets
        live_df = load_live_auction()
        raw_budgets = fetch_auction_budgets(league_year)

        # Re-key budgets from FranchiseID → FranchiseName (same pattern as live_auction tab)
        fid_to_name = {}
        if not fl_df.empty:
            for _, fr_row in fl_df.iterrows():
                raw_id = str(fr_row["FranchiseID"])
                try:
                    normalized = str(int(float(raw_id)))
                except (ValueError, TypeError):
                    normalized = raw_id.lstrip("0") or "0"
                fid_to_name[normalized] = fr_row["TeamName"]
        auction_budgets = {
            fid_to_name.get(fid, fid): budget
            for fid, budget in raw_budgets.items()
            if fid in fid_to_name
        }

        if not live_df.empty:
            # Filter to current year
            live_df = live_df[live_df["AuctionYear"] == league_year]

            # Full feed (all players) for budget calculations — budget is shared
            # across rookies and upperclassmen
            all_df = live_df.copy()
            if "CopySession" not in all_df.columns or (all_df["CopySession"] == 0).all():
                all_df = _assign_copy_sessions(all_df)
            all_df = _resolve_winning_prices(all_df)

            # Rookie-only feed for VAR pool and pricing
            rookie_df = all_df[all_df["IsRookie"]].copy()

            # Calculate remaining budget using ALL spending (rookies + upperclassmen)
            conf_total, conf_remaining, per_franchise = calc_conference_budget_remaining(
                all_df, selected_conf, auction_budgets, fl_df,
            )
            franchise_remaining_budget = per_franchise.get(selected_franchise, 0)

            # Show live budget KPIs
            pct_avail = f"{conf_remaining / conf_total * 100:.0f}%" if conf_total > 0 else "\u2014"
            # Default ceiling (before per-player adjustments) = 2nd-highest budget
            _sorted_b = sorted(per_franchise.values(), reverse=True)
            default_ceiling = _sorted_b[1] if len(_sorted_b) >= 2 else (_sorted_b[0] if _sorted_b else 0)
            render_kpi_row([
                {"label": "Conf Budget", "value": f"${conf_total:,.0f}" if conf_total > 0 else "\u2014"},
                {"label": "Conf Remaining", "value": f"${conf_remaining:,.0f}", "sub": pct_avail},
                {"label": "Your Budget Left", "value": f"${franchise_remaining_budget:,.0f}" if franchise_remaining_budget else "\u2014"},
                {"label": "Base Ceiling", "value": f"${default_ceiling:,.0f}" if default_ceiling else "\u2014", "sub": "per-player caps vary"},
            ])

            # Calculate dynamic prices using rookie data for VAR pool,
            # but conference_remaining already reflects all spending.
            # Pass per_franchise so each player gets an individual market cap
            # that excludes the budgets of teams already owning a copy.
            copy_curve = pricing_model.get("copy_discount_curve", {}) if pricing_model else {}
            dynamic_df = calc_dynamic_replacement_prices(
                full_board_df, rookie_df, selected_conf,
                conf_remaining, copy_curve,
                per_franchise_remaining=per_franchise,
            )
            if not dynamic_df.empty:
                for _, r in dynamic_df.iterrows():
                    live_prices[r["Player"]] = r["live_price"]
                    live_statuses[r["Player"]] = r["status"]
                    live_breakdowns[r["Player"]] = {
                        "var": r["var_score"],
                        "pool_pct": r.get("pool_pct", 0),
                        "total_share": r.get("total_share", 0),
                        "copies": r["copies_remaining"],
                        "cap": r.get("market_cap", 0),
                    }

            # Identify rookie players the selected franchise is currently
            # the high bidder on, or already owns a copy of
            conf_rookie_df = rookie_df[rookie_df["Conference"] == selected_conf]
            won_keys = set()
            my_owned_players = set()
            conf_won = conf_rookie_df[conf_rookie_df["TransactionType"] == "AUCTION_WON"]
            if not conf_won.empty:
                for _, w in conf_won.iterrows():
                    won_keys.add((w["PlayerID"], w.get("CopySession", 0)))
                    # Track players the selected franchise already owns
                    if w["FranchiseName"] == selected_franchise:
                        my_owned_players.add(w["PlayerName"])

            bids_df = conf_rookie_df[conf_rookie_df["TransactionType"] == "AUCTION_BID"]
            if not bids_df.empty:
                for (pid, cs), group in bids_df.groupby(["PlayerID", "CopySession"]):
                    if (pid, cs) in won_keys:
                        continue
                    top_row = group.loc[group["BidAmount"].idxmax()]
                    if top_row["FranchiseName"] == selected_franchise:
                        # Mark this player as "my_bid" for highlighting
                        pname = top_row["PlayerName"]
                        if pname in live_statuses:
                            live_statuses[pname] = "my_bid"

            # Mark players already owned by the selected franchise
            for pname in my_owned_players:
                if pname in live_statuses and live_statuses[pname] not in ("my_bid",):
                    live_statuses[pname] = "owned"
        else:
            st.caption("No live auction data available for this year.")

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

    # Replacement-level predictions (static — use full board)
    repl_df = pd.DataFrame()
    if pricing_model:
        repl_df = calc_replacement_prices(
            full_board_df, pricing_model["conference_budgets"],
            pricing_model.get("copy_discount_curve", {}),
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
            row_data = {"Photo": player.get("HeadshotURL", "")}
            if show_all_years:
                row_data["Year"] = int(player["DraftYear"]) if pd.notna(player.get("DraftYear")) else ""
            row_data.update({
                "Player": name,
                "Pos": position_badge_url(player["Position"]),
                "School": college_logo_url(player.get("College", "")),
                "ADP": round(player.get("StartupADP"), 2) if pd.notna(player.get("StartupADP")) else "",
                "Stars": f"{'★' * int(player['Rating'])}{'☆' * (5 - int(player['Rating']))}" if pd.notna(player.get("Rating")) else "",
                "Current": f"${current_prices[name]:.0f}" if name in current_prices else "",
                "Multi-Feature": f"${gb_prices[name]:.0f}" if name in gb_prices else "",
            })

            # Replacement column: Live or Static
            if repl_mode == "Live" and live_prices:
                price = live_prices.get(name, 0)
                status = live_statuses.get(name, "available")
                bd = live_breakdowns.get(name, {})
                if status == "taken":
                    row_data["Replacement"] = "TAKEN"
                elif status == "owned":
                    row_data["Replacement"] = "OWNED"
                elif price > 0:
                    row_data["Replacement"] = f"${price:.0f}"
                else:
                    row_data["Replacement"] = "$0"
                # Breakdown columns (Live mode only)
                row_data["VAR"] = round(bd.get("var", 0), 2)
                row_data["Pool%"] = f"{bd.get('pool_pct', 0)}%"
                row_data["Share"] = f"${bd.get('total_share', 0):.0f}" if bd.get("total_share") else ""
                row_data["Copies"] = bd.get("copies", "")
                row_data["Cap"] = f"${bd.get('cap', 0):.0f}" if bd.get("cap") else ""
                row_data["_status"] = status
            else:
                row_data["Replacement"] = f"${replacement_prices[name]:.0f}" if name in replacement_prices else ""
                row_data["_status"] = "available"

            rows.append(row_data)

        comparison_df = pd.DataFrame(rows)

        # Prepare display dataframe (drop internal columns)
        status_map = comparison_df.set_index("Player")["_status"].to_dict() if "_status" in comparison_df.columns else {}
        display_df = comparison_df.drop(columns=["_status"], errors="ignore")

        col_config = {}
        if "Photo" in display_df.columns:
            col_config["Photo"] = st.column_config.ImageColumn("", width="small")
        if "Pos" in display_df.columns:
            col_config["Pos"] = st.column_config.ImageColumn("Pos", width="small")
        if "School" in display_df.columns:
            col_config["School"] = st.column_config.ImageColumn("", width="small")

        # Apply per-cell styling for Live mode
        if repl_mode == "Live" and live_prices and not display_df.empty:
            def _style_row(row):
                """Apply color to the Replacement cell based on auction status.

                Colors:
                - Green (#2D7A4E): you are the current high bidder
                - Yellow (#C9A227): player on the board (active auction)
                - Blue (#5B9BD5): you already own a copy (can't acquire again)
                - Grey (#6A6A6A): both copies taken in this conference
                - Red (#e74c3c): price exceeds your remaining budget
                """
                styles = [""] * len(row)
                player = row.get("Player", "")
                status = status_map.get(player, "available")
                repl_idx = row.index.get_loc("Replacement") if "Replacement" in row.index else None
                if repl_idx is not None:
                    if status == "my_bid":
                        styles[repl_idx] = "color: #2D7A4E; font-weight: 600"
                    elif status == "owned":
                        styles[repl_idx] = "color: #5B9BD5; font-weight: 600"
                    elif status == "on_board":
                        styles[repl_idx] = "color: #C9A227; font-weight: 600"
                    elif status == "taken":
                        styles[repl_idx] = "color: #6A6A6A; font-weight: 600"
                    else:
                        # Check budget warning
                        val = str(row.get("Replacement", ""))
                        if franchise_remaining_budget is not None and val.startswith("$"):
                            try:
                                price_num = float(val.replace("$", "").replace(",", ""))
                                if price_num > franchise_remaining_budget:
                                    styles[repl_idx] = "color: #e74c3c; font-weight: 600"
                            except ValueError:
                                pass
                return styles

            styled = display_df.style.apply(_style_row, axis=1)
            st.dataframe(styled, column_config=col_config, hide_index=True, use_container_width=True, height=600)
        else:
            st.dataframe(display_df, column_config=col_config, hide_index=True, use_container_width=True, height=600)

    with col_right:
        # Model Performance Cards
        st.markdown("#### Model Details")

        with st.expander("Current (ADP Regression)", expanded=False):
            st.markdown(DESCRIPTIONS["adp_regression_detail"])
            st.markdown("---")
            if pricing_model and pricing_model.get("adp_regression"):
                regs = pricing_model["adp_regression"]
                for pos, reg in regs.items():
                    st.caption(f"{pos}: R\u00b2={reg['r2']:.3f}, n={reg['n']}")
            else:
                st.caption("No regression available")

        with st.expander("Multi-Feature (Gradient Boosting)", expanded=False):
            st.markdown(DESCRIPTIONS["gradient_boosting_detail"])
            st.markdown("---")
            if gb_metrics and "error" not in gb_metrics:
                st.metric("R\u00b2 (train)", f"{gb_metrics['r2']:.3f}")
                st.metric("MAE", f"${gb_metrics['mae']:.1f}")
                st.metric("CV MAE", f"${gb_metrics['cv_mae']:.1f} \u00b1 {gb_metrics['cv_mae_std']:.1f}")
                st.metric("Training Rows", gb_metrics["n_train"])
            else:
                st.caption(gb_metrics.get("error", "Not available") if gb_metrics else "Not available")

        with st.expander("Replacement-Level (VAR)", expanded=False):
            st.markdown(DESCRIPTIONS["replacement_level_detail"])
            st.markdown("---")
            st.caption("No training \u2014 arithmetic model")
            if pricing_model:
                st.metric("Budget (16-tm)", f"${pricing_model['conference_budgets'].get(16, 0):,.0f}")
                st.metric("Budget (20-tm)", f"${pricing_model['conference_budgets'].get(20, 0):,.0f}")

        with st.expander("Copy & Scarcity Pricing", expanded=False):
            st.markdown(DESCRIPTIONS["copy_scarcity_detail"])

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
            entry = {
                "Player": name,
                "Position": pos,
                "Current": current_prices[name],
                "Multi-Feature": gb_prices[name],
            }
            if show_all_years and not pos_row.empty:
                entry["Year"] = str(int(pos_row["DraftYear"].iloc[0])) if pd.notna(pos_row["DraftYear"].iloc[0]) else ""
            scatter_data.append(entry)

        if scatter_data:
            scatter_df = pd.DataFrame(scatter_data)
            pos_colors = {"QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#6A6A6A"}

            scatter_kwargs = dict(
                x="Current", y="Multi-Feature",
                color="Position", hover_name="Player",
                color_discrete_map=pos_colors,
            )
            if show_all_years and "Year" in scatter_df.columns:
                scatter_kwargs["symbol"] = "Year"

            fig = px.scatter(scatter_df, **scatter_kwargs)
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


