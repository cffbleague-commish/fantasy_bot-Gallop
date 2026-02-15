/**
 * DEBUG UTILITIES
 * Consolidated debugging functions for troubleshooting the backfill process
 */

/**
 * Check what's in RookieLedger
 */
function debugRookieLedger() {
  Logger.log("=== Checking RookieLedger ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.rookieLedger);

  if (!sheet) {
    Logger.log("❌ RookieLedger sheet not found!");
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log(`Sheet has ${lastRow} rows (including header)\n`);

  if (lastRow <= 1) {
    Logger.log("✅ RookieLedger is empty (only header row)");
    return;
  }

  // Get all data
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rookies = data.slice(1);

  Logger.log("Headers:");
  Logger.log(`  ${headers.join(" | ")}\n`);

  Logger.log(`Total rookies: ${rookies.length}\n`);

  // Count by year
  const byYear = {};
  rookies.forEach(row => {
    const year = row[3] || "UNKNOWN"; // Year column
    byYear[year] = (byYear[year] || 0) + 1;
  });

  Logger.log("Rookies by year:");
  Object.entries(byYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([year, count]) => {
      Logger.log(`  ${year}: ${count}`);
    });

  // Show first 5
  Logger.log("\nFirst 5 rookies:");
  rookies.slice(0, 5).forEach(row => {
    Logger.log(`  ${row[0]} - ${row[1]} (${row[2]}) - ${row[3]}`);
  });
}

/**
 * Debug: Check why fetchRookies returns unexpected results
 */
function debugRookiesFetch(year) {
  Logger.log(`=== Debugging Rookies Fetch for ${year} ===\n`);

  // Fetch all players for the year
  const players = fetchPlayers(String(year));
  Logger.log(`Total players fetched: ${players.length}\n`);

  if (players.length === 0) {
    Logger.log("❌ No players returned from MFL API!");
    return;
  }

  // Check if players have draft_year field
  const firstPlayer = players[0];
  Logger.log("First player structure:");
  Logger.log(JSON.stringify(firstPlayer, null, 2));
  Logger.log("");

  // Check how many players have draft_year
  const withDraftYear = players.filter(p => p.draft_year);
  Logger.log(`Players with draft_year field: ${withDraftYear.length}\n`);

  // Check QB/RB/WR/TE players
  const fantasyPlayers = players.filter(p => ["QB", "RB", "WR", "TE"].includes(p.position));
  Logger.log(`Fantasy position players: ${fantasyPlayers.length}\n`);

  // Check players with teams
  const withTeams = fantasyPlayers.filter(p => p.team);
  Logger.log(`Fantasy players with teams: ${withTeams.length}\n`);

  // Check what draft_year values exist
  const draftYears = {};
  fantasyPlayers.forEach(p => {
    const draftYear = p.draft_year || "NO_DRAFT_YEAR";
    draftYears[draftYear] = (draftYears[draftYear] || 0) + 1;
  });

  Logger.log("Draft year distribution for fantasy players:");
  Object.entries(draftYears)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([draftYear, count]) => {
      Logger.log(`  ${draftYear}: ${count} players`);
    });

  // Show sample rookies for this year
  const rookies = fetchRookies(String(year));
  Logger.log(`\nfetchRookies("${year}") returned: ${rookies.length} players\n`);

  if (rookies.length > 0) {
    Logger.log("First 5 rookies:");
    rookies.slice(0, 5).forEach(p => {
      Logger.log(`  ${p.name} (${p.position}) - ${p.team}`);
    });
  }
}

/**
 * Debug: Inspect MFL transaction types for a given year
 */
function debugTransactionTypes(year) {
  Logger.log(`=== Inspecting Transaction Types for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));
  Logger.log(`Total transactions: ${transactions.length}\n`);

  // Count by type
  const typeCounts = {};
  transactions.forEach(txn => {
    const type = txn.type || "UNKNOWN";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  Logger.log("Transaction types:");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      Logger.log(`  ${type}: ${count}`);
    });

  return typeCounts;
}

/**
 * Debug: Show sample transactions of each type
 */
function debugTransactionSamples(year) {
  Logger.log(`=== Sample Transactions for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));

  // Group by type
  const byType = {};
  transactions.forEach(txn => {
    const type = txn.type || "UNKNOWN";
    if (!byType[type]) byType[type] = [];
    byType[type].push(txn);
  });

  // Show first transaction of each type
  Object.keys(byType).sort().forEach(type => {
    Logger.log(`\n--- ${type} ---`);
    const sample = byType[type][0];
    Logger.log(JSON.stringify(sample, null, 2));
  });
}

