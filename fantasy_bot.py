# ---------------- IMPORTS ----------------
import discord
from discord.ext import commands, tasks
from collections import defaultdict
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime, time
import os
import asyncio
import traceback
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --------------- Google Sheets Setup ---------------
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "composed-falcon-482703-s9-5743dd74a2e0.json")
LEAGUE_SHEET_ID = os.getenv("LEAGUE_SHEET_ID")
SCHEDULER_SHEET_ID = os.getenv("SCHEDULER_SHEET_ID")
DEVY_SHEET_ID = os.getenv("DEVY_SHEET_ID")  # Optional: separate sheet for devy drafts

# Define the scopes for Google Sheets API
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

# Authenticate with Google Sheets using service account
creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
gc = gspread.authorize(creds)
league_sheet = gc.open_by_key(LEAGUE_SHEET_ID)
scheduler_sheet = gc.open_by_key(SCHEDULER_SHEET_ID)
teams_ws = league_sheet.worksheet("FranchiseLookup")
manual_sub_ws = scheduler_sheet.worksheet("Manual Submissions")
manual_games_ws = scheduler_sheet.worksheet("ManualGames")

# Rivalries worksheet - create if it doesn't exist
try:
    rivalries_ws = scheduler_sheet.worksheet("Rivalries")
except gspread.exceptions.WorksheetNotFound:
    rivalries_ws = scheduler_sheet.add_worksheet(title="Rivalries", rows=200, cols=9)
    rivalries_ws.append_row([
        "Team A", "Team A Name", "Team B", "Team B Name", "Rivalry Name",
        "Wager", "Type", "Status", "Submitted"
    ])

# Settings worksheet - stores submission open/close status
try:
    settings_ws = scheduler_sheet.worksheet("Settings")
except gspread.exceptions.WorksheetNotFound:
    settings_ws = scheduler_sheet.add_worksheet(title="Settings", rows=20, cols=3)
    settings_ws.append_row(["Setting", "Value", "Updated"])
    settings_ws.append_row(["RIVALRIES_OPEN", "FALSE", ""])
    settings_ws.append_row(["NC_GAMES_OPEN", "FALSE", ""])

# League parameters for rivalries
MAX_RIVALS_PER_TEAM = 2
MAX_WAGER = 5

# NC (non-conference) scheduling limits — mirror apps_script_scheduling/Config.gs
MAX_NC_GAMES_PER_TEAM = 4   # Config.gs getLeagueParams().nonConferenceGames
NC_WEEK_MIN = 1             # Config.gs WEEK_WINDOWS.NC.start
NC_WEEK_MAX = 4             # Config.gs WEEK_WINDOWS.NC.end

# ----------------- Submission Status Helper Functions -----------------
def get_submission_status(setting_name: str) -> bool:
    """Get the current status of a submission setting (RIVALRIES_OPEN or NC_GAMES_OPEN)."""
    try:
        records = settings_ws.get_all_records(expected_headers=[])
        for r in records:
            if r.get("Setting") == setting_name:
                return str(r.get("Value", "")).upper() == "TRUE"
        return False
    except Exception as e:
        print(f"Error getting submission status: {e}")
        return False

def set_submission_status(setting_name: str, is_open: bool) -> bool:
    """Set the status of a submission setting. Returns True if successful."""
    try:
        records = settings_ws.get_all_records(expected_headers=[])
        for idx, r in enumerate(records, start=2):  # start=2 for row number (1-indexed + header)
            if r.get("Setting") == setting_name:
                settings_ws.update_cell(idx, 2, "TRUE" if is_open else "FALSE")
                settings_ws.update_cell(idx, 3, datetime.utcnow().isoformat())
                return True
        # Setting not found - add it
        settings_ws.append_row([setting_name, "TRUE" if is_open else "FALSE", datetime.utcnow().isoformat()])
        return True
    except Exception as e:
        print(f"Error setting submission status: {e}")
        return False

def are_rivalries_open() -> bool:
    """Check if rivalry submissions are open."""
    return get_submission_status("RIVALRIES_OPEN")

def are_nc_games_open() -> bool:
    """Check if NC game submissions are open."""
    return get_submission_status("NC_GAMES_OPEN")

# ----------------- Dollar Value Helper -----------------
def parse_dollar_value(value) -> int:
    """Parse dollar value that may contain '$' prefix (e.g., '$3' -> 3)."""
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    try:
        # Strip $ prefix if present and convert to int
        return int(str(value).replace("$", "").strip())
    except (ValueError, TypeError):
        return 0

# ----------------- Rivalry Helper Functions -----------------
def get_team_rivalry_count(franchise_id: str) -> int:
    """Count confirmed rivalries for a team (deduplicated by pair)."""
    normalized_id = str(franchise_id).zfill(3)
    records = rivalries_ws.get_all_records(expected_headers=[])
    seen_pairs = set()  # Track unique rivalry pairs to prevent double counting
    count = 0
    for r in records:
        if r.get("Status") != "CONFIRMED":
            continue
        team_a = str(r.get("Team A", "")).zfill(3)
        team_b = str(r.get("Team B", "")).zfill(3)
        if team_a == normalized_id or team_b == normalized_id:
            # Create unique key for this rivalry pair (sorted to handle A-B and B-A as same)
            pair_key = "-".join(sorted([team_a, team_b]))
            if pair_key not in seen_pairs:
                seen_pairs.add(pair_key)
                count += 1
    return count

def get_team_pending_rivalries(franchise_id: str) -> list:
    """Get pending rivalries where this team is involved (deduplicated by pair)."""
    normalized_id = str(franchise_id).zfill(3)
    records = rivalries_ws.get_all_records(expected_headers=[])
    pending = []
    seen_pairs = set()  # Track unique rivalry pairs to prevent double counting
    for idx, r in enumerate(records, start=2):  # start=2 for row number (1-indexed + header)
        if r.get("Status") != "PENDING":
            continue
        team_a = str(r.get("Team A", "")).zfill(3)
        team_b = str(r.get("Team B", "")).zfill(3)
        if team_a == normalized_id or team_b == normalized_id:
            pair_key = "-".join(sorted([team_a, team_b]))
            if pair_key not in seen_pairs:
                seen_pairs.add(pair_key)
                pending.append({**r, "row": idx})
    return pending

def build_rivalry_key(team_a: str, team_b: str) -> str:
    """Create consistent key for rivalry lookups (sorted team IDs)."""
    ids = sorted([str(team_a).zfill(3), str(team_b).zfill(3)])
    return f"{ids[0]}-{ids[1]}"

def has_existing_rivalry(team_a: str, team_b: str) -> dict:
    """Check if any rivalry (PENDING or CONFIRMED) already exists between two teams."""
    normalized_a = str(team_a).zfill(3)
    normalized_b = str(team_b).zfill(3)
    records = rivalries_ws.get_all_records(expected_headers=[])

    for r in records:
        row_a = str(r.get("Team A", "")).zfill(3)
        row_b = str(r.get("Team B", "")).zfill(3)
        status = r.get("Status", "")
        if status not in ("PENDING", "CONFIRMED"):
            continue
        if (row_a == normalized_a and row_b == normalized_b) or \
           (row_a == normalized_b and row_b == normalized_a):
            return {"exists": True, "status": status, "name": r.get("Rivalry Name", ""), "record": r}
    return {"exists": False}

def find_pending_rivalry(team_a: str, team_b: str) -> dict:
    """Find a pending rivalry between two teams."""
    normalized_a = str(team_a).zfill(3)
    normalized_b = str(team_b).zfill(3)
    records = rivalries_ws.get_all_records(expected_headers=[])

    for idx, r in enumerate(records, start=2):
        if r.get("Status") != "PENDING":
            continue
        row_a = str(r.get("Team A", "")).zfill(3)
        row_b = str(r.get("Team B", "")).zfill(3)
        # Check if this is the same matchup (either direction)
        if (row_a == normalized_a and row_b == normalized_b) or \
           (row_a == normalized_b and row_b == normalized_a):
            return {**r, "row": idx}
    return None

def try_confirm_rivalry(submitter_id: str, opponent_id: str, name: str, wager: int) -> dict:
    """
    Check if opponent already submitted matching rivalry details.
    If matched, updates the sheet row: Status=CONFIRMED, overwrites Submitted with confirmation time.
    Returns: {"matched": bool, "row": int if matched, "existing": dict if found but not matching}
    """
    pending = find_pending_rivalry(submitter_id, opponent_id)

    if not pending:
        return {"matched": False, "existing": None}

    # Check if this is the opponent's submission that matches
    row_a = str(pending.get("Team A", "")).zfill(3)
    submitter_normalized = str(submitter_id).zfill(3)

    # The pending row was created by the OTHER team if Team A != submitter
    if row_a == submitter_normalized:
        # This team already submitted - they're waiting for opponent
        return {"matched": False, "existing": pending, "already_submitted": True}

    # Opponent submitted first - check if details match
    existing_name = pending.get("Rivalry Name", "").strip()
    existing_wager = int(pending.get("Wager", 0))

    if existing_name.lower() == name.lower() and existing_wager == wager:
        # Match confirmed - update the sheet row
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        row_idx = pending["row"]
        rivalries_ws.update_cell(row_idx, 8, "CONFIRMED")       # Status (col 8)
        rivalries_ws.update_cell(row_idx, 9, now)                # Submitted (overwrite with confirmation time)
        return {"matched": True, "row": row_idx, "existing": pending}
    else:
        return {"matched": False, "existing": pending, "mismatch": True}

async def notify_opponent_dm(opponent_id: str, subject: str, message: str, embed: discord.Embed = None, view: discord.ui.View = None):
    """
    Send a DM notification to an opponent team owner.
    Returns: {"sent": bool, "error": str or None, "message": discord.Message or None}

    When a `view` is passed (e.g. NCConfirmView), its `.message` is set to the sent
    DM so the view can disable its own buttons on timeout.
    """
    try:
        # Get Discord ID for the opponent's franchise
        teams = await asyncio.to_thread(teams_ws.get_all_records)
        discord_id = None
        for t in teams:
            fid = str(t.get("Franchise ID", "")).zfill(3)
            if fid == str(opponent_id).zfill(3):
                discord_id = normalize_discord_id(t.get("Owner Discord ID", ""))
                break

        if not discord_id:
            return {"sent": False, "error": "No Discord ID found for opponent", "message": None}

        user = await bot.fetch_user(int(discord_id))
        send_kwargs = {}
        if embed:
            send_kwargs["embed"] = embed
        if view is not None:
            send_kwargs["view"] = view
        if send_kwargs:
            sent = await user.send(**send_kwargs)
        else:
            sent = await user.send(message)
        if view is not None:
            view.message = sent
        return {"sent": True, "error": None, "message": sent}
    except discord.Forbidden:
        return {"sent": False, "error": "User has DMs disabled", "message": None}
    except discord.NotFound:
        return {"sent": False, "error": "User not found on Discord", "message": None}
    except Exception as e:
        print(f"Failed to DM opponent {opponent_id}: {e}")
        return {"sent": False, "error": str(e), "message": None}

# ----------------- Team Lookup Helpter ---------------
def get_team_by_discord_id(discord_id: int):
    teams = teams_ws.get_all_records(expected_headers=[])
    for row in teams:
        if str(row.get("Owner Discord ID", "")).strip() == str(discord_id):
            return {
                "id": row.get("Franchise ID"),
                "name": row.get("Team Name"),
                "conference": row.get("Conference")
            }
    return None

def _norm_team_name(name) -> str:
    """Normalize a team name for NC-game comparisons (matches how match_key is built)."""
    return str(name or "").strip().lower()

def get_team_nc_games(team_name: str) -> list:
    """
    Return the distinct NC games a team is involved in (pending + confirmed).

    Each entry: {"opponent": <raw name>, "week": <int-ish>, "status": "PENDING"|"CONFIRMED"}.
    Confirmed games come from ManualGames (one row = one game). Pending games come from
    Manual Submissions rows with Status == PENDING, deduped by Match Key (a pending game may
    have 1-2 rows, one per side).
    """
    target = _norm_team_name(team_name)
    games = []

    # Confirmed games (one row per game)
    confirmed = manual_games_ws.get_all_records(expected_headers=[])
    for g in confirmed:
        a = _norm_team_name(g.get("Team A"))
        b = _norm_team_name(g.get("Team B"))
        if target == a:
            games.append({"opponent": g.get("Team B"), "week": g.get("Week"), "status": "CONFIRMED"})
        elif target == b:
            games.append({"opponent": g.get("Team A"), "week": g.get("Week"), "status": "CONFIRMED"})

    # Pending submissions (dedup by Match Key)
    subs = manual_sub_ws.get_all_records(expected_headers=[])
    seen_keys = set()
    for r in subs:
        if r.get("Status") != "PENDING":
            continue
        key = r.get("Match Key")
        if key in seen_keys:
            continue
        a = _norm_team_name(r.get("Team A"))
        b = _norm_team_name(r.get("Team B"))
        if target == a:
            opponent = r.get("Team B")
        elif target == b:
            opponent = r.get("Team A")
        else:
            continue
        seen_keys.add(key)
        games.append({"opponent": opponent, "week": r.get("Week"), "status": "PENDING"})

    return games

def build_nc_schedule_index():
    """Single-pass index of every NC game (confirmed + pending) in the league.

    Reads ManualGames and Manual Submissions ONCE each (not per-team) so the
    availability board can be built without a per-team sheet read. NC games store
    team NAMES, so the index is keyed by normalized team name.

    Returns: {normalized_team_name: {"weeks": set[int], "opponents": set[str]}}
    where "weeks" are the NC weeks the team already has a game in, and "opponents"
    are the normalized names it is already matched against.
    """
    def _week(v):
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    index = defaultdict(lambda: {"weeks": set(), "opponents": set()})

    def _record(a, b, wk):
        a = _norm_team_name(a)
        b = _norm_team_name(b)
        if not (a and b):
            return
        for x, y in ((a, b), (b, a)):
            if wk:
                index[x]["weeks"].add(wk)
            index[x]["opponents"].add(y)

    for g in manual_games_ws.get_all_records(expected_headers=[]):
        _record(g.get("Team A"), g.get("Team B"), _week(g.get("Week")))

    seen_keys = set()
    for r in manual_sub_ws.get_all_records(expected_headers=[]):
        if r.get("Status") != "PENDING":
            continue
        key = r.get("Match Key")
        if key in seen_keys:
            continue
        seen_keys.add(key)
        _record(r.get("Team A"), r.get("Team B"), _week(r.get("Week")))

    return index

def get_franchise_directory():
    """Read FranchiseLookup once → {franchise_id(3-digit): {...}}.

    Fields: name, conference, discord_id, emoji. Consolidates what the separate
    name/emoji/owner map helpers each read individually, so a caller needing
    several attributes for every team pays a single sheet read.
    """
    directory = {}
    for row in teams_ws.get_all_records(expected_headers=[]):
        fid = str(row.get("Franchise ID", "")).strip()
        if not fid:
            continue
        try:
            fid = str(int(fid)).zfill(3)
        except (ValueError, TypeError):
            continue
        directory[fid] = {
            "name": str(row.get("Team Name", "")).strip(),
            "conference": str(row.get("Conference", "")).strip(),
            "discord_id": normalize_discord_id(row.get("Owner Discord ID", "")),
            "emoji": str(row.get("Emoji", "")).strip(),
        }
    return directory

def validate_nc_submission(team: dict, opponent_team: dict, week: int):
    """
    Validate a proposed NC game submission against league scheduling limits.

    Returns an error message string if the submission should be rejected, or None if it's
    allowed. The reciprocal submission is itself "team vs opponent, same week," so conflict
    checks exclude the current (opponent, week) matchup to avoid blocking a legitimate
    second-side confirmation.
    """
    team_name = team["name"]
    opponent_name = opponent_team["name"]
    target_opp = _norm_team_name(opponent_name)

    # 1. Week window
    try:
        week_num = int(week)
    except (ValueError, TypeError):
        return "Week must be a number."
    if not (NC_WEEK_MIN <= week_num <= NC_WEEK_MAX):
        return f"NC games must be scheduled in weeks {NC_WEEK_MIN}–{NC_WEEK_MAX}."

    # 2. Non-conference
    if opponent_team["conference"] == team["conference"]:
        return "Manual games must be non-conference."

    # A game is "the current matchup" if it's vs this opponent in this week (the reciprocal).
    def _week_of(g):
        try:
            return int(g.get("week"))
        except (ValueError, TypeError):
            return None

    my_games = get_team_nc_games(team_name)

    # 3. Repeat opponent — a game vs this opponent in a DIFFERENT week is a repeat; same week
    #    is the reciprocal (allowed). Also block the team's own re-submission of this matchup.
    for g in my_games:
        if _norm_team_name(g["opponent"]) != target_opp:
            continue
        if _week_of(g) == week_num:
            # Same opponent, same week: either the opponent's reciprocal (allowed) or the
            # team's own duplicate submission (reject).
            subs = manual_sub_ws.get_all_records(expected_headers=[])
            for r in subs:
                if (
                    r.get("Status") == "PENDING"
                    and _norm_team_name(r.get("Team A")) == _norm_team_name(team_name)
                    and _norm_team_name(r.get("Team B")) == target_opp
                    and _week_of({"week": r.get("Week")}) == week_num
                ):
                    return f"You've already submitted this matchup — waiting on {opponent_name} to confirm."
            # Otherwise it's the reciprocal — allow it through.
        else:
            return f"You already have an NC game scheduled against {opponent_name}."

    # Games excluding the current matchup (this team vs opponent in this week).
    def _excluding_current(games, other_side):
        other = _norm_team_name(other_side)
        return [
            g for g in games
            if not (_norm_team_name(g["opponent"]) == other and _week_of(g) == week_num)
        ]

    opp_games = get_team_nc_games(opponent_name)
    my_other = _excluding_current(my_games, opponent_name)
    opp_other = _excluding_current(opp_games, team_name)

    # 4. Max games per team (both sides)
    if len(my_other) >= MAX_NC_GAMES_PER_TEAM:
        return f"{team_name} already has {MAX_NC_GAMES_PER_TEAM} NC games scheduled."
    if len(opp_other) >= MAX_NC_GAMES_PER_TEAM:
        return f"{opponent_name} already has {MAX_NC_GAMES_PER_TEAM} NC games scheduled."

    # 5. One game per team per week (both sides), excluding the current matchup
    for g in my_other:
        if _week_of(g) == week_num:
            return f"You already have an NC game in Week {week_num}."
    for g in opp_other:
        if _week_of(g) == week_num:
            return f"{opponent_name} already has an NC game in Week {week_num}."

    return None

def try_confirm_manual_game(match_key: str):
    """
    Check if both teams have submitted matching game requests.
    Returns True if game was confirmed, False otherwise.
    """
    subs = manual_sub_ws.get_all_records(expected_headers=[])

    pending = [
        (i + 2, r)
        for i, r in enumerate(subs)
        if r["Match Key"] == match_key and r["Status"] == "PENDING"
    ]

    if len(pending) != 2:
        return False

    a, b = pending

    if (
        a[1]["Team A"] != b[1]["Team B"] or
        a[1]["Team B"] != b[1]["Team A"] or
        a[1]["Week"] != b[1]["Week"]
    ):
        return False

    week = a[1]["Week"]
    team1 = a[1]["Team A"]
    team2 = a[1]["Team B"]

    existing = manual_games_ws.get_all_records(expected_headers=[])
    for g in existing:
        if g["Week"] == week and set([g["Team A"], g["Team B"]]) == set([team1, team2]):
            return False  # Already exists

    manual_games_ws.append_row([
        week,
        team1,
        team2,
        "MANUAL",
        datetime.utcnow().isoformat()
    ])

    for row_idx, _ in pending:
        manual_sub_ws.update_cell(row_idx, 6, "CONFIRMED")

    return True

def delete_pending_submissions(match_key: str) -> int:
    """Delete every PENDING Manual Submissions row for a match key.

    Used by the DM Decline button — removing the row (rather than marking it
    DECLINED) keeps it out of get_team_nc_games, availability, and status views.
    Rows are deleted bottom-up so earlier row indices stay valid. Returns count.
    """
    subs = manual_sub_ws.get_all_records(expected_headers=[])
    rows = [
        i + 2  # +2: 1 for the header row, 1 for 1-based indexing
        for i, r in enumerate(subs)
        if r.get("Match Key") == match_key and r.get("Status") == "PENDING"
    ]
    for row_idx in sorted(rows, reverse=True):
        manual_sub_ws.delete_rows(row_idx)
    return len(rows)

def process_nc_button_confirm(submitter_team: dict, opponent_team: dict, week) -> dict:
    """Confirm an NC game from the opponent's DM Confirm button.

    Mirrors what the opponent typing the reciprocal `/schedule submit` would do:
    ensures the opponent has a PENDING row for the match, then reuses
    try_confirm_manual_game to write the ManualGames row and flip both sides to
    CONFIRMED. Re-validates the opponent side against current limits (they may have
    booked that week since the request was sent).

    Returns {"status": ...} where status is one of:
      "confirmed" | "already" | "gone" | "error" | "pending"
    ("error" includes a "message"; "pending" means the reciprocal row was added
    but confirmation didn't complete — should not normally happen.)
    """
    submitter_name = submitter_team["name"]
    opponent_name = opponent_team["name"]
    match_key = f"{week}-{'-'.join(sorted([submitter_name, opponent_name]))}"

    # Already confirmed? (ManualGames has one row per game.)
    for g in manual_games_ws.get_all_records(expected_headers=[]):
        if g.get("Week") == week and set([g.get("Team A"), g.get("Team B")]) == set([submitter_name, opponent_name]):
            return {"status": "already"}

    subs = manual_sub_ws.get_all_records(expected_headers=[])

    def _is(row, a, b):
        return (
            row.get("Status") == "PENDING"
            and row.get("Match Key") == match_key
            and _norm_team_name(row.get("Team A")) == _norm_team_name(a)
            and _norm_team_name(row.get("Team B")) == _norm_team_name(b)
        )

    # The requester's pending row must still exist.
    if not any(_is(r, submitter_name, opponent_name) for r in subs):
        return {"status": "gone"}

    # Re-validate the opponent side against current limits.
    error = validate_nc_submission(opponent_team, submitter_team, week)
    if error:
        return {"status": "error", "message": error}

    # Ensure the opponent's reciprocal PENDING row exists, then confirm.
    if not any(_is(r, opponent_name, submitter_name) for r in subs):
        manual_sub_ws.append_row([
            datetime.utcnow().isoformat(),
            week,
            opponent_name,
            submitter_name,
            opponent_team.get("discord_id", ""),
            "PENDING",
            match_key,
        ])

    confirmed = try_confirm_manual_game(match_key)
    return {"status": "confirmed" if confirmed else "pending"}

# ----------------- Discord Normalize ID Helper -------
def normalize_discord_id(val):
    """
    Normalize Discord IDs read from Google Sheets so they
    compare correctly with interaction.user.id
    """
    if val is None:
        return ""
    if isinstance(val, float):
        return str(int(val))
    return str(val).strip()
# ----------------- Discord Bot Setup -----------------
intents = discord.Intents.default()
intents.message_content = True

# Keep legacy prefix commands (like !ping)
bot = commands.Bot(command_prefix="!", intents=intents)

from discord import app_commands

schedule = app_commands.Group(
    name="schedule",
    description="Manual scheduling commands"
)
bot.tree.add_command(schedule)

awards = app_commands.Group(
    name="awards",
    description="Player awards commands"
)
bot.tree.add_command(awards)

retention = app_commands.Group(
    name="retention",
    description="Player retention and early declaration commands"
)
bot.tree.add_command(retention)

rankings = app_commands.Group(
    name="rankings",
    description="Power rankings commands"
)
bot.tree.add_command(rankings)

gameday = app_commands.Group(
    name="gameday",
    description="College Gameday commands"
)
bot.tree.add_command(gameday)

projections = app_commands.Group(
    name="projections",
    description="Playoff and bowl projection commands"
)
bot.tree.add_command(projections)

rival = app_commands.Group(
    name="rival",
    description="Rivalry submission and management commands"
)
bot.tree.add_command(rival)

recruiting = app_commands.Group(
    name="recruiting",
    description="Recruiting budget and bonus dollar commands"
)
bot.tree.add_command(recruiting)

devy = app_commands.Group(
    name="devy",
    description="Devy draft commands"
)
bot.tree.add_command(devy)

commish = app_commands.Group(
    name="commish",
    description="Commissioner-only commands",
    default_permissions=discord.Permissions(manage_guild=True)
)
bot.tree.add_command(commish)

# ----------------- Global Slash Command Error Handler -----------------
@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
    traceback.print_exc()
    error_msg = "An unexpected error occurred. Please try again or contact the Commish."

    if interaction.response.is_done():
        try:
            await interaction.followup.send(error_msg, ephemeral=True)
        except discord.HTTPException:
            pass
    else:
        try:
            await interaction.response.send_message(error_msg, ephemeral=True)
        except discord.HTTPException:
            pass

# ----------------- Awards Sheet Setup -----------------
try:
    awards_ws = league_sheet.worksheet("Awards")
except gspread.exceptions.WorksheetNotFound:
    awards_ws = None

# ----------------- PlayerCopies Sheet Setup -----------------
try:
    player_copies_ws = league_sheet.worksheet("PlayerCopies")
except gspread.exceptions.WorksheetNotFound:
    player_copies_ws = None

# ----------------- PowerRankings Sheet Setup -----------------
try:
    rankings_ws = league_sheet.worksheet("PowerRankings")
except gspread.exceptions.WorksheetNotFound:
    rankings_ws = None

# ----------------- ScheduleResults Sheet Setup -----------------
try:
    schedule_results_ws = league_sheet.worksheet("ScheduleResults")
except gspread.exceptions.WorksheetNotFound:
    schedule_results_ws = None

# ----------------- Projections Sheet Setup -----------------
try:
    projections_ws = league_sheet.worksheet("Projections")
except gspread.exceptions.WorksheetNotFound:
    projections_ws = None

# ----------------- ConferenceStandings Sheet Setup -----------------
try:
    conference_standings_ws = league_sheet.worksheet("ConferenceStandings")
except gspread.exceptions.WorksheetNotFound:
    conference_standings_ws = None

# ----------------- RecruitingDollars Sheet Setup -----------------
try:
    recruiting_dollars_ws = league_sheet.worksheet("RecruitingDollars")
except gspread.exceptions.WorksheetNotFound:
    recruiting_dollars_ws = None

# ----------------- RetentionHistory Sheet Setup -----------------
try:
    retention_history_ws = league_sheet.worksheet("RetentionHistory")
except gspread.exceptions.WorksheetNotFound:
    retention_history_ws = None

# ----------------- TheoreticalDraft Sheet Setup -----------------
try:
    theoretical_draft_ws = league_sheet.worksheet("TheoreticalDraft")
except gspread.exceptions.WorksheetNotFound:
    theoretical_draft_ws = None

# ----------------- DevyDraft Sheet Setup -----------------
# Use separate devy sheet if configured, otherwise fall back to league sheet
if DEVY_SHEET_ID:
    try:
        devy_sheet = gc.open_by_key(DEVY_SHEET_ID)
        print(f"[DEBUG] Using separate devy sheet: {DEVY_SHEET_ID}")
    except Exception as e:
        print(f"[ERROR] Failed to open devy sheet: {e}")
        devy_sheet = league_sheet
else:
    devy_sheet = league_sheet
    print("[DEBUG] Using league sheet for devy (no DEVY_SHEET_ID configured)")

try:
    devy_player_pool_ws = devy_sheet.worksheet("DevyPlayerPool")
except gspread.exceptions.WorksheetNotFound:
    devy_player_pool_ws = None

try:
    devy_draft_order_ws = devy_sheet.worksheet("DevyDraftOrder")
except gspread.exceptions.WorksheetNotFound:
    devy_draft_order_ws = None

try:
    devy_draft_history_ws = devy_sheet.worksheet("DevyDraftHistory")
except gspread.exceptions.WorksheetNotFound:
    devy_draft_history_ws = None

try:
    devy_draft_settings_ws = devy_sheet.worksheet("DevyDraftSettings")
except gspread.exceptions.WorksheetNotFound:
    devy_draft_settings_ws = None

try:
    devy_retention_history_ws = devy_sheet.worksheet("DevyRetentionHistory")
except gspread.exceptions.WorksheetNotFound:
    devy_retention_history_ws = None

# ----------------- TransactionLog Sheet Setup -----------------
try:
    transaction_log_ws = league_sheet.worksheet("TransactionLog")
except gspread.exceptions.WorksheetNotFound:
    transaction_log_ws = None

# ----------------- WeeklyResults Sheet Setup -----------------
try:
    weekly_results_ws = league_sheet.worksheet("WeeklyResults")
except gspread.exceptions.WorksheetNotFound:
    weekly_results_ws = None

# ----------------- RookieLedger Sheet Setup -----------------
try:
    rookie_ledger_ws = league_sheet.worksheet("RookieLedger")
except gspread.exceptions.WorksheetNotFound:
    rookie_ledger_ws = None

# Discord Configuration from environment variables
TEAM_LIST_CHANNEL_ID = int(os.getenv("TEAM_LIST_CHANNEL_ID", "0"))
GUILD_ID = int(os.getenv("DISCORD_GUILD_ID", "0"))
AWARDS_CHANNEL_ID = int(os.getenv("AWARDS_CHANNEL_ID", "0"))
COMMITTEE_CHANNEL_ID = int(os.getenv("COMMITTEE_CHANNEL_ID", "0"))
RANKINGS_CHANNEL_ID = int(os.getenv("RANKINGS_CHANNEL_ID", "0"))
GAMEDAY_CHANNEL_ID = int(os.getenv("GAMEDAY_CHANNEL_ID", "0"))
SCHEDULING_CHANNEL_ID = int(os.getenv("SCHEDULING_CHANNEL_ID", "0"))

# Helper to safely parse int from env (handles empty strings)
def env_int(key: str, default: int = 0) -> int:
    val = os.getenv(key, "")
    return int(val) if val.strip() else default

# Conference channel IDs for draft announcements (optional - falls back to DRAFT_CHANNEL_ID if not set)
CONF_CHANNEL_IDS = {
    "ACC": env_int("ACC_CHANNEL_ID"),
    "B10": env_int("B10_CHANNEL_ID"),
    "B12": env_int("B12_CHANNEL_ID"),
    "SEC": env_int("SEC_CHANNEL_ID"),
    "P12": env_int("P12_CHANNEL_ID"),
    "AAC": env_int("AAC_CHANNEL_ID"),
}
DRAFT_CHANNEL_ID = env_int("DRAFT_CHANNEL_ID")  # Fallback channel for all draft announcements

# Devy-specific channel IDs (separate from general conference channels)
DEVY_CHANNEL_IDS = {
    "ACC": env_int("ACC_DEVY_CHANNEL_ID"),
    "B10": env_int("B10_DEVY_CHANNEL_ID"),
    "B12": env_int("B12_DEVY_CHANNEL_ID"),
    "SEC": env_int("SEC_DEVY_CHANNEL_ID"),
    "P12": env_int("P12_DEVY_CHANNEL_ID"),
    "AAC": env_int("AAC_DEVY_CHANNEL_ID"),
}

# Debug: Print loaded conference channel IDs on startup
print(f"[DEBUG] Loaded conference channel IDs: {CONF_CHANNEL_IDS}")
print(f"[DEBUG] Loaded devy channel IDs: {DEVY_CHANNEL_IDS}")
print(f"[DEBUG] Fallback DRAFT_CHANNEL_ID: {DRAFT_CHANNEL_ID}")

# Track last posted Heisman leader to detect changes
last_posted_heisman = None

# Toggle for scheduled auto-posts (awards & rankings) - controlled via /toggle_autoposts (Commish only)
auto_posts_enabled = False

# ----------------- Slash Command: toggle_autoposts -----------------
@bot.tree.command(
    name="toggle_autoposts", description="Turn scheduled auto-posts on or off (Commissioner only)")
async def toggle_autoposts(interaction: discord.Interaction):
    global auto_posts_enabled
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name.lower() == commissioner_role_name.lower() for role in interaction.user.roles):
        await interaction.response.send_message("❌ You must be a Commissioner to run this command.", ephemeral=True)
        return

    auto_posts_enabled = not auto_posts_enabled
    status = "✅ **ON**" if auto_posts_enabled else "⛔ **OFF**"
    await interaction.response.send_message(
        f"Scheduled auto-posts are now {status}.\n"
        f"Affected: Weekly Awards Update, Tuesday Power Rankings.",
        ephemeral=False
    )

# ----------------- Legacy Example Command -----------------
@bot.command()
async def ping(ctx):
    await ctx.send("Pong! Bot is running.")

# ----------------- Slash Command: post_teams -----------------
@bot.tree.command(
    name="post_teams", description="Post all teams by conference (Commissioner only)")
async def post_teams(interaction: discord.Interaction):
    # Check if user has Commissioner role
    member = interaction.user  # already a discord.Member

    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in member.roles):
        await interaction.response.send_message("❌ You must be a Commissioner to run this.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=False)  # optional: show thinking...

    channel = bot.get_channel(TEAM_LIST_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send("❌ Cannot find the team list channel. Check the channel ID.")
        return

    data = teams_ws.get_all_records(expected_headers=[])
    if not data:
        await channel.send("No teams found in the Teams sheet.")
        return

    # Group teams by conference
    conferences = defaultdict(list)
    for row in data:
        conf_raw = row.get("Conference", "Unknown")
        conf = str(conf_raw).strip().title()
        conferences[conf].append(row)

    # Loop through each conference
    for conf, teams in conferences.items():
        lines = []

        for team in teams:
            owner_id_str = str(team.get("Owner Discord ID", "")).strip()
            try:
                discord_id = int(owner_id_str)
                owner_display = f"<@{discord_id}>"  # mention but won't ping if disabled
            except (ValueError, TypeError):
                owner_display = "-"

            emoji = team.get("Emoji", "").strip()
            team_name = team.get("Team Name", "Unnamed Team")
            lines.append(f"{emoji}  {team_name}: {owner_display}")

        # Split messages to avoid Discord 2000-character limit
        message_chunks = []
        chunk = f"**{conf} Conference:**\n"

        for line in lines:
            if len(chunk) + len(line) + 1 > 2000:
                message_chunks.append(chunk)
                chunk = ""
            chunk += line + "\n"
        if chunk:
            message_chunks.append(chunk)

        # Send each chunk without pinging
        for msg in message_chunks:
            await channel.send(msg, allowed_mentions=discord.AllowedMentions.none())

    await interaction.followup.send(f"✅ Teams have been posted in {channel.mention}.")

# ----------------- Slash Command: list_commands -----------------
@bot.tree.command(
    name="list_commands", description="List all registered slash commands")
async def list_commands(interaction: discord.Interaction):
    cmds = [f"/{c.name} — {c.description}" for c in bot.tree.walk_commands()]
    if not cmds:
        await interaction.response.send_message("No commands registered.", ephemeral=True)
    else:
        await interaction.response.send_message("\n".join(cmds), ephemeral=True)

# ----------------- NC Game Confirm/Decline DM Buttons -----------------
class NCConfirmView(discord.ui.View):
    """Confirm / Decline buttons attached to the NC-game request DM.

    In-memory (non-persistent): the buttons work until the timeout or a bot
    restart, after which the opponent falls back to `/schedule submit`. Only the
    requested opponent may act (interaction_check). Confirm reuses the normal
    two-sided confirm path; Decline deletes the pending submission row(s).
    """

    def __init__(self, submitter_discord_id, opponent_discord_id, week, submitter_name, opponent_name):
        super().__init__(timeout=604800)  # 7 days
        self.submitter_discord_id = str(submitter_discord_id)
        self.opponent_discord_id = int(opponent_discord_id)
        self.week = week
        self.submitter_name = submitter_name
        self.opponent_name = opponent_name
        self.message = None
        self.resolved = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.opponent_discord_id:
            await interaction.response.send_message(
                "Only the requested opponent can respond to this matchup.", ephemeral=True
            )
            return False
        return True

    def _disable_buttons(self):
        for child in self.children:
            child.disabled = True

    async def on_timeout(self):
        if self.resolved or self.message is None:
            return
        self._disable_buttons()
        try:
            await self.message.edit(
                content="⏱️ This NC game request expired. Use `/schedule submit` to try again.",
                view=self
            )
        except Exception:
            pass

    @discord.ui.button(label="Confirm Matchup", style=discord.ButtonStyle.success, emoji="✅")
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        if self.resolved:
            await interaction.followup.send("This request has already been handled.", ephemeral=True)
            return

        opponent_team = await asyncio.to_thread(get_team_by_discord_id, interaction.user.id)
        submitter_team = await asyncio.to_thread(get_team_by_discord_id, int(self.submitter_discord_id))
        if not opponent_team or not submitter_team:
            await interaction.followup.send(
                "Couldn't look up both teams — please use `/schedule submit` instead.", ephemeral=True
            )
            return
        opponent_team["discord_id"] = str(interaction.user.id)

        result = await asyncio.to_thread(
            process_nc_button_confirm, submitter_team, opponent_team, self.week
        )
        status = result["status"]
        target_msg = self.message or interaction.message

        if status == "confirmed":
            self.resolved = True
            self._disable_buttons()
            if target_msg:
                await target_msg.edit(
                    content=(
                        f"✅ **Confirmed** — Week {self.week}: "
                        f"{submitter_team['name']} vs {opponent_team['name']} is locked in."
                    ),
                    view=self
                )
            await interaction.followup.send("✅ Matchup confirmed and locked in!", ephemeral=True)
            try:
                sub_dm = discord.Embed(
                    title="NC Game Confirmed!",
                    description=(
                        f"**{opponent_team['name']}** confirmed your Week {self.week} "
                        f"non-conference game."
                    ),
                    color=discord.Color.green()
                )
                await notify_opponent_dm(
                    str(submitter_team["id"]).zfill(3), "NC Game Confirmed", "", embed=sub_dm
                )
            except Exception as e:
                print(f"NCConfirmView: could not DM requester about confirm: {e}")

        elif status == "already":
            self.resolved = True
            self._disable_buttons()
            if target_msg:
                await target_msg.edit(
                    content=f"✅ This Week {self.week} matchup is already confirmed.", view=self
                )
            await interaction.followup.send("This matchup was already confirmed.", ephemeral=True)

        elif status == "gone":
            self.resolved = True
            self._disable_buttons()
            if target_msg:
                await target_msg.edit(
                    content="This request is no longer active (it may have been withdrawn).", view=self
                )
            await interaction.followup.send("This request is no longer active.", ephemeral=True)

        elif status == "error":
            await interaction.followup.send(f"⚠️ {result['message']}", ephemeral=True)

        else:  # "pending" / unexpected
            await interaction.followup.send(
                "Couldn't confirm automatically. Please use `/schedule submit` to confirm.",
                ephemeral=True
            )

    @discord.ui.button(label="Decline", style=discord.ButtonStyle.danger, emoji="❌")
    async def decline(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        if self.resolved:
            await interaction.followup.send("This request has already been handled.", ephemeral=True)
            return

        match_key = f"{self.week}-{'-'.join(sorted([self.submitter_name, self.opponent_name]))}"
        await asyncio.to_thread(delete_pending_submissions, match_key)

        self.resolved = True
        self._disable_buttons()
        target_msg = self.message or interaction.message
        if target_msg:
            await target_msg.edit(
                content=(
                    f"❌ **Declined** — Week {self.week} game vs "
                    f"{self.submitter_name} was turned down."
                ),
                view=self
            )
        await interaction.followup.send("Request declined and removed.", ephemeral=True)

        try:
            submitter_team = await asyncio.to_thread(
                get_team_by_discord_id, int(self.submitter_discord_id)
            )
            if submitter_team:
                dm = discord.Embed(
                    title="NC Game Declined",
                    description=(
                        f"**{self.opponent_name}** declined your Week {self.week} "
                        f"non-conference game request."
                    ),
                    color=discord.Color.red()
                )
                await notify_opponent_dm(
                    str(submitter_team["id"]).zfill(3), "NC Game Declined", "", embed=dm
                )
        except Exception as e:
            print(f"NCConfirmView: could not DM requester about decline: {e}")


# ----------------- Schedule Request Matchup Command -----------------
@schedule.command(name="submit", description="Submit a manual non-conference game")
@app_commands.describe(
    week="Week number (1-4 for NC games)",
    opponent="@ mention the team owner you want to schedule against"
)
async def schedule_submit(
    interaction: discord.Interaction,
    week: int,
    opponent: discord.Member
):
    await interaction.response.defer(ephemeral=True)

    try:
        # Check channel restriction
        if interaction.channel_id != SCHEDULING_CHANNEL_ID:
            await interaction.followup.send(
                f"This command can only be used in <#{SCHEDULING_CHANNEL_ID}>."
            )
            return

        # Check if NC game submissions are open
        if not await asyncio.to_thread(are_nc_games_open):
            await interaction.followup.send(
                "🔒 **NC game submissions are currently closed.**\n"
                "Please wait for the Commish to open the submission period."
            )
            return

        team = await asyncio.to_thread(get_team_by_discord_id, interaction.user.id)
        if not team:
            await interaction.followup.send("You are not registered as a team owner.")
            return

        # Look up opponent team by their Discord ID
        opponent_team = await asyncio.to_thread(get_team_by_discord_id, opponent.id)
        if not opponent_team:
            await interaction.followup.send(f"{opponent.mention} is not registered as a team owner.")
            return

        # Enforce all NC scheduling limits (conference, week window, max games,
        # repeat opponent, one game per week) before recording the submission.
        error = await asyncio.to_thread(validate_nc_submission, team, opponent_team, week)
        if error:
            await interaction.followup.send(error, ephemeral=True)
            return

        opponent_id = str(opponent_team["id"]).zfill(3)
        opponent_name = opponent_team["name"]

        match_key = f"{week}-{'-'.join(sorted([team['name'], opponent_name]))}"

        status_msg = await interaction.followup.send(
            f"Submitting NC game request for Week {week}...", ephemeral=True
        )

        await asyncio.to_thread(manual_sub_ws.append_row, [
            datetime.utcnow().isoformat(),
            week,
            team["name"],
            opponent_name,
            interaction.user.id,
            "PENDING",
            match_key
        ])

        confirmed = await asyncio.to_thread(try_confirm_manual_game, match_key)

        if confirmed:
            await status_msg.edit(
                content=(
                    f"**Game Confirmed!**\n"
                    f"Week {week}: {team['name']} vs {opponent_name}\n"
                    f"This game has been locked in for scheduling!"
                )
            )
        else:
            # Game is pending - DM the opponent with Confirm/Decline buttons
            dm_embed = discord.Embed(
                title="NC Game Request Received!",
                description=f"**{team['name']}** wants to schedule a non-conference game with you.",
                color=discord.Color.blue()
            )
            dm_embed.add_field(name="Week", value=str(week), inline=True)
            dm_embed.add_field(name="Opponent", value=team['name'], inline=True)
            dm_embed.add_field(
                name="To Respond",
                value=(
                    "Use the buttons below to **Confirm** or **Decline** this matchup.\n"
                    f"*(Fallback: run `/schedule submit week:{week} opponent:@{team['name']}` "
                    f"in <#{SCHEDULING_CHANNEL_ID}>.)*"
                ),
                inline=False
            )
            dm_embed.set_footer(
                text="Only you can confirm or decline this request."
            )

            view = NCConfirmView(
                submitter_discord_id=interaction.user.id,
                opponent_discord_id=opponent.id,
                week=week,
                submitter_name=team['name'],
                opponent_name=opponent_name,
            )
            dm_result = await notify_opponent_dm(
                opponent_id, "NC Game Request", "", embed=dm_embed, view=view
            )

            dm_status = ""
            if dm_result["sent"]:
                dm_status = f"\n\n📬 **{opponent_name}** has been notified via DM (with Confirm/Decline buttons)."
            else:
                dm_status = f"\n\n⚠️ Could not DM {opponent_name} ({dm_result['error']}). Please notify them directly."

            await status_msg.edit(
                content=(
                    f"🕒 Submission recorded\n"
                    f"Week {week}: {team['name']} vs {opponent_name}\n"
                    f"Waiting for reciprocal submission.{dm_status}"
                )
            )

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while submitting the schedule request. Please try again.",
            ephemeral=True
        )


@commish.command(name="schedule_submit", description="Submit an NC game on behalf of a team owner")
@app_commands.describe(
    team_owner="@ mention the team owner you are submitting for",
    opponent="@ mention the team owner they want to schedule against",
    week="Week number (1-4 for NC games)"
)
async def schedule_submit_for(
    interaction: discord.Interaction,
    team_owner: discord.Member,
    opponent: discord.Member,
    week: int
):
    await interaction.response.defer(ephemeral=True)

    try:
        # Commish role check
        if not has_commish_role(interaction):
            await interaction.followup.send(
                "You must have the **Commish** role to use this command.",
                ephemeral=True
            )
            return

        # Check channel restriction
        if interaction.channel_id != SCHEDULING_CHANNEL_ID:
            await interaction.followup.send(
                f"This command can only be used in <#{SCHEDULING_CHANNEL_ID}>."
            )
            return

        # Check if NC game submissions are open
        if not await asyncio.to_thread(are_nc_games_open):
            await interaction.followup.send(
                "🔒 **NC game submissions are currently closed.**\n"
                "Please open submissions first with `/commish open`."
            )
            return

        # Look up team_owner's team (submitting on their behalf)
        team = await asyncio.to_thread(get_team_by_discord_id, team_owner.id)
        if not team:
            await interaction.followup.send(
                f"{team_owner.mention} is not registered as a team owner."
            )
            return

        # Look up opponent team
        opponent_team = await asyncio.to_thread(get_team_by_discord_id, opponent.id)
        if not opponent_team:
            await interaction.followup.send(
                f"{opponent.mention} is not registered as a team owner."
            )
            return

        # Enforce all NC scheduling limits (conference, week window, max games,
        # repeat opponent, one game per week) before recording the submission.
        error = await asyncio.to_thread(validate_nc_submission, team, opponent_team, week)
        if error:
            await interaction.followup.send(error, ephemeral=True)
            return

        opponent_id = str(opponent_team["id"]).zfill(3)
        opponent_name = opponent_team["name"]

        match_key = f"{week}-{'-'.join(sorted([team['name'], opponent_name]))}"

        status_msg = await interaction.followup.send(
            f"Submitting NC game request on behalf of {team['name']}...", ephemeral=True
        )

        # Use team_owner.id so it appears in team_owner's /schedule status
        await asyncio.to_thread(manual_sub_ws.append_row, [
            datetime.utcnow().isoformat(),
            week,
            team["name"],
            opponent_name,
            team_owner.id,
            "PENDING",
            match_key
        ])

        confirmed = await asyncio.to_thread(try_confirm_manual_game, match_key)

        if confirmed:
            await status_msg.edit(
                content=(
                    f"**Game Confirmed!** (submitted on behalf of {team['name']})\n"
                    f"Week {week}: {team['name']} vs {opponent_name}\n"
                    f"This game has been locked in for scheduling!"
                )
            )
        else:
            # Game is pending - DM the opponent with Confirm/Decline buttons
            dm_embed = discord.Embed(
                title="NC Game Request Received!",
                description=(
                    f"**{team['name']}** wants to schedule a non-conference game with you.\n"
                    f"*(Submitted by the Commissioner on their behalf)*"
                ),
                color=discord.Color.blue()
            )
            dm_embed.add_field(name="Week", value=str(week), inline=True)
            dm_embed.add_field(name="Opponent", value=team['name'], inline=True)
            dm_embed.add_field(
                name="To Respond",
                value=(
                    "Use the buttons below to **Confirm** or **Decline** this matchup.\n"
                    f"*(Fallback: run `/schedule submit week:{week} opponent:@{team['name']}` "
                    f"in <#{SCHEDULING_CHANNEL_ID}>.)*"
                ),
                inline=False
            )
            dm_embed.set_footer(
                text="Only you can confirm or decline this request."
            )

            view = NCConfirmView(
                submitter_discord_id=team_owner.id,
                opponent_discord_id=opponent.id,
                week=week,
                submitter_name=team['name'],
                opponent_name=opponent_name,
            )
            dm_result = await notify_opponent_dm(
                opponent_id, "NC Game Request", "", embed=dm_embed, view=view
            )

            dm_status = ""
            if dm_result["sent"]:
                dm_status = f"\n\n📬 **{opponent_name}** has been notified via DM (with Confirm/Decline buttons)."
            else:
                dm_status = f"\n\n⚠️ Could not DM {opponent_name} ({dm_result['error']}). Please notify them directly."

            await status_msg.edit(
                content=(
                    f"Submission recorded on behalf of **{team['name']}**.\n"
                    f"Week {week}: {team['name']} vs {opponent_name}\n"
                    f"Waiting for reciprocal submission.{dm_status}"
                )
            )

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while submitting the schedule request. Please try again.",
            ephemeral=True
        )


# ----------------- Schedule Status Matchup Command -----------------
def build_schedule_status_embed(
    franchise_id, team_name, team_schedule, nc_by_week,
    emoji_map, name_map, name_to_id, rivalry_set, my_rivalries, year, num_weeks=12
):
    """Build a Discord embed showing a team's full schedule with NC game state.

    Weeks in the NC window (NC_WEEK_MIN..NC_WEEK_MAX) are overlaid with the
    team's non-conference game status (confirmed / pending / open). Remaining
    weeks show the finalized opponent from the Schedule sheet, or TBD if the
    scheduler has not run yet.

    A confirmed rivalry is marked with ⚔️ on whatever week its matchup lands in
    — including NC-window weeks, since a cross-conference rivalry is played as a
    non-conference game. `my_rivalries` is the list of this team's confirmed
    rivalries (see get_confirmed_rivalries_for_team), rendered as a summary field
    so a confirmed rivalry always appears even if its week isn't populated yet.
    """
    confirmed_ct = sum(1 for g in nc_by_week.values() if g["status"] == "CONFIRMED")
    pending_ct = sum(1 for g in nc_by_week.values() if g["status"] == "PENDING")
    open_slots = max(0, MAX_NC_GAMES_PER_TEAM - confirmed_ct - pending_ct)

    embed = discord.Embed(
        title=f"📋 Your {year} Schedule",
        description=(
            f"**{team_name}**\n"
            f"Non-conference games — ✅ {confirmed_ct} confirmed · "
            f"🕒 {pending_ct} pending · 🔓 {open_slots} open"
        ),
        color=discord.Color.blue()
    )

    def _is_rival(opp_id):
        return bool(opp_id) and frozenset({franchise_id, opp_id}) in rivalry_set

    def _opp_display(name):
        fid = name_to_id.get(_norm_team_name(name))
        emoji = emoji_map.get(fid, "") if fid else ""
        marker = " ⚔️" if _is_rival(fid) else ""
        return f"{emoji} {name}{marker}".strip()

    for week in range(1, num_weeks + 1):
        nc = nc_by_week.get(week)
        opponent_id = team_schedule.get(week)

        if nc and nc["status"] == "CONFIRMED":
            value = f"✅ {_opp_display(nc['opponent'])}\n*NC · confirmed*"
        elif nc and nc["status"] == "PENDING":
            value = f"🕒 {_opp_display(nc['opponent'])}\n*NC · pending*"
        elif opponent_id:
            opp_emoji = emoji_map.get(opponent_id, "")
            opp_name = name_map.get(opponent_id, f"Team {opponent_id}")
            rivalry_marker = " ⚔️" if _is_rival(opponent_id) else ""
            value = f"{opp_emoji} {opp_name}{rivalry_marker}".strip()
        elif NC_WEEK_MIN <= week <= NC_WEEK_MAX:
            value = "🔓 OPEN"
        else:
            value = "🗓️ TBD"

        embed.add_field(name=f"Week {week}", value=value, inline=True)

    # Confirmed rivalries listed explicitly (most recently confirmed first) so
    # they show regardless of whether the matchup week has been scheduled yet.
    if my_rivalries:
        rival_lines = []
        for r in my_rivalries:
            opp_emoji = emoji_map.get(r["opponent_id"], "")
            rival_lines.append(
                f"⚔️ **{r['name']}** — {opp_emoji} {r['opponent_name']} "
                f"({r['type']}, ${r['wager']})".replace("  ", " ").strip()
            )
        embed.add_field(
            name=f"Confirmed Rivalries ({len(my_rivalries)})",
            value="\n".join(rival_lines),
            inline=False
        )

    embed.set_footer(
        text="✅ Confirmed · 🕒 Pending · 🔓 Open NC slot · ⚔️ Rivalry · 🗓️ TBD"
    )
    return embed


def get_confirmed_rivalries_for_team(franchise_id, rivalry_records, name_map):
    """Return this team's confirmed rivalries, most-recently-confirmed first.

    Each entry: {opponent_id, opponent_name, name, type, wager, confirmed_at}.
    One row per rivalry (confirmation updates the pending row in place), but we
    dedupe by opponent pair defensively. `confirmed_at` is the Submitted column,
    which is overwritten with the confirmation timestamp when a rivalry confirms,
    so sorting by it descending surfaces the newest confirmations.
    """
    franchise_id = str(franchise_id).zfill(3)
    rivalries = []
    seen = set()
    for r in rivalry_records:
        if r.get("Status") != "CONFIRMED":
            continue
        team_a = str(r.get("Team A", "")).strip().zfill(3)
        team_b = str(r.get("Team B", "")).strip().zfill(3)
        if franchise_id == team_a:
            opp_id, opp_name = team_b, r.get("Team B Name", "")
        elif franchise_id == team_b:
            opp_id, opp_name = team_a, r.get("Team A Name", "")
        else:
            continue
        if opp_id in seen:
            continue
        seen.add(opp_id)
        rivalries.append({
            "opponent_id": opp_id,
            "opponent_name": opp_name or name_map.get(opp_id, f"Team {opp_id}"),
            "name": r.get("Rivalry Name", "Unnamed"),
            "type": r.get("Type", "?"),
            "wager": r.get("Wager", 0),
            "confirmed_at": str(r.get("Submitted", "")),
        })
    rivalries.sort(key=lambda x: x["confirmed_at"], reverse=True)
    return rivalries


@schedule.command(
    name="status",
    description="View your 12-week schedule and non-conference game status"
)
async def schedule_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    try:
        team = await asyncio.to_thread(get_team_by_discord_id, interaction.user.id)
        if not team:
            await interaction.followup.send(
                "You are not registered as a team owner.", ephemeral=True
            )
            return

        franchise_id = str(team["id"]).zfill(3)
        team_name = team["name"]

        # Non-conference games (pending + confirmed) for this team, keyed by week.
        nc_games = await asyncio.to_thread(get_team_nc_games, team_name)
        nc_by_week = {}
        for g in nc_games:
            try:
                wk = int(g.get("week"))
            except (ValueError, TypeError):
                continue
            existing = nc_by_week.get(wk)
            # A confirmed game always wins over a stale pending one for the same week.
            if existing and existing["status"] == "CONFIRMED":
                continue
            nc_by_week[wk] = {"status": g.get("status"), "opponent": g.get("opponent")}

        # Finalized schedule (Schedule sheet may not exist until the scheduler runs).
        team_schedule = {}
        try:
            schedule_ws = await asyncio.to_thread(scheduler_sheet.worksheet, "Schedule")
            schedule_records = await asyncio.to_thread(
                schedule_ws.get_all_records, expected_headers=[]
            )
            team_schedule = build_schedule_map(schedule_records).get(franchise_id, {})
        except gspread.exceptions.WorksheetNotFound:
            team_schedule = {}
        except Exception as e:
            print(f"schedule_status: could not read Schedule sheet: {e}")
            team_schedule = {}

        # Team lookups for display.
        emoji_map = await asyncio.to_thread(get_team_emoji_map)
        name_map = await asyncio.to_thread(get_team_name_map)
        name_to_id = {_norm_team_name(v): k for k, v in name_map.items()}

        try:
            rivalry_records = await asyncio.to_thread(
                rivalries_ws.get_all_records, expected_headers=[]
            )
            rivalry_set = build_confirmed_rivalry_set(rivalry_records)
            my_rivalries = get_confirmed_rivalries_for_team(
                franchise_id, rivalry_records, name_map
            )
        except Exception as e:
            print(f"schedule_status: could not load rivalries: {e}")
            rivalry_set = set()
            my_rivalries = []

        # Scheduling happens in a fixed offseason window, so the schedule being
        # built always belongs to the current calendar year — unlike results-based
        # commands, which use get_current_year() (last completed season).
        year = datetime.now().year

        embed = build_schedule_status_embed(
            franchise_id, team_name, team_schedule, nc_by_week,
            emoji_map, name_map, name_to_id, rivalry_set, my_rivalries, year
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while checking your schedule status. Please try again.",
            ephemeral=True
        )

# ----------------- Schedule Availability Command -----------------
@schedule.command(
    name="available",
    description="See which teams still have open non-conference weeks, and their owners"
)
@app_commands.describe(
    week="Only show a specific NC week (1-4). Defaults to all four weeks.",
    conference="Only show teams from this conference (e.g. SEC)",
    include_own_conference="Include teams in your own conference (hidden by default; they can't be NC opponents)"
)
async def schedule_available(
    interaction: discord.Interaction,
    week: int = None,
    conference: str = None,
    include_own_conference: bool = False
):
    await interaction.response.defer(ephemeral=True)

    try:
        nc_weeks = list(range(NC_WEEK_MIN, NC_WEEK_MAX + 1))
        if week is not None and week not in nc_weeks:
            await interaction.followup.send(
                f"NC games are only in weeks {NC_WEEK_MIN}–{NC_WEEK_MAX}.",
                ephemeral=True
            )
            return

        directory = await asyncio.to_thread(get_franchise_directory)
        nc_index = await asyncio.to_thread(build_nc_schedule_index)

        # Identify the caller (optional — board still renders for non-owners).
        caller_id = normalize_discord_id(interaction.user.id)
        me = None
        for fid, info in directory.items():
            if info["discord_id"] and info["discord_id"] == caller_id:
                me = {"id": fid, **info}
                break

        my_conf_norm = me["conference"].strip().lower() if me else None

        # Confirmed rivalries (for the ⚔️ flag). Only meaningful if we know the caller.
        rivalry_set = set()
        if me:
            try:
                rivalry_records = await asyncio.to_thread(
                    rivalries_ws.get_all_records, expected_headers=[]
                )
                rivalry_set = build_confirmed_rivalry_set(rivalry_records)
            except Exception as e:
                print(f"schedule_available: could not load rivalries: {e}")

        # Validate / normalize the conference filter.
        conf_filter = conference.strip().lower() if conference else None
        valid_confs = {info["conference"] for info in directory.values() if info["conference"]}
        if conf_filter and conf_filter not in {c.lower() for c in valid_confs}:
            await interaction.followup.send(
                f"Unknown conference `{conference}`. Valid: {', '.join(sorted(valid_confs))}.",
                ephemeral=True
            )
            return

        # An explicit conference filter overrides the own-conference exclusion.
        exclude_own = bool(me) and not include_own_conference and not conf_filter

        target_weeks = [week] if week is not None else nc_weeks
        MULTI = week is None
        per_week_cap = 10 if MULTI else 30
        field_chunk = 8  # keep each field well under Discord's 1024-char limit
        MAX_FIELDS = 24  # Discord hard limit is 25; keep one in reserve.

        def _open_weeks(team_name):
            used = nc_index.get(_norm_team_name(team_name), {}).get("weeks", set())
            return [w for w in nc_weeks if w not in used]

        def _line(fid, info):
            is_rival = bool(me) and frozenset({me["id"], fid}) in rivalry_set
            rival_pfx = "⚔️ " if is_rival else ""
            emoji = (info["emoji"] + " ") if info["emoji"] else ""
            mention = f"<@{info['discord_id']}>" if info["discord_id"] else "*(no Discord linked)*"
            open_csv = ",".join(str(w) for w in _open_weeks(info["name"]))
            return f"{rival_pfx}{emoji}{info['name']} ({info['conference']}) — {mention} · open {open_csv}"

        embed = discord.Embed(
            title="📅 NC Availability" + (f" — Week {week}" if week is not None else ""),
            color=discord.Color.green()
        )

        fields_added = 0
        for w in target_weeks:
            candidates = []
            for fid, info in directory.items():
                if me and fid == me["id"]:
                    continue
                info_conf = info["conference"].strip().lower()
                if exclude_own and info_conf == my_conf_norm:
                    continue
                if conf_filter and info_conf != conf_filter:
                    continue
                used = nc_index.get(_norm_team_name(info["name"]), {}).get("weeks", set())
                if w in used:
                    continue  # has a game that week → not open
                candidates.append((fid, info))

            candidates.sort(key=lambda t: (t[1]["conference"], t[1]["name"].lower()))

            if not candidates:
                if fields_added < MAX_FIELDS:
                    embed.add_field(
                        name=f"Week {w} — 0 open",
                        value="_No available teams._",
                        inline=False
                    )
                    fields_added += 1
                continue

            shown = candidates[:per_week_cap]
            extra = len(candidates) - len(shown)
            lines = [_line(fid, info) for fid, info in shown]

            for i in range(0, len(lines), field_chunk):
                if fields_added >= MAX_FIELDS:
                    break
                part = f" ({i // field_chunk + 1})" if len(lines) > field_chunk else ""
                embed.add_field(
                    name=f"Week {w} — {len(candidates)} open{part}",
                    value="\n".join(lines[i:i + field_chunk]),
                    inline=False
                )
                fields_added += 1

            if extra > 0 and fields_added < MAX_FIELDS:
                embed.add_field(
                    name=f"Week {w} — more",
                    value=f"…and **{extra}** more. Narrow with `conference:` to see them.",
                    inline=False
                )
                fields_added += 1

        # Header / context.
        if me:
            desc = f"**{me['name']}** ({me['conference']})\n"
            if exclude_own:
                desc += "Your conference is hidden — use `include_own_conference:true` to show it.\n"
        else:
            desc = "*You're not registered as a team owner — showing all teams, no rival flags.*\n"
        if conf_filter:
            desc += f"Filtered to **{conference.strip().upper()}**.\n"
        embed.description = desc

        submissions_open = await asyncio.to_thread(are_nc_games_open)
        footer = "⚔️ = confirmed rival · non-conference scheduling"
        if not submissions_open:
            footer = "🔒 NC submissions are currently CLOSED · " + footer
        embed.set_footer(text=footer)

        await interaction.followup.send(
            embed=embed,
            ephemeral=True,
            allowed_mentions=discord.AllowedMentions.none()
        )

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while checking availability. Please try again.",
            ephemeral=True
        )

# ----------------- Rivalry Commands -----------------

@rival.command(name="submit", description="Submit a rivalry request to another team")
@app_commands.describe(
    opponent="@ mention the team owner you want to establish a rivalry with",
    name="Name for the rivalry (e.g., 'The Iron Bowl')",
    wager="Wager amount for the rivalry ($0-5)"
)
async def rival_submit(
    interaction: discord.Interaction,
    opponent: discord.Member,
    name: str,
    wager: int
):
    await interaction.response.defer(ephemeral=True)

    try:
        # Check channel restriction
        if interaction.channel_id != SCHEDULING_CHANNEL_ID:
            await interaction.followup.send(
                f"This command can only be used in <#{SCHEDULING_CHANNEL_ID}>."
            )
            return

        # Check if rivalry submissions are open
        if not await asyncio.to_thread(are_rivalries_open):
            await interaction.followup.send(
                "🔒 **Rivalry submissions are currently closed.**\n"
                "Please wait for the Commish to open the submission period."
            )
            return

        # Get submitter's team
        submitter = await asyncio.to_thread(get_team_by_discord_id, interaction.user.id)
        if not submitter:
            await interaction.followup.send(
                "You are not registered as a team owner in FranchiseLookup."
            )
            return

        submitter_id = str(submitter["id"]).zfill(3)
        submitter_name = submitter["name"]
        submitter_conf = submitter["conference"]

        # Look up opponent team by their Discord ID
        opponent_team = await asyncio.to_thread(get_team_by_discord_id, opponent.id)
        if not opponent_team:
            await interaction.followup.send(
                f"{opponent.mention} is not registered as a team owner in FranchiseLookup."
            )
            return

        opponent_id = str(opponent_team["id"]).zfill(3)
        opponent_name = opponent_team["name"]
        opponent_conf = opponent_team["conference"]

        # Cannot rival yourself
        if submitter_id == opponent_id:
            await interaction.followup.send("You cannot create a rivalry with yourself.")
            return

        # Validate wager
        if wager < 0 or wager > MAX_WAGER:
            await interaction.followup.send(
                f"Wager must be between $0 and ${MAX_WAGER}."
            )
            return

        # Check if a rivalry already exists between these two teams (PENDING or CONFIRMED)
        existing_rivalry = await asyncio.to_thread(has_existing_rivalry, submitter_id, opponent_id)
        if existing_rivalry["exists"]:
            rec = existing_rivalry["record"]
            if existing_rivalry["status"] == "CONFIRMED":
                await interaction.followup.send(
                    f"A rivalry between **{submitter_name}** and **{opponent_name}** is already **confirmed**.\n\n"
                    f"**{rec.get('Rivalry Name')}**\n"
                    f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n\n"
                    f"No further action needed."
                )
                return
            else:
                # PENDING - try to confirm by matching details
                confirm_result = await asyncio.to_thread(
                    try_confirm_rivalry, submitter_id, opponent_id, name, wager
                )
                if confirm_result["matched"]:
                    await interaction.followup.send(
                        f"**Rivalry Confirmed!**\n\n"
                        f"**{rec.get('Rivalry Name')}**\n"
                        f"{submitter_name} vs {opponent_name}\n"
                        f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n\n"
                        f"Both teams submitted matching details. Good luck!"
                    )
                    # DM the original submitter that the rivalry is confirmed
                    row_a = str(rec.get("Team A", "")).zfill(3)
                    original_submitter_id = row_a
                    dm_embed = discord.Embed(
                        title="Rivalry Confirmed!",
                        description=f"Your rivalry **{rec.get('Rivalry Name')}** has been confirmed.",
                        color=discord.Color.green()
                    )
                    dm_embed.add_field(name="Opponent", value=opponent_name if original_submitter_id == submitter_id else submitter_name, inline=True)
                    dm_embed.add_field(name="Wager", value=f"${rec.get('Wager')}", inline=True)
                    dm_embed.add_field(name="Type", value=rec.get('Type'), inline=True)
                    await notify_opponent_dm(original_submitter_id, "Rivalry Confirmed", "", embed=dm_embed)
                elif confirm_result.get("already_submitted"):
                    await interaction.followup.send(
                        f"You already have a **pending** rivalry request to **{opponent_name}**.\n\n"
                        f"**{rec.get('Rivalry Name')}**\n"
                        f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n"
                        f"Submitted: {rec.get('Submitted', '')}\n\n"
                        f"Waiting for **{opponent_name}** to submit matching details to confirm."
                    )
                elif confirm_result.get("mismatch"):
                    existing = confirm_result["existing"]
                    await interaction.followup.send(
                        f"**{opponent_name}** has a pending rivalry request, but the details don't match.\n\n"
                        f"Their submission: **{existing.get('Rivalry Name')}** | Wager: ${existing.get('Wager')}\n"
                        f"Your submission: **{name}** | Wager: ${wager}\n\n"
                        f"Both teams must submit **identical** name and wager to confirm."
                    )
                return

        # Check submitter's rivalry count
        submitter_count = await asyncio.to_thread(get_team_rivalry_count, submitter_id)
        if submitter_count >= MAX_RIVALS_PER_TEAM:
            await interaction.followup.send(
                f"You already have {submitter_count} confirmed rivalries (max {MAX_RIVALS_PER_TEAM})."
            )
            return

        # Check opponent's rivalry count
        opponent_count = await asyncio.to_thread(get_team_rivalry_count, opponent_id)
        if opponent_count >= MAX_RIVALS_PER_TEAM:
            await interaction.followup.send(
                f"{opponent_name} already has {opponent_count} confirmed rivalries (max {MAX_RIVALS_PER_TEAM})."
            )
            return

        # Determine rivalry type (CONF or NC)
        rivalry_type = "CONF" if submitter_conf == opponent_conf else "NC"

        # No existing submission from opponent - create new pending rivalry
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_row = [
            submitter_id,       # Team A
            submitter_name,     # Team A Name
            opponent_id,        # Team B
            opponent_name,      # Team B Name
            name,               # Rivalry Name
            wager,              # Wager
            rivalry_type,       # Type (CONF or NC)
            "PENDING",          # Status
            now                 # Submitted
        ]

        status_msg = await interaction.followup.send(
            f"Submitting rivalry request **{name}**...", ephemeral=True
        )

        await asyncio.to_thread(rivalries_ws.append_row, new_row)

        # DM the opponent about the rivalry request
        dm_embed = discord.Embed(
            title="Rivalry Request Received!",
            description=f"**{submitter_name}** wants to establish a rivalry with you.",
            color=discord.Color.orange()
        )
        dm_embed.add_field(name="Rivalry Name", value=name, inline=True)
        dm_embed.add_field(name="Wager", value=f"${wager}", inline=True)
        dm_embed.add_field(name="Type", value=rivalry_type, inline=True)
        dm_embed.add_field(
            name="To Confirm",
            value=f"Submit matching details:\n`/rival submit opponent:@{submitter_name} name:{name} wager:{wager}`",
            inline=False
        )
        dm_embed.set_footer(text="Both teams must submit identical details to confirm.")

        dm_result = await notify_opponent_dm(opponent_id, "Rivalry Request", "", embed=dm_embed)

        dm_status = ""
        if dm_result["sent"]:
            dm_status = f"\n\n📬 **{opponent_name}** has been notified via DM."
        else:
            dm_status = f"\n\n⚠️ Could not DM {opponent_name} ({dm_result['error']}). Please notify them directly."

        await status_msg.edit(
            content=(
                f"**Rivalry Request Logged Successfully!**\n\n"
                f"**{name}**\n"
                f"{submitter_name} vs {opponent_name}\n"
                f"Type: {rivalry_type} | Wager: ${wager}\n"
                f"Submitted: {now}\n\n"
                f"Waiting for **{opponent_name}** to submit matching details:\n"
                f"`/rival submit opponent:@{submitter_name} name:{name} wager:{wager}`"
                f"{dm_status}"
            )
        )

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while processing your rivalry submission. Please try again.",
            ephemeral=True
        )


@rival.command(name="status", description="Check your rivalry status")
async def rival_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    try:
        # Get user's team
        team = await asyncio.to_thread(get_team_by_discord_id, interaction.user.id)
        if not team:
            await interaction.followup.send(
                "You are not registered as a team owner in FranchiseLookup."
            )
            return

        team_id = str(team["id"]).zfill(3)
        team_name = team["name"]

        # Get all rivalries involving this team
        records = await asyncio.to_thread(rivalries_ws.get_all_records)
        confirmed = []
        pending_mine = []
        pending_theirs = []
        seen_pairs = set()  # Track unique rivalry pairs to prevent double counting

        for r in records:
            team_a = str(r.get("Team A", "")).zfill(3)
            team_b = str(r.get("Team B", "")).zfill(3)

            if team_a != team_id and team_b != team_id:
                continue

            # Create unique key for this rivalry pair (sorted to handle A-B and B-A as same)
            pair_key = "-".join(sorted([team_a, team_b]))
            status = r.get("Status", "")

            # Skip if we've already processed this pair with the same status
            pair_status_key = f"{pair_key}:{status}"
            if pair_status_key in seen_pairs:
                continue
            seen_pairs.add(pair_status_key)

            rival_name = r.get("Rivalry Name", "Unnamed")
            wager = r.get("Wager", 0)
            rival_type = r.get("Type", "?")

            # Determine opponent
            if team_a == team_id:
                opponent_name = r.get("Team B Name", team_b)
                i_submitted = True
            else:
                opponent_name = r.get("Team A Name", team_a)
                i_submitted = False

            rivalry_info = {
                "name": rival_name,
                "opponent": opponent_name,
                "wager": wager,
                "type": rival_type
            }

            if status == "CONFIRMED":
                confirmed.append(rivalry_info)
            elif status == "PENDING":
                if i_submitted:
                    pending_mine.append(rivalry_info)
                else:
                    pending_theirs.append(rivalry_info)

        # Build response
        lines = [f"**Rivalry Status for {team_name}**\n"]
        lines.append(f"Confirmed: {len(confirmed)}/{MAX_RIVALS_PER_TEAM}\n")

        if confirmed:
            lines.append("**Confirmed Rivalries:**")
            for r in confirmed:
                lines.append(f"  - **{r['name']}** vs {r['opponent']} ({r['type']}, ${r['wager']})")

        if pending_mine:
            lines.append("\n**Awaiting Opponent Confirmation:**")
            for r in pending_mine:
                lines.append(f"  - **{r['name']}** vs {r['opponent']} ({r['type']}, ${r['wager']})")

        if pending_theirs:
            lines.append("\n**Pending Your Confirmation:**")
            for r in pending_theirs:
                lines.append(
                    f"  - **{r['name']}** vs {r['opponent']} ({r['type']}, ${r['wager']})\n"
                    f"    Use `/rival submit` with matching details to confirm"
                )

        if not confirmed and not pending_mine and not pending_theirs:
            lines.append("\nNo rivalries found. Use `/rival submit` to create one!")

        await interaction.followup.send("\n".join(lines), ephemeral=True)

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while checking your rivalry status. Please try again.",
            ephemeral=True
        )


@commish.command(name="rival_submit", description="Submit a rivalry request on behalf of a team owner")
@app_commands.describe(
    team_owner="@ mention the team owner you are submitting for",
    opponent="@ mention the team owner they want to rival",
    name="Name for the rivalry (e.g., 'The Iron Bowl')",
    wager="Wager amount for the rivalry ($0-5)"
)
async def rival_submit_for(
    interaction: discord.Interaction,
    team_owner: discord.Member,
    opponent: discord.Member,
    name: str,
    wager: int
):
    await interaction.response.defer(ephemeral=True)

    try:
        # Commish role check
        if not has_commish_role(interaction):
            await interaction.followup.send(
                "You must have the **Commish** role to use this command.",
                ephemeral=True
            )
            return

        # Check channel restriction
        if interaction.channel_id != SCHEDULING_CHANNEL_ID:
            await interaction.followup.send(
                f"This command can only be used in <#{SCHEDULING_CHANNEL_ID}>."
            )
            return

        # Check if rivalry submissions are open
        if not await asyncio.to_thread(are_rivalries_open):
            await interaction.followup.send(
                "🔒 **Rivalry submissions are currently closed.**\n"
                "Please open submissions first with `/commish open`."
            )
            return

        # Look up team_owner's team (submitting on their behalf)
        submitter = await asyncio.to_thread(get_team_by_discord_id, team_owner.id)
        if not submitter:
            await interaction.followup.send(
                f"{team_owner.mention} is not registered as a team owner in FranchiseLookup."
            )
            return

        submitter_id = str(submitter["id"]).zfill(3)
        submitter_name = submitter["name"]
        submitter_conf = submitter["conference"]

        # Look up opponent team
        opponent_team = await asyncio.to_thread(get_team_by_discord_id, opponent.id)
        if not opponent_team:
            await interaction.followup.send(
                f"{opponent.mention} is not registered as a team owner in FranchiseLookup."
            )
            return

        opponent_id = str(opponent_team["id"]).zfill(3)
        opponent_name = opponent_team["name"]
        opponent_conf = opponent_team["conference"]

        # Cannot rival yourself
        if submitter_id == opponent_id:
            await interaction.followup.send("A team cannot create a rivalry with itself.")
            return

        # Validate wager
        if wager < 0 or wager > MAX_WAGER:
            await interaction.followup.send(
                f"Wager must be between $0 and ${MAX_WAGER}."
            )
            return

        # Check if a rivalry already exists between these two teams (PENDING or CONFIRMED)
        existing_rivalry = await asyncio.to_thread(has_existing_rivalry, submitter_id, opponent_id)
        if existing_rivalry["exists"]:
            rec = existing_rivalry["record"]
            if existing_rivalry["status"] == "CONFIRMED":
                await interaction.followup.send(
                    f"A rivalry between **{submitter_name}** and **{opponent_name}** is already **confirmed**.\n\n"
                    f"**{rec.get('Rivalry Name')}**\n"
                    f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n\n"
                    f"No further action needed."
                )
                return
            else:
                # PENDING - try to confirm by matching details
                confirm_result = await asyncio.to_thread(
                    try_confirm_rivalry, submitter_id, opponent_id, name, wager
                )
                if confirm_result["matched"]:
                    await interaction.followup.send(
                        f"**Rivalry Confirmed!** (by Commissioner)\n\n"
                        f"**{rec.get('Rivalry Name')}**\n"
                        f"{submitter_name} vs {opponent_name}\n"
                        f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n\n"
                        f"Both teams' details matched. Rivalry is now active."
                    )
                elif confirm_result.get("already_submitted"):
                    await interaction.followup.send(
                        f"**{submitter_name}** already submitted this rivalry request.\n\n"
                        f"**{rec.get('Rivalry Name')}**\n"
                        f"Type: {rec.get('Type')} | Wager: ${rec.get('Wager')}\n\n"
                        f"Waiting for **{opponent_name}** to submit matching details to confirm."
                    )
                elif confirm_result.get("mismatch"):
                    existing = confirm_result["existing"]
                    await interaction.followup.send(
                        f"A pending rivalry exists but details don't match.\n\n"
                        f"Existing: **{existing.get('Rivalry Name')}** | Wager: ${existing.get('Wager')}\n"
                        f"Submitted: **{name}** | Wager: ${wager}\n\n"
                        f"Both teams must submit identical name and wager to confirm."
                    )
                return

        # Check submitter's rivalry count
        submitter_count = await asyncio.to_thread(get_team_rivalry_count, submitter_id)
        if submitter_count >= MAX_RIVALS_PER_TEAM:
            await interaction.followup.send(
                f"{submitter_name} already has {submitter_count} confirmed rivalries (max {MAX_RIVALS_PER_TEAM})."
            )
            return

        # Check opponent's rivalry count
        opponent_count = await asyncio.to_thread(get_team_rivalry_count, opponent_id)
        if opponent_count >= MAX_RIVALS_PER_TEAM:
            await interaction.followup.send(
                f"{opponent_name} already has {opponent_count} confirmed rivalries (max {MAX_RIVALS_PER_TEAM})."
            )
            return

        # Determine rivalry type (CONF or NC)
        rivalry_type = "CONF" if submitter_conf == opponent_conf else "NC"

        # No existing rivalry - create new pending submission
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_row = [
            submitter_id,       # Team A
            submitter_name,     # Team A Name
            opponent_id,        # Team B
            opponent_name,      # Team B Name
            name,               # Rivalry Name
            wager,              # Wager
            rivalry_type,       # Type (CONF or NC)
            "PENDING",          # Status
            now                 # Submitted
        ]

        status_msg = await interaction.followup.send(
            f"Submitting rivalry request **{name}** on behalf of {submitter_name}...", ephemeral=True
        )

        await asyncio.to_thread(rivalries_ws.append_row, new_row)

        # DM the opponent about the rivalry request
        dm_embed = discord.Embed(
            title="Rivalry Request Received!",
            description=(
                f"**{submitter_name}** wants to establish a rivalry with you.\n"
                f"*(Submitted by the Commissioner on their behalf)*"
            ),
            color=discord.Color.orange()
        )
        dm_embed.add_field(name="Rivalry Name", value=name, inline=True)
        dm_embed.add_field(name="Wager", value=f"${wager}", inline=True)
        dm_embed.add_field(name="Type", value=rivalry_type, inline=True)
        dm_embed.add_field(
            name="To Confirm",
            value=f"Submit matching details:\n`/rival submit opponent:@{submitter_name} name:{name} wager:{wager}`",
            inline=False
        )
        dm_embed.set_footer(text="Both teams must submit identical details to confirm.")

        dm_result = await notify_opponent_dm(opponent_id, "Rivalry Request", "", embed=dm_embed)

        dm_status = ""
        if dm_result["sent"]:
            dm_status = f"\n\n📬 **{opponent_name}** has been notified via DM."
        else:
            dm_status = f"\n\n⚠️ Could not DM {opponent_name} ({dm_result['error']}). Please notify them directly."

        await status_msg.edit(
            content=(
                f"**Rivalry Request Logged Successfully on behalf of {submitter_name}!**\n\n"
                f"**{name}**\n"
                f"{submitter_name} vs {opponent_name}\n"
                f"Type: {rivalry_type} | Wager: ${wager}\n"
                f"Submitted: {now}\n\n"
                f"Waiting for **{opponent_name}** to submit matching details:\n"
                f"`/rival submit opponent:@{submitter_name} name:{name} wager:{wager}`"
                f"{dm_status}"
            )
        )

    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(
            "An error occurred while submitting the rivalry. Please try again.",
            ephemeral=True
        )

# ----------------- Commish Pending Submissions Command -----------------

def has_commish_role(interaction: discord.Interaction) -> bool:
    """Check if user has the Commissioner role (from COMMISSIONER_ROLE_NAME in .env)."""
    if not interaction.guild:
        return False

    # In a guild context, interaction.user is already a discord.Member with roles
    # Using get_member() can fail if the member isn't in cache
    member = interaction.user

    # Verify this is a Member object with roles
    if not hasattr(member, 'roles'):
        return False

    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")

    # Check if user has the commissioner role (case-insensitive)
    for role in member.roles:
        if role.name.lower() == commissioner_role_name.lower():
            return True

    return False

@commish.command(name="pending", description="List all pending rivalry and NC game submissions")
async def pending_submissions(interaction: discord.Interaction):
    # Check for Commish role
    if not has_commish_role(interaction):
        await interaction.response.send_message(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    await interaction.response.defer()

    # Get pending rivalries
    rivalry_records = rivalries_ws.get_all_records(expected_headers=[])
    pending_rivalries = [r for r in rivalry_records if r.get("Status") == "PENDING"]

    # Get pending NC game submissions
    nc_records = manual_sub_ws.get_all_records(expected_headers=[])
    pending_nc = [r for r in nc_records if r.get("Status") == "PENDING"]

    # Build the response
    embed = discord.Embed(
        title="Pending Submissions",
        description="All pending rivalry and NC game requests awaiting confirmation.",
        color=discord.Color.gold()
    )

    # Pending Rivalries Section
    if pending_rivalries:
        rivalry_lines = []
        for r in pending_rivalries:
            team_a_name = r.get("Team A Name", r.get("Team A", "?"))
            team_b_name = r.get("Team B Name", r.get("Team B", "?"))
            name = r.get("Rivalry Name", "Unnamed")
            wager = r.get("Wager", 0)
            rtype = r.get("Type", "?")
            submitted = r.get("Submitted", "?")
            rivalry_lines.append(
                f"**{name}** ({rtype}, ${wager})\n"
                f"  {team_a_name} → {team_b_name}\n"
                f"  Submitted: {submitted}"
            )
        embed.add_field(
            name=f"Pending Rivalries ({len(pending_rivalries)})",
            value="\n\n".join(rivalry_lines[:10]) if rivalry_lines else "None",
            inline=False
        )
        if len(pending_rivalries) > 10:
            embed.add_field(
                name="",
                value=f"*...and {len(pending_rivalries) - 10} more*",
                inline=False
            )
    else:
        embed.add_field(name="Pending Rivalries", value="None", inline=False)

    # Pending NC Games Section
    if pending_nc:
        nc_lines = []
        # Group by match key to show which have one vs two submissions
        match_groups = {}
        for r in pending_nc:
            key = r.get("Match Key", "")
            if key not in match_groups:
                match_groups[key] = []
            match_groups[key].append(r)

        for key, submissions in match_groups.items():
            if len(submissions) == 1:
                s = submissions[0]
                nc_lines.append(
                    f"Week {s.get('Week', '?')}: {s.get('Team A', '?')} vs {s.get('Team B', '?')}\n"
                    f"  Awaiting: {s.get('Team B', '?')}"
                )
            # If 2 submissions exist but still pending, something's off

        embed.add_field(
            name=f"Pending NC Games ({len(match_groups)})",
            value="\n\n".join(nc_lines[:10]) if nc_lines else "None",
            inline=False
        )
        if len(match_groups) > 10:
            embed.add_field(
                name="",
                value=f"*...and {len(match_groups) - 10} more*",
                inline=False
            )
    else:
        embed.add_field(name="Pending NC Games", value="None", inline=False)

    embed.set_footer(text="Use /rival status or /schedule status for individual team details")

    # Post to scheduling channel
    channel = bot.get_channel(SCHEDULING_CHANNEL_ID)
    if channel:
        await channel.send(embed=embed)
        await interaction.followup.send(
            f"Pending submissions posted to <#{SCHEDULING_CHANNEL_ID}>",
            ephemeral=True
        )
    else:
        # Fallback: send in current channel
        await interaction.followup.send(embed=embed)

# ----------------- Submission Control Commands (Commish Only) -----------------

@commish.command(name="open", description="Open submissions for rivalries, NC games, or both")
@app_commands.describe(
    submission_type="What type of submissions to open"
)
@app_commands.choices(submission_type=[
    app_commands.Choice(name="Rivalries", value="rivalries"),
    app_commands.Choice(name="NC Games", value="nc_games"),
    app_commands.Choice(name="Both", value="all")
])
async def submissions_open(
    interaction: discord.Interaction,
    submission_type: app_commands.Choice[str]
):
    if not has_commish_role(interaction):
        await interaction.response.send_message(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    await interaction.response.defer()

    results = []
    if submission_type.value in ["rivalries", "all"]:
        if set_submission_status("RIVALRIES_OPEN", True):
            results.append("✅ **Rivalry submissions** are now **OPEN**")
        else:
            results.append("❌ Failed to open rivalry submissions")

    if submission_type.value in ["nc_games", "all"]:
        if set_submission_status("NC_GAMES_OPEN", True):
            results.append("✅ **NC game submissions** are now **OPEN**")
        else:
            results.append("❌ Failed to open NC game submissions")

    # Announce to scheduling channel
    channel = bot.get_channel(SCHEDULING_CHANNEL_ID)
    if channel:
        opened_rivalries = submission_type.value in ["rivalries", "all"]
        opened_nc = submission_type.value in ["nc_games", "all"]

        announce_embed = discord.Embed(
            title="📢 Submissions Now Open!",
            description="\n".join(results),
            color=discord.Color.green()
        )

        how_lines = [f"All submissions must be made **right here** in <#{SCHEDULING_CHANNEL_ID}>."]
        if opened_rivalries:
            how_lines.append("• `/rival submit` — submit a rivalry request")
        if opened_nc:
            how_lines.append(
                "• `/schedule submit week:<1-4> opponent:@owner` — submit an NC game request"
            )
        announce_embed.add_field(name="How to Submit", value="\n".join(how_lines), inline=False)

        if opened_nc:
            announce_embed.add_field(
                name="Confirming an NC Game",
                value=(
                    "An NC game is a two-way agreement: **both owners** must submit the same "
                    "matchup for the same week before it's locked in. When someone submits "
                    "against you, you'll get a DM — come back to this channel and run "
                    "`/schedule submit` with the matching week and opponent to confirm."
                ),
                inline=False
            )
            announce_embed.add_field(
                name="NC Game Rules",
                value=(
                    f"• Weeks **{NC_WEEK_MIN}–{NC_WEEK_MAX}** only\n"
                    f"• Opponent must be in a **different conference**\n"
                    f"• Max **{MAX_NC_GAMES_PER_TEAM}** NC games per team\n"
                    "• You can't play the **same opponent** more than once\n"
                    "• Only **one** NC game per team per week"
                ),
                inline=False
            )

        announce_embed.set_footer(text=f"Opened by {interaction.user.display_name}")
        await channel.send(embed=announce_embed)

    await interaction.followup.send("\n".join(results) + f"\n\nAnnouncement posted to <#{SCHEDULING_CHANNEL_ID}>")

@commish.command(name="close", description="Close submissions for rivalries, NC games, or both")
@app_commands.describe(
    submission_type="What type of submissions to close"
)
@app_commands.choices(submission_type=[
    app_commands.Choice(name="Rivalries", value="rivalries"),
    app_commands.Choice(name="NC Games", value="nc_games"),
    app_commands.Choice(name="Both", value="all")
])
async def submissions_close(
    interaction: discord.Interaction,
    submission_type: app_commands.Choice[str]
):
    if not has_commish_role(interaction):
        await interaction.response.send_message(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    await interaction.response.defer()

    results = []
    if submission_type.value in ["rivalries", "all"]:
        if set_submission_status("RIVALRIES_OPEN", False):
            results.append("🔒 **Rivalry submissions** are now **CLOSED**")
        else:
            results.append("❌ Failed to close rivalry submissions")

    if submission_type.value in ["nc_games", "all"]:
        if set_submission_status("NC_GAMES_OPEN", False):
            results.append("🔒 **NC game submissions** are now **CLOSED**")
        else:
            results.append("❌ Failed to close NC game submissions")

    # Announce to scheduling channel
    channel = bot.get_channel(SCHEDULING_CHANNEL_ID)
    if channel:
        announce_embed = discord.Embed(
            title="🔒 Submissions Now Closed",
            description="\n".join(results),
            color=discord.Color.red()
        )
        announce_embed.set_footer(text=f"Closed by {interaction.user.display_name}")
        await channel.send(embed=announce_embed)

    await interaction.followup.send("\n".join(results) + f"\n\nAnnouncement posted to <#{SCHEDULING_CHANNEL_ID}>")

@commish.command(name="submission_status", description="Check current submission open/close status")
async def submissions_status(interaction: discord.Interaction):
    if not has_commish_role(interaction):
        await interaction.response.send_message(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    rivalries_open = are_rivalries_open()
    nc_games_open = are_nc_games_open()

    embed = discord.Embed(
        title="Submission Status",
        color=discord.Color.blue()
    )
    embed.add_field(
        name="Rivalry Submissions",
        value="🟢 **OPEN**" if rivalries_open else "🔴 **CLOSED**",
        inline=True
    )
    embed.add_field(
        name="NC Game Submissions",
        value="🟢 **OPEN**" if nc_games_open else "🔴 **CLOSED**",
        inline=True
    )
    embed.add_field(
        name="Commands",
        value="`/commish open` - Open submissions\n`/commish close` - Close submissions",
        inline=False
    )

    await interaction.response.send_message(embed=embed, ephemeral=True)

# ----------------- Commish: Post Command Help Board -----------------

# Groups/commands hidden from the public help board (admin/internal)
HIDDEN_HELP_GROUPS = {"commish"}
HIDDEN_HELP_COMMANDS = {"list_commands", "toggle_autoposts", "post_teams"}

@commish.command(
    name="post_commands",
    description="Post a help board of all league slash commands to this channel")
async def post_commands(interaction: discord.Interaction):
    if not has_commish_role(interaction):
        await interaction.response.send_message(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    embed = discord.Embed(
        title="📋 League Bot Commands",
        description="Slash commands available to team owners.",
        color=discord.Color.blue()
    )

    general_lines = []
    for cmd in sorted(bot.tree.get_commands(), key=lambda c: c.name):
        if isinstance(cmd, app_commands.Group):
            if cmd.name in HIDDEN_HELP_GROUPS:
                continue
            lines = [
                f"`/{cmd.name} {sub.name}` — {sub.description}"
                for sub in sorted(cmd.commands, key=lambda c: c.name)
            ]
            if not lines:
                continue
            value = "\n".join(lines)
            if len(value) > 1024:  # Discord per-field limit
                value = value[:1010] + "\n…"
            embed.add_field(
                name=f"/{cmd.name} — {cmd.description}",
                value=value,
                inline=False
            )
        else:
            if cmd.name in HIDDEN_HELP_COMMANDS:
                continue
            general_lines.append(f"`/{cmd.name}` — {cmd.description}")

    if general_lines:
        embed.add_field(
            name="General Commands",
            value="\n".join(general_lines),
            inline=False
        )

    await interaction.response.send_message(embed=embed)  # public (not ephemeral)

# ----------------- Recruiting Dollars Commands -----------------

@recruiting.command(name="dollars", description="View your team's bonus recruiting dollars for next year")
async def recruiting_dollars(interaction: discord.Interaction):
    """Show the user their bonus recruiting dollars breakdown and conference comparison."""
    await interaction.response.defer(ephemeral=True)

    if recruiting_dollars_ws is None:
        await interaction.followup.send("RecruitingDollars sheet not found. Please wait for rankings to update.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner in the league.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    year = get_current_year()

    # Get all recruiting dollars data
    try:
        data = recruiting_dollars_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading recruiting dollars data: {e}")
        return

    if not data:
        await interaction.followup.send(f"No recruiting dollars data found. Please wait for rankings to update.")
        return

    # Filter to current year
    year_data = [r for r in data if str(r.get("Year")) == str(year)]

    if not year_data:
        await interaction.followup.send(f"No recruiting dollars data found for {year}. Please wait for rankings to update.")
        return

    # Find user's team data
    user_data = None
    for r in year_data:
        if str(r.get("FranchiseID", "")).zfill(3) == franchise_id:
            user_data = r
            break

    if not user_data:
        await interaction.followup.send(f"No data found for your team. Please wait for rankings to update.")
        return

    # Build detailed breakdown embed
    status = user_data.get("Status", "PROJECTED")
    status_text = "(Season In Progress)" if status == "PROJECTED" else f"(Final - {year} Season)"
    color = discord.Color.green() if status == "FINAL" else discord.Color.gold()

    embed = discord.Embed(
        title=f"Recruiting Bonus Dollars {status_text}",
        description=f"**{team['name']}** - {team['conference']} Conference",
        color=color
    )

    # Breakdown fields
    reg_wins = parse_dollar_value(user_data.get('RegularSeasonWins', 0))
    reg_dollars = parse_dollar_value(user_data.get('RegSeasonDollars', 0))
    embed.add_field(
        name="Regular Season Wins",
        value=f"{reg_wins} wins x $1 = **${reg_dollars}**",
        inline=True
    )

    post_wins = parse_dollar_value(user_data.get('PostseasonWins', 0))
    post_losses = parse_dollar_value(user_data.get('PostseasonLosses', 0))
    post_dollars = parse_dollar_value(user_data.get('PostseasonDollars', 0))
    embed.add_field(
        name="Postseason",
        value=f"{post_wins}W x $2 + {post_losses}L x $1 = **${post_dollars}**",
        inline=True
    )

    nc_count = parse_dollar_value(user_data.get('NationalPositionCount', user_data.get('NationalChampCount', 0)))
    nc_dollars = parse_dollar_value(user_data.get('NationalPositionDollars', user_data.get('NationalChampDollars', 0)))
    embed.add_field(
        name="National Position Awards",
        value=f"{nc_count} players x $5 = **${nc_dollars}**",
        inline=True
    )

    heisman_count = parse_dollar_value(user_data.get('HeismanCount', 0))
    heisman_dollars = parse_dollar_value(user_data.get('HeismanDollars', 0))
    embed.add_field(
        name="Heisman Award",
        value=f"{heisman_count} players x $5 = **${heisman_dollars}**",
        inline=True
    )

    coty_count = parse_dollar_value(user_data.get('CoachOfYearCount', 0))
    coty_dollars = parse_dollar_value(user_data.get('CoachOfYearDollars', 0))
    embed.add_field(
        name="Coach of the Year",
        value=f"{coty_count} x $5 = **${coty_dollars}**",
        inline=True
    )

    first_count = parse_dollar_value(user_data.get('FirstTeamCount', 0))
    first_dollars = parse_dollar_value(user_data.get('FirstTeamDollars', 0))
    embed.add_field(
        name="1st Team All-Conference",
        value=f"{first_count} players x $5 = **${first_dollars}**",
        inline=True
    )

    second_count = parse_dollar_value(user_data.get('SecondTeamCount', 0))
    second_dollars = parse_dollar_value(user_data.get('SecondTeamDollars', 0))
    embed.add_field(
        name="2nd Team All-Conference",
        value=f"{second_count} players x $4 = **${second_dollars}**",
        inline=True
    )

    third_count = parse_dollar_value(user_data.get('ThirdTeamCount', 0))
    third_dollars = parse_dollar_value(user_data.get('ThirdTeamDollars', 0))
    embed.add_field(
        name="3rd Team All-Conference",
        value=f"{third_count} players x $3 = **${third_dollars}**",
        inline=True
    )

    # Rivalry Wagers
    wager_won = parse_dollar_value(user_data.get('WagerWon', 0))
    wager_lost = parse_dollar_value(user_data.get('WagerLost', 0))
    wager_net = parse_dollar_value(user_data.get('WagerNet', 0))
    wager_sign = "+" if wager_net >= 0 else ""
    embed.add_field(
        name="Rivalry Wagers",
        value=f"Won: +${wager_won} | Lost: -${wager_lost}\nNet: **{wager_sign}${wager_net}**",
        inline=True
    )

    # Draft Bonus (graduating/declaring players)
    draft_count = parse_dollar_value(user_data.get('DraftBonusCount', 0))
    draft_dollars = parse_dollar_value(user_data.get('DraftBonusDollars', 0))
    if draft_count > 0 or draft_dollars > 0:
        embed.add_field(
            name="Draft Bonus",
            value=f"{draft_count} players drafted = **${draft_dollars}**",
            inline=True
        )
    else:
        # Only show if season is FINAL (draft bonuses calculated)
        if status == "FINAL":
            embed.add_field(
                name="Draft Bonus",
                value="No players drafted",
                inline=True
            )
        else:
            embed.add_field(
                name="Draft Bonus",
                value="*Calculated at season end*",
                inline=True
            )

    # Retention Cost (deducted for retained players)
    retention_count = parse_dollar_value(user_data.get('RetentionCount', 0))
    retention_cost = parse_dollar_value(user_data.get('RetentionCostDollars', 0))
    if retention_count > 0 or retention_cost > 0:
        embed.add_field(
            name="Retention Cost",
            value=f"{retention_count} retained = **-${retention_cost}**",
            inline=True
        )
    elif status == "FINAL":
        embed.add_field(
            name="Retention Cost",
            value="No retentions",
            inline=True
        )

    # Total
    total_dollars = parse_dollar_value(user_data.get('TotalBonusDollars', 0))
    total_sign = "+" if total_dollars >= 0 else ""
    embed.add_field(
        name="TOTAL BONUS DOLLARS",
        value=f"**{total_sign}${total_dollars}**",
        inline=False
    )

    # Conference comparison
    conf_data = [r for r in year_data if r.get("Conference") == team['conference']]
    conf_data.sort(key=lambda x: parse_dollar_value(x.get('TotalBonusDollars', 0)), reverse=True)

    conf_lines = []
    user_rank = 0
    for i, t in enumerate(conf_data, 1):
        fid = str(t.get("FranchiseID", "")).zfill(3)
        is_user = fid == franchise_id
        if is_user:
            user_rank = i
        marker = "**>>** " if is_user else ""
        end_marker = " **<<**" if is_user else ""
        team_name = t.get("TeamName", "Unknown")
        total = parse_dollar_value(t.get("TotalBonusDollars", 0))
        conf_lines.append(f"{marker}#{i}. {team_name}: **${total}**{end_marker}")

    # Show top 15 or all if conference is smaller
    display_lines = conf_lines[:15] if len(conf_lines) > 15 else conf_lines
    if len(conf_lines) > 15 and user_rank > 15:
        # Add user's position if not in top 15
        display_lines.append("...")
        display_lines.append(conf_lines[user_rank - 1])

    embed.add_field(
        name=f"{team['conference']} Conference Rankings (You: #{user_rank})",
        value="\n".join(display_lines),
        inline=False
    )

    # Footer with last calculated time
    last_calc = str(user_data.get('LastCalculated', 'Unknown'))[:16]
    embed.set_footer(text=f"Last calculated: {last_calc}")

    # Send as DM with fallback to ephemeral
    try:
        await interaction.user.send(embed=embed)
        await interaction.followup.send("Check your DMs for your recruiting dollars breakdown!")
    except discord.Forbidden:
        # User has DMs disabled, send ephemeral instead
        await interaction.followup.send(embed=embed)


@recruiting.command(name="draft", description="Post Theoretical NFL Draft results to conference channels (Commissioner only)")
async def recruiting_draft(interaction: discord.Interaction):
    """Post the Theoretical NFL Draft results to each conference's channel."""
    # Check for commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.response.send_message("❌ You must be a Commissioner to run this command.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    if theoretical_draft_ws is None:
        await interaction.followup.send("❌ TheoreticalDraft sheet not found. Run final rankings first (Week 18).")
        return

    # Get NFL Draft emoji
    nfl_draft_emoji = AWARD_EMOJIS.get("nfl_draft", "🏈")
    # Try to get application emoji if it exists
    for emoji in bot.emojis:
        if emoji.name.lower() == "nfldraft":
            nfl_draft_emoji = str(emoji)
            break

    year = get_current_year()

    # Read draft data
    try:
        draft_data = theoretical_draft_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"❌ Error reading draft data: {e}")
        return

    if not draft_data:
        await interaction.followup.send("❌ No draft data found. Run final rankings first.")
        return

    # Filter to current year and players with bonus value > 0
    year_data = [r for r in draft_data if str(r.get("Year")) == str(year) and parse_dollar_value(r.get("DollarValue")) > 0]

    if not year_data:
        await interaction.followup.send(f"❌ No draft-eligible players with bonus value found for {year}.")
        return

    # Load team names and emojis for display
    team_name_map = get_team_name_map()
    team_emoji_map = get_team_emoji_map()

    # Group by conference
    conf_players = {}
    for player in year_data:
        conf = player.get("Conference", "Unknown")
        if conf not in conf_players:
            conf_players[conf] = []
        conf_players[conf].append(player)

    # Sort each conference's players by bonus dollars (descending), then by position rank
    for conf in conf_players:
        conf_players[conf].sort(key=lambda p: (-parse_dollar_value(p.get("DollarValue")), int(p.get("PositionRank", 999) or 999)))

    # Get conference emojis
    conf_emojis = {
        "ACC": AWARD_EMOJIS.get("conf_ACC", "🔴"),
        "B10": AWARD_EMOJIS.get("conf_B10", "🔵"),
        "B12": AWARD_EMOJIS.get("conf_B12", "🟠"),
        "SEC": AWARD_EMOJIS.get("conf_SEC", "🟢"),
        "P12": AWARD_EMOJIS.get("conf_P12", "🟡"),
    }

    # Post to each conference channel
    posted_count = 0
    errors = []

    for conf, players in conf_players.items():
        # Get channel for this conference
        channel_id = CONF_CHANNEL_IDS.get(conf, 0)
        if channel_id == 0:
            channel_id = DRAFT_CHANNEL_ID  # Fallback

        if channel_id == 0:
            errors.append(f"{conf}: No channel configured")
            continue

        channel = bot.get_channel(channel_id)
        if not channel:
            errors.append(f"{conf}: Channel {channel_id} not found")
            continue

        # Build embed for this conference
        conf_emoji = conf_emojis.get(conf, "🏈")
        embed = discord.Embed(
            title=f"{nfl_draft_emoji} {conf_emoji} {conf} Conference - Theoretical NFL Draft {nfl_draft_emoji}",
            description=f"**{year} Draft Class**\nPlayers entering the draft and their bonus value based on NFL position rankings.",
            color=discord.Color.gold()
        )

        # Group players by tier for display
        tier_5 = [p for p in players if parse_dollar_value(p.get("DollarValue")) == 5]
        tier_4 = [p for p in players if parse_dollar_value(p.get("DollarValue")) == 4]
        tier_3 = [p for p in players if parse_dollar_value(p.get("DollarValue")) == 3]
        tier_2 = [p for p in players if parse_dollar_value(p.get("DollarValue")) == 2]
        tier_1 = [p for p in players if parse_dollar_value(p.get("DollarValue")) == 1]

        def format_player(p):
            name = p.get("PlayerName", "Unknown")
            pos = p.get("Position", "??")
            rank = p.get("PositionRank", "?")
            franchise_id = str(p.get("FranchiseID", "000")).zfill(3)
            # Look up team name and emoji from franchise lookup
            team_name = team_name_map.get(franchise_id, f"Team {franchise_id}")
            team_emoji = team_emoji_map.get(franchise_id, "")
            draft_reason = p.get("DraftReason", "")
            # Status indicators by draft reason
            if draft_reason == "COULD_DECLARE":
                status_indicator = " ⚠️"  # Needs decision - could declare early
            elif draft_reason == "EARLY_DECLARE":
                status_indicator = " ✅"  # Already declared
            elif draft_reason == "RELEASING":
                status_indicator = " 🚀"  # Pending release
            else:
                status_indicator = ""  # GRADUATING - no indicator needed
            # Include team emoji before team name
            team_display = f"{team_emoji} {team_name}" if team_emoji else team_name
            return f"**{name}** ({pos}) - #{rank} {pos}\n↳ {team_display}{status_indicator}"

        def add_tier_fields(embed, tier_name, players_list):
            """Add tier field(s), splitting if content exceeds 1024 chars."""
            if not players_list:
                return
            formatted = [format_player(p) for p in players_list]
            current_chunk = []
            current_len = 0
            chunk_num = 0
            for player_text in formatted:
                # +1 for the newline separator
                if current_len + len(player_text) + 1 > 1000:  # Leave buffer under 1024
                    if current_chunk:
                        field_name = tier_name if chunk_num == 0 else f"{tier_name} (cont.)"
                        embed.add_field(name=field_name, value="\n".join(current_chunk), inline=False)
                        chunk_num += 1
                    current_chunk = [player_text]
                    current_len = len(player_text)
                else:
                    current_chunk.append(player_text)
                    current_len += len(player_text) + 1
            if current_chunk:
                field_name = tier_name if chunk_num == 0 else f"{tier_name} (cont.)"
                embed.add_field(name=field_name, value="\n".join(current_chunk), inline=False)

        add_tier_fields(embed, "💎 1st Round Pick ($5)", tier_5)
        add_tier_fields(embed, "🥇 2nd Round Pick ($4)", tier_4)
        add_tier_fields(embed, "🥈 3rd Round Pick ($3)", tier_3)
        add_tier_fields(embed, "🥉 4th Round Pick ($2)", tier_2)
        add_tier_fields(embed, "📋 5th Round Pick ($1)", tier_1)

        # Conference totals
        total_players = len(players)
        total_dollars = sum(parse_dollar_value(p.get("DollarValue")) for p in players)
        could_declare = len([p for p in players if p.get("DraftReason") == "COULD_DECLARE"])
        early_declares = len([p for p in players if p.get("DraftReason") == "EARLY_DECLARE"])
        releasing = len([p for p in players if p.get("DraftReason") == "RELEASING"])

        # Build status legend based on what's present
        status_lines = []
        if could_declare > 0:
            status_lines.append(f"⚠️ Eligible to Declare ({could_declare})")
        if early_declares > 0:
            status_lines.append(f"✅ Already Declared ({early_declares})")
        if releasing > 0:
            status_lines.append(f"🚀 Pending Release ({releasing})")

        status_text = " | ".join(status_lines) if status_lines else "All graduating seniors"

        embed.add_field(
            name="📊 Conference Summary",
            value=f"**{total_players}** players drafted | **${total_dollars}** total bonus\n{status_text}",
            inline=False
        )

        embed.set_footer(text=f"Theoretical NFL Draft - Based on MFL position rankings through Week 12")

        try:
            await channel.send(embed=embed)
            posted_count += 1
        except Exception as e:
            errors.append(f"{conf}: Failed to post - {str(e)}")

    # Report results
    result_msg = f"✅ Posted draft results to **{posted_count}** conference channels."
    if errors:
        result_msg += f"\n\n⚠️ Errors:\n" + "\n".join(errors)

    await interaction.followup.send(result_msg)


@recruiting.command(name="transfers", description="View transfer portal for your conference")
@app_commands.describe(
    position="Filter by position (optional)",
    year="Transfer year (default: current league year)"
)
@app_commands.choices(position=[
    app_commands.Choice(name="QB", value="QB"),
    app_commands.Choice(name="RB", value="RB"),
    app_commands.Choice(name="WR", value="WR"),
    app_commands.Choice(name="TE", value="TE"),
])
async def recruiting_transfers(
    interaction: discord.Interaction,
    position: str = None,
    year: int = None
):
    await interaction.response.defer(ephemeral=True)

    # Check required sheets
    if transaction_log_ws is None:
        await interaction.followup.send("TransactionLog sheet not found.")
        return

    # Get user's team and conference
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner in the league.")
        return

    user_conference = team['conference']
    year = year or get_current_year()
    prior_year = year - 1

    # Read TransactionLog and filter to transfer-eligible players in user's conference
    try:
        txn_data = await asyncio.to_thread(transaction_log_ws.get_all_records, expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading TransactionLog: {e}")
        return

    transfers = [
        r for r in txn_data
        if str(r.get("TransferEligible", "")).strip().upper() == "YES"
        and str(r.get("Conference", "")) == user_conference
        and int(r.get("Year", 0)) == year
    ]

    if not transfers:
        await interaction.followup.send(f"No transfer-eligible players in **{user_conference}** for {year}.")
        return

    # Build player position map from RookieLedger
    position_map = {}
    if rookie_ledger_ws is not None:
        try:
            rl_data = await asyncio.to_thread(rookie_ledger_ws.get_all_records, expected_headers=[])
            for row in rl_data:
                pid = str(row.get("MFL_Player_ID", ""))
                pos = row.get("Position", "")
                if pid and pos:
                    position_map[pid] = pos
        except Exception:
            pass  # Position data is nice-to-have, not critical

    # Apply position filter if specified
    if position:
        transfers = [
            t for t in transfers
            if position_map.get(str(t.get("PlayerID", "")), "") == position
        ]
        if not transfers:
            await interaction.followup.send(f"No transfer-eligible **{position}** players in **{user_conference}** for {year}.")
            return

    # Build prior year points map from WeeklyResults
    points_map = {}
    if weekly_results_ws is not None:
        try:
            wr_data = await asyncio.to_thread(weekly_results_ws.get_all_records, expected_headers=[])
            for row in wr_data:
                if int(row.get("Year", 0)) == prior_year:
                    pid = str(row.get("PlayerID", ""))
                    pts = float(row.get("PlayerScore", 0) or 0)
                    if pid:
                        points_map[pid] = points_map.get(pid, 0) + pts
        except Exception:
            pass  # Points data is nice-to-have for sorting

    # Build eligibility map from PlayerCopies
    elig_map = {}
    if player_copies_ws is not None:
        try:
            pc_data = await asyncio.to_thread(player_copies_ws.get_all_records, expected_headers=[])
            for row in pc_data:
                copy_id = str(row.get("PlayerCopyID", ""))
                if copy_id:
                    years_used = int(row.get("EligibilityYearsUsed", 0) or 0)
                    trad_rs = str(row.get("TraditionalRedshirtUsed", "")).upper() in ("TRUE", "YES", "1")
                    med_rs = str(row.get("MedicalRedshirtUsed", "")).upper() in ("TRUE", "YES", "1")
                    elig_map[copy_id] = {
                        "years_used": years_used,
                        "trad_rs": trad_rs,
                        "med_rs": med_rs
                    }
        except Exception:
            pass

    # Load team emoji map
    emoji_map = get_team_emoji_map()

    # Enrich and sort transfers
    enriched = []
    for t in transfers:
        pid = str(t.get("PlayerID", ""))
        copy_id = str(t.get("CopyAssigned", ""))
        prior_pts = points_map.get(pid, 0)
        pos = position_map.get(pid, "?")
        elig = elig_map.get(copy_id, {})
        years_remaining = 4 - elig.get("years_used", 0)

        rs_parts = []
        if elig.get("trad_rs"):
            rs_parts.append("Trad")
        if elig.get("med_rs"):
            rs_parts.append("Med")
        rs_display = ", ".join(rs_parts) if rs_parts else "None"

        enriched.append({
            "player_name": t.get("PlayerName", "Unknown"),
            "position": pos,
            "prior_pts": round(prior_pts, 1),
            "dropped_by": t.get("FranchiseName", "Unknown"),
            "dropped_by_id": str(t.get("FranchiseID", "")).zfill(3),
            "years_remaining": max(years_remaining, 0),
            "rs_display": rs_display
        })

    # Sort by prior year points descending
    enriched.sort(key=lambda x: x["prior_pts"], reverse=True)
    display = enriched[:25]

    # Build embed
    pos_label = f" ({position})" if position else ""
    embed = discord.Embed(
        title=f"Transfer Portal - {user_conference}{pos_label} ({year})",
        description=f"Sorted by {prior_year} season points | Showing top {len(display)} of {len(enriched)}",
        color=discord.Color.blue()
    )

    lines = []
    for i, p in enumerate(display, 1):
        drop_emoji = emoji_map.get(p["dropped_by_id"], "")
        if drop_emoji:
            drop_emoji = f"{drop_emoji} "
        lines.append(
            f"**{i}.** **{p['player_name']}** ({p['position']}) — {p['prior_pts']} pts\n"
            f"   Dropped by: {drop_emoji}{p['dropped_by']} | "
            f"Elig: {p['years_remaining']}yr left | RS: {p['rs_display']}"
        )

    embed.description += "\n\n" + "\n\n".join(lines)

    await interaction.followup.send(embed=embed)


# ----------------- Awards Helper Functions -----------------

# Custom Award Emojis - will be populated after bot is ready
# For application emojis (uploaded to the bot), we need to fetch them at runtime
AWARD_EMOJIS = {
    "heisman": os.getenv("EMOJI_HEISMAN", "🏆"),
    "national_qb": os.getenv("EMOJI_NATIONAL_QB", "🎯"),
    "national_rb": os.getenv("EMOJI_NATIONAL_RB", "🏃"),
    "national_wr_te": os.getenv("EMOJI_NATIONAL_WR_TE", "🙌"),
    "all_conference": os.getenv("EMOJI_ALL_CONFERENCE", "⭐"),
    "first_team": os.getenv("EMOJI_FIRST_TEAM", "🥇"),
    "second_team": os.getenv("EMOJI_SECOND_TEAM", "🥈"),
    "third_team": os.getenv("EMOJI_THIRD_TEAM", "🥉"),
    "coach_of_year": os.getenv("EMOJI_COACH_OF_YEAR", "📋"),
    "nfl_draft": os.getenv("EMOJI_NFL_DRAFT", "🏈"),
    # Conference emojis
    "conf_ACC": os.getenv("EMOJI_CONF_ACC", "🔴"),
    "conf_B10": os.getenv("EMOJI_CONF_B10", "🔵"),
    "conf_B12": os.getenv("EMOJI_CONF_B12", "🟠"),
    "conf_SEC": os.getenv("EMOJI_CONF_SEC", "🟡"),
    "conf_P12": os.getenv("EMOJI_CONF_P12", "🟣"),
    "conf_AAC": os.getenv("EMOJI_CONF_AAC", "⚪"),
    # College Gameday emoji
    "gameday": os.getenv("EMOJI_GAMEDAY", "🏈"),
}

# Ranking display - using text instead of emojis for simplicity
# No application emojis needed

# Debug: Print loaded emojis on startup
print("Loaded Award Emojis from .env:")
for key, value in AWARD_EMOJIS.items():
    print(f"  {key}: {repr(value)}")

async def load_application_emojis():
    """
    Load application emojis (emojis uploaded to the bot itself).
    This replaces .env emoji IDs with actual emoji objects that work in messages.
    Also creates a lookup by emoji name for easy access.
    """
    global AWARD_EMOJIS

    try:
        # Fetch all application emojis
        app_emojis = await bot.fetch_application_emojis()
        print(f"Found {len(app_emojis)} application emojis:")

        # Create lookups by emoji ID and name
        emoji_by_id = {}
        emoji_by_name = {}
        for emoji in app_emojis:
            print(f"  - {emoji.name}: {emoji.id}")
            emoji_by_id[str(emoji.id)] = emoji
            emoji_by_name[emoji.name.upper()] = emoji

        # Update AWARD_EMOJIS with actual emoji objects
        for key, value in list(AWARD_EMOJIS.items()):
            if isinstance(value, str) and value.startswith("<:"):
                # Extract emoji ID from format <:name:id>
                try:
                    emoji_id = value.split(":")[-1].rstrip(">")
                    if emoji_id in emoji_by_id:
                        AWARD_EMOJIS[key] = str(emoji_by_id[emoji_id])
                        print(f"  Mapped {key} -> {AWARD_EMOJIS[key]}")
                except Exception as e:
                    print(f"  Failed to parse emoji for {key}: {e}")

        # Also map conference emojis by name if they exist in the bot
        # This allows setting EMOJI_CONF_ACC=ACC in .env to auto-match
        conf_mappings = {
            "conf_ACC": "ACC",
            "conf_B10": "B10",
            "conf_B12": "B12",
            "conf_SEC": "SEC",
            "conf_P12": "P12",
            "conf_AAC": "AAC",
        }
        for key, emoji_name in conf_mappings.items():
            # Check if we already have a custom emoji set, otherwise look up by name
            current = AWARD_EMOJIS.get(key, "")
            if not current.startswith("<:"):
                # Try to find by name in application emojis
                if emoji_name.upper() in emoji_by_name:
                    AWARD_EMOJIS[key] = str(emoji_by_name[emoji_name.upper()])
                    print(f"  Auto-mapped {key} by name -> {AWARD_EMOJIS[key]}")

        # Auto-map gameday emoji by name
        if "GAMEDAY" in emoji_by_name:
            AWARD_EMOJIS["gameday"] = str(emoji_by_name["GAMEDAY"])
            print(f"  Auto-mapped gameday by name -> {AWARD_EMOJIS['gameday']}")

        print("\nFinal Award Emojis:")
        for key, value in AWARD_EMOJIS.items():
            print(f"  {key}: {value}")

    except Exception as e:
        print(f"Error loading application emojis: {e}")
        print("Falling back to .env values")

def get_team_emoji_map():
    """
    Get franchise ID to emoji mapping from FranchiseLookup sheet.
    Expects an 'Emoji' column with Discord emoji format.
    Returns dict: franchiseId -> emoji string
    """
    try:
        data = teams_ws.get_all_records(expected_headers=[])
        emoji_map = {}
        for row in data:
            franchise_id = str(row.get("Franchise ID", "")).strip()
            # Normalize to 3-digit padded string
            if franchise_id:
                franchise_id = str(int(franchise_id)).zfill(3)
            emoji = str(row.get("Emoji", "")).strip()
            if franchise_id and emoji:
                emoji_map[franchise_id] = emoji
        return emoji_map
    except Exception as e:
        print(f"Error loading team emojis: {e}")
        return {}

def get_team_name_map():
    """
    Get franchise ID to team name mapping from FranchiseLookup sheet.
    Returns dict: franchiseId -> team name
    """
    try:
        data = teams_ws.get_all_records(expected_headers=[])
        name_map = {}
        for row in data:
            franchise_id = str(row.get("Franchise ID", "")).strip()
            if franchise_id:
                franchise_id = str(int(franchise_id)).zfill(3)
            team_name = str(row.get("Team Name", "")).strip()
            if franchise_id and team_name:
                name_map[franchise_id] = team_name
        return name_map
    except Exception as e:
        print(f"Error loading team names: {e}")
        return {}

def get_awards_data(year: int = None):
    """Get awards data from the Awards sheet"""
    if awards_ws is None:
        return None

    data = awards_ws.get_all_records(expected_headers=[])
    if not data:
        return []

    # Filter by year if specified
    if year:
        data = [r for r in data if int(r.get("Year", 0)) == year]

    return data

def get_current_year():
    """Get current year from ScheduleResults sheet, fallback to calendar year"""
    if schedule_results_ws is not None:
        try:
            # Get all years from the Year column and find the max
            year_col = schedule_results_ws.col_values(1)  # Year is first column
            years = [int(y) for y in year_col[1:] if y and str(y).isdigit()]  # Skip header
            if years:
                return max(years)
        except Exception as e:
            print(f"Error getting year from ScheduleResults: {e}")

    # Fallback to calendar year
    return datetime.now().year

def get_current_week():
    """Get approximate current NFL week based on date"""
    now = datetime.now()
    year = now.year

    # NFL season typically starts first Thursday after Labor Day
    # Approximate: September 5
    season_start = datetime(year, 9, 5)

    if now < season_start:
        return 1  # Preseason

    weeks_since_start = (now - season_start).days // 7
    return min(max(1, weeks_since_start + 1), 18)  # Week 18 = Final Rankings

def format_player_with_team(player: dict, emoji_map: dict, name_map: dict) -> str:
    """Format player name with team emoji if available"""
    franchise_id = str(player.get("FranchiseID", "")).strip()
    if franchise_id:
        franchise_id = str(int(franchise_id)).zfill(3) if franchise_id.isdigit() else franchise_id

    team_emoji = emoji_map.get(franchise_id, "")
    team_name = name_map.get(franchise_id, "")

    if team_emoji:
        return f"{team_emoji} "
    return ""

# ----------------- Awards Commands -----------------
@awards.command(name="heisman", description="Show Heisman Trophy race")
@app_commands.describe(year="Season year (default: current)")
async def awards_heisman(interaction: discord.Interaction, year: int = None):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = year or get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Filter to Heisman entries
    heisman = [r for r in data if r.get("AwardType") == "Heisman"]
    heisman.sort(key=lambda x: int(x.get("Rank", 999)))

    if not heisman:
        await interaction.followup.send(f"No Heisman data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Build embed
    embed = discord.Embed(
        title=f"{AWARD_EMOJIS['heisman']} Heisman Trophy Race - {year}",
        color=discord.Color.gold()
    )

    lines = []
    for i, player in enumerate(heisman[:10]):
        medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
        name = player.get("PlayerName", "Unknown")
        pos = player.get("Position", "")
        score = player.get("AwardScore", 0)
        points = player.get("StarterPoints", 0)
        team_emoji = format_player_with_team(player, emoji_map, name_map)
        team_name = name_map.get(str(player.get("FranchiseID", "")).zfill(3), "")
        team_display = f" | {team_emoji}{team_name}" if team_name else ""
        lines.append(f"{medal} **{name}** ({pos}){team_display}\n   Score: {score:.2f} | Starter Pts: {points}")

    embed.description = "\n\n".join(lines)
    embed.set_footer(text=f"Last calculated: {heisman[0].get('LastCalculated', 'Unknown')[:10] if heisman else ''}")

    await interaction.followup.send(embed=embed)

@awards.command(name="national", description="Show National Award leaders")
@app_commands.describe(
    position="Position group (QB, RB, or WR/TE)",
    year="Season year (default: current)"
)
@app_commands.choices(position=[
    app_commands.Choice(name="QB", value="QB"),
    app_commands.Choice(name="RB", value="RB"),
    app_commands.Choice(name="WR/TE", value="WR/TE"),
])
async def awards_national(
    interaction: discord.Interaction,
    position: str = None,
    year: int = None
):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = year or get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Filter to National entries
    national = [r for r in data if r.get("AwardType", "").startswith("National_")]

    if position:
        national = [r for r in national if r.get("AwardType") == f"National_{position}"]

    if not national:
        await interaction.followup.send(f"No national award data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Get position-specific emoji
    def get_national_emoji(pos):
        pos_key = pos.lower().replace("/", "_")
        return AWARD_EMOJIS.get(f"national_{pos_key}", AWARD_EMOJIS["all_conference"])

    # Build embed
    title = f"National Awards - {year}"
    if position:
        title = f"{get_national_emoji(position)} National {position} Award - {year}"

    embed = discord.Embed(
        title=title,
        color=discord.Color.green()
    )

    # Group by position
    by_position = defaultdict(list)
    for r in national:
        pos = r.get("AwardType", "").replace("National_", "")
        by_position[pos].append(r)

    for pos, players in by_position.items():
        players.sort(key=lambda x: int(x.get("Rank", 999)))
        pos_emoji = get_national_emoji(pos)
        lines = []
        for i, p in enumerate(players[:5]):
            team_emoji = format_player_with_team(p, emoji_map, name_map)
            medal = AWARD_EMOJIS['first_team'] + " " if i == 0 else ""
            lines.append(f"{medal}{team_emoji}{p.get('PlayerName', '?')} - {p.get('AwardScore', 0):.2f}")
        embed.add_field(name=f"{pos_emoji} {pos}", value="\n".join(lines), inline=True)

    await interaction.followup.send(embed=embed)

@awards.command(name="allconference", description="Show All-Conference teams")
@app_commands.describe(
    conference="Conference",
    team="Team (1st, 2nd, 3rd)",
    year="Season year (default: current)"
)
@app_commands.choices(conference=[
    app_commands.Choice(name="ACC", value="ACC"),
    app_commands.Choice(name="Big Ten", value="B10"),
    app_commands.Choice(name="Big 12", value="B12"),
    app_commands.Choice(name="SEC", value="SEC"),
    app_commands.Choice(name="Pac-12", value="P12"),
    app_commands.Choice(name="AAC", value="AAC"),
])
@app_commands.choices(team=[
    app_commands.Choice(name="1st Team", value="1st"),
    app_commands.Choice(name="2nd Team", value="2nd"),
    app_commands.Choice(name="3rd Team", value="3rd"),
])
async def awards_allconference(
    interaction: discord.Interaction,
    conference: str,
    team: str = "1st",
    year: int = None
):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = year or get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Filter to All-Conference entries for this conference and team
    award_type = f"AllConf_{conference}_{team}"
    allconf = [r for r in data if r.get("AwardType") == award_type]

    if not allconf:
        await interaction.followup.send(f"No All-{conference} {team} team data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Get team-specific emoji (1st, 2nd, 3rd)
    team_rank_emoji = {"1st": AWARD_EMOJIS["first_team"], "2nd": AWARD_EMOJIS["second_team"], "3rd": AWARD_EMOJIS["third_team"]}.get(team, AWARD_EMOJIS["all_conference"])

    # Get conference emoji
    conf_emoji = AWARD_EMOJIS.get(f"conf_{conference}", "")

    # Build embed
    conf_names = {"B10": "Big Ten", "B12": "Big 12", "P12": "Pac-12"}
    conf_display = conf_names.get(conference, conference)

    embed = discord.Embed(
        title=f"{conf_emoji} {team_rank_emoji} All-{conf_display} {team} Team - {year}",
        color=discord.Color.blue()
    )

    # Group by position
    by_position = defaultdict(list)
    for r in allconf:
        pos = r.get("Position", "Unknown")
        by_position[pos].append(r)

    for pos in ["QB", "RB", "WR", "TE"]:
        if pos in by_position:
            players = by_position[pos]
            players.sort(key=lambda x: int(x.get("Rank", 999)))
            lines = []
            for p in players:
                team_icon = format_player_with_team(p, emoji_map, name_map)
                lines.append(f"{team_icon}{p.get('PlayerName', '?')}\n{p.get('AwardScore', 0):.2f} pts")
            embed.add_field(name=pos, value="\n".join(lines), inline=True)

    await interaction.followup.send(embed=embed)

@awards.command(name="leaders", description="Show all award leaders summary")
@app_commands.describe(year="Season year (default: current)")
async def awards_leaders(interaction: discord.Interaction, year: int = None):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = year or get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Get rank 1 for each award type
    leaders = [r for r in data if int(r.get("Rank", 999)) == 1]

    embed = discord.Embed(
        title=f"{AWARD_EMOJIS['heisman']} Award Leaders - {year}",
        color=discord.Color.purple()
    )

    # Heisman
    heisman = next((r for r in leaders if r.get("AwardType") == "Heisman"), None)
    if heisman:
        team_emoji = format_player_with_team(heisman, emoji_map, name_map)
        embed.add_field(
            name=f"{AWARD_EMOJIS['heisman']} Heisman Trophy",
            value=f"{team_emoji}**{heisman.get('PlayerName')}** ({heisman.get('Position')})\nScore: {heisman.get('AwardScore', 0):.2f}",
            inline=False
        )

    # National Awards
    national = [r for r in leaders if r.get("AwardType", "").startswith("National_")]
    if national:
        nat_lines = []
        for r in national:
            pos = r.get("AwardType", "").replace("National_", "")
            pos_key = pos.lower().replace("/", "_")
            pos_emoji = AWARD_EMOJIS.get(f"national_{pos_key}", "")
            team_emoji = format_player_with_team(r, emoji_map, name_map)
            nat_lines.append(f"{pos_emoji} **{pos}:** {team_emoji}{r.get('PlayerName')}")
        embed.add_field(name=f"{AWARD_EMOJIS['all_conference']} National Awards", value="\n".join(nat_lines), inline=False)

    # Coach of the Year
    coty = next((r for r in leaders if r.get("AwardType") == "CoachOfYear"), None)
    if coty:
        franchise_id = str(coty.get("FranchiseID", "")).zfill(3)
        team_emoji_str = emoji_map.get(franchise_id, "")
        if team_emoji_str:
            team_emoji_str = f"{team_emoji_str} "
        embed.add_field(
            name=f"{AWARD_EMOJIS['coach_of_year']} Coach of the Year",
            value=f"{team_emoji_str}**{coty.get('PlayerName')}** ({coty.get('Conference', '')})\nScore: {coty.get('AwardScore', 0):.2f}",
            inline=False
        )

    await interaction.followup.send(embed=embed)

@awards.command(name="coachofyear", description="Show Coach of the Year race")
@app_commands.describe(year="Season year (default: current)")
async def awards_coachofyear(interaction: discord.Interaction, year: int = None):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = year or get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Filter to CoachOfYear entries
    coty = [r for r in data if r.get("AwardType") == "CoachOfYear"]
    coty.sort(key=lambda x: int(x.get("Rank", 999)))

    if not coty:
        await interaction.followup.send(f"No Coach of the Year data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Build embed
    embed = discord.Embed(
        title=f"{AWARD_EMOJIS['coach_of_year']} Coach of the Year Race - {year}",
        color=discord.Color.dark_green()
    )

    lines = []
    for i, entry in enumerate(coty[:10]):
        medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
        team_name = entry.get("PlayerName", "Unknown")
        conf = entry.get("Conference", "")
        score = entry.get("AwardScore", 0)
        wins = entry.get("TeamWins", 0)
        pf = entry.get("StarterPoints", 0)
        franchise_id = str(entry.get("FranchiseID", "")).zfill(3)
        team_emoji_str = emoji_map.get(franchise_id, "")
        if team_emoji_str:
            team_emoji_str = f"{team_emoji_str} "
        lines.append(f"{medal} {team_emoji_str}**{team_name}** ({conf})\n   Score: {score:.2f} | Wins: {wins} | PF: {pf}")

    embed.description = "\n\n".join(lines)
    embed.set_footer(text=f"Formula: (Wins+1) x PF x (PF/PP) | Last calculated: {coty[0].get('LastCalculated', 'Unknown')[:10] if coty else ''}")

    await interaction.followup.send(embed=embed)

# ----------------- Retention Commands -----------------

# PlayerCopies column indices (must match Declarations.gs PC_COLS)
PC_COLS = {
    'copyId': 0,
    'playerId': 1,
    'playerName': 2,
    'conference': 3,
    'currentFranchiseId': 4,
    'eligibilityYearsUsed': 5,
    'traditionalRedshirtUsed': 6,
    'medicalRedshirtUsed': 7,
    'createdSeason': 8,
    'active': 9,
    'lastUpdated': 10,
    'traditionalRedshirtYear': 11,
    'medicalRedshirtYear': 12,
    'nationalAwards': 13,
    'allConferenceAwards': 14,
    'awardHistory': 15,
    'declaredEarly': 16,
    'declarationYear': 17,
    'retentionDecision': 18,
    'retentionDecisionDate': 19,
    'retentionPath': 20,
    'retentionCount': 21
}

# Retention cost configuration (must match Config.gs)
RETENTION_COSTS = {
    'national': {'firstRetention': 20, 'subsequentRetention': 30},
    'allConference': {'firstRetention': 10, 'subsequentRetention': 20}
}

def determine_retention_path(national_awards: int, allconf_awards: int) -> str:
    """Determine which path (NATIONAL or ALL_CONFERENCE) triggered eligibility"""
    if national_awards >= 1:
        return "NATIONAL"
    elif allconf_awards >= 2:
        return "ALL_CONFERENCE"
    return None

def calculate_retention_cost(retention_path: str, retention_count: int) -> int:
    """Calculate retention cost based on path and how many times player has been retained"""
    if retention_path == "NATIONAL":
        return RETENTION_COSTS['national']['subsequentRetention'] if retention_count > 0 else RETENTION_COSTS['national']['firstRetention']
    elif retention_path == "ALL_CONFERENCE":
        return RETENTION_COSTS['allConference']['subsequentRetention'] if retention_count > 0 else RETENTION_COSTS['allConference']['firstRetention']
    return 0

def get_retention_cost_label(retention_path: str, retention_count: int) -> str:
    """Get human-readable cost label"""
    cost = calculate_retention_cost(retention_path, retention_count)
    if retention_path == "NATIONAL":
        return f"${cost} (National)" if retention_count == 0 else f"${cost} (National - subsequent)"
    elif retention_path == "ALL_CONFERENCE":
        return f"${cost} (All-Conf)" if retention_count == 0 else f"${cost} (All-Conf - subsequent)"
    return "$0"

def get_eligible_players_for_retention(conference: str = None, franchise_id: str = None):
    """
    Get all players eligible for early declaration (COULD_DECLARE).
    Eligible = 3+ total program years (playing + redshirt) AND (1+ national awards OR 2+ all-conf awards)

    Total program years includes redshirt years because eligibility for early declaration
    is based on time in the program, not just playing years.
    """
    if player_copies_ws is None:
        return []

    data = player_copies_ws.get_all_values()
    if len(data) <= 1:
        return []

    # Load decisions from RetentionHistory for current year
    history_decisions = get_retention_decisions_from_history()

    eligible = []
    for idx, row in enumerate(data[1:], start=2):  # Start at row 2 (1-indexed)
        # Skip if not enough columns
        if len(row) <= PC_COLS['nationalAwards']:
            continue

        active = str(row[PC_COLS['active']]).upper() == 'TRUE'
        declared_early = str(row[PC_COLS['declaredEarly']]).upper() == 'TRUE'
        years_used = int(row[PC_COLS['eligibilityYearsUsed']] or 0)
        trad_redshirt = str(row[PC_COLS['traditionalRedshirtUsed']]).upper() == 'TRUE'
        med_redshirt = str(row[PC_COLS['medicalRedshirtUsed']]).upper() == 'TRUE'
        program_years = years_used + (1 if trad_redshirt else 0) + (1 if med_redshirt else 0)
        national_awards = int(row[PC_COLS['nationalAwards']] or 0)
        allconf_awards = int(row[PC_COLS['allConferenceAwards']] or 0)

        # Must be active and not already declared
        if not active or declared_early:
            continue

        # Must have 3+ total program years (playing years + redshirt years)
        if program_years < 3:
            continue

        # Must have 1+ national OR 2+ all-conf
        if national_awards < 1 and allconf_awards < 2:
            continue

        # Look up decision and prior retain count from RetentionHistory
        copy_id = row[PC_COLS['copyId']]
        hist_entry = history_decisions.get(copy_id, {})
        retention_decision = hist_entry.get('decision', '')
        prior_retain_count = hist_entry.get('prior_retain_count', 0)
        retention_history = hist_entry.get('history', [])

        # Skip if previously retained and no new awards earned since last retention
        # Retention only re-triggers when a player wins additional awards
        if prior_retain_count > 0 and not retention_decision:
            last_retention = None
            for r in reversed(retention_history):
                if r.get('decision') in ('RETAIN', 'AUTO_RETAIN'):
                    last_retention = r
                    break
            if last_retention:
                last_national = last_retention.get('national_awards', 0)
                last_allconf = last_retention.get('allconf_awards', 0)
                if national_awards <= last_national and allconf_awards <= last_allconf:
                    continue

        # Derive retention count from history (prior retentions before this year)
        retention_path = determine_retention_path(national_awards, allconf_awards)
        retention_cost = calculate_retention_cost(retention_path, prior_retain_count)
        retention_cost_label = get_retention_cost_label(retention_path, prior_retain_count)

        player = {
            'row_num': idx,
            'copy_id': copy_id,
            'player_name': row[PC_COLS['playerName']],
            'conference': row[PC_COLS['conference']],
            'franchise_id': row[PC_COLS['currentFranchiseId']],
            'years_used': years_used,
            'program_years': program_years,
            'national_awards': national_awards,
            'allconf_awards': allconf_awards,
            'retention_decision': retention_decision,
            'retention_path': retention_path,
            'retention_count': prior_retain_count,
            'retention_cost': retention_cost,
            'retention_cost_label': retention_cost_label,
            'retention_history': retention_history
        }

        # Apply filters
        if conference and player['conference'] != conference:
            continue
        if franchise_id:
            # Normalize franchise ID
            player_fid = str(int(player['franchise_id'])).zfill(3) if player['franchise_id'] else ''
            target_fid = str(int(franchise_id)).zfill(3) if franchise_id else ''
            if player_fid != target_fid:
                continue

        eligible.append(player)

    return eligible

def get_all_retention_history():
    """
    Load ALL retention history records from RetentionHistory sheet.
    Returns list of dicts, one per row.
    """
    if retention_history_ws is None:
        return []

    try:
        data = retention_history_ws.get_all_records(expected_headers=[])
        return data if data else []
    except Exception as e:
        print(f"Warning: Failed to read RetentionHistory: {e}")
        return []

def get_retention_decisions_from_history(year=None):
    """
    Load retention decisions from RetentionHistory sheet for a given year.
    Also computes cumulative prior_retain_count from all previous years.
    Returns dict: copy_id -> { decision, retention_path, retention_cost, prior_retain_count, history, timestamp }
    """
    all_records = get_all_retention_history()
    if not all_records:
        return {}

    if year is None:
        year = get_current_year()

    # Build full history per copy_id and count prior retentions
    history_by_copy = defaultdict(list)  # copy_id -> [{ year, decision, cost, path, timestamp }, ...]
    for row in all_records:
        copy_id = row.get('CopyId', '')
        if not copy_id:
            continue
        history_by_copy[copy_id].append({
            'year': str(row.get('Year', '')),
            'decision': row.get('Decision', ''),
            'retention_path': row.get('RetentionPath', ''),
            'retention_cost': int(row.get('RetentionCost', 0) or 0),
            'national_awards': int(row.get('NationalAwards', 0) or 0),
            'allconf_awards': int(row.get('AllConfAwards', 0) or 0),
            'timestamp': row.get('Timestamp', '')
        })

    decisions = {}
    for copy_id, records in history_by_copy.items():
        # Sort by year
        records.sort(key=lambda r: r['year'])

        # Find current year's decision
        current_entry = None
        for r in records:
            if r['year'] == str(year):
                current_entry = r
                break

        # Count prior retentions (RETAIN or AUTO_RETAIN in years before this one)
        prior_retain_count = sum(
            1 for r in records
            if r['year'] < str(year) and r['decision'] in ('RETAIN', 'AUTO_RETAIN')
        )

        if current_entry:
            decisions[copy_id] = {
                'decision': current_entry['decision'],
                'retention_path': current_entry['retention_path'],
                'retention_cost': current_entry['retention_cost'],
                'prior_retain_count': prior_retain_count,
                'timestamp': current_entry['timestamp'],
                'history': records
            }
        elif prior_retain_count > 0:
            # No decision this year but has prior history — include for count/history
            decisions[copy_id] = {
                'decision': '',
                'retention_path': '',
                'retention_cost': 0,
                'prior_retain_count': prior_retain_count,
                'timestamp': '',
                'history': records
            }

    return decisions

def record_retention_decision_in_sheet(copy_id: str, decision: str):
    """Record a retention decision in the RetentionHistory sheet"""
    if retention_history_ws is None:
        raise Exception("RetentionHistory sheet not found")
    if player_copies_ws is None:
        raise Exception("PlayerCopies sheet not found")

    data = player_copies_ws.get_all_values()

    # Load full history to derive prior retain count
    history_decisions = get_retention_decisions_from_history()

    for idx, row in enumerate(data[1:], start=2):
        if row[PC_COLS['copyId']] == copy_id:
            year = get_current_year()
            timestamp = datetime.now().isoformat()
            national_awards = int(row[PC_COLS['nationalAwards']] or 0)
            allconf_awards = int(row[PC_COLS['allConferenceAwards']] or 0)
            retention_path = determine_retention_path(national_awards, allconf_awards)

            # Derive prior retain count from history
            hist_entry = history_decisions.get(copy_id, {})
            prior_retain_count = hist_entry.get('prior_retain_count', 0)
            cost = calculate_retention_cost(retention_path, prior_retain_count) if decision == 'RETAIN' else 0

            franchise_id = str(row[PC_COLS['currentFranchiseId']] or '').strip()
            if franchise_id:
                try:
                    franchise_id = str(int(franchise_id)).zfill(3)
                except ValueError:
                    pass
            team_name_map = get_team_name_map()
            team_name = team_name_map.get(franchise_id, '')

            # Check if a decision already exists for this copy/year and update it
            hist_data = retention_history_ws.get_all_values()
            existing_row = None
            for hist_idx, hist_row in enumerate(hist_data[1:], start=2):
                if str(hist_row[0]) == str(year) and hist_row[1] == copy_id:
                    existing_row = hist_idx
                    break

            new_row = [
                year,
                copy_id,
                row[PC_COLS['playerId']],
                row[PC_COLS['playerName']],
                row[PC_COLS['conference']],
                franchise_id,
                team_name,
                decision,
                retention_path or '',
                cost,
                prior_retain_count + 1 if decision == 'RETAIN' else 0,
                national_awards,
                allconf_awards,
                timestamp
            ]

            if existing_row:
                # Update existing row (coach changed their mind)
                retention_history_ws.update(f'A{existing_row}:N{existing_row}', [new_row])
            else:
                retention_history_ws.append_row(new_row)

            return {
                'success': True,
                'player_name': row[PC_COLS['playerName']],
                'copy_id': copy_id,
                'decision': decision,
                'retention_cost': cost,
                'retention_cost_label': get_retention_cost_label(retention_path, prior_retain_count) if decision == 'RETAIN' else '$0'
            }

    raise Exception(f"Player copy {copy_id} not found")

@commish.command(name="eligible", description="View players eligible for early declaration")
@app_commands.describe(conference="Filter by conference (optional)")
@app_commands.choices(conference=[
    app_commands.Choice(name="ACC", value="ACC"),
    app_commands.Choice(name="Big Ten", value="B10"),
    app_commands.Choice(name="Big 12", value="B12"),
    app_commands.Choice(name="SEC", value="SEC"),
    app_commands.Choice(name="Pac-12", value="P12"),
    app_commands.Choice(name="AAC", value="AAC"),
])
async def retention_eligible(interaction: discord.Interaction, conference: str = None):
    await interaction.response.defer()

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    eligible = get_eligible_players_for_retention(conference=conference)

    if not eligible:
        conf_msg = f" in {conference}" if conference else ""
        await interaction.followup.send(f"No players{conf_msg} are currently eligible for early declaration.")
        return

    # Load team emoji map
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Group by conference
    by_conf = defaultdict(list)
    for p in eligible:
        by_conf[p['conference']].append(p)

    embed = discord.Embed(
        title="Players Eligible for Early Declaration",
        description="Players with 3+ program years (playing + redshirt) AND (1+ National Award OR 2+ All-Conference selections)",
        color=discord.Color.orange()
    )

    for conf in sorted(by_conf.keys()):
        players = by_conf[conf]
        conf_emoji = AWARD_EMOJIS.get(f"conf_{conf}", "")
        lines = []
        for p in sorted(players, key=lambda x: x['player_name']):
            fid = str(int(p['franchise_id'])).zfill(3) if p['franchise_id'] else ''
            team_emoji = emoji_map.get(fid, '')
            decision = p['retention_decision'] or 'PENDING'
            awards_info = []
            if p['national_awards']:
                awards_info.append(f"N{p['national_awards']}")
            if p['allconf_awards']:
                awards_info.append(f"A{p['allconf_awards']}")
            awards_str = f" ({', '.join(awards_info)})" if awards_info else ""
            decision_icon = "" if decision == 'PENDING' else (" RETAIN" if decision == 'RETAIN' else " RELEASE")
            lines.append(f"{team_emoji} **{p['player_name']}**{awards_str}{decision_icon}")

        if lines:
            embed.add_field(name=f"{conf_emoji} {conf}", value="\n".join(lines[:10]), inline=True)

    embed.set_footer(text="Use /retention retain or /retention release to record decisions")
    await interaction.followup.send(embed=embed)

@commish.command(name="retention_decide", description="Record a retention decision on behalf of a team owner")
@app_commands.describe(
    team_owner="@ mention the team owner you are deciding for",
    player_name="Player name (or copy ID)",
    decision="Retain or release the player"
)
@app_commands.choices(decision=[
    app_commands.Choice(name="Retain", value="RETAIN"),
    app_commands.Choice(name="Release", value="RELEASE"),
])
async def commish_retention_decide(
    interaction: discord.Interaction,
    team_owner: discord.Member,
    player_name: str,
    decision: app_commands.Choice[str]
):
    await interaction.response.defer(ephemeral=True)

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    # Look up the team owner's team
    team = await asyncio.to_thread(get_team_by_discord_id, team_owner.id)
    if not team:
        await interaction.followup.send(f"{team_owner.mention} is not registered as a team owner.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    eligible = get_eligible_players_for_retention(franchise_id=franchise_id)

    if not eligible:
        await interaction.followup.send(f"No players on **{team['name']}** are eligible for early declaration.")
        return

    # Find matching player
    search = player_name.lower().strip()
    matches = [p for p in eligible if search in p['player_name'].lower() or search == p['copy_id'].lower()]

    if len(matches) == 0:
        names = [p['player_name'] for p in eligible]
        await interaction.followup.send(f"Player not found. Eligible players on **{team['name']}**: {', '.join(names)}")
        return

    if len(matches) > 1:
        names = [p['player_name'] for p in matches]
        await interaction.followup.send(f"Multiple matches found: {', '.join(names)}. Please be more specific.")
        return

    player = matches[0]

    try:
        result = record_retention_decision_in_sheet(player['copy_id'], decision.value)
        if decision.value == 'RETAIN':
            await interaction.followup.send(
                f"✅ **RETAINED** {result['player_name']} (on behalf of **{team['name']}**)\n"
                f"Copy ID: `{result['copy_id']}`\n\n"
                f"💰 **Retention Cost: {player['retention_cost_label']}**\n"
                f"This cost will be deducted from their recruiting budget.\n\n"
                f"Decided by: {interaction.user.mention} (Commissioner)"
            )
        else:
            await interaction.followup.send(
                f"📤 **RELEASED** {result['player_name']} (on behalf of **{team['name']}**)\n"
                f"Copy ID: `{result['copy_id']}`\n\n"
                f"💰 **No retention cost** - player is being released.\n\n"
                f"Decided by: {interaction.user.mention} (Commissioner)"
            )
    except Exception as e:
        await interaction.followup.send(f"Error recording decision: {str(e)}")

@commish.command(name="budget", description="Look up any team's recruiting bonus dollars")
@app_commands.describe(
    team_owner="@ mention the team owner to look up"
)
async def commish_budget(
    interaction: discord.Interaction,
    team_owner: discord.Member
):
    await interaction.response.defer(ephemeral=True)

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if recruiting_dollars_ws is None:
        await interaction.followup.send("RecruitingDollars sheet not found. Please wait for rankings to update.")
        return

    # Look up team owner's team
    team = await asyncio.to_thread(get_team_by_discord_id, team_owner.id)
    if not team:
        await interaction.followup.send(f"{team_owner.mention} is not registered as a team owner.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    year = get_current_year()

    # Get all recruiting dollars data
    try:
        data = recruiting_dollars_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading recruiting dollars data: {e}")
        return

    if not data:
        await interaction.followup.send(f"No recruiting dollars data found.")
        return

    # Filter to current year
    year_data = [r for r in data if str(r.get("Year")) == str(year)]

    if not year_data:
        await interaction.followup.send(f"No recruiting dollars data found for {year}.")
        return

    # Find team data
    user_data = None
    for r in year_data:
        if str(r.get("FranchiseID", "")).zfill(3) == franchise_id:
            user_data = r
            break

    if not user_data:
        await interaction.followup.send(f"No data found for **{team['name']}**.")
        return

    # Build detailed breakdown embed
    status = user_data.get("Status", "PROJECTED")
    status_text = "(Season In Progress)" if status == "PROJECTED" else f"(Final - {year} Season)"
    color = discord.Color.green() if status == "FINAL" else discord.Color.gold()

    embed = discord.Embed(
        title=f"Recruiting Bonus Dollars {status_text}",
        description=f"**{team['name']}** - {team['conference']} Conference",
        color=color
    )

    # Breakdown fields
    reg_wins = parse_dollar_value(user_data.get('RegularSeasonWins', 0))
    reg_dollars = parse_dollar_value(user_data.get('RegSeasonDollars', 0))
    embed.add_field(name="Regular Season Wins", value=f"{reg_wins} wins x $1 = **${reg_dollars}**", inline=True)

    post_wins = parse_dollar_value(user_data.get('PostseasonWins', 0))
    post_losses = parse_dollar_value(user_data.get('PostseasonLosses', 0))
    post_dollars = parse_dollar_value(user_data.get('PostseasonDollars', 0))
    embed.add_field(name="Postseason", value=f"{post_wins}W x $2 + {post_losses}L x $1 = **${post_dollars}**", inline=True)

    nc_count = parse_dollar_value(user_data.get('NationalPositionCount', user_data.get('NationalChampCount', 0)))
    nc_dollars = parse_dollar_value(user_data.get('NationalPositionDollars', user_data.get('NationalChampDollars', 0)))
    embed.add_field(name="National Position Awards", value=f"{nc_count} players x $5 = **${nc_dollars}**", inline=True)

    heisman_count = parse_dollar_value(user_data.get('HeismanCount', 0))
    heisman_dollars = parse_dollar_value(user_data.get('HeismanDollars', 0))
    embed.add_field(name="Heisman Award", value=f"{heisman_count} players x $5 = **${heisman_dollars}**", inline=True)

    coty_count = parse_dollar_value(user_data.get('CoachOfYearCount', 0))
    coty_dollars = parse_dollar_value(user_data.get('CoachOfYearDollars', 0))
    embed.add_field(name="Coach of the Year", value=f"{coty_count} x $5 = **${coty_dollars}**", inline=True)

    first_count = parse_dollar_value(user_data.get('FirstTeamCount', 0))
    first_dollars = parse_dollar_value(user_data.get('FirstTeamDollars', 0))
    embed.add_field(name="1st Team All-Conference", value=f"{first_count} players x $5 = **${first_dollars}**", inline=True)

    second_count = parse_dollar_value(user_data.get('SecondTeamCount', 0))
    second_dollars = parse_dollar_value(user_data.get('SecondTeamDollars', 0))
    embed.add_field(name="2nd Team All-Conference", value=f"{second_count} players x $4 = **${second_dollars}**", inline=True)

    third_count = parse_dollar_value(user_data.get('ThirdTeamCount', 0))
    third_dollars = parse_dollar_value(user_data.get('ThirdTeamDollars', 0))
    embed.add_field(name="3rd Team All-Conference", value=f"{third_count} players x $3 = **${third_dollars}**", inline=True)

    # Rivalry Wagers
    wager_won = parse_dollar_value(user_data.get('WagerWon', 0))
    wager_lost = parse_dollar_value(user_data.get('WagerLost', 0))
    wager_net = parse_dollar_value(user_data.get('WagerNet', 0))
    wager_sign = "+" if wager_net >= 0 else ""
    embed.add_field(name="Rivalry Wagers", value=f"Won: +${wager_won} | Lost: -${wager_lost}\nNet: **{wager_sign}${wager_net}**", inline=True)

    # Draft Bonus
    draft_count = parse_dollar_value(user_data.get('DraftBonusCount', 0))
    draft_dollars = parse_dollar_value(user_data.get('DraftBonusDollars', 0))
    if draft_count > 0 or draft_dollars > 0:
        embed.add_field(name="Draft Bonus", value=f"{draft_count} players drafted = **${draft_dollars}**", inline=True)
    elif status == "FINAL":
        embed.add_field(name="Draft Bonus", value="No players drafted", inline=True)
    else:
        embed.add_field(name="Draft Bonus", value="*Calculated at season end*", inline=True)

    # Retention Cost
    retention_count = parse_dollar_value(user_data.get('RetentionCount', 0))
    retention_cost = parse_dollar_value(user_data.get('RetentionCostDollars', 0))
    if retention_count > 0 or retention_cost > 0:
        embed.add_field(name="Retention Cost", value=f"{retention_count} retained = **-${retention_cost}**", inline=True)
    elif status == "FINAL":
        embed.add_field(name="Retention Cost", value="No retentions", inline=True)

    # Total
    total_dollars = parse_dollar_value(user_data.get('TotalBonusDollars', 0))
    total_sign = "+" if total_dollars >= 0 else ""
    embed.add_field(name="TOTAL BONUS DOLLARS", value=f"**{total_sign}${total_dollars}**", inline=False)

    # Conference comparison
    conf_data = [r for r in year_data if r.get("Conference") == team['conference']]
    conf_data.sort(key=lambda x: parse_dollar_value(x.get('TotalBonusDollars', 0)), reverse=True)

    conf_lines = []
    team_rank = 0
    for i, t in enumerate(conf_data, 1):
        fid = str(t.get("FranchiseID", "")).zfill(3)
        is_target = fid == franchise_id
        if is_target:
            team_rank = i
        marker = "**>>** " if is_target else ""
        end_marker = " **<<**" if is_target else ""
        t_name = t.get("TeamName", "Unknown")
        total = parse_dollar_value(t.get("TotalBonusDollars", 0))
        conf_lines.append(f"{marker}#{i}. {t_name}: **${total}**{end_marker}")

    display_lines = conf_lines[:15] if len(conf_lines) > 15 else conf_lines
    if len(conf_lines) > 15 and team_rank > 15:
        display_lines.append("...")
        display_lines.append(conf_lines[team_rank - 1])

    embed.add_field(
        name=f"{team['conference']} Conference Rankings ({team['name']}: #{team_rank})",
        value="\n".join(display_lines),
        inline=False
    )

    # Footer
    last_calc = str(user_data.get('LastCalculated', 'Unknown'))[:16]
    embed.set_footer(text=f"Last calculated: {last_calc} | Looked up by {interaction.user.display_name}")

    await interaction.followup.send(embed=embed)

@commish.command(name="conf_budget", description="Post a conference's recruiting budgets to its channel")
@app_commands.describe(conference="Conference to post budgets for")
@app_commands.choices(conference=[
    app_commands.Choice(name="ACC", value="ACC"),
    app_commands.Choice(name="Big Ten", value="B10"),
    app_commands.Choice(name="Big 12", value="B12"),
    app_commands.Choice(name="SEC", value="SEC"),
    app_commands.Choice(name="Pac-12", value="P12"),
    app_commands.Choice(name="AAC", value="AAC"),
])
async def commish_conf_budget(interaction: discord.Interaction, conference: str):
    await interaction.response.defer(ephemeral=True)

    if not has_commish_role(interaction):
        await interaction.followup.send("You must have the **Commish** role to use this command.", ephemeral=True)
        return

    if recruiting_dollars_ws is None:
        await interaction.followup.send("RecruitingDollars sheet not found.")
        return

    # Look up conference channel
    channel_id = CONF_CHANNEL_IDS.get(conference, 0)
    if channel_id == 0:
        await interaction.followup.send(f"No channel configured for {conference}. Set {conference}_CHANNEL_ID in environment.")
        return

    channel = bot.get_channel(channel_id)
    if channel is None:
        await interaction.followup.send(f"Could not find channel for {conference} (ID: {channel_id}).")
        return

    year = get_current_year()

    try:
        data = recruiting_dollars_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading recruiting dollars data: {e}")
        return

    # Filter to current year and selected conference
    conf_data = [r for r in data if str(r.get("Year")) == str(year) and r.get("Conference") == conference]

    if not conf_data:
        await interaction.followup.send(f"No recruiting dollars data found for {conference} in {year}.")
        return

    # Sort by total dollars descending
    conf_data.sort(key=lambda x: parse_dollar_value(x.get('TotalBonusDollars', 0)), reverse=True)

    emoji_map = get_team_emoji_map()

    # Determine status from first row
    status = conf_data[0].get("Status", "PROJECTED")
    status_text = "(Season In Progress)" if status == "PROJECTED" else f"(Final - {year} Season)"
    color = discord.Color.green() if status == "FINAL" else discord.Color.gold()

    embed = discord.Embed(
        title=f"Recruiting Bonus Dollars - {conference} {status_text}",
        color=color
    )

    lines = []
    for i, team in enumerate(conf_data, 1):
        fid = str(team.get("FranchiseID", "")).zfill(3)
        team_emoji = emoji_map.get(fid, "")
        if team_emoji:
            team_emoji = f"{team_emoji} "
        team_name = team.get("TeamName", "Unknown")
        total = parse_dollar_value(team.get('TotalBonusDollars', 0))

        # Compact breakdown
        reg = parse_dollar_value(team.get('RegSeasonDollars', 0))
        post = parse_dollar_value(team.get('PostseasonDollars', 0))

        # Sum all award dollars
        award_dollars = (
            parse_dollar_value(team.get('NationalPositionDollars', team.get('NationalChampDollars', 0)))
            + parse_dollar_value(team.get('HeismanDollars', 0))
            + parse_dollar_value(team.get('CoachOfYearDollars', 0))
            + parse_dollar_value(team.get('FirstTeamDollars', 0))
            + parse_dollar_value(team.get('SecondTeamDollars', 0))
            + parse_dollar_value(team.get('ThirdTeamDollars', 0))
        )

        wager_net = parse_dollar_value(team.get('WagerNet', 0))
        wager_str = f"+${wager_net}" if wager_net >= 0 else f"-${abs(wager_net)}"

        draft = parse_dollar_value(team.get('DraftBonusDollars', 0))
        retention = parse_dollar_value(team.get('RetentionCostDollars', 0))

        total_sign = "+" if total >= 0 else ""
        line = f"**{i}.** {team_emoji}**{team_name}** — **{total_sign}${total}**"
        breakdown = f"   Wins: ${reg} | Post: ${post} | Awards: ${award_dollars} | Wagers: {wager_str}"
        if draft > 0:
            breakdown += f" | Draft: ${draft}"
        if retention > 0:
            breakdown += f" | Retained: -${retention}"
        lines.append(f"{line}\n{breakdown}")

    embed.description = "\n".join(lines)

    last_calc = str(conf_data[0].get('LastCalculated', 'Unknown'))[:16]
    embed.set_footer(text=f"Last calculated: {last_calc}")

    await channel.send(embed=embed)
    await interaction.followup.send(f"Recruiting budgets for **{conference}** posted to {channel.mention}.")

@retention.command(name="my_team", description="View eligible players on your team")
async def retention_my_team(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    eligible = get_eligible_players_for_retention(franchise_id=franchise_id)

    if not eligible:
        await interaction.followup.send(f"No players on **{team['name']}** are eligible for early declaration.")
        return

    embed = discord.Embed(
        title=f"Eligible Players - {team['name']}",
        description="Players eligible for early declaration (3+ years, has awards)",
        color=discord.Color.blue()
    )

    total_cost = 0
    for p in sorted(eligible, key=lambda x: x['player_name']):
        decision = p['retention_decision'] or 'PENDING'
        awards_info = []
        if p['national_awards']:
            awards_info.append(f"{p['national_awards']} National")
        if p['allconf_awards']:
            awards_info.append(f"{p['allconf_awards']} All-Conf")
        awards_str = " | ".join(awards_info)
        status = "" if decision == 'PENDING' else f" [{decision}]"

        # Build player info lines
        player_lines = [f"Awards: {awards_str}{status}"]
        player_lines.append(f"Cost: **{p['retention_cost_label']}**")

        # Add retention history timeline
        history = p.get('retention_history', [])
        if history:
            timeline_parts = []
            for h in history:
                h_decision = h.get('decision', '')
                h_year = h.get('year', '')
                h_cost = h.get('retention_cost', 0)
                if h_decision == 'RETAIN':
                    timeline_parts.append(f"{h_year}: RETAIN (${h_cost})")
                elif h_decision == 'AUTO_RETAIN':
                    timeline_parts.append(f"{h_year}: AUTO-RETAIN (${h_cost})")
                elif h_decision == 'RELEASE':
                    timeline_parts.append(f"{h_year}: RELEASE")
            if timeline_parts:
                player_lines.append("History: " + " → ".join(timeline_parts))
        elif p['retention_count'] > 0:
            player_lines.append(f"Prior retentions: {p['retention_count']}")

        field_value = "\n".join(player_lines) + f"\n`{p['copy_id']}`"
        if len(field_value) > 1024:
            field_value = field_value[:1021] + "..."

        embed.add_field(name=p['player_name'], value=field_value, inline=False)

        if decision != 'RELEASE':
            total_cost += p['retention_cost']

    embed.add_field(
        name="💰 Total Retention Cost",
        value=f"**${total_cost}** from recruiting budget if all players are retained",
        inline=False
    )
    embed.set_footer(text="Use /retention retain <player_name> or /retention release <player_name>")

    # Split into multiple messages if too many fields (Discord limit: 25)
    if len(embed.fields) > 25:
        # Send first embed with first 24 players + total
        embeds = []
        fields = list(embed.fields)
        total_field = fields[-1]  # Total cost field is last
        player_fields = fields[:-1]

        for i in range(0, len(player_fields), 24):
            chunk = player_fields[i:i+24]
            chunk_embed = discord.Embed(
                title=f"Eligible Players - {team['name']}" if i == 0 else f"Eligible Players (cont.)",
                color=discord.Color.blue()
            )
            if i == 0:
                chunk_embed.description = "Players eligible for early declaration (3+ years, has awards)"
            for f in chunk:
                chunk_embed.add_field(name=f.name, value=f.value, inline=f.inline)
            embeds.append(chunk_embed)

        # Add total to last embed
        embeds[-1].add_field(name=total_field.name, value=total_field.value, inline=total_field.inline)
        embeds[-1].set_footer(text="Use /retention retain <player_name> or /retention release <player_name>")

        for e in embeds:
            await interaction.followup.send(embed=e, ephemeral=True)
    else:
        await interaction.followup.send(embed=embed, ephemeral=True)

# Cache for retention autocomplete (avoids 3+ API calls per keystroke)
_retention_autocomplete_cache = {}  # franchise_id -> { 'data': [...], 'expires': timestamp }
_RETENTION_CACHE_TTL = 60  # seconds

async def retention_player_autocomplete(interaction: discord.Interaction, current: str):
    """Shared autocomplete for /retention retain and /retention release - shows eligible players on user's team."""
    if player_copies_ws is None:
        return []

    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        return []

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''

    # Use cached eligible list if fresh (avoids timeout on repeated keystrokes)
    import time
    now = time.time()
    cached = _retention_autocomplete_cache.get(franchise_id)
    if cached and cached['expires'] > now:
        eligible = cached['data']
    else:
        eligible = get_eligible_players_for_retention(franchise_id=franchise_id)
        _retention_autocomplete_cache[franchise_id] = {'data': eligible, 'expires': now + _RETENTION_CACHE_TTL}

    if not eligible:
        return []

    term = current.lower().strip()
    matches = []
    for p in eligible:
        # Build display: "Player Name (2 All-Conf) [PENDING]"
        awards_parts = []
        if p['national_awards']:
            awards_parts.append(f"{p['national_awards']} Natl")
        if p['allconf_awards']:
            awards_parts.append(f"{p['allconf_awards']} All-Conf")
        awards_str = ", ".join(awards_parts)
        decision = p['retention_decision'] or 'PENDING'
        display = f"{p['player_name']} ({awards_str}) [{decision}]"

        if not term or term in p['player_name'].lower() or term in p['copy_id'].lower():
            matches.append(
                app_commands.Choice(
                    name=display[:100],
                    value=p['copy_id']
                )
            )

        if len(matches) >= 25:
            break

    return matches

def find_retention_player(eligible, player_name):
    """Find a player from eligible list by copy_id (from autocomplete) or name (manual input)."""
    # First try exact copy_id match (from autocomplete selection)
    for p in eligible:
        if p['copy_id'] == player_name:
            return p, None

    # Fall back to name search (manual text input)
    search = player_name.lower().strip()
    matches = [p for p in eligible if search in p['player_name'].lower() or search == p['copy_id'].lower()]

    if len(matches) == 0:
        names = [p['player_name'] for p in eligible]
        return None, f"Player not found. Eligible players on your team: {', '.join(names)}"

    if len(matches) > 1:
        names = [p['player_name'] for p in matches]
        return None, f"Multiple matches found: {', '.join(names)}. Please be more specific."

    return matches[0], None

@retention.command(name="retain", description="Record a RETAIN decision for a player")
@app_commands.describe(player_name="Player name (or copy ID)")
async def retention_retain(interaction: discord.Interaction, player_name: str):
    await interaction.response.defer(ephemeral=True)

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    eligible = get_eligible_players_for_retention(franchise_id=franchise_id)

    if not eligible:
        await interaction.followup.send(f"No players on **{team['name']}** are eligible for early declaration.")
        return

    player, error = find_retention_player(eligible, player_name)
    if error:
        await interaction.followup.send(error)
        return

    try:
        result = record_retention_decision_in_sheet(player['copy_id'], 'RETAIN')
        _retention_autocomplete_cache.pop(franchise_id, None)  # Invalidate cache
        await interaction.followup.send(
            f"✅ **RETAINED** {result['player_name']}\n"
            f"Copy ID: `{result['copy_id']}`\n\n"
            f"💰 **Retention Cost: {player['retention_cost_label']}**\n"
            f"This cost will be deducted from your recruiting budget.\n\n"
            f"This player will continue playing next season."
        )
    except Exception as e:
        await interaction.followup.send(f"Error recording decision: {str(e)}")

@retention_retain.autocomplete('player_name')
async def retention_retain_autocomplete(interaction: discord.Interaction, current: str):
    return await retention_player_autocomplete(interaction, current)

@retention.command(name="release", description="Record a RELEASE decision for a player (early declaration)")
@app_commands.describe(player_name="Player name (or copy ID)")
async def retention_release(interaction: discord.Interaction, player_name: str):
    await interaction.response.defer(ephemeral=True)

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner.")
        return

    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    eligible = get_eligible_players_for_retention(franchise_id=franchise_id)

    if not eligible:
        await interaction.followup.send(f"No players on **{team['name']}** are eligible for early declaration.")
        return

    player, error = find_retention_player(eligible, player_name)
    if error:
        await interaction.followup.send(error)
        return

    try:
        result = record_retention_decision_in_sheet(player['copy_id'], 'RELEASE')
        _retention_autocomplete_cache.pop(franchise_id, None)  # Invalidate cache
        await interaction.followup.send(
            f"📤 **RELEASED** {result['player_name']} (Early Declaration)\n"
            f"Copy ID: `{result['copy_id']}`\n\n"
            f"💰 **No retention cost** - player is being released.\n\n"
            f"This player will declare early and become inactive at season end."
        )
    except Exception as e:
        await interaction.followup.send(f"Error recording decision: {str(e)}")

@retention_release.autocomplete('player_name')
async def retention_release_autocomplete(interaction: discord.Interaction, current: str):
    return await retention_player_autocomplete(interaction, current)

@retention.command(name="pending", description="View all players with pending retention decisions (Commissioner only)")
async def retention_pending(interaction: discord.Interaction):
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.response.send_message("You must be a Commissioner to run this.", ephemeral=True)
        return

    await interaction.response.defer()

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    eligible = get_eligible_players_for_retention()
    pending = [p for p in eligible if not p['retention_decision'] or p['retention_decision'] == '']

    if not pending:
        await interaction.followup.send("All eligible players have retention decisions recorded.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Group by team
    by_team = defaultdict(list)
    for p in pending:
        fid = str(int(p['franchise_id'])).zfill(3) if p['franchise_id'] else 'FA'
        by_team[fid].append(p)

    # Build embeds, splitting across multiple if needed (Discord limit: 6000 chars / 25 fields per embed)
    embeds = []
    current_embed = discord.Embed(
        title="Pending Retention Decisions",
        description=f"{len(pending)} players awaiting decisions",
        color=discord.Color.red()
    )
    field_count = 0

    for fid in sorted(by_team.keys()):
        players = by_team[fid]
        team_name = name_map.get(fid, 'Free Agent')
        team_emoji = emoji_map.get(fid, '')
        lines = [f"**{p['player_name']}** ({p['conference']})" for p in players]
        value = "\n".join(lines)
        if len(value) > 1024:
            value = value[:1021] + "..."

        # Start a new embed if we'd exceed 25 fields
        if field_count >= 25:
            embeds.append(current_embed)
            current_embed = discord.Embed(
                title="Pending Retention Decisions (cont.)",
                color=discord.Color.red()
            )
            field_count = 0

        current_embed.add_field(name=f"{team_emoji} {team_name}", value=value, inline=True)
        field_count += 1

    current_embed.set_footer(text="Players with no decision will be auto-retained at season end")
    embeds.append(current_embed)

    for embed in embeds:
        await interaction.followup.send(embed=embed)

def get_franchise_owner_discord_ids():
    """
    Get a mapping of franchise ID -> owner Discord ID from FranchiseLookup sheet.
    Returns dict: franchiseId (3-digit padded) -> discord_id (string)
    """
    try:
        data = teams_ws.get_all_records(expected_headers=[])
        owner_map = {}
        for row in data:
            franchise_id = str(row.get("Franchise ID", "")).strip()
            if franchise_id:
                franchise_id = str(int(franchise_id)).zfill(3)
            discord_id = normalize_discord_id(row.get("Owner Discord ID", ""))
            if franchise_id and discord_id:
                owner_map[franchise_id] = discord_id
        return owner_map
    except Exception as e:
        print(f"Error loading franchise owner Discord IDs: {e}")
        return {}

@retention.command(name="notify", description="Notify coaches about pending retention decisions (Commissioner only)")
async def retention_notify(interaction: discord.Interaction):
    """
    Commissioner command to:
    1. Post summary to cffb-committee channel
    2. DM each coach with pending decisions
    """
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.response.send_message("You must be a Commissioner to run this.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    if player_copies_ws is None:
        await interaction.followup.send("PlayerCopies sheet not found.")
        return

    # Get all eligible players with pending decisions
    eligible = get_eligible_players_for_retention()
    pending = [p for p in eligible if not p['retention_decision'] or p['retention_decision'] == '']

    if not pending:
        await interaction.followup.send("All eligible players have retention decisions recorded. No notifications needed.")
        return

    # Load mappings
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()
    owner_discord_map = get_franchise_owner_discord_ids()

    # Group pending by franchise
    by_franchise = defaultdict(list)
    for p in pending:
        fid = str(int(p['franchise_id'])).zfill(3) if p['franchise_id'] else 'FA'
        by_franchise[fid].append(p)

    # Track results
    dm_sent = 0
    dm_failed = 0
    coaches_to_notify = []

    # Send DMs to each coach with pending decisions
    for fid, players in by_franchise.items():
        if fid == 'FA':
            continue  # Skip free agents

        discord_id = owner_discord_map.get(fid)
        if not discord_id:
            continue

        team_name = name_map.get(fid, 'Unknown Team')
        team_emoji = emoji_map.get(fid, '')

        # Build the DM message with retention costs
        player_lines = []
        total_cost = 0
        for p in players:
            awards_info = []
            if p['national_awards']:
                awards_info.append(f"{p['national_awards']} National Award{'s' if p['national_awards'] > 1 else ''}")
            if p['allconf_awards']:
                awards_info.append(f"{p['allconf_awards']} All-Conference selection{'s' if p['allconf_awards'] > 1 else ''}")
            awards_str = " | ".join(awards_info)
            cost_str = f"\n  💰 **Retention Cost: {p['retention_cost_label']}**"
            player_lines.append(f"• **{p['player_name']}** ({p['conference']})\n  {awards_str}{cost_str}")
            total_cost += p['retention_cost']

        # Split player lines across multiple embeds if needed (Discord description limit: 4096 chars)
        header_text = (
            f"The following player{'s' if len(players) > 1 else ''} on your team "
            f"{'are' if len(players) > 1 else 'is'} eligible for early declaration and "
            f"need{'s' if len(players) == 1 else ''} a retention decision:\n\n"
        )
        instructions_embed = discord.Embed(
            title=f"💰 Retention Summary - {team_name}",
            color=discord.Color.orange()
        )
        instructions_embed.add_field(
            name="💰 Total Retention Cost",
            value=f"**${total_cost}** from recruiting budget if all players are retained",
            inline=False
        )
        instructions_embed.add_field(
            name="How to Respond",
            value=(
                "Use the following commands in Discord:\n"
                "• `/retention retain <player_name>` - Keep the player (costs from budget)\n"
                "• `/retention release <player_name>` - Let them declare early (no cost)\n\n"
                "**If no decision is made, players will be auto-retained (cost still applies).**"
            ),
            inline=False
        )
        instructions_embed.set_footer(text="Contact a commissioner if you have questions.")

        # Build DM embeds, chunking player lines to stay under 4096-char description limit
        dm_embeds = []
        current_lines = []
        current_len = len(header_text)
        for line in player_lines:
            line_len = len(line) + 2  # +2 for "\n\n" separator
            if current_len + line_len > 4000 and current_lines:
                dm_embeds.append(discord.Embed(
                    title=f"⚠️ Retention Decisions Needed - {team_name}" if not dm_embeds else f"⚠️ (cont.) - {team_name}",
                    description=header_text + "\n\n".join(current_lines) if not dm_embeds else "\n\n".join(current_lines),
                    color=discord.Color.orange()
                ))
                current_lines = []
                current_len = 0
            current_lines.append(line)
            current_len += line_len

        if current_lines:
            dm_embeds.append(discord.Embed(
                title=f"⚠️ Retention Decisions Needed - {team_name}" if not dm_embeds else f"⚠️ (cont.) - {team_name}",
                description=header_text + "\n\n".join(current_lines) if not dm_embeds else "\n\n".join(current_lines),
                color=discord.Color.orange()
            ))

        dm_embeds.append(instructions_embed)

        try:
            user = await bot.fetch_user(int(discord_id))
            for dm_embed in dm_embeds:
                await user.send(embed=dm_embed)
            dm_sent += 1
            coaches_to_notify.append((fid, discord_id, team_name, len(players)))
        except Exception as e:
            print(f"Failed to DM user {discord_id} (franchise {fid}): {e}")
            dm_failed += 1
            coaches_to_notify.append((fid, discord_id, team_name, len(players)))

    # Post summary to committee channel
    if COMMITTEE_CHANNEL_ID != 0:
        committee_channel = bot.get_channel(COMMITTEE_CHANNEL_ID)
        if committee_channel:
            # Build the committee message with @mentions
            summary_embed = discord.Embed(
                title="📋 Pending Retention Decisions",
                description=f"**{len(pending)}** player{'s' if len(pending) > 1 else ''} across **{len(by_franchise)}** team{'s' if len(by_franchise) > 1 else ''} need retention decisions.",
                color=discord.Color.red()
            )

            # List each team with pending decisions and mention the owner
            mention_lines = []
            for fid, discord_id, team_name, player_count in coaches_to_notify:
                team_emoji = emoji_map.get(fid, '')
                mention_lines.append(f"{team_emoji} **{team_name}**: {player_count} player{'s' if player_count > 1 else ''} - <@{discord_id}>")

            # Handle FA players separately
            if 'FA' in by_franchise:
                fa_players = by_franchise['FA']
                fa_names = [p['player_name'] for p in fa_players]
                mention_lines.append(f"⚪ **Free Agents**: {', '.join(fa_names)}")

            # Split mention lines across fields if they exceed 1024 chars
            chunk_lines = []
            chunk_len = 0
            field_num = 0
            for line in mention_lines:
                line_len = len(line) + 1  # +1 for newline
                if chunk_len + line_len > 1024 and chunk_lines:
                    field_num += 1
                    field_name = "Teams Needing Decisions" if field_num == 1 else f"Teams (cont.)"
                    summary_embed.add_field(name=field_name, value="\n".join(chunk_lines), inline=False)
                    chunk_lines = []
                    chunk_len = 0
                chunk_lines.append(line)
                chunk_len += line_len

            if chunk_lines:
                field_num += 1
                field_name = "Teams Needing Decisions" if field_num == 1 else f"Teams (cont.)"
                summary_embed.add_field(name=field_name, value="\n".join(chunk_lines), inline=False)
            elif field_num == 0:
                summary_embed.add_field(name="Teams Needing Decisions", value="None", inline=False)

            summary_embed.add_field(
                name="Commands",
                value=(
                    "Coaches can use:\n"
                    "• `/retention my_team` - View your eligible players\n"
                    "• `/retention retain <player>` - Keep a player\n"
                    "• `/retention release <player>` - Let them declare early"
                ),
                inline=False
            )

            summary_embed.set_footer(text="Players with no decision will be auto-retained at season end.")

            # Send with allowed mentions so the @mentions work
            await committee_channel.send(
                content="**Retention decisions are needed!** The following coaches have been notified:",
                embed=summary_embed,
                allowed_mentions=discord.AllowedMentions(users=True)
            )
        else:
            await interaction.followup.send(
                f"⚠️ Committee channel (ID: {COMMITTEE_CHANNEL_ID}) not found. "
                f"Please set COMMITTEE_CHANNEL_ID in .env.\n\n"
                f"DMs sent: {dm_sent}, Failed: {dm_failed}"
            )
            return
    else:
        await interaction.followup.send(
            f"⚠️ COMMITTEE_CHANNEL_ID not configured in .env. "
            f"Set it to enable committee channel notifications.\n\n"
            f"DMs sent: {dm_sent}, Failed: {dm_failed}"
        )
        return

    # Report results to commissioner
    await interaction.followup.send(
        f"✅ **Retention notifications sent!**\n\n"
        f"• Committee channel notified: Yes\n"
        f"• DMs sent successfully: {dm_sent}\n"
        f"• DMs failed: {dm_failed}\n"
        f"• Total pending decisions: {len(pending)} players"
    )

# ----------------- Rankings Helper Functions -----------------

def get_rankings_data(year: int = None, week: int = None):
    """Get rankings data from the PowerRankings sheet"""
    if rankings_ws is None:
        return None

    data = rankings_ws.get_all_records(expected_headers=[])
    if not data:
        return []

    # Filter by year if specified
    if year:
        data = [r for r in data if int(r.get("Year", 0)) == year]

    # If week not specified, get the latest week for the year
    if week is None and data:
        weeks = [int(r.get("Week", 0)) for r in data]
        week = max(weeks) if weeks else None

    if week:
        data = [r for r in data if int(r.get("Week", 0)) == week]

    # Sort by rank
    data.sort(key=lambda x: int(x.get("Rank", 999)))

    return data

def get_stat_rankings(data: list, franchise_id: str) -> dict:
    """
    Calculate where a team ranks in specific stats compared to the league.
    Returns dict with rankings for AllPlayPct, OppAllPlayPct, and TotalPointsScored.
    Rank 1 = best (highest value).
    """
    if not data:
        return {"all_play_rank": None, "opp_all_play_rank": None, "points_rank": None}

    # Sort teams by each stat (descending - higher is better)
    by_all_play = sorted(data, key=lambda x: float(x.get("AllPlayPct", 0)), reverse=True)
    by_opp_all_play = sorted(data, key=lambda x: float(x.get("OppAllPlayPct", 0)), reverse=True)
    by_points = sorted(data, key=lambda x: float(x.get("TotalPointsScored", 0)), reverse=True)

    # Find the team's rank in each category
    normalized_id = str(franchise_id).zfill(3)

    all_play_rank = None
    opp_all_play_rank = None
    points_rank = None

    for i, t in enumerate(by_all_play):
        if str(t.get("FranchiseID", "")).zfill(3) == normalized_id:
            all_play_rank = i + 1
            break

    for i, t in enumerate(by_opp_all_play):
        if str(t.get("FranchiseID", "")).zfill(3) == normalized_id:
            opp_all_play_rank = i + 1
            break

    for i, t in enumerate(by_points):
        if str(t.get("FranchiseID", "")).zfill(3) == normalized_id:
            points_rank = i + 1
            break

    return {
        "all_play_rank": all_play_rank,
        "opp_all_play_rank": opp_all_play_rank,
        "points_rank": points_rank,
        "total_teams": len(data)
    }

def get_conference_emoji(conference: str) -> str:
    """Get the emoji for a conference name"""
    conf_key = f"conf_{conference}"
    return AWARD_EMOJIS.get(conf_key, "")

def get_ranking_text(rank: int) -> str:
    """Get text-based ranking display for a given rank (for embeds)"""
    if rank <= 25:
        return f"**#{rank}**"
    else:
        return f"#{rank}"

def get_rank_prefix(rank: int) -> str:
    """Get rank prefix for nicknames (text-based, no custom emojis)"""
    if rank == 1:
        return "[#1]"
    elif rank == 2:
        return "[#2]"
    elif rank == 3:
        return "[#3]"
    elif rank <= 25:
        return f"[#{rank}]"
    return ""

def get_all_rank_prefixes() -> list:
    """Get all possible rank prefixes for cleaning nicknames"""
    return [f"[#{r}]" for r in range(1, 26)]

def format_movement(movement: str) -> str:
    """Format movement string with visual indicator"""
    if not movement or movement == "-":
        return "➖"
    if movement == "NEW":
        return "🆕"
    if movement.startswith("+"):
        return f"⬆️{movement}"
    if movement.startswith("-"):
        return f"⬇️{movement}"
    return movement

def get_franchise_owner_map():
    """
    Get franchise ID to owner Discord ID mapping.
    Returns dict: franchiseId (3-digit padded) -> discord_id (string)
    """
    try:
        data = teams_ws.get_all_records(expected_headers=[])
        owner_map = {}
        for row in data:
            franchise_id = str(row.get("Franchise ID", "")).strip()
            if franchise_id:
                franchise_id = str(int(franchise_id)).zfill(3)
            discord_id = normalize_discord_id(row.get("Owner Discord ID", ""))
            if franchise_id and discord_id:
                owner_map[franchise_id] = discord_id
        return owner_map
    except Exception as e:
        print(f"Error loading franchise owner map: {e}")
        return {}

# ----------------- Rankings Commands -----------------

@rankings.command(name="top25", description="Show the current Top 25 power rankings")
@app_commands.describe(year="Season year (default: current)")
async def rankings_top25(interaction: discord.Interaction, year: int = None):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if rankings_ws is None:
        await interaction.followup.send("PowerRankings sheet not found. Rankings have not been calculated yet.")
        return

    year = year or get_current_year()
    data = get_rankings_data(year)

    if not data:
        await interaction.followup.send(f"No rankings data found for {year}. Rankings may not have been calculated yet.")
        return

    # Get week from data
    week = data[0].get("Week", "?") if data else "?"

    # Load team emoji map
    emoji_map = get_team_emoji_map()

    # Build embed
    embed = discord.Embed(
        title=f"🏈 Power Rankings - {year} Week {week}",
        color=discord.Color.dark_gold()
    )

    # Top 25 teams
    lines = []
    for team in data[:25]:
        rank = int(team.get("Rank", 0))
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_name = team.get("TeamName", "Unknown")
        movement = format_movement(team.get("Movement", "-"))

        # Get team emoji
        team_emoji = emoji_map.get(franchise_id, "")

        # Format record
        wins = team.get("RegularSeasonWins", 0)
        losses = team.get("RegularSeasonLosses", 0)
        post_wins = team.get("PostseasonWins", 0)
        post_losses = team.get("PostseasonLosses", 0)
        total_wins = wins + post_wins
        total_losses = losses + post_losses

        conf_wins = team.get("ConferenceWins", 0)
        conf_losses = team.get("ConferenceLosses", 0)

        score = team.get("RankingScore", 0)

        rank_emoji = get_ranking_text(rank)

        lines.append(
            f"{rank_emoji} {team_emoji} **{team_name}** {movement}\n"
            f"   ({total_wins}-{total_losses}) | Conf: {conf_wins}-{conf_losses} | Score: {score:.3f}"
        )

    # Split into chunks for embed fields (Discord limit ~1024 chars per field)
    chunk_size = 5
    for i in range(0, min(25, len(lines)), chunk_size):
        chunk = lines[i:i+chunk_size]
        start = i + 1
        end = min(i + chunk_size, 25)
        embed.add_field(
            name=f"Ranks {start}-{end}" if i > 0 else f"Top {end}",
            value="\n".join(chunk),
            inline=False
        )

    embed.set_footer(text=f"Calculated at: {data[0].get('CalculatedAt', 'Unknown')[:10] if data else ''}")

    await interaction.followup.send(embed=embed)

@rankings.command(name="team", description="Get detailed ranking info for a specific team")
@app_commands.describe(team_name="Team name to search for")
async def rankings_team(interaction: discord.Interaction, team_name: str):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if rankings_ws is None:
        await interaction.followup.send("PowerRankings sheet not found.")
        return

    year = get_current_year()
    data = get_rankings_data(year)

    if not data:
        await interaction.followup.send(f"No rankings data found for {year}.")
        return

    # Search for team
    search_lower = team_name.lower()
    team = None
    for t in data:
        if search_lower in t.get("TeamName", "").lower():
            team = t
            break
        # Also check franchise ID
        if t.get("FranchiseID", "") == team_name or str(t.get("FranchiseID", "")).zfill(3) == team_name.zfill(3):
            team = t
            break

    if not team:
        await interaction.followup.send(f"Team '{team_name}' not found in rankings.")
        return

    # Load team emoji
    emoji_map = get_team_emoji_map()
    franchise_id = str(team.get("FranchiseID", "")).zfill(3)
    team_emoji = emoji_map.get(franchise_id, "")

    # Get stat rankings compared to league
    stat_ranks = get_stat_rankings(data, franchise_id)

    rank = int(team.get("Rank", 0))
    rank_emoji = get_ranking_text(rank) if rank <= 25 else f"**#{rank}**"

    # Get conference emoji
    conference = team.get("Conference", "Unknown")
    conf_emoji = get_conference_emoji(conference)

    # Build detailed embed
    embed = discord.Embed(
        title=f"{team_emoji} {team.get('TeamName', 'Unknown')}",
        color=discord.Color.blue()
    )

    # Ranking info
    movement = format_movement(team.get("Movement", "-"))
    embed.add_field(
        name="🏆 Ranking",
        value=f"{rank_emoji} **#{rank}** {movement}",
        inline=True
    )

    embed.add_field(
        name="📊 Score",
        value=f"**{team.get('RankingScore', 0):.4f}**",
        inline=True
    )

    embed.add_field(
        name="🏟️ Conference",
        value=f"{conf_emoji} {conference}" if conf_emoji else conference,
        inline=True
    )

    # Record section
    wins = team.get("RegularSeasonWins", 0)
    losses = team.get("RegularSeasonLosses", 0)
    ties = team.get("RegularSeasonTies", 0)
    record_str = f"{wins}-{losses}" + (f"-{ties}" if ties else "")

    post_wins = team.get("PostseasonWins", 0)
    post_losses = team.get("PostseasonLosses", 0)

    conf_wins = team.get("ConferenceWins", 0)
    conf_losses = team.get("ConferenceLosses", 0)

    embed.add_field(
        name="📋 Record",
        value=f"**Overall:** {record_str}\n**Conference:** {conf_wins}-{conf_losses}\n**Postseason:** {post_wins}-{post_losses}",
        inline=True
    )

    # All-Play section with league rankings
    all_play_pct = team.get("AllPlayPct", 0)
    opp_all_play_pct = team.get("OppAllPlayPct", 0)
    ap_rank = stat_ranks.get("all_play_rank")
    oap_rank = stat_ranks.get("opp_all_play_rank")
    total_teams = stat_ranks.get("total_teams", 100)

    ap_rank_str = f" (#{ap_rank}/{total_teams})" if ap_rank else ""
    oap_rank_str = f" (#{oap_rank}/{total_teams})" if oap_rank else ""

    embed.add_field(
        name="📈 All-Play",
        value=f"**All-Play %:** {all_play_pct*100:.1f}%{ap_rank_str}\n**Opp All-Play %:** {opp_all_play_pct*100:.1f}%{oap_rank_str}",
        inline=True
    )

    # Points with league ranking
    points_rank = stat_ranks.get("points_rank")
    pts_rank_str = f" (#{points_rank}/{total_teams})" if points_rank else ""

    embed.add_field(
        name="🎯 Points",
        value=f"**Total PF:** {team.get('TotalPointsScored', 0):.1f}{pts_rank_str}",
        inline=True
    )

    # Formula breakdown
    formula_value = f"(({wins} + 1) × ({all_play_pct:.4f} + {opp_all_play_pct:.4f})) + {post_wins}"
    embed.add_field(
        name="📐 Formula",
        value=f"`{formula_value}`\n= **{team.get('RankingScore', 0):.4f}**",
        inline=False
    )

    week = team.get("Week", "?")
    embed.set_footer(text=f"Week {week} | Year {year}")

    await interaction.followup.send(embed=embed)

@rankings.command(name="my_team", description="Get your team's ranking")
async def rankings_my_team(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("You are not registered as a team owner.")
        return

    if rankings_ws is None:
        await interaction.followup.send("PowerRankings sheet not found.")
        return

    year = get_current_year()
    data = get_rankings_data(year)

    if not data:
        await interaction.followup.send(f"No rankings data found for {year}.")
        return

    # Find user's team in rankings
    franchise_id = str(team['id']).zfill(3) if team['id'] else ''
    team_ranking = None
    for t in data:
        if str(t.get("FranchiseID", "")).zfill(3) == franchise_id:
            team_ranking = t
            break

    if not team_ranking:
        await interaction.followup.send(f"Could not find ranking for {team['name']}.")
        return

    # Load team emoji
    emoji_map = get_team_emoji_map()
    team_emoji = emoji_map.get(franchise_id, "")

    # Get stat rankings compared to league
    stat_ranks = get_stat_rankings(data, franchise_id)

    rank = int(team_ranking.get("Rank", 0))
    rank_emoji = get_ranking_text(rank) if rank <= 25 else f"**#{rank}**"

    # Get conference emoji
    conference = team_ranking.get("Conference", "Unknown")
    conf_emoji = get_conference_emoji(conference)

    # Build embed (similar to rankings_team but personalized)
    embed = discord.Embed(
        title=f"{team_emoji} {team_ranking.get('TeamName', 'Unknown')} - Your Team",
        color=discord.Color.green()
    )

    movement = format_movement(team_ranking.get("Movement", "-"))
    embed.add_field(
        name="🏆 Ranking",
        value=f"{rank_emoji} **#{rank}** {movement}",
        inline=True
    )

    embed.add_field(
        name="📊 Score",
        value=f"**{team_ranking.get('RankingScore', 0):.4f}**",
        inline=True
    )

    embed.add_field(
        name="🏟️ Conference",
        value=f"{conf_emoji} {conference}" if conf_emoji else conference,
        inline=True
    )

    wins = team_ranking.get("RegularSeasonWins", 0)
    losses = team_ranking.get("RegularSeasonLosses", 0)
    conf_wins = team_ranking.get("ConferenceWins", 0)
    conf_losses = team_ranking.get("ConferenceLosses", 0)
    post_wins = team_ranking.get("PostseasonWins", 0)
    post_losses = team_ranking.get("PostseasonLosses", 0)

    embed.add_field(
        name="📋 Record",
        value=f"**Overall:** {wins}-{losses}\n**Conference:** {conf_wins}-{conf_losses}\n**Postseason:** {post_wins}-{post_losses}",
        inline=True
    )

    # All-Play section with league rankings
    all_play_pct = team_ranking.get("AllPlayPct", 0)
    opp_all_play_pct = team_ranking.get("OppAllPlayPct", 0)
    ap_rank = stat_ranks.get("all_play_rank")
    oap_rank = stat_ranks.get("opp_all_play_rank")
    total_teams = stat_ranks.get("total_teams", 100)

    ap_rank_str = f" (#{ap_rank}/{total_teams})" if ap_rank else ""
    oap_rank_str = f" (#{oap_rank}/{total_teams})" if oap_rank else ""

    embed.add_field(
        name="📈 All-Play Stats",
        value=f"**All-Play %:** {all_play_pct*100:.1f}%{ap_rank_str}\n**Opp All-Play %:** {opp_all_play_pct*100:.1f}%{oap_rank_str}",
        inline=True
    )

    # Points with league ranking
    points_rank = stat_ranks.get("points_rank")
    pts_rank_str = f" (#{points_rank}/{total_teams})" if points_rank else ""

    embed.add_field(
        name="🎯 Points",
        value=f"**Total PF:** {team_ranking.get('TotalPointsScored', 0):.1f}{pts_rank_str}",
        inline=True
    )

    week = team_ranking.get("Week", "?")
    embed.set_footer(text=f"Week {week} | Year {year}")

    await interaction.followup.send(embed=embed, ephemeral=True)

@rankings.command(name="post", description="Post rankings to the rankings channel and update nicknames (Commissioner only)")
async def rankings_post(interaction: discord.Interaction):
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.response.send_message("You must be a Commissioner to run this.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    if RANKINGS_CHANNEL_ID == 0:
        await interaction.followup.send("RANKINGS_CHANNEL_ID not configured in environment variables.")
        return

    channel = bot.get_channel(RANKINGS_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send(f"Rankings channel {RANKINGS_CHANNEL_ID} not found.")
        return

    if rankings_ws is None:
        await interaction.followup.send("PowerRankings sheet not found.")
        return

    year = get_current_year()
    data = get_rankings_data(year)

    if not data:
        await interaction.followup.send(f"No rankings data found for {year}.")
        return

    # Post rankings to channel
    week = data[0].get("Week", "?") if data else "?"
    emoji_map = get_team_emoji_map()

    # Special formatting for Week 18 Final Rankings
    if week == 18 or week == "18":
        embed = discord.Embed(
            title=f"🏆 FINAL RANKINGS - {year} Season 🏆",
            description="Official end-of-season power rankings",
            color=discord.Color.gold()
        )
    else:
        embed = discord.Embed(
            title=f"🏈 Power Rankings - {year} Week {week}",
            description="Official weekly power rankings",
            color=discord.Color.dark_gold()
        )

    # Build top 25 display
    lines = []
    for team in data[:25]:
        rank = int(team.get("Rank", 0))
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_name = team.get("TeamName", "Unknown")
        movement = format_movement(team.get("Movement", "-"))
        team_emoji = emoji_map.get(franchise_id, "")

        wins = team.get("RegularSeasonWins", 0) + team.get("PostseasonWins", 0)
        losses = team.get("RegularSeasonLosses", 0) + team.get("PostseasonLosses", 0)
        conf_wins = team.get("ConferenceWins", 0)
        conf_losses = team.get("ConferenceLosses", 0)
        score = team.get("RankingScore", 0)

        rank_emoji = get_ranking_text(rank)

        lines.append(
            f"{rank_emoji} {team_emoji} **{team_name}** {movement}\n"
            f"   ({wins}-{losses}) | Conf: {conf_wins}-{conf_losses} | Score: {score:.3f}"
        )

    # Split into fields
    chunk_size = 5
    for i in range(0, min(25, len(lines)), chunk_size):
        chunk = lines[i:i+chunk_size]
        start = i + 1
        end = min(i + chunk_size, 25)
        embed.add_field(
            name=f"#{start}-{end}",
            value="\n".join(chunk),
            inline=False
        )

    embed.set_footer(text=f"Rankings calculated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    await channel.send(embed=embed)

    # Update nicknames for top 25 teams
    guild = bot.get_guild(GUILD_ID)
    if guild is None:
        await interaction.followup.send(f"Rankings posted to {channel.mention}.\n\n⚠️ Could not update nicknames - guild not found.")
        return

    owner_map = get_franchise_owner_map()
    nickname_updates = 0
    nickname_failures = 0
    nickname_removed = 0

    # First, remove ranking prefixes from users no longer in top 25
    rank_prefixes = get_all_rank_prefixes()
    for member in guild.members:
        if member.bot:
            continue

        # Check if member's nickname starts with a ranking prefix
        if member.nick:
            for prefix in rank_prefixes:
                if member.nick.startswith(prefix):
                    # Check if they're still in top 25
                    member_franchise_id = None
                    for fid, discord_id in owner_map.items():
                        if discord_id == str(member.id):
                            member_franchise_id = fid
                            break

                    if member_franchise_id:
                        # Check their current rank
                        current_rank = None
                        for team in data[:25]:
                            if str(team.get("FranchiseID", "")).zfill(3) == member_franchise_id:
                                current_rank = int(team.get("Rank", 0))
                                break

                        if current_rank is None or current_rank > 25:
                            # Remove ranking prefix from nickname
                            try:
                                new_nick = member.nick.replace(prefix, "").strip()
                                if new_nick:
                                    await member.edit(nick=new_nick)
                                else:
                                    await member.edit(nick=None)
                                nickname_removed += 1
                            except discord.Forbidden:
                                pass
                    break

    # Now add/update ranking prefixes for top 25
    for team in data[:25]:
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        rank = int(team.get("Rank", 0))
        team_name = team.get("TeamName", "Unknown")

        discord_id = owner_map.get(franchise_id)
        if not discord_id:
            continue

        try:
            member = guild.get_member(int(discord_id))
            if member is None:
                continue

            if member.id == guild.owner_id:
                # Cannot change server owner's nickname
                continue

            rank_prefix = get_rank_prefix(rank)
            if not rank_prefix:
                continue

            # Determine new nickname
            current_name = member.nick or member.display_name

            # Remove any existing ranking prefix
            clean_name = current_name
            for prefix in rank_prefixes:
                if clean_name.startswith(prefix):
                    clean_name = clean_name.replace(prefix, "").strip()
                    break

            new_nick = f"{rank_prefix} {clean_name}"

            # Truncate to Discord's 32 character limit
            if len(new_nick) > 32:
                new_nick = new_nick[:32]

            if member.nick != new_nick:
                await member.edit(nick=new_nick)
                nickname_updates += 1

        except discord.Forbidden:
            nickname_failures += 1
        except Exception as e:
            print(f"Error updating nickname for franchise {franchise_id}: {e}")
            nickname_failures += 1

    await interaction.followup.send(
        f"✅ **Rankings posted to {channel.mention}!**\n\n"
        f"**Nickname Updates:**\n"
        f"• Updated: {nickname_updates}\n"
        f"• Removed (dropped out of top 25): {nickname_removed}\n"
        f"• Failed: {nickname_failures}"
    )

# ----------------- Scheduled Awards Updates -----------------
@tasks.loop(time=time(hour=8, minute=0))  # Runs daily at 8:00 AM UTC
async def post_weekly_awards_update():
    """Post weekly awards update to the awards channel"""
    global last_posted_heisman

    if not auto_posts_enabled:
        return

    if AWARDS_CHANNEL_ID == 0:
        return

    channel = bot.get_channel(AWARDS_CHANNEL_ID)
    if channel is None:
        print(f"Awards channel {AWARDS_CHANNEL_ID} not found")
        return

    if awards_ws is None:
        return

    year = get_current_year()
    data = get_awards_data(year)

    if not data:
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Get current Heisman leader
    heisman = [r for r in data if r.get("AwardType") == "Heisman"]
    heisman.sort(key=lambda x: int(x.get("Rank", 999)))

    if not heisman:
        return

    current_leader = heisman[0].get("PlayerName")

    # Check if leader changed
    leader_changed = last_posted_heisman is not None and last_posted_heisman != current_leader
    last_posted_heisman = current_leader

    # Build the update embed
    embed = discord.Embed(
        title=f"{AWARD_EMOJIS['heisman']} Weekly Awards Update - {year}",
        color=discord.Color.gold()
    )

    # Heisman section
    heisman_lines = []
    for i, player in enumerate(heisman[:5]):
        medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
        name = player.get("PlayerName", "Unknown")
        pos = player.get("Position", "")
        score = player.get("AwardScore", 0)
        team_emoji = format_player_with_team(player, emoji_map, name_map)
        heisman_lines.append(f"{medal} {team_emoji}**{name}** ({pos}) - {score:.2f}")

    heisman_value = "\n".join(heisman_lines)
    if leader_changed:
        heisman_value = f"**NEW LEADER!**\n{heisman_value}"

    embed.add_field(name=f"{AWARD_EMOJIS['heisman']} Heisman Trophy Race", value=heisman_value, inline=False)

    # National Awards leaders
    national = [r for r in data if r.get("AwardType", "").startswith("National_") and int(r.get("Rank", 999)) == 1]
    if national:
        nat_lines = []
        for r in national:
            pos = r.get("AwardType", "").replace("National_", "")
            pos_key = pos.lower().replace("/", "_")
            pos_emoji = AWARD_EMOJIS.get(f"national_{pos_key}", "")
            team_emoji = format_player_with_team(r, emoji_map, name_map)
            nat_lines.append(f"{pos_emoji} **{pos}:** {team_emoji}{r.get('PlayerName')} ({r.get('AwardScore', 0):.2f})")
        embed.add_field(name=f"{AWARD_EMOJIS['all_conference']} National Award Leaders", value="\n".join(nat_lines), inline=False)

    # Coach of the Year race (top 3)
    coty = [r for r in data if r.get("AwardType") == "CoachOfYear"]
    coty.sort(key=lambda x: int(x.get("Rank", 999)))
    if coty:
        coty_lines = []
        for i, entry in enumerate(coty[:3]):
            medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
            franchise_id = str(entry.get("FranchiseID", "")).zfill(3)
            team_emoji_str = emoji_map.get(franchise_id, "")
            if team_emoji_str:
                team_emoji_str = f"{team_emoji_str} "
            coty_lines.append(f"{medal} {team_emoji_str}**{entry.get('PlayerName', '?')}** ({entry.get('Conference', '')}) - {entry.get('AwardScore', 0):.2f}")
        embed.add_field(name=f"{AWARD_EMOJIS['coach_of_year']} Coach of the Year Race", value="\n".join(coty_lines), inline=False)

    embed.set_footer(text=f"Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    await channel.send(embed=embed)

@post_weekly_awards_update.before_loop
async def before_weekly_awards():
    """Wait until the bot is ready before starting the loop"""
    await bot.wait_until_ready()

# Manual trigger for awards update (Commissioner only)
@bot.tree.command(name="post_awards_update", description="Manually post awards update to the awards channel (Commissioner only)")
async def post_awards_update(interaction: discord.Interaction):
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.response.send_message("You must be a Commissioner to run this.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    if AWARDS_CHANNEL_ID == 0:
        await interaction.followup.send("AWARDS_CHANNEL_ID not configured in environment variables.")
        return

    channel = bot.get_channel(AWARDS_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send(f"Awards channel {AWARDS_CHANNEL_ID} not found.")
        return

    if awards_ws is None:
        await interaction.followup.send("Awards sheet not found.")
        return

    year = get_current_year()
    data = get_awards_data(year)

    if not data:
        await interaction.followup.send(f"No awards data found for {year}.")
        return

    # Load team emoji and name maps
    emoji_map = get_team_emoji_map()
    name_map = get_team_name_map()

    # Build the update embed
    embed = discord.Embed(
        title=f"{AWARD_EMOJIS['heisman']} Awards Update - {year}",
        color=discord.Color.gold()
    )

    # Heisman section
    heisman = [r for r in data if r.get("AwardType") == "Heisman"]
    heisman.sort(key=lambda x: int(x.get("Rank", 999)))

    if heisman:
        heisman_lines = []
        for i, player in enumerate(heisman[:5]):
            medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
            name = player.get("PlayerName", "Unknown")
            pos = player.get("Position", "")
            score = player.get("AwardScore", 0)
            team_emoji = format_player_with_team(player, emoji_map, name_map)
            heisman_lines.append(f"{medal} {team_emoji}**{name}** ({pos}) - {score:.2f}")

        embed.add_field(name=f"{AWARD_EMOJIS['heisman']} Heisman Trophy Race", value="\n".join(heisman_lines), inline=False)

    # National Awards leaders
    national = [r for r in data if r.get("AwardType", "").startswith("National_") and int(r.get("Rank", 999)) == 1]
    if national:
        nat_lines = []
        for r in national:
            pos = r.get("AwardType", "").replace("National_", "")
            pos_key = pos.lower().replace("/", "_")
            pos_emoji = AWARD_EMOJIS.get(f"national_{pos_key}", "")
            team_emoji = format_player_with_team(r, emoji_map, name_map)
            nat_lines.append(f"{pos_emoji} **{pos}:** {team_emoji}{r.get('PlayerName')} ({r.get('AwardScore', 0):.2f})")
        embed.add_field(name=f"{AWARD_EMOJIS['all_conference']} National Award Leaders", value="\n".join(nat_lines), inline=False)

    # Coach of the Year race (top 3)
    coty = [r for r in data if r.get("AwardType") == "CoachOfYear"]
    coty.sort(key=lambda x: int(x.get("Rank", 999)))
    if coty:
        coty_lines = []
        for i, entry in enumerate(coty[:3]):
            medal = [AWARD_EMOJIS['first_team'], AWARD_EMOJIS['second_team'], AWARD_EMOJIS['third_team']][i] if i < 3 else f"**{i+1}.**"
            franchise_id = str(entry.get("FranchiseID", "")).zfill(3)
            team_emoji_str = emoji_map.get(franchise_id, "")
            if team_emoji_str:
                team_emoji_str = f"{team_emoji_str} "
            coty_lines.append(f"{medal} {team_emoji_str}**{entry.get('PlayerName', '?')}** ({entry.get('Conference', '')}) - {entry.get('AwardScore', 0):.2f}")
        embed.add_field(name=f"{AWARD_EMOJIS['coach_of_year']} Coach of the Year Race", value="\n".join(coty_lines), inline=False)

    embed.set_footer(text=f"Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    await channel.send(embed=embed)
    await interaction.followup.send(f"Awards update posted to {channel.mention}.")

# ----------------- College Gameday Helper Functions -----------------
def get_schedule_results_info():
    """Get the year and max week from ScheduleResults sheet.
    Returns (year, max_week) or (None, None) if no data."""
    if schedule_results_ws is None:
        return None, None

    try:
        sr_data = schedule_results_ws.get_all_records(expected_headers=[])
        if not sr_data:
            return None, None

        # Find the max year and max week
        max_year = 0
        max_week = 0
        for row in sr_data:
            row_year = int(row.get("Year", 0))
            row_week = int(row.get("Week", 0))
            if row_year > max_year:
                max_year = row_year
                max_week = row_week
            elif row_year == max_year and row_week > max_week:
                max_week = row_week

        return max_year if max_year > 0 else None, max_week if max_week > 0 else None
    except Exception as e:
        print(f"Error getting ScheduleResults info: {e}")
        return None, None


def get_gameday_matchups(week: int, year: int = None):
    """Get College Gameday matchups from ScheduleResults.
    Year is auto-detected from ScheduleResults if not provided."""
    if schedule_results_ws is None or rankings_ws is None:
        print("Gameday: schedule_results_ws or rankings_ws is None")
        return None

    # Auto-detect year from ScheduleResults if not provided
    if year is None:
        year, _ = get_schedule_results_info()
        if year is None:
            print("Gameday: Could not determine year from ScheduleResults")
            return None
        print(f"Gameday: Auto-detected year {year} from ScheduleResults")

    # Get rankings from the selected week (which has N-1 cumulative data)
    # Week N in ScheduleResults contains rankings based on data through Week N-1
    rank_map = {}

    try:
        sr_data = schedule_results_ws.get_all_records(expected_headers=[])
        for row in sr_data:
            # Use int() conversion to handle potential type mismatches
            row_year = int(row.get("Year", 0))
            row_week = int(row.get("Week", 0))
            if row_year == year and row_week == week:
                fid = str(row.get("FranchiseID", "")).zfill(3)
                rank = row.get("SeasonRank")
                if rank:
                    rank_map[fid] = int(rank)
    except Exception as e:
        print(f"Gameday: Error reading ScheduleResults for ranks: {e}")

    # Fallback to PowerRankings if no ScheduleResults data
    if not rank_map:
        print(f"Gameday: No ranks found in ScheduleResults for {year} Week {week}, trying PowerRankings")
        try:
            pr_data = rankings_ws.get_all_records(expected_headers=[])
            for row in pr_data:
                row_year = int(row.get("Year", 0))
                row_week = int(row.get("Week", 0))
                if row_year == year and row_week == week:
                    fid = str(row.get("FranchiseID", "")).zfill(3)
                    rank = row.get("Rank")
                    if rank:
                        rank_map[fid] = int(rank)
        except Exception as e:
            print(f"Gameday: Error reading PowerRankings: {e}")

    if not rank_map:
        print(f"Gameday: No rankings found for {year} Week {week}")
        return None

    print(f"Gameday: Found {len(rank_map)} team rankings for {year} Week {week}")

    # Get team info
    teams = teams_ws.get_all_records(expected_headers=[])
    team_map = {}
    emoji_map = {}
    for t in teams:
        fid = str(t.get("Franchise ID", "")).zfill(3)
        team_map[fid] = t.get("Team Name", f"Team {fid}")
        emoji_map[fid] = t.get("Emoji", "")

    # Get matchups for the selected week from ScheduleResults
    matchups = []
    try:
        sr_data = schedule_results_ws.get_all_records(expected_headers=[])
        processed_pairs = set()

        for row in sr_data:
            row_year = int(row.get("Year", 0))
            row_week = int(row.get("Week", 0))
            if row_year != year or row_week != week:
                continue

            fid = str(row.get("FranchiseID", "")).zfill(3)
            opp_id = str(row.get("OpponentID", "")).zfill(3)
            game_result = row.get("GameResult", "")

            # Skip if no opponent or BYE week (but allow empty GameResult for schedule week)
            if not opp_id or opp_id == "000" or game_result == "BYE":
                continue

            # Create a unique pair key to avoid duplicates
            pair_key = tuple(sorted([fid, opp_id]))
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)

            rank1 = rank_map.get(fid, 100)
            rank2 = rank_map.get(opp_id, 100)
            avg_rank = (rank1 + rank2) / 2

            matchups.append({
                "team1": {
                    "id": fid,
                    "name": team_map.get(fid, f"Team {fid}"),
                    "rank": rank1,
                    "emoji": emoji_map.get(fid, "")
                },
                "team2": {
                    "id": opp_id,
                    "name": team_map.get(opp_id, f"Team {opp_id}"),
                    "rank": rank2,
                    "emoji": emoji_map.get(opp_id, "")
                },
                "avg_rank": avg_rank
            })
    except Exception as e:
        print(f"Error getting matchups: {e}")
        return None

    if not matchups:
        return None

    # Sort by average rank (lowest = best matchup)
    matchups.sort(key=lambda m: m["avg_rank"])

    # Identify Gameday matchup (always the best one)
    gameday_matchup = matchups[0] if matchups else None

    # Games of the Week = avg rank < 15 (excluding the main gameday matchup)
    games_of_week = [m for m in matchups[1:] if m["avg_rank"] < 15]

    return {
        "gameday_matchup": gameday_matchup,
        "games_of_week": games_of_week,
        "week": week,
        "year": year
    }

def create_gameday_embed(data: dict) -> discord.Embed:
    """Create a TV broadcast style embed for College Gameday"""
    if not data or not data.get("gameday_matchup"):
        return None

    gm = data["gameday_matchup"]
    week = data["week"]
    year = data["year"]

    # Get the Gameday application emoji
    gameday_emoji = AWARD_EMOJIS.get("gameday", "🏈")

    # Main embed with dramatic styling
    embed = discord.Embed(
        title=f"{gameday_emoji} COLLEGE GAMEDAY {gameday_emoji}",
        description=f"**Week {week}** | *Live from the biggest matchup of the week!*",
        color=discord.Color.gold()
    )

    # The main event
    t1 = gm["team1"]
    t2 = gm["team2"]

    matchup_text = (
        f"```\n"
        f"{'═' * 40}\n"
        f"      THE MAIN EVENT\n"
        f"{'═' * 40}\n"
        f"\n"
        f"  #{t1['rank']:>2}  {t1['name'][:20]:<20}\n"
        f"                  VS\n"
        f"  #{t2['rank']:>2}  {t2['name'][:20]:<20}\n"
        f"\n"
        f"{'═' * 40}\n"
        f"```"
    )

    embed.add_field(
        name=f"{t1['emoji']} #{t1['rank']} {t1['name']} vs #{t2['rank']} {t2['name']} {t2['emoji']}",
        value=matchup_text,
        inline=False
    )

    # Games of the Week (matchups with avg rank < 15, excluding main event)
    games_of_week = data.get("games_of_week", [])

    gotw_lines = []
    for i, m in enumerate(games_of_week[:5], 1):  # Max 5
        t1 = m["team1"]
        t2 = m["team2"]
        avg = m.get("avg_rank", 0)
        gotw_lines.append(
            f"**{i}.** {t1['emoji']} #{t1['rank']} {t1['name']} vs #{t2['rank']} {t2['name']} {t2['emoji']} *(Avg: {avg:.1f})*"
        )

    # Always show the section
    embed.add_field(
        name=f"⭐ GAMES OF THE WEEK ⭐",
        value="\n".join(gotw_lines) if gotw_lines else "*No other top-15 matchups this week*",
        inline=False
    )

    # Hype footer
    embed.set_footer(text=f"🎙️ \"This is going to be a great one, folks!\" | {year} Season")

    return embed

# ----------------- College Gameday Commands -----------------
@commish.command(name="gameday_preview", description="Preview College Gameday matchups for a week")
@app_commands.describe(week="Week number to preview (defaults to latest week in ScheduleResults)")
async def gameday_preview(interaction: discord.Interaction, week: int = None):
    await interaction.response.defer()

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    # Auto-detect week from ScheduleResults if not provided
    if week is None:
        _, max_week = get_schedule_results_info()
        if max_week:
            week = max_week
        else:
            await interaction.followup.send("No data found in ScheduleResults. Run rankings calculation first.")
            return

    data = get_gameday_matchups(week)

    if not data:
        await interaction.followup.send(f"No matchup data available for Week {week}. Make sure ScheduleResults is populated.")
        return

    embed = create_gameday_embed(data)
    if embed:
        await interaction.followup.send(embed=embed)
    else:
        await interaction.followup.send("Could not generate Gameday preview.")

@gameday.command(name="post", description="Post College Gameday to the gameday channel (Commissioner only)")
@app_commands.describe(week="Week number to post (defaults to latest week in ScheduleResults)")
async def gameday_post(interaction: discord.Interaction, week: int = None):
    await interaction.response.defer()

    # Check commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("You must be a Commissioner to post Gameday.", ephemeral=True)
        return

    if GAMEDAY_CHANNEL_ID == 0:
        await interaction.followup.send("GAMEDAY_CHANNEL_ID not configured in environment variables.")
        return

    channel = bot.get_channel(GAMEDAY_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send(f"Gameday channel not found.")
        return

    # Auto-detect week from ScheduleResults if not provided
    if week is None:
        _, max_week = get_schedule_results_info()
        if max_week:
            week = max_week
        else:
            await interaction.followup.send("No data found in ScheduleResults. Run rankings calculation first.")
            return

    data = get_gameday_matchups(week)

    if not data:
        await interaction.followup.send(f"No matchup data available for Week {week}.")
        return

    embed = create_gameday_embed(data)
    if not embed:
        await interaction.followup.send("Could not generate Gameday post.")
        return

    # Post to the gameday channel
    await channel.send(embed=embed)
    await interaction.followup.send(f"College Gameday posted to {channel.mention}!")

# ----------------- Projections Helper Functions -----------------

def get_projections_data(year: int = None, week: int = None):
    """Get projections data from the Projections sheet"""
    if projections_ws is None:
        return None

    data = projections_ws.get_all_records(expected_headers=[])
    if not data:
        return []

    # Filter by year if specified
    if year:
        data = [r for r in data if int(r.get("Year", 0)) == year]

    # If week not specified, get the latest week for the year
    if week is None and data:
        weeks = [int(r.get("AsOfWeek", 0)) for r in data]
        week = max(weeks) if weeks else None

    if week:
        data = [r for r in data if int(r.get("AsOfWeek", 0)) == week]

    # Sort by playoff probability (descending)
    data.sort(key=lambda x: float(x.get("PlayoffPct", 0)), reverse=True)

    return data

def format_pct_bar(pct: float, width: int = 10) -> str:
    """Create a visual percentage bar"""
    filled = int(pct / 100 * width)
    empty = width - filled
    return "█" * filled + "░" * empty

# ----------------- Projections Commands -----------------

@commish.command(name="playoff", description="Show playoff probability for all teams")
@app_commands.describe(year="Season year (default: current)")
async def projections_playoff(interaction: discord.Interaction, year: int = None):
    await interaction.response.defer()

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if projections_ws is None:
        await interaction.followup.send("Projections sheet not found. Projections have not been calculated yet.")
        return

    year = year or get_current_year()
    data = get_projections_data(year)

    if not data:
        await interaction.followup.send(f"No projections data found for {year}. Projections may not have been calculated yet.")
        return

    week = data[0].get("AsOfWeek", "?") if data else "?"
    emoji_map = get_team_emoji_map()

    embed = discord.Embed(
        title=f"🏈 Playoff Projections - {year} Week {week}",
        description="Top 20 teams by playoff probability",
        color=discord.Color.blue()
    )

    # Top 20 playoff contenders
    lines = []
    for i, team in enumerate(data[:20]):
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_name = team.get("TeamName", "Unknown")
        team_emoji = emoji_map.get(franchise_id, "")
        playoff_pct = float(team.get("PlayoffPct", 0))
        conf = team.get("Conference", "")
        conf_emoji = get_conference_emoji(conf)
        path = team.get("PlayoffPath", "")
        wins = int(team.get("CurrentWins", 0))
        losses = int(team.get("CurrentLosses", 0))

        pct_bar = format_pct_bar(playoff_pct, 8)
        line = f"`{i+1:2}.` {team_emoji} **{team_name}** {conf_emoji} ({wins}-{losses})\n"
        line += f"    `{pct_bar}` **{playoff_pct:.1f}%** | {path}"
        lines.append(line)

    # Split into chunks for embed fields
    chunk_size = 5
    for i in range(0, len(lines), chunk_size):
        chunk = lines[i:i + chunk_size]
        start = i + 1
        end = min(i + chunk_size, 20)
        embed.add_field(
            name=f"#{start}-{end}",
            value="\n".join(chunk),
            inline=False
        )

    embed.set_footer(text=f"Projections as of Week {week}")
    await interaction.followup.send(embed=embed)

@commish.command(name="bowl", description="Show bowl eligibility projections")
@app_commands.describe(year="Season year (default: current)")
async def projections_bowl(interaction: discord.Interaction, year: int = None):
    await interaction.response.defer()

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if projections_ws is None:
        await interaction.followup.send("Projections sheet not found.")
        return

    year = year or get_current_year()
    data = get_projections_data(year)

    if not data:
        await interaction.followup.send(f"No projections data found for {year}.")
        return

    week = data[0].get("AsOfWeek", "?") if data else "?"
    emoji_map = get_team_emoji_map()

    # Sort by bowl probability for non-playoff teams
    bowl_candidates = [t for t in data if float(t.get("PlayoffPct", 0)) < 50]
    bowl_candidates.sort(key=lambda x: float(x.get("BowlPct", 0)), reverse=True)

    embed = discord.Embed(
        title=f"🎯 Bowl Projections - {year} Week {week}",
        description="Bowl eligibility for non-playoff contenders (6+ wins needed)",
        color=discord.Color.green()
    )

    # Bowl eligible (high probability)
    eligible = [t for t in bowl_candidates if float(t.get("BowlPct", 0)) >= 70]
    bubble = [t for t in bowl_candidates if 30 <= float(t.get("BowlPct", 0)) < 70]
    long_shot = [t for t in bowl_candidates if 0 < float(t.get("BowlPct", 0)) < 30]

    if eligible:
        lines = []
        for team in eligible[:10]:
            franchise_id = str(team.get("FranchiseID", "")).zfill(3)
            team_emoji = emoji_map.get(franchise_id, "")
            bowl_pct = float(team.get("BowlPct", 0))
            wins = int(team.get("CurrentWins", 0))
            losses = int(team.get("CurrentLosses", 0))
            lines.append(f"{team_emoji} **{team.get('TeamName')}** ({wins}-{losses}) - {bowl_pct:.0f}%")
        embed.add_field(name="✅ Likely Bowl Bound", value="\n".join(lines), inline=False)

    if bubble:
        lines = []
        for team in bubble[:10]:
            franchise_id = str(team.get("FranchiseID", "")).zfill(3)
            team_emoji = emoji_map.get(franchise_id, "")
            bowl_pct = float(team.get("BowlPct", 0))
            wins = int(team.get("CurrentWins", 0))
            losses = int(team.get("CurrentLosses", 0))
            lines.append(f"{team_emoji} **{team.get('TeamName')}** ({wins}-{losses}) - {bowl_pct:.0f}%")
        embed.add_field(name="⚠️ Bowl Bubble", value="\n".join(lines), inline=False)

    if long_shot:
        lines = []
        for team in long_shot[:10]:
            franchise_id = str(team.get("FranchiseID", "")).zfill(3)
            team_emoji = emoji_map.get(franchise_id, "")
            bowl_pct = float(team.get("BowlPct", 0))
            wins = int(team.get("CurrentWins", 0))
            losses = int(team.get("CurrentLosses", 0))
            lines.append(f"{team_emoji} **{team.get('TeamName')}** ({wins}-{losses}) - {bowl_pct:.0f}%")
        embed.add_field(name="❌ Long Shot", value="\n".join(lines), inline=False)

    embed.set_footer(text=f"Projections as of Week {week}")
    await interaction.followup.send(embed=embed)

@projections.command(name="team", description="Get detailed projections for a specific team")
@app_commands.describe(team_name="Team name to search for")
async def projections_team(interaction: discord.Interaction, team_name: str):
    await interaction.response.defer(ephemeral=True)

    if projections_ws is None:
        await interaction.followup.send("Projections sheet not found.")
        return

    year = get_current_year()
    data = get_projections_data(year)

    if not data:
        await interaction.followup.send(f"No projections data found for {year}.")
        return

    # Search for team
    search_lower = team_name.lower()
    team = None
    for t in data:
        if search_lower in t.get("TeamName", "").lower():
            team = t
            break
        if t.get("FranchiseID", "") == team_name or str(t.get("FranchiseID", "")).zfill(3) == team_name.zfill(3):
            team = t
            break

    if not team:
        await interaction.followup.send(f"Team '{team_name}' not found in projections.")
        return

    emoji_map = get_team_emoji_map()
    franchise_id = str(team.get("FranchiseID", "")).zfill(3)
    team_emoji = emoji_map.get(franchise_id, "")

    # Get conference emoji
    conference = team.get("Conference", "Unknown")
    conf_emoji = get_conference_emoji(conference)

    week = team.get("AsOfWeek", "?")
    playoff_pct = float(team.get("PlayoffPct", 0))
    bowl_pct = float(team.get("BowlPct", 0))
    conf_champ_pct = float(team.get("ConferenceChampPct", 0))

    embed = discord.Embed(
        title=f"{team_emoji} {team.get('TeamName', 'Unknown')} Projections",
        color=discord.Color.blue()
    )

    # Current standing
    wins = int(team.get("CurrentWins", 0))
    losses = int(team.get("CurrentLosses", 0))
    current_rank = int(team.get("CurrentRank", 0))

    embed.add_field(
        name="📊 Current Standing",
        value=f"**Rank:** #{current_rank}\n**Record:** {wins}-{losses}\n**Conference:** {conf_emoji} {conference}",
        inline=True
    )

    # Projections
    exp_wins = float(team.get("ExpectedFinalWins", 0))
    games_remaining = int(team.get("GamesRemaining", 0))
    proj_wins = float(team.get("ProjectedWins", 0))

    embed.add_field(
        name="🔮 Projected Final",
        value=f"**Exp. Wins:** {exp_wins:.1f}\n**Games Left:** {games_remaining}\n**Proj. Wins:** +{proj_wins:.1f}",
        inline=True
    )

    # Playoff probability
    pct_bar = format_pct_bar(playoff_pct, 10)
    path = team.get("PlayoffPath", "")
    embed.add_field(
        name="🏆 Playoff Probability",
        value=f"`{pct_bar}` **{playoff_pct:.1f}%**\n{path}",
        inline=False
    )

    # Conference championship
    if conf_champ_pct > 0:
        conf_bar = format_pct_bar(conf_champ_pct, 10)
        conf_rank = int(team.get("ConferenceRank", 0))
        embed.add_field(
            name=f"{conf_emoji} Conference Championship",
            value=f"`{conf_bar}` **{conf_champ_pct:.1f}%**\nConf. Rank: #{conf_rank}",
            inline=True
        )

    # Bowl probability (if not likely playoff team)
    if playoff_pct < 80:
        bowl_bar = format_pct_bar(bowl_pct, 10)
        embed.add_field(
            name="🎯 Bowl Eligibility",
            value=f"`{bowl_bar}` **{bowl_pct:.1f}%**",
            inline=True
        )

    embed.set_footer(text=f"Projections as of Week {week} | {year}")

    await interaction.followup.send(embed=embed, ephemeral=True)

@projections.command(name="my_team", description="Get your team's playoff/bowl projections")
async def projections_my_team(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    # Get user's team
    team_info = get_team_by_discord_id(interaction.user.id)
    if not team_info:
        await interaction.followup.send("You are not registered as a team owner.")
        return

    if projections_ws is None:
        await interaction.followup.send("Projections sheet not found.")
        return

    year = get_current_year()
    data = get_projections_data(year)

    if not data:
        await interaction.followup.send(f"No projections data found for {year}.")
        return

    # Find user's team
    franchise_id = str(team_info['id']).zfill(3) if team_info['id'] else ''
    team = None
    for t in data:
        if str(t.get("FranchiseID", "")).zfill(3) == franchise_id:
            team = t
            break

    if not team:
        await interaction.followup.send(f"Could not find projections for {team_info['name']}.")
        return

    emoji_map = get_team_emoji_map()
    team_emoji = emoji_map.get(franchise_id, "")

    # Get conference emoji
    conference = team.get("Conference", "Unknown")
    conf_emoji = get_conference_emoji(conference)

    week = team.get("AsOfWeek", "?")
    playoff_pct = float(team.get("PlayoffPct", 0))
    bowl_pct = float(team.get("BowlPct", 0))
    conf_champ_pct = float(team.get("ConferenceChampPct", 0))

    embed = discord.Embed(
        title=f"{team_emoji} {team.get('TeamName', 'Unknown')} - Your Projections",
        color=discord.Color.green()
    )

    # Current standing
    wins = int(team.get("CurrentWins", 0))
    losses = int(team.get("CurrentLosses", 0))
    current_rank = int(team.get("CurrentRank", 0))

    embed.add_field(
        name="📊 Current Standing",
        value=f"**Rank:** #{current_rank}\n**Record:** {wins}-{losses}\n**Conference:** {conf_emoji} {conference}",
        inline=True
    )

    # Projections
    exp_wins = float(team.get("ExpectedFinalWins", 0))
    games_remaining = int(team.get("GamesRemaining", 0))

    embed.add_field(
        name="🔮 Projected Final",
        value=f"**Expected Wins:** {exp_wins:.1f}\n**Games Remaining:** {games_remaining}",
        inline=True
    )

    # Playoff probability
    pct_bar = format_pct_bar(playoff_pct, 10)
    path = team.get("PlayoffPath", "")
    embed.add_field(
        name="🏆 Playoff Probability",
        value=f"`{pct_bar}` **{playoff_pct:.1f}%**\n{path}",
        inline=False
    )

    # Conference championship
    if conf_champ_pct > 0:
        conf_bar = format_pct_bar(conf_champ_pct, 10)
        embed.add_field(
            name=f"{conf_emoji} Conf. Championship",
            value=f"`{conf_bar}` **{conf_champ_pct:.1f}%**",
            inline=True
        )

    # Bowl probability
    if playoff_pct < 80:
        bowl_bar = format_pct_bar(bowl_pct, 10)
        embed.add_field(
            name="🎯 Bowl Eligibility",
            value=f"`{bowl_bar}` **{bowl_pct:.1f}%**",
            inline=True
        )

    embed.set_footer(text=f"Projections as of Week {week} | {year}")

    await interaction.followup.send(embed=embed, ephemeral=True)

@projections.command(name="conference", description="Show conference championship projections")
@app_commands.describe(conference="Conference name (ACC, B10, B12, P12, SEC)")
async def projections_conference(interaction: discord.Interaction, conference: str):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if projections_ws is None:
        await interaction.followup.send("Projections sheet not found.")
        return

    year = get_current_year()
    data = get_projections_data(year)

    if not data:
        await interaction.followup.send(f"No projections data found for {year}.")
        return

    # Filter to conference
    conf_upper = conference.upper()
    conf_teams = [t for t in data if t.get("Conference", "").upper() == conf_upper]

    if not conf_teams:
        await interaction.followup.send(f"No teams found in conference '{conference}'.")
        return

    # Sort by conference championship probability
    conf_teams.sort(key=lambda x: float(x.get("ConferenceChampPct", 0)), reverse=True)

    week = conf_teams[0].get("AsOfWeek", "?")
    emoji_map = get_team_emoji_map()
    conf_emoji = get_conference_emoji(conf_upper)

    embed = discord.Embed(
        title=f"{conf_emoji} {conf_upper} Championship Race - {year}",
        description=f"Conference championship projections as of Week {week}",
        color=discord.Color.gold()
    )

    lines = []
    for team in conf_teams:
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_emoji = emoji_map.get(franchise_id, "")
        champ_pct = float(team.get("ConferenceChampPct", 0))
        conf_rank = int(team.get("ConferenceRank", 0))
        wins = int(team.get("CurrentWins", 0))
        losses = int(team.get("CurrentLosses", 0))

        pct_bar = format_pct_bar(champ_pct, 8)
        line = f"`{conf_rank}.` {team_emoji} **{team.get('TeamName')}** ({wins}-{losses})\n"
        line += f"   `{pct_bar}` **{champ_pct:.1f}%**"
        lines.append(line)

    # Add all lines
    embed.add_field(
        name="Conference Standings",
        value="\n".join(lines[:15]) if lines else "No teams",
        inline=False
    )

    embed.set_footer(text=f"Conference champion gets automatic playoff bid")

    await interaction.followup.send(embed=embed)

@projections.command(name="standings", description="Show conference standings with tiebreakers")
@app_commands.describe(conference="Conference name (ACC, B10, B12, P12, SEC)")
async def projections_standings(interaction: discord.Interaction, conference: str):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if conference_standings_ws is None:
        await interaction.followup.send("Conference standings sheet not found. Run 'Calculate Projections' in Google Sheets first.")
        return

    year = get_current_year()

    # Get all data from sheet
    try:
        all_data = conference_standings_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading standings: {e}")
        return

    if not all_data:
        await interaction.followup.send(f"No standings data found. Run 'Calculate Projections' in Google Sheets first.")
        return

    # Filter to year and conference
    conf_upper = conference.upper()
    standings = [
        row for row in all_data
        if int(row.get("Year", 0)) == int(year) and row.get("Conference", "").upper() == conf_upper
    ]

    if not standings:
        await interaction.followup.send(f"No standings found for {conference} in {year}.")
        return

    # Sort by standing
    standings.sort(key=lambda x: int(x.get("Standing", 99)))

    week = standings[0].get("AsOfWeek", "?")
    emoji_map = get_team_emoji_map()
    conf_emoji = get_conference_emoji(conf_upper)

    embed = discord.Embed(
        title=f"{conf_emoji} {conf_upper} Standings - {year}",
        description=f"Conference standings as of Week {week}\nTop 2 teams advance to Conference Championship",
        color=discord.Color.blue()
    )

    lines = []
    for team in standings:
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_emoji = emoji_map.get(franchise_id, "")
        conf_wins = int(team.get("ConfWins", 0))
        conf_losses = int(team.get("ConfLosses", 0))
        standing = int(team.get("Standing", 0))
        ccg_bound = team.get("CCGBound") in [True, "TRUE", "true", 1]
        tiebreaker = team.get("Tiebreaker", "")
        all_play_pct = float(team.get("AllPlayPct", 0))
        total_pf = float(team.get("TotalPF", 0))
        national_rank = int(team.get("NationalRank", 99))

        ccg_icon = "📍" if ccg_bound else "  "
        tb_text = f" `[{tiebreaker}]`" if tiebreaker else ""

        # Compact tiebreaker stats
        all_play_str = f"{all_play_pct*100:.0f}%" if all_play_pct > 0 else "-"
        pf_int = int(total_pf) if total_pf > 0 else 0
        stats = f" `{all_play_str}|{pf_int}|#{national_rank}`"

        line = f"`{ccg_icon}{standing:2}.` {team_emoji} **{team.get('TeamName')}** ({conf_wins}-{conf_losses}){tb_text}{stats}"
        lines.append(line)

    # Split into multiple fields if content exceeds Discord's 1024 char limit
    if lines:
        current_chunk = []
        current_length = 0
        field_num = 1

        for line in lines:
            line_length = len(line) + 1  # +1 for newline
            if current_length + line_length > 1000 and current_chunk:  # Leave buffer
                embed.add_field(
                    name="Standings" if field_num == 1 else "Standings (cont.)",
                    value="\n".join(current_chunk),
                    inline=False
                )
                current_chunk = [line]
                current_length = line_length
                field_num += 1
            else:
                current_chunk.append(line)
                current_length += line_length

        # Add remaining lines
        if current_chunk:
            embed.add_field(
                name="Standings" if field_num == 1 else "Standings (cont.)",
                value="\n".join(current_chunk),
                inline=False
            )
    else:
        embed.add_field(name="Standings", value="No teams", inline=False)

    embed.set_footer(text="📍 = CCG bound | Stats: All-Play%|TotalPF|NatRank | Tiebreakers: H2H → AP% → PF → Rank")

    await interaction.followup.send(embed=embed)

@projections.command(name="ccg", description="Show all projected Conference Championship matchups")
async def projections_ccg(interaction: discord.Interaction):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if conference_standings_ws is None:
        await interaction.followup.send("Conference standings sheet not found. Run 'Calculate Projections' in Google Sheets first.")
        return

    year = get_current_year()

    # Get all data from sheet
    try:
        all_data = conference_standings_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading standings: {e}")
        return

    if not all_data:
        await interaction.followup.send(f"No standings data found. Run 'Calculate Projections' in Google Sheets first.")
        return

    # Filter to year and CCG-bound teams
    ccg_teams = [
        row for row in all_data
        if int(row.get("Year", 0)) == int(year) and row.get("CCGBound") in [True, "TRUE", "true", 1]
    ]

    if not ccg_teams:
        await interaction.followup.send(f"No CCG matchups found for {year}.")
        return

    week = ccg_teams[0].get("AsOfWeek", "?")
    emoji_map = get_team_emoji_map()

    embed = discord.Embed(
        title=f"🏆 Projected Conference Championships - {year}",
        description=f"As of Week {week}\nWinners receive automatic playoff bid",
        color=discord.Color.gold()
    )

    # Group by conference
    conf_order = ["ACC", "B10", "B12", "P12", "SEC"]
    for conf in conf_order:
        conf_teams = [t for t in ccg_teams if t.get("Conference") == conf]
        conf_teams.sort(key=lambda x: int(x.get("Standing", 99)))

        if len(conf_teams) >= 2:
            t1 = conf_teams[0]
            t2 = conf_teams[1]

            t1_id = str(t1.get("FranchiseID", "")).zfill(3)
            t2_id = str(t2.get("FranchiseID", "")).zfill(3)
            t1_emoji = emoji_map.get(t1_id, "")
            t2_emoji = emoji_map.get(t2_id, "")

            t1_record = f"({t1.get('ConfWins', 0)}-{t1.get('ConfLosses', 0)})"
            t2_record = f"({t2.get('ConfWins', 0)}-{t2.get('ConfLosses', 0)})"

            t1_tb = f" [{t1.get('Tiebreaker')}]" if t1.get('Tiebreaker') else ""
            t2_tb = f" [{t2.get('Tiebreaker')}]" if t2.get('Tiebreaker') else ""

            conf_emoji = get_conference_emoji(conf)
            matchup = f"#1 {t1_emoji} **{t1.get('TeamName')}** {t1_record}{t1_tb}\nvs\n#2 {t2_emoji} **{t2.get('TeamName')}** {t2_record}{t2_tb}"

            embed.add_field(
                name=f"{conf_emoji} {conf} Championship",
                value=matchup,
                inline=False
            )
        elif len(conf_teams) == 1:
            t1 = conf_teams[0]
            t1_id = str(t1.get("FranchiseID", "")).zfill(3)
            t1_emoji = emoji_map.get(t1_id, "")
            conf_emoji = get_conference_emoji(conf)
            embed.add_field(
                name=f"{conf_emoji} {conf} Championship",
                value=f"#1 {t1_emoji} **{t1.get('TeamName')}** vs TBD",
                inline=False
            )

    embed.set_footer(text="Tiebreakers: Conf Record → H2H → All-Play% → PF → National Rank")

    await interaction.followup.send(embed=embed)

# ----------------- Devy Draft Helper Functions -----------------

def check_devy_channel(interaction: discord.Interaction, conference: str) -> tuple[bool, str]:
    """Check if the command is being run in the correct devy channel for the conference.

    Returns:
        tuple: (is_valid, error_message)
        - is_valid: True if channel is correct or no restriction configured
        - error_message: Error message to show if channel is wrong
    """
    conference_upper = conference.upper() if conference else None
    if not conference_upper:
        return True, ""

    expected_channel_id = DEVY_CHANNEL_IDS.get(conference_upper, 0)

    # If no devy channel configured for this conference, allow any channel
    if expected_channel_id == 0:
        return True, ""

    current_channel_id = interaction.channel_id

    if current_channel_id != expected_channel_id:
        return False, f"❌ {conference_upper} devy commands must be run in <#{expected_channel_id}>."

    return True, ""


def get_devy_channel_for_conference(conference: str) -> int:
    """Get the devy channel ID for a conference."""
    return DEVY_CHANNEL_IDS.get(conference.upper(), 0) if conference else 0


def get_devy_draft_setting(key: str):
    """Get a setting value from DevyDraftSettings sheet."""
    if devy_draft_settings_ws is None:
        return None
    try:
        data = devy_draft_settings_ws.get_all_records(expected_headers=[])
        for row in data:
            if row.get("SettingKey") == key:
                return row.get("SettingValue")
        return None
    except Exception as e:
        print(f"Error getting devy draft setting: {e}")
        return None

def set_devy_draft_setting(key: str, value):
    """Set a setting value in DevyDraftSettings sheet."""
    if devy_draft_settings_ws is None:
        return False
    try:
        data = devy_draft_settings_ws.get_all_records(expected_headers=[])
        for idx, row in enumerate(data, start=2):
            if row.get("SettingKey") == key:
                devy_draft_settings_ws.update_cell(idx, 2, value)
                return True
        # Key not found, add new row
        devy_draft_settings_ws.append_row([key, value])
        return True
    except Exception as e:
        print(f"Error setting devy draft setting: {e}")
        return False

def get_available_devy_players(conference: str = None):
    """Get list of available (undrafted) devy players for a specific conference.

    Players are conference-specific - each conference has their own copy of players.
    """
    if devy_player_pool_ws is None:
        return []
    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        players = []
        for row in data:
            # Check if available (not drafted, status is Available or Retained)
            status = row.get("Status", "Available")
            drafted = row.get("Drafted", "No")
            row_conference = row.get("Conference", "")

            is_available = (status in ["Available", "Retained"]) and drafted != "Yes"
            matches_conference = (not conference) or (row_conference == conference)

            if is_available and matches_conference:
                players.append({
                    "playerId": row.get("PlayerID"),
                    "conference": row_conference,
                    "playerName": row.get("PlayerName"),  # MFL format: "LastName, FirstName"
                    "firstName": row.get("FirstName"),
                    "lastName": row.get("LastName"),
                    "position": row.get("Position"),
                    "year": row.get("Year"),
                    "status": status,
                    "retainedBy": row.get("RetainedBy") or None
                })
        return players
    except Exception as e:
        print(f"Error getting available devy players: {e}")
        return []

def search_devy_players(search_term: str, conference: str = None):
    """Search available players by name or position within a conference."""
    players = get_available_devy_players(conference)
    term = search_term.lower()
    return [
        p for p in players
        if term in p["firstName"].lower() or
           term in p["lastName"].lower() or
           term in p["position"].lower() or
           term in f"{p['firstName']} {p['lastName']}".lower()
    ]

def get_team_devy_roster(franchise_id: str, conference: str = None):
    """Get all devy players owned by a franchise (drafted or retained).

    Returns players that are either:
    - Status = 'Drafted' and DraftedBy = franchise_id
    - Status = 'Retained' and RetainedBy = franchise_id
    """
    if devy_player_pool_ws is None:
        return []
    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        normalized_id = str(franchise_id).zfill(3)
        players = []

        for row in data:
            status = row.get("Status", "")
            drafted_by = str(row.get("DraftedBy", "")).zfill(3) if row.get("DraftedBy") else ""
            retained_by = str(row.get("RetainedBy", "")).zfill(3) if row.get("RetainedBy") else ""
            row_conference = row.get("Conference", "")

            # Check if this player belongs to the franchise
            is_owned = False
            if status == "Drafted" and drafted_by == normalized_id:
                is_owned = True
            elif status == "Retained" and retained_by == normalized_id:
                is_owned = True

            # Filter by conference if provided
            matches_conference = (not conference) or (row_conference == conference)

            if is_owned and matches_conference:
                players.append({
                    "playerId": row.get("PlayerID"),
                    "conference": row_conference,
                    "playerName": row.get("PlayerName"),  # MFL format: "LastName, FirstName"
                    "firstName": row.get("FirstName"),
                    "lastName": row.get("LastName"),
                    "position": row.get("Position"),
                    "year": row.get("Year"),
                    "status": status,
                    "draftYear": row.get("DraftYear"),
                    "retentionYear": row.get("RetentionYear") or None
                })
        return players
    except Exception as e:
        print(f"Error getting team devy roster: {e}")
        return []

def count_devy_retentions(player_id: str, franchise_id: str, year):
    """Count existing RETAIN rows in DevyRetentionHistory.

    A blank Decision on legacy rows is treated as RETAIN for back-compat.
    Returns (player_prior_retentions, team_retentions_this_year).
    """
    if devy_retention_history_ws is None:
        return 0, 0
    normalized_id = str(franchise_id).zfill(3)
    player_prior = 0
    team_this_year = 0
    try:
        for r in devy_retention_history_ws.get_all_records(expected_headers=[]):
            decision = str(r.get("Decision") or "RETAIN").upper()
            if decision != "RETAIN":
                continue
            if r.get("PlayerID") == player_id:
                player_prior += 1
            if (str(r.get("FranchiseID", "")).zfill(3) == normalized_id and
                    str(r.get("Year")) == str(year)):
                team_this_year += 1
    except Exception as e:
        print(f"Could not read DevyRetentionHistory for counts: {e}")
    return player_prior, team_this_year


def log_devy_retention(player_id: str, conference: str, franchise_id: str,
                       first_name: str, last_name: str, position: str,
                       retention_year: int, decision: str = "RETAIN"):
    """Append one row to DevyRetentionHistory for a retain/release decision.

    Centralizes field order + rebate math so live rows match the backfill importer
    (BackfillDevyHistory.gs): BaseRebate $20, decreasing $5 per consecutive retention
    year, floored at 0. The first retention a team makes in a year spends Round 2, the
    second spends Round 1. RELEASE rows are decision-only (blank rebate/pick fields).
    """
    if devy_retention_history_ws is None:
        return

    normalized_id = str(franchise_id).zfill(3)
    decision = (decision or "RETAIN").upper()

    consecutive_year = ""
    pick_used = ""
    base_rebate = ""
    rebate_remaining = ""
    if decision == "RETAIN":
        player_prior, team_this_year = count_devy_retentions(player_id, normalized_id, retention_year)
        consecutive_year = player_prior + 1
        # 1st retention of the year -> Round 2, 2nd -> Round 1
        pick_used = "Round 2" if team_this_year == 0 else "Round 1"
        base_rebate = 20
        rebate_remaining = max(0, base_rebate - 5 * (consecutive_year - 1))

    # Resolve TeamName from the franchise lookup (same pattern as devy_retention_start)
    team_name = ""
    try:
        for t in teams_ws.get_all_records(expected_headers=[]):
            if str(t.get("Franchise ID", "")).zfill(3) == normalized_id:
                team_name = t.get("Team Name", "")
                break
    except Exception as e:
        print(f"Could not resolve team name for franchise {normalized_id}: {e}")

    player_name_mfl = f"{last_name}, {first_name}"
    timestamp = datetime.utcnow().isoformat()

    # Order must match DEVY_RETENTION_HISTORY_HEADERS in DevyDraft.gs
    full_row = [
        retention_year,        # Year
        conference,
        normalized_id,         # FranchiseID
        team_name,
        player_id,
        player_name_mfl,       # MFL format for matching with RookieLedger
        first_name,
        last_name,
        position,
        consecutive_year,      # ConsecutiveYear
        pick_used,             # PickUsed (Round 2 then Round 1)
        base_rebate,           # BaseRebate
        rebate_remaining,      # RebateRemaining
        "",                    # IsRookie - populated by IMPORTRANGE formula
        timestamp,             # Timestamp
        decision,              # Decision (RETAIN / RELEASE)
    ]

    # Upsert: one row per (PlayerID, Year). If the retention window seeded a PENDING
    # row for this player/year, update it in place (keeps the worklist tidy in the
    # sheet); otherwise append.
    try:
        records = devy_retention_history_ws.get_all_records(expected_headers=[])
    except Exception as e:
        print(f"Could not read DevyRetentionHistory for upsert: {e}")
        records = []

    target_row = None
    for idx, r in enumerate(records, start=2):
        if r.get("PlayerID") == player_id and str(r.get("Year")) == str(retention_year):
            target_row = idx
            break

    if target_row is None:
        devy_retention_history_ws.append_row(full_row)
        return

    # Update the decision-related cells on the existing row (leave identity cells).
    header = devy_retention_history_ws.row_values(1)
    updates = {
        "TeamName": team_name,
        "ConsecutiveYear": consecutive_year,
        "PickUsed": pick_used,
        "BaseRebate": base_rebate,
        "RebateRemaining": rebate_remaining,
        "Timestamp": timestamp,
        "Decision": decision,
    }
    for name, val in updates.items():
        if name in header:
            devy_retention_history_ws.update_cell(target_row, header.index(name) + 1, val)


def retain_devy_player(player_id: str, franchise_id: str, retention_year: int):
    """Retain a devy player for a franchise.

    The player must currently be owned by the franchise (status=Drafted or Retained).
    """
    if devy_player_pool_ws is None:
        return {"success": False, "message": "Devy player pool sheet not configured"}

    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        normalized_id = str(franchise_id).zfill(3)

        for idx, row in enumerate(data, start=2):
            if row.get("PlayerID") == player_id:
                status = row.get("Status", "")
                drafted_by = str(row.get("DraftedBy", "")).zfill(3) if row.get("DraftedBy") else ""
                retained_by = str(row.get("RetainedBy", "")).zfill(3) if row.get("RetainedBy") else ""

                # Verify ownership
                owns_player = False
                if status == "Drafted" and drafted_by == normalized_id:
                    owns_player = True
                elif status == "Retained" and retained_by == normalized_id:
                    owns_player = True

                if not owns_player:
                    return {"success": False, "message": "You don't own this player"}

                if status == "EnteredNFL":
                    return {"success": False, "message": "This player has entered the NFL and cannot be retained"}

                # Enforce the 2-per-team-per-year cap BEFORE flipping the pool status.
                _, team_this_year = count_devy_retentions(player_id, normalized_id, retention_year)
                if team_this_year >= 2:
                    return {"success": False, "message": f"Retention limit reached: a team may retain at most 2 players per year ({retention_year})."}

                player_name = f"{row.get('FirstName')} {row.get('LastName')}"

                # Update to retained status
                # Columns: 1=PlayerID, 2=Conference, 3=PlayerName, 4=FirstName, 5=LastName, 6=Position, 7=Year, 8=Status, 9=Drafted, 10=DraftedBy, 11=DraftYear, 12=RetainedBy, 13=RetentionYear
                devy_player_pool_ws.update_cell(idx, 8, "Retained")  # Status
                devy_player_pool_ws.update_cell(idx, 12, normalized_id)  # RetainedBy
                devy_player_pool_ws.update_cell(idx, 13, retention_year)  # RetentionYear

                # Log the retention to DevyRetentionHistory (rebate ledger).
                # Wrapped so a logging failure never blocks the retention itself,
                # which already succeeded above. Mirrors the backfill rebate math.
                try:
                    log_devy_retention(
                        player_id=player_id,
                        conference=row.get("Conference", ""),
                        franchise_id=normalized_id,
                        first_name=row.get("FirstName", ""),
                        last_name=row.get("LastName", ""),
                        position=row.get("Position", ""),
                        retention_year=retention_year,
                        decision="RETAIN",
                    )
                except Exception as log_err:
                    print(f"Failed to log devy retention for {player_id}: {log_err}")

                return {
                    "success": True,
                    "message": f"**{player_name}** has been retained for {retention_year}",
                    "playerName": player_name,
                    "position": row.get("Position")
                }

        return {"success": False, "message": "Player not found"}
    except Exception as e:
        print(f"Error retaining devy player: {e}")
        return {"success": False, "message": f"Error: {str(e)}"}

def release_devy_player(player_id: str, franchise_id: str, decision_year=None):
    """Release an owned devy player back to the available pool.

    "Release" = the owner is not keeping this player. Works for a player in either
    Drafted or Retained status; both return to the pool for the coming draft. A
    Decision=RELEASE row is logged to DevyRetentionHistory for the audit.
    """
    if devy_player_pool_ws is None:
        return {"success": False, "message": "Devy player pool sheet not configured"}

    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        normalized_id = str(franchise_id).zfill(3)

        for idx, row in enumerate(data, start=2):
            if row.get("PlayerID") == player_id:
                status = row.get("Status", "")
                retained_by = str(row.get("RetainedBy", "")).zfill(3) if row.get("RetainedBy") else ""
                drafted_by = str(row.get("DraftedBy", "")).zfill(3) if row.get("DraftedBy") else ""

                # Only owned players (Drafted or Retained) can be released.
                if status not in ("Retained", "Drafted"):
                    return {"success": False, "message": "This player is not currently owned (must be Drafted or Retained to release)"}

                owner = retained_by if status == "Retained" else drafted_by
                if owner != normalized_id:
                    return {"success": False, "message": "You don't own this player"}

                player_name = f"{row.get('FirstName')} {row.get('LastName')}"

                # Update to available status
                # Columns: 1=PlayerID, 2=Conference, 3=PlayerName, 4=FirstName, 5=LastName, 6=Position, 7=Year, 8=Status, 9=Drafted, 10=DraftedBy, 11=DraftYear, 12=RetainedBy, 13=RetentionYear
                devy_player_pool_ws.update_cell(idx, 8, "Available")  # Status
                devy_player_pool_ws.update_cell(idx, 9, "No")  # Drafted
                devy_player_pool_ws.update_cell(idx, 10, "")  # DraftedBy
                devy_player_pool_ws.update_cell(idx, 11, "")  # DraftYear
                devy_player_pool_ws.update_cell(idx, 12, "")  # RetainedBy
                devy_player_pool_ws.update_cell(idx, 13, "")  # RetentionYear

                # Log the RELEASE decision (audit). Wrapped so it never blocks the release.
                year = decision_year or get_devy_draft_setting("DraftYear")
                try:
                    log_devy_retention(
                        player_id=player_id,
                        conference=row.get("Conference", ""),
                        franchise_id=normalized_id,
                        first_name=row.get("FirstName", ""),
                        last_name=row.get("LastName", ""),
                        position=row.get("Position", ""),
                        retention_year=year,
                        decision="RELEASE",
                    )
                except Exception as log_err:
                    print(f"Failed to log devy release for {player_id}: {log_err}")

                return {
                    "success": True,
                    "message": f"**{player_name}** has been released back to the available pool",
                    "playerName": player_name,
                    "position": row.get("Position")
                }

        return {"success": False, "message": "Player not found"}
    except Exception as e:
        print(f"Error releasing devy player: {e}")
        return {"success": False, "message": f"Error: {str(e)}"}

def get_all_retained_players(conference: str = None):
    """Get all retained players, optionally filtered by conference."""
    if devy_player_pool_ws is None:
        return []
    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        players = []

        for row in data:
            if row.get("Status") == "Retained":
                row_conference = row.get("Conference", "")
                if (not conference) or (row_conference == conference):
                    players.append({
                        "playerId": row.get("PlayerID"),
                        "conference": row_conference,
                        "firstName": row.get("FirstName"),
                        "lastName": row.get("LastName"),
                        "position": row.get("Position"),
                        "year": row.get("Year"),
                        "retainedBy": str(row.get("RetainedBy", "")).zfill(3),
                        "retentionYear": row.get("RetentionYear")
                    })
        return players
    except Exception as e:
        print(f"Error getting retained players: {e}")
        return []

def get_current_devy_pick(conference: str):
    """Get current pick information for a conference."""
    if devy_draft_settings_ws is None or devy_draft_order_ws is None:
        return None

    status = get_devy_draft_setting("DraftStatus")
    if status != "in_progress":
        return None

    current_conf = get_devy_draft_setting("CurrentConference")
    if current_conf != conference:
        return None

    draft_year = get_devy_draft_setting("DraftYear")
    current_round = int(get_devy_draft_setting("CurrentRound") or 1)
    current_pick = int(get_devy_draft_setting("CurrentPick") or 1)

    try:
        order_data = devy_draft_order_ws.get_all_records(expected_headers=[])
        for row in order_data:
            if (row.get("Year") == int(draft_year) and
                row.get("Conference") == conference and
                row.get("Round") == current_round and
                row.get("Pick") == current_pick):
                return {
                    "franchiseId": str(row.get("FranchiseID")).zfill(3),
                    "teamName": row.get("TeamName"),
                    "round": current_round,
                    "pick": current_pick,
                    "overallPick": row.get("OverallPick"),
                    "pickDeadline": get_devy_draft_setting("CurrentPickDeadline")
                }
        return None
    except Exception as e:
        print(f"Error getting current devy pick: {e}")
        return None

def get_devy_draft_order_with_status(conference: str, year: int):
    """Get draft order with pick completion status."""
    if devy_draft_order_ws is None or devy_draft_history_ws is None:
        return []

    try:
        order_data = devy_draft_order_ws.get_all_records(expected_headers=[])
        history_data = devy_draft_history_ws.get_all_records(expected_headers=[])

        # Build set of completed picks
        completed_picks = set()
        pick_details = {}
        for row in history_data:
            if row.get("Year") == year and row.get("Conference") == conference:
                key = f"{row.get('Round')}-{row.get('Pick')}"
                completed_picks.add(key)
                pick_details[key] = {
                    "playerName": f"{row.get('PlayerFirstName')} {row.get('PlayerLastName')}",
                    "position": row.get("PlayerPosition")
                }

        result = []
        for row in order_data:
            if row.get("Year") == year and row.get("Conference") == conference:
                pick_key = f"{row.get('Round')}-{row.get('Pick')}"
                details = pick_details.get(pick_key, {})
                result.append({
                    "round": row.get("Round"),
                    "pick": row.get("Pick"),
                    "overallPick": row.get("OverallPick"),
                    "franchiseId": str(row.get("FranchiseID")).zfill(3),
                    "teamName": row.get("TeamName"),
                    "completed": pick_key in completed_picks,
                    "playerSelected": details.get("playerName"),
                    "playerPosition": details.get("position")
                })

        return sorted(result, key=lambda x: x["overallPick"])
    except Exception as e:
        print(f"Error getting devy draft order: {e}")
        return []

def make_devy_pick(conference: str, franchise_id: str, player_id: str, manual_entry: dict = None):
    """Make a devy draft pick.

    Players are conference-specific - only players from the draft's conference can be selected.
    If the player is not found in the pool and manual_entry is provided (with first_name, last_name, position),
    the pick is recorded with those details (no pool row update).
    Updated column structure: PlayerID, Conference, FirstName, LastName, Position, Year, Status, Drafted, DraftedBy, DraftYear, RetainedBy, RetentionYear
    """
    if not all([devy_draft_settings_ws, devy_draft_order_ws, devy_draft_history_ws, devy_player_pool_ws]):
        return {"success": False, "message": "Devy draft sheets not configured"}

    # Validate draft is in progress
    status = get_devy_draft_setting("DraftStatus")
    if status != "in_progress":
        return {"success": False, "message": "Draft is not in progress"}

    current_conf = get_devy_draft_setting("CurrentConference")
    if current_conf != conference:
        return {"success": False, "message": f"Draft is currently running for {current_conf}, not {conference}"}

    # Get current pick
    current_pick_info = get_current_devy_pick(conference)
    if not current_pick_info:
        return {"success": False, "message": "Could not determine current pick"}

    # Validate it's this team's turn
    normalized_id = str(franchise_id).zfill(3)
    if current_pick_info["franchiseId"] != normalized_id:
        return {"success": False, "message": f"It's not your turn. Currently on the clock: {current_pick_info['teamName']}"}

    # Find and validate player
    try:
        pool_data = devy_player_pool_ws.get_all_records(expected_headers=[])
        player = None
        player_row = None

        # First pass: try matching by PlayerID (from autocomplete)
        for idx, row in enumerate(pool_data, start=2):
            if str(row.get("PlayerID")) == str(player_id):
                player = row
                player_row = idx
                break

        # Second pass: try matching by name if PlayerID didn't match (manual entry)
        if not player:
            search_term = player_id.lower().strip()
            for idx, row in enumerate(pool_data, start=2):
                # Match against "LastName, FirstName" (MFL format) or "FirstName LastName"
                mfl_name = f"{row.get('LastName', '')}, {row.get('FirstName', '')}".lower()
                full_name = f"{row.get('FirstName', '')} {row.get('LastName', '')}".lower()
                player_name_col = str(row.get("PlayerName", "")).lower()

                if search_term in (mfl_name, full_name, player_name_col):
                    player = row
                    player_row = idx
                    break

        if not player:
            # Player not in pool - check for manual entry fallback
            if manual_entry and manual_entry.get("first_name") and manual_entry.get("last_name") and manual_entry.get("position"):
                first_name = manual_entry["first_name"]
                last_name = manual_entry["last_name"]
                position = manual_entry["position"]

                draft_year = int(get_devy_draft_setting("DraftYear"))
                timestamp = datetime.now().isoformat()
                # Conference-scoped, non-KTC id so a pool refresh won't erase this write-in.
                manual_id = f"{conference}_MANUAL_{last_name}_{first_name}".replace(" ", "")

                # Record pick in history with manual details
                devy_draft_history_ws.append_row([
                    draft_year,
                    conference,
                    current_pick_info["round"],
                    current_pick_info["pick"],
                    current_pick_info["overallPick"],
                    normalized_id,
                    current_pick_info["teamName"],
                    manual_id,
                    first_name,
                    last_name,
                    position,
                    timestamp
                ])

                # Also add the write-in to DevyPlayerPool (Status=Drafted) so they
                # enter the retention cycle. The non-KTC id survives KTC refreshes.
                try:
                    devy_player_pool_ws.append_row([
                        manual_id,
                        conference,
                        f"{last_name}, {first_name}",  # PlayerName (MFL format)
                        first_name,
                        last_name,
                        position,
                        "",                # Year (unknown for a write-in)
                        "Drafted",         # Status
                        "Yes",             # Drafted
                        normalized_id,     # DraftedBy
                        draft_year,        # DraftYear
                        "",                # RetainedBy
                        ""                 # RetentionYear
                    ])
                except Exception as pool_err:
                    print(f"Write-in pool add failed for {manual_id}: {pool_err}")

                # Advance draft
                advance_result = advance_devy_draft(conference)

                return {
                    "success": True,
                    "message": f"{current_pick_info['teamName']} selected {first_name} {last_name} ({position}) *(manual entry - not in pool)*",
                    "pick": {
                        "round": current_pick_info["round"],
                        "pick": current_pick_info["pick"],
                        "player": f"{first_name} {last_name}",
                        "position": position
                    },
                    "draftComplete": advance_result.get("draftComplete", False),
                    "nextPick": advance_result.get("nextPick")
                }
            else:
                return {
                    "success": False,
                    "message": "Player not found in pool. Use the `first_name`, `last_name`, and `position` options to manually enter a player not in the pool."
                }

        # Validate player is available
        if player.get("Drafted") == "Yes":
            return {"success": False, "message": "Player has already been drafted"}

        # Validate player belongs to this conference
        player_conf = player.get("Conference", "")
        if player_conf != conference:
            return {"success": False, "message": f"Player belongs to {player_conf} conference, not {conference}"}

        # Check status is available or retained
        player_status = player.get("Status", "Available")
        if player_status not in ["Available", "Retained"]:
            return {"success": False, "message": f"Player is not available (status: {player_status})"}

        draft_year = int(get_devy_draft_setting("DraftYear"))
        timestamp = datetime.now().isoformat()

        # Record pick in history
        devy_draft_history_ws.append_row([
            draft_year,
            conference,
            current_pick_info["round"],
            current_pick_info["pick"],
            current_pick_info["overallPick"],
            normalized_id,
            current_pick_info["teamName"],
            player_id,
            player.get("FirstName"),
            player.get("LastName"),
            player.get("Position"),
            timestamp
        ])

        # Mark player as drafted (updated column positions for new schema with PlayerName column)
        # Columns: 1=PlayerID, 2=Conference, 3=PlayerName, 4=FirstName, 5=LastName, 6=Position, 7=Year, 8=Status, 9=Drafted, 10=DraftedBy, 11=DraftYear, 12=RetainedBy, 13=RetentionYear
        devy_player_pool_ws.update_cell(player_row, 8, "Drafted")  # Status column
        devy_player_pool_ws.update_cell(player_row, 9, "Yes")  # Drafted column
        devy_player_pool_ws.update_cell(player_row, 10, normalized_id)  # DraftedBy
        devy_player_pool_ws.update_cell(player_row, 11, draft_year)  # DraftYear

        # Advance draft
        advance_result = advance_devy_draft(conference)

        return {
            "success": True,
            "message": f"{current_pick_info['teamName']} selected {player.get('FirstName')} {player.get('LastName')} ({player.get('Position')})",
            "pick": {
                "round": current_pick_info["round"],
                "pick": current_pick_info["pick"],
                "player": f"{player.get('FirstName')} {player.get('LastName')}",
                "position": player.get("Position")
            },
            "draftComplete": advance_result.get("draftComplete", False),
            "nextPick": advance_result.get("nextPick")
        }
    except Exception as e:
        print(f"Error making devy pick: {e}")
        return {"success": False, "message": f"Error: {str(e)}"}

def get_filled_devy_slots(year, conference):
    """Set of "round-pick" slot keys already filled in DevyDraftHistory for a
    year/conference. A slot is "consumed" if a history row exists for it — whether
    from a retention pre-fill or an already-made live pick."""
    filled = set()
    if devy_draft_history_ws is None:
        return filled
    try:
        for row in devy_draft_history_ws.get_all_records(expected_headers=[]):
            if str(row.get("Year")) == str(year) and row.get("Conference") == conference:
                filled.add(f"{row.get('Round')}-{row.get('Pick')}")
    except Exception as e:
        print(f"Error reading filled devy slots: {e}")
    return filled


def advance_devy_draft(conference: str):
    """Advance to the next pick in the draft."""
    draft_year = int(get_devy_draft_setting("DraftYear"))
    current_round = int(get_devy_draft_setting("CurrentRound") or 1)
    current_pick = int(get_devy_draft_setting("CurrentPick") or 1)

    try:
        order_data = devy_draft_order_ws.get_all_records(expected_headers=[])

        # Get all picks for this conference/year sorted by overall pick
        conf_picks = sorted(
            [r for r in order_data if r.get("Year") == draft_year and r.get("Conference") == conference],
            key=lambda x: x.get("OverallPick", 0)
        )

        # Find current pick index
        current_idx = None
        for i, row in enumerate(conf_picks):
            if row.get("Round") == current_round and row.get("Pick") == current_pick:
                current_idx = i
                break

        # Skip forward over slots already consumed by a retention (or prior pick).
        filled = get_filled_devy_slots(draft_year, conference)
        next_idx = (current_idx + 1) if current_idx is not None else len(conf_picks)
        while next_idx < len(conf_picks):
            cand = conf_picks[next_idx]
            if f"{cand.get('Round')}-{cand.get('Pick')}" not in filled:
                break
            next_idx += 1

        if current_idx is None or next_idx >= len(conf_picks):
            # Draft complete
            set_devy_draft_setting("DraftStatus", "completed")
            set_devy_draft_setting("CurrentPickDeadline", "")
            return {"draftComplete": True, "message": f"Devy draft complete for {conference}"}

        # Move to next open pick
        next_pick_row = conf_picks[next_idx]
        set_devy_draft_setting("CurrentRound", str(next_pick_row.get("Round")))
        set_devy_draft_setting("CurrentPick", str(next_pick_row.get("Pick")))

        # Reset pick deadline (24 hours)
        deadline_hours = int(get_devy_draft_setting("PickDeadlineHours") or 24)
        deadline = datetime.now()
        deadline = deadline.replace(hour=deadline.hour + deadline_hours)
        set_devy_draft_setting("CurrentPickDeadline", deadline.isoformat())

        return {
            "draftComplete": False,
            "nextPick": {
                "round": next_pick_row.get("Round"),
                "pick": next_pick_row.get("Pick"),
                "franchiseId": str(next_pick_row.get("FranchiseID")).zfill(3),
                "teamName": next_pick_row.get("TeamName")
            }
        }
    except Exception as e:
        print(f"Error advancing devy draft: {e}")
        return {"draftComplete": False, "error": str(e)}


def apply_retentions_to_draft(draft_year, conferences=None):
    """Pre-fill retained players into the coming draft's DevyDraftHistory at the slot
    their retention consumed (Round 2 for the team's first retention, Round 1 for the
    second). Run AFTER the draft order exists and the retention window closes.
    Idempotent: a slot that already has a history row is left untouched.

    Row layout matches make_devy_pick so retained and live-pick rows are consistent.
    """
    if devy_retention_history_ws is None or devy_draft_order_ws is None or devy_draft_history_ws is None:
        return {"success": False, "message": "Devy sheets not configured"}

    year = int(draft_year)
    conf_filter = [c.upper() for c in conferences] if conferences else None

    try:
        order_data = devy_draft_order_ws.get_all_records(expected_headers=[])
    except Exception as e:
        return {"success": False, "message": f"Error reading draft order: {e}"}

    # Order lookup: "conf|round|franchise" -> {pick, overallPick, teamName}
    order_lookup = {}
    for row in order_data:
        if row.get("Year") != year:
            continue
        key = f"{row.get('Conference')}|{row.get('Round')}|{str(row.get('FranchiseID')).zfill(3)}"
        order_lookup[key] = {
            "pick": row.get("Pick"),
            "overallPick": row.get("OverallPick"),
            "teamName": row.get("TeamName"),
        }

    try:
        ret_data = devy_retention_history_ws.get_all_records(expected_headers=[])
    except Exception as e:
        return {"success": False, "message": f"Error reading retention history: {e}"}

    filled_by_conf = {}
    applied, skipped = [], []
    timestamp = datetime.now().isoformat()

    for row in ret_data:
        if row.get("Year") != year:
            continue
        if str(row.get("Decision") or "RETAIN").upper() != "RETAIN":
            continue
        conference = row.get("Conference")
        if conf_filter and str(conference).upper() not in conf_filter:
            continue

        franchise_id = str(row.get("FranchiseID")).zfill(3)
        round_num = 1 if "1" in str(row.get("PickUsed")) else 2
        slot = order_lookup.get(f"{conference}|{round_num}|{franchise_id}")
        player_name = row.get("PlayerName")
        if not slot:
            skipped.append(f"{player_name} ({conference}): no Round {round_num} slot in order")
            continue

        if conference not in filled_by_conf:
            filled_by_conf[conference] = get_filled_devy_slots(year, conference)
        slot_key = f"{round_num}-{slot['pick']}"
        if slot_key in filled_by_conf[conference]:
            skipped.append(f"{player_name} ({conference}): slot {slot_key} already filled")
            continue

        # Append matching make_devy_pick's column layout
        devy_draft_history_ws.append_row([
            year,
            conference,
            round_num,
            slot["pick"],
            slot["overallPick"],
            franchise_id,
            slot["teamName"],
            row.get("PlayerID"),
            row.get("PlayerFirstName"),
            row.get("PlayerLastName"),
            row.get("PlayerPosition"),
            timestamp,
        ])
        filled_by_conf[conference].add(slot_key)
        applied.append(f"{player_name} -> {conference} R{round_num}.{slot['pick']}")

    return {
        "success": True,
        "message": f"Applied {len(applied)} retention(s) to the {year} draft; skipped {len(skipped)}.",
        "applied": applied,
        "skipped": skipped,
    }


def finalize_devy_retention(year, conference=None):
    """Auto-retain every owned player (Drafted or Retained) that has no recorded
    decision for the year, up to the 2-per-team cap; release any beyond the cap.
    Idempotent: players who already have a decision for the year are skipped. Run
    after the retention window closes and BEFORE apply_retentions_to_draft.
    """
    if devy_player_pool_ws is None or devy_retention_history_ws is None:
        return {"success": False, "message": "Devy sheets not configured"}

    year = int(year)
    conf_upper = conference.upper() if conference else None

    # Players who already have a decision this year + per-team RETAIN counts.
    decided = set()
    existing_retains_by_team = {}
    try:
        for r in devy_retention_history_ws.get_all_records(expected_headers=[]):
            if str(r.get("Year")) != str(year):
                continue
            dec = str(r.get("Decision") or "RETAIN").upper()
            # PENDING rows are NOT decided - finalize is exactly what resolves them.
            if dec in ("RETAIN", "RELEASE"):
                decided.add(r.get("PlayerID"))
            if dec == "RETAIN":
                fid = str(r.get("FranchiseID")).zfill(3)
                existing_retains_by_team[fid] = existing_retains_by_team.get(fid, 0) + 1
    except Exception as e:
        return {"success": False, "message": f"Error reading retention history: {e}"}

    # Eligible owned players (Drafted or Retained), grouped by owning franchise.
    undecided_by_team = {}
    try:
        for row in devy_player_pool_ws.get_all_records(expected_headers=[]):
            status = row.get("Status", "")
            if status not in ("Drafted", "Retained"):
                continue
            conf = row.get("Conference", "")
            if conf_upper and str(conf).upper() != conf_upper:
                continue
            player_id = row.get("PlayerID")
            if player_id in decided:
                continue
            owner = str((row.get("RetainedBy") if status == "Retained" else row.get("DraftedBy")) or "").zfill(3)
            if not owner or owner == "000":
                continue
            undecided_by_team.setdefault(owner, []).append(player_id)
    except Exception as e:
        return {"success": False, "message": f"Error reading player pool: {e}"}

    retained, released = [], []
    for fid, player_ids in undecided_by_team.items():
        remaining = max(0, 2 - existing_retains_by_team.get(fid, 0))
        for player_id in player_ids:
            if remaining > 0:
                r = retain_devy_player(player_id, fid, year)
                if r.get("success"):
                    retained.append(player_id)
                    remaining -= 1
                else:
                    release_devy_player(player_id, fid, year)
                    released.append(player_id)
            else:
                release_devy_player(player_id, fid, year)
                released.append(player_id)

    return {
        "success": True,
        "message": f"Finalized {year}: auto-retained {len(retained)}, auto-released {len(released)}.",
        "retained": retained,
        "released": released,
    }

# ----------------- Devy Draft Commands -----------------
@devy.command(name="status", description="Check the current devy draft status")
async def devy_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    if devy_draft_settings_ws is None:
        await interaction.followup.send("Devy draft sheets not configured.")
        return

    status = get_devy_draft_setting("DraftStatus") or "not_started"
    draft_year = get_devy_draft_setting("DraftYear") or "N/A"
    conference = get_devy_draft_setting("CurrentConference") or "N/A"

    embed = discord.Embed(
        title="🏈 Devy Draft Status",
        color=discord.Color.blue()
    )

    embed.add_field(name="Draft Year", value=str(draft_year), inline=True)
    embed.add_field(name="Status", value=status.replace("_", " ").title(), inline=True)

    if status == "in_progress":
        current_pick = get_current_devy_pick(conference)
        if current_pick:
            embed.add_field(name="Conference", value=conference, inline=True)
            embed.add_field(
                name="On The Clock",
                value=f"**{current_pick['teamName']}**\nRound {current_pick['round']}, Pick {current_pick['pick']}",
                inline=False
            )
            if current_pick.get("pickDeadline"):
                embed.add_field(name="Pick Deadline", value=current_pick["pickDeadline"], inline=True)

    await interaction.followup.send(embed=embed, ephemeral=True)

@devy.command(name="order", description="View the devy draft order for a conference")
@app_commands.describe(conference="Conference to view (ACC, B10, B12, SEC, P12)")
async def devy_order(interaction: discord.Interaction, conference: str):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if devy_draft_order_ws is None:
        await interaction.followup.send("Devy draft order sheet not configured.")
        return

    # Commish must use correct devy channel; non-commish gets DM so no channel check needed
    if is_commish:
        is_valid, error_msg = check_devy_channel(interaction, conference)
        if not is_valid:
            await interaction.followup.send(error_msg)
            return

    # Try to get draft year from settings first, then from actual order data
    draft_year = get_devy_draft_setting("DraftYear")
    if not draft_year:
        # Fall back to finding the most recent year in the draft order sheet
        try:
            order_data = devy_draft_order_ws.get_all_records(expected_headers=[])
            conf_years = [
                row.get("Year") for row in order_data
                if row.get("Conference", "").upper() == conference.upper() and row.get("Year")
            ]
            if conf_years:
                draft_year = max(conf_years)  # Use most recent year
            else:
                await interaction.followup.send(f"No draft order found for {conference.upper()}.")
                return
        except Exception as e:
            await interaction.followup.send(f"Error reading draft order: {e}")
            return

    order = get_devy_draft_order_with_status(conference.upper(), int(draft_year))
    if not order:
        await interaction.followup.send(f"No draft order found for {conference.upper()}.")
        return

    emoji_map = get_team_emoji_map()
    owner_discord_map = get_franchise_owner_discord_ids()

    embed = discord.Embed(
        title=f"🏈 {conference.upper()} Devy Draft Order - {draft_year}",
        color=discord.Color.green()
    )

    lines = []
    for pick in order:
        team_emoji = emoji_map.get(pick["franchiseId"], "")
        status_icon = "✅" if pick["completed"] else "⬜"
        discord_id = owner_discord_map.get(pick["franchiseId"], "")
        owner_mention = f" (<@{discord_id}>)" if discord_id else ""

        if pick["completed"] and pick.get("playerSelected"):
            line = f"{status_icon} R{pick['round']}P{pick['pick']}: {team_emoji} **{pick['teamName']}**{owner_mention} → {pick['playerSelected']} ({pick['playerPosition']})"
        else:
            line = f"{status_icon} R{pick['round']}P{pick['pick']}: {team_emoji} **{pick['teamName']}**{owner_mention}"
        lines.append(line)

    # Split into chunks for embed fields
    chunk_size = 10
    for i in range(0, len(lines), chunk_size):
        chunk = lines[i:i+chunk_size]
        embed.add_field(
            name=f"Picks {i+1}-{min(i+chunk_size, len(lines))}",
            value="\n".join(chunk),
            inline=False
        )

    await interaction.followup.send(embed=embed)

@devy.command(name="pool", description="View available devy players for your conference")
@app_commands.describe(
    search="Optional: Search by name or position",
    conference="Optional: Conference to view (defaults to your team's conference)"
)
async def devy_pool(interaction: discord.Interaction, search: str = None, conference: str = None):
    await interaction.response.defer(ephemeral=True)

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    # Get user's conference if not specified
    target_conference = conference.upper() if conference else None
    if not target_conference:
        team = get_team_by_discord_id(interaction.user.id)
        if team:
            target_conference = team.get("conference")
        else:
            await interaction.followup.send("❌ Please specify a conference, or register as a team owner.")
            return

    if search:
        players = search_devy_players(search, target_conference)
    else:
        players = get_available_devy_players(target_conference)

    if not players:
        if search:
            await interaction.followup.send(f"No available players matching '{search}' in {target_conference}.")
        else:
            await interaction.followup.send(f"No available players in the {target_conference} pool.")
        return

    embed = discord.Embed(
        title=f"🏈 Available Devy Players - {target_conference}" + (f" - '{search}'" if search else ""),
        color=discord.Color.gold()
    )

    # Group by position
    by_position = {}
    for p in players:
        pos = p["position"]
        if pos not in by_position:
            by_position[pos] = []
        by_position[pos].append(p)

    for pos in sorted(by_position.keys()):
        pos_players = by_position[pos][:10]  # Limit per position
        lines = [f"`{p['playerId'][:20]}...` {p['firstName']} {p['lastName']}" for p in pos_players]
        if len(by_position[pos]) > 10:
            lines.append(f"*...and {len(by_position[pos]) - 10} more*")
        embed.add_field(name=f"{pos} ({len(by_position[pos])})", value="\n".join(lines), inline=True)

    embed.set_footer(text=f"Use /devy pick to draft a player (start typing last name) | Conference: {target_conference}")

    await interaction.followup.send(embed=embed, ephemeral=True)

@devy.command(name="pick", description="Make a devy draft pick")
@app_commands.describe(
    player="Start typing player name (LastName, FirstName)",
    first_name="Manual entry: player's first name (if not in pool)",
    last_name="Manual entry: player's last name (if not in pool)",
    position="Manual entry: player's position (if not in pool)"
)
@app_commands.choices(position=[
    app_commands.Choice(name="QB", value="QB"),
    app_commands.Choice(name="RB", value="RB"),
    app_commands.Choice(name="WR", value="WR"),
    app_commands.Choice(name="TE", value="TE"),
])
async def devy_pick(
    interaction: discord.Interaction,
    player: str,
    first_name: str = None,
    last_name: str = None,
    position: str = None
):
    await interaction.response.defer()

    if not all([devy_draft_settings_ws, devy_draft_order_ws, devy_draft_history_ws, devy_player_pool_ws]):
        await interaction.followup.send("Devy draft sheets not configured.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("❌ You are not registered as a team owner.")
        return

    conference = team.get("conference")
    franchise_id = str(team.get("id")).zfill(3)

    # Check if command is in correct devy channel
    is_valid, error_msg = check_devy_channel(interaction, conference)
    if not is_valid:
        await interaction.followup.send(error_msg)
        return

    # Build manual entry dict if any manual fields were provided
    manual_entry = None
    if first_name or last_name or position:
        manual_entry = {
            "first_name": first_name,
            "last_name": last_name,
            "position": position
        }

    # Make the pick (player value is PlayerID from autocomplete, or a name typed manually)
    result = make_devy_pick(conference, franchise_id, player, manual_entry=manual_entry)

    if not result["success"]:
        await interaction.followup.send(f"❌ {result['message']}")
        return

    emoji_map = get_team_emoji_map()

    embed = discord.Embed(
        title="🏈 Devy Draft Pick!",
        description=result["message"],
        color=discord.Color.green()
    )

    pick_info = result.get("pick", {})
    embed.add_field(name="Round", value=str(pick_info.get("round", "?")), inline=True)
    embed.add_field(name="Pick", value=str(pick_info.get("pick", "?")), inline=True)
    embed.add_field(name="Position", value=pick_info.get("position", "?"), inline=True)

    # Build notification for next picker
    next_user_mention = None
    if result.get("draftComplete"):
        embed.add_field(name="Draft Status", value="✅ **DRAFT COMPLETE!**", inline=False)
    elif result.get("nextPick"):
        next_pick = result["nextPick"]
        next_emoji = emoji_map.get(next_pick.get("franchiseId", ""), "")

        # Get Discord ID for next picker to tag them
        owner_map = get_franchise_owner_map()
        next_discord_id = owner_map.get(next_pick.get("franchiseId", ""))
        if next_discord_id:
            next_user_mention = f"<@{next_discord_id}>"

        on_clock_text = f"{next_emoji} **{next_pick.get('teamName')}** (R{next_pick.get('round')}P{next_pick.get('pick')})"
        if next_user_mention:
            on_clock_text += f"\n{next_user_mention} - You're up! 24 hours to make your pick."

        embed.add_field(
            name="🕐 Next On The Clock",
            value=on_clock_text,
            inline=False
        )

    await interaction.followup.send(embed=embed)

    # Send a separate ping message so the user gets notified
    if next_user_mention and not result.get("draftComplete"):
        await interaction.channel.send(f"{next_user_mention} You're on the clock for the devy draft!")

@devy_pick.autocomplete('player')
async def devy_pick_autocomplete(interaction: discord.Interaction, current: str):
    """Autocomplete for devy pick - searches available players by name."""
    if devy_player_pool_ws is None:
        return []

    # Get user's conference
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        return []

    conference = team.get("conference")
    players = get_available_devy_players(conference)

    if not players:
        return []

    # Filter by what the user has typed so far
    term = current.lower().strip()
    matches = []
    for p in players:
        # Build display name in MFL format: "LastName, FirstName (POS)"
        display_name = f"{p['lastName']}, {p['firstName']} ({p['position']})"

        if not term or term in display_name.lower() or term in p['lastName'].lower() or term in p['firstName'].lower():
            matches.append(
                app_commands.Choice(
                    name=display_name[:100],  # Discord max 100 chars
                    value=p['playerId']        # PlayerID passed to command
                )
            )

        if len(matches) >= 25:  # Discord max 25 choices
            break

    return matches

@devy.command(name="history", description="View devy draft history for a conference")
@app_commands.describe(
    conference="Conference to view (ACC, B10, B12, SEC, P12) - optional for commish in devy channels",
    year="Draft year to view - required for commish, optional for others (defaults to current)"
)
async def devy_history(interaction: discord.Interaction, conference: str = None, year: int = None):
    is_commish = has_commish_role(interaction)
    await interaction.response.defer(ephemeral=not is_commish)

    if devy_draft_history_ws is None:
        await interaction.followup.send("Devy draft history sheet not configured.")
        return

    if is_commish:
        # Commish: derive conference from the devy channel they're posting in
        conf_from_channel = None
        for conf, chan_id in DEVY_CHANNEL_IDS.items():
            if chan_id and interaction.channel_id == chan_id:
                conf_from_channel = conf
                break

        if conf_from_channel:
            conference = conf_from_channel
        elif conference:
            # Commish provided conference explicitly but isn't in that channel
            is_valid, error_msg = check_devy_channel(interaction, conference)
            if not is_valid:
                await interaction.followup.send(error_msg)
                return
        else:
            await interaction.followup.send("❌ Run this command in a devy channel, or specify a conference.")
            return

        if year is None:
            await interaction.followup.send("❌ Please specify a year (e.g. `/devy history year:2025`).")
            return

        draft_year = year
    else:
        # Non-commish: must provide conference, year defaults to current
        if not conference:
            await interaction.followup.send("❌ Please specify a conference (ACC, B10, B12, SEC, P12).")
            return

        conference = conference.upper()

        if year is not None:
            draft_year = year
        else:
            draft_year = get_devy_draft_setting("DraftYear")
            if not draft_year:
                await interaction.followup.send("No draft year configured.")
                return
            draft_year = int(draft_year)

    try:
        history_data = devy_draft_history_ws.get_all_records(expected_headers=[])
        history = [
            row for row in history_data
            if row.get("Year") == int(draft_year) and row.get("Conference") == conference.upper()
        ]
    except Exception as e:
        await interaction.followup.send(f"Error reading history: {e}")
        return

    if not history:
        await interaction.followup.send(f"No draft history found for {conference.upper()} in {draft_year}.")
        return

    emoji_map = get_team_emoji_map()

    embed = discord.Embed(
        title=f"🏈 {conference.upper()} Devy Draft History - {draft_year}",
        color=discord.Color.purple()
    )

    history = sorted(history, key=lambda x: x.get("OverallPick", 0))

    lines = []
    for pick in history:
        fid = str(pick.get("FranchiseID", "")).zfill(3)
        team_emoji = emoji_map.get(fid, "")
        player_name = f"{pick.get('PlayerFirstName')} {pick.get('PlayerLastName')}"
        line = f"R{pick.get('Round')}P{pick.get('Pick')}: {team_emoji} **{pick.get('TeamName')}** → {player_name} ({pick.get('PlayerPosition')})"
        lines.append(line)

    # Split into chunks
    chunk_size = 10
    for i in range(0, len(lines), chunk_size):
        chunk = lines[i:i+chunk_size]
        embed.add_field(
            name=f"Picks {i+1}-{min(i+chunk_size, len(lines))}",
            value="\n".join(chunk),
            inline=False
        )

    await interaction.followup.send(embed=embed)

@devy.command(name="my_history", description="View your team's devy draft pick history")
@app_commands.describe(year="Draft year to view (omit to see all years)")
async def devy_my_history(interaction: discord.Interaction, year: int = None):
    await interaction.response.defer(ephemeral=True)

    if devy_draft_history_ws is None:
        await interaction.followup.send("Devy draft history sheet not configured.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("❌ You are not registered as a team owner.")
        return

    franchise_id = str(team.get("id")).zfill(3)
    team_name = team.get("name", "Your Team")

    try:
        history_data = devy_draft_history_ws.get_all_records(expected_headers=[])
        if year is not None:
            my_picks = [
                row for row in history_data
                if row.get("Year") == int(year) and str(row.get("FranchiseID", "")).zfill(3) == franchise_id
            ]
        else:
            my_picks = [
                row for row in history_data
                if str(row.get("FranchiseID", "")).zfill(3) == franchise_id
            ]
    except Exception as e:
        await interaction.followup.send(f"Error reading history: {e}")
        return

    if not my_picks:
        msg = f"No draft picks found for {team_name}." if year is None else f"No draft picks found for {team_name} in {year}."
        await interaction.followup.send(msg)
        return

    title_year = str(year) if year else "All Time"
    embed = discord.Embed(
        title=f"🏈 {team_name} - Devy Draft History ({title_year})",
        color=discord.Color.blue()
    )

    # Sort by year descending, then overall pick ascending
    my_picks = sorted(my_picks, key=lambda x: (-int(x.get("Year", 0)), x.get("OverallPick", 0)))

    # Group by year
    picks_by_year = {}
    for pick in my_picks:
        pick_year = pick.get("Year", "Unknown")
        picks_by_year.setdefault(pick_year, []).append(pick)

    for pick_year, picks in picks_by_year.items():
        lines = []
        for pick in picks:
            conference = pick.get("Conference", "")
            player_name = f"{pick.get('PlayerFirstName')} {pick.get('PlayerLastName')}"
            line = f"R{pick.get('Round')}P{pick.get('Pick')}: {player_name} ({pick.get('PlayerPosition')}) - {conference}"
            lines.append(line)
        embed.add_field(
            name=f"📅 {pick_year} ({len(picks)} picks)",
            value="\n".join(lines[:15]) + (f"\n*...and {len(lines)-15} more*" if len(lines) > 15 else ""),
            inline=False
        )

    embed.set_footer(text=f"Total picks: {len(my_picks)}")

    await interaction.followup.send(embed=embed)

@devy.command(name="start", description="[Commish] Start the devy draft for a conference")
@app_commands.describe(
    conference="Conference to start draft for (ACC, B10, B12, SEC, P12)",
    year="Draft year (must match year in DevyDraftOrder sheet)"
)
async def devy_start(interaction: discord.Interaction, conference: str, year: int):
    await interaction.response.defer()

    # Check commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to start the draft.")
        return

    # Check if command is in correct devy channel
    is_valid, error_msg = check_devy_channel(interaction, conference)
    if not is_valid:
        await interaction.followup.send(error_msg)
        return

    if devy_draft_settings_ws is None or devy_draft_order_ws is None:
        await interaction.followup.send("Devy draft sheets not configured.")
        return

    draft_year = year

    # Verify conference exists in draft order for this year
    try:
        order_data = devy_draft_order_ws.get_all_records(expected_headers=[])
        conf_exists = any(
            row.get("Year") == draft_year and row.get("Conference") == conference.upper()
            for row in order_data
        )
        if not conf_exists:
            await interaction.followup.send(f"Conference '{conference.upper()}' not found in DevyDraftOrder for {draft_year}.\nMake sure you've manually entered the draft order in the DevyDraftOrder sheet.")
            return
    except Exception as e:
        await interaction.followup.send(f"Error checking draft order: {e}")
        return

    # Find the first slot NOT already consumed by a retention (or prior pick).
    conf_picks = sorted(
        [r for r in order_data if r.get("Year") == draft_year and r.get("Conference") == conference.upper()],
        key=lambda x: x.get("OverallPick", 0)
    )
    filled = get_filled_devy_slots(draft_year, conference.upper())
    first_open = next(
        (r for r in conf_picks if f"{r.get('Round')}-{r.get('Pick')}" not in filled),
        None
    )

    set_devy_draft_setting("DraftYear", str(draft_year))
    set_devy_draft_setting("CurrentConference", conference.upper())

    if first_open is None:
        # Every slot is already filled by retentions - nothing to draft.
        set_devy_draft_setting("DraftStatus", "completed")
        set_devy_draft_setting("CurrentPickDeadline", "")
        await interaction.followup.send(f"All picks for {conference.upper()} ({draft_year}) are already filled by retentions.")
        return

    # Start the draft at the first open slot
    set_devy_draft_setting("DraftStatus", "in_progress")
    set_devy_draft_setting("CurrentRound", str(first_open.get("Round")))
    set_devy_draft_setting("CurrentPick", str(first_open.get("Pick")))

    deadline_hours = int(get_devy_draft_setting("PickDeadlineHours") or 24)
    deadline = datetime.now()
    from datetime import timedelta
    deadline = deadline + timedelta(hours=deadline_hours)
    set_devy_draft_setting("CurrentPickDeadline", deadline.isoformat())

    # Get first pick info
    first_pick = get_current_devy_pick(conference.upper())
    emoji_map = get_team_emoji_map()

    embed = discord.Embed(
        title=f"🏈 {conference.upper()} Devy Draft Started!",
        description=f"Draft Year: {draft_year}\n2 Rounds, Snake Format",
        color=discord.Color.green()
    )

    first_user_mention = None
    if first_pick:
        team_emoji = emoji_map.get(first_pick["franchiseId"], "")

        # Get Discord ID for first picker to tag them
        owner_map = get_franchise_owner_map()
        first_discord_id = owner_map.get(first_pick["franchiseId"])
        if first_discord_id:
            first_user_mention = f"<@{first_discord_id}>"

        on_clock_text = f"{team_emoji} **{first_pick['teamName']}**\nRound 1, Pick 1"
        if first_user_mention:
            on_clock_text += f"\n{first_user_mention}"

        embed.add_field(
            name="🕐 On The Clock",
            value=on_clock_text,
            inline=False
        )
        embed.add_field(name="Pick Deadline", value=deadline.strftime("%Y-%m-%d %H:%M"), inline=True)

    embed.set_footer(text="Use /devy pick <player_id> to make your selection")
    await interaction.followup.send(embed=embed)

    # Send a separate ping message so the user gets notified
    if first_user_mention:
        await interaction.channel.send(f"{first_user_mention} The {conference.upper()} devy draft has started! You're on the clock - 24 hours to make your pick.")


@devy.command(name="retain", description="Retain a devy player for next year")
@app_commands.describe(
    player_id="The player ID to retain",
    year="The year to retain for (e.g., 2026)"
)
async def devy_retain(interaction: discord.Interaction, player_id: str, year: int):
    await interaction.response.defer(ephemeral=True)

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("❌ You are not registered as a team owner.")
        return

    franchise_id = str(team.get("id")).zfill(3)

    # Retain the player
    result = retain_devy_player(player_id, franchise_id, year)

    if result["success"]:
        embed = discord.Embed(
            title="🔒 Player Retained",
            description=result["message"],
            color=discord.Color.green()
        )
        embed.add_field(name="Position", value=result.get("position", "?"), inline=True)
        embed.add_field(name="Retention Year", value=str(year), inline=True)
        embed.set_footer(text="Use /devy retain or /devy release to manage your devy players")
        await interaction.followup.send(embed=embed, ephemeral=True)
    else:
        await interaction.followup.send(f"❌ {result['message']}")

@devy.command(name="release", description="Release a retained devy player back to the pool")
@app_commands.describe(player_id="The player ID to release")
async def devy_release(interaction: discord.Interaction, player_id: str):
    await interaction.response.defer(ephemeral=True)

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    # Get user's team
    team = get_team_by_discord_id(interaction.user.id)
    if not team:
        await interaction.followup.send("❌ You are not registered as a team owner.")
        return

    franchise_id = str(team.get("id")).zfill(3)

    # Release the player
    result = release_devy_player(player_id, franchise_id)

    if result["success"]:
        embed = discord.Embed(
            title="📤 Player Released",
            description=result["message"],
            color=discord.Color.orange()
        )
        embed.set_footer(text="This player is now available in the devy pool for your conference")
        await interaction.followup.send(embed=embed, ephemeral=True)
    else:
        await interaction.followup.send(f"❌ {result['message']}")

@commish.command(name="devy_retained", description="View all retained devy players in a conference")
@app_commands.describe(conference="Conference to view (defaults to your conference)")
async def devy_retained(interaction: discord.Interaction, conference: str = None):
    await interaction.response.defer()

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    # Get conference - use user's if not specified
    target_conference = conference.upper() if conference else None
    if not target_conference:
        team = get_team_by_discord_id(interaction.user.id)
        if team:
            target_conference = team.get("conference")
        else:
            await interaction.followup.send("❌ Please specify a conference.")
            return

    # Commish must use correct devy channel
    is_valid, error_msg = check_devy_channel(interaction, target_conference)
    if not is_valid:
        await interaction.followup.send(error_msg)
        return

    # Get all retained players
    retained = get_all_retained_players(target_conference)

    if not retained:
        await interaction.followup.send(f"No retained players in {target_conference}.")
        return

    # Get team info for display
    emoji_map = get_team_emoji_map()
    team_names = {}
    try:
        teams_data = teams_ws.get_all_records(expected_headers=[])
        for t in teams_data:
            fid = str(t.get("Franchise ID", "")).zfill(3)
            team_names[fid] = t.get("Team Name", f"Team {fid}")
    except:
        pass

    embed = discord.Embed(
        title=f"🔒 Retained Devy Players - {target_conference}",
        description=f"Total: {len(retained)} players",
        color=discord.Color.purple()
    )

    # Group by team
    by_team = {}
    for p in retained:
        fid = p["retainedBy"]
        if fid not in by_team:
            by_team[fid] = []
        by_team[fid].append(p)

    for fid in sorted(by_team.keys()):
        players = by_team[fid]
        team_emoji = emoji_map.get(fid, "")
        team_name = team_names.get(fid, f"Team {fid}")
        lines = [f"{p['firstName']} {p['lastName']} ({p['position']})" for p in players[:5]]
        if len(players) > 5:
            lines.append(f"*...and {len(players)-5} more*")
        embed.add_field(
            name=f"{team_emoji} {team_name} ({len(players)})",
            value="\n".join(lines),
            inline=True
        )

    await interaction.followup.send(embed=embed)

# ----------------- Schedule DM Command (Commissioner Only) -----------------

def build_schedule_map(schedule_records):
    """Build per-team schedule from Schedule sheet records.
    Returns: {franchise_id (3-digit str): {week (int): opponent_id (3-digit str)}}
    """
    schedule = defaultdict(dict)
    for row in schedule_records:
        try:
            week = int(row.get("Week", 0))
            home = str(row.get("Home", "")).strip().zfill(3)
            away = str(row.get("Away", "")).strip().zfill(3)
            if week and home != "000" and away != "000":
                schedule[home][week] = away
                schedule[away][week] = home
        except (ValueError, TypeError):
            continue
    return dict(schedule)


def build_confirmed_rivalry_set(rivalry_records):
    """Build set of confirmed rivalry pairs.
    Returns: set of frozenset({teamA_id, teamB_id})
    """
    rivalry_pairs = set()
    for r in rivalry_records:
        if r.get("Status") != "CONFIRMED":
            continue
        team_a = str(r.get("Team A", "")).strip().zfill(3)
        team_b = str(r.get("Team B", "")).strip().zfill(3)
        if team_a != "000" and team_b != "000":
            rivalry_pairs.add(frozenset({team_a, team_b}))
    return rivalry_pairs


def build_schedule_embed(franchise_id, team_name, team_schedule, emoji_map, name_map, rivalry_set, year, num_weeks=12):
    """Build a Discord embed showing a team's 12-week schedule."""
    embed = discord.Embed(
        title=f"📋 Your {year} Schedule",
        description=f"**{team_name}**",
        color=discord.Color.blue()
    )

    for week in range(1, num_weeks + 1):
        opponent_id = team_schedule.get(week)
        if opponent_id:
            opp_emoji = emoji_map.get(opponent_id, "")
            opp_name = name_map.get(opponent_id, f"Team {opponent_id}")
            is_rivalry = frozenset({franchise_id, opponent_id}) in rivalry_set
            rivalry_marker = " ⚔️" if is_rivalry else ""
            value = f"{opp_emoji} {opp_name}{rivalry_marker}"
        else:
            value = "🔓 OPEN"

        embed.add_field(name=f"Week {week}", value=value, inline=True)

    embed.set_footer(text="⚔️ = Rivalry Game  |  🔓 = Open Week")
    return embed


@commish.command(name="send_schedules", description="DM every team owner their 12-week schedule")
async def send_schedules(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    if not has_commish_role(interaction):
        await interaction.followup.send(
            "You must have the **Commish** role to use this command.",
            ephemeral=True
        )
        return

    # Load Schedule sheet on-demand (may not exist until scheduler has run)
    try:
        schedule_ws = await asyncio.to_thread(scheduler_sheet.worksheet, "Schedule")
        schedule_records = await asyncio.to_thread(schedule_ws.get_all_records, expected_headers=[])
    except gspread.exceptions.WorksheetNotFound:
        await interaction.followup.send("❌ **Schedule sheet not found.** The scheduler has not been run yet.")
        return
    except Exception as e:
        traceback.print_exc()
        await interaction.followup.send(f"❌ Error reading Schedule sheet: {str(e)[:200]}")
        return

    if not schedule_records:
        await interaction.followup.send("❌ **Schedule sheet is empty.** No games have been scheduled yet.")
        return

    schedule_map = build_schedule_map(schedule_records)

    if not schedule_map:
        await interaction.followup.send("❌ **No valid games found** in the Schedule sheet.")
        return

    # Load rivalries (non-fatal if it fails)
    try:
        rivalry_records = await asyncio.to_thread(rivalries_ws.get_all_records, expected_headers=[])
        rivalry_set = build_confirmed_rivalry_set(rivalry_records)
    except Exception as e:
        print(f"Warning: Could not load rivalries for send_schedules: {e}")
        rivalry_set = set()

    # Load team lookup data
    emoji_map = await asyncio.to_thread(get_team_emoji_map)
    name_map = await asyncio.to_thread(get_team_name_map)
    owner_map = await asyncio.to_thread(get_franchise_owner_map)
    year = get_current_year()

    sent_count = 0
    failed_count = 0
    skipped_count = 0
    no_schedule_count = 0
    status_lines = []

    for franchise_id, discord_id in owner_map.items():
        team_name = name_map.get(franchise_id, f"Team {franchise_id}")

        team_schedule = schedule_map.get(franchise_id, {})
        if not team_schedule:
            status_lines.append(f"⏭️ {team_name}: No games scheduled")
            no_schedule_count += 1
            continue

        if not discord_id:
            status_lines.append(f"⚠️ {team_name}: No Discord ID configured")
            skipped_count += 1
            continue

        try:
            user = await bot.fetch_user(int(discord_id))
            embed = build_schedule_embed(
                franchise_id, team_name, team_schedule,
                emoji_map, name_map, rivalry_set, year
            )
            await user.send(embed=embed)
            status_lines.append(f"✅ {team_name}: DM sent")
            sent_count += 1

            # Rate limit protection
            if sent_count % 5 == 0:
                await asyncio.sleep(1.0)

        except discord.Forbidden:
            status_lines.append(f"❌ {team_name}: DMs disabled")
            failed_count += 1
        except discord.NotFound:
            status_lines.append(f"❌ {team_name}: User not found")
            failed_count += 1
        except Exception as e:
            status_lines.append(f"❌ {team_name}: {str(e)[:50]}")
            failed_count += 1

    # Report summary to commissioner
    summary_embed = discord.Embed(
        title="📋 Schedule DMs Summary",
        description=(
            f"**Sent:** {sent_count}\n"
            f"**Failed:** {failed_count}\n"
            f"**Skipped (no Discord ID):** {skipped_count}\n"
            f"**No schedule:** {no_schedule_count}"
        ),
        color=discord.Color.green() if failed_count == 0 else discord.Color.orange()
    )

    if status_lines:
        details_text = "\n".join(status_lines[:25])
        if len(status_lines) > 25:
            details_text += f"\n*...and {len(status_lines) - 25} more*"
        if len(details_text) > 1024:
            details_text = details_text[:1020] + "..."
        summary_embed.add_field(name="Details", value=details_text, inline=False)

    await interaction.followup.send(embed=summary_embed)

# ----------------- Devy Retention Process (Commissioner-triggered DMs) -----------------

class DevyRetentionView(discord.ui.View):
    """View for handling devy player retention decisions via DM."""

    def __init__(self, players: list, franchise_id: str, conference: str, retention_year: int, team_name: str):
        super().__init__(timeout=86400)  # 24 hour timeout
        self.players = players
        self.franchise_id = franchise_id
        self.conference = conference
        self.retention_year = retention_year
        self.team_name = team_name
        self.decisions = {}  # player_id -> "retain" or "release"

        # Initialize all as undecided
        for p in players:
            self.decisions[p["playerId"]] = None

    def get_embed(self):
        """Generate the current status embed."""
        embed = discord.Embed(
            title=f"🏈 Devy Retention Decisions - {self.team_name}",
            description=f"**Conference:** {self.conference}\n**Retention Year:** {self.retention_year}\n\nSelect which players to **retain** or **release**. Released players return to the draft pool.",
            color=discord.Color.blue()
        )

        for p in self.players:
            decision = self.decisions.get(p["playerId"])
            if decision == "retain":
                status = "🔒 **RETAIN**"
            elif decision == "release":
                status = "📤 **RELEASE**"
            else:
                status = "⏳ *Pending*"

            embed.add_field(
                name=f"{p['firstName']} {p['lastName']} ({p['position']})",
                value=f"Drafted: {p.get('draftYear', '?')}\n{status}",
                inline=True
            )

        # Count decisions
        retained = sum(1 for d in self.decisions.values() if d == "retain")
        released = sum(1 for d in self.decisions.values() if d == "release")
        pending = sum(1 for d in self.decisions.values() if d is None)

        embed.set_footer(text=f"Retained: {retained} | Released: {released} | Pending: {pending}")
        return embed

    async def process_decision(self, interaction: discord.Interaction, player_id: str, decision: str):
        """Process a retention decision for a player."""
        # Acknowledge the click immediately. The sheet reads/writes below take longer
        # than Discord's 3s interaction window, so without this defer the user sees
        # "the bot didn't respond in time". defer() (no thinking) keeps the message and
        # lets us edit it via edit_original_response afterward.
        try:
            await interaction.response.defer()
        except discord.InteractionResponded:
            pass

        # Find the player
        player = next((p for p in self.players if p["playerId"] == player_id), None)
        if not player:
            await interaction.followup.send("Player not found.", ephemeral=True)
            return

        if decision == "retain":
            result = retain_devy_player(player_id, self.franchise_id, self.retention_year)
            if result["success"]:
                self.decisions[player_id] = "retain"
            else:
                await interaction.followup.send(f"Error: {result['message']}", ephemeral=True)
                return
        else:  # release
            # Return the player to the pool and log the RELEASE decision, whether
            # they were Drafted or already Retained.
            result = release_devy_player(player_id, self.franchise_id, self.retention_year)
            if not result["success"]:
                await interaction.followup.send(f"Error: {result['message']}", ephemeral=True)
                return
            self.decisions[player_id] = "release"

        # Update the message in place (edit the component message we deferred).
        try:
            await interaction.edit_original_response(embed=self.get_embed(), view=self)
        except Exception as e:
            print(f"Could not edit retention view message: {e}")

        # Check if all decisions are made
        if all(d is not None for d in self.decisions.values()):
            await interaction.followup.send("✅ All retention decisions submitted! Thank you.", ephemeral=True)


class DevyRetentionSelect(discord.ui.Select):
    """Select menu for choosing a player to make a decision on."""

    def __init__(self, players: list, action: str):
        self.action = action  # "retain" or "release"
        options = [
            discord.SelectOption(
                label=f"{p['firstName']} {p['lastName']}",
                description=f"{p['position']} - Drafted {p.get('draftYear', '?')}",
                value=p["playerId"][:100]  # Discord has a 100 char limit
            )
            for p in players[:25]  # Discord has a 25 option limit
        ]

        emoji = "🔒" if action == "retain" else "📤"
        super().__init__(
            placeholder=f"{emoji} Select player to {action}...",
            options=options,
            min_values=1,
            max_values=1
        )

    async def callback(self, interaction: discord.Interaction):
        player_id = self.values[0]
        await self.view.process_decision(interaction, player_id, self.action)


def create_retention_view(players: list, franchise_id: str, conference: str, retention_year: int, team_name: str):
    """Create a retention view with select menus for the given players."""
    view = DevyRetentionView(players, franchise_id, conference, retention_year, team_name)

    if len(players) > 0:
        # Add retain select menu
        view.add_item(DevyRetentionSelect(players, "retain"))
        # Add release select menu
        view.add_item(DevyRetentionSelect(players, "release"))

    return view


def get_teams_with_drafted_devy_players(conference: str = None):
    """Get all teams that have drafted devy players (status=Drafted)."""
    if devy_player_pool_ws is None:
        return {}

    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
        teams = {}  # franchise_id -> list of players

        for row in data:
            if row.get("Status") == "Drafted":
                row_conference = row.get("Conference", "")
                if (not conference) or (row_conference == conference):
                    fid = str(row.get("DraftedBy", "")).zfill(3)
                    if fid and fid != "000":
                        if fid not in teams:
                            teams[fid] = []
                        teams[fid].append({
                            "playerId": row.get("PlayerID"),
                            "conference": row_conference,
                            "firstName": row.get("FirstName"),
                            "lastName": row.get("LastName"),
                            "position": row.get("Position"),
                            "year": row.get("Year"),
                            "status": row.get("Status"),
                            "draftYear": row.get("DraftYear")
                        })
        return teams
    except Exception as e:
        print(f"Error getting teams with drafted devy players: {e}")
        return {}


def get_pending_retention_by_team(year, conference: str = None):
    """Read PENDING retention rows for a year from DevyRetentionHistory, grouped by
    franchise. This is the worklist seeded by the sheet's 'Open Retention Window' menu
    (after Reconcile) — the bot DMs exactly what the sheet shows, no on-the-fly guess."""
    if devy_retention_history_ws is None:
        return {}
    conf_upper = conference.upper() if conference else None
    teams = {}
    try:
        for r in devy_retention_history_ws.get_all_records(expected_headers=[]):
            if str(r.get("Year")) != str(year):
                continue
            if str(r.get("Decision") or "").upper() != "PENDING":
                continue
            row_conf = r.get("Conference", "")
            if conf_upper and str(row_conf).upper() != conf_upper:
                continue
            fid = str(r.get("FranchiseID", "")).zfill(3)
            if not fid or fid == "000":
                continue
            teams.setdefault(fid, []).append({
                "playerId": r.get("PlayerID"),
                "conference": row_conf,
                "firstName": r.get("PlayerFirstName"),
                "lastName": r.get("PlayerLastName"),
                "position": r.get("PlayerPosition"),
                "year": r.get("Year"),
                "status": "PENDING",
                "draftYear": "",
            })
        return teams
    except Exception as e:
        print(f"Error reading pending retention worklist: {e}")
        return {}


@devy.command(name="retention_start", description="[Commish] Start the retention process - DMs team owners")
@app_commands.describe(
    year="The retention year (e.g., 2026)",
    conference="Optional: Specific conference to start retention for",
    franchise="Test: only this one franchise ID (e.g., 005)",
    dm_to_me="Test: send the DM(s) to YOU instead of the team owners"
)
async def devy_retention_start(interaction: discord.Interaction, year: int, conference: str = None,
                               franchise: str = None, dm_to_me: bool = False):
    await interaction.response.defer()

    # Check commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to start the retention process.")
        return

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    target_conference = conference.upper() if conference else None

    # Read the PENDING worklist seeded in the sheet (via Open Retention Window).
    teams_with_players = get_pending_retention_by_team(year, target_conference)

    # Test scoping: limit to a single franchise if provided.
    if franchise:
        fid_filter = str(franchise).zfill(3)
        teams_with_players = {k: v for k, v in teams_with_players.items() if k == fid_filter}

    # Safety: dm_to_me without a franchise would DM every team's view to you. Cap it.
    dm_note = ""
    if dm_to_me and not franchise and len(teams_with_players) > 5:
        capped = dict(list(teams_with_players.items())[:5])
        dm_note = f" (test mode: capped to 5 of {len(teams_with_players)} teams — pass `franchise:` to target one)"
        teams_with_players = capped

    if not teams_with_players:
        await interaction.followup.send(
            f"No **PENDING** retention decisions for {year}"
            f"{f' in {target_conference}' if target_conference else ''}"
            f"{f' for franchise {str(franchise).zfill(3)}' if franchise else ''}.\n"
            f"In the sheet, run **🔒 Player Retention → Open Retention Window** (after Reconcile) to seed the worklist, then try again."
        )
        return

    # Get team info and owner Discord IDs
    owner_map = get_franchise_owner_map()
    team_names = {}
    team_conferences = {}
    try:
        teams_data = teams_ws.get_all_records(expected_headers=[])
        for t in teams_data:
            fid = str(t.get("Franchise ID", "")).zfill(3)
            team_names[fid] = t.get("Team Name", f"Team {fid}")
            team_conferences[fid] = t.get("Conference", "")
    except:
        pass

    # Send DMs to each team owner
    sent_count = 0
    failed_count = 0
    skipped_count = 0

    status_lines = []

    for fid, players in teams_with_players.items():
        team_name = team_names.get(fid, f"Team {fid}")
        conf = team_conferences.get(fid, "?")

        try:
            if dm_to_me:
                # Test mode: send the real view (still bound to franchise `fid`, so
                # clicking Retain/Release writes decisions for THAT team) to yourself.
                user = interaction.user
            else:
                discord_id = owner_map.get(fid)
                if not discord_id:
                    status_lines.append(f"⚠️ {team_name} ({conf}): No Discord ID configured")
                    skipped_count += 1
                    continue
                user = await bot.fetch_user(int(discord_id))

            if user:
                # Create retention view (bound to franchise fid + year)
                view = create_retention_view(players, fid, conf, year, team_name)
                embed = view.get_embed()
                content = f"🧪 TEST — {team_name} ({conf}) retention view" if dm_to_me else None

                await user.send(content=content, embed=embed, view=view)
                status_lines.append(f"✅ {team_name} ({conf}): DM sent ({len(players)} players){' [to you]' if dm_to_me else ''}")
                sent_count += 1
            else:
                status_lines.append(f"❌ {team_name} ({conf}): User not found")
                failed_count += 1
        except discord.Forbidden:
            status_lines.append(f"❌ {team_name} ({conf}): DMs disabled")
            failed_count += 1
        except Exception as e:
            status_lines.append(f"❌ {team_name} ({conf}): Error - {str(e)[:50]}")
            failed_count += 1

    # Send summary to commissioner
    title = "🧪 Devy Retention TEST" if dm_to_me else "🏈 Devy Retention Process Started"
    embed = discord.Embed(
        title=title,
        description=f"**Year:** {year}\n**Conference:** {target_conference or 'All'}\n"
                    f"{f'**Franchise:** {str(franchise).zfill(3)}' + chr(10) if franchise else ''}"
                    f"{'**DMs routed to you (test)**' + dm_note + chr(10) if dm_to_me else ''}"
                    f"\n**Summary:**\n✅ Sent: {sent_count}\n❌ Failed: {failed_count}\n⚠️ Skipped: {skipped_count}",
        color=discord.Color.green() if failed_count == 0 else discord.Color.orange()
    )

    # Add status details
    if status_lines:
        status_text = "\n".join(status_lines[:20])
        if len(status_lines) > 20:
            status_text += f"\n*...and {len(status_lines) - 20} more*"
        embed.add_field(name="Details", value=status_text, inline=False)

    embed.set_footer(text="Team owners have 24 hours to make their decisions via DM")
    await interaction.followup.send(embed=embed)


@devy.command(name="retention_status", description="[Commish] Check retention status for all teams")
@app_commands.describe(conference="Optional: Specific conference to check")
async def devy_retention_status(interaction: discord.Interaction, conference: str = None):
    await interaction.response.defer()

    # Check commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to view retention status.")
        return

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    target_conference = conference.upper() if conference else None

    # Get all players and count by status
    try:
        data = devy_player_pool_ws.get_all_records(expected_headers=[])
    except Exception as e:
        await interaction.followup.send(f"Error reading data: {e}")
        return

    # Get team info
    team_names = {}
    try:
        teams_data = teams_ws.get_all_records(expected_headers=[])
        for t in teams_data:
            fid = str(t.get("Franchise ID", "")).zfill(3)
            team_names[fid] = t.get("Team Name", f"Team {fid}")
    except:
        pass

    emoji_map = get_team_emoji_map()

    # Count by team: drafted vs retained
    team_stats = {}  # fid -> {"drafted": count, "retained": count}

    for row in data:
        status = row.get("Status", "")
        row_conf = row.get("Conference", "")

        if target_conference and row_conf != target_conference:
            continue

        if status == "Drafted":
            fid = str(row.get("DraftedBy", "")).zfill(3)
            if fid and fid != "000":
                if fid not in team_stats:
                    team_stats[fid] = {"drafted": 0, "retained": 0, "conference": row_conf}
                team_stats[fid]["drafted"] += 1
        elif status == "Retained":
            fid = str(row.get("RetainedBy", "")).zfill(3)
            if fid and fid != "000":
                if fid not in team_stats:
                    team_stats[fid] = {"drafted": 0, "retained": 0, "conference": row_conf}
                team_stats[fid]["retained"] += 1

    if not team_stats:
        await interaction.followup.send(f"No devy roster data found{f' for {target_conference}' if target_conference else ''}.")
        return

    embed = discord.Embed(
        title=f"🏈 Devy Retention Status",
        description=f"**Conference:** {target_conference or 'All'}",
        color=discord.Color.blue()
    )

    # Sort by conference then team name
    sorted_fids = sorted(team_stats.keys(), key=lambda f: (team_stats[f].get("conference", ""), team_names.get(f, f)))

    for fid in sorted_fids:
        stats = team_stats[fid]
        team_name = team_names.get(fid, f"Team {fid}")
        team_emoji = emoji_map.get(fid, "")
        conf = stats.get("conference", "?")

        # Determine status
        if stats["drafted"] == 0 and stats["retained"] > 0:
            status_icon = "✅"  # All decisions made
        elif stats["drafted"] > 0 and stats["retained"] == 0:
            status_icon = "⏳"  # No decisions yet
        elif stats["drafted"] > 0 and stats["retained"] > 0:
            status_icon = "🔄"  # Partially complete
        else:
            status_icon = "❓"

        embed.add_field(
            name=f"{status_icon} {team_emoji} {team_name} ({conf})",
            value=f"Pending: {stats['drafted']} | Retained: {stats['retained']}",
            inline=True
        )

    total_pending = sum(s["drafted"] for s in team_stats.values())
    total_retained = sum(s["retained"] for s in team_stats.values())
    embed.set_footer(text=f"Total Pending: {total_pending} | Total Retained: {total_retained}")

    await interaction.followup.send(embed=embed)


@devy.command(name="retention_remind", description="[Commish] Send reminder DMs to teams with pending retention decisions")
@app_commands.describe(conference="Optional: Specific conference to remind")
async def devy_retention_remind(interaction: discord.Interaction, conference: str = None):
    await interaction.response.defer()

    # Check commissioner role
    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to send reminders.")
        return

    if devy_player_pool_ws is None:
        await interaction.followup.send("Devy player pool sheet not configured.")
        return

    target_conference = conference.upper() if conference else None

    # Get teams with pending (drafted but not retained) players
    teams_with_pending = get_teams_with_drafted_devy_players(target_conference)

    if not teams_with_pending:
        await interaction.followup.send("No teams have pending retention decisions.")
        return

    # Get team info and owner Discord IDs
    owner_map = get_franchise_owner_map()
    team_names = {}
    try:
        teams_data = teams_ws.get_all_records(expected_headers=[])
        for t in teams_data:
            fid = str(t.get("Franchise ID", "")).zfill(3)
            team_names[fid] = t.get("Team Name", f"Team {fid}")
    except:
        pass

    sent_count = 0
    failed_count = 0

    for fid, players in teams_with_pending.items():
        discord_id = owner_map.get(fid)
        team_name = team_names.get(fid, f"Team {fid}")

        if not discord_id:
            continue

        try:
            user = await bot.fetch_user(int(discord_id))
            if user:
                embed = discord.Embed(
                    title="⏰ Devy Retention Reminder",
                    description=f"**{team_name}**, you have **{len(players)}** devy player(s) awaiting retention decisions.\n\nUse `/devy retain` or `/devy release` to make decisions.",
                    color=discord.Color.orange()
                )
                player_list = "\n".join([f"• {p['firstName']} {p['lastName']} ({p['position']})" for p in players[:10]])
                if len(players) > 10:
                    player_list += f"\n*...and {len(players) - 10} more*"
                embed.add_field(name="Pending Players", value=player_list, inline=False)

                await user.send(embed=embed)
                sent_count += 1
        except:
            failed_count += 1

    await interaction.followup.send(f"📨 Reminder sent to **{sent_count}** team(s). Failed: {failed_count}")


@devy.command(name="retention_finalize", description="[Commish] Auto-retain every undecided owned player for a year")
@app_commands.describe(
    year="The retention year to finalize (e.g., 2026)",
    conference="Optional: limit to a single conference"
)
async def devy_retention_finalize(interaction: discord.Interaction, year: int, conference: str = None):
    await interaction.response.defer()

    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to finalize retention.")
        return

    if devy_player_pool_ws is None or devy_retention_history_ws is None:
        await interaction.followup.send("Devy sheets not configured.")
        return

    target_conference = conference.upper() if conference else None
    result = finalize_devy_retention(year, target_conference)

    if not result.get("success"):
        await interaction.followup.send(f"❌ {result.get('message')}")
        return

    embed = discord.Embed(
        title="🔒 Retention Finalized",
        description=result["message"],
        color=discord.Color.green()
    )
    embed.add_field(name="Auto-retained", value=str(len(result["retained"])), inline=True)
    embed.add_field(name="Auto-released", value=str(len(result["released"])), inline=True)
    embed.set_footer(text="Run /devy retention_apply next to slot retained players into the draft.")
    await interaction.followup.send(embed=embed)


@devy.command(name="retention_apply", description="[Commish] Slot retained players into the coming draft's history")
@app_commands.describe(
    year="The draft year to slot retentions into (e.g., 2026)",
    conference="Optional: limit to a single conference"
)
async def devy_retention_apply(interaction: discord.Interaction, year: int, conference: str = None):
    await interaction.response.defer()

    commissioner_role_name = os.getenv("COMMISSIONER_ROLE_NAME", "Commish")
    if not any(role.name == commissioner_role_name for role in interaction.user.roles):
        await interaction.followup.send("❌ You must be a Commissioner to apply retentions.")
        return

    conferences = [conference.upper()] if conference else None
    result = apply_retentions_to_draft(year, conferences)

    if not result.get("success"):
        await interaction.followup.send(f"❌ {result.get('message')}")
        return

    embed = discord.Embed(
        title="📋 Retentions Applied to Draft",
        description=result["message"],
        color=discord.Color.blue()
    )
    if result["applied"]:
        applied_text = "\n".join(f"• {a}" for a in result["applied"][:15])
        if len(result["applied"]) > 15:
            applied_text += f"\n*...and {len(result['applied']) - 15} more*"
        embed.add_field(name="Applied", value=applied_text, inline=False)
    if result["skipped"]:
        skipped_text = "\n".join(f"• {s}" for s in result["skipped"][:10])
        if len(result["skipped"]) > 10:
            skipped_text += f"\n*...and {len(result['skipped']) - 10} more*"
        embed.add_field(name="Skipped", value=skipped_text, inline=False)
    await interaction.followup.send(embed=embed)


# ----------------- Scheduled Rankings Updates -----------------
@tasks.loop(time=time(hour=10, minute=0))  # Runs daily at 10:00 AM UTC
async def post_tuesday_rankings():
    """Post rankings update every Tuesday to the rankings channel"""
    if not auto_posts_enabled:
        return

    # Only run on Tuesdays (weekday 1)
    if datetime.now().weekday() != 1:
        return

    if RANKINGS_CHANNEL_ID == 0:
        print("RANKINGS_CHANNEL_ID not configured, skipping scheduled rankings post")
        return

    channel = bot.get_channel(RANKINGS_CHANNEL_ID)
    if channel is None:
        print(f"Rankings channel {RANKINGS_CHANNEL_ID} not found")
        return

    if rankings_ws is None:
        print("PowerRankings sheet not found")
        return

    year = get_current_year()
    data = get_rankings_data(year)

    if not data:
        print(f"No rankings data found for {year}")
        return

    # Get week from data
    week = data[0].get("Week", "?") if data else "?"
    emoji_map = get_team_emoji_map()

    # Build the rankings embed - special formatting for Week 18 Final Rankings
    if week == 18 or week == "18":
        embed = discord.Embed(
            title=f"🏆 FINAL RANKINGS - {year} Season 🏆",
            description="Official end-of-season power rankings",
            color=discord.Color.gold()
        )
    else:
        embed = discord.Embed(
            title=f"🏈 Power Rankings - {year} Week {week}",
            description="Weekly power rankings update",
            color=discord.Color.dark_gold()
        )

    # Top 25 display
    lines = []
    for team in data[:25]:
        rank = int(team.get("Rank", 0))
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        team_name = team.get("TeamName", "Unknown")
        movement = format_movement(team.get("Movement", "-"))
        team_emoji = emoji_map.get(franchise_id, "")

        wins = team.get("RegularSeasonWins", 0) + team.get("PostseasonWins", 0)
        losses = team.get("RegularSeasonLosses", 0) + team.get("PostseasonLosses", 0)
        conf_wins = team.get("ConferenceWins", 0)
        conf_losses = team.get("ConferenceLosses", 0)
        score = team.get("RankingScore", 0)

        rank_emoji = get_ranking_text(rank)

        lines.append(
            f"{rank_emoji} {team_emoji} **{team_name}** {movement}\n"
            f"   ({wins}-{losses}) | Conf: {conf_wins}-{conf_losses} | Score: {score:.3f}"
        )

    # Split into fields
    chunk_size = 5
    for i in range(0, min(25, len(lines)), chunk_size):
        chunk = lines[i:i+chunk_size]
        start = i + 1
        end = min(i + chunk_size, 25)
        embed.add_field(
            name=f"#{start}-{end}",
            value="\n".join(chunk),
            inline=False
        )

    embed.set_footer(text=f"Rankings calculated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    await channel.send(embed=embed)
    print(f"Posted Tuesday rankings update for {year} Week {week}")

    # Update nicknames for top 25
    guild = bot.get_guild(GUILD_ID)
    if guild is None:
        print("Guild not found for nickname updates")
        return

    owner_map = get_franchise_owner_map()
    nickname_updates = 0

    # Remove ranking prefixes from users no longer in top 25
    rank_prefixes = get_all_rank_prefixes()
    for member in guild.members:
        if member.bot:
            continue

        if member.nick:
            for prefix in rank_prefixes:
                if member.nick.startswith(prefix):
                    member_franchise_id = None
                    for fid, discord_id in owner_map.items():
                        if discord_id == str(member.id):
                            member_franchise_id = fid
                            break

                    if member_franchise_id:
                        current_rank = None
                        for team in data[:25]:
                            if str(team.get("FranchiseID", "")).zfill(3) == member_franchise_id:
                                current_rank = int(team.get("Rank", 0))
                                break

                        if current_rank is None or current_rank > 25:
                            try:
                                new_nick = member.nick.replace(prefix, "").strip()
                                if new_nick:
                                    await member.edit(nick=new_nick)
                                else:
                                    await member.edit(nick=None)
                            except discord.Forbidden:
                                pass
                    break

    # Add/update ranking prefixes for top 25
    for team in data[:25]:
        franchise_id = str(team.get("FranchiseID", "")).zfill(3)
        rank = int(team.get("Rank", 0))

        discord_id = owner_map.get(franchise_id)
        if not discord_id:
            continue

        try:
            member = guild.get_member(int(discord_id))
            if member is None or member.id == guild.owner_id:
                continue

            rank_prefix = get_rank_prefix(rank)
            if not rank_prefix:
                continue

            current_name = member.nick or member.display_name

            clean_name = current_name
            for prefix in rank_prefixes:
                if clean_name.startswith(prefix):
                    clean_name = clean_name.replace(prefix, "").strip()
                    break

            new_nick = f"{rank_prefix} {clean_name}"
            if len(new_nick) > 32:
                new_nick = new_nick[:32]

            if member.nick != new_nick:
                await member.edit(nick=new_nick)
                nickname_updates += 1

        except discord.Forbidden:
            pass
        except Exception as e:
            print(f"Error updating nickname for franchise {franchise_id}: {e}")

    print(f"Updated {nickname_updates} nicknames")

@post_tuesday_rankings.before_loop
async def before_tuesday_rankings():
    """Wait until the bot is ready before starting the loop"""
    await bot.wait_until_ready()

# ----------------- Bot Ready Event & Guild Sync -----------------
@bot.event
async def on_ready():
    print("TREE COMMANDS FOUND:", list(bot.tree.walk_commands()))

    # Load application emojis (emojis uploaded to the bot itself)
    await load_application_emojis()

    # Start the scheduled awards update task
    if not post_weekly_awards_update.is_running():
        post_weekly_awards_update.start()

    # Start the scheduled Tuesday rankings task
    if not post_tuesday_rankings.is_running():
        post_tuesday_rankings.start()

    guild = discord.Object(id=GUILD_ID)

    # 🔑 THIS IS THE MISSING LINE
    bot.tree.copy_global_to(guild=guild)

    await bot.tree.sync(guild=guild)

    print(f"✅ Logged in as {bot.user}. Commands synced to guild {GUILD_ID}")

# Run the bot
BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("DISCORD_BOT_TOKEN not found in environment variables. Please create a .env file.")
bot.run(BOT_TOKEN)
