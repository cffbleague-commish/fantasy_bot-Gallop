/**
 * BACKFILL SCRIPT
 * Populate historical data for past seasons to verify system integrity
 */

/**
 * Backfill all historical data for a range of years
 * This will populate RookieLedger, PlayerCopies, and historical eligibility
 *
 * Example: backfillHistoricalData(2021, 2024)
 */
function backfillHistoricalData(startYear, endYear) {
  Logger.log(`=== BACKFILL: ${startYear} to ${endYear} ===`);

  const years = [];
  for (let year = startYear; year <= endYear; year++) {
    years.push(year);
  }

  Logger.log(`Processing ${years.length} years: ${years.join(', ')}`);

  const currentYear = Number(getLeagueYear());

  // Step 1: Ingest all rookies for each year (creates player copies automatically)
  Logger.log('\n--- STEP 1: Ingesting Rookies & Creating Player Copies ---');
  years.forEach(year => {
    const rookiesAdded = ingestRookiesForYear(String(year));
    Logger.log(`  ${year}: ${rookiesAdded} rookies ingested`);
  });

  // Step 2: Backfill historical ownership from transactions (also calculates redshirts)
  Logger.log('\n--- STEP 2: Backfilling Historical Ownership & Redshirts ---');
  backfillHistoricalOwnership(years);

  // Step 3: Calculate eligibility years (MUST run AFTER redshirts are set)
  // Redshirts extend eligibility, so we need the redshirt data before calculating
  Logger.log('\n--- STEP 3: Calculating Eligibility (accounting for redshirts) ---');
  backfillEligibilityYears(startYear, currentYear);

  // Step 4: Update current ownership
  Logger.log('\n--- STEP 4: Updating Current Ownership ---');
  updatePlayerCopyOwnership(String(currentYear));

  // Step 5: Final verification - recalculate Active status for all copies
  // This ensures Active column is correct after all redshirts have been applied
  Logger.log('\n--- STEP 5: Final Active Status Verification ---');
  recalculateAllActiveStatus();

  Logger.log('\n✅ BACKFILL COMPLETE');
  Logger.log(`Ready to use! Current state reflects ${currentYear} season.`);
}

/**
 * Backfill historical ownership by processing auction/drop transactions
 * This assigns player copies based on transaction history, not current rosters
 * OPTIMIZED: Batches all updates to avoid timeout
 *
 * @param {Array} years - Array of years to process
 * @param {Boolean} logTransactions - Set to true to log all transactions to TransactionLog sheet (slower)
 * @param {Set|null} logOnlyYears - Optional Set of years to log. When provided, only transactions
 *   from these years are logged (requires logTransactions=true). When null, all years are logged.
 */
