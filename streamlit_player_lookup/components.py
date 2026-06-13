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


# Grade badge colors (bg, text) — mirrors CSS .cffb-grade--{mod}
_GRADE_COLORS = {
    "a": ("#C9A227", "#0A0A0A"),  # gold bg, dark text
    "b": ("#2D7A4E", "#F5F5F5"),  # green bg, light text
    "c": ("#C9A227", "#0A0A0A"),  # gold bg, dark text
    "d": ("#B84545", "#F5F5F5"),  # red bg, light text
    "f": ("#B84545", "#F5F5F5"),  # red bg, light text
}


def grade_badge_url(grade: str) -> str:
    """Return an inline SVG data URI for a letter-grade badge.

    Renders as a small rounded pill matching the design system grade colors,
    suitable for use with st.column_config.ImageColumn.
    """
    from urllib.parse import quote
    g = str(grade).strip().upper() if grade else ""
    if not g or g in ("N/A", "NAN"):
        return ""
    css_key = g if g in _GRADE_CSS else (g[0] if g else "F")
    mod = _GRADE_CSS.get(css_key, "d")
    bg, fg = _GRADE_COLORS.get(mod, ("#6A6A6A", "#F5F5F5"))
    # Wider pill for grades with + or - suffix
    w = 42 if len(g) <= 1 else 48
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="22">'
        f'<rect width="{w}" height="22" rx="6" fill="{bg}"/>'
        f'<text x="{w // 2}" y="15.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" '
        f'font-size="12" font-weight="700" fill="{fg}">{g}</text>'
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
        max_w = int(img_height.rstrip("px")) * 3
        return (
            f'<img src="{logo_url}" alt="{_esc(abbreviation)}" '
            f'style="height:{img_height};border-radius:4px;'
            f'max-width:{max_w}px;object-fit:contain;" '
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


# ---------------------------------------------------------------------------
# Player Lookup — additional components
# ---------------------------------------------------------------------------


def render_redshirt_indicator(
    traditional: bool,
    medical: bool,
    trad_year: int | None = None,
    med_year: int | None = None,
) -> str:
    """Render redshirt status pills.

    Returns HTML string with gold-tinted pill for traditional RS
    and red-tinted pill for medical RS, or dim "No Redshirts" text.
    """
    pill = (
        "display:inline-flex;align-items:center;padding:3px 10px;"
        "border-radius:4px;font-family:var(--font-body);font-weight:600;"
        "font-size:11px;letter-spacing:0.06em;text-transform:uppercase;"
        "margin-right:6px;"
    )
    parts = []
    if traditional:
        yr = f" ({int(trad_year)})" if trad_year else ""
        parts.append(
            f'<span style="{pill}background:rgba(201,162,39,0.18);'
            f'color:#E8C547;border:1px solid rgba(201,162,39,0.3);">'
            f"TRAD RS{_esc(yr)}</span>"
        )
    if medical:
        yr = f" ({int(med_year)})" if med_year else ""
        parts.append(
            f'<span style="{pill}background:rgba(184,69,69,0.18);'
            f'color:#E07070;border:1px solid rgba(184,69,69,0.3);">'
            f"MED RS{_esc(yr)}</span>"
        )
    if not parts:
        return (
            '<span style="color:var(--fg-tertiary);font-size:12px;'
            'font-family:var(--font-body);">No Redshirts</span>'
        )
    return " ".join(parts)


def render_eligibility_bar(years_used: int, max_years: int = 4) -> str:
    """Render a horizontal eligibility progress bar.

    Shows filled segments in gold and empty segments in dark gray.
    Returns HTML string.
    """
    used = min(max(years_used, 0), max_years)
    segments = []
    for i in range(max_years):
        if i < used:
            bg = "background:var(--gold);opacity:0.9;"
        else:
            bg = "background:var(--bg-surface-elev);border:1px solid var(--fg-tertiary);"
        segments.append(
            f'<div style="flex:1;height:10px;border-radius:2px;{bg}"></div>'
        )
    bar = "".join(segments)
    return (
        f'<div style="margin:6px 0;">'
        f'  <div style="font-family:var(--font-body);font-size:11px;'
        f'  color:var(--fg-secondary);text-transform:uppercase;letter-spacing:0.08em;'
        f'  font-weight:600;margin-bottom:4px;">Eligibility {used}/{max_years}</div>'
        f'  <div style="display:flex;gap:4px;">{bar}</div>'
        f'</div>'
    )


def render_transaction_type_badge(txn_type: str) -> str:
    """Render a color-coded badge for a transaction type.

    Colors: AUCTION_WON=green, FREE_AGENT=gray, IR=red, TAXI=gold.
    Returns HTML string.
    """
    from config import TRANSACTION_TYPE_LABELS, TRANSACTION_TYPE_COLORS

    label = TRANSACTION_TYPE_LABELS.get(txn_type, txn_type)
    color = TRANSACTION_TYPE_COLORS.get(txn_type, "#5A5A5A")
    return (
        f'<span style="display:inline-flex;align-items:center;padding:2px 8px;'
        f'border-radius:3px;font-family:var(--font-body);font-weight:600;'
        f'font-size:10px;letter-spacing:0.06em;text-transform:uppercase;'
        f'background:{color}22;color:{color};'
        f'border:1px solid {color}44;">{_esc(label)}</span>'
    )


def render_award_badge(award_type: str, year: int | None = None) -> str:
    """Render an award badge.

    National awards get gold gradient treatment.
    All-Conference awards get conference-colored treatment.
    Parses 'AllConf_SEC,1st' into '1st Team All-SEC'.
    Returns HTML string.
    """
    if award_type.startswith("AllConf_"):
        # Parse "AllConf_SEC,1st" -> conf="SEC", team="1st"
        remainder = award_type.replace("AllConf_", "")
        parts = remainder.split(",")
        conf = parts[0] if parts else ""
        team = parts[1].strip() if len(parts) > 1 else ""
        display_name = f"{team} Team All-{conf}"
        bg = "rgba(90,90,90,0.2)"
        fg = "var(--fg-primary)"
        border = "rgba(90,90,90,0.4)"
    else:
        from config import AWARD_DISPLAY_NAMES

        display_name = AWARD_DISPLAY_NAMES.get(award_type, award_type)
        bg = "rgba(201,162,39,0.18)"
        fg = "#E8C547"
        border = "rgba(201,162,39,0.35)"

    yr = f" ({int(year)})" if year else ""
    return (
        f'<span style="display:inline-flex;align-items:center;padding:3px 10px;'
        f'border-radius:4px;font-family:var(--font-body);font-weight:600;'
        f'font-size:11px;letter-spacing:0.04em;'
        f'background:{bg};color:{fg};border:1px solid {border};'
        f'margin:2px 4px 2px 0;">{_esc(display_name)}{_esc(yr)}</span>'
    )


# ---------------------------------------------------------------------------
# Player Ledger renderers (pl-*)
# Mirrors apps_script_recruiting/CFFB Design System/Player Ledger/ledger.css
# ---------------------------------------------------------------------------


_PL_STATUS_META = {
    "rostered":    {"label": "Rostered"},
    "redshirting": {"label": "Redshirting"},
    "graduated":   {"label": "Graduated"},
    "declared":    {"label": "Declared"},
    "fa":          {"label": "Free Agent"},
}


def render_breadcrumb(crumbs: list[str], here: str) -> str:
    """Render the "League / Player Ledger" breadcrumb."""
    parts = []
    for i, crumb in enumerate(crumbs):
        if i > 0:
            parts.append('<span class="pl-context__sep">/</span>')
        parts.append(f'<span class="pl-context__crumb">{_esc(crumb)}</span>')
    if crumbs:
        parts.append('<span class="pl-context__sep">/</span>')
    parts.append(f'<span class="pl-context__here">{_esc(here)}</span>')
    return f'<div class="pl-context">{"".join(parts)}</div>'


def render_panel_header(title: str, desc: str = "") -> str:
    """Render the gold-gradient panel header with title and optional description."""
    desc_html = f'<p class="pl-panel__desc">{_esc(desc)}</p>' if desc else ""
    return (
        f'<div class="pl-panel__head">'
        f'  <div class="pl-panel__title">'
        f'    <h1 class="pl-panel__h1">{_esc(title)}</h1>'
        f'    {desc_html}'
        f'  </div>'
        f'</div>'
    )


def render_portrait(initials: str, position: str, size: str = "lg") -> str:
    """Render the player portrait with position-colored top bar and initials."""
    color = _POS_COLORS.get((position or "").upper(), "#5A5A5A")
    cls = f"pl-portrait pl-portrait--{size}"
    sil_svg = (
        '<svg class="pl-portrait__sil" viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.31 0-8 1.66-8 5v3h16v-3'
        'c0-3.34-4.69-5-8-5z"/></svg>'
    )
    return (
        f'<div class="{cls}">'
        f'  <span class="pl-portrait__bar" style="background:{color};"></span>'
        f'  {sil_svg}'
        f'  <span class="pl-portrait__initials">{_esc(initials)}</span>'
        f'</div>'
    )


def render_stat_tile(label: str, value: str, hero: bool = False) -> str:
    """Render a single stat tile for the hero rail."""
    val_cls = "pl-stat__val is-hero" if hero else "pl-stat__val"
    return (
        f'<div class="pl-stat">'
        f'  <span class="pl-stat__label">{_esc(label)}</span>'
        f'  <span class="{val_cls}">{_esc(value)}</span>'
        f'</div>'
    )


def render_hero_profile(
    name: str,
    position: str,
    college: str = "",
    meta: str = "",
    composite: str = "",
    stats: list[dict] | None = None,
    accent_color: str = "#C9A227",
    initials: str = "",
) -> str:
    """Render the full hero profile block.

    Args:
        name: Player name (uppercase, large display).
        position: Position code (QB/RB/WR/TE) — drives portrait bar color + chip.
        college: Optional college / school text under the name row.
        meta: Optional meta line (NFL team, draft class, etc.).
        composite: Optional composite/rating text shown next to stars.
        stats: List of {label, value, hero (optional)} dicts (4 tiles ideal).
        accent_color: Hex color used for the hero radial gradient (--accent).
        initials: Pre-computed initials for the portrait.
    """
    if not initials:
        parts = [p for p in str(name).split() if p]
        initials = "".join(p[0] for p in parts[:2]).upper()

    portrait = render_portrait(initials, position, size="lg")
    pos_chip = (
        f'<span class="pl-poschip">{_esc(position)}</span>' if position else ""
    )
    college_html = (
        f'<span class="pl-hero__college">{_esc(college)}</span>' if college else ""
    )
    composite_html = (
        f'<span class="pl-hero__composite">{_esc(composite)}</span>' if composite else ""
    )
    meta_html = (
        f'<div class="pl-hero__meta">{_esc(meta)}</div>' if meta else ""
    )

    stats_html = ""
    if stats:
        tiles = "".join(
            render_stat_tile(s["label"], s["value"], hero=s.get("hero", False))
            for s in stats
        )
        stats_html = (
            f'<div class="pl-hero__rail">'
            f'  <div class="pl-hero__stats">{tiles}</div>'
            f'</div>'
        )

    return (
        f'<div class="pl-hero" style="--accent:{accent_color};">'
        f'  {portrait}'
        f'  <div class="pl-hero__id">'
        f'    <div class="pl-hero__tags">{pos_chip}{college_html}</div>'
        f'    <div class="pl-hero__namerow">'
        f'      <h2 class="pl-hero__name">{_esc(name)}</h2>'
        f'    </div>'
        f'    <div class="pl-hero__stars">{composite_html}</div>'
        f'    {meta_html}'
        f'  </div>'
        f'  {stats_html}'
        f'</div>'
    )


def render_copies_meter(counts: dict, total: int | None = None) -> str:
    """Render the segmented copies meter.

    Args:
        counts: dict with keys rostered / redshirting / graduated / declared / fa.
        total: Optional total for the count label. Defaults to sum(counts).
    """
    order = ["rostered", "redshirting", "graduated", "declared", "fa"]
    counts = {k: int(counts.get(k, 0)) for k in order}
    total_n = total if total is not None else sum(counts.values())

    segments = "".join(
        f'<span class="pl-meter__seg is-{k}" style="flex:{counts[k]};"></span>'
        for k in order if counts[k] > 0
    )
    legend = "".join(
        f'<span><i class="is-{k}"></i>{_esc(_PL_STATUS_META[k]["label"])} {counts[k]}</span>'
        for k in order
    )

    return (
        f'<div class="pl-meter">'
        f'  <div class="pl-meter__head">'
        f'    <span class="pl-meter__title">Copies</span>'
        f'    <span class="pl-meter__count"><b>{counts["rostered"] + counts["redshirting"]}</b> active of <b>{total_n}</b> total</span>'
        f'  </div>'
        f'  <div class="pl-meter__bar">{segments}</div>'
        f'  <div class="pl-meter__legend">{legend}</div>'
        f'</div>'
    )


def render_eligibility_strip(years: list[dict]) -> str:
    """Render the horizontal eligibility year strip.

    Args:
        years: list of {season, label, state, sub (optional)} dicts.
               state in {"used","rs","rs-med","current","pre"}.
    """
    if not years:
        return ""
    cells = []
    for y in years:
        state = y.get("state", "pre")
        is_current = state == "current"
        cell_cls = "pl-eligyr"
        if is_current:
            cell_cls += " pl-eligyr--current"
        season = str(y.get("season", ""))
        label = str(y.get("label", ""))
        sub = str(y.get("sub", ""))
        sub_html = f'<div class="pl-eligyr__sub">{_esc(sub)}</div>' if sub else ""
        cells.append(
            f'<div class="{cell_cls}">'
            f'  <div class="pl-eligyr__season">{_esc(season)}</div>'
            f'  <div class="pl-eligyr__rail"><span class="pl-eligyr__dot is-{state}"></span></div>'
            f'  <div class="pl-eligyr__lbl">{_esc(label)}</div>'
            f'  {sub_html}'
            f'</div>'
        )

    return (
        f'<div class="pl-elig">'
        f'  <div class="pl-elig__head">'
        f'    <span class="pl-elig__title">Eligibility</span>'
        f'  </div>'
        f'  <div class="pl-eligstrip">{"".join(cells)}</div>'
        f'</div>'
    )


def render_conference_group_header(
    conf: str,
    total: int,
    active: int,
    retired: int,
    fa: int,
    accent_color: str = "#C9A227",
) -> str:
    """Render the conference group header with accent edge and roll chips."""
    roll = []
    if active:
        roll.append(f'<span class="pl-confroll__chip is-active">{active} Active</span>')
    if retired:
        roll.append(f'<span class="pl-confroll__chip is-retired">{retired} Retired</span>')
    if fa:
        roll.append(f'<span class="pl-confroll__chip is-fa">{fa} FA</span>')
    return (
        f'<div class="pl-confgroup__head">'
        f'  <span class="pl-confgroup__edge"></span>'
        f'  <span class="pl-confgroup__name">{_esc(conf)}</span>'
        f'  <span class="pl-confgroup__count">{total} Copies</span>'
        f'  <span class="pl-confroll">{"".join(roll)}</span>'
        f'</div>'
    )


def render_status_chip(status: str, size: str = "md") -> str:
    """Render a status chip (rostered / redshirting / graduated / declared / fa)."""
    s = status.lower()
    meta = _PL_STATUS_META.get(s, {"label": status})
    size_cls = " pl-status--sm" if size == "sm" else ""
    return (
        f'<span class="pl-status pl-status--{s}{size_cls}">'
        f'  <span class="pl-status__dot"></span>'
        f'  <span class="pl-status__label">{_esc(meta["label"])}</span>'
        f'</span>'
    )


def render_money(amount: float | int | None, hero: bool = False) -> str:
    """Render a price ("$42") or "on the wire" placeholder when amount is None/0."""
    if amount is None or (isinstance(amount, (int, float)) and amount <= 0):
        return '<span class="pl-money pl-money--wire">on the wire</span>'
    cls = "pl-money pl-money--hero" if hero else "pl-money"
    return f'<span class="{cls}">${int(amount)}</span>'


def render_pl_owner(
    team_name: str,
    owner_handle: str = "",
    logo_url: str = "",
    stacked: bool = False,
    size: str = "md",
) -> str:
    """Render the owner block with team mark + name + monospace handle.

    Pass team_name=None / empty to render the "Free agent" dashed pill.
    """
    if not team_name or str(team_name).lower() in ("free agent", "fa"):
        return (
            f'<span class="pl-owner pl-owner--fa">'
            f'  <span class="pl-owner__fa">Free agent</span>'
            f'</span>'
        )
    logo_cls = "pl-owner__logo" + (" pl-owner__logo--lg" if size == "lg" else "")
    logo_html = (
        f'<img class="{logo_cls}" src="{_esc(logo_url)}" alt="" />'
        if logo_url else ""
    )
    handle_html = (
        f'<span class="pl-owner__handle">{_esc(owner_handle)}</span>'
        if owner_handle else ""
    )
    stacked_cls = " pl-owner--stacked" if stacked else ""
    return (
        f'<span class="pl-owner{stacked_cls}">'
        f'  {logo_html}'
        f'  <span class="pl-owner__id">'
        f'    <span class="pl-owner__team">{_esc(team_name)}</span>'
        f'    {handle_html}'
        f'  </span>'
        f'</span>'
    )


def render_honors_star(count: int) -> str:
    """Render the gold honors star with award count."""
    if not count or count <= 0:
        return ""
    return f'<span class="pl-honors">★ {int(count)}</span>'


def render_pl_tag(text: str, variant: str) -> str:
    """Render a small tag (won / rs / rs-med / award / graduate / drop / declared)."""
    return f'<span class="pl-tag pl-tag--{variant}">{_esc(text)}</span>'


def render_transaction_timeline(events: list[dict]) -> str:
    """Render the vertical transaction timeline.

    Args:
        events: list of dicts with keys:
            season (str/int), variant (won/rs/rs-med/award/drop/graduate/fa),
            owner_html (pre-rendered owner block), detail_html (price/tag),
            note (optional plain text).
    """
    if not events:
        return (
            '<div class="pl-tl"><div class="pl-tl__sub">'
            'No transactions recorded.</div></div>'
        )
    items = []
    last = len(events) - 1
    for i, e in enumerate(events):
        variant = e.get("variant", "won")
        season = str(e.get("season", ""))
        owner_html = e.get("owner_html", "")
        detail_html = e.get("detail_html", "")
        note = e.get("note", "")
        note_html = (
            f'<div class="pl-tlitem__note">{_esc(note)}</div>' if note else ""
        )
        is_last_cls = " is-last" if i == last else ""
        items.append(
            f'<li class="pl-tlitem{is_last_cls}">'
            f'  <div class="pl-tlitem__rail">'
            f'    <span class="pl-tlitem__dot is-{variant}"></span>'
            f'  </div>'
            f'  <div class="pl-tlitem__body">'
            f'    <div class="pl-tlitem__main">'
            f'      <span class="pl-tlitem__season">{_esc(season)}</span>'
            f'      <span class="pl-tlitem__owner">{owner_html}</span>'
            f'      <span class="pl-tlitem__detail">{detail_html}</span>'
            f'    </div>'
            f'    {note_html}'
            f'  </div>'
            f'</li>'
        )

    return (
        f'<div class="pl-tl">'
        f'  <div class="pl-tl__head">'
        f'    <span class="pl-tl__title">Transaction Ledger</span>'
        f'    <span class="pl-tl__sub">{len(events)} events</span>'
        f'  </div>'
        f'  <ol class="pl-tl__list">{"".join(items)}</ol>'
        f'</div>'
    )


# Emoji status dots — used inside st.expander labels, which only accept text
# (no SVG/HTML). Approximates the colored status dot from the visual design.
_PL_STATUS_EMOJI = {
    "rostered":    "\U0001F7E2",  # green circle
    "redshirting": "\U0001F7E1",  # yellow circle
    "graduated":   "\U0001F7E4",  # brown circle
    "declared":    "\U0001F7E0",  # orange circle
    "fa":          "\U000026AB",  # black circle
}


def render_copy_row_label_md(
    copy_n: int,
    status: str,
    owner: str,
    elig_short: str = "",
    price: float | int | None = None,
    since_year: int | None = None,
    honors: int = 0,
) -> str:
    """Build a markdown string for use as st.expander label.

    Streamlit expander labels accept markdown text but not HTML, so emoji dots
    and bold/italic are the only formatting available.
    """
    dot = _PL_STATUS_EMOJI.get(status.lower(), "⚫")
    label = _PL_STATUS_META.get(status.lower(), {}).get("label", status).upper()
    parts = [f"**Copy {copy_n}**", f"{dot} {label}", owner or "Free agent"]
    if elig_short:
        parts.append(elig_short)
    if price and price > 0:
        since = f" since {int(since_year)}" if since_year else ""
        parts.append(f"${int(price)}{since}")
    elif since_year:
        parts.append(f"FA since {int(since_year)}")
    if honors and honors > 0:
        parts.append(f"★ {int(honors)}")
    return "  ·  ".join(parts)


def render_section_label(text: str) -> str:
    """Render a section label with gold accent bar."""
    return f'<div class="pl-section-label">{_esc(text)}</div>'


_PL_CHEV_SVG = (
    '<svg class="pl-row__chev" viewBox="0 0 20 20" fill="none" '
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    '<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"/></svg>'
)


def render_pl_row(
    *,
    card_id: str,
    copy_n: int,
    status: str,
    owner_html: str,
    elig_short: str,
    money_html: str,
    honors: int,
    body_html: str,
    open_by_default: bool = False,
) -> str:
    """Render one copy as a pure-CSS disclosure row (no Streamlit chrome).

    Mirrors the auction tool's .cffb-disc pattern: a hidden checkbox toggles
    a label's siblings, animating grid-template-rows for smooth open/close.
    No reruns, no Streamlit expander border. All 12 copies for a player can
    be emitted in a single st.markdown call.
    """
    checked = " checked" if open_by_default else ""
    status_chip = render_status_chip(status, size="sm")
    honors_html = render_honors_star(honors) if honors and honors > 0 else ""
    cid = _esc(card_id)
    return (
        f'<div class="pl-row">'
        f'<input type="checkbox" class="pl-row__toggle" id="pl-row-{cid}"{checked}>'
        f'<label class="pl-row__summary" for="pl-row-{cid}">'
        f'  <span class="pl-row__n">Copy {int(copy_n)}{honors_html}</span>'
        f'  <span class="pl-row__status">{status_chip}</span>'
        f'  <span class="pl-row__owner">{owner_html}</span>'
        f'  <span class="pl-row__elig">{_esc(elig_short)}</span>'
        f'  <span class="pl-row__money">{money_html}</span>'
        f'  {_PL_CHEV_SVG}'
        f'</label>'
        f'<div class="pl-row__panel">'
        f'  <div class="pl-row__body">{body_html}</div>'
        f'</div>'
        f'</div>'
    )


def render_awards_table(rows: list[dict], columns: list[dict]) -> str:
    """Render an HTML awards table (replaces st.dataframe).

    Args:
        rows: list of dicts, one per award row. Keys match column `key` values.
        columns: list of {key, label, type} dicts where type in
                 {"text","year","num","logo"}.
    """
    head = "".join(f'<th>{_esc(c["label"])}</th>' for c in columns)
    body_rows = []
    for r in rows:
        cells = []
        for c in columns:
            ctype = c.get("type", "text")
            val = r.get(c["key"], "")
            if ctype == "logo":
                if val:
                    cells.append(
                        f'<td class="is-logo"><img src="{_esc(val)}" alt="" '
                        f'onerror="this.style.display=\'none\'"/></td>'
                    )
                else:
                    cells.append('<td class="is-logo"></td>')
            elif ctype == "year":
                cells.append(f'<td class="is-year">{_esc(val)}</td>')
            elif ctype == "num":
                cells.append(f'<td class="is-num">{_esc(val)}</td>')
            elif ctype == "html":
                cells.append(f'<td>{val}</td>')
            else:
                cells.append(f'<td>{_esc(val)}</td>')
        body_rows.append(f'<tr>{"".join(cells)}</tr>')
    return (
        f'<table class="pl-awtable">'
        f'<thead><tr>{head}</tr></thead>'
        f'<tbody>{"".join(body_rows)}</tbody>'
        f'</table>'
    )
