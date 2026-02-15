/**
 * REDSHIRT TRACKING
 * Detects and applies traditional and medical redshirts using the TransactionLog sheet.
 * NO MFL API calls — all data comes from the local TransactionLog.
 *
 * REDSHIRT RULES:
 *   Traditional: NFL rookie on TAXI at end of season (last TAXI move is a DEMOTION).
 *                Players CAN be promoted and re-demoted during the year — only the
 *                final move matters. Only eligible once per copy, only in rookie year.
 *
 *   Medical:     Player on IR at end of season (last IR move is a DEACTIVATION).
 *                Players CAN be activated and re-deactivated during the year — only
 *                the final move matters. Only eligible ONCE per copy EVER, even if
 *                placed on IR again in a later year.
 */

// ============================================================================
// TRANSACTION LOG READER
// ============================================================================

/**
 * Read taxi and IR movements from the TransactionLog sheet for a given year.
 * Tracks the LAST MOVE per franchise-player and per copy.
 *
 * A player can be demoted/promoted or deactivated/activated multiple times
 * in a season. What determines the redshirt is the LAST move of that type:
 *   - Traditional: last TAXI move is DEMOTION → on taxi at season end → earns redshirt
 *   - Medical: last IR move is DEACTIVATION → on IR at season end → earns redshirt
 *
 * @param {number|string} year - The league year to scan
 * @returns {{
 *   byFranchisePlayer: Object.<string, {lastTaxiMove: string|null, lastIRMove: string|null}>,
 *   byCopy: Object.<string, {lastTaxiMove: string|null, lastIRMove: string|null, franchiseId: string}>
 * }}
 */
function getRedshirtMovementsFromTransactionLog(year) {
  const targetYear = Number(year);
  const tlSheet = SpreadsheetApp.getActive().getSheetByName("TransactionLog");

  const empty = { byFranchisePlayer: {}, byCopy: {} };

  if (!tlSheet) {
    Logger.log("⚠️  TransactionLog sheet not found");
    return empty;
  }

  const data = tlSheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("⚠️  TransactionLog is empty");
    return empty;
  }

  // Build column index from headers
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  // Filter to target year and sort by timestamp (oldest first)
  const entries = data.slice(1)
    .filter(row => Number(row[col["Year"]]) === targetYear)
    .sort((a, b) => new Date(a[col["Timestamp"]]).getTime() - new Date(b[col["Timestamp"]]).getTime());

  // "franchiseId-playerId" -> { lastTaxiMove, lastIRMove }
  const byFranchisePlayer = {};
  // "copyId" -> { lastTaxiMove, lastIRMove, franchiseId }
  const byCopy = {};

  entries.forEach(row => {
    const action = String(row[col["Action"]] || "");
    const rawFranchise = String(row[col["FranchiseID"]] || "").trim();
    const playerId = String(row[col["PlayerID"]] || "").trim();
    const copyId = String(row[col["CopyAssigned"]] || "").trim();

    if (!rawFranchise || !playerId) return;

    const franchiseId = String(Number(rawFranchise) || 0).padStart(3, "0");
    const fpKey = `${franchiseId}-${playerId}`;

    // Initialize franchise-player entry
    if (!byFranchisePlayer[fpKey]) {
      byFranchisePlayer[fpKey] = { lastTaxiMove: null, lastIRMove: null };
    }

    // Initialize copy entry (only for real copy IDs)
    const isRealCopy = copyId && copyId.startsWith("PC-");
    if (isRealCopy && !byCopy[copyId]) {
      byCopy[copyId] = { lastTaxiMove: null, lastIRMove: null, franchiseId: franchiseId };
    }

    // TAXI movements — track last move (since entries are sorted by timestamp,
    // each subsequent entry overwrites the previous, leaving the final state)
    if (action.includes("TAXI - Demoted")) {
      byFranchisePlayer[fpKey].lastTaxiMove = "DEMOTED";
      if (isRealCopy) {
        byCopy[copyId].lastTaxiMove = "DEMOTED";
        byCopy[copyId].franchiseId = franchiseId;
      }
    }
    if (action.includes("TAXI - Promoted")) {
      byFranchisePlayer[fpKey].lastTaxiMove = "PROMOTED";
      if (isRealCopy) {
        byCopy[copyId].lastTaxiMove = "PROMOTED";
        byCopy[copyId].franchiseId = franchiseId;
      }
    }

    // IR movements — track last move
    if (action.includes("IR - Deactivated")) {
      byFranchisePlayer[fpKey].lastIRMove = "DEACTIVATED";
      if (isRealCopy) {
        byCopy[copyId].lastIRMove = "DEACTIVATED";
        byCopy[copyId].franchiseId = franchiseId;
      }
    }
    if (action.includes("IR - Activated")) {
      byFranchisePlayer[fpKey].lastIRMove = "ACTIVATED";
      if (isRealCopy) {
        byCopy[copyId].lastIRMove = "ACTIVATED";
        byCopy[copyId].franchiseId = franchiseId;
      }
    }
  });

  const taxiCount = Object.values(byFranchisePlayer).filter(v => v.lastTaxiMove).length;
  const irCount = Object.values(byFranchisePlayer).filter(v => v.lastIRMove).length;
  Logger.log(`  TransactionLog ${targetYear}: ${taxiCount} franchise-players with taxi moves, ${irCount} with IR moves`);

  return { byFranchisePlayer, byCopy };
}

