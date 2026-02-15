/**
 * POWER RANKINGS
 * Calculates team power rankings based on the formula:
 * ((Regular Season Wins + 1) * (All-Play % + Opp All-Play %)) + Postseason Wins
 *
 * All-Play % = (allPlayWins * 2 + allPlayTies) / ((allPlayWins + allPlayLosses + allPlayTies) * 2)
 * Opp All-Play % = Same calculation but for opponent's score each week you played them
 */

// ============================================================================
// SHEET MANAGEMENT
// ============================================================================

/**
 * Get or create the PowerRankings sheet
 */
function getPowerRankingsSheet() {
  const headers = [
    "Year",
    "Week",
    "FranchiseID",
    "TeamName",
    "Conference",
    "Rank",
    "PreviousRank",
    "Movement",
    "RankingScore",
    "RegularSeasonWins",
    "RegularSeasonLosses",
    "RegularSeasonTies",
    "AllPlayWins",
    "AllPlayLosses",
    "AllPlayTies",
    "AllPlayPct",
    "OppAllPlayWins",
    "OppAllPlayLosses",
    "OppAllPlayTies",
    "OppAllPlayPct",
    "PostseasonWins",
    "PostseasonLosses",
    "ConferenceWins",
    "ConferenceLosses",
    "TotalPointsScored",
    "CalculatedAt"
  ];

  return getOrCreateSheet("PowerRankings", headers);
}

/**
 * Get or create the ScheduleResults sheet for per-week tracking
 * This sheet contains 100 rows per week (one per team) with:
 * - Weekly game data (matchup details, weekly All-Play)
 * - Cumulative season data through that week (for rankings)
 */
function getScheduleResultsSheet() {
  const headers = [
    // Identity
    "Year",
    "Week",
    "FranchiseID",
    "TeamName",
    "Conference",

    // Weekly Game Data
    "TeamScore",
    "OpponentID",
    "OpponentName",
    "OpponentScore",
    "GameResult",           // W, L, T, or BYE
    "IsConferenceGame",     // TRUE/FALSE
    "IsRivalryGame",        // TRUE/FALSE - confirmed rivalry matchup
    "WeeklyAllPlayWins",
    "WeeklyAllPlayLosses",
    "WeeklyAllPlayTies",
    "WeeklyOppAllPlayWins",
    "WeeklyOppAllPlayLosses",
    "WeeklyOppAllPlayTies",

    // Cumulative Season Data (through this week)
    "SeasonWins",
    "SeasonLosses",
    "SeasonTies",
    "SeasonPointsFor",
    "SeasonConfWins",
    "SeasonConfLosses",
    "SeasonAllPlayWins",
    "SeasonAllPlayLosses",
    "SeasonAllPlayTies",
    "SeasonAllPlayPct",
    "SeasonOppAllPlayWins",
    "SeasonOppAllPlayLosses",
    "SeasonOppAllPlayTies",
    "SeasonOppAllPlayPct",
    "PostseasonWins",
    "PostseasonLosses",

    // Ranking Data (as of this week)
    "RankingScore",
    "SeasonRank",

    // College Gameday Data
    "OpponentRank",         // Opponent's rank for the week
    "MatchupAvgRank",       // Average of both teams' ranks
    "IsCollegeGameday",     // TRUE if this is THE featured Gameday matchup
    "IsGameOfTheWeek",      // TRUE if avg rank < 15

    "CachedAt"
  ];

  return getOrCreateSheet("ScheduleResults", headers);
}

// ============================================================================
// ALL-PLAY CALCULATION
// ============================================================================

/**
 * Calculate All-Play record for a single team in a single week
 * Compares their score against all other teams' scores that week
 * @param {Number} teamScore - The team's score for the week
 * @param {Array} allScores - Array of all team scores for the week (including the team)
 * @returns {Object} - { wins, losses, ties }
 */
function calculateWeeklyAllPlay(teamScore, allScores) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  allScores.forEach(otherScore => {
    if (otherScore === teamScore) {
      // Skip self-comparison (exact match is likely self)
      // But if it's a true tie with another team, we need to count it
      // We'll handle this by counting all comparisons then subtracting 1 for self
    }

    if (teamScore > otherScore) {
      wins++;
    } else if (teamScore < otherScore) {
      losses++;
    } else {
      ties++;
    }
  });

  // Subtract 1 tie for self-comparison (score === score)
  ties = Math.max(0, ties - 1);

  return { wins, losses, ties };
}

/**
 * Calculate All-Play percentage from wins/losses/ties
 * Formula: (wins * 2 + ties) / ((wins + losses + ties) * 2)
 */
function calculateAllPlayPct(wins, losses, ties) {
  const totalGames = wins + losses + ties;
  if (totalGames === 0) return 0;

  return (wins * 2 + ties) / (totalGames * 2);
}

/**
 * Get all weekly scores for a year through a specific week
 * Uses cache where available, fetches from API where needed
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Object} - { weeklyScores: { week -> { franchiseId -> score } }, matchups: { week -> [{ f1, f2, score1, score2 }] } }
 */
function getWeeklyScoresAndMatchups(year, throughWeek) {
  const weeklyScores = {};
  const weeklyMatchups = {};

  // Fetch full schedule to get matchups
  const allMatchups = fetchSchedule(year);

  for (let week = 1; week <= throughWeek; week++) {
    // Get scores for this week from cache or API
    const weekResults = getWeeklyResultsWithCache(year, week);

    weeklyScores[week] = {};
    weekResults.forEach(result => {
      weeklyScores[week][result.franchiseId] = result.score;
    });

    // Get matchups for this week
    weeklyMatchups[week] = allMatchups
      .filter(m => m.week === week)
      .map(m => ({
        franchise1: m.franchises[0].franchiseId,
        franchise2: m.franchises[1].franchiseId,
        score1: m.franchises[0].score,
        score2: m.franchises[1].score,
        result1: m.franchises[0].result,
        result2: m.franchises[1].result
      }));
  }

  return { weeklyScores, weeklyMatchups };
}

/**
 * Calculate All-Play data for all teams from ScheduleResults sheet
 * Only counts weeks where team had an opponent (excludes BYE weeks)
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include (max 12 for regular season)
 * @returns {Object} - Map of franchiseId -> { allPlay: {wins, losses, ties, pct}, oppAllPlay: {wins, losses, ties, pct}, pointsFor }
 */
function calculateAllPlayDataFromScheduleResults(year, throughWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("ScheduleResults sheet is empty - populating now...");
    populateScheduleResults(year, throughWeek);
    return calculateAllPlayDataFromScheduleResults(year, throughWeek);
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Initialize tracking for all franchises
  const franchiseData = {};
  const franchiseConferenceMap = getFranchiseConferenceMap();

  Object.keys(franchiseConferenceMap).forEach(fId => {
    franchiseData[fId] = {
      allPlay: { wins: 0, losses: 0, ties: 0 },
      oppAllPlay: { wins: 0, losses: 0, ties: 0 },
      pointsFor: 0,  // Only counts games played (not bye weeks)
      gamesPlayed: 0
    };
  });

  // Process each row from ScheduleResults
  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);

    if (rowYear !== year || rowWeek > throughWeek) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const gameResult = row[colMap["GameResult"]];

    if (!franchiseData[franchiseId]) return;

    // Skip BYE weeks - they don't count for All-Play or points
    if (gameResult === "BYE") return;

    const teamScore = Number(row[colMap["TeamScore"]] || 0);
    const allPlayWins = Number(row[colMap["AllPlayWins"]] || 0);
    const allPlayLosses = Number(row[colMap["AllPlayLosses"]] || 0);
    const allPlayTies = Number(row[colMap["AllPlayTies"]] || 0);
    const oppAllPlayWins = Number(row[colMap["OppAllPlayWins"]] || 0);
    const oppAllPlayLosses = Number(row[colMap["OppAllPlayLosses"]] || 0);
    const oppAllPlayTies = Number(row[colMap["OppAllPlayTies"]] || 0);

    // Aggregate All-Play
    franchiseData[franchiseId].allPlay.wins += allPlayWins;
    franchiseData[franchiseId].allPlay.losses += allPlayLosses;
    franchiseData[franchiseId].allPlay.ties += allPlayTies;

    // Aggregate Opponent All-Play
    franchiseData[franchiseId].oppAllPlay.wins += oppAllPlayWins;
    franchiseData[franchiseId].oppAllPlay.losses += oppAllPlayLosses;
    franchiseData[franchiseId].oppAllPlay.ties += oppAllPlayTies;

    // Aggregate points (only for games played)
    franchiseData[franchiseId].pointsFor += teamScore;
    franchiseData[franchiseId].gamesPlayed++;
  });

  // Calculate percentages
  Object.values(franchiseData).forEach(fd => {
    fd.allPlay.pct = calculateAllPlayPct(
      fd.allPlay.wins,
      fd.allPlay.losses,
      fd.allPlay.ties
    );
    fd.oppAllPlay.pct = calculateAllPlayPct(
      fd.oppAllPlay.wins,
      fd.oppAllPlay.losses,
      fd.oppAllPlay.ties
    );
  });

  return franchiseData;
}

/**
 * Calculate All-Play data for all teams (legacy function - now uses ScheduleResults)
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include (max 12 for regular season)
 * @returns {Object} - Map of franchiseId -> { allPlay: {wins, losses, ties, pct}, oppAllPlay: {wins, losses, ties, pct} }
 */
function calculateAllPlayData(year, throughWeek) {
  return calculateAllPlayDataFromScheduleResults(year, throughWeek);
}

// ============================================================================
// RECORD CALCULATION
// ============================================================================

/**
 * Calculate regular season record (H2H wins/losses) from ScheduleResults
 * Only counts games where team had an opponent (excludes BYE weeks)
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include (max 12)
 * @returns {Object} - Map of franchiseId -> { wins, losses, ties, pointsFor }
 */
