/**
 * RECRUITING BONUS DOLLARS TRACKING
 * Calculate and track bonus recruiting dollars based on performance
 *
 * Bonus Sources:
 * - Regular Season Wins: $1 per win (max 12)
 * - Postseason Wins: $2 per win (any game Week 13+)
 * - National Position Awards: $5 per player winning National_QB/RB/WR_TE (rank 1)
 * - Heisman Award: $5 per player winning Heisman
 * - 1st Team All-Conference: $5 per player
 * - 2nd Team All-Conference: $4 per player
 * - 3rd Team All-Conference: $3 per player
 * - Rivalry Wagers: Winner takes wager amount from loser (+$X / -$X)
 * - Draft Bonus: Bonus $ for graduating/declaring players based on MFL position rank
 * - Retention Costs: Subtracted when a team retains a draft-eligible player instead of releasing
 *   - National award path: $20 first retention, $30 subsequent
 *   - All-Conference path: $10 first retention, $20 subsequent
 *   - Retained players lose their draft bonus; released players keep theirs
 *
 * Note: NationalPosition columns track National Player Awards (National_QB, National_RB, National_WR_TE rank 1).
 *
 * SETUP REQUIRED: Create "Rivalries" tab in league sheet with IMPORTRANGE from scheduler sheet:
 *   =IMPORTRANGE("SCHEDULER_SHEET_ID", "Rivalries!A:K")
 */

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate recruiting bonus dollars for all teams
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Calculate through this week
 */
