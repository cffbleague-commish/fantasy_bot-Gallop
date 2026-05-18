"""
Configuration constants for the CFFB Player Lookup app.
Column index mappings for the league Google Sheet tabs.
"""

# Fantasy positions
POSITIONS = ["QB", "RB", "WR", "TE"]

# Conferences
CONFERENCES = ["ACC", "B10", "B12", "P12", "SEC", "AAC"]

# Copy structure
COPIES_PER_CONFERENCE = 2
COPIES_PER_PLAYER = 12

# --------------------------------------------------------------------------
# Sheet tab names (in the LEAGUE Google Sheet — different from recruiting)
# --------------------------------------------------------------------------

SHEET_NAMES = {
    "playerCopies": "PlayerCopies",
    "transactionLog": "TransactionLog",
    "awards": "Awards",
    "franchiseLookup": "FranchiseLookup",
}

# --------------------------------------------------------------------------
# Sheet column indices (0-based)
# --------------------------------------------------------------------------

PLAYER_COPIES_COLS = {
    "PlayerCopyID": 0,
    "MFL_Player_ID": 1,
    "PlayerName": 2,
    "Conference": 3,
    "CurrentFranchiseID": 4,
    "EligibilityYearsUsed": 5,
    "TraditionalRedshirtUsed": 6,
    "MedicalRedshirtUsed": 7,
    "CreatedSeason": 8,
    "Active": 9,
    "LastUpdated": 10,
    "TraditionalRedshirtYear": 11,
    "MedicalRedshirtYear": 12,
    "NationalAwards": 13,
    "AllConferenceAwards": 14,
    "AwardHistory": 15,
    "DeclaredEarly": 16,
    "DeclarationYear": 17,
    "RetentionDecision": 18,
    "RetentionDecisionDate": 19,
    "RetentionPath": 20,
    "RetentionCount": 21,
}

TRANSACTION_LOG_COLS = {
    "Timestamp": 0,
    "Year": 1,
    "Type": 2,
    "FranchiseID": 3,
    "FranchiseName": 4,
    "Conference": 5,
    "PlayerID": 6,
    "PlayerName": 7,
    "CopyAssigned": 8,
    "Action": 9,
    "BidAmount": 10,
    "TransferEligible": 11,
    "RawTransaction": 12,
}

AWARDS_COLS = {
    "Year": 0,
    "AwardType": 1,
    "PlayerCopyID": 2,
    "MFL_Player_ID": 3,
    "PlayerName": 4,
    "Position": 5,
    "Conference": 6,
    "FranchiseID": 7,
    "StarterPoints": 8,
    "TeamPF": 9,
    "TeamWins": 10,
    "AwardScore": 11,
    "Rank": 12,
    "LastCalculated": 13,
}

FRANCHISE_LOOKUP_COLS = {
    "FranchiseID": 0,
    "TeamName": 1,
    "Conference": 2,
    "Abbreviation": 3,
    "OwnerDiscordID": 4,
    "CoachName": 5,
    "CoachEmail": 6,
    "Emoji": 7,
    "Logo": 8,
}

# --------------------------------------------------------------------------
# Display labels
# --------------------------------------------------------------------------

TRANSACTION_TYPE_LABELS = {
    "AUCTION_WON": "Auction Won",
    "FREE_AGENT": "Free Agent",
    "IR": "Injured Reserve",
    "TAXI": "Taxi Squad",
}

TRANSACTION_TYPE_COLORS = {
    "AUCTION_WON": "#2D7A4E",
    "FREE_AGENT": "#5A5A5A",
    "IR": "#B84545",
    "TAXI": "#C9A227",
}

AWARD_DISPLAY_NAMES = {
    "Heisman": "Heisman Trophy",
    "National_QB": "Davey O'Brien Award",
    "National_RB": "Doak Walker Award",
    "National_WR/TE": "Fred Biletnikoff Award",
}


def get_league_year() -> int:
    """Get the current league year from Streamlit secrets, falling back to calendar year."""
    import streamlit as st
    from datetime import datetime

    try:
        return int(st.secrets.get("league_year", datetime.now().year))
    except (ValueError, TypeError):
        return datetime.now().year