function calculateRegularSeasonRecords(year, throughWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  const records = {};
  const franchiseConferenceMap = getFranchiseConferenceMap();

  // Initialize all franchises
  Object.keys(franchiseConferenceMap).forEach(fId => {
    records[fId] = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
  });

  if (data.length <= 1) {
    // Sheet is empty, fall back to schedule-based calculation
    Logger.log("ScheduleResults empty, using schedule API...");
    const schedule = getSeasonSchedule(year, throughWeek);

    schedule.weeks.forEach(weekData => {
      weekData.matchups.forEach(matchup => {
        const f1 = matchup.franchise1;
        const f2 = matchup.franchise2;

        if (!records[f1]) records[f1] = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
        if (!records[f2]) records[f2] = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };

        records[f1].pointsFor += matchup.score1 || 0;
        records[f2].pointsFor += matchup.score2 || 0;

        if (matchup.result1 === "W" || (matchup.score1 > matchup.score2 && matchup.score1 > 0)) {
          records[f1].wins++;
          records[f2].losses++;
        } else if (matchup.result2 === "W" || (matchup.score2 > matchup.score1 && matchup.score2 > 0)) {
          records[f2].wins++;
          records[f1].losses++;
        } else if (matchup.score1 > 0 && matchup.score2 > 0) {
          records[f1].ties++;
          records[f2].ties++;
        }
      });
    });

    return records;
  }

  // Read from ScheduleResults
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);

    if (rowYear !== year || rowWeek > throughWeek) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const gameResult = row[colMap["GameResult"]];
    const teamScore = Number(row[colMap["TeamScore"]] || 0);

    if (!records[franchiseId]) return;

    // Skip BYE weeks - no points counted
    if (gameResult === "BYE") return;

    // Count points (only for games played)
    records[franchiseId].pointsFor += teamScore;

    // Count W/L/T
    if (gameResult === "W") {
      records[franchiseId].wins++;
    } else if (gameResult === "L") {
      records[franchiseId].losses++;
    } else if (gameResult === "T") {
      records[franchiseId].ties++;
    }
  });

  return records;
}

/**
 * Calculate postseason record (weeks 13-17) from schedule
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Current week (if > 12, includes postseason)
 * @returns {Object} - Map of franchiseId -> { wins, losses }
 */
function calculatePostseasonRecords(year, throughWeek) {
  if (throughWeek <= 12) {
    // No postseason yet
    const records = {};
    const franchiseConferenceMap = getFranchiseConferenceMap();
    Object.keys(franchiseConferenceMap).forEach(fId => {
      records[fId] = { wins: 0, losses: 0 };
    });
    return records;
  }

  const allMatchups = fetchSchedule(year);
  const records = {};

  // Initialize all franchises
  const franchiseConferenceMap = getFranchiseConferenceMap();
  Object.keys(franchiseConferenceMap).forEach(fId => {
    records[fId] = { wins: 0, losses: 0 };
  });

  // Filter to postseason weeks (13-17) up to throughWeek
  const postseasonMatchups = allMatchups.filter(m => m.week >= 13 && m.week <= throughWeek);

  postseasonMatchups.forEach(matchup => {
    const f1 = matchup.franchises[0];
    const f2 = matchup.franchises[1];

    if (!records[f1.franchiseId]) records[f1.franchiseId] = { wins: 0, losses: 0 };
    if (!records[f2.franchiseId]) records[f2.franchiseId] = { wins: 0, losses: 0 };

    // Determine winner
    if (f1.result === "W") {
      records[f1.franchiseId].wins++;
      records[f2.franchiseId].losses++;
    } else if (f2.result === "W") {
      records[f2.franchiseId].wins++;
      records[f1.franchiseId].losses++;
    } else if (f1.score > 0 && f2.score > 0) {
      // Fallback: use scores if results not populated
      if (f1.score > f2.score) {
        records[f1.franchiseId].wins++;
        records[f2.franchiseId].losses++;
      } else if (f2.score > f1.score) {
        records[f2.franchiseId].wins++;
        records[f1.franchiseId].losses++;
      }
    }
  });

  return records;
}

/**
 * Find the Week 17 championship game winner
 * @param {Number} year - Season year
 * @returns {String|null} - Franchise ID of the champion, or null if not determined
 */
/**
 * Load confirmed rivalries from the Rivalries sheet and return as a Set of matchup keys
 * Matchup key format: "001-002" (sorted franchise IDs)
 * @returns {Set} - Set of rivalry matchup keys for quick lookup
 */
function loadConfirmedRivalryMatchups() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("Rivalries");
  const matchups = new Set();

  if (!sheet) {
    Logger.log("Rivalries sheet not found");
    return matchups;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return matchups;

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Find columns (flexible naming)
  const teamACol = colMap["Team A"] ?? colMap["TeamA"] ?? 0;
  const teamBCol = colMap["Team B"] ?? colMap["TeamB"] ?? 2;
  const statusCol = colMap["Status"] ?? -1;

  data.slice(1).forEach(row => {
    // Must have both teams
    if (!row[teamACol] || !row[teamBCol]) return;
    // Must be confirmed (if status column exists)
    if (statusCol !== -1 && String(row[statusCol]).toUpperCase() !== "CONFIRMED") return;

    const teamA = String(Number(row[teamACol]) || row[teamACol]).padStart(3, "0");
    const teamB = String(Number(row[teamBCol]) || row[teamBCol]).padStart(3, "0");

    // Create sorted matchup key
    const matchupKey = [teamA, teamB].sort().join("-");
    matchups.add(matchupKey);
  });

  return matchups;
}

function getChampionshipWinner(year) {
  const allMatchups = fetchSchedule(year);

  // Find Week 17 matchups (championship week)
  const week17Matchups = allMatchups.filter(m => m.week === 17);

  if (week17Matchups.length === 0) {
    Logger.log("No Week 17 matchups found");
    return null;
  }

  // The championship game should be the first matchup in Week 17
  const championshipGame = week17Matchups[0];

  const f1 = championshipGame.franchises[0];
  const f2 = championshipGame.franchises[1];

  // Determine winner
  if (f1.result === "W") {
    Logger.log(`Championship winner: ${f1.franchiseId}`);
    return f1.franchiseId;
  } else if (f2.result === "W") {
    Logger.log(`Championship winner: ${f2.franchiseId}`);
    return f2.franchiseId;
  } else if (f1.score > 0 && f2.score > 0) {
    // Fallback: use scores
    if (f1.score > f2.score) {
      Logger.log(`Championship winner (by score): ${f1.franchiseId}`);
      return f1.franchiseId;
    } else if (f2.score > f1.score) {
      Logger.log(`Championship winner (by score): ${f2.franchiseId}`);
      return f2.franchiseId;
    }
  }

  Logger.log("Championship game not yet decided");
  return null;
}

/**
 * Get conference records from ScheduleResults
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include (max 12)
 * @returns {Object} - Map of franchiseId -> { wins, losses }
 */
function getConferenceRecords(year, throughWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  const records = {};
  const franchiseConferenceMap = getFranchiseConferenceMap();

  // Initialize all franchises
  Object.keys(franchiseConferenceMap).forEach(fId => {
    records[fId] = { wins: 0, losses: 0 };
  });

  if (data.length <= 1) {
    // Fall back to schedule utility
    const schedule = getSeasonSchedule(year, throughWeek);
    Object.keys(franchiseConferenceMap).forEach(fId => {
      records[fId] = {
        wins: schedule.conferenceWins[fId] || 0,
        losses: schedule.conferenceLosses[fId] || 0
      };
    });
    return records;
  }

  // Read from ScheduleResults
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);

    if (rowYear !== year || rowWeek > throughWeek) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const gameResult = row[colMap["GameResult"]];
    const rawIsConf = row[colMap["IsConferenceGame"]];
    const isConferenceGame = rawIsConf === true || String(rawIsConf).toUpperCase() === "TRUE";

    if (!records[franchiseId]) return;

    // Only count conference games
    if (!isConferenceGame || gameResult === "BYE") return;

    if (gameResult === "W") {
      records[franchiseId].wins++;
    } else if (gameResult === "L") {
      records[franchiseId].losses++;
    }
  });

  return records;
}

// ============================================================================
// RANKING CALCULATION
// ============================================================================

/**
 * Calculate ranking score for a team
 * Formula: ((Regular Season Wins + 1) * (All-Play % + Opp All-Play %)) + Postseason Wins
 */
function calculateRankingScore(regularSeasonWins, allPlayPct, oppAllPlayPct, postseasonWins) {
  return ((regularSeasonWins + 1) * (allPlayPct + oppAllPlayPct)) + postseasonWins;
}

/**
 * Get previous week's rankings for comparison
 * @param {Number} year - Season year
 * @param {Number} week - Current week
 * @returns {Object} - Map of franchiseId -> previousRank
 */
function getPreviousRankings(year, rankingWeek) {
  const sheet = getPowerRankingsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("No existing rankings in sheet");
    return {};
  }

  const headers = data[0];
  const yearIdx = headers.indexOf("Year");
  const weekIdx = headers.indexOf("Week");
  const franchiseIdx = headers.indexOf("FranchiseID");
  const rankIdx = headers.indexOf("Rank");

  const previousWeek = rankingWeek - 1;
  const previousRanks = {};

  if (previousWeek < 1) {
    Logger.log("No previous week for Week 1 rankings");
    return {};
  }

  data.slice(1).forEach(row => {
    if (Number(row[yearIdx]) === year && Number(row[weekIdx]) === previousWeek) {
      const franchiseId = String(row[franchiseIdx]).padStart(3, "0");
      previousRanks[franchiseId] = Number(row[rankIdx]);
    }
  });

  if (Object.keys(previousRanks).length === 0) {
    Logger.log(`WARNING: No Week ${previousWeek} rankings found for ${year}.`);
    Logger.log(`Movement and PreviousRank will not be calculated.`);
    if (previousWeek === 1) {
      Logger.log(`TIP: Enter Week 1 preseason coaches poll manually before calculating Week 2.`);
    }
  }

  return previousRanks;
}

/**
 * Calculate movement string from previous rank
 * Lower rank number = better (rank #1 is best)
 * Movement shows the change in rank number:
 * - Negative (▲5) means rank improved (e.g., #10 → #5, rank went DOWN which is good)
 * - Positive (▼5) means rank dropped (e.g., #5 → #10, rank went UP which is bad)
 */
function calculateMovement(currentRank, previousRank) {
  if (!previousRank) return "NEW";

  // Calculate rank change: currentRank - previousRank
  // Going from #10 to #5 = 5 - 10 = -5 (improved, show as ▲5)
  // Going from #5 to #10 = 10 - 5 = +5 (dropped, show as ▼5)
  const change = currentRank - previousRank;
  if (change < 0) return `▲${Math.abs(change)}`;  // Improved (rank decreased)
  if (change > 0) return `▼${change}`;             // Dropped (rank increased)
  return "-";
}

/**
 * Get team name map from FranchiseLookup
 */
function getTeamNameMap() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf("Franchise ID");
  const nameIdx = headers.indexOf("Team Name");

  if (idIdx === -1 || nameIdx === -1) return {};

  const map = {};
  data.slice(1).forEach(row => {
    const franchiseId = String(Number(row[idIdx] || 0)).padStart(3, "0");
    map[franchiseId] = row[nameIdx] || "";
  });

  return map;
}

/**
 * Main function to calculate power rankings
 * @param {Number} year - Season year
 * @param {Number} dataWeek - Week to calculate data through (1-17)
 * @param {Number} rankingWeek - The ranking week label (for previous rank lookup). Defaults to dataWeek + 1.
 * @returns {Array} - Sorted array of ranking objects
 */
