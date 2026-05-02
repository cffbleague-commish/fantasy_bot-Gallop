"""
Shared UI components for the Streamlit dashboard.
Player cards, team logos, position badges, and custom CSS.
"""

import streamlit as st

from models.config import COLORS


def inject_custom_css():
    """Inject custom CSS matching the existing webapp dark theme."""
    st.markdown("""
    <style>
    /* Position badges */
    .pos-qb { color: #e74c3c; font-weight: 700; }
    .pos-rb { color: #3498db; font-weight: 700; }
    .pos-wr { color: #2ecc71; font-weight: 700; }
    .pos-te { color: #e67e22; font-weight: 700; }

    /* Grade colors */
    .grade-a { color: #2ecc71; font-weight: 700; }
    .grade-b { color: #f1c40f; font-weight: 700; }
    .grade-c { color: #e67e22; font-weight: 700; }
    .grade-d, .grade-f { color: #e74c3c; font-weight: 700; }

    /* Star colors */
    .stars { color: #f5c518; font-size: 1.1em; letter-spacing: 1px; }
    .stars-dim { color: #555; }

    /* Need indicators */
    .need-high { color: #e74c3c; font-weight: 700; }
    .need-moderate { color: #f1c40f; font-weight: 700; }
    .need-low { color: #2ecc71; font-weight: 700; }

    /* Metric cards */
    .metric-card {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
    }
    .metric-card h3 {
        color: #d4a843;
        margin: 0 0 8px 0;
        font-size: 0.85em;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .metric-card .value {
        font-size: 1.8em;
        font-weight: 700;
        color: #f0f0ed;
    }

    /* Player card */
    .player-card {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
    }
    .player-card img {
        border-radius: 50%;
        width: 48px;
        height: 48px;
        object-fit: cover;
    }
    .player-card .info {
        flex: 1;
    }
    .player-card .name {
        font-weight: 700;
        font-size: 1.05em;
        color: #f0f0ed;
    }
    .player-card .details {
        color: #999;
        font-size: 0.85em;
    }
    .player-card .price {
        font-weight: 700;
        font-size: 1.2em;
        color: #d4a843;
    }

    /* Table tweaks */
    .stDataFrame { font-size: 0.9em; }
    </style>
    """, unsafe_allow_html=True)


def position_badge(position: str) -> str:
    """Return colored HTML span for a position."""
    color = COLORS["positions"].get(position, "#999")
    return f'<span style="color:{color}; font-weight:700;">{position}</span>'


def star_html(stars: int) -> str:
    """Return HTML star display."""
    filled = '<span class="stars">\u2605</span>' * stars
    empty = '<span class="stars-dim">\u2606</span>' * (5 - stars)
    return filled + empty


def grade_badge(grade: str) -> str:
    """Return colored HTML span for a letter grade."""
    if not grade or grade == "N/A":
        return '<span style="color:#666;">N/A</span>'
    letter = grade[0].upper()
    color = COLORS["grades"].get(letter, "#999")
    return f'<span style="color:{color}; font-weight:700;">{grade}</span>'


def need_indicator(level: str) -> str:
    """Return colored need level indicator."""
    colors = {"high": "#e74c3c", "moderate": "#f1c40f", "low": "#2ecc71"}
    labels = {"high": "HIGH", "moderate": "MOD", "low": "OK"}
    color = colors.get(level, "#999")
    label = labels.get(level, level)
    return f'<span style="color:{color}; font-weight:700;">{label}</span>'


def metric_card(title: str, value: str, delta: str = None):
    """Render a styled metric card."""
    delta_html = ""
    if delta:
        color = "#2ecc71" if delta.startswith("+") else "#e74c3c"
        delta_html = f'<div style="color:{color}; font-size:0.85em;">{delta}</div>'

    st.markdown(f"""
    <div class="metric-card">
        <h3>{title}</h3>
        <div class="value">{value}</div>
        {delta_html}
    </div>
    """, unsafe_allow_html=True)


def render_player_card(
    name: str, position: str, college: str, stars: int,
    predicted_cost: float = None, headshot_url: str = "",
):
    """Render a compact player card with headshot."""
    img_html = ""
    if headshot_url:
        img_html = f'<img src="{headshot_url}" alt="{name}" onerror="this.style.display=\'none\'">'
    else:
        img_html = '<div style="width:48px;height:48px;background:#333;border-radius:50%;"></div>'

    price_html = f'${predicted_cost:.0f}' if predicted_cost is not None else "—"
    pos_html = position_badge(position)
    stars_html = star_html(stars)

    st.markdown(f"""
    <div class="player-card">
        {img_html}
        <div class="info">
            <div class="name">{name}</div>
            <div class="details">{pos_html} &middot; {college} &middot; {stars_html}</div>
        </div>
        <div class="price">{price_html}</div>
    </div>
    """, unsafe_allow_html=True)
