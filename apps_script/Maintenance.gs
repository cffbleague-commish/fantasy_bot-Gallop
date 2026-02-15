/**
 * MAINTENANCE UTILITIES
 * Functions to fix data issues and maintain data integrity
 */

/**
 * Fix all franchise IDs in PlayerCopies to be 3-digit padded format
 * Google Sheets may strip leading zeros when storing as numbers
 */
function fixFranchiseIdPadding() {
  Logger.log("=== Fixing Franchise ID Padding ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log("❌ PlayerCopies sheet not found");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);
  const ownerCol = 4; // CurrentFranchiseID

  Logger.log(`Processing ${copies.length} player copies...\n`);

  let fixed = 0;

  // Fix franchise IDs in memory
  copies.forEach((row, idx) => {
    const franchiseId = row[ownerCol];

    // Skip if empty
    if (!franchiseId || franchiseId === "") return;

    // Convert to number first to strip any leading zeros, then pad to 3 digits
    const paddedId = String(Number(franchiseId)).padStart(3, "0");

    // Only update if it changed
    if (paddedId !== franchiseId) {
      Logger.log(`Row ${idx + 2}: "${franchiseId}" -> "${paddedId}"`);
      row[ownerCol] = paddedId;
      fixed++;
    }
  });

  // Write all updates at once
  if (fixed > 0) {
    // Format the column as plain text FIRST to prevent number conversion
    const ownerRange = sheet.getRange(2, ownerCol + 1, copies.length, 1);
    ownerRange.setNumberFormat("@"); // @ means plain text format

    // Then write the data
    sheet.getRange(2, 1, copies.length, copies[0].length).setValues(copies);

    Logger.log(`\n✅ Fixed ${fixed} franchise IDs`);
  } else {
    Logger.log("\n✅ All franchise IDs already correctly formatted");
  }

  return fixed;
}

/**
 * Set CurrentFranchiseID column to text format to prevent zero-stripping
 */
function setFranchiseIdColumnAsText() {
  Logger.log("=== Setting CurrentFranchiseID Column as Text ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log("❌ PlayerCopies sheet not found");
    return;
  }

  const lastRow = sheet.getLastRow();

  // Column 5 is CurrentFranchiseID (index 4, but getRange is 1-indexed)
  const ownerRange = sheet.getRange(2, 5, Math.max(1, lastRow - 1), 1);
  ownerRange.setNumberFormat("@"); // @ means plain text format

  Logger.log("✅ CurrentFranchiseID column set to text format");
  Logger.log("This will prevent Google Sheets from stripping leading zeros");
}

/**
 * Clear ownership for all franchises assigned to copies in wrong conferences
 * This fixes data from issues where franchise IDs weren't found in lookup
 */
function clearInvalidOwnership() {
  Logger.log("=== Clearing Invalid Ownership ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log("❌ PlayerCopies sheet not found");
    return;
  }

  // Get franchise-to-conference mapping
  const franchiseMap = getFranchiseConferenceMap();

  // Get all player copies
  const fullData = sheet.getDataRange().getValues();
  const copies = fullData.slice(1);

  const copyIdCol = 0;
  const conferenceCol = 3;
  const ownerCol = 4;

  Logger.log(`Checking ${copies.length} player copies...\n`);

  let cleared = 0;

  // Update data in memory
  copies.forEach((row) => {
    const copyId = row[copyIdCol];
    const copyConference = row[conferenceCol];
    const franchiseId = row[ownerCol];

    // Skip if no owner
    if (!franchiseId || franchiseId === "") return;

    // Get franchise's actual conference
    const franchiseConference = franchiseMap[franchiseId];

    if (!franchiseConference) {
      Logger.log(`⚠️  Franchise ${franchiseId} not found, clearing ownership of ${copyId}`);
      row[ownerCol] = "";
      cleared++;
      return;
    }

    // Check if franchise conference matches copy conference
    if (franchiseConference !== copyConference) {
      Logger.log(`Clearing ${copyId}: Franchise ${franchiseId} (${franchiseConference}) had copy in ${copyConference}`);
      row[ownerCol] = "";
      cleared++;
    }
  });

  // Write all updates at once
  if (cleared > 0) {
    sheet.getRange(2, 1, copies.length, copies[0].length).setValues(copies);
    Logger.log(`\n✅ Cleared ownership for ${cleared} mismatched copies`);
  } else {
    Logger.log("\n✅ No invalid ownership found!");
  }

  return cleared;
}

/**
 * Delete and recreate PlayerCopies sheet with correct headers
 */
function recreatePlayerCopiesSheet() {
  Logger.log('=== Recreating PlayerCopies Sheet ===');

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Delete existing sheet
  const existingSheet = ss.getSheetByName(config.sheets.playerCopies);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
    Logger.log('Deleted existing PlayerCopies sheet');
  }

  // Create new sheet with correct headers (including redshirt year columns)
  const sheet = ss.insertSheet(config.sheets.playerCopies);
  sheet.appendRow([
    "PlayerCopyID",
    "MFL_Player_ID",
    "PlayerName",
    "Conference",
    "CurrentFranchiseID",
    "EligibilityYearsUsed",
    "TraditionalRedshirtUsed",
    "MedicalRedshirtUsed",
    "CreatedSeason",
    "Active",
    "LastUpdated",
    "TraditionalRedshirtYear",
    "MedicalRedshirtYear"
  ]);
  sheet.getRange(1, 1, 1, 13).setFontWeight("bold");

  // Set CurrentFranchiseID column to text format
  sheet.getRange(2, 5, 1000, 1).setNumberFormat("@");

  Logger.log('✅ PlayerCopies sheet recreated with correct headers');
  Logger.log('✅ CurrentFranchiseID column set to text format');
  Logger.log('Run backfill to populate data');
}

