/**
 * DECLARATIONS AND RETENTION MANAGEMENT
 * Handles award-based early declarations and coach retention decisions
 *
 * Declaration Rules:
 * - Player must have completed 3rd year of eligibility (EligibilityYearsUsed >= 3)
 * - AND have earned either:
 *   - 1 National Award (Heisman or National_QB/RB/WR_TE with Rank 1), OR
 *   - 2 All-Conference Awards (any combination of 1st/2nd/3rd team across career)
 * - If eligible but no retention decision made, player is auto-retained
 */

// ============================================================================
// COLUMN INDICES FOR PLAYERCOPIES SHEET
// ============================================================================

const PC_COLS = {
  copyId: 0,
  playerId: 1,
  playerName: 2,
  conference: 3,
  currentFranchiseId: 4,
  eligibilityYearsUsed: 5,
  traditionalRedshirtUsed: 6,
  medicalRedshirtUsed: 7,
  createdSeason: 8,
  active: 9,
  lastUpdated: 10,
  traditionalRedshirtYear: 11,
  medicalRedshirtYear: 12,
  nationalAwards: 13,
  allConferenceAwards: 14,
  awardHistory: 15,
  declaredEarly: 16,
  declarationYear: 17,
  retentionDecision: 18,
  retentionDecisionDate: 19,
  retentionPath: 20,      // "NATIONAL" or "ALL_CONFERENCE" - which criteria triggered eligibility
  retentionCount: 21      // Number of times player has been retained (for cost calculation)
};

// ============================================================================
// RETENTION COST CALCULATION
// ============================================================================

/**
 * Determine which path (NATIONAL or ALL_CONFERENCE) triggered eligibility
 * National path takes precedence if both criteria are met
 *
 * @param {Number} nationalAwards - Count of national awards
 * @param {Number} allConfAwards - Count of all-conference awards
 * @returns {String} - "NATIONAL" or "ALL_CONFERENCE" or null if not eligible
 */
function determineRetentionPath(nationalAwards, allConfAwards) {
  if (nationalAwards >= 1) {
    return "NATIONAL";
  } else if (allConfAwards >= 2) {
    return "ALL_CONFERENCE";
  }
  return null;
}

/**
 * Calculate retention cost for a player
 *
 * Costs from recruiting budget:
 * - National award path: $20 first retention, $30 subsequent
 * - All-Conference path: $10 first retention, $20 subsequent
 *
 * @param {String} retentionPath - "NATIONAL" or "ALL_CONFERENCE"
 * @param {Number} retentionCount - How many times player has been retained previously
 * @returns {Number} - Cost in dollars
 */
function calculateRetentionCost(retentionPath, retentionCount) {
  const config = getConfig();
  const costs = config.declarations.retentionCosts;

  if (retentionPath === "NATIONAL") {
    return retentionCount > 0 ? costs.national.subsequentRetention : costs.national.firstRetention;
  } else if (retentionPath === "ALL_CONFERENCE") {
    return retentionCount > 0 ? costs.allConference.subsequentRetention : costs.allConference.firstRetention;
  }

  return 0;
}

/**
 * Get retention cost info for display purposes
 *
 * @param {Object} player - Player object with nationalAwards, allConfAwards, retentionCount
 * @returns {Object} - { path: string, cost: number, costLabel: string }
 */
function getRetentionCostInfo(player) {
  const nationalAwards = Number(player.nationalAwards || player[PC_COLS.nationalAwards]) || 0;
  const allConfAwards = Number(player.allConfAwards || player.allConferenceAwards || player[PC_COLS.allConferenceAwards]) || 0;
  const retentionCount = Number(player.retentionCount || player[PC_COLS.retentionCount]) || 0;

  const path = determineRetentionPath(nationalAwards, allConfAwards);
  const cost = calculateRetentionCost(path, retentionCount);

  let costLabel = "";
  if (path === "NATIONAL") {
    costLabel = retentionCount > 0 ? "$30 (National - subsequent)" : "$20 (National)";
  } else if (path === "ALL_CONFERENCE") {
    costLabel = retentionCount > 0 ? "$20 (All-Conf - subsequent)" : "$10 (All-Conf)";
  }

  return {
    path: path,
    cost: cost,
    costLabel: costLabel,
    retentionCount: retentionCount
  };
}

// ============================================================================
// RETENTION HISTORY SHEET
// ============================================================================

const RETENTION_HISTORY_HEADERS = [
  "Year",
  "CopyId",
  "PlayerId",
  "PlayerName",
  "Conference",
  "FranchiseId",
  "TeamName",
  "Decision",        // RETAIN, RELEASE, or AUTO_RETAIN
  "RetentionPath",   // NATIONAL or ALL_CONFERENCE
  "RetentionCost",   // Dollar cost (0 for RELEASE)
  "RetentionCount",  // How many times retained (including this one; 0 for RELEASE)
  "NationalAwards",
  "AllConfAwards",
  "Timestamp"
];

/**
 * Get or create the RetentionHistory sheet
 * This is the durable, append-only log of all retention decisions.
 * PlayerCopies is the working state; this sheet is the source of truth.
 *
 * @returns {Sheet} - The RetentionHistory sheet
 */
function getRetentionHistorySheet() {
  const config = getConfig();
  return getOrCreateSheet(config.sheets.retentionHistory, RETENTION_HISTORY_HEADERS);
}

/**
 * Write a retention decision to the RetentionHistory sheet
 *
 * @param {Object} entry - Retention history entry
 * @param {Number|String} entry.year - Season year
 * @param {String} entry.copyId - PlayerCopyID
 * @param {String} entry.playerId - PlayerID
 * @param {String} entry.playerName - Player name
 * @param {String} entry.conference - Conference
 * @param {String} entry.franchiseId - FranchiseID of the owner
 * @param {String} entry.teamName - Team name (optional, resolved from franchise lookup)
 * @param {String} entry.decision - RETAIN, RELEASE, or AUTO_RETAIN
 * @param {String} entry.retentionPath - NATIONAL or ALL_CONFERENCE
 * @param {Number} entry.retentionCost - Dollar cost
 * @param {Number} entry.retentionCount - Times retained (including this one)
 * @param {Number} entry.nationalAwards - National award count at time of decision
 * @param {Number} entry.allConfAwards - All-conference award count at time of decision
 */
function writeRetentionHistoryEntry(entry) {
  const sheet = getRetentionHistorySheet();

  const row = [
    entry.year,
    entry.copyId,
    entry.playerId,
    entry.playerName,
    entry.conference,
    entry.franchiseId,
    entry.teamName || "",
    entry.decision,
    entry.retentionPath || "",
    entry.retentionCost || 0,
    entry.retentionCount || 0,
    entry.nationalAwards || 0,
    entry.allConfAwards || 0,
    new Date()
  ];

  sheet.appendRow(row);
}

/**
 * Backfill RetentionHistory from existing PlayerCopies retention data.
 * Migrates any decisions already recorded on PlayerCopies into the
 * durable RetentionHistory sheet. Safe to run multiple times — checks
 * for existing entries before writing.
 *
 * @returns {Object} - { migrated, skippedDuplicate, skippedNoDecision }
 */