function calculatePowerRankings(year, dataWeek, rankingWeek = null) {
  // Default ranking week is dataWeek + 1 (Week N rankings use Week N-1 data)
  rankingWeek = rankingWeek || (dataWeek + 1);

  Logger.log(`=== Calculating Power Rankings for ${year} ===`);
  Logger.log(`  Ranking Week: ${rankingWeek} (based on data through Week ${dataWeek})`);

  const franchiseConferenceMap = getFranchiseConferenceMap();
  const teamNameMap = getTeamNameMap();

  // Determine regular season week cap (All-Play only through week 12)
  const regularSeasonWeek = Math.min(dataWeek, 12);

  // Calculate all data components from ScheduleResults
  Logger.log("Calculating All-Play data from ScheduleResults...");
  const allPlayData = calculateAllPlayDataFromScheduleResults(year, regularSeasonWeek);

  Logger.log("Calculating regular season records...");
  const regularSeasonRecords = calculateRegularSeasonRecords(year, regularSeasonWeek);

  Logger.log("Calculating postseason records...");
  const postseasonRecords = calculatePostseasonRecords(year, dataWeek);

  Logger.log("Calculating conference records...");
  const conferenceRecords = getConferenceRecords(year, regularSeasonWeek);

  // Get previous rankings for movement tracking (uses ranking week, not data week)
  const previousRankings = getPreviousRankings(year, rankingWeek);
  Logger.log(`Found ${Object.keys(previousRankings).length} previous rankings from Week ${rankingWeek - 1}`);

  // Build rankings array
  const rankings = [];

  Object.keys(franchiseConferenceMap).forEach(franchiseId => {
    const allPlayInfo = allPlayData[franchiseId] || {
      allPlay: { wins: 0, losses: 0, ties: 0, pct: 0 },
      oppAllPlay: { wins: 0, losses: 0, ties: 0, pct: 0 },
      pointsFor: 0
    };
    const allPlay = allPlayInfo.allPlay;
    const oppAllPlay = allPlayInfo.oppAllPlay;
    const regular = regularSeasonRecords[franchiseId] || { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
    const postseason = postseasonRecords[franchiseId] || { wins: 0, losses: 0 };
    const conference = conferenceRecords[franchiseId] || { wins: 0, losses: 0 };

    const rankingScore = calculateRankingScore(
      regular.wins,
      allPlay.pct,
      oppAllPlay.pct,
      postseason.wins
    );

    // Use pointsFor from allPlayData (which correctly excludes bye weeks)
    const totalPoints = allPlayInfo.pointsFor || regular.pointsFor;

    rankings.push({
      franchiseId,
      teamName: teamNameMap[franchiseId] || `Team ${franchiseId}`,
      conference: franchiseConferenceMap[franchiseId] || "",
      rankingScore,
      regularSeasonWins: regular.wins,
      regularSeasonLosses: regular.losses,
      regularSeasonTies: regular.ties,
      allPlayWins: allPlay.wins,
      allPlayLosses: allPlay.losses,
      allPlayTies: allPlay.ties,
      allPlayPct: allPlay.pct,
      oppAllPlayWins: oppAllPlay.wins,
      oppAllPlayLosses: oppAllPlay.losses,
      oppAllPlayTies: oppAllPlay.ties,
      oppAllPlayPct: oppAllPlay.pct,
      postseasonWins: postseason.wins,
      postseasonLosses: postseason.losses,
      conferenceWins: conference.wins,
      conferenceLosses: conference.losses,
      totalPointsScored: totalPoints
    });
  });

  // Sort by ranking score (descending), then by tiebreakers
  rankings.sort((a, b) => {
    // Primary: Ranking score
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }

    // Tiebreaker 1: Total points scored
    if (b.totalPointsScored !== a.totalPointsScored) {
      return b.totalPointsScored - a.totalPointsScored;
    }

    // Tiebreaker 2: All-Play % (without opponent adjustment)
    if (b.allPlayPct !== a.allPlayPct) {
      return b.allPlayPct - a.allPlayPct;
    }

    // Tiebreaker 3: Alphabetical by team name
    return a.teamName.localeCompare(b.teamName);
  });

  // Championship override: When data includes Week 17, champion is automatically #1
  // This would be for Week 18 rankings (final rankings after championship)
  let championId = null;
  if (dataWeek >= 17) {
    championId = getChampionshipWinner(year);
    if (championId) {
      Logger.log(`Championship override: ${championId} is #1`);

      // Find the champion in the rankings and move to front
      const championIndex = rankings.findIndex(t => t.franchiseId === championId);
      if (championIndex > 0) {
        const champion = rankings.splice(championIndex, 1)[0];
        rankings.unshift(champion);
      }
    }
  }

  // Assign ranks and calculate movement
  rankings.forEach((team, index) => {
    team.rank = index + 1;
    team.previousRank = previousRankings[team.franchiseId] || null;
    team.movement = calculateMovement(team.rank, team.previousRank);

    // Mark champion
    if (championId && team.franchiseId === championId) {
      team.isChampion = true;
    }
  });

  Logger.log(`Calculated rankings for ${rankings.length} teams`);

  return rankings;
}

// ============================================================================
// SHEET WRITING
// ============================================================================

/**
 * Write rankings to the PowerRankings sheet
 * @param {Number} year - Season year
 * @param {Number} week - Week number
 * @param {Array} rankings - Array of ranking objects
 */
