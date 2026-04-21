/**
 * THEORETICAL NFL DRAFT
 * Calculates bonus recruiting dollars based on player NFL position rankings
 *
 * When copies graduate (eligibility exhausted) or early declare, their teams
 * receive bonus dollars based on the player's MFL position rank through Week 12.
 *
 * Tier System (by MFL position rank):
 * - Rank 1-8: $5
 * - Rank 9-16: $4
 * - Rank 17-24: $3
 * - Rank 25-32: $2
 * - Rank 33-40: $1
 * - Rank 41+: $0
 *
 * Position groups: QB, RB, WR/TE (combined)
 *
 * Only applies to copies that were owned by a team during the season.
 */

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate theoretical draft bonuses for all draft-eligible players
 * Should be run as part of end-of-season processing (Week 18 Final Rankings)
 *
 * @param {Number|String} year - Season year
 * @returns {Object} - { playerResults: [], teamBonuses: {}, summary: {} }
 */
function calculateTheoreticalDraft(year) {
  year = Number(year);
  const config = getConfig();

  Logger.log(`\n=== CALCULATING THEORETICAL DRAFT FOR ${year} ===\n`);

  // Step 0: Sync awards to PlayerCopies to ensure current year awards are reflected
  // This is critical for COULD_DECLARE eligibility - players who earned awards this year
  // need those awards synced before we check eligibility
  Logger.log("--- Step 0: Syncing Awards to PlayerCopies ---");
  try {
    const syncResult = syncAwardsToPlayerCopies(year);
    Logger.log(`  Synced ${syncResult.copiesUpdated} player copies with ${year} awards`);
  } catch (e) {
    Logger.log(`  Warning: Could not sync awards - ${e.message}`);
    Logger.log(`  Proceeding with existing award data in PlayerCopies`);
  }

  // Step 1: Get all draft-eligible copies
  Logger.log("\n--- Step 1: Getting Draft-Eligible Copies ---");
  const draftEligible = getDraftEligibleCopies(year);
  Logger.log(`  Found ${draftEligible.length} draft-eligible copies`);

  if (draftEligible.length === 0) {
    Logger.log("  No draft-eligible players found");
    return {
      playerResults: [],
      teamBonuses: {},
      summary: {
        totalPlayers: 0,
        totalDollars: 0,
        teamsWithBonuses: 0
      }
    };
  }

  // Step 2: Get unique player IDs to look up rankings
  const uniquePlayerIds = [...new Set(draftEligible.map(c => c.playerId))];
  Logger.log(`  ${uniquePlayerIds.length} unique players`);

  // Step 3: Fetch position rankings from MFL
  Logger.log("\n--- Step 2: Fetching MFL Position Rankings ---");
  const positionRankings = fetchAllPositionRankings(year, config.theoreticalDraft.rankingsCount);
  Logger.log(`  Loaded rankings for ${Object.keys(positionRankings).length} players`);

  // Step 4: Get player info (names, positions) from our data
  Logger.log("\n--- Step 3: Getting Player Info ---");
  const playerInfo = getPlayerInfoMap(year);
  Logger.log(`  Loaded info for ${Object.keys(playerInfo).length} players`);

  // Step 5: Calculate bonus for each draft-eligible copy
  Logger.log("\n--- Step 4: Calculating Draft Bonuses ---");
  const playerResults = [];
  const teamBonuses = {}; // franchiseId -> { count, dollars }
  const seenCopyIds = new Set(); // Track processed copyIds to avoid duplicates

  // Initialize team bonuses for all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    teamBonuses[fId] = { count: 0, dollars: 0, players: [] };
  });

  let duplicateCount = 0;
  let undraftedCount = 0;
  let missingPositionCount = 0;
  const missingPositionPlayers = [];

  draftEligible.forEach(copy => {
    // Skip duplicate copyIds
    if (seenCopyIds.has(copy.copyId)) {
      duplicateCount++;
      return;
    }
    seenCopyIds.add(copy.copyId);

    const ranking = positionRankings[copy.playerId];
    const info = playerInfo[copy.playerId] || {};

    // Track players with missing position
    if (!info.position) {
      missingPositionCount++;
      if (missingPositionPlayers.length < 10) {
        missingPositionPlayers.push(`${copy.playerName} (${copy.playerId})`);
      }
    }

    // Determine position group
    let positionGroup = "WR/TE";
    if (info.position === "QB") positionGroup = "QB";
    else if (info.position === "RB") positionGroup = "RB";

    // Get the rank to use
    // For WR/TE, use the combined rank; for QB/RB, use position rank
    let positionRank = 999;
    if (ranking) {
      if (positionGroup === "WR/TE") {
        positionRank = ranking.combinedRank || ranking.positionRank || 999;
      } else {
        positionRank = ranking.positionRank || 999;
      }
    }

    // Calculate tier and dollar value
    const tier = getTierForRank(positionRank, config.theoreticalDraft.tiers);
    const dollarValue = tier ? tier.value : 0;
    const draftRound = tier ? tier.round : 0;
    const roundLabel = tier ? tier.label : "Undrafted";

    // Skip undrafted players (rank 41+ / $0 value) - they don't contribute bonuses
    if (dollarValue === 0) {
      undraftedCount++;
      return;
    }

    const result = {
      year: year,
      playerId: copy.playerId,
      playerName: copy.playerName || info.name || `Player ${copy.playerId}`,
      position: info.position || "??",
      positionGroup: positionGroup,
      copyId: copy.copyId,
      conference: copy.conference,
      franchiseId: copy.franchiseId,
      draftReason: copy.draftReason,
      seasonPoints: ranking?.points || 0,
      positionRank: positionRank,
      draftRound: draftRound,
      roundLabel: roundLabel,
      dollarValue: dollarValue
    };

    playerResults.push(result);

    // Credit team (only if owned)
    if (copy.franchiseId && teamBonuses[copy.franchiseId]) {
      teamBonuses[copy.franchiseId].count++;
      teamBonuses[copy.franchiseId].dollars += dollarValue;
      teamBonuses[copy.franchiseId].players.push({
        playerName: result.playerName,
        positionRank: positionRank,
        dollarValue: dollarValue
      });
    }
  });

  if (duplicateCount > 0) {
    Logger.log(`  Skipped ${duplicateCount} duplicate copyIds`);
  }
  Logger.log(`  Skipped ${undraftedCount} undrafted players (rank 41+)`);

  if (missingPositionCount > 0) {
    Logger.log(`  WARNING: ${missingPositionCount} players missing position data (defaulting to WR/TE group)`);
    Logger.log(`    Examples: ${missingPositionPlayers.join(", ")}`);
  }

  // Step 6: Log summary
  Logger.log("\n--- Step 5: Summary ---");
  const teamsWithBonuses = Object.entries(teamBonuses)
    .filter(([_, data]) => data.dollars > 0)
    .sort((a, b) => b[1].dollars - a[1].dollars);

  Logger.log(`  Teams with draft bonuses: ${teamsWithBonuses.length}`);
  const totalDollars = teamsWithBonuses.reduce((sum, [_, data]) => sum + data.dollars, 0);
  Logger.log(`  Total draft bonus dollars: $${totalDollars}`);

  // Log top 10 teams
  Logger.log("\n  Top 10 Teams by Draft Bonus:");
  teamsWithBonuses.slice(0, 10).forEach(([fId, data], idx) => {
    Logger.log(`    ${idx + 1}. Team ${fId}: $${data.dollars} (${data.count} players)`);
  });

  // Step 7: Write to TheoreticalDraft sheet
  Logger.log("\n--- Step 6: Writing to Sheet ---");
  writeTheoreticalDraftToSheet(year, playerResults);

  Logger.log(`\n=== THEORETICAL DRAFT CALCULATION COMPLETE ===`);

  return {
    playerResults: playerResults,
    teamBonuses: teamBonuses,
    summary: {
      totalPlayers: playerResults.length,
      totalDollars: totalDollars,
      teamsWithBonuses: teamsWithBonuses.length
    }
  };
}

