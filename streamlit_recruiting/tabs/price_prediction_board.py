"""
Price Prediction Board — unified board + pricing surface.

Combines the legacy Board and Pricing Predictor tabs into one focused
experience modeled after the design at:
  apps_script_recruiting/CFFB Design System/Recruiting Board/
  Price Prediction Board/

Layout:
  - Top bar (brand + live feed indicator)
  - Year selector segmented control (query-param driven)
  - Optional live-mode toolbar (conference + team selectors)
  - Sticky detail panel (photo, identity, stat grid, pricing hero, prob curve)
  - Big Board table (rank, prospect, stars, composite, projected)
  - Methodology dialog (model diagnostics: R^2, GB metrics, scatter, importance)
"""

from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime
from urllib.parse import urlencode

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from components import (
    college_logo_url,
    plotly_layout_defaults,
)
from data.auction_payload import (
    assign_copy_sessions as _assign_copy_sessions,
    resolve_winning_prices as _resolve_winning_prices,
)
from data.mfl_api import fetch_auction_budgets
from data.sheets import (
    get_available_years,
    load_auction_data,
    load_dlf_adp,
    load_espn_prospects,
    load_franchise_lookup,
    load_live_auction,
    load_recruiting_board,
)
from descriptions import DESCRIPTIONS
from models.config import CONFERENCES, POSITIONS, get_league_year
from models.current_model import build_pricing_model
from models.gradient_boosting import predict_gb, train_gradient_boosting
from models.replacement_level import (
    calc_conference_budget_remaining,
    calc_dynamic_replacement_prices,
    calc_replacement_prices,
)
from styles_prediction import inject_prediction_css


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POS_COLORS = {
    "QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#E8C547",
}

SCENARIO_COLORS = {
    "current": "#7BA4C9",   # Market consensus / Current model — blue, dashed
    "gb":      "#C9A227",   # Multi-Feature / Model baseline — gold, solid
    "live":    "#5B9D6B",   # Live-adjusted (or static Replacement) — green, primary
}

YEAR_TAGS = {
    "all": "All classes · combined board",
}

Z80 = 1.2816   # 80% central interval half-width in sigmas
ZRANGE = 1.65  # floor/ceiling band (~90%)

