/**
 * PLAYER COPY MANAGEMENT
 * Handles creation, tracking, and eligibility of player copies
 */

/**
 * Get or create the PlayerCopies sheet
 */
function getPlayerCopiesSheet() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    sheet = ss.insertSheet(config.sheets.playerCopies);
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
      "MedicalRedshirtYear",
      "NationalAwards",         // Count of national awards (Heisman/position awards rank 1)
      "AllConferenceAwards",    // Count of all-conference selections (1st/2nd/3rd team)
      "AwardHistory",           // JSON array of award types and years earned
      "DeclaredEarly",          // Boolean - did player declare early
      "DeclarationYear",        // Year the early declaration was made
      "RetentionDecision",      // Coach decision: RETAIN, RELEASE, or empty
      "RetentionDecisionDate"   // When retention decision was recorded
    ]);
    sheet.getRange(1, 1, 1, 20).setFontWeight("bold");
  }

  return sheet;
}

/**
 * Generate a unique player copy ID
 */
function generatePlayerCopyId(playerId, conference, ordinal) {
  return `PC-${playerId}-${conference}-${ordinal}`;
}

/**
 * Create player copies for all rookies in all conferences
 * Should be run at start of each season
 */
function createPlayerCopiesForRookies(year) {
  const config = getConfig();
  const sheet = getPlayerCopiesSheet();

  // Get all rookies from RookieLedger
  const rookieSheet = SpreadsheetApp.getActive()
    .getSheetByName(config.sheets.rookieLedger);

  const rookieData = rookieSheet.getDataRange().getValues();
  const rookies = rookieData.slice(1).filter(row => row[3] == year); // Filter by RookieLeagueYear

  // Get all conferences
  const conferences = getConferences();

  // Get existing copies to avoid duplicates
  const existingData = sheet.getDataRange().getValues();
  const existingCopyIds = new Set(
    existingData.slice(1).map(row => row[0])
  );

  const rowsToAdd = [];

  rookies.forEach(rookie => {
    const playerId = String(rookie[0]); // MFL_Player_ID
    const playerName = rookie[1];

    conferences.forEach(conference => {
      // Create 2 copies per conference
      for (let ordinal = 1; ordinal <= config.eligibility.maxCopiesPerConference; ordinal++) {
        const copyId = generatePlayerCopyId(playerId, conference, ordinal);

        if (existingCopyIds.has(copyId)) continue;

        rowsToAdd.push([
          copyId,
          playerId,
          playerName,
          conference,
          "",                    // CurrentFranchiseID (empty until rostered)
          0,                     // EligibilityYearsUsed
          false,                 // TraditionalRedshirtUsed
          false,                 // MedicalRedshirtUsed
          year,                  // CreatedSeason
          true,                  // Active
          new Date(),            // LastUpdated
          "",                    // TraditionalRedshirtYear (empty until used)
          "",                    // MedicalRedshirtYear (empty until used)
          0,                     // NationalAwards count
          0,                     // AllConferenceAwards count
          "[]",                  // AwardHistory (empty JSON array)
          false,                 // DeclaredEarly
          "",                    // DeclarationYear
          "",                    // RetentionDecision
          ""                     // RetentionDecisionDate
        ]);

        existingCopyIds.add(copyId);
      }
    });
  });

  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 20)
      .setValues(rowsToAdd);
  }

  Logger.log(`✅ Created ${rowsToAdd.length} player copies for ${year} rookies`);
  return rowsToAdd.length;
}

/**
 * Update player copy ownership based on current rosters
 */