function writeRankingsToSheet(year, week, rankings) {
  const sheet = getPowerRankingsSheet();
  const calculatedAt = new Date().toISOString();

  // Clear ALL existing data (keep only header row)
  // PowerRankings only shows current week - no history needed
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  // Write new rankings starting at row 2
  const rows = rankings.map(team => [
    year,
    week,
    team.franchiseId,
    team.teamName,
    team.conference,
    team.rank,
    team.previousRank || "",
    team.movement,
    team.rankingScore,
    team.regularSeasonWins,
    team.regularSeasonLosses,
    team.regularSeasonTies,
    team.allPlayWins,
    team.allPlayLosses,
    team.allPlayTies,
    team.allPlayPct,
    team.oppAllPlayWins,
    team.oppAllPlayLosses,
    team.oppAllPlayTies,
    team.oppAllPlayPct,
    team.postseasonWins,
    team.postseasonLosses,
    team.conferenceWins,
    team.conferenceLosses,
    team.totalPointsScored,
    calculatedAt
  ]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  Logger.log(`Wrote ${rows.length} rankings to sheet for ${year} Week ${week}`);
}

/**
 * Populate ScheduleResults sheet with all game data and cumulative season stats
 * Uses INCREMENTAL approach - only processes weeks that need updating.
 *
 * Creates 100 rows per week (one per team) with:
 * - Weekly game data (matchup details, weekly All-Play)
 * - Cumulative season data through that week (record, All-Play %, ranking score, rank)
 *
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Week to populate through (includes schedule data)
 * @param {Number} cumulativeWeek - Optional: Week to calculate cumulative stats through (default: throughWeek)
 *                                  Use this to show Week N schedule with Week N-1 cumulative data
 */
function populateScheduleResults(year, throughWeek, cumulativeWeek = null) {
  // If no cumulativeWeek specified, cumulative stats include all weeks up to throughWeek
  cumulativeWeek = cumulativeWeek !== null ? cumulativeWeek : throughWeek;

  // ALWAYS populate schedule data for ALL regular season weeks
  // This ensures getRemainingSchedule can find future opponents for projections
  const regularSeasonWeeks = getRegularSeasonWeeksForYear(year);
  const scheduleWeek = Math.max(throughWeek, regularSeasonWeeks);

  const sheet = getScheduleResultsSheet();
  const cachedAt = new Date().toISOString();

  const franchiseConferenceMap = getFranchiseConferenceMap();
  const teamNameMap = getTeamNameMap();
  const franchiseIds = Object.keys(franchiseConferenceMap);

  // Read existing data to determine what needs updating (INCREMENTAL approach)
  const existingData = sheet.getDataRange().getValues();
  const headers = existingData[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Analyze existing data for this year
  let maxExistingWeekWithData = 0;  // Last week that has game results (not just schedule)
  let maxExistingScheduleWeek = 0;  // Last week that has schedule info (even if no results)
  const existingWeeksSet = new Set();
  const existingCumulative = {};  // franchiseId -> cumulative data from last complete week

  existingData.slice(1).forEach(row => {
    if (Number(row[colMap["Year"]]) !== year) return;

    const week = Number(row[colMap["Week"]]);
    const gameResult = row[colMap["GameResult"]];
    const opponentId = row[colMap["OpponentID"]];
    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");

    existingWeeksSet.add(week);

    // Track max week with schedule info
    if (opponentId && opponentId !== "") {
      if (week > maxExistingScheduleWeek) {
        maxExistingScheduleWeek = week;
      }
    }

    // Check if this week has actual game data (W/L/T result, not empty or just schedule)
    if (gameResult === "W" || gameResult === "L" || gameResult === "T") {
      if (week > maxExistingWeekWithData) {
        maxExistingWeekWithData = week;
      }
    }
  });

  // Determine which weeks we need to process
  // - For DATA weeks: start from (maxExistingWeekWithData + 1) through cumulativeWeek
  // - For SCHEDULE weeks: ensure all weeks through scheduleWeek have opponent info
  const startProcessingWeek = maxExistingWeekWithData + 1;
  const needsScheduleUpdate = maxExistingScheduleWeek < scheduleWeek;

  Logger.log(`=== INCREMENTAL ScheduleResults Update ===`);
  Logger.log(`Existing weeks: ${[...existingWeeksSet].sort((a, b) => a - b).join(', ') || 'none'}`);
  Logger.log(`Max week with game data: ${maxExistingWeekWithData}`);
  Logger.log(`Max week with schedule: ${maxExistingScheduleWeek}`);
  Logger.log(`Target: scheduleWeek=${scheduleWeek}, cumulativeWeek=${cumulativeWeek}`);
  Logger.log(`Will process weeks: ${startProcessingWeek}-${scheduleWeek}`);

  // If existing data is already complete (has all schedule AND cumulative data), skip
  if (maxExistingWeekWithData >= cumulativeWeek && !needsScheduleUpdate) {
    Logger.log(`Data already up to date - skipping`);
    return;
  }

  // Load cumulative data from the last complete week (if any)
  if (maxExistingWeekWithData > 0) {
    existingData.slice(1).forEach(row => {
      if (Number(row[colMap["Year"]]) !== year) return;
      if (Number(row[colMap["Week"]]) !== maxExistingWeekWithData) return;

      const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
      existingCumulative[franchiseId] = {
        wins: Number(row[colMap["SeasonWins"]] || 0),
        losses: Number(row[colMap["SeasonLosses"]] || 0),
        ties: Number(row[colMap["SeasonTies"]] || 0),
        pointsFor: Number(row[colMap["SeasonPointsFor"]] || 0),
        confWins: Number(row[colMap["SeasonConfWins"]] || 0),
        confLosses: Number(row[colMap["SeasonConfLosses"]] || 0),
        allPlayWins: Number(row[colMap["SeasonAllPlayWins"]] || 0),
        allPlayLosses: Number(row[colMap["SeasonAllPlayLosses"]] || 0),
        allPlayTies: Number(row[colMap["SeasonAllPlayTies"]] || 0),
        oppAllPlayWins: Number(row[colMap["SeasonOppAllPlayWins"]] || 0),
        oppAllPlayLosses: Number(row[colMap["SeasonOppAllPlayLosses"]] || 0),
        oppAllPlayTies: Number(row[colMap["SeasonOppAllPlayTies"]] || 0),
        postseasonWins: Number(row[colMap["PostseasonWins"]] || 0),
        postseasonLosses: Number(row[colMap["PostseasonLosses"]] || 0)
      };
    });
    Logger.log(`Loaded cumulative data from Week ${maxExistingWeekWithData} for ${Object.keys(existingCumulative).length} teams`);
  }

  // Keep rows from other years + completed weeks from this year
  const rowsToKeep = existingData.slice(1).filter(row => {
    const rowYear = Number(row[colMap["Year"]]);
    if (rowYear !== year) return true;  // Keep other years

    const rowWeek = Number(row[colMap["Week"]]);
    // Keep weeks before our start processing week
    return rowWeek < startProcessingWeek;
  });

  // Clear all data rows and write back rows we're keeping
  if (existingData.length > 1) {
    sheet.getRange(2, 1, existingData.length - 1, headers.length).clearContent();
  }
  if (rowsToKeep.length > 0) {
    sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  }

  const weeksKept = maxExistingWeekWithData > 0 ? startProcessingWeek - 1 : 0;
  Logger.log(`Kept ${weeksKept} weeks (${weeksKept * franchiseIds.length} rows), will add weeks ${startProcessingWeek}-${scheduleWeek}`);

  // Fetch all schedule data
  const allMatchups = fetchSchedule(year);

  // Load confirmed rivalries for marking rivalry games
  const rivalryMatchups = loadConfirmedRivalryMatchups();
  Logger.log(`Loaded ${rivalryMatchups.size} confirmed rivalry matchups`);

  // Initialize cumulative trackers for all franchises
  // INCREMENTAL: Start from existing cumulative data if available
  const cumulative = {};
  franchiseIds.forEach(fId => {
    if (existingCumulative[fId]) {
      // Copy from existing data
      cumulative[fId] = { ...existingCumulative[fId] };
    } else {
      // Initialize fresh
      cumulative[fId] = {
        wins: 0, losses: 0, ties: 0,
        pointsFor: 0,
        confWins: 0, confLosses: 0,
        allPlayWins: 0, allPlayLosses: 0, allPlayTies: 0,
        oppAllPlayWins: 0, oppAllPlayLosses: 0, oppAllPlayTies: 0,
        postseasonWins: 0, postseasonLosses: 0
      };
    }
  });

  // Build rows for each week - INCREMENTAL: start from startProcessingWeek
  // Process through scheduleWeek to ensure all schedule data is populated
  const rows = [];

  for (let week = startProcessingWeek; week <= scheduleWeek; week++) {
    Logger.log(`Processing Week ${week}...`);

    const isPostseason = week > 12;
    const isFinalWeek = week === 18;  // Week 18 = Final Rankings (no games)

    // Get matchups for this week
    const weekMatchups = allMatchups.filter(m => m.week === week);

    // Only fetch scores for weeks with finalized games (not future schedule weeks)
    // Week 18 (Final Rankings) also has no games
    const scoreMap = {};
    const hasGameData = week <= cumulativeWeek && !isFinalWeek;

    if (hasGameData) {
      // Get scores for this week - only if games have been played
      const weekResults = getWeeklyResultsWithCache(year, week);
      weekResults.forEach(result => {
        scoreMap[result.franchiseId] = result.score;
      });
    }

    // Build opponent map for this week
    const opponentMap = {};
    weekMatchups.forEach(m => {
      const f1 = m.franchises[0];
      const f2 = m.franchises[1];
      const conf1 = franchiseConferenceMap[f1.franchiseId];
      const conf2 = franchiseConferenceMap[f2.franchiseId];
      const isConf = conf1 && conf2 && conf1 === conf2;

      // Determine game result
      let result1 = "T";
      let result2 = "T";
      if (f1.result === "W" || (f1.score > f2.score && f1.score > 0)) {
        result1 = "W";
        result2 = "L";
      } else if (f2.result === "W" || (f2.score > f1.score && f2.score > 0)) {
        result1 = "L";
        result2 = "W";
      }

      opponentMap[f1.franchiseId] = {
        id: f2.franchiseId,
        name: teamNameMap[f2.franchiseId] || "",
        score: f2.score,
        result: result1,
        isConf: isConf
      };
      opponentMap[f2.franchiseId] = {
        id: f1.franchiseId,
        name: teamNameMap[f1.franchiseId] || "",
        score: f1.score,
        result: result2,
        isConf: isConf
      };
    });

    // Get all scores for All-Play calculation (only teams that played)
    const teamsWithGames = Object.keys(opponentMap);
    const allScoresArray = teamsWithGames
      .map(fId => scoreMap[fId])
      .filter(score => score !== undefined && score > 0);

    // Process each franchise for this week
    const weekData = {};  // Store data for ranking calculation

    // Check if this is the schedule week (beyond cumulative data)
    const isScheduleWeek = week > cumulativeWeek;

    franchiseIds.forEach(franchiseId => {
      const opponent = opponentMap[franchiseId];

      let gameResult = "";
      let opponentId = "";
      let opponentName = "";
      let opponentScore = "";
      let teamScore = "";
      let isConferenceGame = false;
      let weeklyAllPlay = { wins: "", losses: "", ties: "" };
      let weeklyOppAllPlay = { wins: "", losses: "", ties: "" };

      if (opponent) {
        // Always populate schedule info (who plays who)
        opponentId = opponent.id;
        opponentName = opponent.name;
        isConferenceGame = opponent.isConf;

        if (isScheduleWeek) {
          // Schedule week: only show matchup, NOT results (games haven't happened)
          gameResult = "";  // Leave blank - game not played yet
          teamScore = "";
          opponentScore = "";
          // Weekly All-Play stays blank
        } else {
          // Completed week: populate all game data
          gameResult = opponent.result || "BYE";
          teamScore = scoreMap[franchiseId] || 0;
          opponentScore = opponent.score || 0;

          // Calculate weekly All-Play
          if (teamScore > 0) {
            weeklyAllPlay = calculateWeeklyAllPlay(teamScore, allScoresArray);
          } else {
            weeklyAllPlay = { wins: 0, losses: 0, ties: 0 };
          }
          if (opponentScore > 0) {
            weeklyOppAllPlay = calculateWeeklyAllPlay(opponentScore, allScoresArray);
          } else {
            weeklyOppAllPlay = { wins: 0, losses: 0, ties: 0 };
          }

          // Update cumulative stats (only for completed weeks, non-BYE games)
          if (gameResult !== "BYE") {
            if (!isPostseason) {
              // Regular season
              if (gameResult === "W") cumulative[franchiseId].wins++;
              else if (gameResult === "L") cumulative[franchiseId].losses++;
              else if (gameResult === "T") cumulative[franchiseId].ties++;

              cumulative[franchiseId].pointsFor += teamScore;

              if (isConferenceGame) {
                if (gameResult === "W") cumulative[franchiseId].confWins++;
                else if (gameResult === "L") cumulative[franchiseId].confLosses++;
              }

              // Cumulative All-Play (regular season only)
              cumulative[franchiseId].allPlayWins += weeklyAllPlay.wins;
              cumulative[franchiseId].allPlayLosses += weeklyAllPlay.losses;
              cumulative[franchiseId].allPlayTies += weeklyAllPlay.ties;
              cumulative[franchiseId].oppAllPlayWins += weeklyOppAllPlay.wins;
              cumulative[franchiseId].oppAllPlayLosses += weeklyOppAllPlay.losses;
              cumulative[franchiseId].oppAllPlayTies += weeklyOppAllPlay.ties;
            } else {
              // Postseason
              if (gameResult === "W") cumulative[franchiseId].postseasonWins++;
              else if (gameResult === "L") cumulative[franchiseId].postseasonLosses++;
            }
          }
        }
      } else {
        // No opponent = BYE week or Final week (Week 18)
        if (isFinalWeek) {
          gameResult = "FINAL";  // Week 18 Final Rankings - no games scheduled
        } else {
          gameResult = "BYE";    // Regular bye week
        }
        teamScore = "";
        opponentScore = "";
      }

      // Calculate percentages
      const c = cumulative[franchiseId];
      const seasonAllPlayPct = calculateAllPlayPct(c.allPlayWins, c.allPlayLosses, c.allPlayTies);
      const seasonOppAllPlayPct = calculateAllPlayPct(c.oppAllPlayWins, c.oppAllPlayLosses, c.oppAllPlayTies);

      // Calculate ranking score
      const rankingScore = calculateRankingScore(c.wins, seasonAllPlayPct, seasonOppAllPlayPct, c.postseasonWins);

      weekData[franchiseId] = {
        teamScore,
        opponentId,
        opponentName,
        opponentScore,
        gameResult,
        isConferenceGame,
        weeklyAllPlay,
        weeklyOppAllPlay,
        cumulative: { ...c },
        seasonAllPlayPct,
        seasonOppAllPlayPct,
        rankingScore
      };
    });

    // Calculate rankings for this week
    const rankingArray = franchiseIds.map(fId => ({
      franchiseId: fId,
      rankingScore: weekData[fId].rankingScore,
      pointsFor: weekData[fId].cumulative.pointsFor,
      allPlayPct: weekData[fId].seasonAllPlayPct
    }));

    rankingArray.sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      if (b.allPlayPct !== a.allPlayPct) return b.allPlayPct - a.allPlayPct;
      return 0;
    });

    // Check for championship override in Week 17+ (champion is always #1 after championship)
    // Week 17 = Championship week, Week 18 = Final Rankings
    if (week >= 17) {
      const championId = getChampionshipWinner(year);
      if (championId) {
        const champIndex = rankingArray.findIndex(t => t.franchiseId === championId);
        if (champIndex > 0) {
          const champ = rankingArray.splice(champIndex, 1)[0];
          rankingArray.unshift(champ);
          Logger.log(`Championship override: ${championId} moved to #1 for Week ${week}`);
        }
      }
    }

    // Create rank map
    const rankMap = {};
    rankingArray.forEach((team, index) => {
      rankMap[team.franchiseId] = index + 1;
    });

    // Calculate College Gameday data for this week
    // Find each unique matchup and calculate average rank
    const matchupAvgRanks = {};  // key: sorted franchise IDs, value: avg rank
    const processedMatchups = new Set();

    franchiseIds.forEach(franchiseId => {
      const d = weekData[franchiseId];
      if (d.opponentId && d.gameResult !== "BYE") {
        // Create a consistent key for the matchup (sorted IDs)
        const matchupKey = [franchiseId, d.opponentId].sort().join("-");

        if (!processedMatchups.has(matchupKey)) {
          processedMatchups.add(matchupKey);
          const team1Rank = rankMap[franchiseId] || 100;
          const team2Rank = rankMap[d.opponentId] || 100;
          const avgRank = (team1Rank + team2Rank) / 2;
          matchupAvgRanks[matchupKey] = avgRank;
        }
      }
    });

    // Find the Gameday matchup (lowest average rank)
    let gamedayMatchupKey = null;
    let lowestAvgRank = Infinity;

    Object.entries(matchupAvgRanks).forEach(([key, avgRank]) => {
      if (avgRank < lowestAvgRank) {
        lowestAvgRank = avgRank;
        gamedayMatchupKey = key;
      }
    });

    // Build rows for this week
    franchiseIds.forEach(franchiseId => {
      const d = weekData[franchiseId];
      const c = d.cumulative;

      // Calculate Gameday fields for this team
      let opponentRank = "";
      let matchupAvgRank = "";
      let isCollegeGameday = false;
      let isGameOfTheWeek = false;

      if (d.opponentId && d.gameResult !== "BYE") {
        opponentRank = rankMap[d.opponentId] || 100;
        const teamRank = rankMap[franchiseId] || 100;
        matchupAvgRank = (teamRank + opponentRank) / 2;

        // Check if this is the Gameday matchup
        const matchupKey = [franchiseId, d.opponentId].sort().join("-");
        isCollegeGameday = (matchupKey === gamedayMatchupKey);

        // Game of the Week if avg rank < 15
        isGameOfTheWeek = matchupAvgRank < 15;
      }

      // Check if this is a confirmed rivalry game
      const isRivalryGame = d.opponentId ? rivalryMatchups.has(
        [franchiseId, d.opponentId].sort().join("-")
      ) : false;

      rows.push([
        year,
        week,
        franchiseId,
        teamNameMap[franchiseId] || "",
        franchiseConferenceMap[franchiseId] || "",

        // Weekly game data
        d.teamScore,
        d.opponentId,
        d.opponentName,
        d.opponentScore,
        d.gameResult,
        d.isConferenceGame,
        isRivalryGame,
        d.weeklyAllPlay.wins,
        d.weeklyAllPlay.losses,
        d.weeklyAllPlay.ties,
        d.weeklyOppAllPlay.wins,
        d.weeklyOppAllPlay.losses,
        d.weeklyOppAllPlay.ties,

        // Cumulative season data
        c.wins,
        c.losses,
        c.ties,
        c.pointsFor,
        c.confWins,
        c.confLosses,
        c.allPlayWins,
        c.allPlayLosses,
        c.allPlayTies,
        d.seasonAllPlayPct,
        c.oppAllPlayWins,
        c.oppAllPlayLosses,
        c.oppAllPlayTies,
        d.seasonOppAllPlayPct,
        c.postseasonWins,
        c.postseasonLosses,

        // Ranking data
        d.rankingScore,
        rankMap[franchiseId],

        // College Gameday data
        opponentRank,
        matchupAvgRank,
        isCollegeGameday,
        isGameOfTheWeek,

        cachedAt
      ]);
    });
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  const weeksProcessed = throughWeek - startProcessingWeek + 1;
  Logger.log(`INCREMENTAL: Added ${rows.length} rows (${weeksProcessed} weeks × ${franchiseIds.length} teams)`);
  Logger.log(`Total ScheduleResults for ${year}: ${throughWeek} weeks`);
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Get rankings data from ScheduleResults for a specific week
 * This reads the pre-calculated cumulative data from ScheduleResults
 *
 * @param {Number} year - Season year
 * @param {Number} dataWeek - The data week to read from ScheduleResults
 * @returns {Array} - Array of ranking objects sorted by SeasonRank
 */
function getRankingsFromScheduleResults(year, dataWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Filter to the specific year and week
  const weekData = data.slice(1).filter(row =>
    Number(row[colMap["Year"]]) === year &&
    Number(row[colMap["Week"]]) === dataWeek
  );

  if (weekData.length === 0) return [];

  // Map to ranking objects
  const rankings = weekData.map(row => ({
    franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
    teamName: row[colMap["TeamName"]],
    conference: row[colMap["Conference"]],
    rank: Number(row[colMap["SeasonRank"]]),
    rankingScore: Number(row[colMap["RankingScore"]]),
    regularSeasonWins: Number(row[colMap["SeasonWins"]]),
    regularSeasonLosses: Number(row[colMap["SeasonLosses"]]),
    regularSeasonTies: Number(row[colMap["SeasonTies"]]),
    allPlayWins: Number(row[colMap["SeasonAllPlayWins"]]),
    allPlayLosses: Number(row[colMap["SeasonAllPlayLosses"]]),
    allPlayTies: Number(row[colMap["SeasonAllPlayTies"]]),
    allPlayPct: Number(row[colMap["SeasonAllPlayPct"]]),
    oppAllPlayWins: Number(row[colMap["SeasonOppAllPlayWins"]]),
    oppAllPlayLosses: Number(row[colMap["SeasonOppAllPlayLosses"]]),
    oppAllPlayTies: Number(row[colMap["SeasonOppAllPlayTies"]]),
    oppAllPlayPct: Number(row[colMap["SeasonOppAllPlayPct"]]),
    postseasonWins: Number(row[colMap["PostseasonWins"]]),
    postseasonLosses: Number(row[colMap["PostseasonLosses"]]),
    conferenceWins: Number(row[colMap["SeasonConfWins"]]),
    conferenceLosses: Number(row[colMap["SeasonConfLosses"]]),
    totalPointsScored: Number(row[colMap["SeasonPointsFor"]])
  }));

  // Sort by rank
  rankings.sort((a, b) => a.rank - b.rank);

  return rankings;
}

/**
 * Get a team's rank from a specific week in ScheduleResults
 * Used for looking up previous week's rank
 */
function getTeamRankFromScheduleResults(year, week, franchiseId) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return null;

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const normalizedId = String(franchiseId).padStart(3, "0");

  const row = data.slice(1).find(r =>
    Number(r[colMap["Year"]]) === year &&
    Number(r[colMap["Week"]]) === week &&
    String(r[colMap["FranchiseID"]]).padStart(3, "0") === normalizedId
  );

  return row ? Number(row[colMap["SeasonRank"]]) : null;
}

/**
 * Calculate and save rankings for a given ranking week
 *
 * IMPORTANT: Rankings "look backward" - Week N rankings are based on data through Week N-1
 * - Week 1 = Preseason coaches poll (no calculations, manual entry only)
 * - Week 2 rankings = Based on Week 1 results
 * - Week 3 rankings = Based on Weeks 1-2 results
 * - ...
 * - Week 17 rankings = Based on Weeks 1-16 results (before championship)
 * - Week 18 rankings = FINAL RANKINGS - Based on complete season (Weeks 1-17)
 *                      No games scheduled for Week 18, this is the final standings
 *
 * @param {Number} year - Season year
 * @param {Number} rankingWeek - The week number for the rankings (2-18)
 * @param {Boolean} refreshScheduleResults - Whether to refresh ScheduleResults first
 */
function calculateAndSaveRankings(year, rankingWeek, refreshScheduleResults = true) {
  Logger.log(`\n=== calculateAndSaveRankings(${year}, Ranking Week ${rankingWeek}) ===`);

  // Week 1 is preseason coaches poll - no calculations
  if (rankingWeek <= 1) {
    Logger.log("Week 1 is preseason coaches poll - no automatic calculations.");
    Logger.log("Enter Week 1 rankings manually in the PowerRankings sheet.");
    return [];
  }

  // Data week is one behind ranking week (Week 2 rankings use Week 1 data)
  const dataWeek = rankingWeek - 1;
  Logger.log(`Using data through Week ${dataWeek} for Week ${rankingWeek} rankings`);

  // First, populate/refresh ScheduleResults which is the source of truth
  // Include schedule for rankingWeek, but cumulative stats only through dataWeek (N-1)
  if (refreshScheduleResults) {
    Logger.log(`Populating ScheduleResults: Week ${rankingWeek} schedule with data through Week ${dataWeek}...`);
    populateScheduleResults(year, rankingWeek, dataWeek);
  }

  // Pull rankings from ScheduleResults for the selected week
  // Rankings are based on cumulative data, which uses dataWeek
  const rankings = getRankingsFromScheduleResults(year, rankingWeek);

  if (rankings.length === 0) {
    Logger.log("No data found in ScheduleResults for this week.");
    return [];
  }

  // Add previous rank and movement from the week before
  const previousDataWeek = dataWeek - 1;
  rankings.forEach(team => {
    if (previousDataWeek >= 1) {
      team.previousRank = getTeamRankFromScheduleResults(year, previousDataWeek, team.franchiseId);
    } else {
      // For Week 2 rankings (dataWeek=1), look up Week 1 preseason from PowerRankings
      team.previousRank = getPreviousRankFromPowerRankings(year, 1, team.franchiseId);
    }
    team.movement = calculateMovement(team.rank, team.previousRank);
  });

  // Write rankings with the ranking week label
  writeRankingsToSheet(year, rankingWeek, rankings);

  // Log top 10 for verification
  Logger.log("\nTop 10 Rankings:");
  rankings.slice(0, 10).forEach(team => {
    Logger.log(`  ${team.rank}. ${team.teamName} (${team.movement}) - Score: ${team.rankingScore.toFixed(4)}`);
  });

  // For final rankings (Week 18, dataWeek 17), calculate theoretical draft first
  if (dataWeek >= 17) {
    try {
      Logger.log("\n--- Calculating Theoretical Draft Bonuses ---");
      calculateTheoreticalDraft(year);
    } catch (error) {
      Logger.log(`WARNING: Theoretical draft calculation failed: ${error.message}`);
    }
  }

  // Auto-update recruiting bonus dollars whenever rankings are calculated
  try {
    Logger.log("\n--- Updating Recruiting Bonus Dollars ---");
    calculateRecruitingDollars(year, dataWeek);
  } catch (error) {
    Logger.log(`WARNING: Recruiting dollars calculation failed: ${error.message}`);
  }

  return rankings;
}

/**
 * Get previous rank from PowerRankings sheet (for Week 1 preseason lookup)
 */
function getPreviousRankFromPowerRankings(year, week, franchiseId) {
  const sheet = getPowerRankingsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return null;

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const normalizedId = String(franchiseId).padStart(3, "0");

  const row = data.slice(1).find(r =>
    Number(r[colMap["Year"]]) === year &&
    Number(r[colMap["Week"]]) === week &&
    String(r[colMap["FranchiseID"]]).padStart(3, "0") === normalizedId
  );

  return row ? Number(row[colMap["Rank"]]) : null;
}

/**
 * Get current rankings from sheet (without recalculating)
 * @param {Number} year - Season year
 * @param {Number} week - Week number (optional, defaults to latest)
 * @returns {Array} - Array of ranking objects sorted by rank
 */
function getCurrentRankings(year, week = null) {
  const sheet = getPowerRankingsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const headers = data[0];

  // Find the latest week if not specified
  if (!week) {
    const yearIdx = headers.indexOf("Year");
    const weekIdx = headers.indexOf("Week");

    let maxWeek = 0;
    data.slice(1).forEach(row => {
      if (Number(row[yearIdx]) === year) {
        maxWeek = Math.max(maxWeek, Number(row[weekIdx]));
      }
    });
    week = maxWeek;
  }

  if (week === 0) return [];

  // Build column index map
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Filter to requested year/week
  const rankings = data.slice(1)
    .filter(row => Number(row[colMap["Year"]]) === year && Number(row[colMap["Week"]]) === week)
    .map(row => ({
      franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
      teamName: row[colMap["TeamName"]],
      conference: row[colMap["Conference"]],
      rank: Number(row[colMap["Rank"]]),
      previousRank: row[colMap["PreviousRank"]] || null,
      movement: row[colMap["Movement"]],
      rankingScore: Number(row[colMap["RankingScore"]]),
      regularSeasonWins: Number(row[colMap["RegularSeasonWins"]]),
      regularSeasonLosses: Number(row[colMap["RegularSeasonLosses"]]),
      regularSeasonTies: Number(row[colMap["RegularSeasonTies"]] || 0),
      allPlayPct: Number(row[colMap["AllPlayPct"]]),
      oppAllPlayPct: Number(row[colMap["OppAllPlayPct"]]),
      postseasonWins: Number(row[colMap["PostseasonWins"]]),
      postseasonLosses: Number(row[colMap["PostseasonLosses"]]),
      conferenceWins: Number(row[colMap["ConferenceWins"]]),
      conferenceLosses: Number(row[colMap["ConferenceLosses"]]),
      totalPointsScored: Number(row[colMap["TotalPointsScored"]])
    }))
    .sort((a, b) => a.rank - b.rank);

  return rankings;
}

/**
 * Get ranking for a specific team
 * @param {Number} year - Season year
 * @param {String} franchiseId - Franchise ID (will be normalized)
 * @param {Number} week - Week number (optional, defaults to latest)
 * @returns {Object|null} - Ranking object or null if not found
 */
function getTeamRanking(year, franchiseId, week = null) {
  const normalizedId = String(Number(franchiseId)).padStart(3, "0");
  const rankings = getCurrentRankings(year, week);
  return rankings.find(r => r.franchiseId === normalizedId) || null;
}

/**
 * Get top N rankings
 * @param {Number} year - Season year
 * @param {Number} n - Number of teams to return (default 25)
 * @param {Number} week - Week number (optional, defaults to latest)
 * @returns {Array} - Top N ranking objects
 */
function getTopRankings(year, n = 25, week = null) {
  const rankings = getCurrentRankings(year, week);
  return rankings.slice(0, n);
}

/**
 * Recalculate rankings for all weeks in a season (for backfill)
 * Note: Week 1 is preseason poll (manual entry), so backfill starts at Week 2
 *
 * @param {Number} year - Season year
 * @param {Number} throughRankingWeek - Last ranking week to calculate (e.g., 5 = calculate Weeks 2-5)
 */
function backfillRankings(year, throughRankingWeek) {
  Logger.log(`=== Backfilling Rankings for ${year} ===`);
  Logger.log(`Ranking Weeks 2-${throughRankingWeek} (Week 1 is preseason, enter manually)`);

  // Start at Week 2 (Week 1 is preseason coaches poll)
  for (let rankingWeek = 2; rankingWeek <= throughRankingWeek; rankingWeek++) {
    Logger.log(`\nProcessing Ranking Week ${rankingWeek} (data through Week ${rankingWeek - 1})...`);
    // Only refresh ScheduleResults on last week
    calculateAndSaveRankings(year, rankingWeek, rankingWeek === throughRankingWeek);
  }

  Logger.log(`\nBackfill complete for ${year}`);
}

/**
 * Generate Final Rankings (Week 18)
 * This captures the complete season standings after all games are finished.
 * Week 18 has no scheduled games - it's purely the final standings based on Week 17 data.
 *
 * @param {Number} year - Season year
 * @returns {Array} - Final rankings array
 */
function calculateFinalRankings(year) {
  Logger.log(`=== Calculating FINAL Rankings for ${year} Season ===`);
  Logger.log(`This is Week 18 - Final Standings based on complete season data through Week 17`);

  const rankings = calculateAndSaveRankings(year, 18, true);

  if (rankings && rankings.length > 0) {
    Logger.log(`\n🏆 FINAL ${year} SEASON STANDINGS 🏆`);
    Logger.log("Top 25:");
    rankings.slice(0, 25).forEach(team => {
      const record = `${team.regularSeasonWins}-${team.regularSeasonLosses}`;
      Logger.log(`  ${team.rank}. ${team.teamName} (${record}) - Score: ${team.rankingScore.toFixed(4)}`);
    });
  }

  return rankings;
}

// ============================================================================
// COLLEGE GAMEDAY
// ============================================================================

/**
 * Get College Gameday matchups for a given week
 * - "College Gameday" = The matchup with the lowest average rank between two teams
 * - "Games of the Week" = All matchups where average rank < 15
 *
 * @param {Number} year - Season year
 * @param {Number} upcomingWeek - The week to analyze matchups for
 * @returns {Object} - { gamedayMatchup, gamesOfTheWeek, allMatchups }
 */
function getCollegeGamedayMatchups(year, upcomingWeek) {
  // Get current rankings (from the week before the upcoming games)
  const dataWeek = upcomingWeek - 1;

  // Get rankings from ScheduleResults for the previous week
  let rankings;
  if (dataWeek >= 1) {
    rankings = getRankingsFromScheduleResults(year, dataWeek);
  }

  // If no rankings yet (Week 1 games), try PowerRankings preseason
  if (!rankings || rankings.length === 0) {
    rankings = getCurrentRankings(year, 1);  // Week 1 preseason
  }

  if (!rankings || rankings.length === 0) {
    Logger.log("No rankings available for College Gameday calculation");
    return { gamedayMatchup: null, gamesOfTheWeek: [], allMatchups: [] };
  }

  // Build rank map
  const rankMap = {};
  rankings.forEach(team => {
    rankMap[team.franchiseId] = team.rank;
  });

  // Get matchups for the upcoming week
  const allScheduleMatchups = fetchSchedule(year);
  const weekMatchups = allScheduleMatchups.filter(m => m.week === upcomingWeek);

  const teamNameMap = getTeamNameMap();
  const franchiseConferenceMap = getFranchiseConferenceMap();

  // Analyze each matchup
  const analyzedMatchups = weekMatchups.map(m => {
    const f1 = m.franchises[0];
    const f2 = m.franchises[1];

    const rank1 = rankMap[f1.franchiseId] || 100;
    const rank2 = rankMap[f2.franchiseId] || 100;
    const avgRank = (rank1 + rank2) / 2;

    return {
      team1: {
        franchiseId: f1.franchiseId,
        name: teamNameMap[f1.franchiseId] || `Team ${f1.franchiseId}`,
        rank: rank1,
        conference: franchiseConferenceMap[f1.franchiseId] || ""
      },
      team2: {
        franchiseId: f2.franchiseId,
        name: teamNameMap[f2.franchiseId] || `Team ${f2.franchiseId}`,
        rank: rank2,
        conference: franchiseConferenceMap[f2.franchiseId] || ""
      },
      avgRank: avgRank,
      isGameOfTheWeek: avgRank < 15
    };
  });

  // Sort by average rank (lowest first = best matchup)
  analyzedMatchups.sort((a, b) => a.avgRank - b.avgRank);

  // The Gameday matchup is always the first one (lowest avg rank)
  const gamedayMatchup = analyzedMatchups.length > 0 ? analyzedMatchups[0] : null;

  // Games of the Week are all matchups with avg rank < 15
  const gamesOfTheWeek = analyzedMatchups.filter(m => m.isGameOfTheWeek && m !== gamedayMatchup);

  return {
    gamedayMatchup,
    gamesOfTheWeek,
    allMatchups: analyzedMatchups
  };
}

/**
 * Get College Gameday data formatted for Discord posting
 * @param {Number} year - Season year
 * @param {Number} upcomingWeek - The week to get gameday for
 * @returns {Object} - Formatted data for Discord
 */
function getCollegeGamedayForDiscord(year, upcomingWeek) {
  const { gamedayMatchup, gamesOfTheWeek, allMatchups } = getCollegeGamedayMatchups(year, upcomingWeek);

  return {
    year,
    week: upcomingWeek,
    gamedayMatchup,
    gamesOfTheWeek,
    totalMatchups: allMatchups.length
  };
}

// ============================================================================
// TRIGGERS
// ============================================================================

/**
 * Setup weekly trigger to calculate rankings every Tuesday at 6 AM
 */
function setupRankingsTrigger() {
  // Remove existing triggers
  removeRankingsTrigger();

  // Create new trigger
  ScriptApp.newTrigger('triggerWeeklyRankings')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(6)
    .create();

  Logger.log("Rankings trigger set for Tuesdays at 6 AM");
}

/**
 * Remove rankings trigger
 */
function removeRankingsTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'triggerWeeklyRankings') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  Logger.log("Rankings trigger removed");
}

