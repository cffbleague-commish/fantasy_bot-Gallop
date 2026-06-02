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


# MFL 3-letter → ESPN 2/3-letter abbreviation mapping
_NFL_ABBR_MAP = {
    "lvr": "lv",    # Las Vegas Raiders
    "kcc": "kc",    # Kansas City Chiefs
    "nep": "ne",    # New England Patriots
    "nos": "no",    # New Orleans Saints
    "gbp": "gb",    # Green Bay Packers
}


def nfl_logo_url(nfl_team: str) -> str:
    """Return ESPN CDN logo URL for an NFL team abbreviation, or empty string."""
    if not nfl_team:
        return ""
    abbr = str(nfl_team).strip().lower()
    if not abbr or abbr == "nan":
        return ""
    # Normalize MFL-style abbreviations to ESPN abbreviations
    abbr = _NFL_ABBR_MAP.get(abbr, abbr)
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
# A-tier uses a metallic gold gradient (rendered inline as <linearGradient>); the
# flat color here is the mid-stop and acts only as a fallback if the gradient ref fails.
_GRADE_COLORS = {
    "a": ("#C9A227", "#0A0A0A"),  # gold (mid-stop fallback), dark text
    "b": ("#2D7A4E", "#F5F5F5"),  # green bg, light text
    "c": ("#4A6680", "#F5F5F5"),  # slate-blue bg, light text
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

    if mod == "a":
        # Metallic gold gradient + soft glow for A-tier (matches GradeBadge.html)
        gid = f"gA{w}"
        fid = f"glow{w}"
        defs = (
            f'<defs>'
            f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0%" stop-color="#E8C547"/>'
            f'<stop offset="50%" stop-color="#C9A227"/>'
            f'<stop offset="100%" stop-color="#8B6F1F"/>'
            f'</linearGradient>'
            f'<filter id="{fid}" x="-20%" y="-20%" width="140%" height="140%">'
            f'<feGaussianBlur stdDeviation="1.2" result="b"/>'
            f'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
            f'</filter>'
            f'</defs>'
        )
        rect_fill = f'url(#{gid})'
        rect_filter = f' filter="url(#{fid})"'
    else:
        defs = ""
        rect_fill = bg
        rect_filter = ""

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="22">'
        f'{defs}'
        f'<rect width="{w}" height="22" rx="6" fill="{rect_fill}"{rect_filter}/>'
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
    paid: float | None = None,
    savings: float | None = None,
    grade: str | None = None,
    savings_vs_predicted: float | None = None,
    savings_vs_league_avg: float | None = None,
    recruit_score: float | None = None,
) -> str:
    """Render a compact player card row.

    Args:
        paid: Actual bid amount. When provided, becomes the prominent bid
            and `predicted_cost` collapses to a small subtitle.
        savings: Blended savings dollars. Overrides `delta` when provided.
            If `savings_vs_predicted` / `savings_vs_league_avg` are also
            provided, a labeled 3-row breakdown is rendered instead of a
            single delta arrow.
        grade: Letter grade for the rightmost pill (empty cell if omitted).
    """
    # Team chip — headshot when we have one, otherwise college abbreviation
    pos_color = _POS_COLORS.get(position, "#6A6A6A")
    if headshot_url and str(headshot_url).startswith("http"):
        team_html = (
            f'<div class="cffb-pc-c__team" style="background:#1C1C1C; padding:0; overflow:hidden;">'
            f'<img src="{_esc(headshot_url)}" alt="{_esc(name)}" '
            f'style="width:100%;height:100%;object-fit:cover;border-radius:50%;" '
            f'loading="lazy"/>'
            f'</div>'
        )
    else:
        abbrev = college_abbrev or (college[:3].upper() if college else "???")
        team_html = (
            f'<div class="cffb-pc-c__team" style="background:{pos_color}; color:#fff;">'
            f'{abbrev}</div>'
        )

    # Position badge
    pos_html = f'<div class="cffb-pc-c__pos" style="background:{pos_color};">{position}</div>'

    # Recruit score panel (sits between name block and stars to break up the row)
    if recruit_score is not None:
        score_html = (
            f'<div class="cffb-pc-c__score">'
            f'{recruit_score:.1f}'
            f'<span class="cffb-pc-c__score-sub">Score</span>'
            f'</div>'
        )
    else:
        score_html = '<span></span>'

    # Stars
    star_color = {5: "#C9A227", 4: "#3B82C4", 3: "#7BA4C9"}.get(stars, "#6A6A6A")
    stars_html = "".join(
        f'<span class="cffb-pc-c__star" style="color:{star_color};">\u2605</span>'
        if i < stars else
        f'<span class="cffb-pc-c__star cffb-pc-c__star--off">\u2605</span>'
        for i in range(5)
    )

    # Bid amount \u2014 show `paid` prominently when available, with predicted as sub-label.
    primary = paid if paid is not None else predicted_cost
    primary_str = f"${primary:.0f}" if primary is not None else "\u2014"
    sub_html = ""
    if paid is not None and predicted_cost is not None:
        sub_html = f'<span class="cffb-pc-c__bid-sub">Pred ${predicted_cost:.0f}</span>'
    bid_html = f'<div class="cffb-pc-c__bid">{primary_str}{sub_html}</div>'

    # Savings breakdown \u2014 if any of the three are provided, render a 3-row
    # labeled stack (Blend / vs Pred / vs Avg). Otherwise fall back to the
    # legacy single-delta render driven by `savings` or `delta`.
    has_breakdown = (
        savings_vs_predicted is not None
        or savings_vs_league_avg is not None
    )

    def _savings_cell(value, primary: bool = False) -> str:
        if value is None:
            return '<span class="cffb-pc-c__savings-val cffb-pc-c__savings-val--flat">\u2014</span>'
        primary_cls = " cffb-pc-c__savings-val--primary" if primary else ""
        if value > 0:
            return (
                f'<span class="cffb-pc-c__savings-val cffb-pc-c__savings-val--pos{primary_cls}">'
                f'\u25B2 +${abs(value):.1f}</span>'
            )
        if value < 0:
            return (
                f'<span class="cffb-pc-c__savings-val cffb-pc-c__savings-val--neg{primary_cls}">'
                f'\u25BC \u2212${abs(value):.1f}</span>'
            )
        return f'<span class="cffb-pc-c__savings-val cffb-pc-c__savings-val--flat{primary_cls}">\u00B1$0</span>'

    if has_breakdown:
        delta_html = (
            f'<div class="cffb-pc-c__savings">'
            f'<span class="cffb-pc-c__savings-lbl" title="Weighted blend of the two savings baselines below — the primary value-versus-cost number.">Blended Savings</span>'
            f'{_savings_cell(savings, primary=True)}'
            f'<span class="cffb-pc-c__savings-lbl" title="Bid Amount vs the pricing model\'s predicted cost. Positive = bought below the model\'s expectation.">vs Predicted</span>'
            f'{_savings_cell(savings_vs_predicted)}'
            f'<span class="cffb-pc-c__savings-lbl" title="Bid Amount vs the league-wide average paid for this player across conferences. Positive = paid less than peers.">vs League Avg</span>'
            f'{_savings_cell(savings_vs_league_avg)}'
            f'</div>'
        )
    else:
        delta_value = savings if savings is not None else delta
        if delta_value is not None and delta_value != 0:
            cls = "cffb-pc-c__delta--pos" if delta_value > 0 else "cffb-pc-c__delta--neg"
            arrow = "\u25B2" if delta_value > 0 else "\u25BC"
            sign = "+" if delta_value > 0 else "\u2212"
            delta_html = (
                f'<div class="cffb-pc-c__delta {cls}">'
                f'{arrow} {sign}${abs(delta_value):.0f}</div>'
            )
        elif delta_value is not None:
            delta_html = '<div class="cffb-pc-c__delta" style="color:#5A5A5A;">\u00B1$0</div>'
        else:
            delta_html = '<div class="cffb-pc-c__delta"></div>'

    # Grade pill (placeholder div if no grade so the 7-col grid stays aligned).
    if grade and str(grade).strip() and str(grade).strip().upper() not in ("N/A", "NAN"):
        grade_html = render_grade_badge(grade, size="sm")
    else:
        grade_html = '<span></span>'

    return (
        f'<div class="cffb-pc-c">'
        f'{team_html}'
        f'{pos_html}'
        f'<div>'
        f'  <div class="cffb-pc-c__name">{_esc(name)}</div>'
        f'  <div class="cffb-pc-c__meta">{_esc(college)}</div>'
        f'</div>'
        f'{score_html}'
        f'<div class="cffb-pc-c__stars">{stars_html}</div>'
        f'{bid_html}'
        f'{delta_html}'
        f'{grade_html}'
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
# 3b. Player Card (mobile list item) — vertical card alternative to dataframe
# ---------------------------------------------------------------------------

def render_player_card_mobile(
    name: str,
    position: str,
    college: str,
    stars: int,
    headshot_url: str = "",
    stats: list[dict] | None = None,
) -> str:
    """Render a compact horizontal player card for mobile board view.

    Args:
        stats: Up to 4 dicts of {"label", "value", "hero" (optional)}.

    Returns HTML string.
    """
    pos_color = _POS_COLORS.get(position, "#6A6A6A")

    if headshot_url and str(headshot_url).startswith("http"):
        photo_inner = f'<img src="{headshot_url}" alt="{_esc(name)}" loading="lazy" onerror="this.style.display=\'none\'">'
    else:
        photo_inner = (
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#3A3A3A;">'
            '<svg viewBox="0 0 56 56" style="width:30px;height:30px;stroke:#3A3A3A;fill:none;stroke-width:1.5">'
            '<circle cx="28" cy="20" r="9"/>'
            '<path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50"/>'
            '</svg>'
            '</div>'
        )

    star_color = {5: "#C9A227", 4: "#3B82C4", 3: "#7BA4C9"}.get(stars, "#6A6A6A")
    stars_html = "".join(
        f'<span style="color:{star_color};font-size:12px;">★</span>' if i < stars
        else f'<span style="color:#2A2A2A;font-size:12px;">★</span>'
        for i in range(5)
    )

    stats_html = ""
    if stats:
        items = ""
        for s in stats:
            hero_cls = " cffb-pc-m__stat-val--hero" if s.get("hero") else ""
            items += (
                f'<div class="cffb-pc-m__stat">'
                f'<span class="cffb-pc-m__stat-label">{_esc(s["label"])}</span>'
                f'<span class="cffb-pc-m__stat-val{hero_cls}">{_esc(str(s["value"]))}</span>'
                f'</div>'
            )
        stats_html = f'<div class="cffb-pc-m__stats">{items}</div>'

    pos_chip = (
        f'<span style="background:{pos_color};color:#0A0A0A;font-family:var(--font-display);'
        f'font-weight:700;font-size:10px;padding:2px 5px;border-radius:3px;margin-right:6px;">'
        f'{_esc(position)}</span>'
    )

    return (
        f'<div class="cffb-pc-m">'
        f'  <div class="cffb-pc-m__photo">{photo_inner}</div>'
        f'  <div class="cffb-pc-m__body">'
        f'    <div class="cffb-pc-m__name">{_esc(name)}</div>'
        f'    <div class="cffb-pc-m__meta">{pos_chip}{_esc(college)} &middot; {stars_html}</div>'
        f'    {stats_html}'
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
# 5b. Recruiting Take — dual-analyst pull-quote card
# ---------------------------------------------------------------------------

_TAKE_VARIANTS = {
    "headgear": {
        "accent": "#C46A3E",
        "tint": "rgba(196,106,62,0.10)",
        "quote_style": (
            "font-family:'Saira Condensed',system-ui,sans-serif;"
            "font-weight:600;font-size:18px;line-height:1.25;"
            "font-style:italic;letter-spacing:-0.005em;text-transform:none;"
        ),
    },
    "analyst": {
        "accent": "#6B8FB0",
        "tint": "rgba(107,143,176,0.08)",
        "quote_style": "font-size:14px;line-height:1.6;",
    },
}

# Avatar SVG paths — inlined per-card so they render reliably across Streamlit iframes.
_TAKE_AVATAR_SVG = {
    "headgear": (
        '<svg viewBox="0 0 48 48" width="44" height="44" xmlns="http://www.w3.org/2000/svg">'
        '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">'
        '<path d="M9 46 C9 42 13 38 16 38 L32 38 C35 38 39 42 39 46"/>'
        '<path d="M19 32 L19 38 M29 32 L29 38"/>'
        '<path d="M7 18 C7 9 14 4 24 4 C34 4 41 9 41 18 L41 26 C41 30 38 33 34 33 L14 33 C10 33 7 30 7 26 Z"/>'
        '<path d="M11 8 C8 4 5 4 4 7"/>'
        '<path d="M37 8 C40 4 43 4 44 7"/>'
        '<ellipse cx="24" cy="22" rx="10" ry="6.5" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.2"/>'
        '<circle cx="20" cy="22" r="1.2" fill="currentColor"/>'
        '<circle cx="28" cy="22" r="1.2" fill="currentColor"/>'
        '<path d="M20 27 Q24 29 28 27"/>'
        '</g></svg>'
    ),
    "analyst": (
        '<svg viewBox="0 0 48 48" width="44" height="44" xmlns="http://www.w3.org/2000/svg">'
        '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">'
        '<path d="M6 46 C6 38 14 34 20 34 L28 34 C34 34 42 38 42 46"/>'
        '<path d="M20 34 L24 42 L28 34"/>'
        '<path d="M17 36 L20 46 M31 36 L28 46"/>'
        '<path d="M23 42 L24 44 L25 42 Z" fill="currentColor"/>'
        '<circle cx="24" cy="20" r="9"/>'
        '<path d="M17 16 Q24 11 31 16"/>'
        '<path d="M13 20 C13 7 35 7 35 20"/>'
        '<ellipse cx="13" cy="22" rx="2" ry="3.5" fill="currentColor" fill-opacity="0.25"/>'
        '<path d="M13 25 C10 32 20 33 23 28"/>'
        '<ellipse cx="23" cy="28" rx="1.8" ry="1.1" fill="currentColor" fill-opacity="0.4"/>'
        '</g></svg>'
    ),
}


def render_recruiting_take(
    variant: str,
    persona: str,
    subject: str,
    sub: str,
    grade: str,
    quote: str,
    byline_label: str = "",
    image_url: str = "",
) -> str:
    """Render a dual-analyst pull-quote card for a recruiting class.

    Args:
        variant: "headgear" (Corso, brick accent) or "analyst" (Herbstreit, slate accent).
        persona: Uppercased persona label ("The Headgear Pick", "The Analyst").
        subject: Bold subject line (e.g., "Texas · 2026 Class").
        sub: Smaller meta line below subject (e.g., "14 commits · #3 nationally").
        grade: Letter grade for the upper-right pill.
        quote: The body copy.
        byline_label: Optional left-side byline tag (defaults to persona).
        image_url: Optional photo URL. When provided, replaces the SVG avatar
            with a circular cropped headshot.
    """
    cfg = _TAKE_VARIANTS.get(variant, _TAKE_VARIANTS["analyst"])
    accent = cfg["accent"]
    tint = cfg["tint"]
    quote_style = cfg["quote_style"]
    avatar_svg = _TAKE_AVATAR_SVG.get(variant, _TAKE_AVATAR_SVG["analyst"])
    byline = byline_label or persona

    grade_html = render_grade_badge(grade, size="lg")

    if image_url and str(image_url).startswith("http"):
        avatar_inner = (
            f'<img src="{_esc(image_url)}" alt="{_esc(persona)}" '
            f'style="width:100%;height:100%;object-fit:cover;border-radius:50%;" '
            f'loading="lazy"/>'
        )
        avatar_padding = "padding:0;overflow:hidden;"
    else:
        avatar_inner = avatar_svg
        avatar_padding = ""

    return (
        f'<article style="'
        f'display:grid;'
        f'grid-template-columns:72px 1fr auto;'
        f'grid-template-areas:\'avatar header grade\' \'avatar quote quote\' \'avatar byline byline\';'
        f'gap:14px 20px;padding:24px 28px 24px 24px;'
        f'background:radial-gradient(60% 100% at 0% 0%, {tint}, transparent 55%), #141414;'
        f'border:1px solid #2A2A2A;border-left:3px solid {accent};border-radius:8px;'
        f'font-family:Inter,system-ui,sans-serif;color:#F5F5F5;'
        f'margin:0 0 12px 0;">'
        # Avatar
        f'<div style="grid-area:avatar;width:64px;height:64px;border-radius:50%;'
        f'display:flex;align-items:center;justify-content:center;{avatar_padding}'
        f'background:#1C1C1C;border:1.5px solid {accent};color:{accent};align-self:start;">'
        f'{avatar_inner}'
        f'</div>'
        # Header
        f'<header style="grid-area:header;display:flex;flex-direction:column;gap:4px;align-self:end;">'
        f'<div style="font-family:\'Saira Condensed\',system-ui,sans-serif;'
        f'font-weight:700;font-size:14px;letter-spacing:0.16em;text-transform:uppercase;'
        f'color:{accent};line-height:1;">{_esc(persona)}</div>'
        f'<div style="font-family:\'Saira Condensed\',system-ui,sans-serif;'
        f'font-weight:700;font-size:22px;letter-spacing:-0.005em;text-transform:uppercase;'
        f'color:#F5F5F5;line-height:1.05;">{_esc(subject)}</div>'
        f'<div style="font-size:12px;color:#9A9A9A;font-weight:500;">{_esc(sub)}</div>'
        f'</header>'
        # Grade pill
        f'<div style="grid-area:grade;align-self:start;">{grade_html}</div>'
        # Quote
        f'<blockquote style="grid-area:quote;{quote_style}'
        f'color:#F5F5F5;margin:0;position:relative;padding-left:14px;'
        f'border-left:2px solid #2A2A2A;">{_esc(quote)}</blockquote>'
        # Byline
        f'<footer style="grid-area:byline;display:flex;align-items:center;gap:10px;'
        f'font-size:11px;letter-spacing:0.12em;text-transform:uppercase;'
        f'font-weight:600;color:#9A9A9A;">'
        f'<span>{_esc(byline)}</span>'
        f'<span style="flex:1;height:1px;background:#2A2A2A;"></span>'
        f'</footer>'
        f'</article>'
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
# InfoDisclosure — pure-CSS collapsible methodology card
# ---------------------------------------------------------------------------

ICON_CALCULATOR = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    'stroke-linecap="round" stroke-linejoin="round">'
    '<rect x="4" y="2" width="16" height="20" rx="2"/>'
    '<line x1="8" y1="6" x2="16" y2="6"/>'
    '<line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/>'
    '<line x1="16" y1="10" x2="16" y2="10"/>'
    '<line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/>'
    '<line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="18" x2="12" y2="18"/>'
    '</svg>'
)

ICON_HELP = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    'stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="10"/>'
    '<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>'
    '<line x1="12" y1="17" x2="12" y2="17"/>'
    '</svg>'
)

_CHEVRON_SVG = (
    '<svg class="cffb-disc__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<polyline points="6 9 12 15 18 9"/></svg>'
)


def render_info_disclosure_card(
    *,
    card_id: str,
    title: str,
    body_html: str,
    eyebrow: str = "",
    icon_svg: str = "",
    featured: bool = False,
    open_by_default: bool = False,
) -> str:
    """Render one CFFB InfoDisclosure card (pure-CSS collapsible).

    Each card needs a unique `card_id` (used for the hidden checkbox + label).
    `body_html` is injected verbatim inside .cffb-disc__inner — callers are
    responsible for HTML-safety of any user-supplied content.
    """
    card_classes = "cffb-disc cffb-disc--featured" if featured else "cffb-disc"
    checked_attr = " checked" if open_by_default else ""
    icon_html = icon_svg or ICON_HELP
    eyebrow_html = (
        f'<span class="cffb-disc__eyebrow">{_esc(eyebrow)}</span>'
        if eyebrow else ""
    )
    return (
        f'<div class="{card_classes}">'
        f'<input type="checkbox" class="cffb-disc__toggle" id="cffb-disc-{_esc(card_id)}"{checked_attr}>'
        f'<label class="cffb-disc__summary" for="cffb-disc-{_esc(card_id)}">'
        f'<span class="cffb-disc__icon" aria-hidden="true">{icon_html}</span>'
        f'<span class="cffb-disc__heading">'
        f'{eyebrow_html}'
        f'<span class="cffb-disc__title">{_esc(title)}</span>'
        f'</span>'
        f'{_CHEVRON_SVG}'
        f'</label>'
        f'<div class="cffb-disc__panel">'
        f'<div class="cffb-disc__body">'
        f'<div class="cffb-disc__inner">{body_html}</div>'
        f'</div></div>'
        f'</div>'
    )


def render_info_disclosure_group(cards_html: list[str]) -> str:
    """Stack a list of pre-rendered InfoDisclosure cards inside the group container."""
    return f'<div class="cffb-disc-group">{"".join(cards_html)}</div>'


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
