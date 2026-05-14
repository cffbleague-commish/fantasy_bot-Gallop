"""
CFFB Design System — Canonical Components
Every visual component used across tabs. Returns HTML strings for injection
via st.markdown(..., unsafe_allow_html=True). CSS lives in styles.py.
"""

import streamlit as st
import math
import requests


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _html(html: str):
    """Render raw HTML via Streamlit."""
    st.markdown(html, unsafe_allow_html=True)


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_image_bytes(url: str) -> bytes | None:
    """Fetch an external image server-side and return raw bytes.

    Bypasses hotlink protection (e.g. ESPN's CDN) by making the request
    from the server. Use with st.image(bytes) — st.markdown strips data:
    URIs so base64 embedding doesn't work.
    """
    _HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        resp = requests.get(url, timeout=10, headers=_HEADERS, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 100:
            return resp.content
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Team logo URL builders
# ---------------------------------------------------------------------------

# ESPN college football team IDs — maps college name → ESPN numeric ID.
# Used to construct CDN URLs: https://a.espncdn.com/i/teamlogos/ncaa/500/{id}.png
_COLLEGE_ESPN_IDS: dict[str, int] = {
    # SEC
    "Alabama": 333, "Auburn": 2, "Arkansas": 8, "Florida": 57,
    "Georgia": 61, "Kentucky": 96, "LSU": 99, "Mississippi State": 344,
    "Missouri": 142, "Ole Miss": 145, "South Carolina": 2579,
    "Tennessee": 2633, "Texas": 251, "Texas A&M": 245,
    "Oklahoma": 201, "Vanderbilt": 238,
    # Big Ten
    "Illinois": 356, "Indiana": 84, "Iowa": 2294, "Maryland": 120,
    "Michigan": 130, "Michigan State": 127, "Minnesota": 135,
    "Nebraska": 158, "Northwestern": 77, "Ohio State": 194,
    "Oregon": 2483, "Penn State": 213, "Purdue": 2509,
    "Rutgers": 164, "UCLA": 26, "USC": 30, "Washington": 264,
    "Wisconsin": 275,
    # ACC
    "Boston College": 103, "Clemson": 228, "Duke": 150,
    "Florida State": 52, "Georgia Tech": 59, "Louisville": 97,
    "Miami": 2390, "NC State": 152, "North Carolina": 153,
    "Notre Dame": 87, "Pittsburgh": 221, "SMU": 2567,
    "Stanford": 24, "Syracuse": 183, "Virginia": 258,
    "Virginia Tech": 259, "Wake Forest": 154, "California": 25,
    # Big 12
    "Arizona": 12, "Arizona State": 9, "Baylor": 239, "BYU": 252,
    "Cincinnati": 2132, "Colorado": 38, "Houston": 248,
    "Iowa State": 66, "Kansas": 2305, "Kansas State": 2306,
    "Oklahoma State": 197, "TCU": 2628, "Texas Tech": 2641,
    "UCF": 2116, "Utah": 254, "West Virginia": 277,
    # Group of 5 / Independents
    "Boise State": 68, "Memphis": 235, "Tulane": 2655,
    "San Diego State": 21, "Fresno State": 278, "App State": 2026,
    "Coastal Carolina": 324, "Liberty": 2335, "Army": 349,
    "Navy": 2426, "Marshall": 276, "Western Kentucky": 98,
    "James Madison": 256, "Troy": 2653, "Louisiana": 309,
    "South Alabama": 6, "UTSA": 2636, "UAB": 5,
    "East Carolina": 151, "FAU": 2229, "Charlotte": 2429,
    "Temple": 218, "Tulsa": 202, "Rice": 242,
    "North Texas": 249, "Southern Miss": 2572, "Old Dominion": 295,
    "Middle Tennessee": 2393, "UNLV": 2439, "Wyoming": 2704,
    "Colorado State": 36, "Air Force": 2005, "Nevada": 2440,
    "Hawaii": 62, "New Mexico": 167, "New Mexico State": 166,
    "Sam Houston": 2534, "Jacksonville State": 55,
    "Kennesaw State": 338, "UConn": 41, "UMass": 113,
    "FIU": 2229, "UTEP": 2638, "Akron": 2006, "Ball State": 2050,
    "Bowling Green": 189, "Buffalo": 2084, "Central Michigan": 2117,
    "Eastern Michigan": 2199, "Kent State": 2309, "Miami (OH)": 193,
    "Northern Illinois": 2459, "Ohio": 195, "Toledo": 2649,
    "Western Michigan": 2711,
}

# Build a case-insensitive lookup (lowercased keys)
_COLLEGE_ID_LOOKUP: dict[str, int] = {k.lower(): v for k, v in _COLLEGE_ESPN_IDS.items()}

# Common alternate spellings / abbreviations
_COLLEGE_ALIASES: dict[str, str] = {
    "miss": "ole miss", "mississippi": "ole miss",
    "usc trojans": "usc", "southern california": "usc",
    "lsu tigers": "lsu", "tcu horned frogs": "tcu",
    "smu mustangs": "smu", "ucf knights": "ucf",
    "byu cougars": "byu", "fau owls": "fau",
    "fiu panthers": "fiu", "uab blazers": "uab",
    "utsa roadrunners": "utsa", "utep miners": "utep",
    "unlv rebels": "unlv",
    "appalachian state": "app state",
    "western kentucky": "western kentucky",
    "texas a&m aggies": "texas a&m",
    "penn st": "penn state", "ohio st": "ohio state",
    "michigan st": "michigan state", "miss state": "mississippi state",
    "mississippi st": "mississippi state",
    "florida st": "florida state", "oregon st": "oregon state",
    "oklahoma st": "oklahoma state", "iowa st": "iowa state",
    "kansas st": "kansas state", "boise st": "boise state",
    "san diego st": "san diego state", "fresno st": "fresno state",
    "colorado st": "colorado state", "n.c. state": "nc state",
    "n carolina": "north carolina", "unc": "north carolina",
    "pitt": "pittsburgh", "cal": "california",
    "ga tech": "georgia tech", "vt": "virginia tech",
    "bc": "boston college", "wvu": "west virginia",
    "osu": "ohio state", "msu": "michigan state",
    "tamu": "texas a&m", "a&m": "texas a&m",
}


def college_logo_url(college_name: str) -> str:
    """Return ESPN CDN logo URL for a college, or empty string if unknown."""
    if not college_name:
        return ""
    key = str(college_name).strip().lower()
    # Check direct match
    team_id = _COLLEGE_ID_LOOKUP.get(key)
    # Check aliases
    if team_id is None:
        alias = _COLLEGE_ALIASES.get(key)
        if alias:
            team_id = _COLLEGE_ID_LOOKUP.get(alias)
    if team_id is None:
        return ""
    return f"https://a.espncdn.com/i/teamlogos/ncaa/500/{team_id}.png"


def nfl_logo_url(nfl_team: str) -> str:
    """Return ESPN CDN logo URL for an NFL team abbreviation, or empty string."""
    if not nfl_team:
        return ""
    abbr = str(nfl_team).strip().lower()
    if not abbr or abbr == "nan":
        return ""
    return f"https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png"


# Position badge colors (saturated, on dark bg)
_POS_COLORS = {
    "QB": "#C9A227",  # Gold
    "RB": "#3B82C4",  # Deep blue
    "WR": "#7BA4C9",  # Light blue
    "TE": "#6A6A6A",  # Neutral
}


def position_badge_url(position: str) -> str:
    """Return an inline SVG data URI for a position badge.

    Renders as a small rounded pill with the position's color, suitable
    for use with st.column_config.ImageColumn.
    """
    from urllib.parse import quote
    pos = str(position).strip().upper() if position else ""
    if not pos:
        return ""
    color = _POS_COLORS.get(pos, "#6A6A6A")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="42" height="22">'
        f'<rect width="42" height="22" rx="6" fill="{color}"/>'
        f'<text x="21" y="15.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" '
        f'font-size="11" font-weight="700" fill="#fff">{pos}</text>'
        f'</svg>'
    )
    return f"data:image/svg+xml,{quote(svg)}"