/**
 * Triggered function for weekly rankings calculation
 * Also calculates projections after rankings during regular season
 */
function triggerWeeklyRankings() {
  const year = Number(getLeagueYear());

  // Determine current NFL week (this is the ranking week)
  // Rankings are published at start of week, based on previous week's results
  const rankingWeek = getCurrentNFLWeek();

  Logger.log(`=== Triggered Weekly Rankings for ${year} - Week ${rankingWeek} ===`);
  Logger.log(`(Will calculate based on data through Week ${rankingWeek - 1})`);

  // Step 1: Calculate and save rankings
  Logger.log(`\n--- Calculating Rankings ---`);
  calculateAndSaveRankings(year, rankingWeek);

  // Step 2: Calculate projections (only during regular season, weeks 1-12)
  if (rankingWeek >= 1 && rankingWeek <= 12) {
    Logger.log(`\n--- Calculating Projections ---`);
    try {
      calculateAndSaveProjections(year, rankingWeek);
      Logger.log(`  Projections calculated for Week ${rankingWeek}`);
    } catch (e) {
      Logger.log(`  Warning: Could not calculate projections - ${e.message}`);
    }
  } else {
    Logger.log(`\n--- Skipping Projections ---`);
    Logger.log(`  Week ${rankingWeek} is outside regular season (1-12). Projections not calculated.`);
  }

  Logger.log(`\n=== Weekly Rankings Update Complete ===`);
}