function calculateRecruitingDollars(year, throughWeek) {
  const config = getConfig();
  const dollarsConfig = config.recruitingDollars;

  Logger.log(`=== CALCULATING RECRUITING DOLLARS FOR ${year} (Through Week ${throughWeek}) ===`);

  // Determine status
  const status = throughWeek >= 17 ? "FINAL" : "PROJECTED";
  Logger.log(`Status: ${status}`);

  // Step 1: Get franchise data (ID, name, conference)
  Logger.log("\n--- Step 1: Loading Franchise Data ---");
  const franchiseData = getFranchiseData();
  Logger.log(`  Loaded ${Object.keys(franchiseData).length} franchises`);

  // Step 2: Get regular season wins from PowerRankings
  Logger.log("\n--- Step 2: Getting Regular Season Wins ---");
  const regularSeasonWins = getRegularSeasonWinsFromRankings(year);
  Logger.log(`  Loaded regular season wins for ${Object.keys(regularSeasonWins).length} teams`);

  // Step 3: Get postseason wins (Week 13+)
  Logger.log("\n--- Step 3: Getting Postseason Wins ---");
  const postseasonRecords = calculatePostseasonRecords(year, throughWeek);
  Logger.log(`  Calculated postseason records for ${Object.keys(postseasonRecords).length} teams`);

  // Step 4: Count awards by team
  Logger.log("\n--- Step 4: Counting Awards by Team ---");
  const awardCounts = countAwardsByTeam(year);
  Logger.log(`  Counted awards for ${Object.keys(awardCounts).length} teams`);

  // Step 5: National Position Awards are already counted in Step 4
  // (National_QB, National_RB, National_WR_TE with rank 1)
  Logger.log("\n--- Step 5: National Position Awards (from Step 4) ---");
  const teamsWithNatPosition = Object.entries(awardCounts).filter(([_, c]) => c.nationalPosition > 0).length;
  Logger.log(`  ${teamsWithNatPosition} teams have national position award winners`)

  // Step 6: Calculate rivalry wager outcomes
  Logger.log("\n--- Step 6: Calculating Rivalry Wager Outcomes ---");
  const wagerOutcomes = calculateRivalryWagerOutcomes(year, throughWeek);
  const teamsWithWagers = Object.keys(wagerOutcomes).filter(k => wagerOutcomes[k].net !== 0).length;
  Logger.log(`  Calculated wager outcomes for ${teamsWithWagers} teams with non-zero results`);

  // Step 7: Get draft bonuses and retention data (only for final rankings, Week 17+)
  Logger.log("\n--- Step 7: Getting Draft Bonuses & Retention Data ---");
  let draftBonuses = {};
  let retentionData = { byTeam: {}, allRetainedCopyIds: new Set() };

  if (throughWeek >= 17) {
    // Initialize draft bonuses for all franchises
    Object.keys(franchiseData).forEach(fId => {
      draftBonuses[fId] = { count: 0, dollars: 0 };
    });

    // Load retention data first (to get exclusion list for draft bonuses)
    try {
      retentionData = getRetentionDataByTeam(year);
      const teamsWithRetention = Object.entries(retentionData.byTeam)
        .filter(([_, d]) => d.retentionCost > 0).length;
      Logger.log(`  Loaded retention data: ${teamsWithRetention} teams with costs, ` +
                 `${retentionData.allRetainedCopyIds.size} retained copyIds`);
    } catch (error) {
      Logger.log(`  Retention data not available: ${error.message}`);
    }

    // Get draft bonuses, excluding retained players
    try {
      draftBonuses = getDraftBonusesByTeam(year, retentionData.allRetainedCopyIds);
      const teamsWithDraftBonus = Object.entries(draftBonuses).filter(([_, d]) => d.dollars > 0).length;
      Logger.log(`  Loaded draft bonuses for ${teamsWithDraftBonus} teams (after retention exclusions)`);
    } catch (error) {
      Logger.log(`  Draft bonuses not available: ${error.message}`);
      Logger.log(`  Run calculateTheoreticalDraft(${year}) to calculate draft bonuses`);
    }
  } else {
    Logger.log(`  Draft bonuses and retention only calculated for final rankings (Week 17+)`);
    // Initialize empty draft bonuses
    Object.keys(franchiseData).forEach(fId => {
      draftBonuses[fId] = { count: 0, dollars: 0 };
    });
  }

  // Step 8: Calculate dollars for each team
  Logger.log("\n--- Step 8: Calculating Bonus Dollars ---");
  const rows = [];
  const now = new Date();

  Object.entries(franchiseData).forEach(([franchiseId, franchise]) => {
    const regWins = regularSeasonWins[franchiseId] || 0;
    const postWins = postseasonRecords[franchiseId]?.wins || 0;
    const awards = awardCounts[franchiseId] || {};
    const wagers = wagerOutcomes[franchiseId] || { won: 0, lost: 0, net: 0 };
    const draft = draftBonuses[franchiseId] || { count: 0, dollars: 0 };
    const retention = retentionData.byTeam[franchiseId] || { retentionCount: 0, retentionCost: 0 };

    // Calculate dollar amounts
    const regSeasonDollars = regWins * dollarsConfig.regularSeasonWinValue;
    const postseasonDollars = postWins * dollarsConfig.postseasonWinValue;

    // National Position Awards (National_QB, National_RB, National_WR_TE rank 1)
    const ncCount = awards.nationalPosition || 0;
    const ncDollars = ncCount * dollarsConfig.nationalChampionshipValue;

    // Award counts
    const heismanCount = awards.heisman || 0;
    const firstTeamCount = awards.firstTeam || 0;
    const secondTeamCount = awards.secondTeam || 0;
    const thirdTeamCount = awards.thirdTeam || 0;

    // Award dollars
    const heismanDollars = heismanCount * dollarsConfig.heismanValue;
    const firstTeamDollars = firstTeamCount * dollarsConfig.firstTeamAllConfValue;
    const secondTeamDollars = secondTeamCount * dollarsConfig.secondTeamAllConfValue;
    const thirdTeamDollars = thirdTeamCount * dollarsConfig.thirdTeamAllConfValue;

    // Rivalry wager net (can be positive or negative)
    const wagerWon = wagers.won;
    const wagerLost = wagers.lost;
    const wagerNet = wagers.net;

    // Draft bonus (graduating/declaring players - excludes retained)
    const draftBonusCount = draft.count;
    const draftBonusDollars = draft.dollars;

    // Retention costs (retained players pay cost instead of earning draft bonus)
    const retentionCount = retention.retentionCount;
    const retentionCostDollars = retention.retentionCost;

    // Total = bonuses + adjusted draft bonuses - retention costs
    const totalDollars = regSeasonDollars + postseasonDollars + ncDollars +
                         heismanDollars + firstTeamDollars + secondTeamDollars + thirdTeamDollars +
                         wagerNet + draftBonusDollars - retentionCostDollars;

    rows.push([
      year,
      franchiseId,
      franchise.name,
      franchise.conference,
      regWins,
      regSeasonDollars,
      postWins,
      postseasonDollars,
      ncCount,
      ncDollars,
      heismanCount,
      heismanDollars,
      firstTeamCount,
      firstTeamDollars,
      secondTeamCount,
      secondTeamDollars,
      thirdTeamCount,
      thirdTeamDollars,
      wagerWon,
      wagerLost,
      wagerNet,
      draftBonusCount,
      draftBonusDollars,
      retentionCount,
      retentionCostDollars,
      totalDollars,
      now,
      status
    ]);
  });

  Logger.log(`  Calculated dollars for ${rows.length} teams`);

  // Step 9: Write to sheet
  Logger.log("\n--- Step 9: Writing to Sheet ---");
  writeRecruitingDollarsToSheet(year, rows);

  Logger.log(`\n=== RECRUITING DOLLARS CALCULATION COMPLETE ===`);
}

