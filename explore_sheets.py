import gspread
from google.oauth2.service_account import Credentials
import os
from dotenv import load_dotenv

load_dotenv()

SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "composed-falcon-482703-s9-5743dd74a2e0.json")
LEAGUE_SHEET_ID = os.getenv("LEAGUE_SHEET_ID")
SCHEDULER_SHEET_ID = os.getenv("SCHEDULER_SHEET_ID")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
client = gspread.authorize(creds)

# Open both sheets
league_sheet = client.open_by_key(LEAGUE_SHEET_ID)
scheduler_sheet = client.open_by_key(SCHEDULER_SHEET_ID)

print("=" * 60)
print("LEAGUE SHEET WORKSHEETS:")
print("=" * 60)
for ws in league_sheet.worksheets():
    print(f"  - {ws.title}")

print("\n" + "=" * 60)
print("SCHEDULER SHEET WORKSHEETS:")
print("=" * 60)
for ws in scheduler_sheet.worksheets():
    print(f"  - {ws.title}")

# Show sample data from key worksheets
print("\n" + "=" * 60)
print("FRANCHISE LOOKUP (first 3 rows):")
print("=" * 60)
franchise_ws = league_sheet.worksheet("FranchiseLookup")
data = franchise_ws.get_all_records()
for i, row in enumerate(data[:3]):
    print(f"{i+1}. {row}")

print("\n" + "=" * 60)
print("MANUAL SUBMISSIONS (first 10 rows raw):")
print("=" * 60)
manual_sub_ws = scheduler_sheet.worksheet("Manual Submissions")
subs_raw = manual_sub_ws.get_all_values()
if subs_raw:
    for i, row in enumerate(subs_raw[:11]):  # Header + 10 rows
        print(f"{i}. {row}")
else:
    print("  (No data)")

print("\n" + "=" * 60)
print("MANUAL GAMES (all rows):")
print("=" * 60)
manual_games_ws = scheduler_sheet.worksheet("ManualGames")
try:
    games = manual_games_ws.get_all_records()
    if games:
        for i, row in enumerate(games):
            print(f"{i+1}. {row}")
    else:
        print("  (No manual games yet)")
except Exception as e:
    print(f"  Error: {e}")
    games_raw = manual_games_ws.get_all_values()
    for i, row in enumerate(games_raw[:11]):
        print(f"{i}. {row}")
