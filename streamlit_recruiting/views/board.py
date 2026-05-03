"""
Recruiting Board tab — simplified table with click-to-expand player profiles.
"""

import streamlit as st
import pandas as pd

from data.sheets import load_recruiting_board, load_auction_data, load_dlf_adp, load_espn_prospects
from models.current_model import build_pricing_model
from models.gradient_boosting import train_gradient_boosting, predict_gb
from models.replacement_level import calc_replacement_prices
from models.config import COLORS


def render_board_tab(year: int, position_filter: str, conference_filter: str):
    """Render the Recruiting Board tab."""
    df = load_recruiting_board(year)

    if df.empty:
        st.info(f"No recruiting board data available for {year}.")
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

    st.markdown(f"### {year} Recruiting Board ({len(df)} players)")

    # Search
    search = st.text_input("Search players", placeholder="Player name or college...", key="board_search")
    filtered_df = df
    if search:
        mask = (
            df["Player"].str.contains(search, case=False, na=False) |
            df["College"].str.contains(search, case=False, na=False)
        )
        filtered_df = df[mask]

    # Player selector for detail view
    player_names = ["-- Select a player for detail view --"] + filtered_df["Player"].tolist()
    selected_player = st.selectbox(
        "Player Detail",
        player_names,
        key="board_player_select",
        label_visibility="collapsed",
    )

    # Expanded player profile
    if selected_player != "-- Select a player for detail view --":
        _render_player_detail(selected_player, df, year)
        st.markdown("---")

    # Simplified table
    display_cols = {
        "Rank": "#",
        "StarsDisplay": "Stars",
        "Player": "Player",
        "Position": "Pos",
        "College": "College",
        "RecruitScore": "Score",
        "PredictedCost": "Predicted",
    }

    available = [c for c in display_cols if c in filtered_df.columns]
    display_df = filtered_df[available].copy()
    display_df.rename(columns={k: v for k, v in display_cols.items() if k in available}, inplace=True)

    if "Score" in display_df.columns:
        display_df["Score"] = display_df["Score"].apply(
            lambda x: f"{x:.1f}" if pd.notna(x) else ""
        )
    if "Predicted" in display_df.columns:
        display_df["Predicted"] = display_df["Predicted"].apply(
            lambda x: f"${x:.0f}" if pd.notna(x) else ""
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


def _render_player_detail(player_name: str, board_df: pd.DataFrame, year: int):
    """Render the expanded player detail profile with all 3 model prices."""
    player_row = board_df[board_df["Player"] == player_name]
    if player_row.empty:
        return

    p = player_row.iloc[0]

    # Player header
    col_img, col_info = st.columns([1, 4])

    with col_img:
        headshot = p.get("HeadshotURL", "")
        if headshot and str(headshot).startswith("http"):
            st.image(headshot, width=120)
        else:
            st.markdown(
                '<div style="width:120px;height:120px;background:#333;border-radius:8px;'
                'display:flex;align-items:center;justify-content:center;color:#666;'
                'font-size:2em;">?</div>',
                unsafe_allow_html=True,
            )

    with col_info:
        stars = int(p.get("Rating", 1) or 1)
        star_str = "\u2605" * stars + "\u2606" * (5 - stars)
        st.markdown(f"### {player_name}")
        st.markdown(
            f"**{p.get('Position', '')}** | {p.get('College', '')} | "
            f'<span style="color:#f5c518;">{star_str}</span>',
            unsafe_allow_html=True,
        )

    # Key stats row
    stat_cols = st.columns(6)
    stat_cols[0].metric(
        "Recruit Score",
        f"{p.get('RecruitScore', 0):.1f}" if pd.notna(p.get("RecruitScore")) else "N/A",
    )
    stat_cols[1].metric(
        "ESPN Grade",
        f"{p.get('ESPNGrade', 0):.0f}" if pd.notna(p.get("ESPNGrade")) else "N/A",
    )

    draft_str = f"Rd {p.get('DraftRd', '')}" if p.get("DraftRd") else "N/A"
    if pd.notna(p.get("OverallPick")):
        draft_str += f", Pick {int(p['OverallPick'])}"
    stat_cols[2].metric("Draft", draft_str)

    stat_cols[3].metric(
        "Startup ADP",
        f"{int(p['StartupADP'])}" if pd.notna(p.get("StartupADP")) else "N/A",
    )
    stat_cols[4].metric("ADP Tier", p.get("ADPTier", "N/A") or "N/A")
    stat_cols[5].metric(
        "Class Rank",
        f"#{int(p.get('Rank', 0))}" if p.get("Rank") else "N/A",
    )

    # Additional stats
    extra_cols = st.columns(4)
    extra_cols[0].metric(
        "ESPN Rank",
        f"#{int(p['ESPNRank'])}" if pd.notna(p.get("ESPNRank")) else "N/A",
    )
    extra_cols[1].metric(
        "Pos Rank",
        f"#{int(p['PosRank'])}" if pd.notna(p.get("PosRank")) else "N/A",
    )
    extra_cols[2].metric("Price Source", p.get("PriceSource", "N/A") or "N/A")
    extra_cols[3].metric("Confidence", p.get("ConfidenceLabel", "N/A") or "N/A")

    # Three model prices
    st.markdown("#### Price Estimates")

    current_price = p.get("PredictedCost")
    gb_price = _get_gb_price(p)
    repl_price = _get_replacement_price(player_name, year)

    price_cols = st.columns(3)
    with price_cols[0]:
        st.markdown("**Current (ADP Regression)**")
        if pd.notna(current_price):
            st.markdown(
                f'<span style="font-size:1.5em;font-weight:700;color:{COLORS["accent"]};">'
                f"${current_price:.0f}</span>",
                unsafe_allow_html=True,
            )
        else:
            st.caption("N/A")

    with price_cols[1]:
        st.markdown("**Multi-Feature (Gradient Boosting)**")
        if gb_price is not None:
            st.markdown(
                f'<span style="font-size:1.5em;font-weight:700;color:{COLORS["accent"]};">'
                f"${gb_price:.0f}</span>",
                unsafe_allow_html=True,
            )
        else:
            st.caption("N/A")

    with price_cols[2]:
        st.markdown("**Replacement-Level (VAR)**")
        if repl_price is not None:
            st.markdown(
                f'<span style="font-size:1.5em;font-weight:700;color:{COLORS["accent"]};">'
                f"${repl_price:.0f}</span>",
                unsafe_allow_html=True,
            )
        else:
            st.caption("N/A")


@st.cache_data(ttl=300)
def _train_gb_model():
    """Cache the trained GB model."""
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()
    if auction_df.empty:
        return None
    model, _ = train_gradient_boosting(auction_df, adp_df, espn_df)
    return model


def _get_gb_price(player_row):
    """Get gradient boosting prediction for a single player."""
    model = _train_gb_model()
    if model is None:
        return None
    return predict_gb(
        model,
        player_row.get("Position", ""),
        player_row.get("StartupADP"),
        player_row.get("ESPNGrade"),
        player_row.get("OverallPick"),
        copy_number=1,
    )


@st.cache_data(ttl=300)
def _build_replacement_lookup(year: int) -> dict:
    """Cache replacement-level prices for the full board."""
    board_df = load_recruiting_board(year)
    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    if board_df.empty or auction_df.empty:
        return {}

    pricing_model = build_pricing_model(auction_df, adp_df, espn_df)
    if not pricing_model:
        return {}

    repl_df = calc_replacement_prices(
        board_df,
        pricing_model["conference_budgets"],
        pricing_model.get("copy_discount_curve", {}),
    )

    lookup = {}
    if not repl_df.empty:
        for _, row in repl_df.iterrows():
            lookup[row["Player"]] = row.get("copy1_16", 0)
    return lookup


def _get_replacement_price(player_name: str, year: int):
    """Get replacement-level price for a single player."""
    lookup = _build_replacement_lookup(year)
    return lookup.get(player_name)