// ============================================================================
// DATA GATHERING FUNCTIONS
// ============================================================================

/**
 * Get franchise data from FranchiseLookup sheet
 * @returns {Object} - Map of franchiseId -> { name, conference }
 */
function getFranchiseData() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) {
    throw new Error("FranchiseLookup sheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idIdx = headers.indexOf("Franchise ID");
  const nameIdx = headers.indexOf("Team Name");
  const confIdx = headers.indexOf("Conference");

  if (idIdx === -1 || nameIdx === -1 || confIdx === -1) {
    throw new Error("Required columns not found in FranchiseLookup");
  }

  const franchiseData = {};

  data.slice(1).forEach(row => {
    const franchiseId = String(Number(row[idIdx] || 0)).padStart(3, "0");
    const name = String(row[nameIdx] || "").trim();
    const conference = String(row[confIdx] || "").trim();

    if (franchiseId !== "000" && name) {
      franchiseData[franchiseId] = { name, conference };
    }
  });

  return franchiseData;
}

/**
 * Get regular season wins from PowerRankings sheet
 * Uses the most recent week's data for each team
 *
 * NOTE: PowerRankings only stores the current week's data (clears each run).
 * The RegularSeasonWins column already contains cumulative wins through the current week
 * (automatically capped at 12 regular season games by the rankings calculation).
 *
 * @param {String|Number} year - Season year
 * @returns {Object} - Map of franchiseId -> regular season wins
 */
function getRegularSeasonWinsFromRankings(year) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("PowerRankings");

  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("  PowerRankings sheet not found or empty");
    return {};
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Build column map
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  // Filter to this year
  const yearData = data.slice(1).filter(row =>
    Number(row[colMap["Year"]]) === Number(year)
  );

  if (yearData.length === 0) {
    Logger.log(`  No PowerRankings data found for ${year}`);
    return {};
  }

  // Find the maximum week in the data for logging purposes
  const maxWeek = Math.max(...yearData.map(row => Number(row[colMap["Week"]])));
  Logger.log(`  PowerRankings has Week ${maxWeek} data`);

  // PowerRankings only stores current week data, so use all rows for this year
  // The RegularSeasonWins column already has cumulative wins (capped at 12 games)
  const wins = {};
  yearData.forEach(row => {
    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    wins[franchiseId] = Number(row[colMap["RegularSeasonWins"]] || 0);
  });

  Logger.log(`  Retrieved regular season wins for ${Object.keys(wins).length} teams`);
  return wins;
}