// ============================================================================
// SEASON REDSHIRT PROCESSING (reads from TransactionLog, no API calls)
// ============================================================================

/**
 * Process redshirts for a season using the TransactionLog sheet.
 * Should be run at end of season before year rollover.
 */
function processRedshirtsForSeason(year) {
  Logger.log(`Processing redshirts for ${year} season (from TransactionLog)...`);

  const movements = getRedshirtMovementsFromTransactionLog(year);
  const traditional = processTraditionalRedshirts(year, movements);
  const medical = processMedicalRedshirts(year, movements);

  Logger.log(`✅ Applied ${traditional} traditional redshirts, ${medical} medical redshirts`);

  return { traditional, medical };
}

/**
 * Process traditional redshirts for a season.
 * Rule: Rookie copy whose LAST TAXI move in the year is a DEMOTION (on taxi at season end).
 *       Only eligible once per copy, only in their rookie year (CreatedSeason == year).
 *
 * @param {number|string} year
 * @param {Object} [movements] - Pre-fetched movements (optional, will fetch if not provided)
 */
function processTraditionalRedshirts(year, movements) {
  if (!movements) movements = getRedshirtMovementsFromTransactionLog(year);
  const { byFranchisePlayer } = movements;

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  let applied = 0;

  copies.forEach((row, idx) => {
    const rowNum = idx + 2;
    const playerId = String(row[1]);
    const currentOwner = row[4] ? String(Number(row[4])).padStart(3, "0") : "";
    const createdSeason = String(row[8]);
    const alreadyUsed = row[6] === true || row[6] === "TRUE";

    // Only rookies (created this year) are eligible for traditional redshirt
    if (createdSeason !== String(year)) return;
    if (alreadyUsed) return;
    if (!currentOwner) return;

    // Check if this franchise-player's LAST taxi move was a demotion (on taxi at season end)
    const key = `${currentOwner}-${playerId}`;
    const status = byFranchisePlayer[key];
    if (!status || status.lastTaxiMove !== "DEMOTED") return;

    // Apply traditional redshirt
    sheet.getRange(rowNum, 7).setValue(true);   // TraditionalRedshirtUsed
    sheet.getRange(rowNum, 11).setValue(new Date());
    sheet.getRange(rowNum, 12).setValue(year);  // TraditionalRedshirtYear
    applied++;
    Logger.log(`    Traditional redshirt: ${row[2]} (${row[0]}) — owner ${currentOwner}`);
  });

  return applied;
}

/**
 * Process medical redshirts for a season.
 * Rule: Copy whose LAST IR move in the year is a DEACTIVATION (on IR at season end).
 *       Eligible for any year, but ONLY ONCE per copy EVER.
 *       Even if a copy is placed on IR again in a later year, it cannot receive
 *       a second medical redshirt.
 *
 * @param {number|string} year
 * @param {Object} [movements] - Pre-fetched movements (optional, will fetch if not provided)
 */
