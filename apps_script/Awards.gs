/**
 * PLAYER AWARDS TRACKING
 * Calculate and track player awards based on performance
 *
 * Awards tracked:
 * - Heisman Trophy: Best player copy across entire league (all games weeks 1-12)
 * - National Awards: Best player copy per position (all games weeks 1-12)
 * - All-Conference Teams: 1st/2nd/3rd team per conference (conference games only)
 *
 * Award Score Formula:
 * (Player Starter Points / Team PF) × Player Starter Points × (Team Wins + 1)
 */

/**
 * Calculate all awards for a season
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Calculate through this week (capped at 12 for regular season)
 * @returns {Object} - Summary of calculations with all rankings
 */
function calculateAwards(year, throughWeek = 12) {
  const config = getConfig();

  // Awards are only for regular season (weeks 1-12) - cap throughWeek
  const regularSeasonWeeks = config.awards.getRegularSeasonWeeks(year);
  throughWeek = Math.min(throughWeek, regularSeasonWeeks);

  Logger.log(`=== CALCULATING AWARDS FOR ${year} (Weeks 1-${throughWeek}) ===`);

  // Step 1: Gather all required data
  Logger.log("\n--- Step 1: Gathering Data ---");

  const schedule = getSeasonSchedule(year, throughWeek);
  Logger.log(`  Schedule loaded: ${schedule.weeks.length} weeks`);

  const standings = fetchLeagueStandings(year);
  Logger.log(`  Standings loaded: ${Object.keys(standings).length} franchises`);

  const conferenceStandings = getConferenceStandings(year, throughWeek);
  Logger.log(`  Conference standings calculated`);

  const playerCopyData = getPlayerCopyDataForAwards();
  Logger.log(`  Player copies loaded: ${Object.keys(playerCopyData).length} copies`);

  // Step 1b: Load weekly results (from sheet cache or API)
  Logger.log(`  Loading weekly results (weeks 1-${throughWeek})...`);
  const weeklyResultsCache = fetchAllWeeklyResultsWithCache(year, throughWeek);
  Logger.log(`  Weekly results loaded: ${Object.keys(weeklyResultsCache).length} weeks`);

  // Step 2: Aggregate player scores using cached data
  Logger.log("\n--- Step 2: Aggregating Player Scores ---");

  const allGameScores = aggregatePlayerStarterScoresFromCache(weeklyResultsCache);
  Logger.log(`  All-game scores: ${countPlayers(allGameScores)} players`);

  const conferenceGameScores = aggregateConferenceGameScoresFromCache(weeklyResultsCache, schedule);
  Logger.log(`  Conference-game scores: ${countPlayers(conferenceGameScores)} players`);

  // Step 2b: Calculate potential points for 2025+ (for All-Conference formula)
  let conferencePotentialPoints = null;
  const useNewAllConfFormula = Number(year) >= 2025;
  if (useNewAllConfFormula) {
    Logger.log(`  Calculating conference potential points (2025+ formula)...`);
    conferencePotentialPoints = calculateConferencePotentialPointsFromCache(weeklyResultsCache, schedule, config);
  }

  // Step 2c: Calculate regular season potential points (for Coach of Year)
  Logger.log(`  Calculating regular season potential points (Coach of Year)...`);
  const regularSeasonPP = calculateRegularSeasonPotentialPointsFromCache(weeklyResultsCache, config);

  // Step 3: Calculate award scores
  Logger.log("\n--- Step 3: Calculating Award Scores ---");

  // For Heisman and National: use all games with standard formula
  const allGameAwardScores = calculateAwardScoresForPlayers(
    allGameScores,
    standings,
    playerCopyData
  );
  Logger.log(`  All-game award scores: ${allGameAwardScores.length} entries`);

  // For All-Conference: use SEPARATE formula based on year
  // 2021-2024: Conf Starter Pts × (Conf Starter Pts / Team Conf PF)
  // 2025+:     Conf Starter Pts × (Conf Starter Pts / Team Conf Potential Pts)
  const conferenceAwardScores = calculateAllConferenceScoresForPlayers(
    conferenceGameScores,
    conferenceStandings,
    conferencePotentialPoints,
    playerCopyData,
    year
  );
  Logger.log(`  Conference award scores: ${conferenceAwardScores.length} entries (${useNewAllConfFormula ? '2025+ PP formula' : '2021-2024 PF formula'})`);

  // Coach of the Year scores (team-level award)
  const cotyScores = calculateCoachOfYearScores(standings, regularSeasonPP);
  Logger.log(`  Coach of Year scores: ${cotyScores.length} franchises`);

  // Step 4: Determine rankings
  Logger.log("\n--- Step 4: Ranking Players ---");

  const rankings = {
    heisman: rankForHeisman(allGameAwardScores),
    national: rankForNationalAwards(allGameAwardScores, config.awards.positionGroups),
    allConference: rankForAllConference(conferenceAwardScores, config),
    coachOfYear: rankForCoachOfYear(cotyScores)
  };

  Logger.log(`  Heisman: Top player is ${rankings.heisman[0]?.playerName || "N/A"}`);
  Logger.log(`  Coach of Year: ${rankings.coachOfYear[0]?.playerName || "N/A"}`);
  Logger.log(`  National awards: ${Object.keys(config.awards.positionGroups).length} positions`);
  Logger.log(`  All-Conference: ${rankings.allConference.length} total selections`);

  // Step 5: Write to Awards sheet
  Logger.log("\n--- Step 5: Saving Results ---");
  writeAwardsToSheet(year, throughWeek, rankings);

  Logger.log(`\n=== AWARDS CALCULATION COMPLETE ===`);

  return rankings;
}

// ============================================================================
// DATA GATHERING FUNCTIONS
// ============================================================================

/**
 * Get player copy data needed for award calculations
 * Includes ALL player copies regardless of active status - this is critical for
 * historical backfill where players may no longer be active but had scores that year
 * @returns {Object} - Map of copyId -> copy info
 */