function backfillRetentionHistory() {
  Logger.log("=== BACKFILLING RETENTION HISTORY FROM PLAYERCOPIES ===");

  const pcSheet = getPlayerCopiesSheet();
  const pcData = pcSheet.getDataRange().getValues();

  if (pcData.length <= 1) {
    Logger.log("  No player copies found");
    return { migrated: 0, skippedDuplicate: 0, skippedNoDecision: 0 };
  }

  // Load existing retention history to avoid duplicates
  const histSheet = getRetentionHistorySheet();
  const histData = histSheet.getDataRange().getValues();
  const existingKeys = new Set();
  if (histData.length > 1) {
    const yearCol = 0;
    const copyIdCol = 1;
    histData.slice(1).forEach(row => {
      existingKeys.add(`${row[yearCol]}-${row[copyIdCol]}`);
    });
  }
  Logger.log(`  Found ${existingKeys.size} existing retention history entries`);

  // Load team name lookup
  const franchiseData = {};
  try {
    const ss = SpreadsheetApp.getActive();
    const config = getConfig();
    const flSheet = ss.getSheetByName(config.sheets.franchiseLookup);
    if (flSheet) {
      const flData = flSheet.getDataRange().getValues();
      const flHeaders = flData[0];
      const idIdx = flHeaders.indexOf("Franchise ID");
      const nameIdx = flHeaders.indexOf("Team Name");
      flData.slice(1).forEach(row => {
        const fId = String(Number(row[idIdx] || 0)).padStart(3, "0");
        franchiseData[fId] = String(row[nameIdx] || "");
      });
    }
  } catch (e) {
    Logger.log(`  Warning: Could not load franchise lookup: ${e.message}`);
  }

  let migrated = 0;
  let skippedDuplicate = 0;
  let skippedNoDecision = 0;
  const rowsToAppend = [];

  const rows = pcData.slice(1);
  rows.forEach(row => {
    const decision = String(row[PC_COLS.retentionDecision] || "").toUpperCase().trim();
    const decisionDate = String(row[PC_COLS.retentionDecisionDate] || "").trim();

    // Skip if no decision recorded
    if (!decision && !decisionDate) {
      return;
    }

    // Determine the year from the decision date
    // Format is either ISO date string or "PROCESSED-{year}"
    let year = "";
    if (decisionDate.startsWith("PROCESSED-")) {
      year = decisionDate.replace("PROCESSED-", "");
    } else if (decisionDate) {
      // Try to extract year from ISO date
      try {
        year = String(new Date(decisionDate).getFullYear());
      } catch (e) {
        year = getLeagueYear();
      }
    } else {
      year = getLeagueYear();
    }

    const copyId = row[PC_COLS.copyId];
    const key = `${year}-${copyId}`;

    // Skip if already in history
    if (existingKeys.has(key)) {
      skippedDuplicate++;
      return;
    }

    // Skip if decision column is empty and it wasn't processed (auto-retain)
    if (!decision && !decisionDate.startsWith("PROCESSED-")) {
      skippedNoDecision++;
      return;
    }

    const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
    const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
    const retentionCount = Number(row[PC_COLS.retentionCount]) || 0;
    const retentionPath = row[PC_COLS.retentionPath] || determineRetentionPath(nationalAwards, allConfAwards);

    // Determine effective decision
    let effectiveDecision = decision;
    if (!decision && decisionDate.startsWith("PROCESSED-")) {
      effectiveDecision = "AUTO_RETAIN";
    }

    // Calculate cost (for RELEASE, cost is 0)
    let cost = 0;
    if (effectiveDecision === "RETAIN" || effectiveDecision === "AUTO_RETAIN") {
      // retentionCount was already incremented by processEarlyDeclarations,
      // so use retentionCount - 1 for the cost at the time of the decision
      cost = calculateRetentionCost(retentionPath, Math.max(0, retentionCount - 1));
    }

    const franchiseId = String(row[PC_COLS.currentFranchiseId] || "").trim();
    const paddedFId = franchiseId ? String(Number(franchiseId) || franchiseId).padStart(3, "0") : "";
    const teamName = franchiseData[paddedFId] || "";

    rowsToAppend.push([
      year,
      copyId,
      row[PC_COLS.playerId],
      row[PC_COLS.playerName],
      row[PC_COLS.conference],
      paddedFId,
      teamName,
      effectiveDecision,
      retentionPath || "",
      cost,
      retentionCount,
      nationalAwards,
      allConfAwards,
      decisionDate.startsWith("PROCESSED-") ? decisionDate : (decisionDate || new Date().toISOString())
    ]);

    migrated++;
    Logger.log(`  Migrating: ${row[PC_COLS.playerName]} (${copyId}) - ${effectiveDecision} for ${year}`);
  });

  // Batch write
  if (rowsToAppend.length > 0) {
    const startRow = histSheet.getLastRow() + 1;
    histSheet.getRange(startRow, 1, rowsToAppend.length, RETENTION_HISTORY_HEADERS.length)
      .setValues(rowsToAppend);
  }

  Logger.log(`\n=== BACKFILL COMPLETE ===`);
  Logger.log(`  Migrated: ${migrated}`);
  Logger.log(`  Skipped (already in history): ${skippedDuplicate}`);
  Logger.log(`  Skipped (no decision): ${skippedNoDecision}`);

  return { migrated, skippedDuplicate, skippedNoDecision };
}

/**
 * Menu function to backfill retention history
 */
function menuBackfillRetentionHistory() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Backfill Retention History',
    'This will migrate existing retention decisions from PlayerCopies into the ' +
    'RetentionHistory sheet.\n\n' +
    'This is safe to run multiple times — duplicates are skipped.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = backfillRetentionHistory();

  ui.alert(
    'Backfill Complete',
    `Results:\n\n` +
    `Migrated: ${result.migrated}\n` +
    `Skipped (already exists): ${result.skippedDuplicate}\n` +
    `Skipped (no decision): ${result.skippedNoDecision}\n\n` +
    'See Logs for details.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// AWARD SYNC FUNCTIONS
// ============================================================================

/**
 * Clear award data from PlayerCopies sheet (ONLY the 3 award columns)
 * Resets: NationalAwards=0, AllConferenceAwards=0, AwardHistory=[]
 * Does NOT touch any other columns (ownership, eligibility, etc.)
 * Call this before rebuilding awards from scratch
 *
 * @returns {Number} - Number of rows cleared
 */
function clearAllAwardsFromPlayerCopies() {
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("  No player copies to clear");
    return 0;
  }

  const numRows = data.length - 1;
  Logger.log(`  Clearing 3 award columns from ${numRows} player copies...`);
  Logger.log(`    - Column ${PC_COLS.nationalAwards + 1}: NationalAwards → 0`);
  Logger.log(`    - Column ${PC_COLS.allConferenceAwards + 1}: AllConferenceAwards → 0`);
  Logger.log(`    - Column ${PC_COLS.awardHistory + 1}: AwardHistory → []`);

  // Build arrays for batch update (only these 3 columns)
  const nationalValues = Array(numRows).fill([0]);
  const allConfValues = Array(numRows).fill([0]);
  const historyValues = Array(numRows).fill(["[]"]);

  // Batch update ONLY the 3 award columns
  pcSheet.getRange(2, PC_COLS.nationalAwards + 1, numRows, 1).setValues(nationalValues);
  pcSheet.getRange(2, PC_COLS.allConferenceAwards + 1, numRows, 1).setValues(allConfValues);
  pcSheet.getRange(2, PC_COLS.awardHistory + 1, numRows, 1).setValues(historyValues);

  Logger.log(`  ✓ Cleared award columns from ${numRows} rows`);
  return numRows;
}

/**
 * Sync awards from Awards sheet to PlayerCopies for a given year
 * Updates NationalAwards, AllConferenceAwards, and AwardHistory columns
 *
 * @param {Number|String} year - Season year to sync awards for
 * @returns {Object} - Summary of sync operation
 */
