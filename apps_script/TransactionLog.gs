/**
 * TRANSACTION LOG
 * Creates a visible log of all transactions processed during backfill
 * This helps with manual auditing and verification
 */

/**
 * Create or get the TransactionLog sheet
 * NOTE: This function only CREATES the sheet if it doesn't exist.
 * It does NOT clear or recreate an existing sheet.
 */
function getTransactionLogSheet() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("TransactionLog");

  if (!sheet) {
    Logger.log("  TransactionLog sheet not found - creating new sheet");
    sheet = ss.insertSheet("TransactionLog");
    sheet.appendRow([
      "Timestamp",
      "Year",
      "Type",
      "FranchiseID",
      "FranchiseName",
      "Conference",
      "PlayerID",
      "PlayerName",
      "CopyAssigned",
      "Action",
      "BidAmount",
      "TransferEligible",
      "RawTransaction"
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight("bold");
    sheet.setFrozenRows(1);

    // Set column widths for readability
    sheet.setColumnWidth(1, 150);  // Timestamp
    sheet.setColumnWidth(2, 50);   // Year
    sheet.setColumnWidth(3, 100);  // Type
    sheet.setColumnWidth(4, 80);   // FranchiseID
    sheet.setColumnWidth(5, 150);  // FranchiseName
    sheet.setColumnWidth(6, 90);   // Conference
    sheet.setColumnWidth(7, 80);   // PlayerID
    sheet.setColumnWidth(8, 150);  // PlayerName
    sheet.setColumnWidth(9, 150);  // CopyAssigned
    sheet.setColumnWidth(10, 150); // Action
    sheet.setColumnWidth(11, 80);  // BidAmount
    sheet.setColumnWidth(12, 100); // TransferEligible
  }

  return sheet;
}

/**
 * Clear the transaction log
 * WARNING: This deletes all transaction history! Only call manually when starting fresh.
 */
function clearTransactionLog() {
  // Log where this was called from to help debug unexpected clears
  Logger.log("⚠️  clearTransactionLog() called - clearing all transaction history");

  const sheet = getTransactionLogSheet();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).clearContent();
  }
  Logger.log("✅ Transaction log cleared");
}

/**
 * Clear transaction log entries for a specific year only
 * Use this to avoid duplicates when re-processing a year's transactions
 * OPTIMIZED: Filters in memory and rewrites sheet in one operation
 * @param {Number|String} year - The year to clear
 * @returns {Number} - Number of rows deleted
 */
function clearTransactionLogForYear(year) {
  const targetYear = Number(year);
  Logger.log(`Clearing transaction log entries for ${targetYear}...`);

  const sheet = getTransactionLogSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("  No transactions to clear");
    return 0;
  }

  // Year is in column B (index 1)
  const yearCol = 1;
  const headers = data[0];
  const rows = data.slice(1);

  // Filter out rows for the target year (keep rows that DON'T match)
  const rowsToKeep = rows.filter(row => Number(row[yearCol]) !== targetYear);
  const deletedCount = rows.length - rowsToKeep.length;

  if (deletedCount === 0) {
    Logger.log(`  No transactions found for ${targetYear}`);
    return 0;
  }

  // Clear sheet and rewrite with filtered data
  if (rowsToKeep.length > 0) {
    // Clear existing data rows (keep header)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }
    // Write filtered rows back
    sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  } else {
    // All rows were for target year - just clear data rows
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }
  }

  Logger.log(`✅ Cleared ${deletedCount} transaction log entries for ${targetYear}`);
  return deletedCount;
}

/**
 * Log a transaction to the sheet
 * DEPRECATED: Use batchWriteTransactionLogs() for better performance
 */
function logTransaction(year, txn, action, details = {}) {
  const sheet = getTransactionLogSheet();
  const franchiseMap = getFranchiseConferenceMap();

  // Get franchise info
  const franchiseId = String(Number(txn.franchise || 0)).padStart(3, "0");
  const franchiseConference = franchiseMap[franchiseId] || "UNKNOWN";

  // Get franchise name from FranchiseLookup
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const lookupSheet = ss.getSheetByName(config.sheets.franchiseLookup);
  let franchiseName = "";

  if (lookupSheet) {
    const lookupData = lookupSheet.getDataRange().getValues();
    const lookupRow = lookupData.find(row =>
      String(Number(row[0] || 0)).padStart(3, "0") === franchiseId
    );
    if (lookupRow) {
      franchiseName = lookupRow[1] || ""; // Team Name column
    }
  }

  // Convert timestamp to readable date
  const timestamp = txn.timestamp ? new Date(Number(txn.timestamp) * 1000) : new Date();

  sheet.appendRow([
    timestamp,
    year,
    txn.type || "",
    franchiseId,
    franchiseName,
    franchiseConference,
    details.playerId || "",
    details.playerName || "",
    details.copyAssigned || "",
    action,
    txn.transaction || ""
  ]);
}

