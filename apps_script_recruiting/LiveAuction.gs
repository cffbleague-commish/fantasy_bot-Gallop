/**
 * RECRUITING ANALYTICS - LIVE AUCTION
 * Pulls live auction transactions directly from MFL API.
 * Designed to run on a timed trigger during the auction window.
 *
 * Usage:
 *   - Run startLiveAuctionSync() to begin hourly imports
 *   - Run stopLiveAuctionSync() to stop the trigger
 *   - Run importLiveAuction() for a one-time manual import
 */


/**
 * Fetch AUCTION_WON transactions from MFL API for the current year.
 * @returns {Array} Array of { playerId, franchiseId, bidAmount, timestamp }
 */
function fetchLiveAuctionTransactions() {
  var config = getConfig();
  var year = config.mfl.currentYear;

  var data = mflFetch(year, "transactions", { TRANS_TYPE: "AUCTION_WON" });

  if (!data || !data.transactions || !data.transactions.transaction) {
    Logger.log("  No auction transactions found from MFL API.");
    return [];
  }

  var txns = data.transactions.transaction;
  if (!Array.isArray(txns)) txns = [txns];

  var results = [];
  txns.forEach(function(txn) {
    var franchiseId = String(txn.franchise || "");
    var timestamp = txn.timestamp || "";
    var transStr = txn.transaction || "";

    // MFL format: "playerID,bidAmount|playerID,bidAmount"
    var entries = transStr.split("|");
    entries.forEach(function(entry) {
      var parts = entry.split(",");
      if (parts.length >= 2) {
        results.push({
          playerId: String(parts[0]).trim(),
          bidAmount: Number(parts[1]) || 0,
          franchiseId: franchiseId,
          timestamp: timestamp
        });
      }
    });
  });

  return results;
}


/**
 * Import live auction data to the LiveAuction sheet.
 * Enriches with player data and franchise names.
 * Uses full-replace strategy (clears and rewrites all data).
 */
function importLiveAuction() {
  var config = getConfig();
  var yearStr = config.mfl.currentYear;

  Logger.log("=== IMPORTING LIVE AUCTION DATA ===");
  Logger.log("  Year: " + yearStr);

  // Fetch transactions
  var transactions = fetchLiveAuctionTransactions();
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
      timestampStr
    ]);
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
    "Conference", "BidAmount", "IsRookie", "Timestamp"
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
