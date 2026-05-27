"""
Configuration constants mirrored from apps_script_recruiting/Config.gs.
Single source of truth for the Streamlit app — update here if the Apps Script config changes.
"""

# Fantasy positions
POSITIONS = ["QB", "RB", "WR", "TE"]

# Years to exclude from analysis (startup year with different economics)
EXCLUDE_YEARS = [2021]

# Star rating thresholds (threshold-based, NOT quota-based)
STAR_THRESHOLDS = {
    "fiveStar": 75,
    "fourStar": 50,
    "threeStar": 25,
    "twoStar": 10,
}

# Draft capital scoring
DRAFT_CAPITAL_DECAY_RATE = 0.019
DRAFT_CAPITAL_DECAY_RATES = {"QB": 0.019, "RB": 0.016, "WR": 0.016, "TE": 0.012}
DEFAULT_DRAFT_PICK = 263  # UDFA floor (one past last NFL draft pick)

# ESPN defaults
DEFAULT_ESPN_GRADE = 20  # Below scoutable range

# Position weights for recruit scoring
POSITION_WEIGHTS = {"WR": 1.00, "RB": 1.00, "QB": 0.95, "TE": 0.90}
DEFAULT_POSITION_WEIGHT = 0.85

# Startup ADP configuration
ADP_SCORE_DECAY_RATE = 0.012
DEFAULT_ADP = 360  # Missing ADP placeholder (post-draft)
DEFAULT_ADP_FOR_SCORING = 257  # Recruit score fallback
GRADE_ADJUSTMENT_PER_POINT = 0.01  # 1% per grade point, capped ±25%
MIN_REGRESSION_POINTS = 10
MIN_REGRESSION_R2 = 0.10

# ADP tier boundaries (display labels only — pricing uses regression)
ADP_TIERS = {
    "QB": [
        {"label": "Elite", "min": 1, "max": 36},
        {"label": "Premium", "min": 37, "max": 72},
        {"label": "Starter", "min": 73, "max": 144},
        {"label": "Depth", "min": 145, "max": 240},
        {"label": "Flier", "min": 241, "max": 9999},
    ],
    "RB": [
        {"label": "Elite", "min": 1, "max": 24},
        {"label": "Premium", "min": 25, "max": 60},
        {"label": "Starter", "min": 61, "max": 120},
        {"label": "Depth", "min": 121, "max": 200},
        {"label": "Flier", "min": 201, "max": 9999},
    ],
    "WR": [
        {"label": "Elite", "min": 1, "max": 24},
        {"label": "Premium", "min": 25, "max": 60},
        {"label": "Starter", "min": 61, "max": 120},
        {"label": "Depth", "min": 121, "max": 200},
        {"label": "Flier", "min": 201, "max": 9999},
    ],
    "TE": [
        {"label": "Elite", "min": 1, "max": 60},
        {"label": "Premium", "min": 61, "max": 120},
        {"label": "Starter", "min": 121, "max": 200},
        {"label": "Depth", "min": 201, "max": 300},
        {"label": "Flier", "min": 301, "max": 9999},
    ],
}

# Scarcity pricing configuration
CONFERENCES = {"ACC": 16, "B10": 16, "B12": 16, "P12": 16, "SEC": 16, "AAC": 20}
COPIES_PER_CONFERENCE = 2
COPIES_PER_PLAYER = 12
NUMBER_OF_CONFERENCES = 6

COPY_DISCOUNT_BINS = [
    {"label": "elite", "minAvgPrice": 40, "defaultRatio": 0.85},
    {"label": "mid", "minAvgPrice": 15, "defaultRatio": 0.65},
    {"label": "flier", "minAvgPrice": 0, "defaultRatio": 0.75},
]
MIN_COPY_PAIRS_FOR_EMPIRICAL = 8

# Per-pick sliding window radii (Round 1 fallback)
WINDOW_BY_POSITION = {"WR": 3, "QB": 4, "RB": 6, "TE": 8}

# Star weights for class scoring (used in budget tool)
STAR_WEIGHTS = {5: 1.5, 4: 1.2, 3: 1.0, 2: 0.6, 1: 0.3}

# --------------------------------------------------------------------------
# Sheet column indices (0-based)
# --------------------------------------------------------------------------

RECRUITING_BOARD_COLS = {
    "DraftYear": 0, "Stars": 1, "Rating": 2, "Player": 3, "Position": 4,
    "College": 5, "ESPNGrade": 6, "ESPNRank": 7, "PosRank": 8,
    "DraftRd": 9, "DraftPick": 10, "DraftCapital": 11,
    "StartupADP": 12, "ADPTier": 13, "RecruitScore": 14,
    "PredictedCost": 15, "Copy1_16": 16, "Copy2_16": 17,
    "Copy1_20": 18, "Copy2_20": 19, "PriceRange": 20,
    "PriceSource": 21, "SampleN": 22, "Confidence": 23,
    "DataSource": 24, "HeadshotURL": 25,
}