function backfillHistoricalOwnership(years, logTransactions = false, logOnlyYears = null) {
  // Year-selective logging: when logOnlyYears is provided, only log transactions for those years
  const shouldLogYear = (y) => logTransactions && (!logOnlyYears || logOnlyYears.has(y));

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const copies = data.slice(1);

  // Find column indices
  // Note: Column positions based on what createPlayerCopiesForRookies() writes
  const copyIdCol = 0;           // CopyID (or PlayerCopyID)
  const playerIdCol = 1;         // MFL_Player_ID
  const playerNameCol = 2;       // PlayerName
  const conferenceCol = 3;       // Conference
  const ownerCol = 4;            // CurrentFranchiseID
  const eligibilityYearsCol = 5; // EligibilityYearsUsed
  const traditionalUsedCol = 6;  // TraditionalRedshirtUsed
  const medicalUsedCol = 7;      // MedicalRedshirtUsed
  const createdSeasonCol = 8;    // CreatedSeason (rookie year)
  const activeCol = 9;           // Active
  const traditionalYearCol = 11; // TraditionalRedshirtYear
  const medicalYearCol = 12;     // MedicalRedshirtYear
  const declaredEarlyCol = 16;   // DeclaredEarly

  // Get max eligibility years from config for transfer eligibility calculation
  const config = getConfig();
  const maxEligibilityYears = config.eligibility?.maxYears || 4;

  // Build index: playerId -> conference -> [copy rows with indices]
  // Also build player name cache to avoid repeated sheet reads
  const playerCopyIndex = {};
  const playerNameCache = {}; // playerId -> playerName

  copies.forEach((row, idx) => {
    const playerId = String(row[playerIdCol]);
    const conference = row[conferenceCol];
    const copyId = row[copyIdCol];
    const playerName = row[playerNameCol];

    // Cache player name (only need to store once per player)
    if (!playerNameCache[playerId]) {
      playerNameCache[playerId] = playerName;
    }

    if (!playerCopyIndex[playerId]) {
      playerCopyIndex[playerId] = {};
    }
    if (!playerCopyIndex[playerId][conference]) {
      playerCopyIndex[playerId][conference] = [];
    }

    playerCopyIndex[playerId][conference].push({
      rowIndex: idx,
      rowNum: idx + 2, // +2 for header and 0-indexing
      copyId: copyId,
      currentOwner: row[ownerCol],
      eligibilityYearsUsed: Number(row[eligibilityYearsCol]) || 0,
      createdSeason: Number(row[createdSeasonCol]) || 0, // Rookie year for calculating eligibility at transaction time
      traditionalRedshirtUsed: row[traditionalUsedCol] === true || row[traditionalUsedCol] === "TRUE",
      medicalRedshirtUsed: row[medicalUsedCol] === true || row[medicalUsedCol] === "TRUE",
      traditionalRedshirtYear: row[traditionalYearCol] || "",
      medicalRedshirtYear: row[medicalYearCol] || "",
      declaredEarly: row[declaredEarlyCol] === true || row[declaredEarlyCol] === "TRUE"
    });
  });

  // Collect all ownership updates in memory
  const ownershipUpdates = {}; // rowNum -> franchiseId

  // Track "last owned" copy for each player in each conference
  // When a player is dropped, we remember which copy they were on
  // so the next owner gets the same copy (maintains continuity)
  // Key: playerId-conference -> rowNum of last owned copy
  const lastOwnedCopy = {};

  // Collect all redshirt updates in memory (batch apply at end)
  // Structure: rowNum -> { traditional: bool, medical: bool, traditionalYear: number, medicalYear: number }
  const allRedshirtUpdates = {};

  // Collect transaction logs in memory (batch write at end)
  const transactionLogs = [];

  // Cache conferences array and franchise-to-conference mapping
  const conferences = getConferences();
  const franchiseMap = getFranchiseConferenceMap();

  // Process each year's transactions chronologically
  years.forEach(year => {
    const logThisYear = shouldLogYear(year);
    Logger.log(`  Processing ${year} transactions...${logThisYear ? ' (with logging)' : ''}`);

    const transactions = fetchTransactions(String(year));

    // Sort by timestamp (oldest first)
    transactions.sort((a, b) => {
      const tsA = Number(a.timestamp || 0);
      const tsB = Number(b.timestamp || 0);
      return tsA - tsB;
    });

    // Find the first AUCTION_WON timestamp for this year (to determine transfer eligibility)
    const firstAuctionTimestamp = transactions
      .filter(t => t.type === "AUCTION_WON")
      .map(t => Number(t.timestamp || 0))
      .sort((a, b) => a - b)[0] || Infinity;

    let auctionsProcessed = 0;
    let dropsProcessed = 0;
    let irMovesProcessed = 0;
    let taxiMovesProcessed = 0;

    transactions.forEach(txn => {
      // Convert to number first to strip any leading zeros, then pad to 3 digits
      const franchiseId = String(Number(txn.franchise || 0)).padStart(3, "0");
      const txnData = txn.transaction || "";

      // Handle AUCTION_WON
      // Format: "playerId|conferenceIndex|"
      if (txn.type === "AUCTION_WON") {
        const parts = txnData.split("|");
        const playerId = parts[0];

        if (!playerId) return;

        // CRITICAL: Franchises can only own copies from their own conference
        // Use the franchise's actual conference, NOT the transaction's conferenceIndex
        const franchiseConference = franchiseMap[franchiseId];

        if (!franchiseConference) {
          Logger.log(`  ⚠️  Warning: Franchise ${franchiseId} not found in FranchiseLookup, skipping auction`);
          return;
        }

        // Find available copy for this player in the FRANCHISE'S conference
        const availableCopies = playerCopyIndex[playerId]?.[franchiseConference] || [];

        // Check if this player was recently dropped in this conference
        // If so, prefer to assign the same copy they were on (maintains continuity)
        const lastOwnedKey = `${playerId}-${franchiseConference}`;
        const lastOwnedRowNum = lastOwnedCopy[lastOwnedKey];

        let availableCopy = null;

        // First, try to find the "last owned" copy if it's available
        if (lastOwnedRowNum) {
          const lastCopy = availableCopies.find(copy => copy.rowNum === lastOwnedRowNum);
          if (lastCopy && !lastCopy.declaredEarly) {
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            // Empty string "" means "dropped" but || would fall back to currentOwner
            const lastCopyOwner = lastCopy.rowNum in ownershipUpdates
              ? ownershipUpdates[lastCopy.rowNum]
              : lastCopy.currentOwner;
            if (!lastCopyOwner || lastCopyOwner === "") {
              availableCopy = lastCopy;
            }
          }
        }

        // If no "last owned" copy available, find first unowned copy
        // Skip copies that were declared early — they are no longer assignable
        if (!availableCopy) {
          availableCopy = availableCopies.find(copy => {
            if (copy.declaredEarly) return false;
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            // Empty string "" means "dropped" but || would fall back to currentOwner
            const currentOwner = copy.rowNum in ownershipUpdates
              ? ownershipUpdates[copy.rowNum]
              : copy.currentOwner;
            return !currentOwner || currentOwner === "";
          });
        }

        // If no available copy, take the first one (should be prevented by auction rules)
        const copyToAssign = availableCopy || availableCopies[0];

        // DEBUG: Log copy assignment details for troubleshooting
        if (logThisYear && availableCopies.length > 1) {
          Logger.log(`    DEBUG AUCTION: Player ${playerId}, Franchise ${franchiseId} (${franchiseConference})`);
          Logger.log(`      lastOwnedRowNum: ${lastOwnedRowNum || 'none'}`);
          availableCopies.forEach((copy, i) => {
            const sheetOwner = copy.currentOwner || '(empty)';
            const memoryOwner = ownershipUpdates[copy.rowNum];
            const effectiveOwner = memoryOwner !== undefined ? memoryOwner : sheetOwner;
            Logger.log(`      Copy ${i+1} (row ${copy.rowNum}): sheet="${sheetOwner}", memory="${memoryOwner !== undefined ? memoryOwner : 'not set'}", effective="${effectiveOwner || '(empty)'}"`);
          });
          Logger.log(`      Assigning: ${copyToAssign?.copyId || 'none'}`);
        }

        if (copyToAssign) {
          ownershipUpdates[copyToAssign.rowNum] = franchiseId;
          auctionsProcessed++;

          // Optional: Batch transaction logs in memory
          if (logThisYear) {
            const playerName = copies[copyToAssign.rowIndex][playerNameCol];
            // MFL transaction format: "playerId|bidAmount|" (e.g., "17157|11|")
            // parts[0] = playerId, parts[1] = bidAmount
            const bidAmount = parts[1] || "";
            transactionLogs.push({
              year: year,
              txn: txn,
              action: "Assigned",
              playerId: playerId,
              playerName: playerName,
              copyAssigned: copyToAssign.copyId,
              franchiseId: franchiseId,
              franchiseConference: franchiseConference,
              bidAmount: bidAmount
            });
          }
        } else if (logThisYear) {
          // Player not in index - need to get name differently
          const playerName = playerNameCache[playerId] || "";
          // MFL transaction format: "playerId|bidAmount|" (e.g., "17157|11|")
          const bidAmount = parts[1] || "";
          transactionLogs.push({
            year: year,
            txn: txn,
            action: "No copy available",
            playerId: playerId,
            playerName: playerName,
            copyAssigned: "",
            franchiseId: franchiseId,
            franchiseConference: franchiseMap[franchiseId] || "UNKNOWN",
            bidAmount: bidAmount
          });
        }
      }

      // Handle FREE_AGENT (drops)
      // Format: "|playerId," or "|playerId1,playerId2,"
      if (txn.type === "FREE_AGENT") {
        // Extract player IDs (format: "|15329," or "|15329,15330,")
        const playerIds = txnData
          .replace(/^\|/, "")  // Remove leading pipe
          .replace(/,\s*$/, "") // Remove trailing comma
          .split(",")
          .filter(id => id.trim());

        playerIds.forEach(playerId => {
          playerId = playerId.trim();
          if (!playerId) return;

          // Find all copies of this player across all conferences
          const playerConferences = playerCopyIndex[playerId] || {};

          // Clear ownership for any copy owned by this franchise
          let dropped = false;
          Object.entries(playerConferences).forEach(([conference, copiesInConf]) => {
            copiesInConf.forEach(copy => {
              // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
              const currentOwner = copy.rowNum in ownershipUpdates
                ? ownershipUpdates[copy.rowNum]
                : copy.currentOwner;
              if (currentOwner === franchiseId) {
                ownershipUpdates[copy.rowNum] = ""; // Clear ownership
                dropsProcessed++;
                dropped = true;

                // Track this as the "last owned" copy for this player in this conference
                // So the next owner gets the same copy (maintains continuity)
                const lastOwnedKey = `${playerId}-${conference}`;
                lastOwnedCopy[lastOwnedKey] = copy.rowNum;

                // Optional: Batch transaction logs in memory
                if (logThisYear) {
                  const playerName = copies[copy.rowIndex][playerNameCol];

                  // Calculate transfer eligibility:
                  // 1. Drop must occur BEFORE the first auction of the year
                  // 2. Player copy must have remaining eligibility years AT THE TIME OF THE DROP
                  //    (not the current sheet value which reflects later years)
                  const dropTimestamp = Number(txn.timestamp || 0);
                  const isBeforeFirstAuction = dropTimestamp < firstAuctionTimestamp;

                  // Calculate eligibility years used AT THE TIME of this transaction
                  // yearsPassed = current backfill year - rookie year
                  // e.g., for 2021 rookie in 2022 drop: 2022 - 2021 = 1 year used
                  // IMPORTANT: Subtract any redshirts that extend eligibility
                  const yearsPassedSinceRookie = copy.createdSeason > 0 ? (year - copy.createdSeason) : maxEligibilityYears;

                  // Count redshirts from TWO sources:
                  // 1. Sheet data (redshirts that existed before this backfill started)
                  // 2. allRedshirtUpdates (redshirts calculated during this backfill run)
                  // We need to check the YEAR of each redshirt to see if it was applied BEFORE this drop
                  const backfillRedshirts = allRedshirtUpdates[copy.rowNum] || { traditional: false, medical: false, traditionalYear: null, medicalYear: null };

                  // Count traditional redshirts earned before this year
                  let traditionalRedshirtCount = 0;
                  if (copy.traditionalRedshirtUsed && copy.traditionalRedshirtYear && Number(copy.traditionalRedshirtYear) < year) {
                    traditionalRedshirtCount = 1; // From sheet, earned before this year
                  } else if (backfillRedshirts.traditional && backfillRedshirts.traditionalYear && backfillRedshirts.traditionalYear < year) {
                    traditionalRedshirtCount = 1; // From this backfill, earned before this year
                  }

                  // Count medical redshirts earned before this year
                  let medicalRedshirtCount = 0;
                  if (copy.medicalRedshirtUsed && copy.medicalRedshirtYear && Number(copy.medicalRedshirtYear) < year) {
                    medicalRedshirtCount = 1; // From sheet, earned before this year
                  } else if (backfillRedshirts.medical && backfillRedshirts.medicalYear && backfillRedshirts.medicalYear < year) {
                    medicalRedshirtCount = 1; // From this backfill, earned before this year
                  }

                  const redshirtYearsEarned = traditionalRedshirtCount + medicalRedshirtCount;

                  // Effective eligibility used = years passed - redshirt years earned
                  // e.g., 2018 rookie with medical redshirt in 2021: drop in 2022
                  //       yearsPassed = 2022-2018 = 4, redshirts = 1, eligUsed = 3 (still has 1 year left)
                  const eligibilityAtDropTime = Math.max(0, yearsPassedSinceRookie - redshirtYearsEarned);
                  const hasRemainingEligibility = eligibilityAtDropTime < maxEligibilityYears;
                  const transferEligible = isBeforeFirstAuction && hasRemainingEligibility && !copy.declaredEarly ? "Yes" : "";

                  // DEBUG: Log transfer eligibility calculation for troubleshooting
                  // Always log for drops to help diagnose issues
                  Logger.log(`    DROP: ${playerName} (${playerId}) - rookieYear=${copy.createdSeason}, yearsPassed=${yearsPassedSinceRookie}, redshirts=${redshirtYearsEarned}, eligAtDrop=${eligibilityAtDropTime}/${maxEligibilityYears}, beforeAuction=${isBeforeFirstAuction} (dropTS=${dropTimestamp}, auctionTS=${firstAuctionTimestamp}), declaredEarly=${copy.declaredEarly}, transferEligible=${transferEligible || 'No'}`)

                  transactionLogs.push({
                    year: year,
                    txn: txn,
                    action: "Dropped",
                    playerId: playerId,
                    playerName: playerName,
                    copyAssigned: copy.copyId,
                    franchiseId: franchiseId,
                    franchiseConference: franchiseMap[franchiseId] || "UNKNOWN",
                    transferEligible: transferEligible
                  });
                }
              }
            });
          });

          if (logThisYear && !dropped) {
            const playerName = playerNameCache[playerId] || "";
            transactionLogs.push({
              year: year,
              txn: txn,
              action: "Drop - not owned",
              playerId: playerId,
              playerName: playerName,
              copyAssigned: "",
              franchiseId: franchiseId,
              franchiseConference: franchiseMap[franchiseId] || "UNKNOWN"
            });
          }
        });
      }

      // Handle IR transactions (Medical Redshirt tracking)
      // Format: { activated: "playerId,", deactivated: "playerId," }
      if (txn.type === "IR" && logThisYear) {
        const franchiseConference = franchiseMap[franchiseId] || "UNKNOWN";

        // Players moved TO IR (deactivated) = Medical Redshirt used
        const deactivated = (txn.deactivated || "")
          .replace(/,\s*$/, "")
          .split(",")
          .filter(id => id.trim());

        deactivated.forEach(playerId => {
          playerId = playerId.trim();
          if (!playerId) return;

          const playerName = playerNameCache[playerId] || "";

          // Find the copy owned by this franchise in their conference
          let copyAssigned = "";
          const playerConferences = playerCopyIndex[playerId] || {};
          const copiesInConf = playerConferences[franchiseConference] || [];
          const ownedCopy = copiesInConf.find(copy => {
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            const currentOwner = copy.rowNum in ownershipUpdates
              ? ownershipUpdates[copy.rowNum]
              : copy.currentOwner;
            return currentOwner === franchiseId;
          });
          if (ownedCopy) {
            copyAssigned = ownedCopy.copyId;
          }

          transactionLogs.push({
            year: year,
            txn: txn,
            action: "IR - Deactivated (Medical Redshirt)",
            playerId: playerId,
            playerName: playerName,
            copyAssigned: copyAssigned,
            franchiseId: franchiseId,
            franchiseConference: franchiseConference
          });
          irMovesProcessed++;
        });

        // Players moved OFF IR (activated) = Returned from Medical Redshirt
        const activated = (txn.activated || "")
          .replace(/,\s*$/, "")
          .split(",")
          .filter(id => id.trim());

        activated.forEach(playerId => {
          playerId = playerId.trim();
          if (!playerId) return;

          const playerName = playerNameCache[playerId] || "";

          // Find the copy owned by this franchise in their conference
          let copyAssigned = "";
          const playerConferences = playerCopyIndex[playerId] || {};
          const copiesInConf = playerConferences[franchiseConference] || [];
          const ownedCopy = copiesInConf.find(copy => {
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            const currentOwner = copy.rowNum in ownershipUpdates
              ? ownershipUpdates[copy.rowNum]
              : copy.currentOwner;
            return currentOwner === franchiseId;
          });
          if (ownedCopy) {
            copyAssigned = ownedCopy.copyId;
          }

          transactionLogs.push({
            year: year,
            txn: txn,
            action: "IR - Activated (Off Medical Redshirt)",
            playerId: playerId,
            playerName: playerName,
            copyAssigned: copyAssigned,
            franchiseId: franchiseId,
            franchiseConference: franchiseConference
          });
          irMovesProcessed++;
        });
      }

      // Handle TAXI transactions (Traditional Redshirt tracking)
      // Format: { promoted: "playerId,", demoted: "playerId," }
      if (txn.type === "TAXI" && logThisYear) {
        const franchiseConference = franchiseMap[franchiseId] || "UNKNOWN";

        // Players moved TO Taxi (demoted) = Traditional Redshirt used
        const demoted = (txn.demoted || "")
          .replace(/,\s*$/, "")
          .split(",")
          .filter(id => id.trim());

        demoted.forEach(playerId => {
          playerId = playerId.trim();
          if (!playerId) return;

          const playerName = playerNameCache[playerId] || "";

          // Find the copy owned by this franchise in their conference
          let copyAssigned = "";
          const playerConferences = playerCopyIndex[playerId] || {};
          const copiesInConf = playerConferences[franchiseConference] || [];
          const ownedCopy = copiesInConf.find(copy => {
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            const currentOwner = copy.rowNum in ownershipUpdates
              ? ownershipUpdates[copy.rowNum]
              : copy.currentOwner;
            return currentOwner === franchiseId;
          });
          if (ownedCopy) {
            copyAssigned = ownedCopy.copyId;
          }

          transactionLogs.push({
            year: year,
            txn: txn,
            action: "TAXI - Demoted (Traditional Redshirt)",
            playerId: playerId,
            playerName: playerName,
            copyAssigned: copyAssigned,
            franchiseId: franchiseId,
            franchiseConference: franchiseConference
          });
          taxiMovesProcessed++;
        });

        // Players moved OFF Taxi (promoted) = Returned from Traditional Redshirt
        const promoted = (txn.promoted || "")
          .replace(/,\s*$/, "")
          .split(",")
          .filter(id => id.trim());

        promoted.forEach(playerId => {
          playerId = playerId.trim();
          if (!playerId) return;

          const playerName = playerNameCache[playerId] || "";

          // Find the copy owned by this franchise in their conference
          let copyAssigned = "";
          const playerConferences = playerCopyIndex[playerId] || {};
          const copiesInConf = playerConferences[franchiseConference] || [];
          const ownedCopy = copiesInConf.find(copy => {
            // IMPORTANT: Check if key EXISTS in ownershipUpdates, not just if value is truthy
            const currentOwner = copy.rowNum in ownershipUpdates
              ? ownershipUpdates[copy.rowNum]
              : copy.currentOwner;
            return currentOwner === franchiseId;
          });
          if (ownedCopy) {
            copyAssigned = ownedCopy.copyId;
          }

          transactionLogs.push({
            year: year,
            txn: txn,
            action: "TAXI - Promoted (Off Traditional Redshirt)",
            playerId: playerId,
            playerName: playerName,
            copyAssigned: copyAssigned,
            franchiseId: franchiseId,
            franchiseConference: franchiseConference
          });
          taxiMovesProcessed++;
        });
      }
    });

    Logger.log(`    ${year}: ${auctionsProcessed} auctions, ${dropsProcessed} drops, ${irMovesProcessed} IR moves, ${taxiMovesProcessed} taxi moves`);

    // Calculate redshirts for this year based on current ownership state
    // (after all transactions for this year have been processed)
    // Pass allRedshirtUpdates so we can check if medical was already applied in a prior year
    const yearRedshirts = calculateRedshirtsForYear(year, ownershipUpdates, playerCopyIndex, franchiseMap, allRedshirtUpdates);
    const redshirtCount = Object.keys(yearRedshirts).length;
    if (redshirtCount > 0) {
      // Merge into allRedshirtUpdates (keeping earliest year for each type)
      Object.entries(yearRedshirts).forEach(([rowNum, updates]) => {
        if (!allRedshirtUpdates[rowNum]) {
          allRedshirtUpdates[rowNum] = { traditional: false, medical: false, traditionalYear: null, medicalYear: null };
        }
        // Traditional: only set if not already set (first year wins)
        if (updates.traditional && !allRedshirtUpdates[rowNum].traditional) {
          allRedshirtUpdates[rowNum].traditional = true;
          allRedshirtUpdates[rowNum].traditionalYear = year;
        }
        // Medical: only set if not already set (one-time use, first year wins)
        if (updates.medical && !allRedshirtUpdates[rowNum].medical) {
          allRedshirtUpdates[rowNum].medical = true;
          allRedshirtUpdates[rowNum].medicalYear = year;
        }
      });
      Logger.log(`    ${year}: ${redshirtCount} redshirts calculated`);
    }
  });

  // Apply all updates in a single batch operation
  Logger.log(`  Applying ${Object.keys(ownershipUpdates).length} ownership updates...`);

  // Read current sheet data ONCE for all updates
  const fullData = sheet.getDataRange().getValues();

  if (Object.keys(ownershipUpdates).length > 0) {
    // CRITICAL: Set CurrentFranchiseID column to text format BEFORE writing
    // This prevents Google Sheets from converting "0001" to number 1
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ownerColumnRange = sheet.getRange(2, ownerCol + 1, lastRow - 1, 1);
      ownerColumnRange.setNumberFormat("@"); // @ = plain text format
    }

    // Apply ownership updates to in-memory array
    Object.entries(ownershipUpdates).forEach(([rowNum, franchiseId]) => {
      const arrayIndex = Number(rowNum) - 1; // Convert to 0-based index
      fullData[arrayIndex][ownerCol] = franchiseId;
    });
  }

  // Apply redshirt updates to in-memory array
  if (Object.keys(allRedshirtUpdates).length > 0) {
    const redshirtCount = applyRedshirtUpdates(fullData, allRedshirtUpdates);
    Logger.log(`  Applied ${redshirtCount} redshirt updates`);
  }

  // Write entire updated array back to sheet in one operation
  if (Object.keys(ownershipUpdates).length > 0 || Object.keys(allRedshirtUpdates).length > 0) {
    sheet.getRange(1, 1, fullData.length, fullData[0].length).setValues(fullData);
  }

  // Write all transaction logs in a single batch operation
  if (logTransactions && transactionLogs.length > 0) {
    Logger.log(`  Writing ${transactionLogs.length} transaction logs...`);
    batchWriteTransactionLogs(transactionLogs);
  }

  Logger.log(`  ✅ Historical ownership backfill complete`);
}