/**
 * Count awards by team from Awards sheet
 * @param {String|Number} year - Season year
 * @returns {Object} - Map of franchiseId -> { heisman, nationalPosition, firstTeam, secondTeam, thirdTeam }
 */
function countAwardsByTeam(year) {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.awards);

  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("  Awards sheet not found or empty");
    return {};
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Build column map
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  // Filter to this year
  const yearData = data.slice(1).filter(row =>
    Number(row[colMap["Year"]]) === Number(year)
  );

  // Count awards by franchise
  const counts = {};

  yearData.forEach(row => {
    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const awardType = String(row[colMap["AwardType"]] || "");
    const rank = Number(row[colMap["Rank"]] || 0);

    if (!counts[franchiseId]) {
      counts[franchiseId] = {
        heisman: 0,
        nationalPosition: 0,  // National_QB, National_RB, National_WR_TE (rank 1 only)
        firstTeam: 0,
        secondTeam: 0,
        thirdTeam: 0
      };
    }

    // Heisman winner (rank 1)
    if (awardType === "Heisman" && rank === 1) {
      counts[franchiseId].heisman++;
    }

    // National positional awards (National_QB, National_RB, National_WR_TE) - rank 1 only
    if (awardType.startsWith("National_") && rank === 1) {
      counts[franchiseId].nationalPosition++;
    }

    // All-Conference awards (pattern: AllConf_{Conference}_{Team})
    if (awardType.startsWith("AllConf_")) {
      if (awardType.endsWith("_1st")) {
        counts[franchiseId].firstTeam++;
      } else if (awardType.endsWith("_2nd")) {
        counts[franchiseId].secondTeam++;
      } else if (awardType.endsWith("_3rd")) {
        counts[franchiseId].thirdTeam++;
      }
    }
  });

  return counts;
}

// ============================================================================
// RETENTION DATA FUNCTIONS
// ============================================================================

/**
 * Get retention data from RetentionHistory sheet for recruiting dollars integration
 * Returns retention costs per team and set of copyIds to exclude from draft bonuses
 *
 * For RETAIN/AUTO_RETAIN: player loses draft bonus, retention cost applied
 * For RELEASE: player keeps draft bonus, no retention cost
 *
 * @param {String|Number} year - Season year
 * @returns {Object} - {
 *   byTeam: Map of franchiseId -> { retentionCount, retentionCost, retainedCopyIds: Set },
 *   allRetainedCopyIds: Set of all retained copyIds
 * }
 */
function getRetentionDataByTeam(year) {
  const result = {
    byTeam: {},
    allRetainedCopyIds: new Set()
  };

  // Initialize all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    result.byTeam[fId] = { retentionCount: 0, retentionCost: 0, retainedCopyIds: new Set() };
  });

  // Load RetentionHistory sheet
  let sheet;
  try {
    sheet = getRetentionHistorySheet();
  } catch (e) {
    Logger.log(`  RetentionHistory sheet not available: ${e.message}`);
    return result;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("  RetentionHistory sheet is empty");
    return result;
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const yearCol = colMap["Year"];
  const copyIdCol = colMap["CopyId"];
  const franchiseCol = colMap["FranchiseId"];
  const decisionCol = colMap["Decision"];
  const costCol = colMap["RetentionCost"];

  if (yearCol === undefined || copyIdCol === undefined || decisionCol === undefined) {
    Logger.log("  RetentionHistory missing required columns");
    return result;
  }

  let retainCount = 0;
  let releaseCount = 0;

  data.slice(1).forEach(row => {
    const rowYear = Number(row[yearCol]);
    if (rowYear !== Number(year)) return;

    const decision = String(row[decisionCol] || "").toUpperCase().trim();
    const franchiseId = String(row[franchiseCol] || "").padStart(3, "0");
    const copyId = String(row[copyIdCol] || "");
    const cost = Number(row[costCol]) || 0;

    if (decision === "RETAIN" || decision === "AUTO_RETAIN") {
      if (result.byTeam[franchiseId]) {
        result.byTeam[franchiseId].retentionCount++;
        result.byTeam[franchiseId].retentionCost += cost;
        result.byTeam[franchiseId].retainedCopyIds.add(copyId);
      }
      result.allRetainedCopyIds.add(copyId);
      retainCount++;
    } else if (decision === "RELEASE") {
      releaseCount++;
    }
  });

  Logger.log(`  RetentionHistory for ${year}: ${retainCount} retained, ${releaseCount} released`);
  return result;
}

