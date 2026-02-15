# Apps Script Organization

This document explains the organization of the Google Apps Script files for the fantasy football eligibility system.

## Core Files

### Config.gs
- **Purpose**: Configuration and constants
- **Key Functions**:
  - `getConfig()` - Returns all configuration settings
  - `initializeScriptProperties()` - Sets up script properties (API keys, etc.)

### MFL_API.gs
- **Purpose**: MyFantasyLeague API integration
- **Key Functions**:
  - `mflFetch(year, type, params)` - Generic MFL API caller
  - `fetchPlayers(year)` - Get all players with details
  - `fetchRookies(year)` - Get only rookies (filtered by draft_year)
  - `fetchTransactions(year)` - Get all transactions
  - `fetchRosters(year)` - Get current rosters

### Utilities.gs
- **Purpose**: Shared helper functions
- **Key Functions**:
  - `getConferences()` - Returns list of conferences from FranchiseLookup
  - `getFranchiseConferenceMap()` - Maps franchise IDs to conferences
  - `normalizeFranchiseId(id)` - Pads franchise ID to 4 digits
  - `getOrCreateSheet(name, headers)` - Sheet creation helper

### Menu.gs
- **Purpose**: Custom Google Sheets menu
- **Functions**:
  - `onOpen()` - Creates "League Management" menu
  - Menu items for backfill, roster updates, etc.

## Data Management

### Rookies.gs
- **Purpose**: Rookie ingestion and player copy creation
- **Key Functions**:
  - `ingestRookiesForYear(year)` - Import rookies from MFL API
  - `createPlayerCopiesForRookies(year)` - Create 2 copies per conference

### PlayerCopies.gs
- **Purpose**: Player copy structure and operations
- **Key Functions**:
  - `getPlayerCopiesSheet()` - Get PlayerCopies sheet reference
  - `findPlayerCopy(playerId, conference)` - Find specific copy
  - `updatePlayerCopyOwnership(year)` - Update ownership from current rosters

### Backfill.gs
- **Purpose**: Historical data backfill orchestration
- **Key Functions**:
  - `backfillHistoricalData(startYear, endYear)` - Full backfill workflow
  - `backfillHistoricalOwnership(years)` - Process auction/drop transactions
  - `backfillEligibilityYears(firstYear, currentYear)` - Calculate eligibility
  - `incrementalBackfill(year)` - Process one year at a time
  - `backfill2021()`, `backfill2022()`, etc. - Quick wrappers

**Important Notes**:
- Sets CurrentFranchiseID column to text format to preserve leading zeros
- Processes transactions chronologically (oldest first)
- Uses batch operations to avoid timeout

## Debugging & Maintenance

### Debug.gs
- **Purpose**: Consolidated debugging utilities
- **Key Functions**:
  - `debugRookieLedger()` - Check RookieLedger contents
  - `debugRookiesFetch(year)` - Debug fetchRookies() issues
  - `debugTransactionTypes(year)` - Show MFL transaction types
  - `debugTransactionSamples(year)` - Show sample transactions
  - `debugAuctionTransactions(year)` - Detailed auction analysis
  - `debugDropTransactions(year)` - Detailed drop analysis
  - `debugConferences()` - Check conference mapping
  - `debugPlayerCopyIndex()` - Verify sheet structure
  - `debugConferenceMismatch()` - Find wrong conference assignments
  - `debugFullBackfill(year)` - Run all debug checks

### Maintenance.gs
- **Purpose**: Data fixes and integrity checks
- **Key Functions**:
  - `fixFranchiseIdPadding()` - Fix franchise IDs stripped of leading zeros
  - `setFranchiseIdColumnAsText()` - Set column format to text
  - `clearInvalidOwnership()` - Remove mismatched ownerships
  - `recreatePlayerCopiesSheet()` - Delete and recreate with correct headers
  - `recreateRookieLedger()` - Recreate rookie sheet
  - `recreateBothSheets()` - Fresh start for both sheets
  - `fixAndCleanOwnership()` - Combined fix workflow
  - `verifyBackfillIntegrity()` - Check data consistency