function syncAwardsToPlayerCopies(year) {
  const config = getConfig();
  year = Number(year);

  Logger.log(`=== SYNCING AWARDS TO PLAYER COPIES FOR ${year} ===`);

  // Get Awards sheet data
  const ss = SpreadsheetApp.getActive();
  const awardsSheet = ss.getSheetByName(config.sheets.awards);

  if (!awardsSheet) {
    throw new Error("Awards sheet not found. Run calculateAwards() first.");
  }

  const awardsData = awardsSheet.getDataRange().getValues();
  const awardsHeaders = awardsData[0];

  // Find relevant columns in Awards sheet
  const awardsCols = {
    year: awardsHeaders.indexOf("Year"),
    awardType: awardsHeaders.indexOf("AwardType"),
    copyId: awardsHeaders.indexOf("PlayerCopyID"),
    rank: awardsHeaders.indexOf("Rank")
  };

  // Log Awards sheet column structure for debugging
  Logger.log(`  Awards sheet columns: Year=${awardsCols.year}, AwardType=${awardsCols.awardType}, PlayerCopyID=${awardsCols.copyId}, Rank=${awardsCols.rank}`);

  if (awardsCols.copyId === -1) {
    throw new Error("PlayerCopyID column not found in Awards sheet. Check column headers.");
  }

  // Filter awards for this year
  const yearAwards = awardsData.slice(1).filter(row => Number(row[awardsCols.year]) === year);
  Logger.log(`  Found ${yearAwards.length} award entries for ${year}`);

  if (yearAwards.length === 0) {
    Logger.log(`  WARNING: No awards found for ${year}. Run 'Calculate Awards' first.`);
    return { year: year, awardsProcessed: 0, copiesUpdated: 0 };
  }

  // Log sample of award copyIds for debugging
  const sampleCopyIds = yearAwards.slice(0, 5).map(r => r[awardsCols.copyId]);
  Logger.log(`  Sample award copyIds: ${sampleCopyIds.join(', ')}`);

  // Build award counts by copyId
  // National awards: Heisman (rank 1) or National_* (rank 1)
  // All-Conference awards: Only count ONCE per team type (1st/2nd/3rd) per conference per year
  //   - A player on 1st team with rank 1, 2, or 3 (position within team) = 1 award
  //   - The awardType format is: AllConf_{conference}_{1st|2nd|3rd}
  const awardsByCopy = {}; // copyId -> { national: 0, allConf: 0, awards: [], seenAllConf: Set }

  yearAwards.forEach(row => {
    const copyId = row[awardsCols.copyId];
    const awardType = row[awardsCols.awardType];
    const rank = Number(row[awardsCols.rank]);

    if (!copyId) return;

    if (!awardsByCopy[copyId]) {
      awardsByCopy[copyId] = { national: 0, allConf: 0, awards: [], seenAllConf: new Set() };
    }

    // Check if this is a national award (rank 1 only)
    const isNational = (awardType === "Heisman" && rank === 1) ||
                       (awardType.startsWith("National_") && rank === 1);

    // Check if this is an all-conference award
    // Format: AllConf_{conference}_{1st|2nd|3rd}
    // A player can only be on ONE All-Conference team per year (either 1st, 2nd, or 3rd team)
    // The "rank" in the Awards sheet is their position WITHIN that team (1st RB, 2nd RB, etc.)
    const isAllConf = awardType.startsWith("AllConf_");

    if (isNational) {
      awardsByCopy[copyId].national++;
      awardsByCopy[copyId].awards.push({ type: awardType, year: year, rank: rank });
    } else if (isAllConf) {
      // Only count this All-Conference award if we haven't already counted this exact team type
      // e.g., AllConf_ACC_1st should only count once even if player has rank 1, 2, or 3 within it
      if (!awardsByCopy[copyId].seenAllConf.has(awardType)) {
        awardsByCopy[copyId].seenAllConf.add(awardType);
        awardsByCopy[copyId].allConf++;
        awardsByCopy[copyId].awards.push({ type: awardType, year: year, rank: rank });
      }
    }
  });

  Logger.log(`  Processed awards for ${Object.keys(awardsByCopy).length} unique player copies`);

  // Log sample of processed copyIds for debugging
  const processedCopyIds = Object.keys(awardsByCopy).slice(0, 5);
  Logger.log(`  Sample processed copyIds: ${processedCopyIds.join(', ')}`);

  // Get PlayerCopies sheet
  const pcSheet = getPlayerCopiesSheet();
  const pcData = pcSheet.getDataRange().getValues();

  if (pcData.length <= 1) {
    Logger.log("  No player copies found");
    return { updated: 0, error: "No player copies" };
  }

  // Log PlayerCopies column structure for debugging
  const pcHeaders = pcData[0];
  Logger.log(`  PlayerCopies headers: ${pcHeaders.slice(0, 16).join(', ')}`);
  Logger.log(`  Expected column positions - copyId: ${PC_COLS.copyId}, nationalAwards: ${PC_COLS.nationalAwards}, allConferenceAwards: ${PC_COLS.allConferenceAwards}, awardHistory: ${PC_COLS.awardHistory}`);

  // Verify columns exist at expected positions
  const expectedColumns = {
    copyId: pcHeaders[PC_COLS.copyId],
    nationalAwards: pcHeaders[PC_COLS.nationalAwards],
    allConferenceAwards: pcHeaders[PC_COLS.allConferenceAwards],
    awardHistory: pcHeaders[PC_COLS.awardHistory]
  };
  Logger.log(`  Actual columns at positions - copyId: "${expectedColumns.copyId}", nationalAwards: "${expectedColumns.nationalAwards}", allConferenceAwards: "${expectedColumns.allConferenceAwards}", awardHistory: "${expectedColumns.awardHistory}"`);

  // Sample PlayerCopies copyIds for debugging
  const samplePCCopyIds = pcData.slice(1, 6).map(r => r[PC_COLS.copyId]);
  Logger.log(`  Sample PlayerCopies copyIds: ${samplePCCopyIds.join(', ')}`);

  // Check for matches
  let matchCount = 0;
  const pcCopyIdSet = new Set(pcData.slice(1).map(r => String(r[PC_COLS.copyId])));
  Object.keys(awardsByCopy).forEach(copyId => {
    if (pcCopyIdSet.has(String(copyId))) matchCount++;
  });
  Logger.log(`  CopyId matches found: ${matchCount} of ${Object.keys(awardsByCopy).length} award copyIds exist in PlayerCopies`);

  // Update each player copy with new award data
  let updatedCount = 0;
  let skippedNoAwards = 0;
  const rows = pcData.slice(1);

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // Account for header
    const copyId = row[PC_COLS.copyId];

    // Try both string and original type for comparison
    const copyIdStr = String(copyId);
    const copyAwards = awardsByCopy[copyId] || awardsByCopy[copyIdStr];

    if (!copyAwards) {
      skippedNoAwards++;
      return; // No awards for this copy
    }

    // Get existing award history
    let existingHistory = [];
    try {
      existingHistory = JSON.parse(row[PC_COLS.awardHistory] || "[]");
    } catch (e) {
      existingHistory = [];
    }

    // Merge new awards (avoid duplicates)
    const existingKeys = new Set(existingHistory.map(a => `${a.type}-${a.year}`));
    const newAwards = copyAwards.awards.filter(a => !existingKeys.has(`${a.type}-${a.year}`));

    const updatedHistory = [...existingHistory, ...newAwards];

    // Always recalculate counts even if no new awards (in case counts are out of sync)

    // Recalculate totals from full history
    // For All-Conference: only count ONE per year (highest team - 1st > 2nd > 3rd)
    let totalNational = 0;
    let totalAllConf = 0;

    // Track best All-Conference selection per year
    const allConfByYear = {}; // year -> best team (1st, 2nd, 3rd)

    updatedHistory.forEach(award => {
      if (award.type === "Heisman" || award.type.startsWith("National_")) {
        if (award.rank === 1) totalNational++;
      } else if (award.type.startsWith("AllConf_")) {
        // Extract team from type (e.g., "AllConf_ACC_1st" -> "1st")
        const parts = award.type.split("_");
        const team = parts[2]; // "1st", "2nd", or "3rd"
        const teamPriority = { "1st": 3, "2nd": 2, "3rd": 1 };

        const yr = award.year;
        if (!allConfByYear[yr] || teamPriority[team] > teamPriority[allConfByYear[yr]]) {
          allConfByYear[yr] = team;
        }
      }
    });

    // Count unique All-Conference years (one award per year max)
    totalAllConf = Object.keys(allConfByYear).length;

    // Update the row
    pcSheet.getRange(rowNum, PC_COLS.nationalAwards + 1).setValue(totalNational);
    pcSheet.getRange(rowNum, PC_COLS.allConferenceAwards + 1).setValue(totalAllConf);
    pcSheet.getRange(rowNum, PC_COLS.awardHistory + 1).setValue(JSON.stringify(updatedHistory));
    pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

    updatedCount++;

    // Log progress every 10 updates
    if (updatedCount <= 5 || updatedCount % 10 === 0) {
      Logger.log(`    Updated row ${rowNum}: ${row[PC_COLS.playerName]} - National: ${totalNational}, AllConf: ${totalAllConf}`);
    }
  });

  Logger.log(`  Updated ${updatedCount} player copies with award data`);
  Logger.log(`  Skipped ${skippedNoAwards} player copies with no awards for ${year}`);

  if (updatedCount === 0 && Object.keys(awardsByCopy).length > 0) {
    Logger.log(`  ⚠️ WARNING: Awards exist but no PlayerCopies were updated!`);
    Logger.log(`    This usually means copyIds don't match between Awards and PlayerCopies sheets.`);
    Logger.log(`    Compare the sample copyIds logged above to identify format differences.`);
  }

  return {
    year: year,
    awardsProcessed: yearAwards.length,
    copiesUpdated: updatedCount
  };
}