// ============================================================================
// RIVALRY WAGER FUNCTIONS
// ============================================================================

/**
 * Calculate rivalry wager outcomes by cross-referencing Rivalries with ScheduleResults
 * Winner gets +wager, loser gets -wager (zero-sum)
 *
 * REQUIRES: "Rivalries" sheet in league workbook (use IMPORTRANGE from scheduler sheet)
 *
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Calculate through this week
 * @returns {Object} - Map of franchiseId -> { won: $, lost: $, net: $ }
 */
function calculateRivalryWagerOutcomes(year, throughWeek) {
  const outcomes = {}; // franchiseId -> { won, lost, net }

  // Initialize all franchises with zero
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    outcomes[fId] = { won: 0, lost: 0, net: 0 };
  });

  // Load rivalries from Rivalries sheet (should be IMPORTRANGE from scheduler)
  // Only include rivalries confirmed in this year or earlier
  const rivalries = loadRivalriesFromLeagueSheet(year);
  if (rivalries.length === 0) {
    Logger.log("  No rivalries found (Rivalries sheet may not exist or be empty)");
    return outcomes;
  }

  Logger.log(`  Found ${rivalries.length} confirmed rivalries`);

  // Load game results from ScheduleResults
  const gameResults = loadGameResultsForRivalries(year, throughWeek);
  Logger.log(`  Loaded ${Object.keys(gameResults).length} game results`);

  // Process each rivalry
  rivalries.forEach(rivalry => {
    const { teamA, teamB, wager } = rivalry;

    if (wager <= 0) return; // No wager, skip

    // Find the game result between these teams
    // Check both directions: A vs B and B vs A
    const matchKey1 = `${teamA}-${teamB}`;
    const matchKey2 = `${teamB}-${teamA}`;

    let result = gameResults[matchKey1] || gameResults[matchKey2];

    if (!result) {
      Logger.log(`  Rivalry ${teamA} vs ${teamB}: Game not played yet (wager: $${wager})`);
      return;
    }

    // Determine winner and loser
    let winner, loser;
    if (result.winner === teamA) {
      winner = teamA;
      loser = teamB;
    } else if (result.winner === teamB) {
      winner = teamB;
      loser = teamA;
    } else {
      // Tie - no wager changes
      Logger.log(`  Rivalry ${teamA} vs ${teamB}: Tied (wager: $${wager} - no transfer)`);
      return;
    }

    // Apply wager
    outcomes[winner].won += wager;
    outcomes[winner].net += wager;
    outcomes[loser].lost += wager;
    outcomes[loser].net -= wager;

    Logger.log(`  Rivalry ${teamA} vs ${teamB}: ${winner} won $${wager}`);
  });

  return outcomes;
}

/**
 * Load confirmed rivalries from the Rivalries sheet in the league workbook
 * This sheet should be populated via IMPORTRANGE from the scheduler workbook
 * Only includes rivalries confirmed in the specified year or earlier
 *
 * Expected columns: Team A | Team A Name | Team B | Team B Name | Rivalry Name | Wager | Type | Status | Submitted
 *
 * @param {String|Number} [year] - Only include rivalries confirmed in this year or earlier
 * @returns {Array} - Array of { teamA, teamB, wager } objects (confirmed, year-filtered)
 */
