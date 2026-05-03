/**
 * RECRUITING ANALYTICS - LIVE AUCTION
 * Pulls live auction transactions directly from MFL API.
 * Captures all auction activity: nominations, bids, and completed auctions.
 * Designed to run on a timed trigger during the auction window.
 *
 * Usage:
 *   - Run startLiveAuctionSync() to begin hourly imports
 *   - Run stopLiveAuctionSync() to stop the trigger
 *   - Run importLiveAuction() for a one-time manual import
 */

// All auction-related transaction types from MFL
var AUCTION_TRANS_TYPES = ["AUCTION_INIT", "AUCTION_BID", "AUCTION_WON"];


/**
 * Fetch auction transactions from MFL API.
 * Pulls all three types: AUCTION_INIT (nominations), AUCTION_BID (bids), AUCTION_WON (completed).
 * @param {string} [yearOverride] - Optional year to fetch (defaults to current league year)
 * @returns {Array} Array of { playerId, franchiseId, bidAmount, timestamp, transactionType }
 */
function fetchLiveAuctionTransactions(yearOverride) {
  var config = getConfig();
  var year = yearOverride || config.mfl.currentYear;
  var allResults = [];

  AUCTION_TRANS_TYPES.forEach(function(transType) {
    var data = mflFetch(year, "transactions", { TRANS_TYPE: transType });

    if (!data || !data.transactions || !data.transactions.transaction) {
      Logger.log("  No " + transType + " transactions found.");
      return;
    }

    var txns = data.transactions.transaction;
    if (!Array.isArray(txns)) txns = [txns];

    txns.forEach(function(txn) {
      var franchiseId = String(txn.franchise || "");
      var timestamp = txn.timestamp || "";
      var transStr = txn.transaction || "";

      // MFL format: "playerID,bidAmount|playerID,bidAmount"
      var entries = transStr.split("|");
      entries.forEach(function(entry) {
        var parts = entry.split(",");
        if (parts.length >= 2) {
          allResults.push({
            playerId: String(parts[0]).trim(),
            bidAmount: Number(parts[1]) || 0,
            franchiseId: franchiseId,
            timestamp: timestamp,
            transactionType: transType
          });
        }
      });
    });

    Logger.log("  " + transType + ": found " + txns.length + " transactions");
  });

  return allResults;
}


/**
 * Import live auction data to the LiveAuction sheet.
 * Enriches with player data and franchise names.
 * Uses full-replace strategy (clears and rewrites all data).
 * @param {string} [yearOverride] - Optional year to import (defaults to current league year)
 */