/**
 * Calculate and set correct eligibility years for historical player copies
 * Based on when they were created (rookie year) vs current year
 * IMPORTANT: Accounts for redshirts which extend eligibility
 * IMPORTANT: Recalculates ALL copies (even inactive ones) to handle redshirt corrections
 * OPTIMIZED: Batch updates to avoid timeout
 */
function backfillEligibilityYears(firstRookieYear, currentYear) {
  const config = getConfig();
  const sheet = getPlayerCopiesSheet();

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const copies = data.slice(1);

  // Column indices
  const eligibilityYearsCol = 5;   // EligibilityYearsUsed
  const traditionalUsedCol = 6;    // TraditionalRedshirtUsed
  const medicalUsedCol = 7;        // MedicalRedshirtUsed
  const createdSeasonCol = 8;      // CreatedSeason
  const activeCol = 9;             // Active
  const declaredEarlyCol = 16;     // DeclaredEarly

  let updated = 0;
  let reactivated = 0;

  // Update data in memory
  // IMPORTANT: Process ALL copies, not just active ones
  // A copy might have been incorrectly marked inactive before redshirts were applied
  copies.forEach((row, idx) => {
    const createdSeason = Number(row[createdSeasonCol]);

    // Skip if no created season (malformed data)
    if (!createdSeason) return;

    // Calculate how many years have passed since rookie year
    const yearsPassed = currentYear - createdSeason;

    // Count redshirts earned (each extends eligibility by 1 year)
    const hasTraditionalRedshirt = row[traditionalUsedCol] === true || row[traditionalUsedCol] === "TRUE";
    const hasMedicalRedshirt = row[medicalUsedCol] === true || row[medicalUsedCol] === "TRUE";
    const redshirtYears = (hasTraditionalRedshirt ? 1 : 0) + (hasMedicalRedshirt ? 1 : 0);

    // Effective years used = years passed - redshirt years
    // e.g., 2021 rookie with 1 redshirt in 2024: 3 years passed - 1 redshirt = 2 effective years
    const effectiveYearsUsed = Math.max(0, yearsPassed - redshirtYears);

    // Cap at max eligibility
    const yearsUsed = Math.min(effectiveYearsUsed, config.eligibility.maxYears);

    // Update in-memory array
    row[eligibilityYearsCol] = yearsUsed;

    // Determine active status based on eligibility (accounting for redshirts)
    // Declared-early copies must stay inactive regardless of remaining eligibility
    const wasActive = row[activeCol] === true || row[activeCol] === "TRUE";
    const declaredEarly = row[declaredEarlyCol] === true || row[declaredEarlyCol] === "TRUE";
    const shouldBeActive = !declaredEarly && yearsUsed < config.eligibility.maxYears;

    row[activeCol] = shouldBeActive;

    // Track reactivations for logging
    if (!wasActive && shouldBeActive) {
      reactivated++;
    }

    updated++;
  });

  // Write all updates at once
  if (updated > 0) {
    sheet.getRange(2, 1, copies.length, copies[0].length).setValues(copies);
  }

  Logger.log(`  Updated eligibility for ${updated} player copies`);
  if (reactivated > 0) {
    Logger.log(`  Reactivated ${reactivated} copies that have remaining eligibility after redshirts`);
  }
  return updated;
}