// ============================================================================
// DRAFT ELIGIBILITY FUNCTIONS
// ============================================================================

/**
 * Get all copies that are eligible to enter the theoretical draft
 *
 * Draft-eligible copies are ACTIVE players who will leave after this season:
 * 1. GRADUATING: In their final year (eligibilityYearsUsed + 1 >= maxEligibility)
 *    - After this season completes, they'll have exhausted eligibility
 * 2. EARLY_DECLARE: Already declared early this year (processed)
 * 3. RELEASING: Has RELEASE decision pending (will be early declare when processed)
 * 4. COULD_DECLARE: Has enough awards to declare early (1 national OR 2 all-conf)
 *    - Has 3+ years AND meets award requirements
 *    - INCLUDED in draft by default - team can RETAIN to cancel the bonus
 *
 * All categories are INCLUDED in draft bonus calculations.
 * For COULD_DECLARE players, the bonus is credited to the team unless they
 * choose to RETAIN the player (which cancels the draft bonus).
 *
 * Key Requirements:
 * - Must be ACTIVE (still on a roster at end of season)
 * - Must have an owner (franchiseId != "000")
 *
 * @param {Number} year - Season year
 * @returns {Array} - Array of draft-eligible copy objects
 */
function getDraftEligibleCopies(year) {
  year = Number(year);  // Ensure year is a number
  const config = getConfig();
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  Logger.log(`  PlayerCopies has ${data.length - 1} rows`);

  if (data.length <= 1) return [];

  const eligible = [];
  const maxYears = config.eligibility.maxYears;  // 4
  const minYearsForDeclaration = config.declarations.minYearsForDeclaration;  // 3

  // Diagnostic counters
  let stats = {
    total: 0,
    noOwner: 0,
    notActive: 0,
    graduating: 0,
    earlyDeclare: 0,
    releasing: 0,
    couldDeclare: 0
  };

  // Use PC_COLS from Declarations.gs
  data.slice(1).forEach(row => {
    stats.total++;

    const copyId = row[PC_COLS.copyId];
    const playerId = row[PC_COLS.playerId];
    const playerName = row[PC_COLS.playerName];
    const conference = row[PC_COLS.conference];
    const franchiseId = String(row[PC_COLS.currentFranchiseId] || "").padStart(3, "0");
    const eligibilityYearsUsed = Number(row[PC_COLS.eligibilityYearsUsed]) || 0;
    const traditionalRedshirt = row[PC_COLS.traditionalRedshirtUsed] === true || row[PC_COLS.traditionalRedshirtUsed] === "TRUE";
    const medicalRedshirt = row[PC_COLS.medicalRedshirtUsed] === true || row[PC_COLS.medicalRedshirtUsed] === "TRUE";
    const active = row[PC_COLS.active] === true || row[PC_COLS.active] === "TRUE";
    const declaredEarly = row[PC_COLS.declaredEarly] === true || row[PC_COLS.declaredEarly] === "TRUE";
    const declarationYear = Number(row[PC_COLS.declarationYear]) || 0;
    const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
    const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
    const retentionDecision = String(row[PC_COLS.retentionDecision] || "").toUpperCase().trim();

    // Skip if no owner (not on a roster)
    if (!franchiseId || franchiseId === "000") {
      stats.noOwner++;
      return;
    }

    // Skip if not active (not on roster at end of season)
    // Exception: Early declares may have been marked inactive when they declared
    const isEarlyDeclare = declaredEarly && declarationYear === year;
    if (!active && !isEarlyDeclare) {
      stats.notActive++;
      return;
    }

    // Calculate max eligibility for display (base 4 years + redshirts = calendar years)
    // Note: This is used for display only. Graduation check uses maxYears (4) because
    // eligibilityYearsUsed is already in "playing years" (calendar years - redshirt years).
    let maxEligibility = maxYears;
    if (traditionalRedshirt) maxEligibility++;
    if (medicalRedshirt) maxEligibility++;

    // Check draft eligibility reasons
    let draftReason = null;

    // Option 1: Already early declared this year (processed)
    if (isEarlyDeclare) {
      draftReason = "EARLY_DECLARE";
      stats.earlyDeclare++;
    }
    // Option 2: Has RELEASE decision pending (will be early declare when processed)
    else if (retentionDecision === "RELEASE") {
      draftReason = "RELEASING";
      stats.releasing++;
    }
    // Option 3: Will graduate this year (in their final year of playing eligibility)
    // eligibilityYearsUsed is in "playing years" (already has redshirts subtracted)
    // so we compare against maxYears (4), not maxEligibility (which includes redshirts)
    else if (eligibilityYearsUsed + 1 >= maxYears) {
      draftReason = "GRADUATING";
      stats.graduating++;
    }
    // Option 4: Could declare early (has awards and 3+ total program years after this season)
    // Total program years = playing years + redshirt years (includes time sitting out)
    // Using +1 to project completion of current season
    else {
      const totalProgramYears = eligibilityYearsUsed + (traditionalRedshirt ? 1 : 0) + (medicalRedshirt ? 1 : 0);
      if (totalProgramYears + 1 >= minYearsForDeclaration) {
        const hasNationalAward = nationalAwards >= 1;
        const hasTwoAllConf = allConfAwards >= 2;

        if (hasNationalAward || hasTwoAllConf) {
          draftReason = "COULD_DECLARE";
          stats.couldDeclare++;
        }
      }
    }

    if (draftReason) {
      eligible.push({
        copyId: copyId,
        playerId: playerId,
        playerName: playerName,
        conference: conference,
        franchiseId: franchiseId,
        eligibilityYearsUsed: eligibilityYearsUsed,
        maxEligibility: maxEligibility,
        nationalAwards: nationalAwards,
        allConfAwards: allConfAwards,
        draftReason: draftReason
      });
    }
  });

  // Log diagnostic stats
  Logger.log(`\n  Diagnostic Stats:`);
  Logger.log(`    Total rows: ${stats.total}`);
  Logger.log(`    No owner (000): ${stats.noOwner}`);
  Logger.log(`    Not active: ${stats.notActive}`);
  Logger.log(`    GRADUATING (final year): ${stats.graduating}`);
  Logger.log(`    EARLY_DECLARE (already declared): ${stats.earlyDeclare}`);
  Logger.log(`    RELEASING (pending release): ${stats.releasing}`);
  Logger.log(`    COULD_DECLARE (3rd+ year with awards): ${stats.couldDeclare}`);
  Logger.log(`    TOTAL ELIGIBLE: ${eligible.length}`);

  return eligible;
}