/**
 * Sync awards for all historical years
 * @param {Number} startYear - First year to sync
 * @param {Number} endYear - Last year to sync
 */
function syncAllHistoricalAwards(startYear, endYear) {
  Logger.log(`=== SYNCING ALL HISTORICAL AWARDS: ${startYear} to ${endYear} ===`);

  const results = [];

  for (let year = startYear; year <= endYear; year++) {
    try {
      const result = syncAwardsToPlayerCopies(year);
      results.push(result);
      Logger.log(`  ${year}: Synced ${result.copiesUpdated} copies`);
    } catch (error) {
      Logger.log(`  ${year}: ERROR - ${error.message}`);
      results.push({ year: year, error: error.message });
    }
  }

  return results;
}

// ============================================================================
// DECLARATION ELIGIBILITY FUNCTIONS
// ============================================================================

/**
 * Check if a player copy is eligible for early declaration
 *
 * Requirements:
 * - Completed 3rd year of eligibility (EligibilityYearsUsed >= 3)
 * - Has earned either:
 *   - 1+ National Award (Heisman rank 1 or National_* rank 1), OR
 *   - 2+ All-Conference Awards (1st/2nd/3rd team)
 *
 * @param {Array} row - Player copy row data
 * @returns {Object} - { eligible: boolean, reason: string }
 */
function checkDeclarationEligibility(row) {
  const eligibilityYearsUsed = Number(row[PC_COLS.eligibilityYearsUsed]) || 0;
  const traditionalRedshirt = row[PC_COLS.traditionalRedshirtUsed] === true || row[PC_COLS.traditionalRedshirtUsed] === "TRUE";
  const medicalRedshirt = row[PC_COLS.medicalRedshirtUsed] === true || row[PC_COLS.medicalRedshirtUsed] === "TRUE";
  const totalProgramYears = eligibilityYearsUsed + (traditionalRedshirt ? 1 : 0) + (medicalRedshirt ? 1 : 0);
  const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
  const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
  const active = row[PC_COLS.active];
  const alreadyDeclared = row[PC_COLS.declaredEarly] === true || row[PC_COLS.declaredEarly] === "TRUE";

  // Must be active
  if (!active) {
    return { eligible: false, reason: "Player copy is not active" };
  }

  // Cannot declare if already declared
  if (alreadyDeclared) {
    return { eligible: false, reason: "Already declared early" };
  }

  // Must have 3+ total program years (playing years + redshirt years)
  if (totalProgramYears < 3) {
    return { eligible: false, reason: `Only ${totalProgramYears} program years (${eligibilityYearsUsed} playing + redshirts), need 3+` };
  }

  // Check award requirements
  const hasNationalAward = nationalAwards >= 1;
  const hasTwoAllConf = allConfAwards >= 2;

  if (hasNationalAward) {
    return { eligible: true, reason: `Has ${nationalAwards} national award(s)` };
  }

  if (hasTwoAllConf) {
    return { eligible: true, reason: `Has ${allConfAwards} all-conference selections` };
  }

  return {
    eligible: false,
    reason: `Needs 1 national award OR 2 all-conf selections (has ${nationalAwards} national, ${allConfAwards} all-conf)`
  };
}

/**
 * Get all player copies eligible for early declaration
 * @returns {Array} - Array of eligible player copy objects with eligibility details
 */
function getDeclarationEligibleCopies() {
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const eligibleCopies = [];
  const rows = data.slice(1);

  rows.forEach((row, idx) => {
    const eligibility = checkDeclarationEligibility(row);

    if (eligibility.eligible) {
      const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
      const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
      const retentionCount = Number(row[PC_COLS.retentionCount]) || 0;

      // Calculate retention cost info
      const costInfo = getRetentionCostInfo({
        nationalAwards: nationalAwards,
        allConfAwards: allConfAwards,
        retentionCount: retentionCount
      });

      eligibleCopies.push({
        rowNum: idx + 2,
        copyId: row[PC_COLS.copyId],
        playerId: row[PC_COLS.playerId],
        playerName: row[PC_COLS.playerName],
        conference: row[PC_COLS.conference],
        franchiseId: row[PC_COLS.currentFranchiseId],
        eligibilityYearsUsed: row[PC_COLS.eligibilityYearsUsed],
        nationalAwards: nationalAwards,
        allConfAwards: allConfAwards,
        awardHistory: row[PC_COLS.awardHistory],
        retentionDecision: row[PC_COLS.retentionDecision],
        retentionPath: costInfo.path,
        retentionCount: retentionCount,
        retentionCost: costInfo.cost,
        retentionCostLabel: costInfo.costLabel,
        reason: eligibility.reason
      });
    }
  });

  return eligibleCopies;
}

/**
 * View all declaration-eligible players in the log
 */
function viewDeclarationEligible() {
  const eligible = getDeclarationEligibleCopies();

  Logger.log(`=== DECLARATION ELIGIBLE PLAYERS (${eligible.length} total) ===\n`);

  if (eligible.length === 0) {
    Logger.log("No players currently eligible for early declaration.");
    return;
  }

  // Group by conference
  const byConference = {};
  eligible.forEach(copy => {
    if (!byConference[copy.conference]) {
      byConference[copy.conference] = [];
    }
    byConference[copy.conference].push(copy);
  });

  Object.keys(byConference).sort().forEach(conf => {
    Logger.log(`\n${conf}:`);
    byConference[conf].forEach(copy => {
      const decision = copy.retentionDecision || "PENDING";
      Logger.log(`  ${copy.playerName} (${copy.copyId})`);
      Logger.log(`    Years: ${copy.eligibilityYearsUsed}, National: ${copy.nationalAwards}, AllConf: ${copy.allConfAwards}`);
      Logger.log(`    Reason: ${copy.reason}`);
      Logger.log(`    Retention: ${decision}`);
    });
  });
}

// ============================================================================
// RETENTION DECISION FUNCTIONS
// ============================================================================

/**
 * Record a retention decision for a player copy
 * Called from Discord bot or manual entry
 *
 * @param {String} copyId - The PlayerCopyID to update
 * @param {String} decision - "RETAIN" or "RELEASE"
 * @returns {Object} - Result of the operation
 */
function recordRetentionDecision(copyId, decision) {
  if (!copyId) {
    throw new Error("copyId is required");
  }

  decision = String(decision).toUpperCase().trim();

  if (decision !== "RETAIN" && decision !== "RELEASE") {
    throw new Error("Decision must be RETAIN or RELEASE");
  }

  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  // Find the row with this copyId
  let targetRowNum = -1;
  let targetRow = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][PC_COLS.copyId] === copyId) {
      targetRowNum = i + 1; // 1-indexed
      targetRow = data[i];
      break;
    }
  }

  if (targetRowNum === -1) {
    throw new Error(`Player copy ${copyId} not found`);
  }

  // Check if eligible for declaration
  const eligibility = checkDeclarationEligibility(targetRow);

  if (!eligibility.eligible) {
    throw new Error(`Player not eligible for early declaration: ${eligibility.reason}`);
  }

  // Record the decision
  pcSheet.getRange(targetRowNum, PC_COLS.retentionDecision + 1).setValue(decision);
  pcSheet.getRange(targetRowNum, PC_COLS.retentionDecisionDate + 1).setValue(new Date());
  pcSheet.getRange(targetRowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

  Logger.log(`Recorded ${decision} decision for ${targetRow[PC_COLS.playerName]} (${copyId})`);

  return {
    success: true,
    copyId: copyId,
    playerName: targetRow[PC_COLS.playerName],
    decision: decision,
    timestamp: new Date()
  };
}