function processMedicalRedshirts(year, movements) {
  if (!movements) movements = getRedshirtMovementsFromTransactionLog(year);
  const { byFranchisePlayer } = movements;

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  let applied = 0;
  let skippedAlreadyUsed = 0;

  copies.forEach((row, idx) => {
    const rowNum = idx + 2;
    const playerId = String(row[1]);
    const currentOwner = row[4] ? String(Number(row[4])).padStart(3, "0") : "";
    const alreadyUsed = row[7] === true || row[7] === "TRUE";

    if (!currentOwner) return;

    const key = `${currentOwner}-${playerId}`;
    const status = byFranchisePlayer[key];

    // Only care about copies whose last IR move was a deactivation (on IR at season end)
    if (!status || status.lastIRMove !== "DEACTIVATED") return;

    // CRITICAL: Only one medical redshirt per copy, EVER.
    // A copy can be placed on IR again in a later year but cannot earn another medical redshirt.
    if (alreadyUsed) {
      skippedAlreadyUsed++;
      Logger.log(`    Skipped medical redshirt for ${row[2]} (${row[0]}) — already used their one medical redshirt`);
      return;
    }

    // Apply medical redshirt
    sheet.getRange(rowNum, 8).setValue(true);   // MedicalRedshirtUsed
    sheet.getRange(rowNum, 11).setValue(new Date());
    sheet.getRange(rowNum, 13).setValue(year);  // MedicalRedshirtYear
    applied++;
    Logger.log(`    Medical redshirt: ${row[2]} (${row[0]}) — owner ${currentOwner}`);
  });

  if (skippedAlreadyUsed > 0) {
    Logger.log(`  ⚠️  ${skippedAlreadyUsed} copies were on IR at season end but already used their one medical redshirt`);
  }

  return applied;
}

// ============================================================================
// DIAGNOSTIC AND FIX FUNCTIONS
// ============================================================================

/**
 * Diagnose redshirt eligibility for a specific player across all years.
 * Uses TransactionLog — no API calls.
 * @param {String} playerIdOrName - Player ID (e.g., "15287") or partial name
 */
