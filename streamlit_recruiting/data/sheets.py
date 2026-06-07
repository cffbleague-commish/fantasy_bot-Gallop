"""
Google Sheets read-only data layer.
Uses gspread + service account to read from the recruiting spreadsheet.
All data is cached with st.cache_data for performance.
"""

import streamlit as st
import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

from models.config import (
    SHEET_NAMES, EXCLUDE_YEARS,
    RECRUITING_BOARD_COLS, AUCTION_DATA_COLS, ESPN_PROSPECTS_COLS,
    DLF_ADP_COLS, FRANCHISE_LOOKUP_COLS, RECRUITING_GRADES_COLS,
    PLAYER_GRADES_COLS, RECRUITING_WRITEUPS_COLS, LIVE_AUCTION_COLS,
)
from utils.parsing import parse_dollar, parse_dollar_savings, parse_confidence


SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


@st.cache_resource
def _get_gspread_client() -> gspread.Client:
    """Authenticate via service account from Streamlit secrets."""
    creds_info = dict(st.secrets["gcp_service_account"])
    # Single-quoted TOML keeps \n as literal text; the auth library needs real newlines
    if "private_key" in creds_info:
        creds_info["private_key"] = creds_info["private_key"].replace("\\n", "\n")
    creds = Credentials.from_service_account_info(creds_info, scopes=SCOPES)
    return gspread.authorize(creds)


def _get_sheet_data(tab_name: str) -> list[list]:
    """Read all values from a sheet tab. Returns empty list if tab doesn't exist."""
    client = _get_gspread_client()
    sheet_id = st.secrets["google_sheet_id"]
    try:
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.worksheet(tab_name)
        return worksheet.get_all_values()
    except gspread.exceptions.WorksheetNotFound:
        return []
    except Exception as e:
        st.warning(f"Error reading sheet '{tab_name}': {e}")
        return []


def _safe_float(val) -> float | None:
    """Convert a value to float, returning None for empty/invalid.

    Handles currency-formatted strings (e.g. "$1,234") from Google Sheets,
    which returns formatted display values via get_all_values().
    """
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        pass
    # Strip currency symbols and commas, then retry
    if isinstance(val, str):
        cleaned = val.replace("$", "").replace(",", "").strip()
        if cleaned:
            try:
                return float(cleaned)
            except (ValueError, TypeError):
                pass
    return None


def _safe_int(val) -> int | None:
    """Convert a value to int, returning None for empty/invalid."""
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