function getPlayerCopyDataForAwards() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.playerCopies);

  if (!sheet) {
    throw new Error("PlayerCopies sheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find column indices
  const cols = {
    copyId: headers.indexOf("PlayerCopyID"),
    playerId: headers.indexOf("MFL_Player_ID"),
    playerName: headers.indexOf("PlayerName"),
    conference: headers.indexOf("Conference"),
    franchiseId: headers.indexOf("CurrentFranchiseID"),
    active: headers.indexOf("Active")
  };

  // Also need position - get from RookieLedger or fetch from players
  const playerPositions = getPlayerPositions();

  const copyData = {};

  data.slice(1).forEach(row => {
    const copyId = row[cols.copyId];
    const playerId = String(row[cols.playerId]);
    const franchiseId = row[cols.franchiseId];

    // Skip only if no copy ID (invalid row)
    if (!copyId) return;

    copyData[copyId] = {
      copyId: copyId,
      playerId: playerId,
      playerName: row[cols.playerName],
      conference: row[cols.conference],
      // Use franchiseId if present, otherwise empty string (player may have been traded/dropped)
      currentFranchiseId: franchiseId ? String(Number(franchiseId)).padStart(3, "0") : "",
      position: playerPositions[playerId] || "UNKNOWN"
    };
  });

  return copyData;
}

/**
 * Get player positions from RookieLedger
 * @returns {Object} - Map of playerId -> position
 */
function getPlayerPositions() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.rookieLedger);

  if (!sheet) {
    return {};
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const playerIdCol = headers.indexOf("MFL_Player_ID");
  const positionCol = headers.indexOf("Position");

  const positions = {};

  data.slice(1).forEach(row => {
    const playerId = String(row[playerIdCol]);
    const position = row[positionCol];
    if (playerId && position) {
      positions[playerId] = position;
    }
  });

  return positions;
}

// ============================================================================
// SCORE AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Fetch all weekly results for the season ONCE and cache them
 * This eliminates duplicate API calls when calculating multiple award types
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Object} - Map of week number -> weekly results array
 */
function fetchAllWeeklyResults(year, throughWeek) {
  const cache = {};

  for (let week = 1; week <= throughWeek; week++) {
    try {
      const weeklyResults = fetchWeeklyResults(year, week);

      // Skip if no results (week hasn't been played yet)
      if (!weeklyResults || weeklyResults.length === 0) {
        Logger.log(`    Week ${week}: No results available (not yet played)`);
        continue;
      }

      cache[week] = weeklyResults;
    } catch (error) {
      Logger.log(`    Week ${week}: Error fetching results - ${error.message}`);
      // Continue to next week instead of failing completely
    }
  }

  return cache;
}

/**
 * Aggregate starter points per player per franchise (all games) using cached data
 * @param {Object} weeklyResultsCache - Cached weekly results from fetchAllWeeklyResults
 * @returns {Object} - Map of franchiseId -> playerId -> { starterPoints, weeks }
 */
function aggregatePlayerStarterScoresFromCache(weeklyResultsCache) {
  const playerScores = {};

  Object.entries(weeklyResultsCache).forEach(([weekStr, weeklyResults]) => {
    const week = Number(weekStr);

    weeklyResults.forEach(franchise => {
      if (!playerScores[franchise.franchiseId]) {
        playerScores[franchise.franchiseId] = {};
      }

      franchise.players.forEach(player => {
        if (!player.isStarter) return; // Only count starter points

        if (!playerScores[franchise.franchiseId][player.playerId]) {
          playerScores[franchise.franchiseId][player.playerId] = {
            starterPoints: 0,
            starterWeeks: []
          };
        }

        playerScores[franchise.franchiseId][player.playerId].starterPoints += player.score;
        playerScores[franchise.franchiseId][player.playerId].starterWeeks.push(week);
      });
    });
  });

  return playerScores;
}

/**
 * Aggregate starter points for CONFERENCE GAMES ONLY using cached data
 * @param {Object} weeklyResultsCache - Cached weekly results from fetchAllWeeklyResults
 * @param {Object} schedule - Season schedule from getSeasonSchedule()
 * @returns {Object} - Map of franchiseId -> playerId -> { starterPoints, weeks }
 */
function aggregateConferenceGameScoresFromCache(weeklyResultsCache, schedule) {
  const conferenceScores = {};

  Object.entries(weeklyResultsCache).forEach(([weekStr, weeklyResults]) => {
    const week = Number(weekStr);

    weeklyResults.forEach(franchise => {
      // Check if this franchise had a conference game this week
      const conferenceWeeks = schedule.conferenceGames[franchise.franchiseId] || [];
      if (!conferenceWeeks.includes(week)) return;

      if (!conferenceScores[franchise.franchiseId]) {
        conferenceScores[franchise.franchiseId] = {};
      }

      franchise.players.forEach(player => {
        if (!player.isStarter) return;

        if (!conferenceScores[franchise.franchiseId][player.playerId]) {
          conferenceScores[franchise.franchiseId][player.playerId] = {
            starterPoints: 0,
            starterWeeks: []
          };
        }

        conferenceScores[franchise.franchiseId][player.playerId].starterPoints += player.score;
        conferenceScores[franchise.franchiseId][player.playerId].starterWeeks.push(week);
      });
    });
  });

  return conferenceScores;
}

/**
 * Calculate potential points (optimal lineup) for each franchise during conference games
 * using cached data. This is needed for 2025+ All-Conference formula.
 *
 * @param {Object} weeklyResultsCache - Cached weekly results from fetchAllWeeklyResults
 * @param {Object} schedule - Season schedule from getSeasonSchedule()
 * @param {Object} config - Config object
 * @returns {Object} - Map of franchiseId -> potential points in conference games
 */
function calculateConferencePotentialPointsFromCache(weeklyResultsCache, schedule, config) {
  const potentialPoints = {}; // franchiseId -> total potential points

  // Initialize all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    potentialPoints[fId] = 0;
  });

  // Pre-load player positions once (avoid loading for each week)
  const playerPositions = getPlayerPositions();

  Object.entries(weeklyResultsCache).forEach(([weekStr, weeklyResults]) => {
    const week = Number(weekStr);

    weeklyResults.forEach(franchise => {
      // Check if this franchise had a conference game this week
      const conferenceWeeks = schedule.conferenceGames[franchise.franchiseId] || [];
      if (!conferenceWeeks.includes(week)) return;

      // Calculate optimal lineup for this week
      const optimalPoints = calculateOptimalLineupPointsWithPositions(franchise.players, playerPositions, config);

      potentialPoints[franchise.franchiseId] += optimalPoints;
    });
  });

  return potentialPoints;
}