function diagnosePlayerRedshirts(playerIdOrName) {
  Logger.log(`=== DIAGNOSING REDSHIRTS FOR: ${playerIdOrName} ===\n`);

  // Find the player in PlayerCopies
  const pcSheet = getPlayerCopiesSheet();
  const pcData = pcSheet.getDataRange().getValues();

  let playerId = null;
  let playerName = null;
  const matchingCopies = [];

  for (let i = 1; i < pcData.length; i++) {
    const row = pcData[i];
    const pid = String(row[1]);
    const pname = String(row[2]);

    if (pid === String(playerIdOrName) || pname.toLowerCase().includes(String(playerIdOrName).toLowerCase())) {
      if (!playerId) {
        playerId = pid;
        playerName = pname;
      }
      matchingCopies.push({
        rowNum: i + 1,
        copyId: row[0],
        conference: row[3],
        currentOwner: row[4] ? String(Number(row[4])).padStart(3, "0") : "",
        eligibilityYearsUsed: Number(row[5]) || 0,
        traditionalRedshirt: row[6] === true || row[6] === "TRUE",
        medicalRedshirt: row[7] === true || row[7] === "TRUE",
        createdSeason: row[8],
        active: row[9] === true || row[9] === "TRUE",
        traditionalRedshirtYear: row[11] || "",
        medicalRedshirtYear: row[12] || ""
      });
    }
  }

  if (!playerId) {
    Logger.log(`❌ No player found matching "${playerIdOrName}"`);
    return;
  }

  Logger.log(`Found Player: ${playerName} (ID: ${playerId})`);
  Logger.log(`\n--- CURRENT COPY STATUS ---`);
  matchingCopies.forEach(copy => {
    Logger.log(`\n  ${copy.copyId}:`);
    Logger.log(`    Conference: ${copy.conference}`);
    Logger.log(`    Owner: ${copy.currentOwner || "(none)"}`);
    Logger.log(`    Active: ${copy.active}`);
    Logger.log(`    Created: ${copy.createdSeason}`);
    Logger.log(`    EligibilityYearsUsed: ${copy.eligibilityYearsUsed}`);
    Logger.log(`    Traditional Redshirt: ${copy.traditionalRedshirt}${copy.traditionalRedshirtYear ? ` (Year: ${copy.traditionalRedshirtYear})` : ""}`);
    Logger.log(`    Medical Redshirt: ${copy.medicalRedshirt}${copy.medicalRedshirtYear ? ` (Year: ${copy.medicalRedshirtYear})` : ""}`);
  });

  // Read ALL TransactionLog entries for this player
  const tlSheet = SpreadsheetApp.getActive().getSheetByName("TransactionLog");
  if (!tlSheet) {
    Logger.log(`\n❌ TransactionLog sheet not found — cannot show transaction history`);
    return;
  }

  const tlData = tlSheet.getDataRange().getValues();
  const tlHeaders = tlData[0];
  const tlCol = {};
  tlHeaders.forEach((h, i) => { tlCol[h] = i; });

  const currentYear = Number(getLeagueYear());
  const startYear = Math.min(...matchingCopies.map(c => Number(c.createdSeason) || currentYear));

  Logger.log(`\n--- TRANSACTION HISTORY (${startYear}-${currentYear}) ---`);

  for (let year = startYear; year <= currentYear; year++) {
    Logger.log(`\n  === ${year} SEASON ===`);

    // Filter TransactionLog for this player+year, taxi/IR actions
    const yearEntries = tlData.slice(1)
      .filter(row => {
        const rowYear = Number(row[tlCol["Year"]]);
        const rowPlayerId = String(row[tlCol["PlayerID"]] || "").trim();
        const action = String(row[tlCol["Action"]] || "");
        return rowYear === year && rowPlayerId === playerId &&
               (action.includes("TAXI") || action.includes("IR"));
      })
      .sort((a, b) => new Date(a[tlCol["Timestamp"]]).getTime() - new Date(b[tlCol["Timestamp"]]).getTime());

    if (yearEntries.length === 0) {
      Logger.log(`    (No TAXI/IR transactions found in TransactionLog)`);
    }

    // Track last moves
    let lastTaxiMove = null;
    let lastIRMove = null;

    yearEntries.forEach(row => {
      const timestamp = row[tlCol["Timestamp"]];
      const franchiseId = String(Number(row[tlCol["FranchiseID"]] || 0)).padStart(3, "0");
      const action = String(row[tlCol["Action"]] || "");
      const copyId = row[tlCol["CopyAssigned"]] || "";

      const dateStr = timestamp ? new Date(timestamp).toISOString() : "unknown";

      if (action.includes("TAXI - Demoted")) {
        Logger.log(`    [${dateStr}] TAXI DEMOTED by ${franchiseId} (${copyId})`);
        lastTaxiMove = "DEMOTED";
      }
      if (action.includes("TAXI - Promoted")) {
        Logger.log(`    [${dateStr}] TAXI PROMOTED by ${franchiseId} (${copyId})`);
        lastTaxiMove = "PROMOTED";
      }
      if (action.includes("IR - Deactivated")) {
        Logger.log(`    [${dateStr}] IR DEACTIVATED by ${franchiseId} (${copyId})`);
        lastIRMove = "DEACTIVATED";
      }
      if (action.includes("IR - Activated")) {
        Logger.log(`    [${dateStr}] IR ACTIVATED by ${franchiseId} (${copyId})`);
        lastIRMove = "ACTIVATED";
      }
    });

    // Determine eligibility based on last move
    const shouldGetTraditional = lastTaxiMove === "DEMOTED";
    const shouldGetMedical = lastIRMove === "DEACTIVATED";

    Logger.log(`\n    REDSHIRT ELIGIBILITY FOR ${year} (last-move rule):`);
    Logger.log(`      Traditional (Taxi): lastMove=${lastTaxiMove || "none"} => ON TAXI AT SEASON END: ${shouldGetTraditional ? "YES" : "NO"}`);
    Logger.log(`      Medical (IR): lastMove=${lastIRMove || "none"} => ON IR AT SEASON END: ${shouldGetMedical ? "YES" : "NO"}`);
  }

  Logger.log(`\n=== DIAGNOSIS COMPLETE ===`);
}

/**
 * Clear redshirt flags for a specific copy
 * Use this to fix incorrectly applied redshirts
 * @param {String} copyId - The PlayerCopyID to fix (e.g., "PC-15287-SEC-1")
 * @param {Boolean} clearTraditional - Whether to clear traditional redshirt flag
 * @param {Boolean} clearMedical - Whether to clear medical redshirt flag
 */