/**
 * Get current NFL week based on ScheduleResults data
 * Uses MFL_CURRENT_YEAR from config as the authoritative season year
 * Returns 1-18, where Week 18 = Final Rankings (after championship)
 *
 * ScheduleResults is the source of truth - it's populated first by the
 * weekly trigger from MFL. All other calculations derive from this.
 */
function getCurrentNFLWeek() {
  const year = getLeagueYear();

  // Look at ScheduleResults to find the latest week with data
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("ScheduleResults");

  if (!sheet) {
    Logger.log("getCurrentNFLWeek: No ScheduleResults sheet found, defaulting to week 1");
    return 1;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("getCurrentNFLWeek: ScheduleResults sheet is empty, defaulting to week 1");
    return 1;
  }

  const headers = data[0];
  const yearIdx = headers.indexOf("Year");
  const weekIdx = headers.indexOf("Week");

  if (yearIdx === -1 || weekIdx === -1) {
    Logger.log("getCurrentNFLWeek: Missing Year/Week columns, defaulting to week 1");
    return 1;
  }

  // Find the max week for the configured year
  let maxWeek = 0;
  data.slice(1).forEach(row => {
    if (Number(row[yearIdx]) === Number(year)) {
      const week = Number(row[weekIdx]);
      if (week > maxWeek) {
        maxWeek = week;
      }
    }
  });

  if (maxWeek === 0) {
    Logger.log(`getCurrentNFLWeek: No ScheduleResults data for ${year}, defaulting to week 1`);
    return 1;
  }

  return maxWeek;
}

