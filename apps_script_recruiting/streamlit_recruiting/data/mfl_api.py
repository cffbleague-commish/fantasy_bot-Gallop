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
    """Generic MFL API fetch."""
    api_key = st.secrets.get("mfl_api_key", "")
    league_id = st.secrets.get("mfl_league_id", "")

    if not api_key or not league_id:
        return None

    params = {
        "TYPE": type_param,
        "L": league_id,
        "APIKEY": api_key,
        "JSON": "1",
    }
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