function clearRedshirtForCopy(copyId, clearTraditional = true, clearMedical = false) {
  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === copyId) {
      const rowNum = i + 1;
      const playerName = data[i][2];

      Logger.log(`Found ${copyId} (${playerName}) at row ${rowNum}`);

      if (clearTraditional) {
        sheet.getRange(rowNum, 7).setValue(false);  // TraditionalRedshirtUsed
        sheet.getRange(rowNum, 12).setValue("");    // TraditionalRedshirtYear
        Logger.log(`  Cleared Traditional Redshirt`);
      }

      if (clearMedical) {
        sheet.getRange(rowNum, 8).setValue(false);  // MedicalRedshirtUsed
        sheet.getRange(rowNum, 13).setValue("");    // MedicalRedshirtYear
        Logger.log(`  Cleared Medical Redshirt`);
      }

      sheet.getRange(rowNum, 11).setValue(new Date()); // LastUpdated

      Logger.log(`✅ Done. You may need to run recalculateAllActiveStatus() to update Active status.`);
      return true;
    }
  }

  Logger.log(`❌ Copy ${copyId} not found`);
  return false;
}

/**
 * Verify redshirts for all copies for a specific year.
 * Uses TransactionLog with last-move logic — no API calls.
 * @param {Number} year - Year to verify
 * @param {Boolean} fixIssues - If true, will fix incorrect redshirts
 * @returns {Object} - { issues: [], fixed: [] }
 */
function verifyRedshirtsForYear(year, fixIssues = false) {
  Logger.log(`=== VERIFYING REDSHIRTS FOR ${year} (from TransactionLog) ===\n`);

  const { byFranchisePlayer } = getRedshirtMovementsFromTransactionLog(year);

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();

  const issues = [];
  const fixed = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const copyId = row[0];
    const playerId = String(row[1]);
    const playerName = row[2];
    const currentOwner = row[4] ? String(Number(row[4])).padStart(3, "0") : "";
    const traditionalRedshirt = row[6] === true || row[6] === "TRUE";
    const medicalRedshirt = row[7] === true || row[7] === "TRUE";
    const createdSeason = String(row[8]);
    const traditionalYear = String(row[11] || "");
    const medicalYear = String(row[12] || "");

    if (!currentOwner) continue;

    const key = `${currentOwner}-${playerId}`;
    const status = byFranchisePlayer[key];

    // Check traditional redshirt (only for rookies in that year)
    if (traditionalYear === String(year) || (traditionalRedshirt && createdSeason === String(year))) {
      // Should have it if last taxi move was DEMOTION (on taxi at season end)
      const shouldHaveTraditional = status ? status.lastTaxiMove === "DEMOTED" : false;

      if (traditionalRedshirt && !shouldHaveTraditional) {
        const issue = {
          copyId, playerName, playerId,
          type: "TRADITIONAL",
          problem: `Has traditional redshirt for ${year} but last taxi move was ${status?.lastTaxiMove || "none"} (not on taxi at season end)`,
        };
        issues.push(issue);
        Logger.log(`❌ ${copyId} (${playerName}): ${issue.problem}`);

        if (fixIssues) {
          const rowNum = i + 1;
          sheet.getRange(rowNum, 7).setValue(false);
          sheet.getRange(rowNum, 12).setValue("");
          sheet.getRange(rowNum, 11).setValue(new Date());
          fixed.push(issue);
          Logger.log(`  ✅ FIXED: Cleared traditional redshirt`);
        }
      }
    }

    // Check medical redshirt
    if (medicalYear === String(year)) {
      // Should have it if last IR move was DEACTIVATION (on IR at season end)
      const shouldHaveMedical = status ? status.lastIRMove === "DEACTIVATED" : false;

      if (medicalRedshirt && !shouldHaveMedical) {
        const issue = {
          copyId, playerName, playerId,
          type: "MEDICAL",
          problem: `Has medical redshirt for ${year} but last IR move was ${status?.lastIRMove || "none"} (not on IR at season end)`,
        };
        issues.push(issue);
        Logger.log(`❌ ${copyId} (${playerName}): ${issue.problem}`);

        if (fixIssues) {
          const rowNum = i + 1;
          sheet.getRange(rowNum, 8).setValue(false);
          sheet.getRange(rowNum, 13).setValue("");
          sheet.getRange(rowNum, 11).setValue(new Date());
          fixed.push(issue);
          Logger.log(`  ✅ FIXED: Cleared medical redshirt`);
        }
      }
    }
  }

  Logger.log(`\n=== SUMMARY ===`);
  Logger.log(`Total issues found: ${issues.length}`);
  if (fixIssues) {
    Logger.log(`Issues fixed: ${fixed.length}`);
  }

  return { issues, fixed };
}