/**
 * Record retention decision by player name and conference
 * More user-friendly for Discord commands
 *
 * @param {String} playerName - Player name (partial match supported)
 * @param {String} conference - Conference name
 * @param {String} decision - "RETAIN" or "RELEASE"
 * @returns {Object} - Result of the operation
 */
function recordRetentionByName(playerName, conference, decision) {
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  const searchName = String(playerName).toLowerCase().trim();
  const searchConf = String(conference).toUpperCase().trim();

  // Find matching copies
  const matches = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[PC_COLS.playerName]).toLowerCase();
    const conf = String(row[PC_COLS.conference]).toUpperCase();

    if (name.includes(searchName) && conf === searchConf) {
      matches.push({
        rowIndex: i,
        copyId: row[PC_COLS.copyId],
        playerName: row[PC_COLS.playerName],
        conference: row[PC_COLS.conference]
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(`No player found matching "${playerName}" in ${conference}`);
  }

  if (matches.length > 1) {
    const names = matches.map(m => m.playerName).join(", ");
    throw new Error(`Multiple matches found: ${names}. Please be more specific.`);
  }

  return recordRetentionDecision(matches[0].copyId, decision);
}

// ============================================================================
// DECLARATION PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process all early declarations for the year
 * Should be run during end-of-season processing
 *
 * - Players with RELEASE decision -> Mark as declared early, set inactive
 * - Players with RETAIN decision -> Keep active, clear decision for next year
 * - Players with no decision -> Auto-retain (keep active)
 *
 * @param {Number|String} year - The season year being processed
 * @returns {Object} - Summary of processing
 */
function processEarlyDeclarations(year) {
  year = Number(year);
  Logger.log(`=== PROCESSING EARLY DECLARATIONS FOR ${year} ===`);

  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  if (data.length <= 1) {
    return { released: 0, retained: 0, autoRetained: 0, skipped: 0 };
  }

  const processedMarker = `PROCESSED-${year}`;
  const rows = data.slice(1);
  let released = 0;
  let retained = 0;
  let autoRetained = 0;
  let skipped = 0;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const eligibility = checkDeclarationEligibility(row);

    if (!eligibility.eligible) return;

    const decision = String(row[PC_COLS.retentionDecision] || "").toUpperCase().trim();
    const playerName = row[PC_COLS.playerName];
    const copyId = row[PC_COLS.copyId];
    const existingDecisionDate = String(row[PC_COLS.retentionDecisionDate] || "");

    // Idempotency guard: skip if already processed for this year
    // After RETAIN/auto-retain processing, retentionDecisionDate is set to "PROCESSED-{year}"
    // RELEASE is already idempotent (released players become inactive and fail eligibility check)
    if (existingDecisionDate === processedMarker) {
      Logger.log(`  SKIPPED (already processed): ${playerName} (${copyId})`);
      skipped++;
      return;
    }

    // Get current retention count and path for cost tracking
    const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
    const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
    const currentRetentionCount = Number(row[PC_COLS.retentionCount]) || 0;
    const retentionPath = determineRetentionPath(nationalAwards, allConfAwards);

    if (decision === "RELEASE") {
      // Mark as declared early and inactive
      pcSheet.getRange(rowNum, PC_COLS.declaredEarly + 1).setValue(true);
      pcSheet.getRange(rowNum, PC_COLS.declarationYear + 1).setValue(year);
      pcSheet.getRange(rowNum, PC_COLS.active + 1).setValue(false);
      pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

      Logger.log(`  RELEASED: ${playerName} (${copyId})`);
      released++;
    } else if (decision === "RETAIN") {
      // Increment retention count and record the path
      const newRetentionCount = currentRetentionCount + 1;
      pcSheet.getRange(rowNum, PC_COLS.retentionDecision + 1).setValue("");
      pcSheet.getRange(rowNum, PC_COLS.retentionDecisionDate + 1).setValue(processedMarker);
      pcSheet.getRange(rowNum, PC_COLS.retentionPath + 1).setValue(retentionPath);
      pcSheet.getRange(rowNum, PC_COLS.retentionCount + 1).setValue(newRetentionCount);
      pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

      const cost = calculateRetentionCost(retentionPath, currentRetentionCount);
      Logger.log(`  RETAINED: ${playerName} (${copyId}) - Path: ${retentionPath}, Cost: $${cost}, Count: ${newRetentionCount}`);
      retained++;
    } else {
      // No decision = auto-retain (same as explicit retain)
      const newRetentionCount = currentRetentionCount + 1;
      pcSheet.getRange(rowNum, PC_COLS.retentionDecisionDate + 1).setValue(processedMarker);
      pcSheet.getRange(rowNum, PC_COLS.retentionPath + 1).setValue(retentionPath);
      pcSheet.getRange(rowNum, PC_COLS.retentionCount + 1).setValue(newRetentionCount);
      pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

      const cost = calculateRetentionCost(retentionPath, currentRetentionCount);
      Logger.log(`  AUTO-RETAINED: ${playerName} (${copyId}) - no decision made, Path: ${retentionPath}, Cost: $${cost}`);
      autoRetained++;
    }
  });

  Logger.log(`\n=== DECLARATION PROCESSING COMPLETE ===`);
  Logger.log(`  Released: ${released}`);
  Logger.log(`  Retained: ${retained}`);
  Logger.log(`  Auto-Retained: ${autoRetained}`);
  if (skipped > 0) {
    Logger.log(`  Skipped (already processed): ${skipped}`);
  }

  return {
    year: year,
    released: released,
    retained: retained,
    autoRetained: autoRetained,
    total: released + retained + autoRetained
  };
}

/**
 * Get pending retention decisions (eligible players without a decision)
 * @returns {Array} - Array of player copies needing decisions
 */
function getPendingRetentionDecisions() {
  const eligible = getDeclarationEligibleCopies();

  return eligible.filter(copy => {
    const decision = String(copy.retentionDecision || "").trim();
    return decision === "";
  });
}

/**
 * View pending retention decisions
 */
function viewPendingDecisions() {
  const pending = getPendingRetentionDecisions();

  Logger.log(`=== PENDING RETENTION DECISIONS (${pending.length} total) ===\n`);

  if (pending.length === 0) {
    Logger.log("All eligible players have retention decisions recorded.");
    return;
  }

  pending.forEach(copy => {
    Logger.log(`${copy.playerName} (${copy.conference})`);
    Logger.log(`  Copy ID: ${copy.copyId}`);
    Logger.log(`  Owner: ${copy.franchiseId || "FA"}`);
    Logger.log(`  Reason: ${copy.reason}`);
    Logger.log("");
  });
}

// ============================================================================
// MIGRATION FUNCTION
// ============================================================================

/**
 * Add new columns to existing PlayerCopies sheet
 * Run this once to migrate existing data
 */
