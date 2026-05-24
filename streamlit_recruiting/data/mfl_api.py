"""
MFL API client for roster data.
Used by the Team Needs tab to fetch current team rosters.
"""

import streamlit as st
import requests
import pandas as pd
from typing import Optional

from models.config import POSITIONS


MFL_BASE_URL = "https://api.myfantasyleague.com"


def _mfl_fetch(year: int, type_param: str, extra_params: dict = None) -> Optional[dict]:
    """Generic MFL API fetch.

    Only ``mfl_league_id`` is required in secrets.  The API key is optional —
    many MFL endpoints (league settings, rosters, players) are public.
    """
    league_id = st.secrets.get("mfl_league_id", "")
    if not league_id:
        return None

    api_key = st.secrets.get("mfl_api_key", "")

    params = {
        "TYPE": type_param,
        "L": league_id,
        "JSON": "1",
    }
    if api_key:
        params["APIKEY"] = api_key
    if extra_params:
        params.update(extra_params)

    url = f"{MFL_BASE_URL}/{year}/export"
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        st.warning(f"MFL API error: {e}")
        return None


@st.cache_data(ttl=300)
def fetch_auction_budgets(year: int) -> dict[str, float]:
    """Fetch per-franchise auction starting budgets from MFL league settings.

    Reads the ``auctionStartAmount`` field from the TYPE=league endpoint.
    Each franchise may have its own starting amount; falls back to the
    league-level default when a per-franchise value isn't set.

    Makes a direct HTTP request (the league endpoint is public) so this
    works even when ``mfl_api_key`` is not configured.

    Returns dict mapping FranchiseID (normalized, no leading zeros) to budget.
    Returns empty dict if the league doesn't use auctions or the API call fails.
    """
    league_id = st.secrets.get("mfl_league_id", "")
    if not league_id:
        return {}

    params = {"TYPE": "league", "L": league_id, "JSON": "1"}
    api_key = st.secrets.get("mfl_api_key", "")
    if api_key:
        params["APIKEY"] = api_key

    url = f"{MFL_BASE_URL}/{year}/export"
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        st.warning(f"MFL budget fetch error: {e}")
        return {}

    league = data.get("league", {})
    league_budget = _safe_num(league.get("auctionStartAmount"))

    franchises = league.get("franchises", {}).get("franchise", [])
    if isinstance(franchises, dict):
        franchises = [franchises]

    budgets = {}
    for f in franchises:
        fid = f.get("id", "").lstrip("0") or "0"
        franchise_budget = _safe_num(f.get("auctionStartAmount"))
        budget = franchise_budget if franchise_budget is not None else league_budget
        if budget is not None:
            budgets[fid] = budget

    return budgets


def _safe_num(val) -> float | None:
    """Convert a value to float, returning None for empty/invalid."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


@st.cache_data(ttl=3600)
def fetch_players(year: int) -> pd.DataFrame:
    """Fetch all players from MFL. Returns DataFrame with PlayerID, Name, Position, Team."""
    data = _mfl_fetch(year, "players", {"DETAILS": "1"})
    if not data:
        return pd.DataFrame()

    players_raw = data.get("players", {}).get("player", [])
    if isinstance(players_raw, dict):
        players_raw = [players_raw]

    rows = []
    for p in players_raw:
        pos = p.get("position", "")
        if pos not in POSITIONS:
            continue
        rows.append({
            "PlayerID": p.get("id", ""),
            "Name": p.get("name", ""),
            "Position": pos,
            "Team": p.get("team", ""),
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600)
def fetch_rosters(year: int) -> pd.DataFrame:
    """
    Fetch all rosters from MFL.
    Returns DataFrame with FranchiseID, PlayerID.
    """
    data = _mfl_fetch(year, "rosters")
    if not data:
        return pd.DataFrame()

    franchises = data.get("rosters", {}).get("franchise", [])
    if isinstance(franchises, dict):
        franchises = [franchises]

    rows = []
    for f in franchises:
        fid = f.get("id", "").lstrip("0") or "0"  # Normalize "0001" -> "1"
        players = f.get("player", [])
        if isinstance(players, dict):
            players = [players]
        for p in players:
            rows.append({
                "FranchiseID": fid,
                "PlayerID": p.get("id", ""),
            })

    return pd.DataFrame(rows)


def get_roster_composition(year: int) -> pd.DataFrame:
    """
    Get roster composition for all teams.
    Returns DataFrame: FranchiseID, QB, RB, WR, TE, Total.
    """
    rosters = fetch_rosters(year)
    players = fetch_players(year)

    if rosters.empty or players.empty:
        return pd.DataFrame()

    # Join rosters with player positions
    merged = rosters.merge(players[["PlayerID", "Position"]], on="PlayerID", how="left")
    merged = merged.dropna(subset=["Position"])

    # Pivot to get position counts per franchise
    counts = merged.groupby(["FranchiseID", "Position"]).size().unstack(fill_value=0)
    for pos in POSITIONS:
        if pos not in counts.columns:
            counts[pos] = 0

    counts["Total"] = counts[POSITIONS].sum(axis=1)
    counts = counts.reset_index()

    return counts