function updatePlayerCopyOwnership(year) {
  const config = getConfig();
  const sheet = getPlayerCopiesSheet();

  // Get franchise -> conference mapping
  const franchiseMap = getFranchiseConferenceMap();

  // Get current rosters from MFL
  const rosters = fetchRosters(year);

  // Build ownership map: playerId -> conference -> franchiseIds[]
  const ownershipMap = {};

  rosters.forEach(entry => {
    const conference = franchiseMap[entry.franchiseId];
    if (!conference) return;

    if (!ownershipMap[entry.playerId]) {
      ownershipMap[entry.playerId] = {};
    }
    if (!ownershipMap[entry.playerId][conference]) {
      ownershipMap[entry.playerId][conference] = [];
    }

    ownershipMap[entry.playerId][conference].push(entry.franchiseId);
  });

  // Get all player copies
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const copies = data.slice(1);

  const updates = [];

  // Helper to normalize franchise IDs to 3-digit padded format
  const normalizeFranchiseId = (id) => {
    if (!id) return "";
    return String(Number(id) || 0).padStart(3, "0");
  };

  // Track which owners have been assigned to copies for each player/conference
  // This prevents assigning the same owner to multiple copies of the same player
  const assignedOwners = {}; // "playerId-conference" -> Set of assigned franchiseIds

  copies.forEach((row, idx) => {
    const rowNum = idx + 2; // Account for header
    const playerId = String(row[1]);
    const conference = row[3];
    const rawOwner = String(row[4] || "").trim();
    const currentOwner = rawOwner ? normalizeFranchiseId(rawOwner) : "";
    const key = `${playerId}-${conference}`;

    // Initialize tracking set for this player-conference
    if (!assignedOwners[key]) {
      assignedOwners[key] = new Set();
    }

    // Check if this player is on a roster in this conference
    const allOwners = ownershipMap[playerId]?.[conference] || [];

    // If copy already has an owner
    if (currentOwner) {
      // Check if this owner is ALREADY assigned to another copy (duplicate!)
      if (assignedOwners[key].has(currentOwner)) {
        // This is a duplicate - clear it and try to find a different owner
        const availableOwners = allOwners.filter(fId => !assignedOwners[key].has(fId));

        if (availableOwners.length > 0) {
          // Assign to a different available owner
          const newFranchise = availableOwners[0];
          updates.push({
            row: rowNum,
            franchiseId: newFranchise
          });
          assignedOwners[key].add(newFranchise);
          Logger.log(`  Fixed duplicate: ${playerId}-${conference} was ${currentOwner}, now ${newFranchise}`);
        } else {
          // No other owners available, clear this copy
          updates.push({
            row: rowNum,
            franchiseId: ""
          });
          Logger.log(`  Cleared duplicate: ${playerId}-${conference} owner ${currentOwner} (no alternative available)`);
        }
      } else {
        // Not a duplicate - mark as assigned
        assignedOwners[key].add(currentOwner);

        // Check if owner is still valid (player still on their roster)
        if (!allOwners.includes(currentOwner)) {
          // Player was dropped by this owner, clear ownership
          updates.push({
            row: rowNum,
            franchiseId: ""
          });
        }
      }
    } else {
      // No current owner - find an available owner that hasn't been assigned yet
      const availableOwners = allOwners.filter(fId => !assignedOwners[key].has(fId));

      if (availableOwners.length > 0) {
        // Assign to first available owner
        const assignedFranchise = availableOwners[0];
        updates.push({
          row: rowNum,
          franchiseId: assignedFranchise
        });
        // Mark this owner as assigned so it won't be used for another copy
        assignedOwners[key].add(assignedFranchise);
      }
    }
  });

  // Apply updates
  updates.forEach(update => {
    sheet.getRange(update.row, 5).setValue(update.franchiseId); // CurrentFranchiseID
    sheet.getRange(update.row, 11).setValue(new Date());        // LastUpdated
  });

  Logger.log(`✅ Updated ${updates.length} player copy ownerships`);
  return updates.length;
}

/**
 * Sync player copy ownership from TransactionLog
 * Uses the TransactionLog as source of truth for who owns which copy
 *
 * @returns {Number} - Number of copies updated
 */