/**
 * Batch write transaction logs
 * Much faster than individual logTransaction() calls
 * APPENDS to existing data - does not clear
 * @param {Array} logs - Array of log objects with structure: {year, txn, action, playerId, playerName, copyAssigned, franchiseId, franchiseConference, bidAmount, transferEligible}
 */
function batchWriteTransactionLogs(logs) {
  if (!logs || logs.length === 0) return;

  const sheet = getTransactionLogSheet();
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Log the starting row for debugging
  const startingRow = sheet.getLastRow();
  Logger.log(`  TransactionLog: Appending ${logs.length} rows starting at row ${startingRow + 1} (existing rows: ${startingRow})`);

  // Get franchise lookup data once
  const lookupSheet = ss.getSheetByName(config.sheets.franchiseLookup);
  const franchiseNameMap = {};

  if (lookupSheet) {
    const lookupData = lookupSheet.getDataRange().getValues();
    lookupData.slice(1).forEach(row => {
      const fId = String(Number(row[0] || 0)).padStart(3, "0");
      franchiseNameMap[fId] = row[1] || "";
    });
  }

  // Convert log objects to row arrays
  const rows = logs.map(log => {
    const franchiseName = franchiseNameMap[log.franchiseId] || "";
    const timestamp = log.txn.timestamp ? new Date(Number(log.txn.timestamp) * 1000) : new Date();

    return [
      timestamp,
      log.year,
      log.txn.type || "",
      log.franchiseId,
      franchiseName,
      log.franchiseConference,
      log.playerId || "",
      log.playerName || "",
      log.copyAssigned || "",
      log.action,
      log.bidAmount || "",
      log.transferEligible || "",
      log.txn.transaction || ""
    ];
  });

  // Write all rows at once
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 13).setValues(rows);
  }
}

/**
 * Get player name from PlayerCopies sheet
 */
function getPlayerNameFromCopies(playerId) {
  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();

  // Find first copy with this player ID
  const row = data.slice(1).find(r => String(r[1]) === String(playerId));
  return row ? row[2] : ""; // PlayerName column
}

/**
 * View transaction log summary
 */
function viewTransactionLogSummary() {
  Logger.log("=== Transaction Log Summary ===\n");

  const sheet = getTransactionLogSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("No transactions logged yet");
    return;
  }

  const transactions = data.slice(1);

  Logger.log(`Total transactions logged: ${transactions.length}\n`);

  // Count by type
  const byType = {};
  transactions.forEach(row => {
    const type = row[2];
    byType[type] = (byType[type] || 0) + 1;
  });

  Logger.log("By type:");
  Object.entries(byType).forEach(([type, count]) => {
    Logger.log(`  ${type}: ${count}`);
  });

  // Count by year
  const byYear = {};
  transactions.forEach(row => {
    const year = row[1];
    byYear[year] = (byYear[year] || 0) + 1;
  });

  Logger.log("\nBy year:");
  Object.entries(byYear).sort().forEach(([year, count]) => {
    Logger.log(`  ${year}: ${count}`);
  });

  // Count by action
  const byAction = {};
  transactions.forEach(row => {
    const action = row[9];
    byAction[action] = (byAction[action] || 0) + 1;
  });

  Logger.log("\nBy action:");
  Object.entries(byAction).forEach(([action, count]) => {
    Logger.log(`  ${action}: ${count}`);
  });
}

/**
 * Migration: Add BidAmount and TransferEligible columns to existing TransactionLog sheet
 * Run this once if you have an existing TransactionLog with the old 11-column format
 */
function addTransactionLogColumns() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("TransactionLog");

  if (!sheet) {
    Logger.log("TransactionLog sheet not found. Run getTransactionLogSheet() to create it.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const currentColCount = headers.length;

  // Check if we already have the new columns
  if (headers.includes("BidAmount") && headers.includes("TransferEligible")) {
    Logger.log("TransactionLog already has BidAmount and TransferEligible columns.");
    return;
  }

  // Old format had 11 columns (ending with RawTransaction)
  // New format has 13 columns (BidAmount, TransferEligible before RawTransaction)
  if (currentColCount === 11) {
    Logger.log("Migrating TransactionLog from 11 to 13 columns...");

    // Insert two new columns before RawTransaction (column 11)
    sheet.insertColumnsBefore(11, 2);

    // Set new headers
    sheet.getRange(1, 11).setValue("BidAmount");
    sheet.getRange(1, 12).setValue("TransferEligible");

    // Set column widths
    sheet.setColumnWidth(11, 80);  // BidAmount
    sheet.setColumnWidth(12, 100); // TransferEligible

    Logger.log("✅ Added BidAmount and TransferEligible columns to TransactionLog");
    Logger.log("   Note: Existing rows will have empty values for these new columns.");
  } else {
    Logger.log(`TransactionLog has ${currentColCount} columns. Expected 11 (old) or 13 (new).`);
    Logger.log("Headers: " + headers.join(", "));
  }
}