/**
 * Standalone function to recalculate Active status for ALL player copies
 * Run this after backfill to verify and correct the Active column
 *
 * This function:
 * 1. Reads all player copies from the sheet
 * 2. For each copy, calculates effective eligibility considering redshirts
 * 3. Sets Active = TRUE if eligibility remains, FALSE otherwise
 * 4. Logs detailed info for debugging
 *
 * Can be run independently at any time to fix Active status discrepancies
 */
function recalculateAllActiveStatus() {
  Logger.log("=== RECALCULATING ACTIVE STATUS FOR ALL PLAYER COPIES ===\n");

  const config = getConfig();
  const currentYear = Number(getLeagueYear());
  const maxYears = config.eligibility.maxYears;

  Logger.log(`Current Year: ${currentYear}`);
  Logger.log(`Max Eligibility Years: ${maxYears}\n`);

  const sheet = getPlayerCopiesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const copies = data.slice(1);

  Logger.log(`Total player copies to process: ${copies.length}`);

  // Column indices (0-based)
  const playerCopyIdCol = 0;
  const playerIdCol = 1;
  const playerNameCol = 2;
  const conferenceCol = 3;
  const ownerCol = 4;            // CurrentFranchiseID
  const eligibilityYearsCol = 5;
  const traditionalUsedCol = 6;
  const medicalUsedCol = 7;
  const createdSeasonCol = 8;
  const activeCol = 9;
  const traditionalYearCol = 11;
  const medicalYearCol = 12;
  const declaredEarlyCol = 16;   // DeclaredEarly

  let totalProcessed = 0;
  let changedToActive = 0;
  let changedToInactive = 0;
  let ownershipCleared = 0;
  let alreadyCorrect = 0;
  const changedCopies = []; // For detailed logging

  copies.forEach((row, idx) => {
    const copyId = row[playerCopyIdCol];
    const playerName = row[playerNameCol];
    const conference = row[conferenceCol];
    const createdSeason = Number(row[createdSeasonCol]);

    // Skip if no created season
    if (!createdSeason) {
      Logger.log(`  Skipping ${copyId}: No CreatedSeason`);
      return;
    }

    // Get redshirt status - handle both boolean and string values
    const hasTraditional = row[traditionalUsedCol] === true ||
                           row[traditionalUsedCol] === "TRUE" ||
                           row[traditionalUsedCol] === "true";
    const hasMedical = row[medicalUsedCol] === true ||
                       row[medicalUsedCol] === "TRUE" ||
                       row[medicalUsedCol] === "true";

    // Count total redshirt years
    const redshirtYears = (hasTraditional ? 1 : 0) + (hasMedical ? 1 : 0);

    // Calculate years passed since rookie year
    const yearsPassed = currentYear - createdSeason;

    // Effective eligibility years used = years passed - redshirt years
    const effectiveYearsUsed = Math.max(0, yearsPassed - redshirtYears);

    // Should be active if effective years used < max years
    // Declared-early copies must stay inactive regardless of remaining eligibility
    const declaredEarly = row[declaredEarlyCol] === true ||
                           row[declaredEarlyCol] === "TRUE" ||
                           row[declaredEarlyCol] === "true";
    const shouldBeActive = !declaredEarly && effectiveYearsUsed < maxYears;

    // Current active status - handle both boolean and string values
    const currentlyActive = row[activeCol] === true ||
                            row[activeCol] === "TRUE" ||
                            row[activeCol] === "true";

    // Check if we need to change active status
    if (currentlyActive !== shouldBeActive) {
      changedCopies.push({
        copyId: copyId,
        playerName: playerName,
        conference: conference,
        createdSeason: createdSeason,
        yearsPassed: yearsPassed,
        redshirtYears: redshirtYears,
        effectiveYearsUsed: effectiveYearsUsed,
        wasActive: currentlyActive,
        nowActive: shouldBeActive
      });

      if (shouldBeActive) {
        changedToActive++;
      } else {
        changedToInactive++;
      }

      // Update in-memory array with actual boolean
      row[activeCol] = shouldBeActive;
    } else {
      alreadyCorrect++;
    }

    // Clear ownership for inactive copies (graduated players shouldn't have owners)
    if (!shouldBeActive && row[ownerCol] && row[ownerCol] !== "") {
      row[ownerCol] = "";
      ownershipCleared++;
    }

    // Always update eligibility years used to ensure consistency
    row[eligibilityYearsCol] = Math.min(effectiveYearsUsed, maxYears);

    totalProcessed++;
  });

  // Log changes
  Logger.log(`\n--- RESULTS ---`);
  Logger.log(`Total processed: ${totalProcessed}`);
  Logger.log(`Already correct: ${alreadyCorrect}`);
  Logger.log(`Changed to ACTIVE: ${changedToActive}`);
  Logger.log(`Changed to INACTIVE: ${changedToInactive}`);
  Logger.log(`Ownership cleared (inactive copies): ${ownershipCleared}`);

  if (changedCopies.length > 0) {
    Logger.log(`\n--- DETAILED CHANGES ---`);
    changedCopies.forEach(change => {
      const direction = change.nowActive ? "INACTIVE → ACTIVE" : "ACTIVE → INACTIVE";
      Logger.log(`  ${change.copyId} (${change.playerName} - ${change.conference})`);
      Logger.log(`    Created: ${change.createdSeason}, Years Passed: ${change.yearsPassed}, Redshirts: ${change.redshirtYears}`);
      Logger.log(`    Effective Years Used: ${change.effectiveYearsUsed}/${maxYears}`);
      Logger.log(`    Status: ${direction}`);
    });
  }

  // Write all updates back to sheet
  if (totalProcessed > 0) {
    sheet.getRange(2, 1, copies.length, copies[0].length).setValues(copies);
    Logger.log(`\n✅ Sheet updated successfully`);
  }

  Logger.log(`\n=== RECALCULATION COMPLETE ===`);

  return {
    processed: totalProcessed,
    changedToActive: changedToActive,
    changedToInactive: changedToInactive,
    ownershipCleared: ownershipCleared,
    alreadyCorrect: alreadyCorrect
  };
}