/**
 * Get tier information for a given position rank
 *
 * @param {Number} rank - Position rank from MFL
 * @param {Array} tiers - Tier configuration array
 * @returns {Object|null} - Tier object { minRank, maxRank, value } or null
 */
function getTierForRank(rank, tiers) {
  for (const tier of tiers) {
    if (rank >= tier.minRank && rank <= tier.maxRank) {
      return tier;
    }
  }
  return null;
}

/**
 * Get player info (name, position) for all players
 * Uses MFL player data as primary source, falls back to RookieLedger for missing positions
 *
 * @param {Number} year - Season year
 * @returns {Object} - Map of playerId -> { name, position }
 */
function getPlayerInfoMap(year) {
  const config = getConfig();
  const infoMap = {};

  // Step 1: Load MFL player data (primary source)
  const players = fetchPlayers(year);
  players.forEach(p => {
    infoMap[String(p.id)] = {
      name: p.name || "",
      position: p.position || ""
    };
  });

  // Step 2: Load RookieLedger as fallback for missing positions
  const ss = SpreadsheetApp.getActive();
  const rlSheet = ss.getSheetByName(config.sheets.rookieLedger);

  if (rlSheet) {
    const rlData = rlSheet.getDataRange().getValues();
    if (rlData.length > 1) {
      // RookieLedger columns: MFL_Player_ID, PlayerName, Position, RookieLeagueYear, NFLTeam, CapturedAt
      rlData.slice(1).forEach(row => {
        const playerId = String(row[0] || "");
        const playerName = row[1] || "";
        const position = row[2] || "";

        if (!playerId) return;

        // If player not in map, add them
        if (!infoMap[playerId]) {
          infoMap[playerId] = { name: playerName, position: position };
        }
        // If player exists but has blank position, use RookieLedger position
        else if (!infoMap[playerId].position && position) {
          infoMap[playerId].position = position;
        }
        // If player exists but has blank name, use RookieLedger name
        if (!infoMap[playerId].name && playerName) {
          infoMap[playerId].name = playerName;
        }
      });
    }
  }

  // Log how many have positions
  const withPosition = Object.values(infoMap).filter(p => p.position).length;
  const total = Object.keys(infoMap).length;
  Logger.log(`  Player info: ${total} players, ${withPosition} with positions`);

  return infoMap;
}

// ============================================================================
// SHEET MANAGEMENT
// ============================================================================

/**
 * Get or create the TheoreticalDraft sheet
 * @returns {Sheet} - The TheoreticalDraft sheet
 */
function getTheoreticalDraftSheet() {
  const config = getConfig();

  const headers = [
    "Year",
    "PlayerID",
    "PlayerName",
    "Position",
    "PositionGroup",
    "CopyID",
    "Conference",
    "FranchiseID",
    "DraftReason",
    "SeasonPoints",
    "PositionRank",
    "DraftRound",
    "RoundLabel",
    "DollarValue",
    "CalculatedAt"
  ];

  return getOrCreateSheet(config.sheets.theoreticalDraft, headers);
}

/**
 * Write theoretical draft results to sheet
 *
 * @param {Number} year - Season year
 * @param {Array} results - Array of player result objects
 */
function writeTheoreticalDraftToSheet(year, results) {
  const sheet = getTheoreticalDraftSheet();
  const now = new Date();

  // Clear existing data for this year
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    const headers = data[0];
    const yearIdx = headers.indexOf("Year");

    const rowsToKeep = data.slice(1).filter(row => Number(row[yearIdx]) !== year);

    sheet.getRange(2, 1, data.length - 1, headers.length).clearContent();

    if (rowsToKeep.length > 0) {
      sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    }
  }

  // Write new results
  const rows = results.map(r => [
    r.year,
    r.playerId,
    r.playerName,
    r.position,
    r.positionGroup,
    r.copyId,
    r.conference,
    r.franchiseId,
    r.draftReason,
    r.seasonPoints,
    r.positionRank,
    r.draftRound,
    r.roundLabel,
    r.dollarValue,
    now
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  Logger.log(`  Wrote ${rows.length} draft entries for ${year}`);
}

// ============================================================================
// INTEGRATION WITH RECRUITING DOLLARS
// ============================================================================

/**
 * Get draft bonus totals by team for recruiting dollars integration
 * This function is called from RecruitingDollars.gs
 *
 * @param {Number} year - Season year
 * @param {Set} [excludeCopyIds] - Optional set of CopyIDs to exclude (retained players)
 * @returns {Object} - Map of franchiseId -> { count, dollars }
 */
function getDraftBonusesByTeam(year, excludeCopyIds) {
  const sheet = getTheoreticalDraftSheet();
  const data = sheet.getDataRange().getValues();

  Logger.log(`  [getDraftBonusesByTeam] Reading TheoreticalDraft for year ${year}`);
  Logger.log(`    Total rows in sheet: ${data.length - 1}`);
  if (excludeCopyIds && excludeCopyIds.size > 0) {
    Logger.log(`    Excluding ${excludeCopyIds.size} retained copyIds from draft bonuses`);
  }

  const bonuses = {};

  // Initialize all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    bonuses[fId] = { count: 0, dollars: 0 };
  });
  Logger.log(`    Initialized ${Object.keys(bonuses).length} franchises`);

  if (data.length <= 1) {
    Logger.log(`    WARNING: Sheet is empty (no data rows)`);
    return bonuses;
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Verify required columns exist
  const yearCol = colMap["Year"];
  const franchiseCol = colMap["FranchiseID"];
  const dollarCol = colMap["DollarValue"];
  const copyIdCol = colMap["CopyID"];
  Logger.log(`    Column indices: Year=${yearCol}, FranchiseID=${franchiseCol}, DollarValue=${dollarCol}, CopyID=${copyIdCol}`);

  if (yearCol === undefined || franchiseCol === undefined || dollarCol === undefined) {
    Logger.log(`    ERROR: Missing required columns!`);
    Logger.log(`    Available headers: ${headers.join(", ")}`);
    return bonuses;
  }

  // Sum up bonuses by team
  let matchedRows = 0;
  let totalDollars = 0;
  let skippedNoFranchise = 0;
  let skippedRetained = 0;

  data.slice(1).forEach((row, idx) => {
    const rowYear = Number(row[yearCol]);
    if (rowYear !== Number(year)) return;

    matchedRows++;

    // Skip retained players (their draft bonus is cancelled)
    if (excludeCopyIds && excludeCopyIds.size > 0 && copyIdCol !== undefined) {
      const copyId = String(row[copyIdCol] || "");
      if (copyId && excludeCopyIds.has(copyId)) {
        skippedRetained++;
        return;
      }
    }

    const franchiseId = String(row[franchiseCol] || "").padStart(3, "0");
    const dollarValue = Number(row[dollarCol]) || 0;

    if (franchiseId && franchiseId !== "000" && bonuses[franchiseId]) {
      bonuses[franchiseId].count++;
      bonuses[franchiseId].dollars += dollarValue;
      totalDollars += dollarValue;
    } else {
      skippedNoFranchise++;
      if (skippedNoFranchise <= 3) {
        Logger.log(`    Skipped row ${idx + 2}: franchiseId="${franchiseId}", dollarValue=${dollarValue}`);
      }
    }
  });

  Logger.log(`    Rows matching year ${year}: ${matchedRows}`);
  Logger.log(`    Skipped (retained): ${skippedRetained}`);
  Logger.log(`    Skipped (no valid franchise): ${skippedNoFranchise}`);
  Logger.log(`    Total draft bonus dollars: $${totalDollars}`);

  return bonuses;
}

