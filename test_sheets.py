import gspread
from google.oauth2.service_account import Credentials
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Path to your service account JSON
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "composed-falcon-482703-s9-5743dd74a2e0.json")

# The ID of your Google Sheet (from the URL)
SHEET_ID = os.getenv("SCHEDULER_SHEET_ID")

# Define the API scopes
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

# Authenticate with the service account
creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
client = gspread.authorize(creds)

# Open the sheet and access a worksheet
sheet = client.open_by_key(SHEET_ID)
worksheet = sheet.worksheet("Teams")  # Replace with your tab name

# Read data
data = worksheet.get_all_records()
print("Data from Teams tab:")
print(data)

# Write a test row (optional)
worksheet.append_row(["TEST_TEAM", "TEST_OWNER", "TEST_ID"])
print("✅ Successfully wrote a test row to Teams tab")