# Star tier CSS modifier classes
_STAR_TIERS = {5: "t5", 4: "t4", 3: "t3", 2: "t2", 1: "t1"}

# Conference CSS modifier lookup (maps conference codes to CSS class suffixes)
_CONF_CSS = {
    "SEC": "sec", "B1G": "b1g", "B10": "b10", "ACC": "acc",
    "Big 12": "big12", "B12": "b12", "Pac-12": "pac", "P12": "p12",
    "AAC": "aac", "MW": "mw", "IND": "ind",
}

# Conference display names
_CONF_DISPLAY = {
    "SEC": "SEC", "B1G": "Big Ten", "B10": "Big Ten", "ACC": "ACC",
    "Big 12": "Big 12", "B12": "Big 12", "Pac-12": "Pac-12", "P12": "Pac-12",
    "AAC": "AAC", "MW": "Mtn West", "IND": "Indep.",
}

# Grade → CSS modifier
_GRADE_CSS = {
    "A+": "a", "A": "a", "A-": "a",
    "B+": "b", "B": "b", "B-": "b",
    "C+": "c", "C": "c", "C-": "c",
    "D+": "d", "D": "d", "D-": "d",
    "F": "f",
}


# ---------------------------------------------------------------------------
# 1. Star Rating
# ---------------------------------------------------------------------------