function syncOwnershipFromTransactionLog() {
  Logger.log("=== Syncing Ownership from TransactionLog ===");

  const pcSheet = getPlayerCopiesSheet();
  const tlSheet = SpreadsheetApp.getActive().getSheetByName("TransactionLog");

  // Step 1: Clear ALL ownership first
  Logger.log("  Step 1: Clearing all existing ownership...");
  const clearedCount = clearPlayerCopyOwnership();
  Logger.log(`  Cleared ${clearedCount} copies`);

  if (!tlSheet) {
    Logger.log("❌ TransactionLog sheet not found");
    return 0;
  }

  // Read TransactionLog
  const tlData = tlSheet.getDataRange().getValues();
  if (tlData.length <= 1) {
    Logger.log("❌ TransactionLog is empty");
    return 0;
  }

  const tlHeaders = tlData[0];
  Logger.log(`  TransactionLog headers: ${tlHeaders.join(", ")}`);

  const tlColMap = {};
  tlHeaders.forEach((h, i) => { tlColMap[h] = i; });

  Logger.log(`  Step 2: Processing TransactionLog...`);
  Logger.log(`  Column indices - Timestamp: ${tlColMap["Timestamp"]}, CopyAssigned: ${tlColMap["CopyAssigned"]}, FranchiseID: ${tlColMap["FranchiseID"]}, Action: ${tlColMap["Action"]}`);

  // Build ownership map from transactions: copyId -> { franchiseId, timestamp }
  // Track timestamp to ensure we use the MOST RECENT transaction
  const ownershipMap = {}; // copyId -> { franchiseId, timestamp }
  let skippedNoCopy = 0;
  let processedCount = 0;

  tlData.slice(1).forEach((row, idx) => {
    const timestamp = row[tlColMap["Timestamp"]];
    const copyId = row[tlColMap["CopyAssigned"]];
    const franchiseId = String(row[tlColMap["FranchiseID"]] || "").trim();
    const action = String(row[tlColMap["Action"]] || "").toUpperCase();

    if (!copyId) {
      skippedNoCopy++;
      return; // Skip transactions without a copy assigned
    }

    // Normalize franchise ID
    const normalizedFranchise = franchiseId ? String(Number(franchiseId) || 0).padStart(3, "0") : "";

    // Parse timestamp for comparison
    const txnTime = timestamp ? new Date(timestamp).getTime() : 0;

    // Check if this is a more recent transaction than what we have
    const existing = ownershipMap[copyId];
    if (existing && existing.timestamp >= txnTime) {
      // We already have a more recent transaction, skip this one
      return;
    }

    // Determine ownership based on action type
    if (action.includes("DROP") || action.includes("RELEASE") || action.includes("WAIVER_RELEASE")) {
      // Player was dropped - clear ownership
      ownershipMap[copyId] = { franchiseId: "", timestamp: txnTime };
      processedCount++;
    } else if (action.includes("ADD") || action.includes("AUCTION") || action.includes("TRADE") ||
               action.includes("CLAIM") || action.includes("PICKUP") || action.includes("PROMOTE") ||
               action.includes("ASSIGNED")) {
      // Player was acquired - set ownership
      ownershipMap[copyId] = { franchiseId: normalizedFranchise, timestamp: txnTime };
      processedCount++;
    }
    // Note: IR/TAXI moves don't change ownership, just status
  });

  Logger.log(`  Processed ${processedCount} transactions, skipped ${skippedNoCopy} without CopyAssigned`);
  Logger.log(`  Found ${Object.keys(ownershipMap).length} unique copies with ownership info`);

  // Step 3: Apply ownership to ACTIVE PlayerCopies only
  Logger.log(`  Step 3: Applying ownership to active copies...`);

  const pcData = pcSheet.getDataRange().getValues();
  if (pcData.length <= 1) {
    Logger.log("❌ PlayerCopies is empty");
    return 0;
  }

  const pcHeaders = pcData[0];
  const copyIdCol = 0;        // PlayerCopyID
  const ownerCol = 4;         // CurrentFranchiseID
  const activeCol = 9;        // Active
  const lastUpdatedCol = 10;  // LastUpdated

  let updateCount = 0;
  let skippedInactive = 0;

  // Update each ACTIVE copy based on TransactionLog ownership
  for (let i = 1; i < pcData.length; i++) {
    const copyId = pcData[i][copyIdCol];
    const isActive = pcData[i][activeCol] === true || pcData[i][activeCol] === "TRUE";
    const currentOwner = String(pcData[i][ownerCol] || "").trim();

    // Skip inactive copies (players who have exhausted eligibility)
    if (!isActive) {
      skippedInactive++;
      continue;
    }

    // Check if we have transaction history for this copy
    if (copyId in ownershipMap) {
      const expectedOwner = ownershipMap[copyId].franchiseId;
      const normalizedCurrent = currentOwner ? String(Number(currentOwner) || 0).padStart(3, "0") : "";

      if (normalizedCurrent !== expectedOwner) {
        // Update ownership
        const rowNum = i + 1; // 1-indexed
        pcSheet.getRange(rowNum, ownerCol + 1).setValue(expectedOwner);
        pcSheet.getRange(rowNum, lastUpdatedCol + 1).setValue(new Date());
        updateCount++;

        if (expectedOwner) {
          Logger.log(`  Updated ${copyId}: ${normalizedCurrent || "(none)"} → ${expectedOwner}`);
        } else {
          Logger.log(`  Cleared ${copyId}: ${normalizedCurrent} → (none)`);
        }
      }
    }
  }

  Logger.log(`  Skipped ${skippedInactive} inactive copies`);
  Logger.log(`✅ Updated ${updateCount} player copy ownerships from TransactionLog`);
  return updateCount;
}

/**
 * Diagnose ownership issues for a specific player
 * Run this to see all transactions and copies for a player
 */