// ============================================================================
// MENU/UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate theoretical draft for current year
 */
function calculateTheoreticalDraftCurrentYear() {
  calculateTheoreticalDraft(getLeagueYear());
}

/**
 * View draft-eligible players without calculating
 * Shows season points and projected draft round for all players
 */
function viewDraftEligiblePlayers() {
  const config = getConfig();
  const year = Number(getLeagueYear());

  Logger.log(`=== DRAFT-ELIGIBLE PLAYERS FOR ${year} ===\n`);
  Logger.log(`Players who will or might enter the draft after this season:\n`);

  // Sync awards first to ensure current year awards are reflected
  Logger.log("Syncing awards to PlayerCopies...");
  try {
    const syncResult = syncAwardsToPlayerCopies(year);
    Logger.log(`  Synced ${syncResult.copiesUpdated} player copies with ${year} awards\n`);
  } catch (e) {
    Logger.log(`  Warning: Could not sync awards - ${e.message}\n`);
  }

  const eligible = getDraftEligibleCopies(year);

  if (eligible.length === 0) {
    Logger.log("No draft-eligible players found");
    return;
  }

  // Fetch MFL rankings to show projected draft value
  Logger.log("Fetching MFL position rankings...");
  const positionRankings = fetchAllPositionRankings(year, config.theoreticalDraft.rankingsCount);
  const playerInfo = getPlayerInfoMap(year);
  Logger.log(`Loaded rankings for ${Object.keys(positionRankings).length} players\n`);

  // Enrich eligible copies with ranking data
  const missingPositionPlayers = [];

  const enrichedEligible = eligible.map(copy => {
    const ranking = positionRankings[copy.playerId];
    const info = playerInfo[copy.playerId] || {};

    // Track missing positions
    if (!info.position && missingPositionPlayers.length < 5) {
      missingPositionPlayers.push(copy.playerName);
    }

    let positionGroup = "WR/TE";
    if (info.position === "QB") positionGroup = "QB";
    else if (info.position === "RB") positionGroup = "RB";

    let positionRank = 999;
    if (ranking) {
      if (positionGroup === "WR/TE") {
        positionRank = ranking.combinedRank || ranking.positionRank || 999;
      } else {
        positionRank = ranking.positionRank || 999;
      }
    }

    const tier = getTierForRank(positionRank, config.theoreticalDraft.tiers);

    return {
      ...copy,
      position: info.position || "??",
      positionGroup: positionGroup,
      seasonPoints: ranking?.points || 0,
      positionRank: positionRank,
      dollarValue: tier ? tier.value : 0,
      roundLabel: tier ? tier.label : "Undrafted"
    };
  });

  if (missingPositionPlayers.length > 0) {
    Logger.log(`WARNING: Some players missing position data (check RookieLedger): ${missingPositionPlayers.join(", ")}`);
  }

  // Group by reason
  const byReason = {
    GRADUATING: [],
    EARLY_DECLARE: [],
    RELEASING: [],
    COULD_DECLARE: []
  };

  enrichedEligible.forEach(copy => {
    if (byReason[copy.draftReason]) {
      byReason[copy.draftReason].push(copy);
    }
  });

  // Helper to format player line with ranking info
  const formatPlayerLine = (c) => {
    const redshirts = (c.maxEligibility > 4) ? ` [+${c.maxEligibility - 4} RS]` : "";
    const rankStr = c.positionRank <= 40 ? `#${c.positionRank} ${c.position}` : "Undrafted";
    const valueStr = c.dollarValue > 0 ? `$${c.dollarValue}` : "$0";
    const pointsStr = c.seasonPoints > 0 ? `${c.seasonPoints.toFixed(1)} pts` : "0 pts";
    return `   ${c.playerName} (${c.conference}) - ${c.position} - ${pointsStr} - ${rankStr} - ${valueStr} - Owner: ${c.franchiseId}`;
  };

  // Display GRADUATING
  if (byReason.GRADUATING.length > 0) {
    // Sort by dollar value descending
    byReason.GRADUATING.sort((a, b) => b.dollarValue - a.dollarValue || b.seasonPoints - a.seasonPoints);

    const draftedCount = byReason.GRADUATING.filter(c => c.dollarValue > 0).length;
    const totalValue = byReason.GRADUATING.reduce((sum, c) => sum + c.dollarValue, 0);

    Logger.log(`\n🎓 GRADUATING - Final Year (${byReason.GRADUATING.length} players, ${draftedCount} drafted, $${totalValue} total):`);
    Logger.log(`   These players will exhaust eligibility after this season.\n`);
    byReason.GRADUATING.forEach(c => Logger.log(formatPlayerLine(c)));
  }

  // Display EARLY_DECLARE (already processed)
  if (byReason.EARLY_DECLARE.length > 0) {
    byReason.EARLY_DECLARE.sort((a, b) => b.dollarValue - a.dollarValue || b.seasonPoints - a.seasonPoints);

    const draftedCount = byReason.EARLY_DECLARE.filter(c => c.dollarValue > 0).length;
    const totalValue = byReason.EARLY_DECLARE.reduce((sum, c) => sum + c.dollarValue, 0);

    Logger.log(`\n📣 EARLY DECLARED (${byReason.EARLY_DECLARE.length} players, ${draftedCount} drafted, $${totalValue} total):`);
    Logger.log(`   These players have already declared for the draft.\n`);
    byReason.EARLY_DECLARE.forEach(c => Logger.log(formatPlayerLine(c)));
  }

  // Display RELEASING (pending RELEASE decision)
  if (byReason.RELEASING.length > 0) {
    byReason.RELEASING.sort((a, b) => b.dollarValue - a.dollarValue || b.seasonPoints - a.seasonPoints);

    const draftedCount = byReason.RELEASING.filter(c => c.dollarValue > 0).length;
    const totalValue = byReason.RELEASING.reduce((sum, c) => sum + c.dollarValue, 0);

    Logger.log(`\n🚀 RELEASING - Pending Early Declaration (${byReason.RELEASING.length} players, ${draftedCount} drafted, $${totalValue} total):`);
    Logger.log(`   These players have RELEASE decisions pending - will declare early when processed.\n`);
    byReason.RELEASING.forEach(c => {
      const awards = [];
      if (c.nationalAwards > 0) awards.push(`${c.nationalAwards} Nat'l`);
      if (c.allConfAwards > 0) awards.push(`${c.allConfAwards} AC`);
      const awardsStr = awards.length > 0 ? ` [${awards.join(", ")}]` : "";
      Logger.log(formatPlayerLine(c) + awardsStr);
    });
  }

  // Display COULD_DECLARE - these are INCLUDED in team bonuses (team can retain later to cancel)
  if (byReason.COULD_DECLARE.length > 0) {
    byReason.COULD_DECLARE.sort((a, b) => b.dollarValue - a.dollarValue || b.seasonPoints - a.seasonPoints);

    const draftedCount = byReason.COULD_DECLARE.filter(c => c.dollarValue > 0).length;
    const totalValue = byReason.COULD_DECLARE.reduce((sum, c) => sum + c.dollarValue, 0);

    Logger.log(`\n⚠️ EARLY DECLARATION ELIGIBLE (${byReason.COULD_DECLARE.length} players, ${draftedCount} drafted, $${totalValue} total):`);
    Logger.log(`   These players are INCLUDED in draft bonuses. Teams can RETAIN to cancel the bonus.\n`);
    byReason.COULD_DECLARE.forEach(c => {
      const awards = [];
      if (c.nationalAwards > 0) awards.push(`${c.nationalAwards} Nat'l`);
      if (c.allConfAwards > 0) awards.push(`${c.allConfAwards} AC`);
      const awardsStr = awards.length > 0 ? ` [${awards.join(", ")}]` : "";
      Logger.log(formatPlayerLine(c) + awardsStr);
    });
  }

  // Overall summary
  const allDrafted = enrichedEligible.filter(c => c.dollarValue > 0);
  const totalPotentialValue = enrichedEligible.reduce((sum, c) => sum + c.dollarValue, 0);

  Logger.log(`\n=== SUMMARY ===`);
  Logger.log(`  Graduating (definite): ${byReason.GRADUATING.length}`);
  Logger.log(`  Early Declared: ${byReason.EARLY_DECLARE.length}`);
  Logger.log(`  Releasing (pending): ${byReason.RELEASING.length}`);
  Logger.log(`  Early Declaration Eligible (included, can be retained): ${byReason.COULD_DECLARE.length}`);
  Logger.log(`  Total in draft: ${eligible.length}`);
  Logger.log(`  Drafted (rank 1-40): ${allDrafted.length}`);
  Logger.log(`  Total draft value: $${totalPotentialValue}`);
  Logger.log(`\n  Note: All categories above are INCLUDED in team draft bonuses.`);
  Logger.log(`  Teams can RETAIN early-declaration-eligible players to cancel their bonus.`);
}