def render_star_rating(stars: float) -> str:
    """Render 1-5 star display with half-star support and tier coloring.

    Args:
        stars: Rating value (e.g. 4.5, 3.0). Clamped to 1-5.

    Returns:
        HTML string with star icons colored by tier.
    """
    stars = max(1, min(5, stars))
    tier_int = math.ceil(stars)
    tier_class = _STAR_TIERS.get(tier_int, "t2")

    icons = []
    for i in range(1, 6):
        if i <= int(stars):
            fill = "100%"
        elif i == int(stars) + 1 and stars % 1 >= 0.5:
            fill = "50%"
        else:
            fill = "0%"
        icons.append(f'<span class="cffb-stars__icon" style="--fill:{fill}"></span>')

    return (
        f'<div class="cffb-stars cffb-stars--{tier_class}">'
        f'{"".join(icons)}'
        f'<span class="cffb-stars__num">{stars:.1f}</span>'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# 2. Player Card (compact)
# ---------------------------------------------------------------------------

def render_player_card_compact(
    name: str,
    position: str,
    college: str,
    stars: int,
    predicted_cost: float | None = None,
    delta: float | None = None,
    headshot_url: str = "",
    college_abbrev: str = "",
) -> str:
    """Render a compact player card row.

    Returns HTML string. Includes team chip, position badge, name,
    stars, bid amount, and optional value delta.
    """
    # Team chip
    abbrev = college_abbrev or (college[:3].upper() if college else "???")
    pos_color = _POS_COLORS.get(position, "#6A6A6A")
    team_html = (
        f'<div class="cffb-pc-c__team" style="background:{pos_color}; color:#fff;">'
        f'{abbrev}</div>'
    )

    # Position badge
    pos_html = f'<div class="cffb-pc-c__pos" style="background:{pos_color};">{position}</div>'

    # Stars
    star_color = {5: "#C9A227", 4: "#3B82C4", 3: "#7BA4C9"}.get(stars, "#6A6A6A")
    stars_html = "".join(
        f'<span class="cffb-pc-c__star" style="color:{star_color};">\u2605</span>'
        if i < stars else
        f'<span class="cffb-pc-c__star cffb-pc-c__star--off">\u2605</span>'
        for i in range(5)
    )

    # Bid amount
    bid_str = f"${predicted_cost:.0f}" if predicted_cost is not None else "\u2014"
    bid_html = f'<div class="cffb-pc-c__bid">{bid_str}</div>'

    # Delta
    delta_html = ""
    if delta is not None and delta != 0:
        cls = "cffb-pc-c__delta--pos" if delta > 0 else "cffb-pc-c__delta--neg"
        arrow = "\u25B2" if delta > 0 else "\u25BC"
        sign = "+" if delta > 0 else "\u2212"
        delta_html = (
            f'<div class="cffb-pc-c__delta {cls}">'
            f'{arrow} {sign}${abs(delta):.0f}</div>'
        )
    elif delta is not None:
        delta_html = '<div class="cffb-pc-c__delta" style="color:#5A5A5A;">\u00B1$0</div>'

    return (
        f'<div class="cffb-pc-c">'
        f'{team_html}'
        f'{pos_html}'
        f'<div>'
        f'  <div class="cffb-pc-c__name">{_esc(name)}</div>'
        f'  <div class="cffb-pc-c__meta">{_esc(college)}</div>'
        f'</div>'
        f'<div class="cffb-pc-c__stars">{stars_html}</div>'
        f'{bid_html}'
        f'{delta_html}'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# 3. Player Card (expanded) — for modal headers
# ---------------------------------------------------------------------------

def render_player_card_expanded(
    name: str,
    position: str,
    college: str,
    stars: int,
    headshot_url: str = "",
    conference: str = "",
    facts: list[dict] | None = None,
) -> str:
    """Render an expanded player identity card for modal headers.

    Args:
        facts: List of dicts with keys 'label', 'value', and optional 'hero' bool.

    Returns HTML string.
    """
    pos_color = _POS_COLORS.get(position, "#6A6A6A")

    # Photo slot — when headshot_url is None, skip photo entirely
    # (caller renders headshot separately via st.image for external URLs)
    skip_photo = headshot_url is None
    if not skip_photo:
        if headshot_url and str(headshot_url).startswith("http"):
            photo_inner = f'<img src="{headshot_url}" alt="{_esc(name)}" onerror="this.style.display=\'none\'">'
        else:
            photo_inner = (
                '<div class="cffb-pc-e__photo-empty">'
                '<svg viewBox="0 0 56 56" style="width:56px;height:56px;stroke:#3A3A3A;fill:none;stroke-width:1.5">'
                '<circle cx="28" cy="20" r="9"/>'
                '<path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50"/>'
                '</svg>'
                '</div>'
            )

    # Stars
    star_html = "".join(
        f'<span class="cffb-pc-e__star">\u2605</span>' if i < stars
        else f'<span class="cffb-pc-e__star" style="color:#2A2A2A;">\u2606</span>'
        for i in range(5)
    )

    # Conference badge
    conf_html = ""
    if conference:
        conf_css = _CONF_CSS.get(conference, "ind")
        conf_display = _CONF_DISPLAY.get(conference, conference)
        conf_html = f'<span class="cffb-conf cffb-conf--{conf_css}">{conf_display}</span>'

    # Facts grid
    facts_html = ""
    if facts:
        fact_items = ""
        for f in facts:
            hero_cls = " cffb-pc-e__fact-val--hero" if f.get("hero") else ""
            fact_items += (
                f'<div>'
                f'<div class="cffb-pc-e__fact-label">{_esc(f["label"])}</div>'
                f'<div class="cffb-pc-e__fact-val{hero_cls}">{_esc(str(f["value"]))}</div>'
                f'</div>'
            )
        facts_html = f'<div class="cffb-pc-e__facts">{fact_items}</div>'

    # College logo inline
    college_logo = college_logo_url(college) if college else ""
    college_logo_html = (
        f'<img src="{college_logo}" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;" '
        f'onerror="this.style.display=\'none\'">'
    ) if college_logo else ""

    photo_section = ""
    if not skip_photo:
        photo_section = (
            f'  <div class="cffb-pc-e__photo">'
            f'    <div class="cffb-pc-e__photo-bar" style="background:{pos_color};"></div>'
            f'    {photo_inner}'
            f'  </div>'
        )

    return (
        f'<div class="cffb-pc-e">'
        f'  {photo_section}'
        f'  <div class="cffb-pc-e__id">'
        f'    <div class="cffb-pc-e__tagrow">'
        f'      <span class="cffb-pc-e__pos" style="background:{pos_color};">{position}</span>'
        f'      {conf_html}'
        f'    </div>'
        f'    <div class="cffb-pc-e__name">{_esc(name)}</div>'
        f'    <div class="cffb-pc-e__meta">{college_logo_html}{_esc(college)}</div>'
        f'    <div class="cffb-pc-e__stars">{star_html}</div>'
        f'    {facts_html}'
        f'  </div>'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# 4. Team Logo / Chip
# ---------------------------------------------------------------------------

def render_team_logo(
    abbreviation: str = "",
    conference: str = "",
    logo_url: str = "",
    size: str = "md",
) -> str:
    """Render a team logo image or circular fallback chip.

    Args:
        size: "sm", "md", or "lg"
    """
    if logo_url and str(logo_url).startswith("http"):
        img_height = "30px" if size == "sm" else "48px" if size == "md" else "60px"
        return (
            f'<img src="{logo_url}" alt="{_esc(abbreviation)}" '
            f'style="height:{img_height};'
            f'border-radius:50%;object-fit:cover;" '
            f'onerror="this.style.display=\'none\'">'
        )

    # Fallback: conference-colored chip
    conf_colors = {
        "SEC": ("#1A3668", "#FFC72A"), "B1G": ("#0088CE", "#fff"), "B10": ("#0088CE", "#fff"),
        "ACC": ("#013CA6", "#fff"), "Big 12": ("#E81E2C", "#fff"), "B12": ("#E81E2C", "#fff"),
        "Pac-12": ("#003F87", "#fff"), "P12": ("#003F87", "#fff"),
        "AAC": ("#002855", "#fff"), "MW": ("#8B6F1F", "#fff"),
    }
    bg, fg = conf_colors.get(conference, ("#1C1C1C", "#9A9A9A"))
    return (
        f'<span class="cffb-team-chip cffb-team-chip--{size}" '
        f'style="background:{bg}; color:{fg};">{_esc(abbreviation[:4])}</span>'
    )


# ---------------------------------------------------------------------------
# 5. Grade Badge
# ---------------------------------------------------------------------------

def render_grade_badge(grade: str, size: str = "md") -> str:
    """Render a letter grade pill (A+, A, B+, B, C, D, F).

    Args:
        grade: Letter grade string.
        size: "sm", "md", or "lg".
    """
    if not grade or grade in ("N/A", ""):
        return '<span style="color:#5A5A5A;">N/A</span>'

    grade_upper = grade.upper().strip()
    # Map to CSS class
    css_key = grade_upper
    if css_key not in _GRADE_CSS:
        # Try first letter
        css_key = grade_upper[0] if grade_upper else "F"
    mod = _GRADE_CSS.get(css_key, "d")

    return (
        f'<span class="cffb-grade cffb-grade--{size} cffb-grade--{mod}">'
        f'{_esc(grade_upper)}</span>'
    )


# ---------------------------------------------------------------------------
# 6. Value Delta
# ---------------------------------------------------------------------------

def render_value_delta(delta: float, size: str = "md") -> str:
    """Render a dollar value delta with directional arrow.

    Args:
        delta: Dollar difference (positive = under-paid/good, negative = over-paid).
        size: "sm", "md", or "lg".
    """
    if delta > 0:
        cls = "cffb-delta--pos"
        arrow = "\u25B2"
        text = f"+${delta:.0f}"
    elif delta < 0:
        cls = "cffb-delta--neg"
        arrow = "\u25BC"
        text = f"\u2212${abs(delta):.0f}"
    else:
        cls = "cffb-delta--flat"
        arrow = ""
        text = "\u00B1$0"

    arrow_html = f'<span class="cffb-delta__arrow">{arrow}</span>' if arrow else ""
    return (
        f'<span class="cffb-delta cffb-delta--{size} {cls}">'
        f'{arrow_html}{text}</span>'
    )


# ---------------------------------------------------------------------------
# 7. Commit Composition Bar
# ---------------------------------------------------------------------------

def render_commit_composition_bar(stars: dict, show_legend: bool = True) -> str:
    """Render a horizontal stacked bar showing class composition by star tier.

    Args:
        stars: Dict mapping star tier (int 5,4,3,2) to count.
        show_legend: Whether to show the legend below the bar.
    """
    total = sum(stars.values())
    if total == 0:
        return '<div style="color:#5A5A5A;">No commits</div>'

    segments = ""
    for tier in [5, 4, 3, 2]:
        count = stars.get(tier, 0)
        if count > 0:
            label = str(count) if count > 0 else ""
            segments += (
                f'<div class="cffb-cc__seg cffb-cc__seg--{tier}" '
                f'style="flex:{count}">{label}</div>'
            )

    legend_html = ""
    if show_legend:
        tier_colors = {5: "#C9A227", 4: "#3B82C4", 3: "#7BA4C9", 2: "#6A6A6A"}
        items = ""
        for tier in [5, 4, 3, 2]:
            count = stars.get(tier, 0)
            if count > 0:
                items += (
                    f'<span class="cffb-cc__legend-item">'
                    f'<span class="cffb-cc__dot" style="background:{tier_colors[tier]}"></span>'
                    f'{tier}\u2605 \u00B7 {count}</span>'
                )
        legend_html = f'<div class="cffb-cc__legend">{items}</div>'

    return (
        f'<div class="cffb-cc">'
        f'  <div class="cffb-cc__header">'
        f'    <span class="cffb-cc__label">Class Composition</span>'
        f'    <span class="cffb-cc__total">{total} commits</span>'
        f'  </div>'
        f'  <div class="cffb-cc__bar">{segments}</div>'
        f'  {legend_html}'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# 8. Rank Badge
# ---------------------------------------------------------------------------

def render_rank_badge(rank: int, size: str = "md") -> str:
    """Render a numeric rank pill. Top 3 use gold gradient, 4-25 flat gold, 26+ neutral.

    Args:
        rank: Numeric rank (1-based).
        size: "sm", "md", or "lg".
    """
    if rank <= 3:
        tier = "top"
    elif rank <= 25:
        tier = "mid"
    else:
        tier = "low"

    return (
        f'<span class="cffb-rank cffb-rank--{size} cffb-rank--{tier}">'
        f'#{rank}</span>'
    )


# ---------------------------------------------------------------------------
# 9. Conference Badge
# ---------------------------------------------------------------------------

def render_conference_badge(conf: str) -> str:
    """Render a conference abbreviation pill with conference-specific accent color."""
    if not conf or conf in ("", "N/A"):
        return ""

    css = _CONF_CSS.get(conf, "ind")
    display = _CONF_DISPLAY.get(conf, conf)
    return f'<span class="cffb-conf cffb-conf--{css}">{_esc(display)}</span>'


# ---------------------------------------------------------------------------
# 10. Live Indicator
# ---------------------------------------------------------------------------

def render_live_indicator(label: str = "LIVE") -> str:
    """Render a pulsing green dot with rotating gold ring + label text.

    Use at most once per page — it's an attention magnet.
    """
    return (
        f'<div class="cffb-live">'
        f'  <div class="cffb-live__ring">'
        f'    <div class="cffb-live__inner">'
        f'      <div class="cffb-live__dot"></div>'
        f'    </div>'
        f'  </div>'
        f'  <span>{_esc(label)}</span>'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# 11. KPI Tile
# ---------------------------------------------------------------------------

def render_kpi_tile(
    label: str,
    value: str,
    sub: str | None = None,
    hero: bool = False,
    sub_type: str = "",
) -> str:
    """Render a single KPI metric tile.

    Args:
        label: Uppercase label above the value.
        value: The large display value.
        sub: Optional sub-text below the value.
        hero: If True, apply gold gradient to the value.
        sub_type: "pos", "neg", or "" for sub-value coloring.

    Returns HTML string for a single tile.
    """
    hero_cls = " cffb-kpi__value--hero" if hero else ""
    sub_html = ""
    if sub:
        sub_cls = f" cffb-kpi__sub--{sub_type}" if sub_type in ("pos", "neg") else ""
        sub_html = f'<div class="cffb-kpi__sub{sub_cls}">{_esc(sub)}</div>'

    return (
        f'<div class="cffb-kpi">'
        f'  <div class="cffb-kpi__label">{_esc(label)}</div>'
        f'  <div class="cffb-kpi__value{hero_cls}">{_esc(value)}</div>'
        f'  {sub_html}'
        f'</div>'
    )


def render_kpi_row(tiles: list[dict]):
    """Render a row of KPI tiles.

    Args:
        tiles: List of dicts with keys matching render_kpi_tile params:
               label, value, sub (optional), hero (optional), sub_type (optional).
    """
    inner = "".join(
        render_kpi_tile(
            label=t["label"],
            value=t["value"],
            sub=t.get("sub"),
            hero=t.get("hero", False),
            sub_type=t.get("sub_type", ""),
        )
        for t in tiles
    )
    _html(f'<div class="cffb-kpi__row">{inner}</div>')


# ---------------------------------------------------------------------------
# Plotly theme helper
# ---------------------------------------------------------------------------

def plotly_layout_defaults() -> dict:
    """Return standard Plotly layout kwargs matching the CFFB design system."""
    return {
        "template": "plotly_dark",
        "paper_bgcolor": "#0A0A0A",
        "plot_bgcolor": "#141414",
        "font": {"family": "Inter, system-ui, sans-serif", "color": "#F5F5F5"},
        "margin": {"l": 40, "r": 20, "t": 40, "b": 40},
    }


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    """Basic HTML escaping for user-supplied text."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