function migratePlayerCopiesToNewSchema() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    Logger.log("PlayerCopies sheet not found");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Check if migration is needed
  if (headers.includes("NationalAwards")) {
    Logger.log("Schema already migrated");
    return;
  }

  // Add new headers
  const newHeaders = [
    "NationalAwards",
    "AllConferenceAwards",
    "AwardHistory",
    "DeclaredEarly",
    "DeclarationYear",
    "RetentionDecision",
    "RetentionDecisionDate",
    "RetentionPath",
    "RetentionCount"
  ];

  const existingColCount = headers.length;

  // Add headers
  newHeaders.forEach((header, idx) => {
    sheet.getRange(1, existingColCount + idx + 1).setValue(header);
  });

  // Set bold
  sheet.getRange(1, existingColCount + 1, 1, newHeaders.length).setFontWeight("bold");

  // Add default values for existing rows
  const rowCount = data.length - 1; // Exclude header
  if (rowCount > 0) {
    const defaultValues = [];
    for (let i = 0; i < rowCount; i++) {
      // NationalAwards, AllConferenceAwards, AwardHistory, DeclaredEarly, DeclarationYear,
      // RetentionDecision, RetentionDecisionDate, RetentionPath, RetentionCount
      defaultValues.push([0, 0, "[]", false, "", "", "", "", 0]);
    }
    sheet.getRange(2, existingColCount + 1, rowCount, newHeaders.length).setValues(defaultValues);
  }

  Logger.log(`Migrated PlayerCopies schema: added ${newHeaders.length} new columns`);
}

// ============================================================================
// MENU FUNCTIONS
// ============================================================================

/**
 * Menu function to sync current year's awards
 */