function loadRivalriesFromLeagueSheet(year) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("Rivalries");

  if (!sheet) {
    Logger.log("  Rivalries sheet not found - create it with IMPORTRANGE from scheduler sheet");
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Find columns (flexible naming)
  const teamACol = colMap["Team A"] ?? colMap["TeamA"] ?? 0;
  const teamBCol = colMap["Team B"] ?? colMap["TeamB"] ?? 2;
  const wagerCol = colMap["Wager"] ?? colMap["Wager Amount"] ?? -1;
  const statusCol = colMap["Status"] ?? -1;
  const submittedCol = colMap["Submitted"] ?? -1;

  if (submittedCol === -1) {
    Logger.log(`  WARNING: "Submitted" column not found in Rivalries sheet - year filter disabled`);
  }

  // Deduplicate reciprocal entries (challenge row + confirmation row = same rivalry)
  const seen = new Set();
  let skippedByYear = 0;

  return data.slice(1)
    .filter(row => {
      // Must have both teams
      if (!row[teamACol] || !row[teamBCol]) return false;
      // Must be confirmed (if status column exists)
      if (statusCol !== -1 && String(row[statusCol]).toUpperCase() !== "CONFIRMED") return false;
      // Must be confirmed in the calculation year or earlier (Submitted is overwritten with confirmation time)
      if (submittedCol !== -1 && year) {
        const submitted = String(row[submittedCol] || "").trim();
        if (submitted) {
          const submittedYear = Number(submitted.substring(0, 4));
          if (!isNaN(submittedYear) && submittedYear > Number(year)) {
            skippedByYear++;
            return false;
          }
        }
      }
      // Deduplicate: normalize matchup key so A-B and B-A are the same rivalry
      const a = String(Number(row[teamACol]) || row[teamACol]).padStart(3, "0");
      const b = String(Number(row[teamBCol]) || row[teamBCol]).padStart(3, "0");
      const matchupKey = [a, b].sort().join("-");
      if (seen.has(matchupKey)) return false;
      seen.add(matchupKey);
      return true;
    })
    .map(row => ({
      teamA: String(Number(row[teamACol]) || row[teamACol]).padStart(3, "0"),
      teamB: String(Number(row[teamBCol]) || row[teamBCol]).padStart(3, "0"),
      wager: wagerCol !== -1 ? Number(row[wagerCol]) || 0 : 0
    }));
}

/**
 * Load game results from ScheduleResults for rivalry matching
 * Creates a map of "teamA-teamB" -> { winner, teamAScore, teamBScore }
 *
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Load results through this week
 * @returns {Object} - Map of matchup key -> result object
 */
function loadGameResultsForRivalries(year, throughWeek) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("ScheduleResults");

  if (!sheet || sheet.getLastRow() <= 1) {
    return {};
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const results = {};

  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);

    if (rowYear !== Number(year)) return;
    if (rowWeek > throughWeek) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const opponentId = String(row[colMap["OpponentID"]] || "").padStart(3, "0");
    const gameResult = String(row[colMap["GameResult"]] || "");
    const teamScore = Number(row[colMap["TeamScore"]] || 0);
    const opponentScore = Number(row[colMap["OpponentScore"]] || 0);

    if (!opponentId || opponentId === "000" || gameResult === "BYE") return;

    // Create matchup key (always from this team's perspective)
    const matchKey = `${franchiseId}-${opponentId}`;

    // Determine winner
    let winner = null;
    if (gameResult === "W") {
      winner = franchiseId;
    } else if (gameResult === "L") {
      winner = opponentId;
    } else if (teamScore > opponentScore) {
      winner = franchiseId;
    } else if (opponentScore > teamScore) {
      winner = opponentId;
    }
    // If tie, winner stays null

    results[matchKey] = {
      winner: winner,
      teamAScore: teamScore,
      teamBScore: opponentScore
    };
  });

  return results;
}

// ============================================================================
// SHEET MANAGEMENT
// ============================================================================

/**
 * Get or create the RecruitingDollars sheet with proper headers
 * @returns {Sheet} - The RecruitingDollars sheet
 */
