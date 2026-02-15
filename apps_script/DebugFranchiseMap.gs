/**
 * DEBUG FRANCHISE MAP
 * Check what getFranchiseConferenceMap() is actually returning
 */

function debugFranchiseMap() {
  Logger.log("=== Debugging Franchise Conference Map ===\n");

  const franchiseMap = getFranchiseConferenceMap();

  Logger.log(`Total franchises in map: ${Object.keys(franchiseMap).length}\n`);

  Logger.log("First 20 entries:");
  Object.entries(franchiseMap).slice(0, 20).forEach(([id, conf]) => {
    Logger.log(`  "${id}" (length: ${id.length}) -> ${conf}`);
  });

  Logger.log("\nChecking specific franchise IDs:");
  const testIds = ["001", "002", "017", "033", "049", "065", "081", "0001", "0002"];

  testIds.forEach(id => {
    const conf = franchiseMap[id];
    Logger.log(`  franchiseMap["${id}"] = ${conf || "NOT FOUND"}`);
  });

  return franchiseMap;
}

function debugFranchiseLookupSheet() {
  Logger.log("=== Debugging FranchiseLookup Sheet Raw Data ===\n");

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) {
    Logger.log("❌ FranchiseLookup sheet not found");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  Logger.log("Headers:");
  headers.forEach((h, idx) => {
    Logger.log(`  Column ${idx}: "${h}"`);
  });

  Logger.log("\nFirst 10 data rows:");
  data.slice(1, 11).forEach((row, idx) => {
    const franchiseId = row[0];
    const conference = row[1];
    Logger.log(`Row ${idx + 2}: "${franchiseId}" (type: ${typeof franchiseId}, length: ${String(franchiseId).length}) -> ${conference}`);
  });
}

/**
 * Debug what transaction types exist in a given year
 * This helps identify what transaction types we need to handle
 */
function debugTransactionTypes(year) {
  Logger.log(`=== Transaction Types for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));
  Logger.log(`Total transactions: ${transactions.length}\n`);

  // Count by type
  const typeCount = {};
  const typeExamples = {};

  transactions.forEach(txn => {
    const type = txn.type || "UNKNOWN";
    typeCount[type] = (typeCount[type] || 0) + 1;

    // Keep first 3 examples of each type
    if (!typeExamples[type]) {
      typeExamples[type] = [];
    }
    if (typeExamples[type].length < 3) {
      typeExamples[type].push(txn);
    }
  });

  // Log counts
  Logger.log("Transaction type counts:");
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    Logger.log(`  ${type}: ${count}`);
  });

  // Log examples
  Logger.log("\nExample transactions for each type:\n");
  Object.entries(typeExamples).forEach(([type, examples]) => {
    Logger.log(`${type}:`);
    examples.forEach((txn, idx) => {
      Logger.log(`  Example ${idx + 1}:`);
      Logger.log(`    Franchise: ${txn.franchise}`);
      Logger.log(`    Transaction: ${txn.transaction}`);
      Logger.log(`    Timestamp: ${txn.timestamp}`);
    });
    Logger.log("");
  });

  return typeCount;
}

/**
 * Debug IR and TAXI transaction structure
 * These have undefined transaction field, need to find where player ID is stored
 */
function debugIRandTaxiStructure(year) {
  Logger.log(`=== IR and TAXI Transaction Structure for ${year} ===\n`);

  const transactions = fetchTransactions(String(year));

  // Find IR transactions
  const irTxns = transactions.filter(t => t.type === "IR").slice(0, 5);
  const taxiTxns = transactions.filter(t => t.type === "TAXI").slice(0, 5);

  Logger.log("IR Transactions (full object dump):");
  irTxns.forEach((txn, idx) => {
    Logger.log(`\nIR Example ${idx + 1}:`);
    Logger.log(JSON.stringify(txn, null, 2));
  });

  Logger.log("\n" + "=".repeat(60) + "\n");

  Logger.log("TAXI Transactions (full object dump):");
  taxiTxns.forEach((txn, idx) => {
    Logger.log(`\nTAXI Example ${idx + 1}:`);
    Logger.log(JSON.stringify(txn, null, 2));
  });
}

/**
 * Check all years for transaction types
 */
function debugAllTransactionTypes() {
  const years = [2021, 2022, 2023, 2024];
  const allTypes = new Set();

  years.forEach(year => {
    Logger.log(`\n${"=".repeat(60)}`);
    const types = debugTransactionTypes(year);
    Object.keys(types).forEach(t => allTypes.add(t));
  });

  Logger.log(`\n${"=".repeat(60)}`);
  Logger.log("\nAll unique transaction types across all years:");
  Array.from(allTypes).sort().forEach(t => {
    Logger.log(`  - ${t}`);
  });
}

/**
 * Wrapper functions to easily run IR/TAXI debug for specific years
 */
function debugIRTaxi2021() {
  debugIRandTaxiStructure(2021);
}

function debugIRTaxi2022() {
  debugIRandTaxiStructure(2022);
}

function debugIRTaxi2023() {
  debugIRandTaxiStructure(2023);
}

function debugIRTaxi2024() {
  debugIRandTaxiStructure(2024);
}

/**
 * Debug why certain years return 0 rookies
 * Check what draft_year values are available in the MFL API
 */
function debugPlayerDraftYears(year) {
  Logger.log(`=== Debugging Player Draft Years for API year ${year} ===\n`);

  const players = fetchPlayers(year);
  Logger.log(`Total players returned: ${players.length}\n`);

  // Count players by draft_year
  const byDraftYear = {};
  const byPosition = {};

  players.forEach(p => {
    const draftYear = p.draft_year || "UNKNOWN";
    byDraftYear[draftYear] = (byDraftYear[draftYear] || 0) + 1;

    if (["QB", "RB", "WR", "TE"].includes(p.position)) {
      byPosition[p.position] = (byPosition[p.position] || 0) + 1;
    }
  });

  Logger.log("Players by draft_year:");
  Object.entries(byDraftYear).sort().forEach(([year, count]) => {
    Logger.log(`  ${year}: ${count}`);
  });

  Logger.log("\nFantasy positions (QB/RB/WR/TE) count:");
  Object.entries(byPosition).forEach(([pos, count]) => {
    Logger.log(`  ${pos}: ${count}`);
  });

  // Show sample of players with different draft years
  Logger.log("\nSample players by draft year:");
  const sampleYears = ["2018", "2019", "2020", "2021"];
  sampleYears.forEach(dy => {
    const sample = players.filter(p => p.draft_year === dy).slice(0, 3);
    if (sample.length > 0) {
      Logger.log(`\n  Draft Year ${dy}:`);
      sample.forEach(p => {
        Logger.log(`    ${p.name} (${p.position}) - Team: ${p.team || "FA"}`);
      });
    } else {
      Logger.log(`\n  Draft Year ${dy}: No players found`);
    }
  });
}

function debugDraftYears2020() { debugPlayerDraftYears("2020"); }
function debugDraftYears2021() { debugPlayerDraftYears("2021"); }
function debugDraftYears2024() { debugPlayerDraftYears("2024"); }