@st.cache_data(ttl=300)
def load_recruiting_board(year: int | None = None) -> pd.DataFrame:
    """Load RecruitingBoard sheet as a typed DataFrame."""
    data = _get_sheet_data(SHEET_NAMES["recruitingBoard"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    # Type conversions
    c = RECRUITING_BOARD_COLS
    col_names = list(df.columns)

    df["DraftYear"] = df.iloc[:, c["DraftYear"]].apply(_safe_int)
    df["Rating"] = df.iloc[:, c["Rating"]].apply(_safe_int)
    df["ESPNGrade"] = df.iloc[:, c["ESPNGrade"]].apply(_safe_float)
    df["ESPNRank"] = df.iloc[:, c["ESPNRank"]].apply(_safe_int)
    df["PosRank"] = df.iloc[:, c["PosRank"]].apply(_safe_int)
    df["DraftCapital"] = df.iloc[:, c["DraftCapital"]].apply(_safe_float)
    df["StartupADP"] = df.iloc[:, c["StartupADP"]].apply(_safe_float)
    df["RecruitScore"] = df.iloc[:, c["RecruitScore"]].apply(_safe_float)
    df["PredictedCost"] = df.iloc[:, c["PredictedCost"]].apply(parse_dollar)
    df["Copy1_16"] = df.iloc[:, c["Copy1_16"]].apply(parse_dollar)
    df["Copy2_16"] = df.iloc[:, c["Copy2_16"]].apply(parse_dollar)
    df["Copy1_20"] = df.iloc[:, c["Copy1_20"]].apply(parse_dollar)
    df["Copy2_20"] = df.iloc[:, c["Copy2_20"]].apply(parse_dollar)
    df["SampleN"] = df.iloc[:, c["SampleN"]].apply(_safe_int)
    df["OverallPick"] = df.iloc[:, c["DraftPick"]].apply(_safe_int)

    # Parse confidence into separate columns
    conf_parsed = df.iloc[:, c["Confidence"]].apply(parse_confidence)
    df["ConfidenceLabel"] = conf_parsed.apply(lambda x: x[0])
    df["ConfidenceScore"] = conf_parsed.apply(lambda x: x[1])

    # Rename key columns for consistent access
    df.rename(columns={
        col_names[c["Stars"]]: "StarsDisplay",
        col_names[c["Player"]]: "Player",
        col_names[c["Position"]]: "Position",
        col_names[c["College"]]: "College",
        col_names[c["DraftRd"]]: "DraftRd",
        col_names[c["ADPTier"]]: "ADPTier",
        col_names[c["PriceRange"]]: "PriceRange",
        col_names[c["PriceSource"]]: "PriceSource",
        col_names[c["DataSource"]]: "DataSource",
        col_names[c["HeadshotURL"]]: "HeadshotURL",
    }, inplace=True)

    if year is not None:
        df = df[df["DraftYear"] == year].copy()

    return df


@st.cache_data(ttl=300)
def load_auction_data() -> pd.DataFrame:
    """Load AuctionData sheet as a typed DataFrame. Excludes startup year."""
    data = _get_sheet_data(SHEET_NAMES["auctionData"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = AUCTION_DATA_COLS
    df["AuctionYear"] = df.iloc[:, c["AuctionYear"]].apply(_safe_int)
    df["PlayerID"] = df.iloc[:, c["PlayerID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)
    df["NFLTeam"] = df.iloc[:, c["NFLTeam"]].astype(str)
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].astype(str)
    df["DraftRound"] = df.iloc[:, c["DraftRound"]].astype(str)
    df["DraftPick"] = df.iloc[:, c["DraftPick"]].astype(str)
    df["FranchiseID"] = df.iloc[:, c["FranchiseID"]].astype(str)
    df["FranchiseName"] = df.iloc[:, c["FranchiseName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["BidAmount"] = df.iloc[:, c["BidAmount"]].apply(_safe_float).fillna(0)
    df["IsRookie"] = df.iloc[:, c["IsRookie"]].astype(str).str.upper() == "TRUE"

    # Exclude startup year
    df = df[~df["AuctionYear"].isin(EXCLUDE_YEARS)].copy()

    return df


@st.cache_data(ttl=300)
def load_espn_prospects(year: int | None = None) -> pd.DataFrame:
    """Load ESPNProspects sheet."""
    data = _get_sheet_data(SHEET_NAMES["espnProspects"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = ESPN_PROSPECTS_COLS
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].apply(_safe_int)
    df["ESPN_ID"] = df.iloc[:, c["ESPN_ID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)
    df["College"] = df.iloc[:, c["College"]].astype(str)
    df["Grade"] = df.iloc[:, c["Grade"]].apply(_safe_float)
    df["OverallRank"] = df.iloc[:, c["OverallRank"]].apply(_safe_int)
    df["PositionRank"] = df.iloc[:, c["PositionRank"]].apply(_safe_int)
    df["HeadshotURL"] = df.iloc[:, c["HeadshotURL"]].astype(str)
    df["DraftRound"] = df.iloc[:, c["DraftRound"]].astype(str)
    df["DraftPick"] = df.iloc[:, c["DraftPick"]].astype(str)

    if year is not None:
        df = df[df["DraftYear"] == year].copy()

    return df


@st.cache_data(ttl=300)
def load_dlf_adp() -> pd.DataFrame:
    """Load DLF Rookie Startup ADP sheet."""
    data = _get_sheet_data(SHEET_NAMES["dlfRookieStartupADP"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = DLF_ADP_COLS
    df["Year"] = df.iloc[:, c["Year"]].astype(str)
    df["Rank"] = df.iloc[:, c["Rank"]].apply(_safe_int)
    df["ADP"] = df.iloc[:, c["ADP"]].apply(_safe_float)
    df["PosRank"] = df.iloc[:, c["Pos"]].astype(str)
    df["Player"] = df.iloc[:, c["Player"]].astype(str)
    df["Team"] = df.iloc[:, c["Team"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)

    return df


@st.cache_data(ttl=300)
def load_franchise_lookup() -> pd.DataFrame:
    """Load FranchiseLookup sheet."""
    data = _get_sheet_data(SHEET_NAMES["franchiseLookup"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = FRANCHISE_LOOKUP_COLS
    # Normalize IDs to plain integer strings ("0001" -> "1", 1.0 -> "1")
    def _normalize_fid(val):
        try:
            return str(int(float(val)))
        except (ValueError, TypeError):
            s = str(val).lstrip("0")
            return s or "0"
    df["FranchiseID"] = df.iloc[:, c["FranchiseID"]].apply(_normalize_fid)
    df["TeamName"] = df.iloc[:, c["TeamName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["Abbreviation"] = df.iloc[:, c["Abbreviation"]].astype(str)
    df["Logo"] = df.iloc[:, c["Logo"]].astype(str)

    return df


@st.cache_data(ttl=300)
def load_recruiting_grades(year: int | None = None) -> pd.DataFrame:
    """Load RecruitingGrades sheet."""
    data = _get_sheet_data(SHEET_NAMES["recruitingGrades"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = RECRUITING_GRADES_COLS
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].apply(_safe_int)
    df["Franchise"] = df.iloc[:, c["Franchise"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["ClassScore"] = df.iloc[:, c["ClassScore"]].apply(_safe_float)
    df["ClassRank"] = df.iloc[:, c["ClassRank"]].apply(_safe_int)
    df["ConfRank"] = df.iloc[:, c["ConfRank"]].apply(_safe_int)
    df["FiveStar"] = df.iloc[:, c["FiveStar"]].apply(_safe_int)
    df["FourStar"] = df.iloc[:, c["FourStar"]].apply(_safe_int)
    df["ThreeStar"] = df.iloc[:, c["ThreeStar"]].apply(_safe_int)
    df["TwoStar"] = df.iloc[:, c["TwoStar"]].apply(_safe_int)
    df["OneStar"] = df.iloc[:, c["OneStar"]].apply(_safe_int)
    df["TotalPlayers"] = df.iloc[:, c["TotalPlayers"]].apply(_safe_int)
    df["TotalSpent"] = df.iloc[:, c["TotalSpent"]].apply(parse_dollar)
    df["AvgSavings"] = df.iloc[:, c["AvgSavings"]].apply(parse_dollar_savings)
    df["EfficiencyGrade"] = df.iloc[:, c["EfficiencyGrade"]].astype(str)
    df["OverallGrade"] = df.iloc[:, c["OverallGrade"]].astype(str)
    df["FranchiseLogo"] = df.iloc[:, c["FranchiseLogo"]].astype(str)

    if year is not None:
        df = df[df["DraftYear"] == year].copy()

    return df


@st.cache_data(ttl=300)
def load_player_grades(year: int | None = None) -> pd.DataFrame:
    """Load PlayerGrades sheet."""
    data = _get_sheet_data(SHEET_NAMES["playerGrades"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = PLAYER_GRADES_COLS
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].apply(_safe_int)
    df["Franchise"] = df.iloc[:, c["Franchise"]].astype(str)
    df["Player"] = df.iloc[:, c["Player"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)
    df["Stars"] = df.iloc[:, c["Stars"]].apply(_safe_int)
    df["RecruitScore"] = df.iloc[:, c["RecruitScore"]].apply(_safe_float)
    df["BidAmount"] = df.iloc[:, c["BidAmount"]].apply(parse_dollar)
    df["PredictedCost"] = df.iloc[:, c["PredictedCost"]].apply(parse_dollar)
    df["LeagueAvgPrice"] = df.iloc[:, c["LeagueAvgPrice"]].apply(parse_dollar)
    df["SavingsVsPredicted"] = df.iloc[:, c["SavingsVsPredicted"]].apply(parse_dollar_savings)
    df["SavingsVsLeagueAvg"] = df.iloc[:, c["SavingsVsLeagueAvg"]].apply(parse_dollar_savings)
    df["BlendedSavings"] = df.iloc[:, c["BlendedSavings"]].apply(parse_dollar_savings)
    # Back-compat alias: existing consumers (Best/Worst Value KPIs, etc.) read "Savings"
    df["Savings"] = df["BlendedSavings"]
    df["PlayerGrade"] = df.iloc[:, c["PlayerGrade"]].astype(str)

    if year is not None:
        df = df[df["DraftYear"] == year].copy()

    return df


@st.cache_data(ttl=300)
def load_recruiting_writeups(year: int | None = None) -> pd.DataFrame:
    """Load RecruitingWriteups sheet — dual-analyst narratives per team/year."""
    data = _get_sheet_data(SHEET_NAMES["recruitingWriteups"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = RECRUITING_WRITEUPS_COLS
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].apply(_safe_int)
    df["Franchise"] = df.iloc[:, c["Franchise"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["OverallGrade"] = df.iloc[:, c["OverallGrade"]].astype(str)
    df["HerbstreitGrade"] = df.iloc[:, c["HerbstreitGrade"]].astype(str)
    df["CorsoGrade"] = df.iloc[:, c["CorsoGrade"]].astype(str)
    df["HerbstreitAnalysis"] = df.iloc[:, c["HerbstreitAnalysis"]].astype(str)
    df["CorsoAnalysis"] = df.iloc[:, c["CorsoAnalysis"]].astype(str)

    if year is not None:
        df = df[df["DraftYear"] == year].copy()

    return df


@st.cache_data(ttl=300)
def load_live_auction() -> pd.DataFrame:
    """Load LiveAuction sheet as a typed DataFrame."""
    data = _get_sheet_data(SHEET_NAMES["liveAuction"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = LIVE_AUCTION_COLS
    df["AuctionYear"] = df.iloc[:, c["AuctionYear"]].apply(_safe_int)
    df["PlayerID"] = df.iloc[:, c["PlayerID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)
    df["NFLTeam"] = df.iloc[:, c["NFLTeam"]].astype(str)
    df["DraftYear"] = df.iloc[:, c["DraftYear"]].astype(str)
    df["DraftRound"] = df.iloc[:, c["DraftRound"]].astype(str)
    df["DraftPick"] = df.iloc[:, c["DraftPick"]].astype(str)
    df["FranchiseID"] = df.iloc[:, c["FranchiseID"]].astype(str)
    df["FranchiseName"] = df.iloc[:, c["FranchiseName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["BidAmount"] = df.iloc[:, c["BidAmount"]].apply(_safe_float).fillna(0)
    df["IsRookie"] = df.iloc[:, c["IsRookie"]].astype(str).str.upper() == "TRUE"
    df["TransactionType"] = df.iloc[:, c["TransactionType"]].astype(str) if c["TransactionType"] < len(df.columns) else "AUCTION_WON"
    df["Note"] = df.iloc[:, c["Note"]].astype(str).replace("", pd.NA) if c["Note"] < len(df.columns) else ""
    # Google Sheets reformats the Apps Script-written "yyyy-MM-dd HH:mm:ss" into the
    # spreadsheet's locale display (often 12-hour "M/d/yyyy h:mm:ss AM/PM"), which
    # breaks lexicographic sort. Parse to real datetimes so every downstream
    # sort_values("Timestamp") is chronological.
    df["Timestamp"] = pd.to_datetime(df.iloc[:, c["Timestamp"]], errors="coerce")

    # Read precomputed PlayerCopyID (from Apps Script assignRookieCopyIds) if present.
    # Derives CopySession integer from the ordinal suffix (e.g. "PC-17502-AAC-1" → 1).
    pcid_idx = c.get("PlayerCopyID")
    if pcid_idx is not None and pcid_idx < len(df.columns):
        df["PlayerCopyID"] = df.iloc[:, pcid_idx].fillna("").astype(str)
        df["CopySession"] = df["PlayerCopyID"].apply(_extract_copy_ordinal)

    return df


def _extract_copy_ordinal(pcid) -> int:
    """Extract the ordinal number from a PlayerCopyID string.

    'PC-17502-AAC-1' → 1, empty/invalid → 0.
    """
    if not pcid or not isinstance(pcid, str) or not pcid.startswith("PC-"):
        return 0
    parts = pcid.rsplit("-", 1)
    try:
        return int(parts[-1])
    except (ValueError, IndexError):
        return 0


@st.cache_data(ttl=300)
def get_available_years() -> list[int]:
    """Get unique draft years from RecruitingBoard, sorted descending."""
    data = _get_sheet_data(SHEET_NAMES["recruitingBoard"])
    if len(data) <= 1:
        return []

    years = set()
    for row in data[1:]:
        try:
            years.add(int(float(row[0])))
        except (ValueError, TypeError, IndexError):
            continue

    return sorted(years, reverse=True)