function menuSyncCurrentYearAwards() {
  const year = getLeagueYear();

  const result = syncAwardsToPlayerCopies(year);

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Awards Sync Complete',
    `Synced awards for ${year}:\n\n` +
    `Awards processed: ${result.awardsProcessed}\n` +
    `Player copies updated: ${result.copiesUpdated}`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu function to sync all historical awards (2021-current)
 */
function menuSyncAllHistoricalAwards() {
  const ui = SpreadsheetApp.getUi();

  // Prompt for start year
  const startResponse = ui.prompt(
    'Sync Historical Awards',
    'Enter the START year (e.g., 2021):',
    ui.ButtonSet.OK_CANCEL
  );

  if (startResponse.getSelectedButton() !== ui.Button.OK) return;

  const startYear = Number(startResponse.getResponseText().trim());
  if (isNaN(startYear) || startYear < 2020 || startYear > 2030) {
    ui.alert('Invalid start year. Please enter a year between 2020 and 2030.');
    return;
  }

  // Prompt for end year
  const endResponse = ui.prompt(
    'Sync Historical Awards',
    `Enter the END year (e.g., ${getLeagueYear()}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (endResponse.getSelectedButton() !== ui.Button.OK) return;

  const endYear = Number(endResponse.getResponseText().trim());
  if (isNaN(endYear) || endYear < startYear || endYear > 2030) {
    ui.alert(`Invalid end year. Please enter a year between ${startYear} and 2030.`);
    return;
  }

  // Confirm
  const confirm = ui.alert(
    'Confirm Historical Sync',
    `This will sync awards from ${startYear} to ${endYear}.\n\n` +
    `This may take a while for multiple years.\n\n` +
    `Continue?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  // Run the sync
  Logger.log(`Starting historical awards sync: ${startYear} to ${endYear}`);
  const results = syncAllHistoricalAwards(startYear, endYear);

  // Build summary
  let totalUpdated = 0;
  let errors = 0;
  const summary = results.map(r => {
    if (r.error) {
      errors++;
      return `${r.year}: ERROR - ${r.error}`;
    }
    totalUpdated += r.copiesUpdated || 0;
    return `${r.year}: ${r.copiesUpdated} copies updated`;
  }).join('\n');

  ui.alert(
    'Historical Awards Sync Complete',
    `Synced awards from ${startYear} to ${endYear}:\n\n` +
    `${summary}\n\n` +
    `Total copies updated: ${totalUpdated}\n` +
    `Errors: ${errors}\n\n` +
    `See Logs for details.`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu function to view eligible players
 */
function menuViewEligiblePlayers() {
  viewDeclarationEligible();

  const eligible = getDeclarationEligibleCopies();
  const ui = SpreadsheetApp.getUi();

  if (eligible.length === 0) {
    ui.alert('Declaration Eligible', 'No players currently eligible for early declaration.', ui.ButtonSet.OK);
    return;
  }

  const summary = eligible.map(c => `${c.playerName} (${c.conference})`).join('\n');
  ui.alert(
    'Declaration Eligible',
    `${eligible.length} players eligible:\n\n${summary}\n\nSee Logs for details.`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu function to process declarations
 */
function menuProcessDeclarations() {
  const year = getLeagueYear();
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Process Early Declarations',
    `This will process all early declarations for ${year}:\n\n` +
    `- RELEASE decisions -> Player declared early, marked inactive\n` +
    `- RETAIN decisions -> Player kept active\n` +
    `- No decision -> Auto-retained\n\n` +
    `Proceed?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = processEarlyDeclarations(year);

  ui.alert(
    'Declarations Processed',
    `Results for ${year}:\n\n` +
    `Released: ${result.released}\n` +
    `Retained: ${result.retained}\n` +
    `Auto-Retained: ${result.autoRetained}`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu function to view pending decisions
 */
function menuViewPendingDecisions() {
  viewPendingDecisions();

  const pending = getPendingRetentionDecisions();
  const ui = SpreadsheetApp.getUi();

  if (pending.length === 0) {
    ui.alert('Pending Decisions', 'All eligible players have retention decisions recorded.', ui.ButtonSet.OK);
    return;
  }

  const summary = pending.map(c => `${c.playerName} (${c.conference})`).join('\n');
  ui.alert(
    'Pending Decisions',
    `${pending.length} players need decisions:\n\n${summary}\n\nSee Logs for details.`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================================

/**
 * Diagnose award sync issues for a specific player
 * Use this to troubleshoot why a player might not be appearing in TheoreticalDraft
 *
 * @param {String} playerName - Player name to search for (partial match)
 */
function diagnosePlayerAwards(playerName) {
  const config = getConfig();
  const year = getLeagueYear();

  Logger.log(`\n========================================`);
  Logger.log(`DIAGNOSING AWARDS FOR: "${playerName}"`);
  Logger.log(`Current Year: ${year}`);
  Logger.log(`========================================\n`);

  // Step 1: Check Awards sheet
  Logger.log(`--- Step 1: Check Awards Sheet ---`);
  const ss = SpreadsheetApp.getActive();
  const awardsSheet = ss.getSheetByName(config.sheets.awards);

  if (!awardsSheet) {
    Logger.log(`❌ Awards sheet not found!`);
    return;
  }

  const awardsData = awardsSheet.getDataRange().getValues();
  const awardsHeaders = awardsData[0];
  const awardsCols = {
    year: awardsHeaders.indexOf("Year"),
    awardType: awardsHeaders.indexOf("AwardType"),
    playerName: awardsHeaders.indexOf("PlayerName"),
    copyId: awardsHeaders.indexOf("PlayerCopyID"),
    rank: awardsHeaders.indexOf("Rank"),
    franchiseId: awardsHeaders.indexOf("FranchiseID")
  };

  const matchingAwards = awardsData.slice(1).filter(row =>
    String(row[awardsCols.playerName] || "").toLowerCase().includes(playerName.toLowerCase())
  );

  if (matchingAwards.length === 0) {
    Logger.log(`❌ No awards found for player matching "${playerName}"`);
    Logger.log(`   This means the player didn't win any awards or calculateAwards wasn't run.`);
  } else {
    Logger.log(`✓ Found ${matchingAwards.length} award entries:\n`);
    matchingAwards.forEach(row => {
      const awardYear = row[awardsCols.year];
      const awardType = row[awardsCols.awardType];
      const rank = row[awardsCols.rank];
      const copyId = row[awardsCols.copyId];

      // Determine if this award counts
      const isNational = (awardType === "Heisman" && rank === 1) ||
                         (String(awardType).startsWith("National_") && rank === 1);
      const isAllConf = String(awardType).startsWith("AllConf_");

      let countStatus = "";
      if (isNational) countStatus = "✓ COUNTS as National Award";
      else if (isAllConf) countStatus = "✓ COUNTS as All-Conference";
      else if (rank !== 1 && (awardType === "Heisman" || String(awardType).startsWith("National_"))) {
        countStatus = `❌ Does NOT count (rank ${rank}, need rank 1 for national)`;
      }

      Logger.log(`  ${awardYear} | ${awardType} | Rank: ${rank} | CopyID: ${copyId}`);
      Logger.log(`       ${countStatus}`);
    });
  }

  // Step 2: Check PlayerCopies
  Logger.log(`\n--- Step 2: Check PlayerCopies Sheet ---`);
  const pcSheet = getPlayerCopiesSheet();
  const pcData = pcSheet.getDataRange().getValues();

  const matchingCopies = pcData.slice(1).filter(row =>
    String(row[PC_COLS.playerName] || "").toLowerCase().includes(playerName.toLowerCase())
  );

  if (matchingCopies.length === 0) {
    Logger.log(`❌ No player copies found matching "${playerName}"`);
  } else {
    Logger.log(`✓ Found ${matchingCopies.length} player copies:\n`);
    matchingCopies.forEach(row => {
      const copyId = row[PC_COLS.copyId];
      const name = row[PC_COLS.playerName];
      const franchiseId = String(row[PC_COLS.currentFranchiseId] || "").padStart(3, "0");
      const conference = row[PC_COLS.conference];
      const yearsUsed = row[PC_COLS.eligibilityYearsUsed];
      const active = row[PC_COLS.active];
      const nationalAwards = row[PC_COLS.nationalAwards] || 0;
      const allConfAwards = row[PC_COLS.allConferenceAwards] || 0;
      const awardHistory = row[PC_COLS.awardHistory] || "[]";

      Logger.log(`  CopyID: ${copyId}`);
      Logger.log(`    Name: ${name}`);
      Logger.log(`    FranchiseID: ${franchiseId}`);
      Logger.log(`    Conference: ${conference}`);
      Logger.log(`    EligibilityYearsUsed: ${yearsUsed}`);
      Logger.log(`    Active: ${active}`);
      Logger.log(`    NationalAwards: ${nationalAwards}`);
      Logger.log(`    AllConferenceAwards: ${allConfAwards}`);
      Logger.log(`    AwardHistory: ${awardHistory}`);

      // Check eligibility
      const hasNational = Number(nationalAwards) >= 1;
      const hasTwoAllConf = Number(allConfAwards) >= 2;
      const has3Years = Number(yearsUsed) >= 3;

      Logger.log(`\n    --- Eligibility Check ---`);
      if (hasNational) {
        Logger.log(`    ✓ Has ${nationalAwards} National Award(s) - ELIGIBLE for early declaration`);
      } else if (hasTwoAllConf) {
        Logger.log(`    ✓ Has ${allConfAwards} All-Conference Awards - ELIGIBLE for early declaration`);
      } else if (Number(allConfAwards) === 1) {
        Logger.log(`    ⚠️ Has 1 All-Conference Award - needs 2 for eligibility`);
      } else {
        Logger.log(`    ❌ No qualifying awards (nat: ${nationalAwards}, allConf: ${allConfAwards})`);
      }

      if (!has3Years && (hasNational || hasTwoAllConf)) {
        Logger.log(`    ⚠️ Only ${yearsUsed} years - needs 3+ years for early declaration`);
      }

      if (active !== true && active !== "TRUE") {
        Logger.log(`    ⚠️ Player is NOT ACTIVE - won't appear in draft unless early declared`);
      }
    });
  }

  // Step 3: Check if copyIds match between Awards and PlayerCopies
  Logger.log(`\n--- Step 3: Cross-Reference Check ---`);
  if (matchingAwards.length > 0 && matchingCopies.length > 0) {
    const awardCopyIds = new Set(matchingAwards.map(r => r[awardsCols.copyId]));
    const pcCopyIds = new Set(matchingCopies.map(r => r[PC_COLS.copyId]));

    const matching = [...awardCopyIds].filter(id => pcCopyIds.has(id));
    const onlyInAwards = [...awardCopyIds].filter(id => !pcCopyIds.has(id));
    const onlyInPC = [...pcCopyIds].filter(id => !awardCopyIds.has(id));

    if (matching.length > 0) {
      Logger.log(`✓ Matching CopyIDs: ${matching.join(", ")}`);
    }
    if (onlyInAwards.length > 0) {
      Logger.log(`⚠️ CopyIDs in Awards but NOT in PlayerCopies: ${onlyInAwards.join(", ")}`);
    }
    if (onlyInPC.length > 0) {
      Logger.log(`ℹ️ CopyIDs in PlayerCopies without awards this search: ${onlyInPC.join(", ")}`);
    }
  }

  Logger.log(`\n========================================`);
  Logger.log(`DIAGNOSIS COMPLETE`);
  Logger.log(`========================================`);
  Logger.log(`\nNext steps if player not showing in TheoreticalDraft:`);
  Logger.log(`1. If no awards found -> Run 'Calculate Awards' first`);
  Logger.log(`2. If awards exist but PlayerCopies shows 0 -> Run 'Sync Current Year Awards'`);
  Logger.log(`3. If NationalAwards/AllConferenceAwards are 0 but AwardHistory has data -> Schema mismatch, check column order`);
  Logger.log(`4. If player has awards but not 3+ years -> Not eligible for early declaration yet`);
}

/**
 * Menu function to diagnose a player's award data
 */
function menuDiagnosePlayerAwards() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Diagnose Player Awards',
    'Enter player name (or partial name) to diagnose:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const playerName = response.getResponseText().trim();
  if (!playerName) {
    ui.alert('Please enter a player name.');
    return;
  }

  diagnosePlayerAwards(playerName);

  ui.alert(
    'Diagnosis Complete',
    `Diagnosis for "${playerName}" has been logged.\n\n` +
    'View > Logs to see the full output.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// HISTORICAL BACKFILL FUNCTIONS
// ============================================================================

/**
 * Manually set historical retention count for a player copy
 * Use this to backfill data from 2021-2024 seasons
 *
 * @param {String} copyId - The PlayerCopyID to update
 * @param {Number} retentionCount - Number of times previously retained
 * @param {String} retentionPath - "NATIONAL" or "ALL_CONFERENCE" (optional, will auto-detect if not provided)
 */
function setHistoricalRetentionCount(copyId, retentionCount, retentionPath = null) {
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][PC_COLS.copyId] === copyId) {
      const rowNum = i + 1;

      // Auto-detect path if not provided
      if (!retentionPath) {
        const nationalAwards = Number(data[i][PC_COLS.nationalAwards]) || 0;
        const allConfAwards = Number(data[i][PC_COLS.allConferenceAwards]) || 0;
        retentionPath = determineRetentionPath(nationalAwards, allConfAwards);
      }

      pcSheet.getRange(rowNum, PC_COLS.retentionCount + 1).setValue(retentionCount);
      if (retentionPath) {
        pcSheet.getRange(rowNum, PC_COLS.retentionPath + 1).setValue(retentionPath);
      }
      pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

      Logger.log(`Set ${data[i][PC_COLS.playerName]} (${copyId}): RetentionCount=${retentionCount}, Path=${retentionPath}`);
      return true;
    }
  }

  Logger.log(`ERROR: Copy ID ${copyId} not found`);
  return false;
}

/**
 * Bulk set historical retention counts from a simple array
 * Format: [[copyId, retentionCount, optionalPath], ...]
 *
 * Example usage in script editor:
 *   bulkSetHistoricalRetention([
 *     ["ACC_12345_1", 2, "NATIONAL"],
 *     ["B10_67890_1", 1, "ALL_CONFERENCE"],
 *     ["SEC_11111_1", 1]  // Path will be auto-detected
 *   ]);
 */
function bulkSetHistoricalRetention(retentionData) {
  Logger.log(`=== BULK SETTING HISTORICAL RETENTION DATA ===`);
  Logger.log(`Processing ${retentionData.length} entries...`);

  let success = 0;
  let failed = 0;

  retentionData.forEach(entry => {
    const [copyId, count, path] = entry;
    if (setHistoricalRetentionCount(copyId, count, path || null)) {
      success++;
    } else {
      failed++;
    }
  });

  Logger.log(`\n=== COMPLETE ===`);
  Logger.log(`Success: ${success}, Failed: ${failed}`);

  return { success, failed };
}