// ============================================================================
// FULL RECALCULATION (from TransactionLog, no API calls)
// ============================================================================

/**
 * Build ownership map from TransactionLog up to a target year.
 * Returns copyId -> franchiseId (who owned each copy at end of that year).
 * Uses TransactionLog — no API calls.
 */
function buildOwnershipFromTransactionLog(targetYear) {
  const tlSheet = SpreadsheetApp.getActive().getSheetByName("TransactionLog");
  if (!tlSheet) {
    Logger.log("⚠️  TransactionLog sheet not found");
    return {};
  }

  const data = tlSheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  // Filter to entries up through targetYear, sorted by timestamp
  const entries = data.slice(1)
    .filter(row => Number(row[col["Year"]]) <= targetYear)
    .sort((a, b) => new Date(a[col["Timestamp"]]).getTime() - new Date(b[col["Timestamp"]]).getTime());

  const ownership = {}; // copyId -> franchiseId

  entries.forEach(row => {
    const copyId = String(row[col["CopyAssigned"]] || "").trim();
    if (!copyId || !copyId.startsWith("PC-")) return;

    const action = String(row[col["Action"]] || "").toUpperCase();
    const franchiseId = String(Number(row[col["FranchiseID"]] || 0)).padStart(3, "0");

    if (action.includes("DROP") || action.includes("RELEASE")) {
      ownership[copyId] = null;
    } else if (action.includes("AUCTION") || action.includes("ASSIGNED") ||
               action.includes("ADD") || action.includes("TRADE") ||
               action.includes("CLAIM") || action.includes("PICKUP")) {
      ownership[copyId] = franchiseId;
    }
    // TAXI/IR moves don't change ownership, just status
  });

  return ownership;
}

/**
 * Recalculate ALL redshirts from scratch using TransactionLog.
 * NO API calls — reads entirely from TransactionLog sheet.
 *
 * Steps:
 * 1. Clear all existing redshirt flags
 * 2. For each year, read taxi/IR movements from TransactionLog (last-move logic)
 * 3. Apply redshirts using copy-level data (CopyAssigned column) or ownership map
 * 4. Enforce: traditional = rookie only, once per copy; medical = once per copy EVER
 * 5. Recalculate EligibilityYearsUsed and Active status
 */