function getRecruitingDollarsSheet() {
  const config = getConfig();
  const headers = [
    "Year",
    "FranchiseID",
    "TeamName",
    "Conference",
    "RegularSeasonWins",
    "RegSeasonDollars",
    "PostseasonWins",
    "PostseasonDollars",
    "NationalPositionCount",
    "NationalPositionDollars",
    "HeismanCount",
    "HeismanDollars",
    "FirstTeamCount",
    "FirstTeamDollars",
    "SecondTeamCount",
    "SecondTeamDollars",
    "ThirdTeamCount",
    "ThirdTeamDollars",
    "WagerWon",
    "WagerLost",
    "WagerNet",
    "DraftBonusCount",
    "DraftBonusDollars",
    "RetentionCount",
    "RetentionCostDollars",
    "TotalBonusDollars",
    "LastCalculated",
    "Status"
  ];

  return getOrCreateSheet(config.sheets.recruitingDollars, headers);
}

/**
 * Write recruiting dollars data to sheet
 * Clears existing data for the year and writes new data
 * @param {String|Number} year - Season year
 * @param {Array} rows - Array of row data to write
 */
function writeRecruitingDollarsToSheet(year, rows) {
  const sheet = getRecruitingDollarsSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Get existing data
  const existingData = sheet.getDataRange().getValues();

  // Keep rows from other years, padding old rows to match new header length
  const expectedCols = headers.length;
  const rowsToKeep = existingData.slice(1)
    .filter(row => Number(row[0]) !== Number(year))
    .map(row => {
      if (row.length < expectedCols) {
        // Old rows missing RetentionCount/RetentionCostDollars columns (added at index 23-24)
        // Insert 0, 0 before TotalBonusDollars (which was at index 23 in old layout)
        const padded = [...row];
        if (padded.length === 26) {
          // Old 26-col layout: insert retention columns before TotalBonusDollars (index 23)
          padded.splice(23, 0, 0, 0);
        } else {
          // Unknown old layout: pad with empty values
          while (padded.length < expectedCols) padded.push("");
        }
        return padded;
      }
      return row;
    });

  // Clear sheet (except header)
  if (existingData.length > 1) {
    sheet.getRange(2, 1, existingData.length - 1, headers.length).clearContent();
  }

  // Write back rows from other years
  if (rowsToKeep.length > 0) {
    sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  }

  // Append new rows for this year
  if (rows.length > 0) {
    const startRow = rowsToKeep.length + 2; // +1 for header, +1 for 1-indexed
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  }

  Logger.log(`  Wrote ${rows.length} rows for ${year}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Manually trigger recruiting dollars calculation for a specific year/week
 * Useful for testing or backfilling
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Calculate through this week
 */
function runRecruitingDollarsForYear(year, throughWeek) {
  calculateRecruitingDollars(year, throughWeek);
}

/**
 * Quick function to calculate current year recruiting dollars
 */
function calculateCurrentRecruitingDollars() {
  const year = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();

  Logger.log(`Calculating recruiting dollars for ${year} through Week ${currentWeek}`);
  calculateRecruitingDollars(year, currentWeek);
}

/**
 * Backfill recruiting dollars for historical years
 * @param {Number} startYear - First year to process
 * @param {Number} endYear - Last year to process
 */
function backfillRecruitingDollars(startYear, endYear) {
  Logger.log(`=== BACKFILLING RECRUITING DOLLARS: ${startYear} to ${endYear} ===`);

  for (let year = startYear; year <= endYear; year++) {
    Logger.log(`\n--- Processing ${year} ---`);
    try {
      // Assume full season (week 17) for historical years
      calculateRecruitingDollars(year, 17);
    } catch (error) {
      Logger.log(`  ERROR: ${error.message}`);
    }
  }

  Logger.log(`\n=== BACKFILL COMPLETE ===`);
}

// Quick wrappers for menu use
function calculateRecruitingDollars2025() { calculateRecruitingDollars(2025, getCurrentNFLWeek()); }
function backfillRecruitingDollars2021to2025() { backfillRecruitingDollars(2021, 2025); }
