"""
Value parsing and name normalization utilities.
Ports normalizeNameForMatch() from ESPN_API.gs and handles
dollar-formatted strings from Google Sheets.
"""

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Nickname map — exact port from ESPN_API.gs lines 465-534
# ---------------------------------------------------------------------------

NICKNAME_MAP = {
    "ken": "kenneth",
    "kenny": "kenneth",
    "mike": "michael",
    "mikey": "michael",
    "matt": "matthew",
    "matty": "matthew",
    "rob": "robert",
    "robby": "robert",
    "robbie": "robert",
    "bob": "robert",
    "bobby": "robert",
    "chris": "christopher",
    "dan": "daniel",
    "danny": "daniel",
    "dave": "david",
    "davey": "david",
    "dj": "daniel",
    "tj": "thomas",
    "rj": "robert",
    "aj": "albert",
    "cj": "christopher",
    "jj": "james",
    "kj": "kenneth",
    "pj": "patrick",
    "bj": "brian",
    "pat": "patrick",
    "nick": "nicholas",
    "nic": "nicholas",
    "nicky": "nicholas",
    "joe": "joseph",
    "joey": "joseph",
    "josh": "joshua",
    "tom": "thomas",
    "tommy": "thomas",
    "tony": "anthony",
    "will": "william",
    "willy": "william",
    "bill": "william",
    "billy": "william",
    "ben": "benjamin",
    "benny": "benjamin",
    "drew": "andrew",
    "andy": "andrew",
    "alex": "alexander",
    "zach": "zachary",
    "zack": "zachary",
    "jake": "jacob",
    "jim": "james",
    "jimmy": "james",
    "jeff": "jeffrey",
    "greg": "gregory",
    "steve": "steven",
    "gabe": "gabriel",
    "abe": "abraham",
    "ed": "edward",
    "ted": "theodore",
    "rick": "richard",
    "dick": "richard",
    "rich": "richard",
    "sam": "samuel",
    "sammy": "samuel",
    "ray": "raymond",
    "charlie": "charles",
    "chuck": "charles",
    "jon": "jonathan",
    "nate": "nathaniel",
    "terry": "terrence",
    "marv": "marvin",
}


def normalize_name(name: str) -> str:
    """
    Normalize a player name for cross-source matching.
    Exact port of normalizeNameForMatch() from ESPN_API.gs.

    Handles:
    - MFL format "Last, First" → "first last"
    - Suffix removal (Jr., Sr., III, etc.)
    - Nickname expansion (Ken → Kenneth, etc.)
    """
    if not name:
        return ""

    normalized = str(name).strip().lower()

    # Handle "Last, First" format (MFL)
    if "," in normalized:
        parts = [p.strip() for p in normalized.split(",", 1)]
        if len(parts) >= 2:
            normalized = f"{parts[1]} {parts[0]}"

    # Remove common suffixes
    normalized = re.sub(r"\s+(jr\.?|sr\.?|iii|ii|iv|v)$", "", normalized, flags=re.IGNORECASE)

    # Remove periods, normalize whitespace
    normalized = normalized.replace(".", "")
    normalized = " ".join(normalized.split())

    # Expand nickname to canonical first name
    space_idx = normalized.find(" ")
    if space_idx > 0:
        first = normalized[:space_idx]
        rest = normalized[space_idx:]
        canonical = NICKNAME_MAP.get(first)
        if canonical:
            normalized = canonical + rest

    return normalized


def parse_dollar(val) -> Optional[float]:
    """Parse '$42' or '$1,234' to float. Returns None for empty/invalid."""
    if val is None or val == "":
        return None
    s = str(val).strip().replace("$", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_dollar_savings(val) -> Optional[float]:
    """Parse '+$5.0' or '-$3.2' to float. Returns None for empty/N/A."""
    if val is None or str(val).strip() in ("", "N/A"):
        return None
    s = str(val).strip().replace("$", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_confidence(val) -> tuple[str, int]:
    """Parse 'High (78)' to ('High', 78)."""
    if val is None or val == "":
        return ("", 0)
    match = re.match(r"(\w+)\s*\((\d+)\)", str(val))
    if match:
        return (match.group(1), int(match.group(2)))
    return (str(val), 0)


def parse_overall_pick(draft_pick: str, draft_round: str) -> Optional[int]:
    """
    Parse overall pick from MFL draft pick format.
    Port of parseOverallPick() from AuctionAnalysis.gs.

    Handles:
    - "1.05" format (round.pickInRound)
    - Plain number with known round
    """
    if not draft_pick:
        return None

    pick_str = str(draft_pick).strip()

    # Format: "1.05" (round.pick within round)
    if "." in pick_str:
        parts = pick_str.split(".")
        try:
            rnd = int(parts[0])
            pick_in_round = int(parts[1])
            if rnd > 0:
                if rnd == 1:
                    return pick_in_round
                return (rnd - 1) * 32 + pick_in_round
        except (ValueError, IndexError):
            pass

    # Plain number
    try:
        num = int(float(pick_str))
        if num > 0:
            rnd = int(float(draft_round)) if draft_round else 0
            if rnd > 1:
                return (rnd - 1) * 32 + num
            return num
    except (ValueError, TypeError):
        pass

    return None


def get_draft_pick_tier(overall_pick: Optional[int], draft_round: str) -> Optional[str]:
    """
    Get draft pick tier label.
    Port of getDraftPickTier() from AuctionAnalysis.gs.
    """
    try:
        rnd = int(float(draft_round)) if draft_round else 0
    except (ValueError, TypeError):
        return None

    if rnd < 1:
        return None

    if rnd == 1 and overall_pick is not None:
        if overall_pick <= 10:
            return "Top 10"
        if overall_pick <= 20:
            return "Picks 11-20"
        return "Picks 21-32"

    if rnd == 2:
        return "Round 2"
    if rnd == 3:
        return "Round 3"
    if 4 <= rnd <= 7:
        return "Day 3 (Rd 4-7)"

    return None


def get_espn_grade_range(grade: float) -> str:
    """Get ESPN grade range label. Port of getESPNGradeRange()."""
    if grade >= 90:
        return "90+"
    if grade >= 80:
        return "80-89"
    if grade >= 70:
        return "70-79"
    if grade >= 60:
        return "60-69"
    return "Below 60"