/**
 * Debug: Show detailed auction transactions for a year
 */
function debugAuctionTransactions(year) {
  Logger.log(`=== Debugging Auction Transactions for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));
  Logger.log(`Total transactions: ${transactions.length}\n`);

  // Find AUCTION_WON transactions
  const auctions = transactions.filter(t => t.type === "AUCTION_WON");
  Logger.log(`AUCTION_WON transactions: ${auctions.length}\n`);

  // Show first 10 in detail
  Logger.log("First 10 AUCTION_WON transactions:\n");
  auctions.slice(0, 10).forEach((txn, idx) => {
    Logger.log(`--- Auction ${idx + 1} ---`);
    Logger.log(`Franchise: ${txn.franchise}`);
    Logger.log(`Transaction field: "${txn.transaction}"`);
    Logger.log(`Timestamp: ${txn.timestamp}`);
    Logger.log(JSON.stringify(txn, null, 2));
    Logger.log("");
  });

  // Parse transaction field
  Logger.log("\nParsing transaction fields:\n");
  auctions.slice(0, 10).forEach((txn, idx) => {
    const txnData = txn.transaction || "";
    const parts = txnData.split("|");

    Logger.log(`Auction ${idx + 1}:`);
    Logger.log(`  Raw: "${txnData}"`);
    Logger.log(`  Parts: [${parts.map(p => `"${p}"`).join(", ")}]`);
    Logger.log(`  Part 0 (playerId): "${parts[0]}"`);
    Logger.log(`  Part 1 (conferenceIndex): "${parts[1]}"`);
    Logger.log("");
  });

  return auctions;
}

/**
 * Debug: Inspect AUCTION_WON transaction structure to find bid amount field
 * Run this to see all available fields in the transaction object
 */
function debugAuctionBidAmounts(year = 2021) {
  Logger.log(`=== Inspecting AUCTION_WON transactions for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));
  const auctions = transactions.filter(t => t.type === "AUCTION_WON");

  Logger.log(`Found ${auctions.length} AUCTION_WON transactions\n`);

  // Show first 5 with all their properties
  auctions.slice(0, 5).forEach((txn, idx) => {
    Logger.log(`--- Auction ${idx + 1} ---`);
    Logger.log(`All properties:`);
    Object.entries(txn).forEach(([key, value]) => {
      Logger.log(`  ${key}: "${value}"`);
    });

    // Parse the transaction field to see all parts
    const txnData = txn.transaction || "";
    const parts = txnData.split("|");
    Logger.log(`Transaction parts (split by |):`);
    parts.forEach((part, i) => {
      Logger.log(`  [${i}]: "${part}"`);
    });
    Logger.log("");
  });

  return auctions;
}

/**
 * Debug: Show detailed drop transactions
 */
