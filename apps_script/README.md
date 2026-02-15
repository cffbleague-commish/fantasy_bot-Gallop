## College Football Dynasty League - Apps Script

Clean, organized Apps Script for managing player eligibility, redshirts, and copies across conferences.

## 📁 File Structure

```
Config.gs           - Central configuration and settings
MFL_API.gs         - MyFantasyLeague API client
Utilities.gs       - Shared helper functions
RookieIngestion.gs - Import rookies from MFL
PlayerCopies.gs    - Create and manage player copies
Redshirts.gs       - Auto-detect and apply redshirts
Main.gs            - Orchestration and workflows
```

## 🚀 Setup Instructions

### 1. Add Files to Apps Script

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete the default `Code.gs` file
4. Create each file above (click + button)
5. Copy/paste the code from each `.gs` file

### 2. Set Script Properties

Run `initializeScriptProperties()` once:

1. In Apps Script editor, select `Main.gs`
2. Select function: `initializeScriptProperties`
3. Click Run
4. Edit the properties:
   - `MFL_LEAGUE_ID`: Your league ID (default: 12011)
   - `MFL_API_KEY`: Your MFL API key
   - `MFL_CURRENT_YEAR`: Current season (default: 2025)

### 3. Authorize

First time you run, Google will ask for permissions:
- View and manage spreadsheets
- Connect to external service (MFL API)

## 📊 Required Sheets

Your spreadsheet must have these sheets:

### FranchiseLookup
Columns: `Franchise ID | Team Name | Conference | ...`

Example:
```
0001 | Ohio State Buckeyes | B10
0002 | Alabama Crimson Tide | SEC
```

Other sheets will be auto-created when needed:
- **RookieLedger** - All rookies by year
- **PlayerCopies** - Player copy tracking
- **Transactions** - MFL transaction history
- **RosterSnapshot** - Roster snapshots by year

## 🔄 Annual Workflow

### Start of Season (After NFL Draft)

**Option A: Manual Steps**
```
1. Run: startNewSeason(2025)
   - Ingests rookies
   - Creates player copies
   - Updates ownership
```

**Option B: Use Menu**
```
⚡ League Management → 📅 Season Management → Start New Season
```

### During Season (Weekly/Bi-weekly)

Sync roster ownership:
```javascript
syncRosterOwnership(2025)
```

Or use menu:
```
⚡ League Management → 🔄 Sync Data → Sync Roster Ownership
```

### End of Season (Before Rollover)

Process redshirts:
```javascript
endSeasonProcessing(2024)
```

This automatically applies:
- **Traditional redshirts** for rookies who stayed on Taxi all season
- **Medical redshirts** for players who stayed on IR all season

### Year Rollover (New League Year)

Increment eligibility:
```javascript
rolloverToNewYear(2024, 2025)
```

This increments `EligibilityYearsUsed` for all active copies.

### Complete Annual Cycle (All-in-One)

```javascript
completeYearlyWorkflow(2024, 2025)
```

Runs all three steps automatically!

## 🎯 Key Functions

### Rookie Management
```javascript
ingestRookiesForYear(2025)           // Import rookies from MFL
createPlayerCopiesForRookies(2025)   // Create 2 copies per conference
```

### Ownership
```javascript
updatePlayerCopyOwnership(2025)      // Sync from MFL rosters
```

### Redshirts
```javascript
processRedshirtsForSeason(2024)      // Auto-apply redshirts
processTraditionalRedshirts(2024)    // Taxi squad only
processMedicalRedshirts(2024)        // IR only
```

### Eligibility
```javascript
incrementEligibilityYears(2024, 2025)  // Year rollover
```

## 🤖 Automation (Optional)

Set up time-based triggers:

1. In Apps Script: **Triggers** (clock icon)
2. Add trigger:
   - Function: `manualRosterSync`
   - Event source: Time-driven
   - Type: Week timer
   - Day: Sunday
   - Hour: 3am-4am

Repeat for other functions as needed.

## 📋 Player Copy Lifecycle

```
1. NFL Draft
   ↓
2. Rookie Ingested → RookieLedger
   ↓
3. Player Copies Created (2 per conference) → PlayerCopies
   ↓
4. Team Auctions Player → CurrentFranchiseID updated
   ↓
5. [OPTIONAL] Traditional Redshirt (rookie on Taxi all year)
   ↓
6. [OPTIONAL] Medical Redshirt (on IR all year)
   ↓
7. Each Year: EligibilityYearsUsed++
   ↓
8. After 4 years → Active = false (graduated)
```

## ⚙️ Configuration

Edit eligibility rules in `Config.gs`:

```javascript
eligibility: {
  maxYears: 4,                       // Total years of eligibility
  allowTraditionalRedshirt: true,    // Taxi squad redshirt
  allowMedicalRedshirt: true,        // IR redshirt
  maxCopiesPerConference: 2          // Copies per conference
}
```

## 🐛 Troubleshooting

**Problem**: "MFL_API_KEY not set"
- **Solution**: Run `initializeScriptProperties()` and add your API key

**Problem**: "FranchiseLookup sheet not found"
- **Solution**: Create FranchiseLookup sheet with required columns

**Problem**: No rookies imported
- **Solution**: Check that `MFL_CURRENT_YEAR` matches the year you're importing

**Problem**: Redshirts not applying
- **Solution**: Ensure transactions contain `promoted/demoted/activated/deactivated` fields

## 📖 Examples

### Import 2025 Rookies
```javascript
ingestRookiesForYear("2025")
// ✅ Ingested 250 rookies for 2025
// ✅ Created 3000 player copies for 2025 rookies
```

### Process End of 2024 Season
```javascript
endSeasonProcessing("2024")
// ✅ Applied 15 traditional redshirts, 8 medical redshirts
```

### Complete 2024→2025 Transition
```javascript
completeYearlyWorkflow("2024", "2025")
// ✅ Season 2024 ended
// ✅ Incremented eligibility for 2847 player copies
// ✅ Ingested 258 rookies for 2025
// ✅ Complete! 2024 ended, 2025 started
```

## 🎨 Custom Menu

After setup, you'll see a custom menu in your Google Sheet:

```
⚡ League Management
  🔄 Sync Data
    ├─ Sync Roster Ownership
    └─ Ingest Rookies
  📅 Season Management
    ├─ Start New Season
    ├─ End Season (Process Redshirts)
    └─ Rollover to New Year
  ⚙️ Initialize Settings
```

Use this menu for easy access to all functions!

## 📞 Support

Questions? Check the code comments or review the function documentation in each `.gs` file.