## Common Workflows

### Initial Setup
1. `initializeScriptProperties()` - Set MFL_API_KEY
2. `recreateBothSheets()` - Create fresh sheets
3. `backfill2021()` - Start backfill

### Incremental Backfill (Recommended)
```javascript
backfill2021();  // Run and wait
backfill2022();  // Run and wait
backfill2023();  // Run and wait
backfill2024();  // Run and wait
finalizeBackfill(); // Update current ownership
```

### Troubleshooting
1. `debugConferenceMismatch()` - Find issues
2. `verifyBackfillIntegrity()` - Check overall health
3. `fixAndCleanOwnership()` - Fix common issues
4. `debugFullBackfill(2021)` - Deep dive on specific year

### Daily Operations
- `updatePlayerCopyOwnership("2024")` - Sync with current MFL rosters
- `ingestRookiesForYear("2025")` - Add new rookie class

## Data Structures

### RookieLedger Sheet
| Column | Description |
|--------|-------------|
| MFL_Player_ID | MFL player ID |
| Name | Player name |
| Position | QB/RB/WR/TE |
| Year | Rookie year |
| Team | NFL team |
| DateAdded | When added to ledger |

### PlayerCopies Sheet
| Column | Description |
|--------|-------------|
| PlayerCopyID | Format: PC-{playerId}-{conference}-{ordinal} |
| MFL_Player_ID | MFL player ID |
| PlayerName | Player name |
| Conference | AAC/ACC/B10/B12/P12/SEC |
| CurrentFranchiseID | 4-digit franchise ID (text format!) |
| EligibilityYearsUsed | 0-4 years |
| TraditionalRedshirtUsed | Boolean |
| MedicalRedshirtUsed | Boolean |
| CreatedSeason | Year copy was created |
| Active | Boolean (false when maxed) |
| LastUpdated | Timestamp |

### FranchiseLookup Sheet (Manual)
| Column | Description |
|--------|-------------|
| Franchise ID | 3-digit ID (001-100) |
| Conference | AAC/ACC/B10/B12/P12/SEC |
| Team Name | Franchise name |

## Important Notes

### Franchise ID Format
- **CRITICAL**: CurrentFranchiseID column MUST be formatted as TEXT
- Google Sheets strips leading zeros if stored as numbers
- Always use `.padStart(3, "0")` when setting franchise IDs (001-100)
- Run `setFranchiseIdColumnAsText()` after sheet creation

### Conference Mapping
- `getConferences()` returns conferences in **alphabetical order**: AAC, ACC, B10, B12, P12, SEC
- MFL transaction conferenceIndex maps to this array (0=AAC, 1=ACC, 2=B10, 3=B12, 4=P12, 5=SEC)
- Franchise IDs are immutable - they never change conferences

### Transaction Types (MFL)
- `AUCTION_WON` - Format: `"playerId|conferenceIndex|"`
- `FREE_AGENT` - Format: `"|playerId1,playerId2,|"` (drops)
- `BBID_PROCESSING` - Blind bid processing (contains drops/adds)
- Others: WAIVER, TRADE, etc.

### Performance
- Backfill uses batch operations to avoid 6-minute timeout
- Process one year at a time with `incrementalBackfill()`
- Avoid individual `setValue()` calls in loops

## File Cleanup
The following old files have been consolidated and removed:
- ~~CheckRookieLedger.gs~~ → Debug.gs
- ~~DebugConferenceMismatch.gs~~ → Debug.gs
- ~~DebugOwnership.gs~~ → Debug.gs
- ~~DebugRookies2021.gs~~ → Debug.gs
- ~~DebugTests.gs~~ → Debug.gs
- ~~FixConferenceMismatch.gs~~ → Maintenance.gs
- ~~FixFranchiseIdPadding.gs~~ → Maintenance.gs
- ~~InspectMFLData.gs~~ → Debug.gs
- ~~InspectTransactions.gs~~ → Debug.gs
