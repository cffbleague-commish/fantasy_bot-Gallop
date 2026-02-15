# Backfill Guide - Historical Data Import

## What is Backfilling?

Backfilling imports historical rookie and player data from past seasons to populate your sheets with correct eligibility information.

This is useful when:
- Setting up the system for the first time
- You want to verify the scripts work correctly
- You need to rebuild data after changes
- You want historical records in the system

## Quick Start

### Option 1: Use the Menu (Easiest)

1. Open your Google Sheet
2. **⚡ League Management → 📦 Backfill Data → Backfill Historical Data**
3. Enter year range (e.g., `2021,2024`)
4. Confirm
5. Wait for completion (check View → Logs)

### Option 2: Run Manually

In Apps Script editor:
```javascript
backfillHistoricalData(2021, 2024)
```

## What Backfill Does

When you run `backfillHistoricalData(2021, 2024)`, it:

1. **Imports rookies** for each year (2021, 2022, 2023, 2024)
   - Fetches from MFL API
   - Adds to RookieLedger sheet

2. **Creates player copies** for each rookie
   - 2 copies per conference
   - All conferences (AAC, ACC, B10, B12, P12, SEC)

3. **Calculates eligibility years**
   - Based on rookie year vs current year
   - Example: 2021 rookie in 2025 = 4 years used

4. **Updates current ownership**
   - Syncs from current MFL rosters
   - Assigns copies to teams

## Example Scenarios

### Scenario 1: Brand New Setup

**Goal**: Start fresh with 4 years of history

```javascript
// Run this once
backfillHistoricalData(2021, 2024)
```

**Result**:
- ~1000 rookies imported (250/year × 4 years)
- ~12,000 player copies created (1000 × 6 conferences × 2 copies)
- Eligibility correctly calculated for each

### Scenario 2: Test Before Production

**Goal**: Verify scripts work on a test sheet

```javascript
// Test with just 2 years first
backfillHistoricalData(2023, 2024)

// Verify it worked
verifyBackfillIntegrity()

// If good, clear and do full backfill
resetAllData()
backfillHistoricalData(2021, 2024)
```

### Scenario 3: Just Import Rookies

**Goal**: Import rookies but manually create copies later

```javascript
backfillRookiesOnly(2021, 2024)
```

## Verification

After backfill, verify data integrity:

**Using Menu**:
```
⚡ League Management → 📦 Backfill Data → Verify Data Integrity
```

**Or manually**:
```javascript
verifyBackfillIntegrity()
```

**This checks**:
- ✅ RookieLedger has data
- ✅ PlayerCopies has expected number of copies
- ✅ Eligibility years are reasonable
- ✅ No active players with maxed eligibility
- ✅ Conference distribution looks correct

## Understanding the Output

### Eligibility Calculation

For a 2021 rookie in current year 2025:

```
Years Used = Current Year - Rookie Year
          = 2025 - 2021
          = 4 years

Status: Graduated (maxed out eligibility)
Active: false
```

For a 2023 rookie in 2025:

```
Years Used = 2025 - 2023 = 2 years
Status: Eligible (2 years remaining)
Active: true
```

### Player Copy Example

After backfill, a 2023 rookie "Joe Burrow" would have:

```
B10 Conference:
  - PC-12345-B10-1 (Copy 1)
    EligibilityYearsUsed: 2
    Active: true
    CreatedSeason: 2023

  - PC-12345-B10-2 (Copy 2)
    EligibilityYearsUsed: 2
    Active: true
    CreatedSeason: 2023

ACC Conference:
  - PC-12345-ACC-1 (Copy 1)
  - PC-12345-ACC-2 (Copy 2)

... (same for all 6 conferences)
```

## Troubleshooting

### Problem: "MFL API Error"

**Cause**: API key not set or invalid

**Fix**:
```javascript
initializeScriptProperties()
// Then edit MFL_API_KEY in Script Properties
```

### Problem: No rookies imported

**Cause**: No rookie data for that year in MFL

**Fix**:
- Check that year exists in MFL
- Verify league ID is correct
- Try a different year

### Problem: Too many/few player copies

**Cause**: Conferences might have changed

**Fix**:
```javascript
// Check your conferences
getConferences()

// Expected copies = rookies × conferences × 2
```

### Problem: Eligibility years seem wrong

**Cause**: Current year might be incorrect

**Fix**:
```javascript
// Check current year setting
const config = getConfig()
Logger.log(config.mfl.currentYear)

// Update if needed in Script Properties
```

## Resetting Data (Use with Caution!)

If you need to start over:

```javascript
resetAllData()  // Deletes all rookies and player copies
```

**⚠️ WARNING**: This cannot be undone! Only use if:
- You're testing
- You want to completely rebuild
- You have a backup

## Best Practices

### 1. Test First
```javascript
// Test with 1 year
backfillHistoricalData(2024, 2024)
verifyBackfillIntegrity()
```

### 2. Incremental Backfill
```javascript
// Do one year at a time
backfillHistoricalData(2021, 2021)
backfillHistoricalData(2022, 2022)
// etc.
```

### 3. Verify After Each Step
```javascript
backfillHistoricalData(2021, 2024)
verifyBackfillIntegrity()  // Always verify!
```

### 4. Keep Logs
- View → Logs shows all output
- Copy/paste logs for your records
- Helps troubleshooting

## Timeline Example

**League started in 2021, now in 2025:**

```javascript
// 1. Backfill historical data
backfillHistoricalData(2021, 2024)

// 2. Verify it worked
verifyBackfillIntegrity()

// 3. Start current season
startNewSeason("2025")

// Now you have:
// - 2021 rookies: 4 years used, graduated
// - 2022 rookies: 3 years used, 1 year left
// - 2023 rookies: 2 years used, 2 years left
// - 2024 rookies: 1 year used, 3 years left
// - 2025 rookies: 0 years used, 4 years left
```

## Next Steps After Backfill

1. **Verify data** - Run `verifyBackfillIntegrity()`
2. **Check samples** - Manually look at a few player copies
3. **Update ownership** - Run `syncRosterOwnership(2025)`
4. **Set up triggers** - Automate weekly roster syncs
5. **Build Discord commands** - Let users query this data

## Questions?

- Check the logs: **View → Logs**
- Review data manually in sheets
- Run verification: `verifyBackfillIntegrity()`