/**
 * Find players who likely should have historical retention counts
 * based on their awards and years used
 * This helps identify who needs backfill
 */
function findPlayersNeedingHistoricalBackfill() {
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  Logger.log(`=== PLAYERS POTENTIALLY NEEDING HISTORICAL BACKFILL ===\n`);

  const candidates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const active = row[PC_COLS.active] === true || row[PC_COLS.active] === "TRUE";
    const yearsUsed = Number(row[PC_COLS.eligibilityYearsUsed]) || 0;
    const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
    const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
    const retentionCount = Number(row[PC_COLS.retentionCount]) || 0;
    const createdSeason = Number(row[PC_COLS.createdSeason]) || 0;

    // Skip if not active or no awards
    if (!active) continue;
    if (nationalAwards < 1 && allConfAwards < 2) continue;

    // Skip if already has retention count set
    if (retentionCount > 0) continue;

    // If player has been around for a while and has awards, they may have been retained before
    // Estimate: if years used > 3 and has awards, they likely were retained at least once
    const likelyRetained = yearsUsed > 3 && (nationalAwards >= 1 || allConfAwards >= 2);

    if (likelyRetained || createdSeason <= 2023) {
      const path = determineRetentionPath(nationalAwards, allConfAwards);
      candidates.push({
        copyId: row[PC_COLS.copyId],
        playerName: row[PC_COLS.playerName],
        conference: row[PC_COLS.conference],
        yearsUsed: yearsUsed,
        nationalAwards: nationalAwards,
        allConfAwards: allConfAwards,
        createdSeason: createdSeason,
        suggestedPath: path,
        suggestedCount: Math.max(0, yearsUsed - 3) // Rough estimate
      });
    }
  }

  // Log candidates
  candidates.forEach(c => {
    Logger.log(`${c.playerName} (${c.copyId})`);
    Logger.log(`  Conference: ${c.conference}, Created: ${c.createdSeason}`);
    Logger.log(`  Years Used: ${c.yearsUsed}, National: ${c.nationalAwards}, AllConf: ${c.allConfAwards}`);
    Logger.log(`  Suggested: Path=${c.suggestedPath}, Count=${c.suggestedCount}`);
    Logger.log("");
  });

  Logger.log(`\nTotal candidates: ${candidates.length}`);
  Logger.log(`\nTo set retention counts, use:`);
  Logger.log(`  setHistoricalRetentionCount("COPY_ID", COUNT, "PATH")`);
  Logger.log(`or for bulk:`);
  Logger.log(`  bulkSetHistoricalRetention([["COPY_ID", COUNT, "PATH"], ...])`);

  return candidates;
}

/**
 * Menu function to find players needing historical backfill
 */
function menuFindPlayersNeedingBackfill() {
  const candidates = findPlayersNeedingHistoricalBackfill();
  const ui = SpreadsheetApp.getUi();

  if (candidates.length === 0) {
    ui.alert('Historical Backfill', 'No players found needing historical retention backfill.', ui.ButtonSet.OK);
    return;
  }

  const summary = candidates.slice(0, 10).map(c =>
    `${c.playerName} (${c.conference}) - Suggest: ${c.suggestedCount}x ${c.suggestedPath || 'TBD'}`
  ).join('\n');

  const moreText = candidates.length > 10 ? `\n\n...and ${candidates.length - 10} more` : '';

  ui.alert(
    'Historical Backfill Candidates',
    `Found ${candidates.length} players who may need historical retention counts set:\n\n` +
    `${summary}${moreText}\n\n` +
    `See Logs for full details and instructions on how to set values.`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// AWARD HISTORY CLEANUP
// ============================================================================

/**
 * Clean up award history for all player copies
 * - Removes duplicate All-Conference entries (keeps best team per year)
 * - Recalculates NationalAwards and AllConferenceAwards counts
 *
 * @returns {Object} - Summary of cleanup
 */
function cleanupAwardHistory() {
  Logger.log(`=== CLEANING UP AWARD HISTORY ===`);

  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("No player copies found");
    return { processed: 0, fixed: 0 };
  }

  let processed = 0;
  let fixed = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    const copyId = row[PC_COLS.copyId];
    const playerName = row[PC_COLS.playerName];

    // Parse existing history
    let history = [];
    try {
      history = JSON.parse(row[PC_COLS.awardHistory] || "[]");
    } catch (e) {
      history = [];
    }

    if (history.length === 0) continue;
    processed++;

    // Clean up the history - dedupe All-Conference by year (keep best team)
    const cleanedHistory = [];
    const allConfByYear = {}; // year -> { team: "1st", award: {...} }
    const teamPriority = { "1st": 3, "2nd": 2, "3rd": 1 };

    history.forEach(award => {
      if (award.type.startsWith("AllConf_")) {
        const parts = award.type.split("_");
        const team = parts[2];
        const yr = award.year;

        if (!allConfByYear[yr] || teamPriority[team] > teamPriority[allConfByYear[yr].team]) {
          allConfByYear[yr] = { team: team, award: award };
        }
      } else {
        // National/Heisman awards - keep as is (but check for rank 1)
        if ((award.type === "Heisman" || award.type.startsWith("National_")) && award.rank === 1) {
          cleanedHistory.push(award);
        } else if (award.type === "Heisman" || award.type.startsWith("National_")) {
          // Skip non-rank-1 national awards
        } else {
          cleanedHistory.push(award);
        }
      }
    });

    // Add the best All-Conference award per year
    Object.values(allConfByYear).forEach(entry => {
      cleanedHistory.push(entry.award);
    });

    // Recalculate counts
    let totalNational = 0;
    let totalAllConf = Object.keys(allConfByYear).length;

    cleanedHistory.forEach(award => {
      if ((award.type === "Heisman" || award.type.startsWith("National_")) && award.rank === 1) {
        totalNational++;
      }
    });

    // Check if anything changed
    const oldNational = Number(row[PC_COLS.nationalAwards]) || 0;
    const oldAllConf = Number(row[PC_COLS.allConferenceAwards]) || 0;
    const historyChanged = JSON.stringify(cleanedHistory) !== JSON.stringify(history);

    if (historyChanged || oldNational !== totalNational || oldAllConf !== totalAllConf) {
      // Update the row
      pcSheet.getRange(rowNum, PC_COLS.nationalAwards + 1).setValue(totalNational);
      pcSheet.getRange(rowNum, PC_COLS.allConferenceAwards + 1).setValue(totalAllConf);
      pcSheet.getRange(rowNum, PC_COLS.awardHistory + 1).setValue(JSON.stringify(cleanedHistory));
      pcSheet.getRange(rowNum, PC_COLS.lastUpdated + 1).setValue(new Date());

      Logger.log(`Fixed ${playerName} (${copyId}): National ${oldNational}->${totalNational}, AllConf ${oldAllConf}->${totalAllConf}`);
      if (historyChanged) {
        Logger.log(`  Old history: ${history.length} entries, New history: ${cleanedHistory.length} entries`);
      }
      fixed++;
    }
  }

  Logger.log(`\n=== CLEANUP COMPLETE ===`);
  Logger.log(`Processed: ${processed}, Fixed: ${fixed}`);

  return { processed, fixed };
}

/**
 * Menu function to clean up award history
 */
function menuCleanupAwardHistory() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Cleanup Award History',
    'This will:\n' +
    '• Remove duplicate All-Conference entries (keep best team per year)\n' +
    '• Recalculate NationalAwards and AllConferenceAwards counts\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = cleanupAwardHistory();

  ui.alert(
    'Cleanup Complete',
    `Processed: ${result.processed} player copies\n` +
    `Fixed: ${result.fixed} copies\n\n` +
    'See Logs for details.',
    ui.ButtonSet.OK
  );
}