AUCTION_DATA_COLS = {
    "AuctionYear": 0, "PlayerID": 1, "PlayerName": 2, "Position": 3,
    "NFLTeam": 4, "DraftYear": 5, "DraftRound": 6, "DraftPick": 7,
    "FranchiseID": 8, "FranchiseName": 9, "Conference": 10,
    "BidAmount": 11, "IsRookie": 12,
}

ESPN_PROSPECTS_COLS = {
    "DraftYear": 0, "ESPN_ID": 1, "PlayerName": 2, "Position": 3,
    "College": 4, "Grade": 5, "OverallRank": 6, "PositionRank": 7,
    "HeadshotURL": 8, "ProfileURL": 9, "DraftRound": 10, "DraftPick": 11,
    "Height": 12, "Weight": 13,
}

DLF_ADP_COLS = {
    "Year": 0, "Rank": 1, "ADP": 2, "Pos": 3,
    "Player": 4, "Team": 5, "Position": 6,
}

FRANCHISE_LOOKUP_COLS = {
    "FranchiseID": 0, "TeamName": 1, "Conference": 2, "Abbreviation": 3,
    "OwnerDiscordID": 4, "CoachName": 5, "CoachEmail": 6,
    "Emoji": 7, "Logo": 8,
}

RECRUITING_GRADES_COLS = {
    "DraftYear": 0, "Franchise": 1, "Conference": 2, "ClassScore": 3,
    "ClassRank": 4, "ConfRank": 5, "FiveStar": 6, "FourStar": 7,
    "ThreeStar": 8, "TwoStar": 9, "OneStar": 10, "TotalPlayers": 11,
    "TotalSpent": 12, "AvgSavings": 13, "EfficiencyGrade": 14,
    "OverallGrade": 15, "FranchiseLogo": 16,
}

PLAYER_GRADES_COLS = {
    "DraftYear": 0, "Franchise": 1, "Player": 2, "Position": 3,
    "Stars": 4, "RecruitScore": 5, "BidAmount": 6, "PredictedCost": 7,
    "LeagueAvgPrice": 8,
    "SavingsVsPredicted": 9, "SavingsVsLeagueAvg": 10, "BlendedSavings": 11,
    "PlayerGrade": 12,
}

RECRUITING_WRITEUPS_COLS = {
    "DraftYear": 0, "Franchise": 1, "Conference": 2,
    "OverallGrade": 3, "HerbstreitGrade": 4, "CorsoGrade": 5,
    "HerbstreitAnalysis": 6, "CorsoAnalysis": 7,
}

LIVE_AUCTION_COLS = {
    "AuctionYear": 0, "PlayerID": 1, "PlayerName": 2, "Position": 3,
    "NFLTeam": 4, "DraftYear": 5, "DraftRound": 6, "DraftPick": 7,
    "FranchiseID": 8, "FranchiseName": 9, "Conference": 10,
    "BidAmount": 11, "IsRookie": 12, "TransactionType": 13, "Note": 14, "Timestamp": 15,
    "PlayerCopyID": 16,
}

# Sheet tab names
SHEET_NAMES = {
    "auctionData": "AuctionData",
    "auctionAnalysis": "AuctionAnalysis",
    "recruitingBoard": "RecruitingBoard",
    "recruitingGrades": "RecruitingGrades",
    "playerGrades": "PlayerGrades",
    "recruitingWriteups": "RecruitingWriteups",
    "franchiseLookup": "FranchiseLookup",
    "espnProspects": "ESPNProspects",
    "dlfRookieStartupADP": "DLF Rookie Startup ADP",
    "liveAuction": "LiveAuction",
}


def get_league_year() -> int:
    """Get the current league year from Streamlit secrets, falling back to calendar year."""
    import streamlit as st
    from datetime import datetime
    try:
        return int(st.secrets.get("league_year", datetime.now().year))
    except (ValueError, TypeError):
        return datetime.now().year

# UI colors (matching existing webapp dark theme)
COLORS = {
    "background": "#121212",
    "surface": "#1a1a1a",
    "accent": "#d4a843",
    "text": "#f0f0ed",
    "star": "#f5c518",
    "positions": {"QB": "#e74c3c", "RB": "#3498db", "WR": "#2ecc71", "TE": "#e67e22"},
    "grades": {"A": "#2ecc71", "B": "#f1c40f", "C": "#e67e22", "D": "#e74c3c", "F": "#e74c3c"},
    "needs": {"high": "#e74c3c", "moderate": "#f1c40f", "low": "#2ecc71"},
}