/**
 * Calculate regular season potential points (optimal lineup) for ALL games
 * Used for Coach of the Year formula: (Wins+1) * PF * (PF/PP)
 *
 * Similar to calculateConferencePotentialPointsFromCache but without conference game filtering
 *
 * @param {Object} weeklyResultsCache - Map of week -> array of franchise results
 * @param {Object} config - Config object with roster rules
 * @returns {Object} - Map of franchiseId -> total potential points
 */
function calculateRegularSeasonPotentialPointsFromCache(weeklyResultsCache, config) {
  const potentialPoints = {}; // franchiseId -> total potential points

  // Initialize all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    potentialPoints[fId] = 0;
  });

  // Pre-load player positions once
  const playerPositions = getPlayerPositions();

  Object.entries(weeklyResultsCache).forEach(([weekStr, weeklyResults]) => {
    weeklyResults.forEach(franchise => {
      // Calculate optimal lineup for this week (all games, no conference filter)
      const optimalPoints = calculateOptimalLineupPointsWithPositions(
        franchise.players, playerPositions, config
      );
      potentialPoints[franchise.franchiseId] += optimalPoints;
    });
  });

  return potentialPoints;
}

/**
 * Calculate the optimal lineup score from a list of players
 * Uses pre-loaded player positions to avoid repeated lookups
 *
 * @param {Array} players - Array of player objects with playerId, score
 * @param {Object} playerPositions - Map of playerId -> position
 * @param {Object} config - Config object with roster rules
 * @returns {Number} - Maximum possible points with optimal lineup
 */
function calculateOptimalLineupPointsWithPositions(players, playerPositions, config) {
  // Group players by position with their scores
  const byPosition = {
    QB: [],
    RB: [],
    WR: [],
    TE: []
  };

  players.forEach(p => {
    const position = playerPositions[p.playerId];
    if (position && byPosition[position]) {
      byPosition[position].push(p.score);
    }
  });

  // Sort each position by score descending
  Object.keys(byPosition).forEach(pos => {
    byPosition[pos].sort((a, b) => b - a);
  });

  // Calculate optimal lineup based on roster requirements
  // Using 2025 rules: 1 QB, 1-5 RB, 2-6 WR/TE (8 total starters)
  // We'll take the best combination that maximizes points

  let optimalPoints = 0;

  // Always take best QB (1 required)
  if (byPosition.QB.length > 0) {
    optimalPoints += byPosition.QB[0];
  }

  // Combine WR and TE for flex calculation
  const wrTeScores = [...byPosition.WR, ...byPosition.TE].sort((a, b) => b - a);
  const rbScores = [...byPosition.RB];

  // We need to fill 7 more spots (8 total - 1 QB)
  // Constraints: 1-5 RB, 2-6 WR/TE
  // This means at least 1 RB, at least 2 WR/TE
  // We want to maximize points while respecting constraints

  // Take minimum required first
  let rbCount = 0;
  let wrTeCount = 0;

  // Must have at least 1 RB
  if (rbScores.length > 0) {
    optimalPoints += rbScores.shift();
    rbCount++;
  }

  // Must have at least 2 WR/TE
  for (let i = 0; i < 2 && wrTeScores.length > 0; i++) {
    optimalPoints += wrTeScores.shift();
    wrTeCount++;
  }

  // Fill remaining 4 spots with best available (respecting max limits)
  // Max 5 RB total, Max 6 WR/TE total
  const remainingSpots = 4;

  for (let i = 0; i < remainingSpots; i++) {
    const bestRB = rbCount < 5 && rbScores.length > 0 ? rbScores[0] : -1;
    const bestWRTE = wrTeCount < 6 && wrTeScores.length > 0 ? wrTeScores[0] : -1;

    if (bestRB >= bestWRTE && bestRB > 0) {
      optimalPoints += rbScores.shift();
      rbCount++;
    } else if (bestWRTE > 0) {
      optimalPoints += wrTeScores.shift();
      wrTeCount++;
    }
  }

  return optimalPoints;
}

// ============================================================================
// LEGACY SCORE AGGREGATION FUNCTIONS (kept for compatibility)
// ============================================================================

/**
 * Aggregate starter points per player per franchise (all games)
 * @deprecated Use aggregatePlayerStarterScoresFromCache with fetchAllWeeklyResults instead
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Object} - Map of franchiseId -> playerId -> { starterPoints, weeks }
 */
function aggregatePlayerStarterScores(year, throughWeek) {
  const playerScores = {};

  for (let week = 1; week <= throughWeek; week++) {
    try {
      const weeklyResults = fetchWeeklyResults(year, week);

      // Skip if no results (week hasn't been played yet)
      if (!weeklyResults || weeklyResults.length === 0) {
        Logger.log(`    Week ${week}: No results available (not yet played)`);
        continue;
      }

      weeklyResults.forEach(franchise => {
        if (!playerScores[franchise.franchiseId]) {
          playerScores[franchise.franchiseId] = {};
        }

        franchise.players.forEach(player => {
          if (!player.isStarter) return; // Only count starter points

          if (!playerScores[franchise.franchiseId][player.playerId]) {
            playerScores[franchise.franchiseId][player.playerId] = {
              starterPoints: 0,
              starterWeeks: []
            };
          }

          playerScores[franchise.franchiseId][player.playerId].starterPoints += player.score;
          playerScores[franchise.franchiseId][player.playerId].starterWeeks.push(week);
        });
      });
    } catch (error) {
      Logger.log(`    Week ${week}: Error fetching results - ${error.message}`);
      // Continue to next week instead of failing completely
    }
  }

  return playerScores;
}

/**
 * Aggregate starter points for CONFERENCE GAMES ONLY
 * @deprecated Use aggregateConferenceGameScoresFromCache with fetchAllWeeklyResults instead
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @param {Object} schedule - Season schedule from getSeasonSchedule()
 * @returns {Object} - Map of franchiseId -> playerId -> { starterPoints, weeks }
 */