/**
 * Backfill rookies ONLY (without creating copies)
 * Useful if you want to import rookies first, then manually review
 */
function backfillRookiesOnly(startYear, endYear) {
  Logger.log(`=== Backfilling Rookies: ${startYear} to ${endYear} ===`);

  for (let year = startYear; year <= endYear; year++) {
    const added = ingestRookiesForYear(String(year));
    Logger.log(`${year}: ${added} rookies added`);
  }

  Logger.log('✅ Rookie backfill complete');
}

// Note: verifyBackfillIntegrity() moved to Maintenance.gs

/**
 * Interactive backfill helper
 * Prompts for year range and runs backfill
 */
function interactiveBackfill() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Backfill Historical Data',
    'Enter year range (e.g., "2021,2024" for 2021 to 2024):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText();
  const years = input.split(',').map(y => Number(y.trim()));

  if (years.length !== 2 || isNaN(years[0]) || isNaN(years[1])) {
    ui.alert('Invalid input. Use format: 2021,2024');
    return;
  }

  const confirm = ui.alert(
    'Confirm Backfill',
    `This will backfill data for ${years[0]} to ${years[1]}.\n\nContinue?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.ButtonSet.YES) {
    return;
  }

  backfillHistoricalData(years[0], years[1]);

  ui.alert('Backfill Complete', 'Historical data has been populated. Check the Logs for details.', ui.ButtonSet.OK);
}

/**
 * Clean slate: Remove all player copies and rookies
 * USE WITH CAUTION - This deletes data!
 */
function resetAllData() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    '⚠️ WARNING',
    'This will DELETE all data from RookieLedger and PlayerCopies.\n\nAre you SURE?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    Logger.log('Reset cancelled');
    return;
  }

  const config = getConfig();
  const ss = SpreadsheetApp.getActive();

  // Clear RookieLedger (keep headers)
  const rookieSheet = ss.getSheetByName(config.sheets.rookieLedger);
  if (rookieSheet && rookieSheet.getLastRow() > 1) {
    rookieSheet.getRange(2, 1, rookieSheet.getLastRow() - 1, rookieSheet.getLastColumn()).clearContent();
    Logger.log('✅ RookieLedger cleared');
  }

  // Clear PlayerCopies (keep headers)
  const copiesSheet = ss.getSheetByName(config.sheets.playerCopies);
  if (copiesSheet && copiesSheet.getLastRow() > 1) {
    copiesSheet.getRange(2, 1, copiesSheet.getLastRow() - 1, copiesSheet.getLastColumn()).clearContent();
    Logger.log('✅ PlayerCopies cleared');
  }

  ui.alert('Reset Complete', 'All data has been cleared. You can now run backfill.', ui.ButtonSet.OK);
}

// Note: recreatePlayerCopiesSheet(), recreateRookieLedger(), and recreateBothSheets() moved to Maintenance.gs

/**
 * Example: Backfill specific scenarios
 */
function exampleBackfills() {
  // Scenario 1: Brand new league starting in 2021
  // backfillHistoricalData(2021, 2024);

  // Scenario 2: Just import rookies, manually create copies later
  // backfillRookiesOnly(2021, 2024);

  // Scenario 3: Verify data after manual edits
  // verifyBackfillIntegrity();
}

/**
 * Quick Test: Run backfill for 2021-2024
 * No prompts, just runs directly
 */
function quickBackfill2021to2024() {
  Logger.log("Starting quick backfill for 2021-2024...");
  backfillHistoricalData(2021, 2024);
  Logger.log("Done! Check your sheets.");
}

/**
 * Incremental Backfill: Process one year at a time to avoid timeout
 * Call this function multiple times, once per year
 *
 * Example usage:
 *   incrementalBackfill(2021)  // Run first
 *   incrementalBackfill(2022)  // Run second
 *   incrementalBackfill(2023)  // Run third
 *   incrementalBackfill(2024)  // Run last
 *
 * Note: For 2021, this will also ingest rookies from 2018-2020 to ensure
 * players acquired in 2021 who were drafted earlier have copies available.
 */
function incrementalBackfill(year, logTransactions = false) {
  Logger.log(`=== INCREMENTAL BACKFILL: ${year} ===`);

  const currentYear = Number(getLeagueYear());
  const priorYearsToIngest = 3; // How many years before the first year to ingest

  // Step 1: Ingest rookies
  Logger.log('\n--- Step 1: Ingesting Rookies ---');

  // For 2021 (first year), also ingest prior years so players drafted before 2021 have copies
  if (year === 2021) {
    Logger.log('  (First year - also ingesting prior years for existing players)');
    for (let priorYear = year - priorYearsToIngest; priorYear < year; priorYear++) {
      const priorRookies = ingestRookiesForYear(String(priorYear));
      Logger.log(`  ${priorYear}: ${priorRookies} rookies ingested`);
    }
  }

  // Ingest current year's rookies
  const rookiesAdded = ingestRookiesForYear(String(year));
  Logger.log(`  ${year}: ${rookiesAdded} rookies ingested`);

  // Step 2: Process ownership for this year (also calculates redshirts)
  Logger.log('\n--- Step 2: Backfilling Ownership & Redshirts for ' + year + ' ---');
  backfillHistoricalOwnership([year], logTransactions);

  // Step 3: Update eligibility for all player copies (MUST run AFTER redshirts are set)
  // Redshirts extend eligibility, so we need the redshirt data before calculating
  Logger.log('\n--- Step 3: Calculating Eligibility (accounting for redshirts) ---');
  const firstYear = year === 2021 ? year - priorYearsToIngest : 2021;
  backfillEligibilityYears(firstYear, currentYear);

  Logger.log(`\n✅ ${year} COMPLETE`);
  Logger.log(`Run incrementalBackfill(${Number(year) + 1}) to continue, or updatePlayerCopyOwnership("${currentYear}") to finalize.`);
}

/**
 * Run all incremental backfills sequentially
 * Breaks into separate executions to avoid timeout
 * WARNING: This still might timeout. Better to run incrementalBackfill() manually for each year.
 */
function runAllIncrementalBackfills() {
  const years = [2021, 2022, 2023, 2024];

  years.forEach(year => {
    Logger.log(`\n${"=".repeat(60)}`);
    incrementalBackfill(year);
  });

  // Final step: Update current ownership
  Logger.log(`\n${"=".repeat(60)}`);
  Logger.log('\n--- FINAL STEP: Updating Current Ownership ---');
  updatePlayerCopyOwnership(String(getLeagueYear()));

  // Verification step: Recalculate Active status for all copies
  Logger.log(`\n${"=".repeat(60)}`);
  Logger.log('\n--- VERIFICATION: Recalculating Active Status ---');
  recalculateAllActiveStatus();

  Logger.log('\n✅ ALL BACKFILLS COMPLETE');
}

/**
 * Quick wrappers for each year - run these individually from Apps Script editor
 */
function backfill2021() { incrementalBackfill(2021); }
function backfill2022() { incrementalBackfill(2022); }
function backfill2023() { incrementalBackfill(2023); }
function backfill2024() { incrementalBackfill(2024); }

/**
 * Final step after all incremental backfills
 */
function finalizeBackfill() {
  Logger.log('--- Finalizing: Updating Current Ownership ---');
  updatePlayerCopyOwnership(String(getLeagueYear()));
  Logger.log('✅ BACKFILL FINALIZED');
}

/**
 * Incremental backfill WITH AWARDS
 * Same as incrementalBackfill() but also calculates and syncs awards for the year.
 *
 * IMPORTANT: This calculates awards AFTER ownership is established for the year,
 * so awards are correctly assigned to the copy owned by each franchise.
 *
 * For historical backfill where awards need to go to the correct copy:
 * 1. Process rookies for the year
 * 2. Process ownership transactions for the year
 * 3. Calculate eligibility
 * 4. Calculate awards (uses current ownership from step 2)
 * 5. Sync awards to PlayerCopies
 *
 * @param {Number} year - The year to process
 * @param {Boolean} logTransactions - Whether to log transactions (default false)
 */
function incrementalBackfillWithAwards(year, logTransactions = false) {
  Logger.log(`=== INCREMENTAL BACKFILL WITH AWARDS: ${year} ===`);

  const config = getConfig();
  const currentYear = Number(getLeagueYear());
  const priorYearsToIngest = 3;
  const regularSeasonWeeks = config.awards.getRegularSeasonWeeks(year);

  // Step 1: Ingest rookies
  Logger.log('\n--- Step 1: Ingesting Rookies ---');

  if (year === 2021) {
    Logger.log('  (First year - also ingesting prior years for existing players)');
    for (let priorYear = year - priorYearsToIngest; priorYear < year; priorYear++) {
      const priorRookies = ingestRookiesForYear(String(priorYear));
      Logger.log(`  ${priorYear}: ${priorRookies} rookies ingested`);
    }
  }

  const rookiesAdded = ingestRookiesForYear(String(year));
  Logger.log(`  ${year}: ${rookiesAdded} rookies ingested`);

  // Step 2: Process ownership for this year
  Logger.log('\n--- Step 2: Backfilling Ownership & Redshirts for ' + year + ' ---');
  backfillHistoricalOwnership([year], logTransactions);

  // Step 3: Update eligibility
  Logger.log('\n--- Step 3: Calculating Eligibility ---');
  const firstYear = year === 2021 ? year - priorYearsToIngest : 2021;
  backfillEligibilityYears(firstYear, currentYear);

  // Step 4: Calculate awards for this year
  // At this point, PlayerCopies has the correct ownership for this year
  Logger.log('\n--- Step 4: Calculating Awards for ' + year + ' ---');
  Logger.log(`  Using ${regularSeasonWeeks} regular season weeks for ${year}`);

  try {
    const rankings = calculateAwards(year, regularSeasonWeeks);
    Logger.log(`  Heisman: ${rankings.heisman[0]?.playerName || 'N/A'}`);
    Logger.log(`  All-Conference: ${rankings.allConference.length} selections`);
  } catch (error) {
    Logger.log(`  ⚠️ Error calculating awards: ${error.message}`);
  }

  // Step 5: Sync awards to PlayerCopies
  Logger.log('\n--- Step 5: Syncing Awards to PlayerCopies ---');
  try {
    syncAwardsToPlayerCopies(year);
    Logger.log(`  ✅ Awards synced for ${year}`);
  } catch (error) {
    Logger.log(`  ⚠️ Error syncing awards: ${error.message}`);
  }

  Logger.log(`\n✅ ${year} WITH AWARDS COMPLETE`);
  Logger.log(`Run incrementalBackfillWithAwards(${Number(year) + 1}) to continue.`);
}

/**
 * Quick wrappers for backfill with awards - run these individually from Apps Script editor
 */
function backfillWithAwards2021() { incrementalBackfillWithAwards(2021); }
function backfillWithAwards2022() { incrementalBackfillWithAwards(2022); }
function backfillWithAwards2023() { incrementalBackfillWithAwards(2023); }
function backfillWithAwards2024() { incrementalBackfillWithAwards(2024); }

/**
 * Run all incremental backfills with awards sequentially
 * WARNING: This will take a long time. Better to run each year individually.
 */
function runAllBackfillsWithAwards() {
  const years = [2021, 2022, 2023, 2024];

  years.forEach(year => {
    Logger.log(`\n${"=".repeat(60)}`);
    incrementalBackfillWithAwards(year);
  });

  // Final step: Update current ownership
  Logger.log(`\n${"=".repeat(60)}`);
  Logger.log('\n--- FINAL STEP: Updating Current Ownership ---');
  updatePlayerCopyOwnership(String(getLeagueYear()));

  // Cleanup any duplicate awards
  Logger.log('\n--- CLEANUP: Removing Duplicate Awards ---');
  cleanupAwardHistory();

  Logger.log('\n✅ ALL BACKFILLS WITH AWARDS COMPLETE');
}

/**
 * Backfill redshirts for a specific year based on IR/TAXI transactions
 * This determines which player copies should have redshirts applied based on
 * whether they were on IR (medical) or TAXI (traditional) for the entire season.
 *
 * Key difference from Redshirts.gs: This applies redshirts to the SPECIFIC COPY
 * owned by the franchise, not all copies of a player.
 *
 * IMPORTANT: Medical redshirts are ONE-TIME USE per copy. If a copy already has
 * a medical redshirt (from sheet or from prior year in this backfill), it cannot
 * receive another one even if the player is on IR all season again.
 *
 * @param {Number} year - The year to process
 * @param {Object} ownershipAtEndOfYear - Map of rowNum -> franchiseId representing ownership state
 * @param {Object} playerCopyIndex - Index of playerId -> conference -> [copy info] (includes medicalRedshirtUsed)
 * @param {Object} franchiseMap - Map of franchiseId -> conference
 * @param {Object} existingRedshirtUpdates - Already-calculated redshirt updates from prior years in this backfill
 * @returns {Object} - Updates to apply: { rowNum: { traditional: bool, medical: bool } }
 */
function calculateRedshirtsForYear(year, ownershipAtEndOfYear, playerCopyIndex, franchiseMap, existingRedshirtUpdates = {}) {
  const transactions = fetchTransactions(String(year));

  // Sort by timestamp (oldest first)
  transactions.sort((a, b) => {
    const tsA = Number(a.timestamp || 0);
    const tsB = Number(b.timestamp || 0);
    return tsA - tsB;
  });

  // Track IR and TAXI status per franchise+player combination
  // Key: "franchiseId-playerId" -> { onIR: bool, wasActivated: bool, onTaxi: bool, wasPromoted: bool }
  const statusByFranchisePlayer = {};

  transactions.forEach(txn => {
    const franchiseId = String(Number(txn.franchise || 0)).padStart(3, "0");

    // Track IR moves
    if (txn.type === "IR") {
      // Deactivated = put on IR
      const deactivated = (txn.deactivated || "")
        .replace(/,\s*$/, "")
        .split(",")
        .filter(id => id.trim());

      deactivated.forEach(playerId => {
        playerId = playerId.trim();
        if (!playerId) return;

        const key = `${franchiseId}-${playerId}`;
        if (!statusByFranchisePlayer[key]) {
          statusByFranchisePlayer[key] = { onIR: false, wasActivated: false, onTaxi: false, wasPromoted: false };
        }
        statusByFranchisePlayer[key].onIR = true;
      });

      // Activated = taken off IR
      const activated = (txn.activated || "")
        .replace(/,\s*$/, "")
        .split(",")
        .filter(id => id.trim());

      activated.forEach(playerId => {
        playerId = playerId.trim();
        if (!playerId) return;

        const key = `${franchiseId}-${playerId}`;
        if (statusByFranchisePlayer[key]) {
          statusByFranchisePlayer[key].wasActivated = true;
        }
      });
    }

    // Track TAXI moves
    if (txn.type === "TAXI") {
      // Demoted = put on taxi
      const demoted = (txn.demoted || "")
        .replace(/,\s*$/, "")
        .split(",")
        .filter(id => id.trim());

      demoted.forEach(playerId => {
        playerId = playerId.trim();
        if (!playerId) return;

        const key = `${franchiseId}-${playerId}`;
        if (!statusByFranchisePlayer[key]) {
          statusByFranchisePlayer[key] = { onIR: false, wasActivated: false, onTaxi: false, wasPromoted: false };
        }
        statusByFranchisePlayer[key].onTaxi = true;
      });

      // Promoted = taken off taxi
      const promoted = (txn.promoted || "")
        .replace(/,\s*$/, "")
        .split(",")
        .filter(id => id.trim());

      promoted.forEach(playerId => {
        playerId = playerId.trim();
        if (!playerId) return;

        const key = `${franchiseId}-${playerId}`;
        if (statusByFranchisePlayer[key]) {
          statusByFranchisePlayer[key].wasPromoted = true;
        }
      });
    }
  });

  // Now determine which copies get redshirts
  const redshirtUpdates = {}; // rowNum -> { traditional: bool, medical: bool }

  Object.entries(statusByFranchisePlayer).forEach(([key, status]) => {
    const [franchiseId, playerId] = key.split("-");
    const franchiseConference = franchiseMap[franchiseId];

    if (!franchiseConference) return;

    // Find the copy owned by this franchise
    const playerConferences = playerCopyIndex[playerId] || {};
    const copiesInConf = playerConferences[franchiseConference] || [];

    const ownedCopy = copiesInConf.find(copy => {
      // IMPORTANT: Check if key EXISTS in ownershipAtEndOfYear, not just if value is truthy
      const currentOwner = copy.rowNum in ownershipAtEndOfYear
        ? ownershipAtEndOfYear[copy.rowNum]
        : copy.currentOwner;
      return currentOwner === franchiseId;
    });

    if (!ownedCopy) return;

    // Check for traditional redshirt: on taxi all season (never promoted)
    const earnedTraditional = status.onTaxi && !status.wasPromoted;

    // Check for medical redshirt: on IR all season (never activated)
    // BUT only if this copy hasn't already used its medical redshirt
    const alreadyHasMedicalFromSheet = ownedCopy.medicalRedshirtUsed;
    const alreadyHasMedicalFromPriorYear = existingRedshirtUpdates[ownedCopy.rowNum]?.medical;
    const canReceiveMedical = !alreadyHasMedicalFromSheet && !alreadyHasMedicalFromPriorYear;
    const earnedMedical = status.onIR && !status.wasActivated && canReceiveMedical;

    if (earnedMedical || earnedTraditional) {
      if (!redshirtUpdates[ownedCopy.rowNum]) {
        redshirtUpdates[ownedCopy.rowNum] = { traditional: false, medical: false };
      }
      if (earnedMedical) redshirtUpdates[ownedCopy.rowNum].medical = true;
      if (earnedTraditional) redshirtUpdates[ownedCopy.rowNum].traditional = true;
    }
  });

  return redshirtUpdates;
}

/**
 * Apply redshirt updates to the PlayerCopies sheet data in memory
 * @param {Array} fullData - The full sheet data array (including headers)
 * @param {Object} redshirtUpdates - Map of rowNum -> { traditional: bool, medical: bool, traditionalYear: number, medicalYear: number }
 * @returns {Number} - Count of updates applied
 */
function applyRedshirtUpdates(fullData, redshirtUpdates) {
  const traditionalCol = 6;      // TraditionalRedshirtUsed (0-indexed)
  const medicalCol = 7;          // MedicalRedshirtUsed (0-indexed)
  const traditionalYearCol = 11; // TraditionalRedshirtYear (0-indexed)
  const medicalYearCol = 12;     // MedicalRedshirtYear (0-indexed)

  let count = 0;

  Object.entries(redshirtUpdates).forEach(([rowNum, updates]) => {
    const arrayIndex = Number(rowNum) - 1; // Convert to 0-based index

    if (updates.traditional && !fullData[arrayIndex][traditionalCol]) {
      fullData[arrayIndex][traditionalCol] = true;
      fullData[arrayIndex][traditionalYearCol] = updates.traditionalYear || "";
      count++;
    }
    if (updates.medical && !fullData[arrayIndex][medicalCol]) {
      fullData[arrayIndex][medicalCol] = true;
      fullData[arrayIndex][medicalYearCol] = updates.medicalYear || "";
      count++;
    }
  });

  return count;
}

/**
 * PROCESS CURRENT YEAR TRANSACTIONS
 * Use this to process transactions for the current/active season.
 * Unlike backfill functions, this:
 * 1. Clears ONLY the current year's transaction logs (avoids duplicates)
 * 2. Clears ownership for copies that will be processed (ensures clean replay)
 * 3. Processes all transaction types with full logging
 * 4. Updates ownership and redshirts for specific copies (conference-aware)
 * 5. Can be run repeatedly throughout the season
 *
 * @param {Number|String} year - The year to process (defaults to getLeagueYear())
 * @returns {Object} - Summary of transactions processed
 */
function processCurrentYearTransactions(year) {
  const targetYear = year ? Number(year) : Number(getLeagueYear());

  Logger.log(`=== PROCESSING CURRENT YEAR TRANSACTIONS: ${targetYear} ===`);

  // Step 1: Clear existing transaction logs for this year to avoid duplicates
  Logger.log('\n--- Step 1: Clearing Previous Transaction Logs ---');
  const clearedCount = clearTransactionLogForYear(targetYear);
  Logger.log(`  Cleared ${clearedCount} existing log entries for ${targetYear}`);

  // Step 1b: Clear ownership in PlayerCopies sheet before replaying transactions
  // This ensures we don't have stale data causing duplicate assignments
  Logger.log('\n--- Step 1b: Clearing Current Ownership (will be rebuilt from transactions) ---');
  const ownershipCleared = clearPlayerCopyOwnership();
  Logger.log(`  Cleared ownership for ${ownershipCleared} player copies`);

  // Step 2: Process ALL transactions from 2018 through target year
  // This is necessary to maintain ownership for players acquired in previous years
  // (e.g., a player acquired in 2023 with no 2025 transactions still needs ownership restored)
  // We only LOG transactions for the target year, but we replay all years to get correct ownership
  Logger.log('\n--- Step 2: Processing All Historical Transactions (2018 through ' + targetYear + ') ---');

  // Build array of all years from 2018 to target year
  const allYears = [];
  for (let y = 2018; y <= targetYear; y++) {
    allYears.push(y);
  }
  Logger.log(`  Replaying transactions for years: ${allYears.join(', ')}`);

  // Process all years in a single call to maintain copy continuity (lastOwnedCopy map)
  // Only log transactions for the target year via logOnlyYears parameter
  Logger.log(`  Processing all years in single pass (logging only ${targetYear})...`);
  backfillHistoricalOwnership(allYears, true, new Set([targetYear]));

  // Step 3: Update eligibility years (accounts for any new redshirts)
  Logger.log('\n--- Step 3: Updating Eligibility ---');
  const currentYear = Number(getLeagueYear());
  backfillEligibilityYears(2018, currentYear); // Start from earliest possible rookie year

  // Step 4: Recalculate Active status
  Logger.log('\n--- Step 4: Verifying Active Status ---');
  const activeResults = recalculateAllActiveStatus();

  Logger.log(`\n✅ ${targetYear} TRANSACTIONS PROCESSED`);
  Logger.log(`Check the "TransactionLog" sheet to see all transactions`);
  Logger.log(`Run viewTransactionLogSummary() to see stats`);

  return {
    year: targetYear,
    transactionLogCleared: clearedCount,
    activeStatusChanges: activeResults
  };
}

/**
 * Process current year transactions using config year
 * Convenience wrapper for menu/manual use
 */
function processCurrentYearTransactionsFromConfig() {
  return processCurrentYearTransactions(getLeagueYear());
}
