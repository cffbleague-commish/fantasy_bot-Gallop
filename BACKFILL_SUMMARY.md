# Backfill Historical Data - Quick Summary

## What I Created

✅ **Backfill.gs** - New Apps Script file with backfill functions
✅ **Updated Main.gs** - Added backfill menu options
✅ **BACKFILL_GUIDE.md** - Complete documentation

## How to Backfill Historical Data

### Easiest Way (Using Menu)

1. **Add Backfill.gs** to your Apps Script project
2. **Refresh your Google Sheet**
3. **⚡ League Management → 📦 Backfill Data → Backfill Historical Data**
4. Enter years: `2021,2024`
5. Click OK and wait

### What It Does

When you backfill 2021-2024:

1. **Imports all rookies** from MFL for each year
   - Adds to RookieLedger sheet
   - ~250 rookies per year

2. **Creates player copies** for each rookie
   - 2 copies per conference (AAC, ACC, B10, B12, P12, SEC)
   - 12 copies per player (6 conferences × 2)

3. **Calculates eligibility**
   - 2021 rookies → 4 years used (graduated)
   - 2022 rookies → 3 years used (1 left)
   - 2023 rookies → 2 years used (2 left)
   - 2024 rookies → 1 year used (3 left)

4. **Updates current ownership**
   - Syncs from MFL rosters
   - Assigns copies to current teams

## Example Output

After running `backfillHistoricalData(2021, 2024)`:

```
RookieLedger:
  ~1000 rows (250 rookies × 4 years)

PlayerCopies:
  ~12,000 rows (1000 rookies × 6 conferences × 2 copies)

Eligibility:
  2021 rookies: Active=false (graduated)
  2022-2024 rookies: Active=true (still eligible)
```

## Verify It Worked

After backfill, run verification:

```
⚡ League Management → 📦 Backfill Data → Verify Data Integrity
```

Or in Apps Script:
```javascript
verifyBackfillIntegrity()
```

Checks:
- ✅ RookieLedger has data
- ✅ PlayerCopies has expected number
- ✅ Eligibility years are correct
- ✅ Conference distribution looks good

## Important Notes

### Backfill is Safe
- Doesn't overwrite existing data
- Skips duplicates automatically
- Can be run multiple times

### Current Year Setting
Make sure `MFL_CURRENT_YEAR` is set correctly in Script Properties:
```
Script Properties → MFL_CURRENT_YEAR = 2025
```

This determines eligibility calculations!

### Conference List
Backfill uses your FranchiseLookup sheet to get conferences.
Make sure all conferences are represented:
- ACC
- B10
- B12
- P12
- SEC
- AAC

## When to Use Backfill

**Use backfill when:**
- ✅ Setting up the system for first time
- ✅ You want historical data populated
- ✅ Testing the scripts
- ✅ Rebuilding after major changes

**Don't backfill when:**
- ❌ You already have current data and it's working
- ❌ You just need to update current season

## After Backfill

Once backfill is complete, you're ready for normal operations:

1. **Weekly roster sync**
   ```
   ⚡ League Management → 🔄 Sync Data → Sync Roster Ownership
   ```

2. **End of season**
   ```
   ⚡ League Management → 📅 Season Management → End Season
   ```

3. **Year rollover**
   ```
   ⚡ League Management → 📅 Season Management → Rollover to New Year
   ```

4. **Start new season**
   ```
   ⚡ League Management → 📅 Season Management → Start New Season
   ```

## Files to Add

To enable backfill, add this file to Apps Script:

📄 **apps_script/Backfill.gs** (new file)

And **Main.gs** has been updated with backfill menu options.

## Ready to Go!

See **BACKFILL_GUIDE.md** for detailed instructions and troubleshooting.