function diagnosePlayerOwnership(playerIdOrName) {
  Logger.log(`=== Diagnosing ownership for: ${playerIdOrName} ===`);

  const tlSheet = SpreadsheetApp.getActive().getSheetByName("TransactionLog");
  const pcSheet = getPlayerCopiesSheet();

  if (!tlSheet) {
    Logger.log("❌ TransactionLog not found");
    return;
  }

  // Read TransactionLog
  const tlData = tlSheet.getDataRange().getValues();
  const tlHeaders = tlData[0];
  const tlColMap = {};
  tlHeaders.forEach((h, i) => { tlColMap[h] = i; });

  // Find transactions for this player
  Logger.log("\n--- TransactionLog entries ---");
  let txnCount = 0;
  tlData.slice(1).forEach((row, idx) => {
    const playerId = String(row[tlColMap["PlayerID"]] || "");
    const playerName = String(row[tlColMap["PlayerName"]] || "");

    if (playerId === String(playerIdOrName) || playerName.toLowerCase().includes(String(playerIdOrName).toLowerCase())) {
      txnCount++;
      Logger.log(`  Row ${idx + 2}: Year=${row[tlColMap["Year"]]}, Action="${row[tlColMap["Action"]]}", Franchise=${row[tlColMap["FranchiseID"]]}, CopyAssigned="${row[tlColMap["CopyAssigned"]]}"`);
    }
  });
  Logger.log(`  Found ${txnCount} transactions`);

  // Read PlayerCopies
  const pcData = pcSheet.getDataRange().getValues();
  const pcHeaders = pcData[0];

  Logger.log("\n--- PlayerCopies entries ---");
  let copyCount = 0;
  pcData.slice(1).forEach((row, idx) => {
    const playerId = String(row[1] || "");
    const playerName = String(row[2] || "");

    if (playerId === String(playerIdOrName) || playerName.toLowerCase().includes(String(playerIdOrName).toLowerCase())) {
      copyCount++;
      Logger.log(`  Row ${idx + 2}: CopyID="${row[0]}", Conference=${row[3]}, CurrentFranchiseID="${row[4]}", Active=${row[9]}`);
    }
  });
  Logger.log(`  Found ${copyCount} copies`);
}

/**
 * Clear ownership (CurrentFranchiseID) for all player copies
 * Used before replaying transactions to ensure clean state
 * OPTIMIZED: Batch update in one operation
 * @returns {Number} - Number of copies cleared
 */
function clearPlayerCopyOwnership() {
  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return 0;
  }

  const headers = data[0];
  const rows = data.slice(1);

  // CurrentFranchiseID is column 5 (index 4)
  const ownerCol = 4;

  let clearedCount = 0;

  // Clear ownership in memory
  rows.forEach(row => {
    if (row[ownerCol] && row[ownerCol] !== "") {
      row[ownerCol] = "";
      clearedCount++;
    }
  });

  // Write back in one operation
  if (clearedCount > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  return clearedCount;
}

/**
 * Increment eligibility years for all active player copies
 * Should be run at start of new league year
 */
function incrementEligibilityYears(fromYear, toYear) {
  const config = getConfig();
  const sheet = getPlayerCopiesSheet();

  const data = sheet.getDataRange().getValues();
  const copies = data.slice(1);

  let incremented = 0;
  let skippedRedshirt = 0;

  copies.forEach((row, idx) => {
    const rowNum = idx + 2;
    const active = row[9];
    const yearsUsed = Number(row[5]) || 0;

    if (!active) return;

    // Skip copies that received a redshirt for fromYear — that year didn't count.
    // Traditional redshirt: col 11 (TraditionalRedshirtYear)
    // Medical redshirt: col 12 (MedicalRedshirtYear)
    const traditionalRedshirtYear = row[11] ? Number(row[11]) : null;
    const medicalRedshirtYear = row[12] ? Number(row[12]) : null;
    const fromYearNum = Number(fromYear);

    if (traditionalRedshirtYear === fromYearNum || medicalRedshirtYear === fromYearNum) {
      skippedRedshirt++;
      Logger.log(`  Skipped ${row[0]} (${row[2]}) — redshirted in ${fromYear}, year does not count`);
      return;
    }

    const newYears = yearsUsed + 1;

    incremented++;

    sheet.getRange(rowNum, 6).setValue(newYears);  // EligibilityYearsUsed
    sheet.getRange(rowNum, 11).setValue(new Date()); // LastUpdated

    // If max eligibility reached, mark inactive
    if (newYears >= config.eligibility.maxYears) {
      sheet.getRange(rowNum, 10).setValue(false); // Active = false
    }
  });

  Logger.log(`✅ Incremented eligibility for ${incremented} player copies (${fromYear} → ${toYear})`);
  if (skippedRedshirt > 0) {
    Logger.log(`  ⚠️  Skipped ${skippedRedshirt} copies that redshirted in ${fromYear}`);
  }
  return incremented;
}
