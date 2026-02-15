"""
Fetch Apps Script code from Google Sheets using the Apps Script API.

This requires OAuth2 user authentication, not service account auth.
You'll need to:
1. Enable Apps Script API in Google Cloud Console
2. Create OAuth2 credentials (not service account)
3. Go through OAuth flow once to get a token
"""

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import os
import pickle
from dotenv import load_dotenv

load_dotenv()

# Apps Script API requires these scopes
SCOPES = ['https://www.googleapis.com/auth/script.projects.readonly']

def get_script_content(script_id):
    """Fetch Apps Script content using the Apps Script API."""
    creds = None

    # Token file stores the user's access and refresh tokens
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)

    # If there are no (valid) credentials, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # This requires oauth credentials JSON file
            flow = InstalledAppFlow.from_client_secrets_file(
                'oauth_credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)

    # Build the Apps Script API service
    service = build('script', 'v1', credentials=creds)

    # Get the project content
    try:
        project = service.projects().getContent(scriptId=script_id).execute()

        print(f"Project: {project.get('title', 'Untitled')}")
        print("=" * 60)

        for file in project.get('files', []):
            print(f"\nFile: {file['name']} (Type: {file['type']})")
            print("-" * 60)
            print(file.get('source', '(No source)'))
            print()

        return project
    except Exception as e:
        print(f"Error fetching script: {e}")
        return None

if __name__ == "__main__":
    # You need to get the script ID from the Apps Script editor URL
    # The URL looks like: https://script.google.com/d/SCRIPT_ID_HERE/edit

    script_id = input("Enter your Apps Script project ID: ").strip()
    if script_id:
        get_script_content(script_id)
    else:
        print("No script ID provided")
        print("\nTo find your script ID:")
        print("1. Open your Google Sheet")
        print("2. Extensions → Apps Script")
        print("3. Copy the ID from the URL (between /d/ and /edit)")