function aggregateConferenceGameScores(year, throughWeek, schedule) {
  const conferenceScores = {};

  for (let week = 1; week <= throughWeek; week++) {
    try {
      const weeklyResults = fetchWeeklyResults(year, week);

      // Skip if no results (week hasn't been played yet)
      if (!weeklyResults || weeklyResults.length === 0) {
        continue;
      }

      weeklyResults.forEach(franchise => {
        // Check if this franchise had a conference game this week
        const conferenceWeeks = schedule.conferenceGames[franchise.franchiseId] || [];
        if (!conferenceWeeks.includes(week)) return;

        if (!conferenceScores[franchise.franchiseId]) {
          conferenceScores[franchise.franchiseId] = {};
        }

        franchise.players.forEach(player => {
          if (!player.isStarter) return;

          if (!conferenceScores[franchise.franchiseId][player.playerId]) {
            conferenceScores[franchise.franchiseId][player.playerId] = {
              starterPoints: 0,
              starterWeeks: []
            };
          }

          conferenceScores[franchise.franchiseId][player.playerId].starterPoints += player.score;
          conferenceScores[franchise.franchiseId][player.playerId].starterWeeks.push(week);
        });
      });
    } catch (error) {
      // Continue to next week instead of failing completely
    }
  }

  return conferenceScores;
}

/**
 * Count total players across all franchises in score data
 */
function countPlayers(scoreData) {
  let count = 0;
  Object.values(scoreData).forEach(franchise => {
    count += Object.keys(franchise).length;
  });
  return count;
}

/**
 * Calculate potential points (optimal lineup) for each franchise during conference games
 * This is needed for 2025+ All-Conference formula
 * @deprecated Use calculateConferencePotentialPointsFromCache with fetchAllWeeklyResults instead
 *
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @param {Object} schedule - Season schedule from getSeasonSchedule()
 * @returns {Object} - Map of franchiseId -> potential points in conference games
 */
function calculateConferencePotentialPoints(year, throughWeek, schedule) {
  const config = getConfig();
  const potentialPoints = {}; // franchiseId -> total potential points

  // Initialize all franchises
  const franchiseMap = getFranchiseConferenceMap();
  Object.keys(franchiseMap).forEach(fId => {
    potentialPoints[fId] = 0;
  });

  for (let week = 1; week <= throughWeek; week++) {
    try {
      const weeklyResults = fetchWeeklyResults(year, week);

      if (!weeklyResults || weeklyResults.length === 0) {
        continue;
      }

      weeklyResults.forEach(franchise => {
        // Check if this franchise had a conference game this week
        const conferenceWeeks = schedule.conferenceGames[franchise.franchiseId] || [];
        if (!conferenceWeeks.includes(week)) return;

        // Calculate optimal lineup for this week
        // Get all players with scores (starters and non-starters)
        const optimalPoints = calculateOptimalLineupPoints(franchise.players, config);

        potentialPoints[franchise.franchiseId] += optimalPoints;
      });
    } catch (error) {
      // Continue to next week
    }
  }

  return potentialPoints;
}

/**
 * Calculate the optimal lineup score from a list of players
 * Uses roster configuration to determine how many of each position to start
 * @deprecated Use calculateOptimalLineupPointsWithPositions instead for better performance
 *
 * @param {Array} players - Array of player objects with playerId, score
 * @param {Object} config - Config object with roster rules
 * @returns {Number} - Maximum possible points with optimal lineup
 */
function calculateOptimalLineupPoints(players, config) {
  // Get player positions
  const playerPositions = getPlayerPositions();

  // Group players by position with their scores
  const byPosition = {
    QB: [],
    RB: [],
    WR: [],
    TE: []
  };

  players.forEach(p => {
    const position = playerPositions[p.playerId];
    if (position && byPosition[position]) {
      byPosition[position].push(p.score);
    }
  });

  // Sort each position by score descending
  Object.keys(byPosition).forEach(pos => {
    byPosition[pos].sort((a, b) => b - a);
  });

  // Calculate optimal lineup based on roster requirements
  // Using 2025 rules: 1 QB, 1-5 RB, 2-6 WR/TE (8 total starters)
  // We'll take the best combination that maximizes points

  let optimalPoints = 0;

  // Always take best QB (1 required)
  if (byPosition.QB.length > 0) {
    optimalPoints += byPosition.QB[0];
  }

  // Combine WR and TE for flex calculation
  const wrTeScores = [...byPosition.WR, ...byPosition.TE].sort((a, b) => b - a);
  const rbScores = [...byPosition.RB];

  // We need to fill 7 more spots (8 total - 1 QB)
  // Constraints: 1-5 RB, 2-6 WR/TE
  // This means at least 1 RB, at least 2 WR/TE
  // We want to maximize points while respecting constraints

  // Take minimum required first
  let rbCount = 0;
  let wrTeCount = 0;

  // Must have at least 1 RB
  if (rbScores.length > 0) {
    optimalPoints += rbScores.shift();
    rbCount++;
  }

  // Must have at least 2 WR/TE
  for (let i = 0; i < 2 && wrTeScores.length > 0; i++) {
    optimalPoints += wrTeScores.shift();
    wrTeCount++;
  }

  // Fill remaining 4 spots with best available (respecting max limits)
  // Max 5 RB total, Max 6 WR/TE total
  const remainingSpots = 4;

  for (let i = 0; i < remainingSpots; i++) {
    const bestRB = rbCount < 5 && rbScores.length > 0 ? rbScores[0] : -1;
    const bestWRTE = wrTeCount < 6 && wrTeScores.length > 0 ? wrTeScores[0] : -1;

    if (bestRB >= bestWRTE && bestRB > 0) {
      optimalPoints += rbScores.shift();
      rbCount++;
    } else if (bestWRTE > 0) {
      optimalPoints += wrTeScores.shift();
      wrTeCount++;
    }
  }

  return optimalPoints;
}

// ============================================================================
// AWARD SCORE CALCULATION
// ============================================================================

/**
 * Calculate HEISMAN/NATIONAL award score using formula:
 * (Player Starter Points / Team PF) × Player Starter Points × (Team Wins + 1)
 *
 * @param {Number} starterPoints - Player's total starter points
 * @param {Number} teamPF - Team's total points for
 * @param {Number} teamWins - Team's win count
 * @returns {Number} - Calculated award score
 */