function recalculateAllRedshirts() {
  const currentYear = Number(getLeagueYear());
  const startYear = 2021; // First year of the league

  Logger.log(`=== RECALCULATING ALL REDSHIRTS FROM TRANSACTIONLOG (${startYear}-${currentYear}) ===\n`);

  // Step 1: Read all PlayerCopies into memory for batch update
  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  // Clear all redshirt fields in memory
  Logger.log(`Step 1: Clearing all existing redshirts...`);
  let cleared = 0;
  copies.forEach(row => {
    const hasTraditional = row[6] === true || row[6] === "TRUE";
    const hasMedical = row[7] === true || row[7] === "TRUE";
    if (hasTraditional || hasMedical) {
      row[6] = false;   // TraditionalRedshirtUsed
      row[7] = false;   // MedicalRedshirtUsed
      row[11] = "";      // TraditionalRedshirtYear
      row[12] = "";      // MedicalRedshirtYear
      cleared++;
    }
  });
  Logger.log(`  Cleared redshirts from ${cleared} copies in memory\n`);

  // Build a lookup: copyId -> row index (for copy-level matching)
  const copyIndex = {};
  copies.forEach((row, idx) => {
    copyIndex[String(row[0])] = idx;
  });

  // Step 2: For each year, process redshirts
  Logger.log(`Step 2: Reprocessing redshirts for each year (last-move logic)...`);
  let totalTraditional = 0;
  let totalMedical = 0;

  for (let year = startYear; year <= currentYear; year++) {
    Logger.log(`\n  Processing ${year}...`);

    const { byFranchisePlayer, byCopy } = getRedshirtMovementsFromTransactionLog(year);

    // Build ownership map for this year to match franchise-player to copies
    const ownershipMap = buildOwnershipFromTransactionLog(year);

    let yearTraditional = 0;
    let yearMedical = 0;

    // --- Traditional redshirts (copy-level from byCopy) ---
    // Try copy-level first (CopyAssigned in TransactionLog)
    Object.entries(byCopy).forEach(([copyId, status]) => {
      if (status.lastTaxiMove !== "DEMOTED") return;

      const idx = copyIndex[copyId];
      if (idx === undefined) return;

      const row = copies[idx];
      const createdSeason = String(row[8]);
      const alreadyUsed = row[6] === true || row[6] === "TRUE";

      // Traditional: only rookies, only once
      if (createdSeason !== String(year)) return;
      if (alreadyUsed) return;

      row[6] = true;         // TraditionalRedshirtUsed
      row[11] = year;        // TraditionalRedshirtYear
      row[10] = new Date();  // LastUpdated
      yearTraditional++;
      Logger.log(`    Traditional: ${row[2]} (${copyId})`);
    });

    // Fallback: also check franchise-player level for copies not caught by copy-level
    Object.entries(byFranchisePlayer).forEach(([fpKey, status]) => {
      if (status.lastTaxiMove !== "DEMOTED") return;

      const [franchiseId, playerId] = fpKey.split("-");

      // Find copies owned by this franchise for this player
      copies.forEach((row, idx) => {
        const rowPlayerId = String(row[1]);
        if (rowPlayerId !== playerId) return;

        const createdSeason = String(row[8]);
        if (createdSeason !== String(year)) return;

        const alreadyUsed = row[6] === true || row[6] === "TRUE";
        if (alreadyUsed) return;

        // Check ownership: does this franchise own this copy?
        const copyId = String(row[0]);
        const owner = ownershipMap[copyId];
        if (owner !== franchiseId) return;

        row[6] = true;
        row[11] = year;
        row[10] = new Date();
        yearTraditional++;
        Logger.log(`    Traditional (ownership match): ${row[2]} (${copyId})`);
      });
    });

    // --- Medical redshirts (copy-level from byCopy) ---
    Object.entries(byCopy).forEach(([copyId, status]) => {
      if (status.lastIRMove !== "DEACTIVATED") return;

      const idx = copyIndex[copyId];
      if (idx === undefined) return;

      const row = copies[idx];
      const alreadyUsed = row[7] === true || row[7] === "TRUE";

      // Medical: only ONCE per copy EVER
      if (alreadyUsed) {
        Logger.log(`    Skipped medical for ${row[2]} (${copyId}) — already used their one medical redshirt`);
        return;
      }

      row[7] = true;         // MedicalRedshirtUsed
      row[12] = year;        // MedicalRedshirtYear
      row[10] = new Date();  // LastUpdated
      yearMedical++;
      Logger.log(`    Medical: ${row[2]} (${copyId})`);
    });

    // Fallback: franchise-player level
    Object.entries(byFranchisePlayer).forEach(([fpKey, status]) => {
      if (status.lastIRMove !== "DEACTIVATED") return;

      const [franchiseId, playerId] = fpKey.split("-");

      copies.forEach((row, idx) => {
        const rowPlayerId = String(row[1]);
        if (rowPlayerId !== playerId) return;

        const alreadyUsed = row[7] === true || row[7] === "TRUE";
        if (alreadyUsed) return;

        const copyId = String(row[0]);
        const owner = ownershipMap[copyId];
        if (owner !== franchiseId) return;

        row[7] = true;
        row[12] = year;
        row[10] = new Date();
        yearMedical++;
        Logger.log(`    Medical (ownership match): ${row[2]} (${copyId})`);
      });
    });

    totalTraditional += yearTraditional;
    totalMedical += yearMedical;
    Logger.log(`    Applied ${yearTraditional} traditional, ${yearMedical} medical redshirts`);
  }

  // Step 3: Write all updates back to sheet at once
  Logger.log(`\nStep 3: Writing updates to sheet...`);
  if (copies.length > 0) {
    sheet.getRange(2, 1, copies.length, copies[0].length).setValues(copies);
  }

  // Step 4: Recalculate eligibility years and active status
  Logger.log(`\nStep 4: Recalculating eligibility years and active status...`);
  backfillEligibilityYears(startYear, currentYear);

  Logger.log(`\n=== RECALCULATION COMPLETE ===`);
  Logger.log(`Redshirts cleared: ${cleared}`);
  Logger.log(`Traditional redshirts applied: ${totalTraditional}`);
  Logger.log(`Medical redshirts applied: ${totalMedical}`);
  Logger.log(`Eligibility years and Active status updated for all copies.`);

  return { cleared, totalTraditional, totalMedical };
}