/**
 * Menu function to calculate draft bonuses for current year
 * Requires PowerRankings to be at Week 18 (Final Rankings)
 */
function menuCalculateTheoreticalDraft() {
  const year = getLeagueYear();
  runTheoreticalDraftForYear(year);
}

/**
 * Menu function to calculate draft bonuses for a specific year
 * Allows manual override for backfill purposes
 */
function menuCalculateTheoreticalDraftCustom() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const yearResponse = ui.prompt(
    'Calculate Theoretical Draft',
    `Enter year (default: ${defaultYear}):\n\n` +
    'Note: PowerRankings must have Week 18 data for the selected year.',
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = Number(yearResponse.getResponseText().trim() || defaultYear);

  if (isNaN(year) || year < 2018 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2018 and 2030.');
    return;
  }

  runTheoreticalDraftForYear(year);
}

/**
 * Internal function to run theoretical draft for a given year
 * @param {Number} year - Season year
 */
function runTheoreticalDraftForYear(year) {
  const ui = SpreadsheetApp.getUi();

  // Check if PowerRankings is at Week 18
  const currentWeek = getPowerRankingsWeek(year);

  if (currentWeek === null) {
    ui.alert(
      'Error: No Rankings Found',
      `No PowerRankings data found for ${year}.\n\n` +
      `Please run "Calculate Rankings" from the Power Rankings menu first.`,
      ui.ButtonSet.OK
    );
    return;
  }

  if (currentWeek < 12) {
    ui.alert(
      'Error: Regular Season Not Complete',
      `Theoretical Draft can only be calculated after Week 12 (regular season complete).\n\n` +
      `Current PowerRankings week: ${currentWeek}\n` +
      `Required: Week 12 or later\n\n` +
      `Please run "Calculate Rankings" for Week 12+ first to finalize season standings.`,
      ui.ButtonSet.OK
    );
    return;
  }

  const confirm = ui.alert(
    'Calculate Theoretical Draft',
    `This will calculate draft bonuses for all graduating/early declaring players in ${year}.\n\n` +
    `- Position rankings will be fetched from MFL\n` +
    `- Bonuses will be calculated based on position tiers\n` +
    `- Results will be written to TheoreticalDraft sheet\n\n` +
    `Continue?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = calculateTheoreticalDraft(year);

  ui.alert(
    'Theoretical Draft Complete',
    `Calculated draft bonuses for ${year}:\n\n` +
    `Total players: ${result.summary.totalPlayers}\n` +
    `Total bonus dollars: $${result.summary.totalDollars}\n` +
    `Teams with bonuses: ${result.summary.teamsWithBonuses}\n\n` +
    `See TheoreticalDraft sheet and Logs for details.`,
    ui.ButtonSet.OK
  );
}

/**
 * Get the current week from PowerRankings sheet for a given year
 * @param {Number|String} year - Season year
 * @returns {Number|null} - Current week number or null if no data
 */
function getPowerRankingsWeek(year) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("PowerRankings");

  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const headers = data[0];
  const yearIdx = headers.indexOf("Year");
  const weekIdx = headers.indexOf("Week");

  if (yearIdx === -1 || weekIdx === -1) return null;

  // Find the most recent week for this year
  let maxWeek = null;
  data.slice(1).forEach(row => {
    if (Number(row[yearIdx]) === Number(year)) {
      const week = Number(row[weekIdx]);
      if (maxWeek === null || week > maxWeek) {
        maxWeek = week;
      }
    }
  });

  return maxWeek;
}

/**
 * Menu function to view draft-eligible players
 */
function menuViewDraftEligible() {
  const ui = SpreadsheetApp.getUi();

  // Show loading message
  ui.alert('Loading...', 'Fetching draft eligibility data and MFL rankings.\nThis may take a moment.', ui.ButtonSet.OK);

  viewDraftEligiblePlayers();

  const config = getConfig();
  const year = Number(getLeagueYear());
  const eligible = getDraftEligibleCopies(year);

  if (eligible.length === 0) {
    ui.alert('Draft Eligible', 'No draft-eligible players found.\n\nCheck Logs for diagnostic details.', ui.ButtonSet.OK);
    return;
  }

  // Fetch rankings to enrich the display
  const positionRankings = fetchAllPositionRankings(year, config.theoreticalDraft.rankingsCount);
  const playerInfo = getPlayerInfoMap(year);

  // Enrich with ranking data
  const enriched = eligible.map(copy => {
    const ranking = positionRankings[copy.playerId];
    const info = playerInfo[copy.playerId] || {};

    let positionGroup = "WR/TE";
    if (info.position === "QB") positionGroup = "QB";
    else if (info.position === "RB") positionGroup = "RB";

    let positionRank = 999;
    if (ranking) {
      positionRank = (positionGroup === "WR/TE")
        ? (ranking.combinedRank || ranking.positionRank || 999)
        : (ranking.positionRank || 999);
    }

    const tier = getTierForRank(positionRank, config.theoreticalDraft.tiers);

    return {
      ...copy,
      position: info.position || "??",
      dollarValue: tier ? tier.value : 0,
      roundLabel: tier ? tier.label : "Undrafted"
    };
  });

  // Group by reason
  const graduating = enriched.filter(c => c.draftReason === "GRADUATING");
  const earlyDeclare = enriched.filter(c => c.draftReason === "EARLY_DECLARE");
  const releasing = enriched.filter(c => c.draftReason === "RELEASING");
  const couldDeclare = enriched.filter(c => c.draftReason === "COULD_DECLARE");

  // Sort each by dollar value
  [graduating, earlyDeclare, releasing, couldDeclare].forEach(arr => {
    arr.sort((a, b) => b.dollarValue - a.dollarValue);
  });

  // Build summary with categories
  let summaryLines = [];

  const formatPlayer = (c) => {
    const value = c.dollarValue > 0 ? `$${c.dollarValue}` : "Undrafted";
    return `  ${c.playerName} (${c.position}) - ${value}`;
  };

  if (graduating.length > 0) {
    const totalVal = graduating.reduce((s, c) => s + c.dollarValue, 0);
    const draftedCount = graduating.filter(c => c.dollarValue > 0).length;
    summaryLines.push(`🎓 GRADUATING (${graduating.length}, ${draftedCount} drafted, $${totalVal}):`);
    graduating.filter(c => c.dollarValue > 0).slice(0, 5).forEach(c => summaryLines.push(formatPlayer(c)));
    const remaining = graduating.filter(c => c.dollarValue > 0).length - 5;
    if (remaining > 0) summaryLines.push(`  ...and ${remaining} more drafted`);
    summaryLines.push("");
  }

  if (earlyDeclare.length > 0) {
    const totalVal = earlyDeclare.reduce((s, c) => s + c.dollarValue, 0);
    const draftedCount = earlyDeclare.filter(c => c.dollarValue > 0).length;
    summaryLines.push(`📣 EARLY DECLARED (${earlyDeclare.length}, ${draftedCount} drafted, $${totalVal}):`);
    earlyDeclare.filter(c => c.dollarValue > 0).slice(0, 5).forEach(c => summaryLines.push(formatPlayer(c)));
    const remaining = earlyDeclare.filter(c => c.dollarValue > 0).length - 5;
    if (remaining > 0) summaryLines.push(`  ...and ${remaining} more drafted`);
    summaryLines.push("");
  }

  if (releasing.length > 0) {
    const totalVal = releasing.reduce((s, c) => s + c.dollarValue, 0);
    const draftedCount = releasing.filter(c => c.dollarValue > 0).length;
    summaryLines.push(`🚀 RELEASING (${releasing.length}, ${draftedCount} drafted, $${totalVal}):`);
    releasing.filter(c => c.dollarValue > 0).slice(0, 5).forEach(c => summaryLines.push(formatPlayer(c)));
    const remaining = releasing.filter(c => c.dollarValue > 0).length - 5;
    if (remaining > 0) summaryLines.push(`  ...and ${remaining} more drafted`);
    summaryLines.push("");
  }

  if (couldDeclare.length > 0) {
    const totalVal = couldDeclare.reduce((s, c) => s + c.dollarValue, 0);
    const draftedCount = couldDeclare.filter(c => c.dollarValue > 0).length;
    summaryLines.push(`⚠️ EARLY DECL ELIGIBLE (${couldDeclare.length}, ${draftedCount} drafted, $${totalVal}):`);
    summaryLines.push(`   (Included - teams can RETAIN to cancel)`);
    couldDeclare.filter(c => c.dollarValue > 0).slice(0, 5).forEach(c => summaryLines.push(formatPlayer(c)));
    const remaining = couldDeclare.filter(c => c.dollarValue > 0).length - 5;
    if (remaining > 0) summaryLines.push(`  ...and ${remaining} more drafted`);
  }

  const totalDraftValue = enriched.reduce((s, c) => s + c.dollarValue, 0);
  const totalDrafted = enriched.filter(c => c.dollarValue > 0).length;

  ui.alert(
    `Draft Eligible Players (${eligible.length} total)`,
    summaryLines.join('\n') +
    `\n\nTOTAL: ${totalDrafted} draftable players, $${totalDraftValue} potential value` +
    '\n\nSee Logs for full details with points and rankings.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================================

/**
 * Diagnose why no draft-eligible players are being found
 * Analyzes the distribution of eligibilityYearsUsed values in PlayerCopies
 */
function diagnoseEligibilityData() {
  const year = Number(getLeagueYear());
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();

  Logger.log(`\n=== ELIGIBILITY DATA DIAGNOSIS FOR ${year} ===\n`);

  if (data.length <= 1) {
    Logger.log("ERROR: PlayerCopies sheet is empty!");
    return;
  }

  // Analyze eligibilityYearsUsed distribution
  const yearsDist = {};  // { yearsUsed: count }
  const activeByYears = {};  // { yearsUsed: count of active players }
  const ownedByYears = {};  // { yearsUsed: count of owned players }

  let totalRows = 0;
  let totalActive = 0;
  let totalOwned = 0;
  let nullOrZeroYears = 0;

  // Track players with 3+ years for closer inspection
  const playersWithThreePlusYears = [];

  data.slice(1).forEach(row => {
    totalRows++;

    const franchiseId = String(row[PC_COLS.currentFranchiseId] || "").padStart(3, "0");
    const active = row[PC_COLS.active] === true || row[PC_COLS.active] === "TRUE";
    const yearsUsed = row[PC_COLS.eligibilityYearsUsed];
    const yearsNum = Number(yearsUsed) || 0;
    const playerName = row[PC_COLS.playerName];
    const traditionalRedshirt = row[PC_COLS.traditionalRedshirtUsed] === true || row[PC_COLS.traditionalRedshirtUsed] === "TRUE";
    const medicalRedshirt = row[PC_COLS.medicalRedshirtUsed] === true || row[PC_COLS.medicalRedshirtUsed] === "TRUE";
    const declaredEarly = row[PC_COLS.declaredEarly] === true || row[PC_COLS.declaredEarly] === "TRUE";
    const retentionDecision = String(row[PC_COLS.retentionDecision] || "").toUpperCase().trim();

    // Track distribution
    yearsDist[yearsNum] = (yearsDist[yearsNum] || 0) + 1;

    if (active) {
      totalActive++;
      activeByYears[yearsNum] = (activeByYears[yearsNum] || 0) + 1;
    }

    if (franchiseId && franchiseId !== "000") {
      totalOwned++;
      ownedByYears[yearsNum] = (ownedByYears[yearsNum] || 0) + 1;
    }

    if (yearsUsed === null || yearsUsed === "" || yearsUsed === undefined || yearsNum === 0) {
      nullOrZeroYears++;
    }

    // Track players for detailed inspection
    if (active && franchiseId !== "000") {
      // Calculate calendar max (for display) and playing max (for graduation check)
      let calendarMax = config.eligibility.maxYears;
      if (traditionalRedshirt) calendarMax++;
      if (medicalRedshirt) calendarMax++;
      const playingMax = config.eligibility.maxYears; // 4 playing years for everyone

      // Player is in their final playing year if: yearsUsed + 1 >= playingMax
      // Note: yearsUsed is already in "playing years" (redshirts subtracted)
      const isFinalYear = yearsNum + 1 >= playingMax;

      playersWithThreePlusYears.push({
        name: playerName,
        years: yearsNum,
        currentYear: yearsNum + 1,  // The playing year they're currently in
        maxElig: playingMax,        // Max playing years (4)
        calendarMax: calendarMax,   // Max calendar years (4 + redshirts)
        isFinalYear: isFinalYear,
        isEarlyDeclare: declaredEarly,
        isReleasing: retentionDecision === "RELEASE",
        redshirts: (traditionalRedshirt ? "T" : "") + (medicalRedshirt ? "M" : "") || "none"
      });
    }
  });

  // Log overall stats
  Logger.log(`OVERALL STATS:`);
  Logger.log(`  Total rows: ${totalRows}`);
  Logger.log(`  Total active: ${totalActive}`);
  Logger.log(`  Total owned (non-000): ${totalOwned}`);
  Logger.log(`  Null/zero eligibilityYearsUsed: ${nullOrZeroYears}`);

  // Log distribution of eligibilityYearsUsed
  Logger.log(`\nELIGIBILITY YEARS DISTRIBUTION (all players):`);
  Object.keys(yearsDist).sort((a, b) => Number(a) - Number(b)).forEach(years => {
    Logger.log(`  ${years} years: ${yearsDist[years]} players`);
  });

  // Log distribution for active players only
  Logger.log(`\nELIGIBILITY YEARS DISTRIBUTION (active only):`);
  Object.keys(activeByYears).sort((a, b) => Number(a) - Number(b)).forEach(years => {
    Logger.log(`  ${years} years: ${activeByYears[years]} players`);
  });

  // Log distribution for owned players only
  Logger.log(`\nELIGIBILITY YEARS DISTRIBUTION (owned, non-000):`);
  Object.keys(ownedByYears).sort((a, b) => Number(a) - Number(b)).forEach(years => {
    Logger.log(`  ${years} years: ${ownedByYears[years]} players`);
  });

  // Log all active owned players
  Logger.log(`\nACTIVE & OWNED PLAYERS: ${playersWithThreePlusYears.length}`);

  if (playersWithThreePlusYears.length === 0) {
    Logger.log(`  NONE FOUND - Check if players are marked as active and owned.`);
  } else {
    // Group by status
    const finalYear = playersWithThreePlusYears.filter(p => p.isFinalYear && !p.isEarlyDeclare && !p.isReleasing);
    const earlyDeclare = playersWithThreePlusYears.filter(p => p.isEarlyDeclare);
    const releasing = playersWithThreePlusYears.filter(p => p.isReleasing && !p.isEarlyDeclare);
    const notFinalYear = playersWithThreePlusYears.filter(p => !p.isFinalYear && !p.isEarlyDeclare && !p.isReleasing);

    Logger.log(`\n  🎓 IN FINAL YEAR (will graduate): ${finalYear.length}`);
    finalYear.slice(0, 15).forEach(p => {
      Logger.log(`    ${p.name}: Year ${p.currentYear}/${p.maxElig}, redshirts: ${p.redshirts}`);
    });
    if (finalYear.length > 15) Logger.log(`    ... and ${finalYear.length - 15} more`);

    Logger.log(`\n  📣 EARLY DECLARES: ${earlyDeclare.length}`);
    earlyDeclare.slice(0, 10).forEach(p => {
      Logger.log(`    ${p.name}: Year ${p.currentYear}/${p.maxElig}, redshirts: ${p.redshirts}`);
    });
    if (earlyDeclare.length > 10) Logger.log(`    ... and ${earlyDeclare.length - 10} more`);

    Logger.log(`\n  🚀 RELEASING (pending): ${releasing.length}`);
    releasing.slice(0, 10).forEach(p => {
      Logger.log(`    ${p.name}: Year ${p.currentYear}/${p.maxElig}, redshirts: ${p.redshirts}`);
    });
    if (releasing.length > 10) Logger.log(`    ... and ${releasing.length - 10} more`);

    Logger.log(`\n  ⏳ NOT IN FINAL YEAR (still have eligibility): ${notFinalYear.length}`);
    // Show distribution by current year
    const byCurrentYear = {};
    notFinalYear.forEach(p => {
      byCurrentYear[p.currentYear] = (byCurrentYear[p.currentYear] || 0) + 1;
    });
    Object.keys(byCurrentYear).sort((a, b) => Number(a) - Number(b)).forEach(yr => {
      Logger.log(`    Year ${yr}: ${byCurrentYear[yr]} players`);
    });
  }

  Logger.log(`\n=== END DIAGNOSIS ===`);
}

/**
 * Menu function to run eligibility diagnosis
 */
function menuDiagnoseEligibility() {
  diagnoseEligibilityData();

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Eligibility Diagnosis Complete',
    'Check the Logs (View > Logs) for detailed analysis of:\n\n' +
    '• Distribution of eligibilityYearsUsed values\n' +
    '• Active vs owned player counts\n' +
    '• Players with 3+ years (draft-eligible candidates)\n' +
    '• Graduating vs not-yet-graduating breakdown',
    ui.ButtonSet.OK
  );
}

/**
 * Diagnose why specific player copies aren't appearing in the draft
 * @param {Array} copyIds - Array of copyIds to check (e.g., ["PC-15237-B10-1", "PC-15237-B10-2"])
 */
function diagnoseSpecificPlayers(copyIds) {
  const config = getConfig();
  const year = Number(getLeagueYear());
  const pcSheet = getPlayerCopiesSheet();
  const data = pcSheet.getDataRange().getValues();
  const maxYears = config.eligibility.maxYears;
  const minYearsForDeclaration = config.declarations.minYearsForDeclaration;

  Logger.log(`\n=== DIAGNOSING SPECIFIC PLAYERS ===`);
  Logger.log(`Looking for: ${copyIds.join(", ")}\n`);

  copyIds.forEach(targetCopyId => {
    Logger.log(`--- ${targetCopyId} ---`);

    // Find the row
    let found = false;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const copyId = row[PC_COLS.copyId];

      if (copyId === targetCopyId) {
        found = true;

        // Extract all relevant fields
        const playerId = row[PC_COLS.playerId];
        const playerName = row[PC_COLS.playerName];
        const conference = row[PC_COLS.conference];
        const franchiseId = String(row[PC_COLS.currentFranchiseId] || "").padStart(3, "0");
        const eligibilityYearsUsed = Number(row[PC_COLS.eligibilityYearsUsed]) || 0;
        const traditionalRedshirt = row[PC_COLS.traditionalRedshirtUsed] === true || row[PC_COLS.traditionalRedshirtUsed] === "TRUE";
        const medicalRedshirt = row[PC_COLS.medicalRedshirtUsed] === true || row[PC_COLS.medicalRedshirtUsed] === "TRUE";
        const active = row[PC_COLS.active] === true || row[PC_COLS.active] === "TRUE";
        const declaredEarly = row[PC_COLS.declaredEarly] === true || row[PC_COLS.declaredEarly] === "TRUE";
        const declarationYear = Number(row[PC_COLS.declarationYear]) || 0;
        const nationalAwards = Number(row[PC_COLS.nationalAwards]) || 0;
        const allConfAwards = Number(row[PC_COLS.allConferenceAwards]) || 0;
        const retentionDecision = String(row[PC_COLS.retentionDecision] || "").toUpperCase().trim();

        // Calculate calendar max eligibility (for display)
        let maxEligibility = maxYears;
        if (traditionalRedshirt) maxEligibility++;
        if (medicalRedshirt) maxEligibility++;

        // Log raw values
        Logger.log(`  Player: ${playerName} (${playerId})`);
        Logger.log(`  Conference: ${conference}`);
        Logger.log(`  Raw values from sheet:`);
        Logger.log(`    CurrentFranchiseID: "${row[PC_COLS.currentFranchiseId]}" -> padded: "${franchiseId}"`);
        Logger.log(`    Active: ${row[PC_COLS.active]} -> parsed: ${active}`);
        Logger.log(`    EligibilityYearsUsed: ${row[PC_COLS.eligibilityYearsUsed]} -> parsed: ${eligibilityYearsUsed}`);
        Logger.log(`    TraditionalRedshirt: ${row[PC_COLS.traditionalRedshirtUsed]} -> parsed: ${traditionalRedshirt}`);
        Logger.log(`    MedicalRedshirt: ${row[PC_COLS.medicalRedshirtUsed]} -> parsed: ${medicalRedshirt}`);
        Logger.log(`    DeclaredEarly: ${row[PC_COLS.declaredEarly]} -> parsed: ${declaredEarly}`);
        Logger.log(`    DeclarationYear: ${row[PC_COLS.declarationYear]} -> parsed: ${declarationYear}`);
        Logger.log(`    NationalAwards: ${row[PC_COLS.nationalAwards]} -> parsed: ${nationalAwards}`);
        Logger.log(`    AllConferenceAwards: ${row[PC_COLS.allConferenceAwards]} -> parsed: ${allConfAwards}`);
        Logger.log(`    RetentionDecision: "${row[PC_COLS.retentionDecision]}" -> parsed: "${retentionDecision}"`);

        // Log calculated values
        Logger.log(`  Calculated values:`);
        Logger.log(`    MaxCalendarYears: ${maxEligibility} (base ${maxYears} + ${traditionalRedshirt ? 1 : 0} trad RS + ${medicalRedshirt ? 1 : 0} med RS)`);
        Logger.log(`    MaxPlayingYears: ${maxYears} (everyone gets 4 playing years)`);
        Logger.log(`    Playing years used: ${eligibilityYearsUsed} (calendar years - redshirts)`);
        Logger.log(`    After this season: ${eligibilityYearsUsed + 1} playing years`);
        Logger.log(`    Is final playing year? ${eligibilityYearsUsed + 1 >= maxYears} (${eligibilityYearsUsed + 1} >= ${maxYears})`);

        // Check each exclusion reason
        Logger.log(`  Eligibility checks:`);

        // Check 1: Owner
        if (!franchiseId || franchiseId === "000") {
          Logger.log(`    ❌ EXCLUDED: No owner (franchiseId = "${franchiseId}")`);
        } else {
          Logger.log(`    ✓ Has owner: ${franchiseId}`);
        }

        // Check 2: Active
        const isEarlyDeclare = declaredEarly && declarationYear === year;
        if (!active && !isEarlyDeclare) {
          Logger.log(`    ❌ EXCLUDED: Not active (active = ${active}, isEarlyDeclare = ${isEarlyDeclare})`);
        } else {
          Logger.log(`    ✓ Is active or early declare`);
        }

        // Check draft reason
        // Note: Graduation check uses maxYears (4), not maxEligibility, because
        // eligibilityYearsUsed is already in "playing years" (redshirts subtracted)
        let draftReason = null;
        if (isEarlyDeclare) {
          draftReason = "EARLY_DECLARE";
        } else if (retentionDecision === "RELEASE") {
          draftReason = "RELEASING";
        } else if (eligibilityYearsUsed + 1 >= maxYears) {
          draftReason = "GRADUATING";
        } else {
          const totalProgramYears = eligibilityYearsUsed + (traditionalRedshirt ? 1 : 0) + (medicalRedshirt ? 1 : 0);
          if (totalProgramYears + 1 >= minYearsForDeclaration) {
            const hasNationalAward = nationalAwards >= 1;
            const hasTwoAllConf = allConfAwards >= 2;
            if (hasNationalAward || hasTwoAllConf) {
              draftReason = "COULD_DECLARE";
            }
          }
        }

        if (draftReason) {
          Logger.log(`    ✓ Draft reason: ${draftReason}`);
        } else {
          const totalProgramYears = eligibilityYearsUsed + (traditionalRedshirt ? 1 : 0) + (medicalRedshirt ? 1 : 0);
          Logger.log(`    ❌ NO DRAFT REASON - Not eligible`);
          Logger.log(`      - Not early declared this year`);
          Logger.log(`      - Not releasing (retentionDecision = "${retentionDecision}")`);
          Logger.log(`      - Not graduating (${eligibilityYearsUsed + 1} < ${maxYears} playing years)`);
          if (totalProgramYears + 1 >= minYearsForDeclaration) {
            Logger.log(`      - Will have 3+ program years but no qualifying awards (nat: ${nationalAwards}, allConf: ${allConfAwards})`);
          } else {
            Logger.log(`      - Only ${totalProgramYears} program years (${eligibilityYearsUsed} playing + redshirts, ${totalProgramYears + 1} after this season), need ${minYearsForDeclaration}+ for early declaration`);
          }
        }

        Logger.log(``);
        break;
      }
    }

    if (!found) {
      Logger.log(`  ❌ NOT FOUND in PlayerCopies sheet!`);
      Logger.log(``);
    }
  });

  Logger.log(`=== END DIAGNOSIS ===`);
}

/**
 * Quick diagnostic for Trevor Lawrence copies
 * Run this from Apps Script to see why they're not appearing
 */
function diagnoseTrevorLawrence() {
  diagnoseSpecificPlayers([
    "PC-15237-B10-1",
    "PC-15237-B10-2"
  ]);
}