function calculateAwardScore(starterPoints, teamPF, teamWins) {
  if (teamPF === 0) return 0; // Avoid division by zero

  const contributionRatio = starterPoints / teamPF;
  const awardScore = contributionRatio * starterPoints * (teamWins + 1);

  return Math.round(awardScore * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate ALL-CONFERENCE award score
 *
 * 2021-2024 Formula:
 *   Conference Starter Points × (Conference Starter Points / Team Conference PF)
 *
 * 2025+ Formula:
 *   Conference Starter Points × (Conference Starter Points / Team Conference Potential Points)
 *
 * @param {Number} starterPoints - Player's conference game starter points
 * @param {Number} teamDenominator - Team Conference PF (2021-2024) or Potential Points (2025+)
 * @returns {Number} - Calculated all-conference score
 */
function calculateAllConferenceScore(starterPoints, teamDenominator) {
  if (teamDenominator === 0) return 0; // Avoid division by zero

  const contributionRatio = starterPoints / teamDenominator;
  const allConfScore = starterPoints * contributionRatio;

  return Math.round(allConfScore * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate award scores for all player copies (Heisman/National awards)
 *
 * IMPORTANT: Matching is done by playerId + franchise's CONFERENCE, not by current ownership.
 * This is critical for historical backfill where player copies may have changed hands.
 * The weekly results tell us which franchise had the player, and we use that franchise's
 * conference to find the correct player copy.
 *
 * @param {Object} playerScores - Player scores from aggregation
 * @param {Object} standings - Team standings (wins, pointsFor)
 * @param {Object} playerCopyData - Player copy information
 * @returns {Array} - Array of award score entries
 */
function calculateAwardScoresForPlayers(playerScores, standings, playerCopyData) {
  const awardScores = [];

  // Get franchise -> conference mapping
  const franchiseConferenceMap = getFranchiseConferenceMap();

  // Build franchise+player -> copyId lookup from PlayerCopies CurrentFranchiseID
  // This uses the copy's CURRENT ownership to determine which copy to credit
  // For historical years, this requires PlayerCopies to have been updated through
  // chronological backfill to reflect ownership at that point in time
  const franchisePlayerToCopy = {};

  // Also build fallback lookup: playerId + conference -> [copyIds] for players not on rosters
  const conferencePlayerToCopies = {};

  Object.entries(playerCopyData).forEach(([copyId, copy]) => {
    const conferenceKey = `${copy.playerId}-${copy.conference}`;

    // Build franchise+player lookup for players currently owned by a franchise
    if (copy.currentFranchiseId) {
      const franchiseKey = `${copy.currentFranchiseId}-${copy.playerId}`;
      // If a franchise owns multiple copies of same player (shouldn't happen normally),
      // prefer the copy that matches their conference
      if (!franchisePlayerToCopy[franchiseKey]) {
        franchisePlayerToCopy[franchiseKey] = copyId;
      }
    }

    // Build conference-based fallback lookup (ordered by ordinal via copyId sorting)
    if (!conferencePlayerToCopies[conferenceKey]) {
      conferencePlayerToCopies[conferenceKey] = [];
    }
    conferencePlayerToCopies[conferenceKey].push(copyId);
  });

  // Sort fallback lists so copy 1 comes before copy 2
  Object.values(conferencePlayerToCopies).forEach(copies => copies.sort());

  // Calculate scores for each player on each franchise
  Object.entries(playerScores).forEach(([franchiseId, players]) => {
    const teamStats = standings[franchiseId];
    if (!teamStats) return;

    // Get the conference for this franchise
    const franchiseConference = franchiseConferenceMap[franchiseId];
    if (!franchiseConference) return;

    Object.entries(players).forEach(([playerId, scoreData]) => {
      // PRIMARY: Try to find copy by franchise+player ownership
      const franchiseKey = `${franchiseId}-${playerId}`;
      let copyId = franchisePlayerToCopy[franchiseKey];

      // FALLBACK: If no direct ownership match, use conference-based lookup (first copy)
      // This handles cases where ownership wasn't tracked or player was traded
      if (!copyId) {
        const conferenceKey = `${playerId}-${franchiseConference}`;
        const copies = conferencePlayerToCopies[conferenceKey];
        copyId = copies ? copies[0] : null;
      }

      if (!copyId) return; // Player not in PlayerCopies for this conference

      const copy = playerCopyData[copyId];
      if (!copy) return;

      const awardScore = calculateAwardScore(
        scoreData.starterPoints,
        teamStats.pointsFor,
        teamStats.wins
      );

      awardScores.push({
        copyId: copyId,
        playerId: playerId,
        playerName: copy.playerName,
        position: copy.position,
        conference: copy.conference,
        franchiseId: franchiseId,
        starterPoints: scoreData.starterPoints,
        starterWeeks: scoreData.starterWeeks,
        teamPF: teamStats.pointsFor,
        teamWins: teamStats.wins,
        awardScore: awardScore
      });
    });
  });

  return awardScores;
}

/**
 * Calculate ALL-CONFERENCE award scores for player copies
 * Uses different formula than Heisman/National:
 *   2021-2024: Conf Starter Pts × (Conf Starter Pts / Team Conf PF)
 *   2025+:     Conf Starter Pts × (Conf Starter Pts / Team Conf Potential Pts)
 *
 * IMPORTANT: Matching is done by playerId + franchise's CONFERENCE, not by current ownership.
 * This is critical for historical backfill where player copies may have changed hands.
 *
 * @param {Object} conferencePlayerScores - Player scores from conference games only
 * @param {Object} conferenceStandings - Team conference standings (wins, pointsFor)
 * @param {Object} conferencePotentialPoints - Team potential points in conference games (2025+ only)
 * @param {Object} playerCopyData - Player copy information
 * @param {Number} year - Season year (determines which formula to use)
 * @returns {Array} - Array of all-conference award score entries
 */
function calculateAllConferenceScoresForPlayers(conferencePlayerScores, conferenceStandings, conferencePotentialPoints, playerCopyData, year) {
  const awardScores = [];
  const useNewFormula = Number(year) >= 2025;

  // Get franchise -> conference mapping
  const franchiseConferenceMap = getFranchiseConferenceMap();

  // Build franchise+player -> copyId lookup from PlayerCopies CurrentFranchiseID
  // This uses the copy's CURRENT ownership to determine which copy to credit
  // For historical years, this requires PlayerCopies to have been updated through
  // chronological backfill to reflect ownership at that point in time
  const franchisePlayerToCopy = {};

  // Also build fallback lookup: playerId + conference -> [copyIds] for players not on rosters
  const conferencePlayerToCopies = {};

  Object.entries(playerCopyData).forEach(([copyId, copy]) => {
    const conferenceKey = `${copy.playerId}-${copy.conference}`;

    // Build franchise+player lookup for players currently owned by a franchise
    if (copy.currentFranchiseId) {
      const franchiseKey = `${copy.currentFranchiseId}-${copy.playerId}`;
      // If a franchise owns multiple copies of same player (shouldn't happen normally),
      // prefer the copy that matches their conference
      if (!franchisePlayerToCopy[franchiseKey]) {
        franchisePlayerToCopy[franchiseKey] = copyId;
      }
    }

    // Build conference-based fallback lookup (ordered by ordinal via copyId sorting)
    if (!conferencePlayerToCopies[conferenceKey]) {
      conferencePlayerToCopies[conferenceKey] = [];
    }
    conferencePlayerToCopies[conferenceKey].push(copyId);
  });

  // Sort fallback lists so copy 1 comes before copy 2
  Object.values(conferencePlayerToCopies).forEach(copies => copies.sort());

  // Calculate scores for each player on each franchise
  Object.entries(conferencePlayerScores).forEach(([franchiseId, players]) => {
    const teamConfStats = conferenceStandings[franchiseId];
    if (!teamConfStats) return;

    // Get the conference for this franchise
    const franchiseConference = franchiseConferenceMap[franchiseId];
    if (!franchiseConference) return;

    // Determine denominator based on year
    let teamDenominator;
    if (useNewFormula) {
      teamDenominator = conferencePotentialPoints[franchiseId] || 0;
    } else {
      teamDenominator = teamConfStats.pointsFor || 0;
    }

    Object.entries(players).forEach(([playerId, scoreData]) => {
      // PRIMARY: Try to find copy by franchise+player ownership
      const franchiseKey = `${franchiseId}-${playerId}`;
      let copyId = franchisePlayerToCopy[franchiseKey];

      // FALLBACK: If no direct ownership match, use conference-based lookup (first copy)
      // This handles cases where ownership wasn't tracked or player was traded
      if (!copyId) {
        const conferenceKey = `${playerId}-${franchiseConference}`;
        const copies = conferencePlayerToCopies[conferenceKey];
        copyId = copies ? copies[0] : null;
      }

      if (!copyId) return; // Player not in PlayerCopies for this conference

      const copy = playerCopyData[copyId];
      if (!copy) return;

      const allConfScore = calculateAllConferenceScore(
        scoreData.starterPoints,
        teamDenominator
      );

      awardScores.push({
        copyId: copyId,
        playerId: playerId,
        playerName: copy.playerName,
        position: copy.position,
        conference: copy.conference,
        franchiseId: franchiseId,
        starterPoints: scoreData.starterPoints,
        starterWeeks: scoreData.starterWeeks,
        teamConfPF: teamConfStats.pointsFor,
        teamConfPP: conferencePotentialPoints ? (conferencePotentialPoints[franchiseId] || 0) : 0,
        teamConfWins: teamConfStats.wins,
        awardScore: allConfScore
      });
    });
  });

  return awardScores;
}

// ============================================================================
// RANKING FUNCTIONS
// ============================================================================

/**
 * Rank players for Heisman Trophy (best overall)
 * @param {Array} awardScores - Array of award score entries
 * @returns {Array} - Top 20 players ranked for Heisman
 */
function rankForHeisman(awardScores) {
  // Deduplicate by copyId - keep entry with highest score
  const dedupedScores = deduplicateAwardScoresByCopyId(awardScores);
  const sorted = [...dedupedScores].sort((a, b) => b.awardScore - a.awardScore);

  return sorted.slice(0, 20).map((player, idx) => ({
    ...player,
    awardType: "Heisman",
    rank: idx + 1
  }));
}

/**
 * Rank players for National Position Awards
 * @param {Array} awardScores - Array of award score entries
 * @param {Object} positionGroups - Position groupings from config
 * @returns {Array} - Top players at each position
 */
function rankForNationalAwards(awardScores, positionGroups) {
  // Deduplicate by copyId - keep entry with highest score
  const dedupedScores = deduplicateAwardScoresByCopyId(awardScores);
  const nationalAwards = [];

  Object.entries(positionGroups).forEach(([groupName, positions]) => {
    // Filter to players in this position group
    const groupPlayers = dedupedScores.filter(p =>
      positions.includes(p.position)
    );

    // Sort by award score descending
    const sorted = [...groupPlayers].sort((a, b) => b.awardScore - a.awardScore);

    // Take top 5 for each position
    sorted.slice(0, 5).forEach((player, idx) => {
      nationalAwards.push({
        ...player,
        awardType: `National_${groupName}`,
        rank: idx + 1
      });
    });
  });

  return nationalAwards;
}

/**
 * Deduplicate award scores by copyId, keeping the entry with the highest score
 * This handles cases where a player was traded mid-season and has scores under multiple franchises
 *
 * @param {Array} awardScores - Array of award score entries
 * @returns {Array} - Deduplicated array
 */
function deduplicateAwardScoresByCopyId(awardScores) {
  const seenCopyIds = new Map(); // copyId -> best entry

  awardScores.forEach(entry => {
    const existing = seenCopyIds.get(entry.copyId);
    if (!existing || entry.awardScore > existing.awardScore) {
      seenCopyIds.set(entry.copyId, entry);
    }
  });

  return Array.from(seenCopyIds.values());
}

/**
 * Rank players for All-Conference Teams
 * @param {Array} conferenceAwardScores - Award scores based on conference games only
 * @param {Object} config - Config object
 * @returns {Array} - All-conference selections for all conferences
 */
function rankForAllConference(conferenceAwardScores, config) {
  const conferences = getConferences();
  const allConferenceAwards = [];
  const positionGroups = config.awards.positionGroups;
  const teamSizes = config.awards.allConferenceTeamSize;
  const teamCount = config.awards.allConferenceTeamCount;

  conferences.forEach(conference => {
    // Filter to players in this conference
    const confPlayers = conferenceAwardScores.filter(p => p.conference === conference);

    // Deduplicate by copyId - if a player was traded mid-season, they may appear
    // under multiple franchises. Keep the entry with the highest awardScore.
    const dedupedPlayers = [];
    const seenCopyIds = new Map(); // copyId -> index in dedupedPlayers

    confPlayers.forEach(player => {
      const existing = seenCopyIds.get(player.copyId);
      if (existing !== undefined) {
        // Player already seen - keep the one with higher score
        if (player.awardScore > dedupedPlayers[existing].awardScore) {
          dedupedPlayers[existing] = player;
        }
      } else {
        seenCopyIds.set(player.copyId, dedupedPlayers.length);
        dedupedPlayers.push(player);
      }
    });

    // For each position group
    Object.entries(positionGroups).forEach(([groupName, positions]) => {
      // Filter to this position and sort by award score
      const positionPlayers = dedupedPlayers
        .filter(p => positions.includes(p.position))
        .sort((a, b) => b.awardScore - a.awardScore);

      const slotsPerTeam = teamSizes[groupName] || 1;

      // Assign to 1st, 2nd, 3rd team
      for (let team = 1; team <= teamCount; team++) {
        const startIdx = (team - 1) * slotsPerTeam;
        const teamPlayers = positionPlayers.slice(startIdx, startIdx + slotsPerTeam);

        teamPlayers.forEach((player, idx) => {
          allConferenceAwards.push({
            ...player,
            awardType: `AllConf_${conference}_${getOrdinal(team)}`,
            rank: idx + 1
          });
        });
      }
    });
  });

  return allConferenceAwards;
}

/**
 * Get ordinal suffix for team number
 */
function getOrdinal(n) {
  const ordinals = { 1: "1st", 2: "2nd", 3: "3rd" };
  return ordinals[n] || `${n}th`;
}

// ============================================================================
// COACH OF THE YEAR FUNCTIONS
// ============================================================================

/**
 * Calculate Coach of the Year scores for all franchises
 * Formula: (Regular Season Wins + 1) * PF * (PF / PP)
 *
 * @param {Object} standings - Map of franchiseId -> { wins, pointsFor, ... }
 * @param {Object} regularSeasonPP - Map of franchiseId -> total potential points
 * @returns {Array} - Array of score objects
 */
function calculateCoachOfYearScores(standings, regularSeasonPP) {
  const scores = [];
  const franchiseNames = getTeamNameMap();
  const franchiseConferenceMap = getFranchiseConferenceMap();

  Object.entries(standings).forEach(([franchiseId, teamStats]) => {
    const pp = regularSeasonPP[franchiseId] || 0;
    if (pp === 0) return; // Avoid division by zero

    const pf = teamStats.pointsFor;
    const wins = teamStats.wins;

    // Formula: (Wins + 1) * PF * (PF / PP)
    const cotyScore = (wins + 1) * pf * (pf / pp);

    scores.push({
      franchiseId: franchiseId,
      teamName: franchiseNames[franchiseId] || "Unknown",
      conference: franchiseConferenceMap[franchiseId] || "Unknown",
      teamPF: pf,
      teamPP: pp,
      teamWins: wins,
      awardScore: Math.round(cotyScore * 100) / 100
    });
  });

  return scores;
}

/**
 * Rank franchises for Coach of the Year (top 20)
 * Maps team-level data into the standard award row format
 *
 * @param {Array} cotyScores - Array from calculateCoachOfYearScores
 * @returns {Array} - Ranked award entries (top 20)
 */
function rankForCoachOfYear(cotyScores) {
  const sorted = [...cotyScores].sort((a, b) => b.awardScore - a.awardScore);

  return sorted.slice(0, 20).map((entry, idx) => ({
    awardType: "CoachOfYear",
    copyId: `COTY_${entry.franchiseId}`,
    playerId: entry.franchiseId,
    playerName: entry.teamName,
    position: "COACH",
    conference: entry.conference,
    franchiseId: entry.franchiseId,
    starterPoints: entry.teamPF,
    teamPF: entry.teamPF,
    teamWins: entry.teamWins,
    awardScore: entry.awardScore,
    rank: idx + 1
  }));
}

// ============================================================================
// SHEET MANAGEMENT
// ============================================================================

/**
 * Write awards to the Awards sheet
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Week calculated through
 * @param {Object} rankings - Rankings object with heisman, national, allConference
 */
function writeAwardsToSheet(year, throughWeek, rankings) {
  const config = getConfig();
  const headers = [
    "Year", "AwardType", "PlayerCopyID", "MFL_Player_ID", "PlayerName",
    "Position", "Conference", "FranchiseID", "StarterPoints", "TeamPF",
    "TeamWins", "AwardScore", "Rank", "LastCalculated"
  ];

  const sheet = getOrCreateSheet(config.sheets.awards, headers);

  // Clear existing data for this year (keep header)
  const existingData = sheet.getDataRange().getValues();
  if (existingData.length > 1) {
    // Find rows for this year and remove them
    const rowsToKeep = [existingData[0]]; // Keep header
    existingData.slice(1).forEach(row => {
      if (Number(row[0]) !== Number(year)) {
        rowsToKeep.push(row);
      }
    });

    sheet.clearContents();
    if (rowsToKeep.length > 0) {
      sheet.getRange(1, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    }
  }

  // Collect all awards into rows
  const now = new Date();
  const rows = [];

  // Add all rankings
  const allRankings = [
    ...rankings.heisman,
    ...rankings.national,
    ...rankings.allConference,
    ...(rankings.coachOfYear || [])
  ];

  allRankings.forEach(award => {
    rows.push([
      year,
      award.awardType,
      award.copyId,
      award.playerId,
      award.playerName,
      award.position,
      award.conference,
      award.franchiseId,
      award.starterPoints,
      award.teamPF,
      award.teamWins,
      award.awardScore,
      award.rank,
      now
    ]);
  });

  // Append new rows
  if (rows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);
  }

  Logger.log(`  Wrote ${rows.length} award entries for ${year}`);
}

// ============================================================================
// BACKFILL FUNCTIONS
// ============================================================================

/**
 * Backfill awards for historical seasons
 * Each year's data is written to the Awards sheet (clearing only that year's existing data)
 * Uses year-specific regular season week count (13 for 2021-2023, 12 for 2024+)
 * @param {Number} startYear - First year to process
 * @param {Number} endYear - Last year to process
 */
function backfillHistoricalAwards(startYear, endYear) {
  Logger.log(`=== BACKFILLING AWARDS: ${startYear} to ${endYear} ===`);

  const config = getConfig();
  const results = [];

  for (let year = startYear; year <= endYear; year++) {
    Logger.log(`\n--- Processing ${year} ---`);

    try {
      // Get year-specific regular season weeks (13 for 2021-2023, 12 for 2024+)
      const regularSeasonWeeks = config.awards.getRegularSeasonWeeks(year);
      Logger.log(`  Using ${regularSeasonWeeks} regular season weeks for ${year}`);

      // Calculate full season awards
      const rankings = calculateAwards(year, regularSeasonWeeks);

      results.push({
        year: year,
        success: true,
        heismanLeader: rankings.heisman[0]?.playerName || 'N/A',
        totalEntries: rankings.heisman.length + rankings.national.length + rankings.allConference.length + (rankings.coachOfYear || []).length
      });

      Logger.log(`  ${year}: Awards calculated successfully`);
    } catch (error) {
      results.push({
        year: year,
        success: false,
        error: error.message
      });
      Logger.log(`  ${year}: ERROR - ${error.message}`);
    }
  }

  Logger.log(`\n=== HISTORICAL BACKFILL COMPLETE ===`);
}

// Quick wrappers for menu/manual use
function backfillAwards2021() { backfillHistoricalAwards(2021, 2021); }
function backfillAwards2022() { backfillHistoricalAwards(2022, 2022); }
function backfillAwards2023() { backfillHistoricalAwards(2023, 2023); }
function backfillAwards2024() { backfillHistoricalAwards(2024, 2024); }
function backfillAwards2025() { backfillHistoricalAwards(2025, 2025); }
function backfillAwards2021to2025() { backfillHistoricalAwards(2021, 2025); }

// ============================================================================
// TRIGGER AND AUTOMATION
// ============================================================================

/**
 * Weekly awards update function (called by trigger)
 * Refreshes the weekly results cache for the current week before calculating awards
 */
function weeklyAwardsUpdate() {
  const year = getLeagueYear();

  // Determine current NFL week
  const currentWeek = getCurrentNFLWeek();

  // Only run during regular season (weeks 1-12)
  if (currentWeek < 1 || currentWeek > 12) {
    Logger.log(`Week ${currentWeek} is outside regular season (1-12). Skipping awards update.`);
    return;
  }

  Logger.log(`=== Weekly Awards Update: ${year} Week ${currentWeek} ===`);

  // Step 1: Refresh the weekly results cache for the current week
  // This ensures we have the latest data from MFL before calculating awards
  Logger.log(`\n--- Refreshing Week ${currentWeek} Results Cache ---`);
  try {
    const results = refreshWeekCache(year, currentWeek);
    Logger.log(`  Cached ${results ? results.length : 0} franchise results for Week ${currentWeek}`);
  } catch (e) {
    Logger.log(`  Warning: Could not refresh week cache - ${e.message}`);
    Logger.log(`  Proceeding with existing cache data...`);
  }

  // Step 2: Calculate awards through the current week
  Logger.log(`\n--- Calculating Awards ---`);
  calculateAwards(year, currentWeek);

  Logger.log(`\n=== Weekly Awards Update Complete ===`);
}

// NOTE: getCurrentNFLWeek() is defined in Rankings.gs
// Removed duplicate definition to avoid conflicts

/**
 * Set up weekly trigger for awards calculation
 */
function setupAwardsTrigger() {
  // Remove existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'weeklyAwardsUpdate') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new weekly trigger (runs every Tuesday at 6 AM)
  ScriptApp.newTrigger('weeklyAwardsUpdate')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(6)
    .create();

  Logger.log("Awards trigger scheduled for Tuesdays at 6 AM");
}

/**
 * Remove awards trigger
 */
function removeAwardsTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'weeklyAwardsUpdate') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  Logger.log(`Removed ${removed} awards trigger(s)`);
}

// ============================================================================
// VIEW/REPORT FUNCTIONS
// ============================================================================

/**
 * View current award leaders
 * @param {String|Number} year - Season year (default: current)
 */
function viewAwardLeaders(year) {
  const config = getConfig();
  year = year || getLeagueYear();

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.awards);

  if (!sheet) {
    Logger.log("Awards sheet not found. Run calculateAwards() first.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Filter to requested year
  const yearData = data.slice(1).filter(row => Number(row[0]) === Number(year));

  if (yearData.length === 0) {
    Logger.log(`No award data found for ${year}`);
    return;
  }

  Logger.log(`=== AWARD LEADERS FOR ${year} ===\n`);

  // Heisman
  const heisman = yearData.filter(r => r[1] === "Heisman" && r[12] === 1);
  if (heisman.length > 0) {
    Logger.log(`HEISMAN TROPHY: ${heisman[0][4]} (${heisman[0][5]}) - Score: ${heisman[0][11]}`);
  }

  // National Awards
  Logger.log("\nNATIONAL AWARDS:");
  const nationalTypes = [...new Set(yearData.filter(r => r[1].startsWith("National_")).map(r => r[1]))];
  nationalTypes.forEach(awardType => {
    const winner = yearData.find(r => r[1] === awardType && r[12] === 1);
    if (winner) {
      const posGroup = awardType.replace("National_", "");
      Logger.log(`  ${posGroup}: ${winner[4]} - Score: ${winner[11]}`);
    }
  });

  // All-Conference (just show 1st team by conference)
  Logger.log("\nALL-CONFERENCE 1ST TEAM:");
  const conferences = getConferences();
  conferences.forEach(conf => {
    const firstTeam = yearData.filter(r => r[1] === `AllConf_${conf}_1st`);
    if (firstTeam.length > 0) {
      Logger.log(`  ${conf}:`);
      firstTeam.forEach(player => {
        Logger.log(`    ${player[5]}: ${player[4]} - Score: ${player[11]}`);
      });
    }
  });
}