// ============================================================================
// DEBUG FUNCTIONS
// ============================================================================

/**
 * Debug ownership and redshirt eligibility for a specific player in a specific year.
 * Uses TransactionLog — no API calls.
 */
function debugRedshirtAssignment(playerId, year) {
  Logger.log(`=== DEBUG REDSHIRT ASSIGNMENT FOR PLAYER ${playerId} IN ${year} ===\n`);

  // Build ownership map for that year from TransactionLog
  Logger.log(`Building ownership map for ${year} from TransactionLog...`);
  const ownershipMap = buildOwnershipFromTransactionLog(year);

  // Get all copies for this player
  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  const playerCopies = copies.filter(row => String(row[1]) === String(playerId));

  Logger.log(`\nFound ${playerCopies.length} copies for player ${playerId}:\n`);

  playerCopies.forEach(row => {
    const copyId = row[0];
    const playerName = row[2];
    const conference = row[3];
    const currentOwner = row[4] ? String(Number(row[4])).padStart(3, "0") : "(none)";
    const createdSeason = row[8];
    const historicalOwner = ownershipMap[copyId] || "(unowned)";

    Logger.log(`  ${copyId}:`);
    Logger.log(`    Player: ${playerName}`);
    Logger.log(`    Conference: ${conference}`);
    Logger.log(`    Created Season: ${createdSeason}`);
    Logger.log(`    Current Owner: ${currentOwner}`);
    Logger.log(`    Owner in ${year} (from TransactionLog): ${historicalOwner}`);
  });

  // Get movements from TransactionLog
  const { byFranchisePlayer, byCopy } = getRedshirtMovementsFromTransactionLog(year);

  Logger.log(`\n--- TAXI/IR STATUS FROM TRANSACTIONLOG ---\n`);

  // Show franchise-player level status
  Object.entries(byFranchisePlayer).forEach(([key, status]) => {
    if (!key.includes(`-${playerId}`)) return;
    Logger.log(`  ${key}: lastTaxiMove=${status.lastTaxiMove || "none"}, lastIRMove=${status.lastIRMove || "none"}`);
  });

  // Show copy-level status
  Logger.log(`\n--- COPY-LEVEL STATUS ---\n`);
  playerCopies.forEach(row => {
    const copyId = String(row[0]);
    const createdSeason = String(row[8]);
    const copyStatus = byCopy[copyId];

    if (copyStatus) {
      const taxiRedshirt = copyStatus.lastTaxiMove === "DEMOTED" && createdSeason === String(year);
      const irRedshirt = copyStatus.lastIRMove === "DEACTIVATED";
      Logger.log(`  ${copyId}: lastTaxiMove=${copyStatus.lastTaxiMove || "none"}, lastIRMove=${copyStatus.lastIRMove || "none"}`);
      Logger.log(`    Traditional eligible: ${taxiRedshirt ? "YES (rookie, on taxi at season end)" : "NO"}`);
      Logger.log(`    Medical eligible: ${irRedshirt ? "YES (on IR at season end)" : "NO"}`);
    } else {
      Logger.log(`  ${copyId}: No taxi/IR activity in TransactionLog for ${year}`);
    }
  });

  Logger.log(`\n=== DEBUG COMPLETE ===`);
}

// Menu wrappers
function diagnoseAmonRa() { diagnosePlayerRedshirts("15287"); }
function verifyRedshirts2021() { verifyRedshirtsForYear(2021, false); }
function fixRedshirts2021() { verifyRedshirtsForYear(2021, true); }
function debugAmonRa2021() { debugRedshirtAssignment("15287", 2021); }