// ============================================================================
// PLAYOFF & BOWL PROJECTIONS
// ============================================================================

// Conferences that get automatic playoff bids
const AUTO_BID_CONFERENCES = ["ACC", "B10", "B12", "P12", "SEC"];
const PLAYOFF_TEAMS = 16;
const BOWL_WIN_THRESHOLD = 6;

/**
 * Get regular season weeks for a given year (from config)
 * Conference games are only counted during regular season
 * @param {Number} year - Season year
 * @returns {Number} - Number of regular season weeks (12 for 2024+, 13 for 2021-2023)
 */
function getRegularSeasonWeeksForYear(year) {
  const config = getConfig();
  return config.season.getRegularSeasonWeeks(year);
}

/**
 * Get CCG week for a given year
 * @param {Number} year - Season year
 * @returns {Number} - Conference Championship week (13 for 2024+, 14 for 2021-2023)
 */
function getCCGWeekForYear(year) {
  const config = getConfig();
  return config.season.getCCGWeek(year);
}

/**
 * Get max projection week for a given year (includes CCG)
 * @param {Number} year - Season year
 * @returns {Number} - Last week for projections
 */
function getProjectionMaxWeekForYear(year) {
  const config = getConfig();
  return config.season.getProjectionMaxWeek(year);
}

/**
 * Get or create the Projections sheet
 */
function getProjectionsSheet() {
  const headers = [
    "Year",
    "AsOfWeek",
    "FranchiseID",
    "TeamName",
    "Conference",
    "CurrentRank",
    "CurrentWins",
    "CurrentLosses",
    "GamesRemaining",
    "ProjectedWins",
    "ProjectedLosses",
    "ExpectedFinalWins",
    "ConferenceRank",
    "ConferenceChampPct",
    "PlayoffPct",
    "BowlPct",
    "PlayoffPath",
    "CalculatedAt"
  ];

  return getOrCreateSheet("Projections", headers);
}

/**
 * Calculate win probability based on ranking differential
 * Uses a logistic function where rank difference determines probability
 * @param {Number} teamRank - The team's current rank (1 = best)
 * @param {Number} opponentRank - The opponent's rank
 * @returns {Number} - Win probability between 0 and 1
 */
function calculateWinProbability(teamRank, opponentRank) {
  // Rank difference: positive means team is better (lower rank number)
  const rankDiff = opponentRank - teamRank;

  // Logistic function with k=0.05 gives reasonable spread
  // At rank diff of 0: 50% win probability
  // At rank diff of +20: ~73% win probability
  // At rank diff of -20: ~27% win probability
  const k = 0.05;
  const probability = 1 / (1 + Math.exp(-k * rankDiff));

  // Clamp between 0.1 and 0.9 (no game is a sure thing)
  return Math.max(0.1, Math.min(0.9, probability));
}

/**
 * Get remaining schedule for a team from ScheduleResults sheet
 * Uses locally stored data instead of API call for consistency
 * @param {Number} year - Season year
 * @param {String} franchiseId - Team's franchise ID
 * @param {Number} currentWeek - Current week (games completed through this week)
 * @returns {Array} - Array of { week, opponentId }
 */
function getRemainingSchedule(year, franchiseId, currentWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();
  const regularSeasonWeeks = getRegularSeasonWeeksForYear(year);

  if (data.length <= 1) {
    Logger.log(`No ScheduleResults data found for ${year}`);
    return [];
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const remaining = [];

  // Look for future weeks in ScheduleResults for this team
  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);
    const rowFranchiseId = String(row[colMap["FranchiseID"]]);
    const opponentId = String(row[colMap["OpponentID"]] || "");

    // Only look at this team's future regular season games
    if (rowYear !== year) return;
    if (rowFranchiseId !== franchiseId) return;
    if (rowWeek <= currentWeek) return;
    if (rowWeek > regularSeasonWeeks) return;  // Only regular season, not CCG
    if (!opponentId || opponentId === "BYE") return;

    remaining.push({
      week: rowWeek,
      opponentId: opponentId
    });
  });

  // Sort by week
  remaining.sort((a, b) => a.week - b.week);

  return remaining;
}

/**
 * Calculate projected wins for remaining games
 * @param {Array} remainingGames - Array of { week, opponentId }
 * @param {Number} teamRank - Team's current rank
 * @param {Object} rankMap - Map of franchiseId -> rank
 * @returns {Object} - { expectedWins, gameByGame: [{ week, opponent, winProb }] }
 */
function projectRemainingGames(remainingGames, teamRank, rankMap) {
  let expectedWins = 0;
  const gameByGame = [];

  remainingGames.forEach(game => {
    const oppRank = rankMap[game.opponentId] || 50;
    const winProb = calculateWinProbability(teamRank, oppRank);
    expectedWins += winProb;

    gameByGame.push({
      week: game.week,
      opponentId: game.opponentId,
      opponentRank: oppRank,
      winProbability: winProb
    });
  });

  return { expectedWins, gameByGame };
}

/**
 * Calculate conference standings and champion probability
 * @param {Number} year - Season year
 * @param {Number} currentWeek - Current week
 * @param {Object} teamData - Map of franchiseId -> { rank, wins, losses, conference, projectedWins }
 * @returns {Object} - Map of franchiseId -> { confRank, champPct }
 */
function calculateConferenceProjections(year, currentWeek, teamData) {
  const conferenceTeams = {};

  // Group teams by conference
  Object.entries(teamData).forEach(([fId, data]) => {
    const conf = data.conference;
    if (!conferenceTeams[conf]) conferenceTeams[conf] = [];
    conferenceTeams[conf].push({
      franchiseId: fId,
      ...data,
      expectedFinalWins: data.wins + data.projectedWins
    });
  });

  const results = {};

  // For each conference, calculate standings and champion probability
  Object.entries(conferenceTeams).forEach(([conf, teams]) => {
    // Sort by expected final wins (descending)
    teams.sort((a, b) => b.expectedFinalWins - a.expectedFinalWins);

    // Simple probability model: team's share of total expected wins above conference average
    const totalExpectedWins = teams.reduce((sum, t) => sum + t.expectedFinalWins, 0);
    const avgWins = totalExpectedWins / teams.length;

    // Calculate "championship points" - how much better than average
    let totalChampPoints = 0;
    teams.forEach(t => {
      t.champPoints = Math.max(0, t.expectedFinalWins - avgWins + 1);
      totalChampPoints += t.champPoints;
    });

    // Assign conference rank and champion probability
    teams.forEach((t, idx) => {
      const champPct = totalChampPoints > 0 ? (t.champPoints / totalChampPoints) * 100 : 0;
      results[t.franchiseId] = {
        conferenceRank: idx + 1,
        conferenceChampPct: champPct,
        conference: conf
      };
    });
  });

  return results;
}

/**
 * Calculate playoff probability for all teams
 * Playoff = 16 teams: 5 conference champions (auto-bid) + 11 at-large by ranking
 * @param {Object} teamData - Map of franchiseId -> team data with projections
 * @param {Object} confProjections - Conference projections from calculateConferenceProjections
 * @returns {Object} - Map of franchiseId -> { playoffPct, path }
 */
