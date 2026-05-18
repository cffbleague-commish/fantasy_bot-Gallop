"""
Google Sheets read-only data layer for the League Player Lookup app.
Connects to a DIFFERENT Google Sheet than the recruiting dashboard.
All data is cached with st.cache_data for performance.
"""

import streamlit as st
import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

from config import (
    SHEET_NAMES,
    PLAYER_COPIES_COLS,
    TRANSACTION_LOG_COLS,
    AWARDS_COLS,
    FRANCHISE_LOOKUP_COLS,
    get_league_year,
)


SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


@st.cache_resource
def _get_gspread_client() -> gspread.Client:
    """Authenticate via service account from Streamlit secrets."""
    creds_info = dict(st.secrets["gcp_service_account"])
    if "private_key" in creds_info:
        creds_info["private_key"] = creds_info["private_key"].replace("\\n", "\n")
    creds = Credentials.from_service_account_info(creds_info, scopes=SCOPES)
    return gspread.authorize(creds)


def _get_sheet_data(tab_name: str) -> list[list]:
    """Read all values from a sheet tab. Returns empty list if tab doesn't exist."""
    client = _get_gspread_client()
    sheet_id = st.secrets["player_lookup_sheet_id"]
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
    """Convert a value to float, returning None for empty/invalid."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        pass
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


def _safe_bool(val) -> bool:
    """Convert a value to boolean. Treats TRUE/true/1/Yes as True."""
    if val is None or val == "":
        return False
    if isinstance(val, bool):
        return val
    s = str(val).strip().upper()
    return s in ("TRUE", "1", "YES")


# --------------------------------------------------------------------------
# Load functions
# --------------------------------------------------------------------------


@st.cache_data(ttl=300)
def load_player_copies() -> pd.DataFrame:
    """Load PlayerCopies tab as a typed DataFrame."""
    data = _get_sheet_data(SHEET_NAMES["playerCopies"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = PLAYER_COPIES_COLS

    df["PlayerCopyID"] = df.iloc[:, c["PlayerCopyID"]].astype(str)
    df["MFL_Player_ID"] = df.iloc[:, c["MFL_Player_ID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["CurrentFranchiseID"] = (
        df.iloc[:, c["CurrentFranchiseID"]].astype(str).str.lstrip("0").replace("", "0")
    )
    df["EligibilityYearsUsed"] = df.iloc[:, c["EligibilityYearsUsed"]].apply(_safe_int)
    df["TraditionalRedshirtUsed"] = df.iloc[:, c["TraditionalRedshirtUsed"]].apply(_safe_bool)
    df["MedicalRedshirtUsed"] = df.iloc[:, c["MedicalRedshirtUsed"]].apply(_safe_bool)
    df["CreatedSeason"] = df.iloc[:, c["CreatedSeason"]].apply(_safe_int)
    df["Active"] = df.iloc[:, c["Active"]].apply(_safe_bool)
    df["LastUpdated"] = df.iloc[:, c["LastUpdated"]].astype(str)
    df["TraditionalRedshirtYear"] = df.iloc[:, c["TraditionalRedshirtYear"]].apply(_safe_int)
    df["MedicalRedshirtYear"] = df.iloc[:, c["MedicalRedshirtYear"]].apply(_safe_int)
    df["NationalAwards"] = df.iloc[:, c["NationalAwards"]].apply(_safe_int)
    df["AllConferenceAwards"] = df.iloc[:, c["AllConferenceAwards"]].apply(_safe_int)
    df["AwardHistory"] = df.iloc[:, c["AwardHistory"]].astype(str)
    df["DeclaredEarly"] = df.iloc[:, c["DeclaredEarly"]].apply(_safe_bool)
    df["DeclarationYear"] = df.iloc[:, c["DeclarationYear"]].apply(_safe_int)
    df["RetentionDecision"] = df.iloc[:, c["RetentionDecision"]].astype(str)
    df["RetentionDecisionDate"] = df.iloc[:, c["RetentionDecisionDate"]].astype(str)
    df["RetentionPath"] = df.iloc[:, c["RetentionPath"]].astype(str)
    df["RetentionCount"] = df.iloc[:, c["RetentionCount"]].apply(_safe_int)

    return df


@st.cache_data(ttl=300)
def load_transaction_log() -> pd.DataFrame:
    """Load TransactionLog tab as a typed DataFrame."""
    data = _get_sheet_data(SHEET_NAMES["transactionLog"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = TRANSACTION_LOG_COLS

    df["Timestamp"] = pd.to_datetime(
        df.iloc[:, c["Timestamp"]], errors="coerce"
    )
    df["Year"] = df.iloc[:, c["Year"]].apply(_safe_int)
    df["Type"] = df.iloc[:, c["Type"]].astype(str)
    df["FranchiseID"] = (
        df.iloc[:, c["FranchiseID"]].astype(str).str.lstrip("0").replace("", "0")
    )
    df["FranchiseName"] = df.iloc[:, c["FranchiseName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["PlayerID"] = df.iloc[:, c["PlayerID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["CopyAssigned"] = df.iloc[:, c["CopyAssigned"]].astype(str)
    df["Action"] = df.iloc[:, c["Action"]].astype(str)
    df["BidAmount"] = df.iloc[:, c["BidAmount"]].apply(_safe_float)
    df["TransferEligible"] = df.iloc[:, c["TransferEligible"]].apply(_safe_bool)
    df["RawTransaction"] = df.iloc[:, c["RawTransaction"]].astype(str)

    return df


@st.cache_data(ttl=300)
def load_awards() -> pd.DataFrame:
    """Load Awards tab as a typed DataFrame."""
    data = _get_sheet_data(SHEET_NAMES["awards"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = AWARDS_COLS

    df["Year"] = df.iloc[:, c["Year"]].apply(_safe_int)
    df["AwardType"] = df.iloc[:, c["AwardType"]].astype(str)
    df["PlayerCopyID"] = df.iloc[:, c["PlayerCopyID"]].astype(str)
    df["MFL_Player_ID"] = df.iloc[:, c["MFL_Player_ID"]].astype(str)
    df["PlayerName"] = df.iloc[:, c["PlayerName"]].astype(str)
    df["Position"] = df.iloc[:, c["Position"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["FranchiseID"] = (
        df.iloc[:, c["FranchiseID"]].astype(str).str.lstrip("0").replace("", "0")
    )
    df["StarterPoints"] = df.iloc[:, c["StarterPoints"]].apply(_safe_float)
    df["TeamPF"] = df.iloc[:, c["TeamPF"]].apply(_safe_float)
    df["TeamWins"] = df.iloc[:, c["TeamWins"]].apply(_safe_int)
    df["AwardScore"] = df.iloc[:, c["AwardScore"]].apply(_safe_float)
    df["Rank"] = df.iloc[:, c["Rank"]].apply(_safe_int)
    df["LastCalculated"] = df.iloc[:, c["LastCalculated"]].astype(str)

    return df


@st.cache_data(ttl=300)
def load_franchise_lookup() -> pd.DataFrame:
    """Load FranchiseLookup tab."""
    data = _get_sheet_data(SHEET_NAMES["franchiseLookup"])
    if len(data) <= 1:
        return pd.DataFrame()

    headers = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=headers)

    c = FRANCHISE_LOOKUP_COLS

    df["FranchiseID"] = (
        df.iloc[:, c["FranchiseID"]].astype(str).str.lstrip("0").replace("", "0")
    )
    df["TeamName"] = df.iloc[:, c["TeamName"]].astype(str)
    df["Conference"] = df.iloc[:, c["Conference"]].astype(str)
    df["Abbreviation"] = df.iloc[:, c["Abbreviation"]].astype(str)
    df["Logo"] = df.iloc[:, c["Logo"]].astype(str)

    return df


# --------------------------------------------------------------------------
# Enrichment & aggregation helpers
# --------------------------------------------------------------------------


@st.cache_data(ttl=300)
def load_player_copies_enriched() -> pd.DataFrame:
    """Load PlayerCopies enriched with Position and NFL Team from MFL API."""
    copies = load_player_copies()
    if copies.empty:
        return copies

    from data.mfl_api import fetch_players

    year = get_league_year()
    mfl_players = fetch_players(year)

    if mfl_players.empty:
        copies["Position"] = ""
        copies["NFLTeam"] = ""
        return copies

    enriched = copies.merge(
        mfl_players[["PlayerID", "Position", "Team"]].rename(
            columns={"Team": "NFLTeam"}
        ),
        left_on="MFL_Player_ID",
        right_on="PlayerID",
        how="left",
    )
    enriched.drop(columns=["PlayerID"], inplace=True, errors="ignore")
    enriched["Position"] = enriched["Position"].fillna("")
    enriched["NFLTeam"] = enriched["NFLTeam"].fillna("")

    return enriched


@st.cache_data(ttl=300)
def get_unique_players() -> pd.DataFrame:
    """Get deduplicated player list (one row per real player, not per copy).

    Returns DataFrame with:
    - MFL_Player_ID, PlayerName, Position, NFLTeam, CreatedSeason
    - ActiveCopies (count where Active == True)
    - TotalCopies (total count)
    - TotalAwards (sum of national + all-conference)
    """
    copies = load_player_copies_enriched()
    if copies.empty:
        return pd.DataFrame()

    # Fill NaN award counts with 0 for summation
    copies["_nat"] = copies["NationalAwards"].fillna(0).astype(int)
    copies["_ac"] = copies["AllConferenceAwards"].fillna(0).astype(int)

    grouped = copies.groupby("MFL_Player_ID", as_index=False).agg(
        PlayerName=("PlayerName", "first"),
        Position=("Position", "first"),
        NFLTeam=("NFLTeam", "first"),
        CreatedSeason=("CreatedSeason", "first"),
        ActiveCopies=("Active", "sum"),
        TotalCopies=("MFL_Player_ID", "count"),
        TotalAwards=("_nat", "sum"),
        _ac_sum=("_ac", "sum"),
    )
    grouped["TotalAwards"] = grouped["TotalAwards"] + grouped["_ac_sum"]
    grouped.drop(columns=["_ac_sum"], inplace=True)
    grouped["ActiveCopies"] = grouped["ActiveCopies"].astype(int)
    grouped["TotalAwards"] = grouped["TotalAwards"].astype(int)

    return grouped


@st.cache_data(ttl=300)
def get_available_draft_classes() -> list[int]:
    """Get unique CreatedSeason values from PlayerCopies, sorted descending."""
    copies = load_player_copies()
    if copies.empty:
        return []

    seasons = copies["CreatedSeason"].dropna().unique()
    return sorted([int(s) for s in seasons], reverse=True)
