# Apps Script Setup - Quick Guide

## What I Created

Clean, organized Apps Script files for your league eligibility tracking:

📁 **apps_script/** folder contains:
- `Config.gs` - Settings and configuration
- `MFL_API.gs` - MFL API integration
- `Utilities.gs` - Helper functions
- `RookieIngestion.gs` - Import rookies
- `PlayerCopies.gs` - Manage player copies
- `Redshirts.gs` - Auto-apply redshirts
- `Main.gs` - Workflows and custom menu
- `README.md` - Complete documentation

## How It Works

### Automatic Features
✅ Rookie ingestion from MFL
✅ Player copy creation (2 per conference)
✅ Roster ownership tracking
✅ Traditional redshirt detection (Taxi squad)
✅ Medical redshirt detection (IR)
✅ Eligibility year increments
✅ Graduated player deactivation

### Key Workflows

**Annual Cycle:**
```
1. End Season → Process Redshirts
2. Rollover → Increment Eligibility
3. Start New Season → Ingest Rookies
```

**During Season:**
```
Sync Roster Ownership (weekly/bi-weekly)
```

## Installation Steps

### 1. Open Apps Script
1. Open your Google Sheet (League sheet)
2. Extensions → Apps Script
3. Delete default `Code.gs`

### 2. Add Files
For each file in `apps_script/` folder:
1. Click **+** (Add a file)
2. Name it (e.g., "Config")
3. Copy/paste the code from the file

**Files to add:**
- Config.gs
- MFL_API.gs
- Utilities.gs
- RookieIngestion.gs
- PlayerCopies.gs
- Redshirts.gs
- Main.gs

### 3. Set API Key
1. In Apps Script, select function: `initializeScriptProperties`
2. Click **Run**
3. Authorize when prompted
4. Go to **Project Settings** → **Script Properties**
5. Edit `MFL_API_KEY` with your actual key

### 4. Test
1. Reload your Google Sheet
2. Look for custom menu: **⚡ League Management**
3. Try: Sync Data → Sync Roster Ownership

## What Changed from Old Apps Script

### Before (Problems)
❌ Duplicate function definitions
❌ Disorganized code across many files
❌ Hard to understand flow
❌ Missing features

### Now (Solutions)
✅ Each file has one clear purpose
✅ No duplicate functions
✅ Clear workflows (start season, end season, etc.)
✅ Auto-redshirt detection
✅ Complete documentation
✅ Custom menu for easy use

## Using the Custom Menu

After setup, you'll see this in your sheet:

```
⚡ League Management
  🔄 Sync Data
    • Sync Roster Ownership
    • Ingest Rookies
  📅 Season Management
    • Start New Season
    • End Season (Process Redshirts)
    • Rollover to New Year
  ⚙️ Initialize Settings
```

## Setting Up Automatic Triggers (Optional)

To run functions automatically:

1. In Apps Script: Click **Triggers** (clock icon)
2. Add trigger:
   - Function: `manualRosterSync`
   - Event: Time-driven
   - Type: Week timer
   - Day: Sunday
   - Time: 3am-4am

This will auto-sync rosters every Sunday!

## Next Steps

1. **Install the Apps Script** (follow steps above)
2. **Test with current year** - Run `syncRosterOwnership(2025)`
3. **Verify data** - Check that PlayerCopies sheet gets updated
4. **Add triggers** (optional) - For automatic weekly syncs
5. **Build Discord commands** - To view this data in Discord

## Discord Bot Integration

Your Discord bot will **read** from the sheets that Apps Script populates:

- `/roster <team>` - Shows PlayerCopies for a team
- `/player <name>` - Shows all copies of a player
- `/eligibility <player>` - Shows years used, redshirts

Apps Script handles the data syncing, Discord bot handles user interaction!

## Questions?

See `apps_script/README.md` for detailed documentation on each function.