function calculatePlayoffProbabilities(teamData, confProjections) {
  const results = {};

  // Build list of all teams with their expected final position
  const allTeams = Object.entries(teamData).map(([fId, data]) => ({
    franchiseId: fId,
    conference: data.conference,
    expectedFinalWins: data.wins + data.projectedWins,
    currentRank: data.rank,
    confChampPct: confProjections[fId]?.conferenceChampPct || 0,
    isAutoBidConf: AUTO_BID_CONFERENCES.includes(data.conference)
  }));

  // Sort by expected wins (proxy for expected final rank)
  allTeams.sort((a, b) => b.expectedFinalWins - a.expectedFinalWins);

  // Assign expected final ranks
  allTeams.forEach((t, idx) => {
    t.expectedRank = idx + 1;
  });

  // Calculate playoff probability for each team
  allTeams.forEach(team => {
    let playoffPct = 0;
    let path = "";

    if (team.isAutoBidConf) {
      // Auto-bid conference: P(playoff) = P(conf champ) + P(at-large | not conf champ)
      const confChampProb = team.confChampPct / 100;

      // At-large probability: based on expected rank
      // If expected rank <= 16, high chance; drops off after that
      let atLargeProb = 0;
      if (team.expectedRank <= 11) {
        // Very likely at-large even without conf championship
        atLargeProb = 0.9;
      } else if (team.expectedRank <= 16) {
        // Good chance
        atLargeProb = 0.7 - (team.expectedRank - 11) * 0.1;
      } else if (team.expectedRank <= 20) {
        // Bubble
        atLargeProb = 0.3 - (team.expectedRank - 16) * 0.05;
      } else {
        // Long shot
        atLargeProb = Math.max(0, 0.1 - (team.expectedRank - 20) * 0.02);
      }

      // Combined probability: conf champ OR at-large
      playoffPct = (confChampProb + (1 - confChampProb) * atLargeProb) * 100;

      if (confChampProb > 0.5) {
        path = "Conf Champ favorite";
      } else if (confChampProb > 0.2) {
        path = "Conf Champ contender";
      } else if (atLargeProb > 0.5) {
        path = "At-Large favorite";
      } else if (atLargeProb > 0.2) {
        path = "At-Large contender";
      } else {
        path = "Long shot";
      }
    } else {
      // Non-auto-bid conference: at-large only
      if (team.expectedRank <= 11) {
        playoffPct = 90;
        path = "At-Large favorite";
      } else if (team.expectedRank <= 16) {
        playoffPct = 70 - (team.expectedRank - 11) * 10;
        path = "At-Large contender";
      } else if (team.expectedRank <= 22) {
        playoffPct = 20 - (team.expectedRank - 16) * 3;
        path = "Bubble";
      } else {
        playoffPct = Math.max(0, 5 - (team.expectedRank - 22));
        path = "Long shot";
      }
    }

    results[team.franchiseId] = {
      playoffPct: Math.min(99, Math.max(0, playoffPct)),
      path: path,
      expectedRank: team.expectedRank
    };
  });

  return results;
}

/**
 * Calculate bowl eligibility probability
 * Teams need 6+ wins (or highest 5-win team if odd number)
 * @param {Object} teamData - Map of franchiseId -> team data
 * @param {Object} playoffProbs - Playoff probabilities
 * @returns {Object} - Map of franchiseId -> bowlPct
 */
function calculateBowlProbabilities(teamData, playoffProbs) {
  const results = {};

  Object.entries(teamData).forEach(([fId, data]) => {
    const playoffPct = playoffProbs[fId]?.playoffPct || 0;
    const expectedFinalWins = data.wins + data.projectedWins;

    // If in playoffs, no bowl game
    if (playoffPct > 90) {
      results[fId] = 0;
      return;
    }

    // Calculate probability of 6+ wins
    const currentWins = data.wins;
    const gamesRemaining = data.gamesRemaining;
    const winsNeeded = Math.max(0, BOWL_WIN_THRESHOLD - currentWins);

    if (winsNeeded === 0) {
      // Already bowl eligible
      results[fId] = 100 * (1 - playoffPct / 100); // Bowl if not in playoffs
    } else if (winsNeeded > gamesRemaining) {
      // Mathematically eliminated from bowl eligibility (at 6 wins)
      // But could still get in as highest 5-win team - small chance
      results[fId] = expectedFinalWins >= 5 ? 10 : 0;
    } else {
      // Need to win some remaining games
      // Simple model: probability scales with how close to 6 wins
      const probReach6 = Math.min(1, Math.max(0, (expectedFinalWins - 5) / 2));
      results[fId] = probReach6 * 100 * (1 - playoffPct / 100);
    }
  });

  return results;
}

/**
 * Main function to calculate and save all projections
 * @param {Number} year - Season year
 * @param {Number} asOfWeek - Week to calculate projections as of (data through this week)
 * @returns {Array} - Array of projection objects
 */
function calculateProjections(year, asOfWeek) {
  Logger.log(`=== Calculating Projections for ${year} as of Week ${asOfWeek} ===`);

  // Get current rankings
  const rankings = getRankingsFromScheduleResults(year, asOfWeek);
  if (!rankings || rankings.length === 0) {
    Logger.log("No rankings data found - run calculateAndSaveRankings first");
    return [];
  }

  // Build rank map and team data
  const rankMap = {};
  const teamData = {};

  rankings.forEach(team => {
    rankMap[team.franchiseId] = team.rank;
    teamData[team.franchiseId] = {
      rank: team.rank,
      teamName: team.teamName,
      conference: team.conference,
      wins: team.regularSeasonWins,
      losses: team.regularSeasonLosses,
      gamesRemaining: 0,
      projectedWins: 0
    };
  });

  // Calculate remaining games and projections for each team
  Object.keys(teamData).forEach(fId => {
    const remaining = getRemainingSchedule(year, fId, asOfWeek);
    teamData[fId].gamesRemaining = remaining.length;

    if (remaining.length > 0) {
      const projection = projectRemainingGames(remaining, teamData[fId].rank, rankMap);
      teamData[fId].projectedWins = projection.expectedWins;
      teamData[fId].gameByGame = projection.gameByGame;
    }
  });

  // Calculate conference projections
  const confProjections = calculateConferenceProjections(year, asOfWeek, teamData);

  // Calculate playoff probabilities
  const playoffProbs = calculatePlayoffProbabilities(teamData, confProjections);

  // Calculate bowl probabilities
  const bowlProbs = calculateBowlProbabilities(teamData, playoffProbs);

  // Combine all data into projections array
  const projections = [];

  Object.entries(teamData).forEach(([fId, data]) => {
    const confProj = confProjections[fId] || {};
    const playoff = playoffProbs[fId] || {};
    const bowlPct = bowlProbs[fId] || 0;

    projections.push({
      franchiseId: fId,
      teamName: data.teamName,
      conference: data.conference,
      currentRank: data.rank,
      currentWins: data.wins,
      currentLosses: data.losses,
      gamesRemaining: data.gamesRemaining,
      projectedWins: data.projectedWins,
      projectedLosses: data.gamesRemaining - data.projectedWins,
      expectedFinalWins: data.wins + data.projectedWins,
      conferenceRank: confProj.conferenceRank || 0,
      conferenceChampPct: confProj.conferenceChampPct || 0,
      playoffPct: playoff.playoffPct || 0,
      playoffPath: playoff.path || "",
      bowlPct: bowlPct
    });
  });

  // Sort by playoff probability
  projections.sort((a, b) => b.playoffPct - a.playoffPct);

  return projections;
}

/**
 * Calculate and save projections to the Projections sheet
 * @param {Number} year - Season year
 * @param {Number} asOfWeek - Week number
 */
function calculateAndSaveProjections(year, asOfWeek) {
  const projections = calculateProjections(year, asOfWeek);

  if (projections.length === 0) {
    Logger.log("No projections to save");
    return [];
  }

  const sheet = getProjectionsSheet();
  const calculatedAt = new Date().toISOString();

  // Clear existing data for this year/week
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    const headers = data[0];
    const yearIdx = headers.indexOf("Year");
    const weekIdx = headers.indexOf("AsOfWeek");

    const rowsToKeep = data.slice(1).filter(row =>
      !(Number(row[yearIdx]) === year && Number(row[weekIdx]) === asOfWeek)
    );

    sheet.getRange(2, 1, data.length - 1, headers.length).clearContent();

    if (rowsToKeep.length > 0) {
      sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    }
  }

  // Write new projections
  const rows = projections.map(p => [
    year,
    asOfWeek,
    p.franchiseId,
    p.teamName,
    p.conference,
    p.currentRank,
    p.currentWins,
    p.currentLosses,
    p.gamesRemaining,
    p.projectedWins,
    p.projectedLosses,
    p.expectedFinalWins,
    p.conferenceRank,
    p.conferenceChampPct,
    p.playoffPct,
    p.bowlPct,
    p.playoffPath,
    calculatedAt
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  Logger.log(`Saved ${rows.length} projections for ${year} Week ${asOfWeek}`);

  // Log top playoff contenders
  Logger.log("\nTop 20 Playoff Contenders:");
  projections.slice(0, 20).forEach((p, i) => {
    Logger.log(`  ${i+1}. ${p.teamName} (${p.conference}) - ${p.playoffPct.toFixed(1)}% [${p.playoffPath}]`);
  });

  // Also save conference standings with tiebreakers
  Logger.log("\nCalculating Conference Standings with Tiebreakers...");
  calculateAndSaveConferenceStandings(year, asOfWeek);

  return projections;
}

/**
 * Get current projections from sheet
 * @param {Number} year - Season year
 * @param {Number} week - Week number (optional, defaults to latest)
 * @returns {Array} - Array of projection objects
 */
function getProjections(year, week = null) {
  const sheet = getProjectionsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Find latest week if not specified
  if (!week) {
    const yearIdx = colMap["Year"];
    const weekIdx = colMap["AsOfWeek"];

    let maxWeek = 0;
    data.slice(1).forEach(row => {
      if (Number(row[yearIdx]) === year) {
        maxWeek = Math.max(maxWeek, Number(row[weekIdx]));
      }
    });
    week = maxWeek;
  }

  if (week === 0) return [];

  // Filter and map
  const projections = data.slice(1)
    .filter(row => Number(row[colMap["Year"]]) === year && Number(row[colMap["AsOfWeek"]]) === week)
    .map(row => ({
      franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
      teamName: row[colMap["TeamName"]],
      conference: row[colMap["Conference"]],
      currentRank: Number(row[colMap["CurrentRank"]]),
      currentWins: Number(row[colMap["CurrentWins"]]),
      currentLosses: Number(row[colMap["CurrentLosses"]]),
      gamesRemaining: Number(row[colMap["GamesRemaining"]]),
      projectedWins: Number(row[colMap["ProjectedWins"]]),
      projectedLosses: Number(row[colMap["ProjectedLosses"]]),
      expectedFinalWins: Number(row[colMap["ExpectedFinalWins"]]),
      conferenceRank: Number(row[colMap["ConferenceRank"]]),
      conferenceChampPct: Number(row[colMap["ConferenceChampPct"]]),
      playoffPct: Number(row[colMap["PlayoffPct"]]),
      bowlPct: Number(row[colMap["BowlPct"]]),
      playoffPath: row[colMap["PlayoffPath"]]
    }))
    .sort((a, b) => b.playoffPct - a.playoffPct);

  return projections;
}

/**
 * Get projection for a specific team
 * @param {Number} year - Season year
 * @param {String} franchiseId - Franchise ID
 * @param {Number} week - Week number (optional)
 * @returns {Object|null} - Projection object or null
 */
function getTeamProjection(year, franchiseId, week = null) {
  const normalizedId = String(Number(franchiseId)).padStart(3, "0");
  const projections = getProjections(year, week);
  return projections.find(p => p.franchiseId === normalizedId) || null;
}