function importLiveAuction(yearOverride) {
  var config = getConfig();
  var yearStr = yearOverride || config.mfl.currentYear;

  Logger.log("=== IMPORTING LIVE AUCTION DATA ===");
  Logger.log("  Year: " + yearStr);

  // Fetch transactions
  var transactions = fetchLiveAuctionTransactions(yearStr);
  Logger.log("  Raw transactions: " + transactions.length);

  if (transactions.length === 0) {
    Logger.log("  No transactions to import.");
    return;
  }

  // Build lookups (reuses existing functions)
  var playerLookup = buildPlayerLookup(yearStr);
  var franchiseLookup = loadFranchiseLookup(config);

  // Enrich transactions
  var enrichedRows = [];
  transactions.forEach(function(txn) {
    var player = playerLookup[txn.playerId] || {};
    var franchise = franchiseLookup[txn.franchiseId] || {};

    var playerName = player.name || "";
    if (playerName.indexOf(",") >= 0) {
      var parts = playerName.split(",").map(function(s) { return s.trim(); });
      if (parts.length >= 2) playerName = parts[1] + " " + parts[0];
    }

    var position = player.position || "";
    var nflTeam = player.team || "";
    var draftYear = player.draftYear || "";
    var draftRound = player.draftRound || "";
    var draftPick = player.draftPick || "";
    var franchiseName = franchise.teamName || "";
    var conference = franchise.conference || "";
    var isRookie = (draftYear !== "" && draftYear === yearStr);

    // Convert Unix timestamp to readable date
    var timestampStr = "";
    if (txn.timestamp) {
      var date = new Date(Number(txn.timestamp) * 1000);
      timestampStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    }

    enrichedRows.push([
      Number(yearStr),
      txn.playerId,
      playerName,
      position,
      nflTeam,
      draftYear,
      draftRound,
      draftPick,
      txn.franchiseId,
      franchiseName,
      conference,
      txn.bidAmount,
      isRookie ? "TRUE" : "FALSE",
      txn.transactionType,
      timestampStr
    ]);
  });

  // Sort by timestamp descending (most recent first)
  enrichedRows.sort(function(a, b) {
    return (b[14] || "").localeCompare(a[14] || "");
  });

  // Write to sheet (full replace)
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.liveAuction);

  if (!sheet) {
    sheet = ss.insertSheet(config.sheets.liveAuction);
  }

  sheet.clearContents();

  var headers = [
    "AuctionYear", "PlayerID", "PlayerName", "Position", "NFLTeam",
    "DraftYear", "DraftRound", "DraftPick", "FranchiseID", "FranchiseName",
    "Conference", "BidAmount", "IsRookie", "TransactionType", "Timestamp"
  ];

  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (enrichedRows.length > 0) {
    sheet.getRange(2, 1, enrichedRows.length, headers.length).setValues(enrichedRows);
  }

  // Format BidAmount column as currency
  if (enrichedRows.length > 0) {
    sheet.getRange(2, 12, enrichedRows.length, 1).setNumberFormat("$#,##0");
  }

  // Log summary by type
  var typeCounts = {};
  enrichedRows.forEach(function(row) {
    var t = row[13];
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  Object.keys(typeCounts).forEach(function(t) {
    Logger.log("  " + t + ": " + typeCounts[t] + " rows");
  });

  Logger.log("  Wrote " + enrichedRows.length + " transactions to " + config.sheets.liveAuction);
  Logger.log("=== LIVE AUCTION IMPORT COMPLETE ===");
}


/**
 * Start the hourly live auction sync trigger.
 * Creates a timed trigger that runs importLiveAuction() every hour.
 * Also runs an immediate import.
 */
function startLiveAuctionSync() {
  // Remove any existing trigger first
  stopLiveAuctionSync();

  ScriptApp.newTrigger("importLiveAuction")
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log("Live auction sync started (hourly).");

  // Run immediately
  importLiveAuction();
}


/**
 * Stop the hourly live auction sync trigger.
 * Deletes any existing trigger for importLiveAuction.
 */
function stopLiveAuctionSync() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "importLiveAuction") {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });
  if (deleted > 0) {
    Logger.log("  Deleted " + deleted + " existing importLiveAuction trigger(s).");
  }
  Logger.log("Live auction sync stopped.");
}


/**
 * Test the live auction pipeline using 2025 data.
 * Pulls real auction transactions from last year's MFL site to verify
 * the full import pipeline works (API fetch → enrich → write to sheet).
 * Safe to run anytime — does not affect triggers or league year config.
 */
function testLiveAuctionWith2025() {
  Logger.log("=== TEST: Importing 2025 auction data ===");
  importLiveAuction("2025");
  Logger.log("=== TEST COMPLETE — Check LiveAuction sheet for results ===");
}


/**
 * Debug: dump raw MFL transaction objects for each auction type.
 * Run this to see the actual JSON structure MFL returns,
 * so we can fix the parser if the format differs from expected.
 */
function debugAuctionTransactionFormat() {
  var config = getConfig();
  var year = "2025";

  ["AUCTION_INIT", "AUCTION_BID", "AUCTION_WON"].forEach(function(transType) {
    Logger.log("\n=== " + transType + " ===");
    var data = mflFetch(year, "transactions", { TRANS_TYPE: transType });

    if (!data || !data.transactions || !data.transactions.transaction) {
      Logger.log("  No data returned.");
      return;
    }

    var txns = data.transactions.transaction;
    if (!Array.isArray(txns)) txns = [txns];

    Logger.log("  Total: " + txns.length);
    // Log first 3 raw objects
    for (var i = 0; i < Math.min(3, txns.length); i++) {
      Logger.log("  Sample " + i + ": " + JSON.stringify(txns[i]));
    }
  });
}