# Heuristic spreads (fraction of proj) when we don't have a model-derived sigma.
# Auctions skew high so sigHi > sigLo.
DEFAULT_SIG = {
    "current": (0.25, 0.34),
    "gb":      (0.22, 0.30),
    "live":    (0.18, 0.24),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _html(html: str) -> None:
    # Strip per-line leading whitespace + blank lines. Streamlit pipes
    # unsafe_allow_html through a markdown parser; any line indented 4+
    # spaces becomes a code block, and blank lines inject <p> wrappers
    # that break grid/flex layouts.
    flat = "".join(line.lstrip() for line in html.splitlines() if line.strip())
    st.markdown(flat, unsafe_allow_html=True)


def _esc(s) -> str:
    return (
        str(s)
        .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&#39;")
    )


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", str(s).strip().lower()).strip("-")


def _prospect_id(player: str, year) -> str:
    """Deterministic, URL-safe ID for a prospect row."""
    base = f"{player}-{year}".lower()
    h = hashlib.md5(base.encode("utf-8")).hexdigest()[:6]
    return f"{_slug(player)[:24]}-{h}"


def _initials(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z .'-]", "", str(name)).strip()
    parts = re.split(r"\s+", cleaned) if cleaned else []
    if not parts:
        return "?"
    a = parts[0][0] if parts[0] else ""
    if len(parts) > 1 and parts[-1]:
        b = parts[-1][0]
    else:
        b = parts[0][1] if len(parts[0]) > 1 else ""
    return (a + b).upper()


def _star_tier_cls(n) -> str:
    try:
        n = max(1, min(5, int(n)))
    except (TypeError, ValueError):
        n = 1
    return f"t{n}"


def _pos_text_color(pos: str) -> str:
    # RB chip uses light text on dark blue; others use dark text on bright bg.
    return "#F5F5F5" if pos == "RB" else "#0A0A0A"


def _fmt_money(n) -> str:
    if n is None:
        return "$—"
    try:
        if math.isnan(n):
            return "$—"
    except (TypeError, ValueError):
        pass
    try:
        return f"${int(round(float(n))):,}"
    except (TypeError, ValueError):
        return "$—"


def _safe_round(n, default=0):
    if n is None:
        return default
    try:
        if math.isnan(n):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return int(round(float(n)))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Cached model training — same models the Pricing Predictor tab used.
# ---------------------------------------------------------------------------

@st.cache_data(ttl=300, show_spinner=False)
def _train_models(_auction_df: pd.DataFrame, _adp_df: pd.DataFrame, _espn_df: pd.DataFrame):
    """Train both pricing models once per page render (cached)."""
    pricing_model = build_pricing_model(_auction_df, _adp_df, _espn_df)
    gb_model, gb_metrics = train_gradient_boosting(_auction_df, _adp_df, _espn_df)
    return pricing_model, gb_model, gb_metrics


# ---------------------------------------------------------------------------
# Live-auction integration — mirrors tabs/pricing_predictor.py's live mode.
# Returns dicts keyed by player name: live_prices, statuses, breakdowns,
# plus the conference budget breakdown for the live toolbar.
# ---------------------------------------------------------------------------

def _load_live_state(
    league_year: int,
    selected_conf: str,
    selected_franchise: str,
    full_board_df: pd.DataFrame,
    pricing_model: dict | None,
) -> dict:
    """
    Compute live-adjusted prices + auction state for the active conference.

    Returns a dict with:
      live_prices: {player_name: price}
      statuses:    {player_name: 'my_bid'|'owned'|'on_board'|'taken'|'available'}
      breakdowns:  {player_name: {'var':..,'pool_pct':..,'cap':..,'copies':..}}
      conf_total / conf_remaining
      franchise_remaining: int
      default_ceiling: int (2nd-highest remaining budget)
      synced_at: str (latest live row timestamp)
      has_data: bool
    """
    out = {
        "live_prices": {}, "statuses": {}, "breakdowns": {},
        "conf_total": 0, "conf_remaining": 0,
        "franchise_remaining": 0, "default_ceiling": 0,
        "synced_at": "", "has_data": False,
    }

    live_df = load_live_auction()
    raw_budgets = fetch_auction_budgets(league_year)
    fl_df = load_franchise_lookup()

    # Re-key raw budgets from FranchiseID -> FranchiseName
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

    if live_df.empty:
        return out

    live_df = live_df[live_df["AuctionYear"] == league_year]
    if live_df.empty:
        return out

    out["has_data"] = True

    # Most recent timestamp for the synced-at indicator
    try:
        latest = live_df["Timestamp"].dropna().astype(str).sort_values().iloc[-1]
        out["synced_at"] = latest
    except (KeyError, IndexError):
        pass

    all_df = live_df.copy()
    if "CopySession" not in all_df.columns or (all_df["CopySession"] == 0).all():
        all_df = _assign_copy_sessions(all_df)
    all_df = _resolve_winning_prices(all_df)

    rookie_df = all_df[all_df["IsRookie"]].copy()

    conf_total, conf_remaining, per_franchise = calc_conference_budget_remaining(
        all_df, selected_conf, auction_budgets, fl_df,
    )
    out["conf_total"] = conf_total
    out["conf_remaining"] = conf_remaining
    out["franchise_remaining"] = per_franchise.get(selected_franchise, 0)

    _sorted_b = sorted(per_franchise.values(), reverse=True)
    out["default_ceiling"] = _sorted_b[1] if len(_sorted_b) >= 2 else (_sorted_b[0] if _sorted_b else 0)

    copy_curve = pricing_model.get("copy_discount_curve", {}) if pricing_model else {}
    dynamic_df = calc_dynamic_replacement_prices(
        full_board_df, rookie_df, selected_conf,
        conf_remaining, copy_curve,
        per_franchise_remaining=per_franchise,
    )
    if not dynamic_df.empty:
        for _, r in dynamic_df.iterrows():
            name = r["Player"]
            out["live_prices"][name] = r["live_price"]
            out["statuses"][name] = r["status"]
            out["breakdowns"][name] = {
                "var": r["var_score"],
                "pool_pct": r.get("pool_pct", 0),
                "total_share": r.get("total_share", 0),
                "copies": r["copies_remaining"],
                "cap": r.get("market_cap", 0),
            }

    conf_rookie_df = rookie_df[rookie_df["Conference"] == selected_conf]
    won_keys = set()
    my_owned_players = set()
    conf_won = conf_rookie_df[conf_rookie_df["TransactionType"] == "AUCTION_WON"]
    if not conf_won.empty:
        for _, w in conf_won.iterrows():
            won_keys.add((w["PlayerID"], w.get("CopySession", 0)))
            if w["FranchiseName"] == selected_franchise:
                my_owned_players.add(w["PlayerName"])

    bids_df = conf_rookie_df[conf_rookie_df["TransactionType"] == "AUCTION_BID"]
    if not bids_df.empty:
        for (pid, cs), group in bids_df.groupby(["PlayerID", "CopySession"]):
            if (pid, cs) in won_keys:
                continue
            top_row = group.loc[group["BidAmount"].idxmax()]
            if top_row["FranchiseName"] == selected_franchise:
                pname = top_row["PlayerName"]
                if pname in out["statuses"]:
                    out["statuses"][pname] = "my_bid"

    for pname in my_owned_players:
        if pname in out["statuses"] and out["statuses"][pname] != "my_bid":
            out["statuses"][pname] = "owned"

    return out


# ---------------------------------------------------------------------------
# Build prospect records — the design's PROSPECT shape, sourced from sheets
# + trained models + (optionally) live state.
# ---------------------------------------------------------------------------

def _build_prospects(
    board_df: pd.DataFrame,
    espn_df: pd.DataFrame,
    gb_model,
    static_repl_prices: dict,
    live_state: dict,
) -> list[dict]:
    """Build the unified prospect list rendered by the design."""
    if board_df.empty:
        return []

    # ESPN headshot lookup (board has its own HeadshotURL column, but ESPN
    # data tends to be richer/more accurate for some prospects).
    espn_lookup: dict[str, dict] = {}
    if not espn_df.empty:
        for _, r in espn_df.iterrows():
            espn_lookup[str(r.get("PlayerName", "")).strip().lower()] = {
                "headshot": r.get("HeadshotURL", ""),
                "espn_grade": r.get("Grade"),
                "espn_rank": r.get("OverallRank"),
                "draft_round": r.get("DraftRound", ""),
                "draft_pick": r.get("DraftPick", ""),
            }

    # Rank within (year, position) by RecruitScore desc to compute posRank.
    if "Position" in board_df.columns and "DraftYear" in board_df.columns:
        board_df = board_df.copy()
        board_df["_posrank"] = (
            board_df.sort_values("RecruitScore", ascending=False)
            .groupby(["DraftYear", "Position"]).cumcount() + 1
        )
    else:
        board_df = board_df.assign(_posrank=0)

    live_prices = live_state.get("live_prices", {})
    live_statuses = live_state.get("statuses", {})
    live_has_data = live_state.get("has_data", False)

    prospects = []
    for _, r in board_df.iterrows():
        name = str(r.get("Player", "")).strip()
        if not name:
            continue
        year = r.get("DraftYear")
        position = str(r.get("Position", "")).strip()
        pid = _prospect_id(name, year)

        # Pricing scenarios
        current = r.get("PredictedCost")
        gb = None
        if gb_model is not None:
            try:
                gb = predict_gb(
                    gb_model, position,
                    r.get("StartupADP"), r.get("ESPNGrade"),
                    r.get("OverallPick"), copy_number=1,
                )
            except Exception:
                gb = None

        repl = static_repl_prices.get(name)

        live_price = live_prices.get(name) if live_has_data else None
        live_status = live_statuses.get(name, "available") if live_has_data else None

        # Primary scenario priority: live > gb > current > repl
        primary_kind = "live" if (live_price and live_price > 0) else (
            "gb" if (gb and gb > 0) else (
                "current" if (current and current > 0) else "live"
            )
        )

        scenarios = _build_scenarios(current, gb, repl, live_price if live_has_data else None)

        # The headline projected number
        proj_lookup = {s["kind"]: s["proj"] for s in scenarios}
        proj = proj_lookup.get(primary_kind, proj_lookup.get("gb", proj_lookup.get("current", 0)))
        sig_lo = sig_hi = 0
        for s in scenarios:
            if s["kind"] == primary_kind:
                sig_lo, sig_hi = s["sigLo"], s["sigHi"]
                break

        # Live delta vs static baseline (use Current as the static yardstick)
        live_delta = 0
        live_note = ""
        if live_has_data and live_price is not None:
            base_for_delta = current if current and current > 0 else (gb or 0)
            try:
                live_delta = int(round(float(live_price) - float(base_for_delta)))
            except (ValueError, TypeError):
                live_delta = 0
            bd = live_state.get("breakdowns", {}).get(name, {})
            copies = bd.get("copies", "")
            if live_status == "taken":
                live_note = "Both copies sold in conference"
            elif live_status == "owned":
                live_note = "You already own a copy"
            elif live_status == "on_board":
                live_note = "Player on the board now"
            elif live_status == "my_bid":
                live_note = "You are the current high bidder"
            elif copies != "":
                live_note = f"{copies} cop{'y' if copies == 1 else 'ies'} remaining"
            else:
                live_note = "Live-adjusted from conference budget"

        # ESPN-derived stat-grid extras
        espn = espn_lookup.get(name.lower(), {})
        headshot = r.get("HeadshotURL") or espn.get("headshot", "")
        espn_grade = r.get("ESPNGrade") or espn.get("espn_grade")
        espn_rank = r.get("ESPNRank") or espn.get("espn_rank")

        # Draft pick label "round.pick" (zero-padded)
        draft_rd = r.get("DraftRd") or espn.get("draft_round", "")
        draft_pk = espn.get("draft_pick", "")
        if not draft_pk and r.get("OverallPick"):
            # Compute pick-within-round (1-based) from OverallPick using 32 per round
            try:
                overall = int(r.get("OverallPick"))
                draft_rd = str(((overall - 1) // 32) + 1)
                draft_pk = str(((overall - 1) % 32) + 1)
            except (ValueError, TypeError):
                pass
        if draft_rd and draft_pk:
            try:
                draft_pick_lbl = f"{int(float(draft_rd))}.{int(float(draft_pk)):02d}"
            except (ValueError, TypeError):
                draft_pick_lbl = "—"
        else:
            draft_pick_lbl = "—"

        adp_val = r.get("StartupADP")
        adp_lbl = f"{adp_val:.1f}" if isinstance(adp_val, (int, float)) and adp_val else "—"

        prospects.append({
            "id": pid,
            "name": name,
            "year": int(year) if pd.notna(year) else None,
            "position": position,
            "college": str(r.get("College", "")).strip(),
            "stars": int(r.get("Rating") or 0),
            "pos_rank": int(r.get("_posrank") or 0),
            "score": float(r.get("RecruitScore") or 0),
            "headshot": str(headshot or ""),
            "scenarios": scenarios,
            "proj": _safe_round(proj),
            "sig_lo": float(sig_lo or 0),
            "sig_hi": float(sig_hi or 0),
            "p80_lo": max(1, _safe_round((proj or 0) - Z80 * (sig_lo or 0))),
            "p80_hi": _safe_round((proj or 0) + Z80 * (sig_hi or 0)),
            "floor": max(1, _safe_round((proj or 0) - ZRANGE * (sig_lo or 0))),
            "ceil":  _safe_round((proj or 0) + ZRANGE * (sig_hi or 0)),
            "primary_kind": primary_kind,
            "live_delta": live_delta,
            "live_note": live_note,
            "live_status": live_status,
            "stats": {
                "espn_grade": _safe_round(espn_grade) if espn_grade else None,
                "espn_rank": _safe_round(espn_rank) if espn_rank else None,
                "recruit_score": float(r.get("RecruitScore") or 0),
                "draft_pick": draft_pick_lbl,
                "adp": adp_lbl,
            },
        })

    return prospects


def _build_scenarios(current, gb, repl, live) -> list[dict]:
    """
    Build up to 3 pricing scenarios for the probability curve.

    Scenario kinds:
      'current' (sheet's PredictedCost — ADP regression)
      'gb'      (gradient boosting baseline)
      'live'    (live-adjusted dynamic price; falls back to static replacement
                 when no live data is present)
    """
    out: list[dict] = []

    def _add(kind, label, proj):
        if proj is None or proj <= 0:
            return
        try:
            if math.isnan(proj):
                return
        except (TypeError, ValueError):
            pass
        sig_lo_frac, sig_hi_frac = DEFAULT_SIG[kind]
        out.append({
            "kind": kind, "label": label,
            "color": SCENARIO_COLORS[kind],
            "proj": float(proj),
            "sigLo": max(1.5, sig_lo_frac * float(proj)),
            "sigHi": max(2.0, sig_hi_frac * float(proj)),
        })

    _add("current", "Market consensus", current)
    _add("gb", "Model baseline", gb)
    if live and live > 0:
        _add("live", "Live-adjusted", live)
    else:
        _add("live", "Replacement-level", repl)

    # Mark which is primary (last one in the list takes precedence; 'live' wins
    # when available, otherwise 'gb', otherwise 'current').
    if out:
        out[-1]["primary"] = True
    return out


# ---------------------------------------------------------------------------
# Probability-curve chart (Plotly)
# ---------------------------------------------------------------------------

def _density(x, proj, sig_lo, sig_hi):
    """Split-normal density (peak 1 at proj)."""
    if sig_lo <= 0 or sig_hi <= 0:
        return 0.0
    s = sig_lo if x <= proj else sig_hi
    return math.exp(-0.5 * ((x - proj) / s) ** 2)


def _prob_curve_svg(scenarios: list[dict], W: int = 460, H: int = 130) -> str:
    """Render the prediction probability curve as inline SVG.

    Ported from pp-charts.jsx so the curve can live inside the detail-panel
    HTML (matching the design) instead of being a separate Streamlit block.
    Drops the interactive hover crosshair — pure SVG inside st.markdown can't
    run JS — but keeps the three-scenario overlay + 80% band + tick labels +
    legend.
    """
    if not scenarios:
        return ""

    primary = next((s for s in scenarios if s.get("primary")), scenarios[-1])

    MG = {"l": 14, "r": 14, "t": 10, "b": 28}
    iw = W - MG["l"] - MG["r"]
    ih = H - MG["t"] - MG["b"]

    floors = [s["proj"] - ZRANGE * s["sigLo"] for s in scenarios]
    ceils = [s["proj"] + ZRANGE * s["sigHi"] for s in scenarios]
    raw_min = max(0, min(floors))
    raw_max = max(ceils)
    pad = max(2, (raw_max - raw_min) * 0.06)
    x_min = max(0, raw_min - pad)
    x_max = raw_max + pad
    if x_max <= x_min:
        x_max = x_min + 1

    def X(v):
        return MG["l"] + ((v - x_min) / (x_max - x_min)) * iw

    base_y = MG["t"] + ih

    def Y(d):
        return MG["t"] + (1 - d) * ih

    p80_lo = max(1, round(primary["proj"] - Z80 * primary["sigLo"]))
    p80_hi = round(primary["proj"] + Z80 * primary["sigHi"])

    N = 110

    def sample(sc):
        pts = []
        for i in range(N + 1):
            x = x_min + (i / N) * (x_max - x_min)
            pts.append((x, _density(x, sc["proj"], sc["sigLo"], sc["sigHi"])))
        return pts

    def line_of(pts):
        return " ".join(
            f"{'M' if i == 0 else 'L'}{X(q[0]):.1f} {Y(q[1]):.1f}"
            for i, q in enumerate(pts)
        )

    prim_pts = sample(primary)
    prim_line = line_of(prim_pts)
    prim_area = f"{prim_line} L{X(x_max):.1f} {base_y} L{X(x_min):.1f} {base_y} Z"

    band_pts = [q for q in prim_pts if p80_lo <= q[0] <= p80_hi]
    band_path = ""
    if band_pts:
        inner = [
            (p80_lo, _density(p80_lo, primary["proj"], primary["sigLo"], primary["sigHi"])),
            *band_pts,
            (p80_hi, _density(p80_hi, primary["proj"], primary["sigLo"], primary["sigHi"])),
        ]
        band_path = (
            " ".join(
                f"{'M' if i == 0 else 'L'}{X(q[0]):.1f} {Y(q[1]):.1f}"
                for i, q in enumerate(inner)
            )
            + f" L{X(p80_hi):.1f} {base_y} L{X(p80_lo):.1f} {base_y} Z"
        )

    # Non-primary scenarios drawn as lines (with dash for "current")
    other_lines = ""
    for s in scenarios:
        if s.get("primary"):
            continue
        line = line_of(sample(s))
        dash = ' stroke-dasharray="5 4"' if s["kind"] == "current" else ""
        other_lines += (
            f'<path d="{line}" fill="none" stroke="{s["color"]}" '
            f'stroke-width="1.6" stroke-opacity="0.85"{dash}/>'
        )

    # Tick labels at p80 bounds + projection point
    ticks = sorted(set([
        round(x_min + pad),
        p80_lo,
        round(primary["proj"]),
        p80_hi,
        round(x_max - pad),
    ]))
    tick_svg = "".join(
        f'<text class="pp-pcurve__tick{" is-proj" if abs(v - primary["proj"]) < 0.5 else ""}" '
        f'x="{X(v):.1f}" y="{base_y + 18}" text-anchor="middle">${v}</text>'
        for v in ticks
    )

    proj_x = X(primary["proj"])
    primary_color = primary["color"]
    band_path_el = (
        f'<path d="{band_path}" fill="url(#pp-pc-band)"/>' if band_path else ""
    )

    svg = (
        f'<svg class="pp-pcurve__svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">'
        f'<defs>'
        f'<linearGradient id="pp-pc-area" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0%" stop-color="#5B9D6B" stop-opacity="0.16"/>'
        f'<stop offset="100%" stop-color="#5B9D6B" stop-opacity="0"/>'
        f'</linearGradient>'
        f'<linearGradient id="pp-pc-band" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0%" stop-color="#6FB47F" stop-opacity="0.40"/>'
        f'<stop offset="100%" stop-color="#5B9D6B" stop-opacity="0.05"/>'
        f'</linearGradient>'
        f'</defs>'
        f'<line class="pp-pcurve__axis" x1="{MG["l"]}" y1="{base_y}" '
        f'x2="{W - MG["r"]}" y2="{base_y}"/>'
        f'<path d="{prim_area}" fill="url(#pp-pc-area)"/>'
        f'{band_path_el}'
        f'{other_lines}'
        f'<path d="{prim_line}" fill="none" stroke="{primary_color}" stroke-width="2.4"/>'
        f'<line class="pp-pcurve__proj" x1="{proj_x:.1f}" y1="{Y(1) - 4}" '
        f'x2="{proj_x:.1f}" y2="{base_y}" style="stroke:{primary_color};"/>'
        f'{tick_svg}'
        f'</svg>'
    )

    # Legend below the SVG
    legend_items = ""
    for s in scenarios:
        is_prim = s.get("primary")
        legend_items += (
            f'<span class="pp-pleg{" is-primary" if is_prim else ""}">'
            f'<span class="pp-pleg__dot" style="background:{s["color"]};"></span>'
            f'<span class="pp-pleg__lbl">{_esc(s["label"])}</span>'
            f'<span class="pp-pleg__val" style="color:{s["color"]};">{_fmt_money(s["proj"])}</span>'
            f'</span>'
        )
    legend = f'<div class="pp-pcurve__legend">{legend_items}</div>'

    return svg + legend


def _prob_curve_figure(scenarios: list[dict]):
    if not scenarios:
        return None

    primary = next((s for s in scenarios if s.get("primary")), scenarios[-1])

    # Common x-range across all scenarios
    floors = [s["proj"] - ZRANGE * s["sigLo"] for s in scenarios]
    ceils =  [s["proj"] + ZRANGE * s["sigHi"] for s in scenarios]
    raw_min = max(0, min(floors))
    raw_max = max(ceils)
    pad = max(2, (raw_max - raw_min) * 0.06)
    x_lo = max(0, raw_min - pad)
    x_hi = raw_max + pad

    xs = []
    n = 110
    for i in range(n + 1):
        xs.append(x_lo + (x_hi - x_lo) * i / n)

    fig = go.Figure()

    # Non-primary scenarios first (so primary draws on top)
    for s in scenarios:
        if s.get("primary"):
            continue
        ys = [_density(x, s["proj"], s["sigLo"], s["sigHi"]) for x in xs]
        dash = "dash" if s["kind"] == "current" else None
        fig.add_trace(go.Scatter(
            x=xs, y=ys, mode="lines",
            line=dict(color=s["color"], width=1.7, dash=dash),
            opacity=0.85,
            name=f'{s["label"]} · {_fmt_money(s["proj"])}',
            hovertemplate=("$%{x:.0f}<extra>" + _esc(s["label"]) + "</extra>"),
        ))

    # Primary: filled area + line + p80 band
    prim_ys = [_density(x, primary["proj"], primary["sigLo"], primary["sigHi"]) for x in xs]
    fig.add_trace(go.Scatter(
        x=xs, y=prim_ys, mode="lines",
        line=dict(color=primary["color"], width=2.4),
        fill="tozeroy",
        fillcolor="rgba(91,157,107,0.16)",
        name=f'{primary["label"]} · {_fmt_money(primary["proj"])}',
        hovertemplate=("$%{x:.0f}<extra>" + _esc(primary["label"]) + "</extra>"),
    ))

    # p80 band markers (vertical lines)
    p80_lo = max(1, primary["proj"] - Z80 * primary["sigLo"])
    p80_hi = primary["proj"] + Z80 * primary["sigHi"]
    fig.add_vline(x=p80_lo, line=dict(color="rgba(91,157,107,0.5)", width=1, dash="dot"))
    fig.add_vline(x=p80_hi, line=dict(color="rgba(91,157,107,0.5)", width=1, dash="dot"))
    fig.add_vline(x=primary["proj"], line=dict(color=primary["color"], width=1.4))

    layout = plotly_layout_defaults()
    layout.update(
        height=190,
        margin=dict(l=10, r=10, t=10, b=24),
        showlegend=True,
        legend=dict(
            orientation="h", yanchor="bottom", y=-0.45,
            xanchor="left", x=0, font=dict(size=10),
        ),
        xaxis=dict(
            tickprefix="$", showgrid=False, zeroline=False,
            showline=True, linecolor="#2A2A2A",
        ),
        yaxis=dict(
            visible=False, showgrid=False, zeroline=False,
            range=[0, 1.15],
        ),
        hovermode="x unified",
    )
    fig.update_layout(**layout)
    return fig


# ---------------------------------------------------------------------------
# HTML render helpers
# ---------------------------------------------------------------------------

def _topbar_html(synced_at: str, live_has_data: bool) -> str:
    if live_has_data and synced_at:
        feed_val = f"Live · synced {_esc(synced_at)}"
    else:
        feed_val = "Static · pre-auction"

    ring_html = (
        '<span class="pp-live-ind"><span class="pp-live-ind__ring">'
        '<i><span class="pp-live-ind__dot"></span></i></span></span>'
    )
    return f"""
    <div class="pp-topbar">
      <div class="pp-topbar__brand">
        <span class="pp-topbar__mark">C</span>
        <h1 class="pp-topbar__h1">Price Prediction</h1>
      </div>
      <div class="pp-topbar__spacer"></div>
      <div class="pp-topbar__feed">
        {ring_html}
        <div class="pp-topbar__feed-txt">
          <span class="pp-topbar__feed-lbl">Model feed</span>
          <span class="pp-topbar__feed-val">{feed_val}</span>
        </div>
      </div>
    </div>
    """


def _year_link(year_val, current_pid: str, params: dict) -> str:
    """Build the relative href for a year-selector anchor."""
    p = dict(params)
    p["pp_year"] = str(year_val)
    if current_pid:
        p["pp_pid"] = current_pid
    return "?" + urlencode(p)


def _year_selector_html(
    active_year, counts: dict, total: int, current_pid: str, params: dict,
    years: list,
) -> str:
    """Render the year segmented control as HTML anchors."""
    active_str = "all" if active_year == "all" else str(active_year)
    tag = YEAR_TAGS.get(active_str, "")
    if active_str != "all":
        tag = f"Draft class {active_str}"

    btns = []
    btns.append(
        f'<a class="pp-yearseg__btn{" is-on" if active_year == "all" else ""}" '
        f'href="{_year_link("all", "", params)}" target="_self">All'
        f'<span class="pp-yearseg__count">{total}</span></a>'
    )
    for y in years:
        on = " is-on" if str(active_year) == str(y) else ""
        c = counts.get(int(y), 0)
        btns.append(
            f'<a class="pp-yearseg__btn{on}" '
            f'href="{_year_link(y, "", params)}" target="_self">{y}'
            f'<span class="pp-yearseg__count">{c}</span></a>'
        )

    return f"""
    <div class="pp-yearbar">
      <span class="pp-yearbar__lbl">Draft Class</span>
      <div class="pp-yearseg" role="tablist">{"".join(btns)}</div>
      <span class="pp-yearbar__tag">{_esc(tag)}</span>
    </div>
    """


def _live_bar_html(live_state: dict, selected_franchise: str) -> str:
    if not live_state.get("has_data"):
        return ""
    conf_total = live_state["conf_total"]
    conf_remaining = live_state["conf_remaining"]
    you = live_state.get("franchise_remaining", 0)
    ceiling = live_state.get("default_ceiling", 0)
    pct = (
        f" · {conf_remaining / conf_total * 100:.0f}%"
        if conf_total > 0 else ""
    )
    return f"""
    <div class="pp-livebar">
      <span class="pp-livebar__lbl">Live Mode</span>
      <span class="pp-livebar__stat">Conf budget <b>${conf_total:,.0f}</b></span>
      <span class="pp-livebar__stat">Remaining <b>${conf_remaining:,.0f}</b>{pct}</span>
      <span class="pp-livebar__stat">{_esc(selected_franchise)} left <b>${you:,.0f}</b></span>
      <span class="pp-livebar__stat">Base ceiling <b>${ceiling:,.0f}</b></span>
    </div>
    """


def _stars_html(n: int, size_px: int = 14) -> str:
    n = max(0, min(5, int(n or 0)))
    tier = _star_tier_cls(n)
    cells = []
    for i in range(1, 6):
        on = " is-on " + tier if i <= n else ""
        cells.append(f'<span class="pp-stars__s{on}">★</span>')
    return f'<span class="pp-stars" style="font-size:{size_px}px">{"".join(cells)}</span>'


def _starshort_html(n: int) -> str:
    n = max(0, min(5, int(n or 0)))
    return f'<span class="pp-starshort {_star_tier_cls(n)}">★{n}</span>'


def _shot_html(prospect: dict, size: int = 42) -> str:
    """Round headshot or initials-on-gradient fallback."""
    head = prospect.get("headshot") or ""
    if head.startswith("http"):
        inner = (
            f'<img src="{_esc(head)}" alt="{_esc(prospect["name"])}" '
            f'loading="lazy" onerror="this.style.display=&quot;none&quot;"/>'
        )
    else:
        inner = (
            f'<span class="pp-shot__initials" '
            f'style="font-size:{int(size * 0.4)}px;">{_esc(_initials(prospect["name"]))}</span>'
        )
    accent_color = POS_COLORS.get(prospect.get("position", ""), "#5A5A5A")
    return (
        f'<div class="pp-shot" style="width:{size}px;height:{size}px;">'
        f'{inner}<span class="pp-shot__accent" style="background:{accent_color};"></span></div>'
    )


def _pos_tag_html(pos: str) -> str:
    color = POS_COLORS.get(pos, "#5A5A5A")
    text = _pos_text_color(pos)
    return (
        f'<span class="pp-pos-tag" style="background:{color};color:{text};">{_esc(pos)}</span>'
    )


def _college_logo_html(college: str, size: int = 20) -> str:
    url = college_logo_url(college)
    if not url:
        return ""
    return (
        f'<span class="pp-tlogo"><span class="pp-tlogo__badge" '
        f'style="width:{size}px;height:{size}px;">'
        f'<img class="pp-tlogo__img" src="{_esc(url)}" alt="{_esc(college)}" loading="lazy"/>'
        f'</span></span>'
    )


def _row_link(pid: str, params: dict) -> str:
    p = dict(params)
    p["pp_pid"] = pid
    return "?" + urlencode(p)


def _detail_panel_html(prospect: dict | None) -> str:
    if not prospect:
        return (
            '<div class="pp-dpanel-wrap"><div class="pp-dpanel" '
            'style="padding:36px;text-align:center;color:var(--fg-tertiary);">'
            'Select a prospect on the board below to see their pricing detail.'
            '</div></div>'
        )

    p = prospect
    stats = p["stats"]
    college = p["college"]

    # Photo zone
    head = p.get("headshot") or ""
    if head.startswith("http"):
        photo_inner = (
            f'<img src="{_esc(head)}" alt="{_esc(p["name"])}" '
            f'onerror="this.style.display=&quot;none&quot;"/>'
        )
    else:
        photo_inner = (
            '<div class="pp-dpanel__photo-empty">'
            '<svg viewBox="0 0 56 56">'
            '<circle cx="28" cy="20" r="9"/>'
            '<path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50"/>'
            '</svg></div>'
        )
    # School color bar at top of photo
    accent_color = POS_COLORS.get(p.get("position", ""), "#2A2A2A")

    # Identity zone
    class_chip = (
        f'<span class="pp-dpanel__cls-chip">Class of ’{str(p["year"])[-2:]}</span>'
        if p.get("year") else ""
    )

    # Pricing zone
    primary = next((s for s in p["scenarios"] if s.get("primary")), None)
    if primary:
        hero_val = _fmt_money(primary["proj"])
        p80_lo = max(1, int(round(primary["proj"] - Z80 * primary["sigLo"])))
        p80_hi = int(round(primary["proj"] + Z80 * primary["sigHi"]))
        band_html = (
            f'<span class="pp-dpanel__band">80% likely '
            f'<b>{_fmt_money(p80_lo)}–{_fmt_money(p80_hi)}</b></span>'
        )
        live_label = "Live-adjusted" if primary["kind"] == "live" else "Model baseline"
    else:
        hero_val = "$—"
        band_html = ""
        live_label = "No prediction"

    delta = p.get("live_delta") or 0
    if delta == 0:
        delta_html = '<span class="pp-ldelta pp-ldelta--flat">±$0</span>'
    elif delta > 0:
        delta_html = f'<span class="pp-ldelta pp-ldelta--up">▲ +${delta}</span>'
    else:
        delta_html = f'<span class="pp-ldelta pp-ldelta--down">▼ −${abs(delta)}</span>'

    note = _esc(p.get("live_note") or "—")

    curve_svg = _prob_curve_svg(p["scenarios"])

    return f"""
    <div class="pp-dpanel-wrap">
      <div class="pp-dpanel">
        <div class="pp-dpanel__photo">
          <div class="pp-dpanel__photo-bar" style="background:{accent_color};"></div>
          {photo_inner}
        </div>
        <div class="pp-dpanel__id">
          <div class="pp-dpanel__tagrow">
            {_pos_tag_html(p.get("position", ""))}
            {class_chip}
          </div>
          <div class="pp-dpanel__name">{_esc(p["name"])}</div>
          <div class="pp-dpanel__starline">
            {_stars_html(p["stars"], size_px=18)}
            <span class="pp-dpanel__starnum">{p["stars"]}.0</span>
          </div>
          <div class="pp-dpanel__sub">{_esc(college)}</div>
        </div>
        <div class="pp-dpanel__stats">
          <div class="pp-dstat pp-dstat--hero">
            <span class="pp-dstat__lbl">Recruit Score</span>
            <span class="pp-dstat__val" style="color:var(--gold);">{stats["recruit_score"]:.1f}</span>
          </div>
          <div class="pp-dstat">
            <span class="pp-dstat__lbl">ESPN Grade</span>
            <span class="pp-dstat__val">{stats["espn_grade"] if stats["espn_grade"] else "—"}</span>
          </div>
          <div class="pp-dstat">
            <span class="pp-dstat__lbl">ESPN Rank</span>
            <span class="pp-dstat__val">{"#" + str(stats["espn_rank"]) if stats["espn_rank"] else "—"}</span>
          </div>
          <div class="pp-dstat">
            <span class="pp-dstat__lbl">Pos Rank</span>
            <span class="pp-dstat__val">{_esc(p["position"])}{p["pos_rank"] or "—"}</span>
          </div>
          <div class="pp-dstat">
            <span class="pp-dstat__lbl">Draft Pick</span>
            <span class="pp-dstat__val">{_esc(stats["draft_pick"])}</span>
          </div>
          <div class="pp-dstat">
            <span class="pp-dstat__lbl">ADP</span>
            <span class="pp-dstat__val">{_esc(stats["adp"])}</span>
          </div>
        </div>
        <div class="pp-dpanel__pred">
          <div class="pp-dpanel__pred-row1">
            <span class="pp-dpanel__pred-eyebrow">Predicted Price · per copy</span>
            <div class="pp-dpanel__live-tag">
              <span class="pp-live-ind"><span class="pp-live-ind__ring">
              <i><span class="pp-live-ind__dot"></span></i></span></span>
              <span class="pp-dpanel__live-lbl">{_esc(live_label)}</span>
            </div>
          </div>
          <div class="pp-dpanel__pred-row2">
            <div class="pp-dpanel__hero-row">
              <span class="pp-dpanel__pred-hero">{hero_val}</span>
              {delta_html}
            </div>
            {band_html}
          </div>
          <span class="pp-dpanel__live-note">{note}</span>
          {curve_svg}
        </div>
      </div>
    </div>
    """


def _board_chrome_html(year_label: str, row_count: int) -> str:
    """Render the board page header + column header (no rows)."""
    return f"""
    <div class="pp-page">
      <div class="pp-board-head">
        <span class="pp-board-head__title">{_esc(year_label)} Big Board</span>
        <span class="pp-board-head__meta">{row_count} prospects · ranked by composite · projections per copy</span>
        <span class="pp-board-head__hint">Tap a prospect to load the prediction above</span>
      </div>
      <div class="pp-bhead">
        <span>#</span>
        <span></span>
        <span>Prospect</span>
        <span>Stars</span>
        <span class="t-r">Comp</span>
        <span class="t-r">Projected</span>
      </div>
    </div>
    """


def _row_html(p: dict, rank: int, show_year: bool, active: bool) -> str:
    """Render one Big Board row as a non-clickable div.

    Click handling is supplied by an overlaid st.button — see render() for
    the container/button pairing.
    """
    year_chip = (
        f'<span class="pp-brow__year">’{str(p["year"])[-2:]}</span>'
        if show_year and p.get("year") else ""
    )
    active_cls = " is-active" if active else ""
    return f"""
    <div class="pp-brow{active_cls}">
      <span class="pp-brow__rank">{rank}</span>
      <span class="pp-brow__shot">{_shot_html(p, 42)}</span>
      <span class="pp-brow__id">
        <span class="pp-brow__name">{_esc(p["name"])}</span>
        <span class="pp-brow__meta">
          {_pos_tag_html(p.get("position", ""))}
          <span class="pp-brow__posrank">{_esc(p.get("position", ""))}{p.get("pos_rank") or ""}</span>
          {year_chip}
          {_college_logo_html(p.get("college", ""), 18)}
          <span class="pp-brow__school">{_esc(p.get("college", ""))}</span>
        </span>
      </span>
      <span class="pp-brow__stars">{_stars_html(p["stars"], 13)}</span>
      <span class="pp-brow__score">{p["score"]:.1f}</span>
      <span class="pp-brow__proj">
        <span class="pp-brow__proj-val">{_fmt_money(p["proj"])}</span>
        <span class="pp-brow__proj-range">{_fmt_money(p["floor"])}–{_fmt_money(p["ceil"])}</span>
      </span>
    </div>
    """


# ---------------------------------------------------------------------------
# Methodology dialog
# ---------------------------------------------------------------------------

@st.dialog("How it works", width="large")
def _show_methodology_dialog(pricing_model, gb_metrics, board_df, gb_model):
    """Modal containing model methodology + diagnostics."""
    st.markdown("### Recruit Score")
    st.markdown(DESCRIPTIONS["recruit_score"])
    st.markdown(DESCRIPTIONS["star_ratings"])
    st.markdown("---")

    st.markdown("### Current (ADP Regression)")
    st.markdown(DESCRIPTIONS["adp_regression_detail"])
    if pricing_model and pricing_model.get("adp_regression"):
        cols = st.columns(len(pricing_model["adp_regression"]))
        for col, (pos, reg) in zip(cols, pricing_model["adp_regression"].items()):
            col.metric(f"{pos} R²", f"{reg['r2']:.3f}", help=f"n={reg['n']}")
    st.markdown("---")

    st.markdown("### Multi-Feature (Gradient Boosting)")
    st.markdown(DESCRIPTIONS["gradient_boosting_detail"])
    if gb_metrics and "error" not in gb_metrics:
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("R² (train)", f"{gb_metrics['r2']:.3f}")
        m2.metric("MAE", f"${gb_metrics['mae']:.1f}")
        m3.metric("CV MAE", f"${gb_metrics['cv_mae']:.1f} ± {gb_metrics['cv_mae_std']:.1f}")
        m4.metric("Training Rows", gb_metrics["n_train"])

        if "feature_importances" in gb_metrics:
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
            layout.update(height=240, margin=dict(l=10, r=10, t=10, b=10))
            fig.update_layout(**layout)
            st.plotly_chart(fig, use_container_width=True)
    st.markdown("---")

    st.markdown("### Replacement-Level (VAR)")
    st.markdown(DESCRIPTIONS["replacement_level_detail"])
    if pricing_model:
        b1, b2 = st.columns(2)
        b1.metric("Budget (16-tm)", f"${pricing_model['conference_budgets'].get(16, 0):,.0f}")
        b2.metric("Budget (20-tm)", f"${pricing_model['conference_budgets'].get(20, 0):,.0f}")
    st.markdown("---")

    st.markdown("### Copy & Scarcity")
    st.markdown(DESCRIPTIONS["copy_scarcity_detail"])
    st.markdown("---")

    # Current vs Multi-Feature scatter
    if gb_model is not None and not board_df.empty:
        st.markdown("### Current vs Multi-Feature Model")
        scatter_data = []
        for _, row in board_df.iterrows():
            cur = row.get("PredictedCost")
            if cur is None or pd.isna(cur):
                continue
            try:
                gb_pred = predict_gb(
                    gb_model, row.get("Position"),
                    row.get("StartupADP"), row.get("ESPNGrade"),
                    row.get("OverallPick"), copy_number=1,
                )
            except Exception:
                continue
            if not gb_pred or gb_pred <= 0:
                continue
            scatter_data.append({
                "Player": row.get("Player"),
                "Position": row.get("Position"),
                "Year": int(row["DraftYear"]) if pd.notna(row.get("DraftYear")) else "",
                "Current": cur,
                "Multi-Feature": gb_pred,
            })
        if scatter_data:
            scatter_df = pd.DataFrame(scatter_data)
            pos_colors = {"QB": "#C9A227", "RB": "#3B82C4", "WR": "#7BA4C9", "TE": "#6A6A6A"}
            fig = px.scatter(
                scatter_df, x="Current", y="Multi-Feature",
                color="Position", hover_name="Player",
                color_discrete_map=pos_colors,
            )
            mx = max(scatter_df["Current"].max(), scatter_df["Multi-Feature"].max())
            fig.add_trace(go.Scatter(
                x=[0, mx], y=[0, mx], mode="lines",
                line=dict(dash="dash", color="#555"), showlegend=False,
            ))
            layout = plotly_layout_defaults()
            layout.update(
                height=400,
                xaxis_title="Current Model ($)",
                yaxis_title="Multi-Feature Model ($)",
                margin=dict(l=10, r=10, t=10, b=40),
            )
            fig.update_layout(**layout)
            st.plotly_chart(fig, use_container_width=True)


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------

def render() -> None:
    inject_prediction_css()

    years = get_available_years()
    if not years:
        st.info("No data found. Check your Google Sheet connection.")
        return

    league_year = get_league_year()
    default_year_str = str(league_year) if league_year in years else str(years[0])

    # --- Read query-params (URL is the source of truth for year + selection) ---
    qp = dict(st.query_params)
    active_year_raw = qp.get("pp_year", default_year_str)
    show_all_years = active_year_raw == "all"

    # --- Load data ---
    board_df_all = load_recruiting_board(None)
    if board_df_all.empty:
        st.info("No recruiting board data available.")
        return

    auction_df = load_auction_data()
    adp_df = load_dlf_adp()
    espn_df = load_espn_prospects()

    pricing_model, gb_model, gb_metrics = _train_models(auction_df, adp_df, espn_df)

    # Static replacement prices use the full board (cross-position budget)
    static_repl_map: dict[str, float] = {}
    if pricing_model:
        repl_df = calc_replacement_prices(
            board_df_all, pricing_model["conference_budgets"],
            pricing_model.get("copy_discount_curve", {}),
        )
        if not repl_df.empty:
            for _, row in repl_df.iterrows():
                static_repl_map[row["Player"]] = row.get("copy1_16", 0)

    # --- Live mode controls (below year bar) ---
    # We render them with real Streamlit selectboxes for usability; the
    # ".pp-livebar" HTML strip below summarizes the resulting budget state.
    fl_df = load_franchise_lookup()
    live_state: dict = {"has_data": False, "live_prices": {}, "statuses": {}, "breakdowns": {}}
    selected_conf = ""
    selected_franchise = ""

    # --- Counts for the year-selector badges ---
    counts: dict[int, int] = {}
    if "DraftYear" in board_df_all.columns:
        counts = (
            board_df_all["DraftYear"].dropna().astype(int)
            .value_counts().to_dict()
        )
    total = sum(counts.values())

    # --- Render top bar + year selector (HTML) ---
    # We need params to build the year-selector hrefs that preserve other state.
    base_params = {k: v for k, v in qp.items() if k not in ("pp_pid",)}
    # Strip our own keys before re-adding fresh values
    base_params.pop("pp_year", None)

    _html(_topbar_html(synced_at="", live_has_data=False))
    _html(_year_selector_html(
        active_year="all" if show_all_years else int(active_year_raw),
        counts=counts, total=total,
        current_pid="",  # we want clicking a year to reset selection to top-ranked
        params=base_params, years=years,
    ))

    # --- Two extra Streamlit controls: live mode toggle + how-it-works ---
    ctrl1, ctrl2, ctrl3 = st.columns([0.32, 0.32, 0.36])
    with ctrl1:
        repl_mode = st.radio(
            "Replacement-Level Pricing",
            ["Static", "Live"],
            horizontal=True,
            key="pp_repl_mode",
            help="Static: pre-auction baseline. Live: adjusts based on real auction activity.",
            label_visibility="visible",
        )
    with ctrl2:
        sort_choice = st.selectbox(
            "Sort by",
            ["Big board rank", "Projected price", "Composite", "Stars", "Player A–Z"],
            key="pp_sort",
        )
    with ctrl3:
        st.markdown("&nbsp;", unsafe_allow_html=True)
        if st.button("ⓘ  How it works", key="pp_info_btn", use_container_width=True):
            _show_methodology_dialog(pricing_model, gb_metrics, board_df_all, gb_model)

    # --- Live mode selectors (rendered only when Live is on) ---
    if repl_mode == "Live":
        conf_list = sorted(CONFERENCES.keys())
        conf_col, fran_col = st.columns(2)
        selected_conf = conf_col.selectbox("Conference", conf_list, key="pp_conf")
        if not fl_df.empty:
            conf_franchises = fl_df[fl_df["Conference"] == selected_conf]["TeamName"].tolist()
        else:
            conf_franchises = []
        selected_franchise = fran_col.selectbox(
            "Your Team",
            conf_franchises if conf_franchises else ["(none)"],
            key="pp_franchise",
        )
        if selected_franchise == "(none)":
            selected_franchise = ""

        live_state = _load_live_state(
            league_year, selected_conf, selected_franchise,
            board_df_all, pricing_model,
        )
        # Re-render the topbar with live indicator (we left it static above so
        # the topbar HTML showed first; now we know if live data exists).
        # Showing the live bar with stats is the more visible signal.
        _html(_live_bar_html(live_state, selected_franchise))

    # --- Search bar ---
    search = st.text_input(
        "Search prospects",
        placeholder="Player name...",
        key="pp_search",
        label_visibility="collapsed",
    )

    # --- Filter board to active year ---
    if show_all_years:
        board_view = board_df_all.copy()
    else:
        try:
            year_int = int(active_year_raw)
        except (TypeError, ValueError):
            year_int = league_year if league_year in years else years[0]
        board_view = board_df_all[board_df_all["DraftYear"] == year_int].copy()

    if board_view.empty:
        st.info("No prospects found for this draft class.")
        return

    # --- Build prospect records ---
    prospects = _build_prospects(
        board_view, espn_df, gb_model, static_repl_map, live_state,
    )

    # Canonical big-board rank: composite score desc
    prospects.sort(key=lambda p: p["score"], reverse=True)

    # Search filter
    if search:
        s = search.strip().lower()
        prospects = [p for p in prospects if s in p["name"].lower()]

    # Sort (matches the design's SORTS options)
    if sort_choice == "Projected price":
        prospects.sort(key=lambda p: p["proj"], reverse=True)
    elif sort_choice == "Composite":
        prospects.sort(key=lambda p: p["score"], reverse=True)
    elif sort_choice == "Stars":
        prospects.sort(key=lambda p: (p["stars"], -p["pos_rank"]), reverse=True)
    elif sort_choice == "Player A–Z":
        prospects.sort(key=lambda p: p["name"].lower())
    # else: "Big board rank" — already sorted

    # Active selection: session_state is the source of truth so clicks are
    # instant (no browser navigation). Deep-link compatibility: if a URL
    # arrives with ?pp_pid=, seed session_state from it on first run.
    if "pp_active_pid" not in st.session_state:
        st.session_state.pp_active_pid = qp.get("pp_pid", "")

    active_pid = st.session_state.pp_active_pid
    selected = next((p for p in prospects if p["id"] == active_pid), None)
    if selected is None and prospects:
        selected = prospects[0]
        active_pid = selected["id"]
        st.session_state.pp_active_pid = active_pid

    # --- Detail panel (includes the probability curve as inline SVG) ---
    _html(_detail_panel_html(selected))

    # --- Big Board ---
    year_label = "All Classes" if show_all_years else str(active_year_raw)

    _html(_board_chrome_html(year_label, len(prospects)))

    if not prospects:
        _html('<div class="pp-tbl__empty">No prospects match your filters.</div>')
        return

    # Each row is a Streamlit container whose ".st-key-pp_row_<id>" class
    # we target in CSS to overlay an invisible button. The button captures
    # clicks via Streamlit's widget protocol (instant rerun, no page reload).
    with st.container(key="pp_board_wrap"):
        for i, p in enumerate(prospects, start=1):
            is_active = p["id"] == active_pid
            with st.container(key=f"pp_row_{p['id']}"):
                _html(_row_html(p, i, show_all_years, is_active))
                if st.button(" ", key=f"pp_btn_{p['id']}", use_container_width=True):
                    st.session_state.pp_active_pid = p["id"]
                    st.rerun()