function debugDropTransactions(year) {
  Logger.log(`=== Debugging Drop Transactions for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));

  // Find FREE_AGENT transactions
  const drops = transactions.filter(t => t.type === "FREE_AGENT");
  Logger.log(`FREE_AGENT transactions: ${drops.length}\n`);

  // Show first 10
  Logger.log("First 10 FREE_AGENT transactions:\n");
  drops.slice(0, 10).forEach((txn, idx) => {
    Logger.log(`--- Drop ${idx + 1} ---`);
    Logger.log(`Franchise: ${txn.franchise}`);
    Logger.log(`Transaction field: "${txn.transaction}"`);
    Logger.log(JSON.stringify(txn, null, 2));
    Logger.log("");
  });

  return drops;
}

/**
 * Debug: Check conference mapping
 */
function debugConferences() {
  Logger.log("=== Debugging Conferences ===\n");

  const conferences = getConferences();
  Logger.log(`Found ${conferences.length} conferences:\n`);

  conferences.forEach((conf, idx) => {
    Logger.log(`  Index ${idx}: "${conf}"`);
  });

  return conferences;
}

/**
 * Debug: Check player copy index structure
 */
function debugPlayerCopyIndex() {
  Logger.log("=== Debugging Player Copy Index ===\n");

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const copies = data.slice(1);

  Logger.log(`Total player copies: ${copies.length}\n`);

  // Show actual headers
  Logger.log("Actual column headers:");
  headers.forEach((header, idx) => {
    Logger.log(`  Column ${idx}: "${header}"`);
  });
  Logger.log("");

  // Show first 5 copies
  const copyIdCol = 0;
  const playerIdCol = 1;
  const playerNameCol = 2;
  const conferenceCol = 3;
  const ownerCol = 4;

  Logger.log("First 5 player copies:\n");
  copies.slice(0, 5).forEach((row, idx) => {
    Logger.log(`Copy ${idx + 1}:`);
    Logger.log(`  CopyID: ${row[copyIdCol]}`);
    Logger.log(`  PlayerID: ${row[playerIdCol]}`);
    Logger.log(`  Name: ${row[playerNameCol]}`);
    Logger.log(`  Conference: ${row[conferenceCol]}`);
    Logger.log(`  Owner: ${row[ownerCol]}`);
    Logger.log("");
  });
}

/**
 * Debug: Check for franchises assigned to wrong conference copies
 */
function debugConferenceMismatch() {
  Logger.log("=== Checking for Conference Mismatches ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log("❌ PlayerCopies sheet not found");
    return;
  }

  // Get franchise-to-conference mapping
  const franchiseMap = getFranchiseConferenceMap();
  Logger.log("Franchise Conference Map:");
  Object.entries(franchiseMap).slice(0, 10).forEach(([fid, conf]) => {
    Logger.log(`  ${fid}: ${conf}`);
  });
  Logger.log(`  ... (${Object.keys(franchiseMap).length} total franchises)\n`);

  // Get all player copies
  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  const copyIdCol = 0;
  const playerIdCol = 1;
  const playerNameCol = 2;
  const conferenceCol = 3;
  const ownerCol = 4;

  Logger.log(`Total player copies: ${copies.length}\n`);

  // Find mismatches
  const mismatches = [];

  copies.forEach((row) => {
    const copyId = row[copyIdCol];
    const playerId = row[playerIdCol];
    const playerName = row[playerNameCol];
    const copyConference = row[conferenceCol];
    const franchiseId = row[ownerCol];

    // Skip if no owner
    if (!franchiseId || franchiseId === "") return;

    // Get franchise's actual conference
    const franchiseConference = franchiseMap[franchiseId];

    if (!franchiseConference) {
      mismatches.push({
        type: "UNKNOWN_FRANCHISE",
        copyId,
        playerId,
        playerName,
        copyConference,
        franchiseId,
        issue: `Franchise ${franchiseId} not found in FranchiseLookup`
      });
      return;
    }

    // Check if franchise conference matches copy conference
    if (franchiseConference !== copyConference) {
      mismatches.push({
        type: "WRONG_CONFERENCE",
        copyId,
        playerId,
        playerName,
        copyConference,
        franchiseId,
        franchiseConference,
        issue: `Franchise ${franchiseId} (${franchiseConference}) owns copy in ${copyConference}`
      });
    }
  });

  Logger.log(`Found ${mismatches.length} mismatches\n`);

  if (mismatches.length === 0) {
    Logger.log("✅ All franchises correctly assigned to their conference copies");
    return;
  }

  // Group by type
  const byType = {};
  mismatches.forEach(m => {
    if (!byType[m.type]) byType[m.type] = [];
    byType[m.type].push(m);
  });

  Object.entries(byType).forEach(([type, matches]) => {
    Logger.log(`\n${type}: ${matches.length} issues`);
    Logger.log("─".repeat(60));

    matches.slice(0, 10).forEach(m => {
      Logger.log(`${m.playerName} (${m.playerId})`);
      Logger.log(`  Copy: ${m.copyId} (${m.copyConference})`);
      Logger.log(`  Owner: ${m.franchiseId} (${m.franchiseConference || "UNKNOWN"})`);
      Logger.log(`  Issue: ${m.issue}`);
      Logger.log("");
    });

    if (matches.length > 10) {
      Logger.log(`... and ${matches.length - 10} more\n`);
    }
  });

  return mismatches;
}

/**
 * Run comprehensive debugging for a specific year
 */
function debugFullBackfill(year) {
  Logger.log(`${"=".repeat(60)}`);
  Logger.log(`COMPREHENSIVE DEBUG FOR ${year}`);
  Logger.log(`${"=".repeat(60)}\n`);

  debugConferences();
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugRookiesFetch(year);
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugTransactionTypes(year);
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugAuctionTransactions(year);
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugDropTransactions(year);
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugPlayerCopyIndex();
  Logger.log("\n" + "=".repeat(60) + "\n");

  debugConferenceMismatch();
}