/**
 * Add TraditionalRedshirtYear and MedicalRedshirtYear columns to existing PlayerCopies sheet
 * Use this to migrate an existing sheet without losing data
 */
function addRedshirtYearColumns() {
  Logger.log('=== Adding Redshirt Year Columns ===');

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log('❌ PlayerCopies sheet not found');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Check if columns already exist
  if (headers.includes("TraditionalRedshirtYear") && headers.includes("MedicalRedshirtYear")) {
    Logger.log('✅ Redshirt year columns already exist');
    return;
  }

  const lastCol = sheet.getLastColumn();

  // Add headers if they don't exist
  if (!headers.includes("TraditionalRedshirtYear")) {
    sheet.getRange(1, lastCol + 1).setValue("TraditionalRedshirtYear");
    sheet.getRange(1, lastCol + 1).setFontWeight("bold");
    Logger.log('Added TraditionalRedshirtYear column');
  }

  if (!headers.includes("MedicalRedshirtYear")) {
    const newLastCol = sheet.getLastColumn();
    sheet.getRange(1, newLastCol + 1).setValue("MedicalRedshirtYear");
    sheet.getRange(1, newLastCol + 1).setFontWeight("bold");
    Logger.log('Added MedicalRedshirtYear column');
  }

  Logger.log('✅ Redshirt year columns added successfully');
  Logger.log('Re-run backfill with logging to populate the year values');
}

/**
 * Delete and recreate RookieLedger sheet
 */
function recreateRookieLedger() {
  Logger.log('=== Recreating RookieLedger Sheet ===');

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Delete existing sheet
  const existingSheet = ss.getSheetByName(config.sheets.rookieLedger);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
    Logger.log('Deleted existing RookieLedger sheet');
  }

  // Create new sheet with correct headers
  const sheet = ss.insertSheet(config.sheets.rookieLedger);
  sheet.appendRow(["MFL_Player_ID", "Name", "Position", "Year", "Team", "DateAdded"]);
  sheet.getRange(1, 1, 1, 6).setFontWeight("bold");

  Logger.log('✅ RookieLedger sheet recreated');
  Logger.log('Ready for backfill');
}

/**
 * Recreate both sheets - complete fresh start
 */
function recreateBothSheets() {
  recreateRookieLedger();
  recreatePlayerCopiesSheet();
  Logger.log('\n✅ Both sheets recreated - ready for backfill!');
}

/**
 * Fix franchise ID padding and clear invalid ownership
 * Run this if you notice franchise IDs without leading zeros
 */
function fixAndCleanOwnership() {
  Logger.log("=== Fix and Clean Ownership ===\n");

  // Step 1: Set column format to text
  setFranchiseIdColumnAsText();
  Logger.log("\n" + "=".repeat(60) + "\n");

  // Step 2: Fix franchise ID padding
  const fixed = fixFranchiseIdPadding();
  Logger.log("\n" + "=".repeat(60) + "\n");

  // Step 3: Clear invalid ownership
  const cleared = clearInvalidOwnership();

  Logger.log("\n" + "=".repeat(60));
  Logger.log(`✅ COMPLETE: Fixed ${fixed} franchise IDs, cleared ${cleared} invalid ownerships`);
}

/**
 * Verify backfill integrity
 * Checks that data is consistent and makes sense
 */
function verifyBackfillIntegrity() {
  Logger.log('=== Verifying Backfill Integrity ===\n');

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Check 1: RookieLedger exists and has data
  const rookieSheet = ss.getSheetByName(config.sheets.rookieLedger);
  if (!rookieSheet) {
    Logger.log('❌ RookieLedger sheet not found');
    return false;
  }

  const rookieCount = rookieSheet.getLastRow() - 1;
  Logger.log(`✅ RookieLedger: ${rookieCount} rookies`);

  // Check 2: PlayerCopies exists and has data
  const copiesSheet = getPlayerCopiesSheet();
  const copiesCount = copiesSheet.getLastRow() - 1;
  Logger.log(`✅ PlayerCopies: ${copiesCount} copies`);

  // Check 3: Each rookie should have copies
  const conferences = getConferences();
  const expectedCopies = rookieCount * conferences.length * config.eligibility.maxCopiesPerConference;

  if (copiesCount < expectedCopies * 0.9) {
    Logger.log(`⚠️  Warning: Expected ~${expectedCopies} copies, found ${copiesCount}`);
  } else {
    Logger.log(`✅ Copy count looks good (expected ~${expectedCopies})`);
  }

  // Check 4: Franchise ID formatting
  const copiesData = copiesSheet.getDataRange().getValues();
  const copies = copiesData.slice(1);
  const ownerCol = 4;

  let unpaddedCount = 0;
  copies.forEach(row => {
    const franchiseId = row[ownerCol];
    if (franchiseId && franchiseId !== "" && String(franchiseId).length < 3) {
      unpaddedCount++;
    }
  });

  if (unpaddedCount > 0) {
    Logger.log(`⚠️  Warning: ${unpaddedCount} franchise IDs are not properly padded`);
    Logger.log(`   Run fixFranchiseIdPadding() to fix this`);
  } else {
    Logger.log(`✅ All franchise IDs properly formatted`);
  }

  // Check 5: Conference mismatches
  const mismatches = debugConferenceMismatch();
  if (mismatches && mismatches.length > 0) {
    Logger.log(`\n⚠️  Warning: ${mismatches.length} conference mismatches found`);
    Logger.log(`   Run clearInvalidOwnership() to fix this`);
  }

  Logger.log('\n✅ Integrity check complete');
  return true;
}
