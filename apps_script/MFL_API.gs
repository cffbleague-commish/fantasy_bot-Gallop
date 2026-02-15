/**
 * MFL API CLIENT
 * Handles all MyFantasyLeague API requests
 */

/**
 * Generic MFL API fetch
 */
function mflFetch(year, type, additionalParams = {}) {
  const config = getConfig();

  if (!config.mfl.apiKey) {
    throw new Error("MFL_API_KEY not set in Script Properties. Run initializeScriptProperties()");
  }

  const params = {
    TYPE: type,
    L: config.mfl.leagueId,
    APIKEY: config.mfl.apiKey,
    JSON: 1,
    ...additionalParams
  };

  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `https://api.myfantasyleague.com/${year}/export?${queryString}`;

  Logger.log(`MFL API: ${type} for ${year}`);

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (response.getResponseCode() !== 200) {
      throw new Error(`MFL API Error (${response.getResponseCode()}): ${response.getContentText()}`);
    }

    return JSON.parse(response.getContentText());
  } catch (e) {
    // Handle network errors (address unavailable, timeout, etc.)
    if (e.message.includes("Address unavailable") || e.message.includes("DNS")) {
      throw new Error(`MFL API network error for year ${year}: ${e.message}. This could be temporary - try again in a few seconds.`);
    }
    // Handle timeout errors
    if (e.message.includes("timed out") || e.message.includes("Timeout")) {
      throw new Error(`MFL API timeout for ${type} request. The API may be rate limiting - try again shortly.`);
    }
    throw e;
  }
}

/**
 * Fetch all players for a given year
 * Use DETAILS=1 to get additional fields like draft_year
 */
function fetchPlayers(year) {
  const data = mflFetch(year, "players", { DETAILS: "1" });

  if (!data.players || !data.players.player) {
    return [];
  }

  const players = Array.isArray(data.players.player)
    ? data.players.player
    : [data.players.player];

  return players;
}

/**
 * Fetch only rookies (QB/RB/WR/TE with teams)
 * Note: For current year, queries that year's API
 * For older years (pre-2020), queries current year's API and filters by draft_year
 */
function fetchRookies(year) {
  const currentYear = getLeagueYear();
  const yearNum = Number(year);

  // For older years, the historical API may not have draft_year data
  // Instead, query current year's API and filter by draft_year
  let players;
  if (yearNum < 2020) {
    Logger.log(`  (Using ${currentYear} API to fetch players drafted in ${year})`);
    players = fetchPlayers(currentYear);
  } else {
    players = fetchPlayers(year);
  }

  return players.filter(p => {
    // Only fantasy positions
    if (!["QB", "RB", "WR", "TE"].includes(p.position)) return false;

    // Must have NFL team (excludes custom players) - but allow FA for historical
    // For current year rookies, require team; for historical, allow FA
    if (yearNum >= 2020 && !p.team) return false;

    // Check if player's draft_year matches the requested year
    // MFL uses draft_year field to indicate when player entered NFL
    if (p.draft_year !== year && p.draft_year !== String(year)) {
      return false;
    }

    return true;
  });
}

/**
 * Fetch all transactions for a year
 */
function fetchTransactions(year) {
  const data = mflFetch(year, "transactions");

  if (!data.transactions || !data.transactions.transaction) {
    return [];
  }

  const txns = Array.isArray(data.transactions.transaction)
    ? data.transactions.transaction
    : [data.transactions.transaction];

  return txns;
}

/**
 * Fetch current rosters with franchise mapping
 */
function fetchRosters(year) {
  const data = mflFetch(year, "rosters");

  if (!data.rosters || !data.rosters.franchise) {
    return [];
  }

  const franchises = Array.isArray(data.rosters.franchise)
    ? data.rosters.franchise
    : [data.rosters.franchise];

  const rosterEntries = [];

  franchises.forEach(f => {
    // Convert to number first to strip any leading zeros, then pad to 3 digits
    const franchiseId = String(Number(f.id || 0)).padStart(3, "0");

    if (!f.player) return;

    const players = Array.isArray(f.player) ? f.player : [f.player];

    players.forEach(p => {
      rosterEntries.push({
        franchiseId: franchiseId,
        playerId: String(p.id),
        status: p.status || "ACTIVE",
        salary: p.salary || "0"
      });
    });
  });

  return rosterEntries;
}

/**
 * Fetch weekly results for a specific week
 * Returns starter/non-starter points per franchise per player
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number (1-17)
 * @returns {Array} - Array of franchise results with player scores
 */
function fetchWeeklyResults(year, week) {
  const data = mflFetch(year, "weeklyResults", { W: week });

  if (!data.weeklyResults || !data.weeklyResults.matchup) {
    return [];
  }

  const matchups = Array.isArray(data.weeklyResults.matchup)
    ? data.weeklyResults.matchup
    : [data.weeklyResults.matchup];

  const franchiseResults = [];

  matchups.forEach(matchup => {
    if (!matchup.franchise) return;

    const franchises = Array.isArray(matchup.franchise)
      ? matchup.franchise
      : [matchup.franchise];

    franchises.forEach(f => {
      const franchiseId = String(Number(f.id || 0)).padStart(3, "0");

      const players = [];
      if (f.player) {
        const playerList = Array.isArray(f.player) ? f.player : [f.player];
        playerList.forEach(p => {
          players.push({
            playerId: String(p.id),
            score: Number(p.score || 0),
            isStarter: p.status === "starter",
            shouldStart: p.shouldStart === "1"
          });
        });
      }

      franchiseResults.push({
        franchiseId: franchiseId,
        score: Number(f.score || 0),
        result: f.result || "",
        players: players
      });
    });
  });

  return franchiseResults;
}

/**
 * Fetch schedule/matchups for a specific week or full season
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number (optional, omit for full schedule)
 * @returns {Array} - Array of matchups with franchise IDs
 */
function fetchSchedule(year, week) {
  const params = week ? { W: week } : {};
  const data = mflFetch(year, "schedule", params);

  if (!data.schedule) {
    return [];
  }

  // Handle both single week and full season response formats
  const weeklySchedules = data.schedule.weeklySchedule
    ? (Array.isArray(data.schedule.weeklySchedule)
        ? data.schedule.weeklySchedule
        : [data.schedule.weeklySchedule])
    : [];

  const allMatchups = [];

  weeklySchedules.forEach(weekData => {
    const weekNum = Number(weekData.week || week);

    if (!weekData.matchup) return;

    const matchups = Array.isArray(weekData.matchup)
      ? weekData.matchup
      : [weekData.matchup];

    matchups.forEach(m => {
      if (!m.franchise) return;

      const franchises = Array.isArray(m.franchise)
        ? m.franchise
        : [m.franchise];

      const matchupData = {
        week: weekNum,
        franchises: franchises.map(f => ({
          franchiseId: String(Number(f.id || 0)).padStart(3, "0"),
          score: Number(f.score || 0),
          result: f.result || "",
          spread: f.spread || ""
        }))
      };

      // Only include matchups with 2 franchises (exclude bye weeks)
      if (matchupData.franchises.length === 2) {
        allMatchups.push(matchupData);
      }
    });
  });

  return allMatchups;
}

/**
 * Fetch league standings (wins, losses, points for)
 * @param {String|Number} year - Season year
 * @returns {Object} - Map of franchiseId -> standings data
 */
function fetchLeagueStandings(year) {
  const data = mflFetch(year, "leagueStandings");

  if (!data.leagueStandings || !data.leagueStandings.franchise) {
    return {};
  }

  const franchises = Array.isArray(data.leagueStandings.franchise)
    ? data.leagueStandings.franchise
    : [data.leagueStandings.franchise];

  const standings = {};

  franchises.forEach(f => {
    const franchiseId = String(Number(f.id || 0)).padStart(3, "0");
    standings[franchiseId] = {
      wins: Number(f.h2hw || 0),
      losses: Number(f.h2hl || 0),
      ties: Number(f.h2ht || 0),
      pointsFor: Number(f.pf || 0),
      pointsAgainst: Number(f.pa || 0),
      allPlayWins: Number(f.op_w || 0),
      allPlayLosses: Number(f.op_l || 0),
      streak: f.streak || ""
    };
  });

  return standings;
}

/**
 * Fetch player scores/rankings from MFL for a specific position
 * Uses weeks 1-12 only for Theoretical Draft calculations
 * This returns ALL NFL players at that position, ranked by total points through week 12
 *
 * @param {String|Number} year - Season year
 * @param {String} position - Position to fetch (QB, RB, WR+TE)
 *                           Note: MFL uses "WR+TE" as a combined position, not separate WR and TE
 * @param {Number} count - Number of players to return (default 50)
 * @returns {Array} - Array of { playerId, name, position, points, rank }
 */
function fetchPlayerScoresByPosition(year, position, count = 50) {
  // Fetch weeks 1-12 and sum up the points
  const playerPoints = {}; // playerId -> total points
  let weeksLoaded = 0;
  let consecutiveFailures = 0;

  Logger.log(`    Fetching ${position} scores for weeks 1-12...`);

  for (let week = 1; week <= 12; week++) {
    try {
      // Add small delay between API calls to avoid rate limiting
      if (week > 1) {
        Utilities.sleep(150); // 150ms delay between calls
      }

      const data = mflFetch(year, "playerScores", {
        POSITION: position,
        W: week,
        COUNT: 200  // Get more players per week to ensure we capture everyone
      });

      if (!data.playerScores || !data.playerScores.playerScore) {
        Logger.log(`      Week ${week}: No data returned`);
        continue;
      }

      const scores = Array.isArray(data.playerScores.playerScore)
        ? data.playerScores.playerScore
        : [data.playerScores.playerScore];

      scores.forEach(p => {
        const playerId = String(p.id);
        const weekPoints = Number(p.score || 0);
        playerPoints[playerId] = (playerPoints[playerId] || 0) + weekPoints;
      });

      weeksLoaded++;
      consecutiveFailures = 0; // Reset on success
    } catch (e) {
      consecutiveFailures++;
      Logger.log(`      Week ${week} failed: ${e.message}`);

      // If we get 3+ consecutive failures, add longer delay and retry once
      if (consecutiveFailures >= 3) {
        Logger.log(`      Multiple failures detected, adding 2s delay...`);
        Utilities.sleep(2000);
      }
      continue;
    }
  }

  Logger.log(`    Loaded ${weeksLoaded} weeks for ${position}`);

  // Convert to array, sort by points, and take top 'count'
  const sortedPlayers = Object.entries(playerPoints)
    .map(([playerId, points]) => ({
      playerId: playerId,
      points: points,
      position: position
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, count);

  // Add rank
  return sortedPlayers.map((p, idx) => ({
    ...p,
    rank: idx + 1
  }));
}

/**
 * Fetch position rankings for all fantasy positions (QB, RB, WR+TE)
 * Returns a map of playerId -> { position, points, positionRank }
 *
 * Note: MFL's playerScores API uses "WR+TE" as a combined position group,
 * not separate "WR" and "TE" queries. Individual WR/TE queries may return no data.
 *
 * @param {String|Number} year - Season year
 * @param {Number} count - Number of players per position (default 50)
 * @returns {Object} - Map of playerId -> ranking data
 */
function fetchAllPositionRankings(year, count = 50) {
  // MFL uses "WR+TE" as combined position, not separate WR and TE
  const positions = ["QB", "RB", "WR+TE"];
  const rankingMap = {};

  // We also need player info to determine actual position (WR vs TE)
  const playerInfo = {};
  const allPlayers = fetchPlayers(year);
  allPlayers.forEach(p => {
    playerInfo[String(p.id)] = {
      name: p.name || "",
      position: p.position || ""
    };
  });

  positions.forEach((pos, idx) => {
    // Add delay between positions to avoid rate limiting
    if (idx > 0) {
      Logger.log(`  Pausing 1s before next position...`);
      Utilities.sleep(1000);
    }

    Logger.log(`  Fetching ${pos} rankings...`);
    const rankings = fetchPlayerScoresByPosition(year, pos, count);
    Logger.log(`    Got ${rankings.length} players`);

    // Determine position group
    const positionGroup = (pos === "WR+TE") ? "WR/TE" : pos;

    rankings.forEach(player => {
      // For WR+TE, look up actual position from player info
      let actualPosition = pos;
      if (pos === "WR+TE") {
        actualPosition = playerInfo[player.playerId]?.position || "WR";
      }

      rankingMap[player.playerId] = {
        position: actualPosition,
        positionGroup: positionGroup,
        points: player.points,
        positionRank: player.rank,
        // For WR+TE, the rank from MFL is already the combined rank
        combinedRank: (pos === "WR+TE") ? player.rank : undefined
      };
    });
  });

  // Log summary
  const qbCount = Object.values(rankingMap).filter(p => p.positionGroup === "QB").length;
  const rbCount = Object.values(rankingMap).filter(p => p.positionGroup === "RB").length;
  const wrteCount = Object.values(rankingMap).filter(p => p.positionGroup === "WR/TE").length;
  Logger.log(`  Rankings loaded: QB=${qbCount}, RB=${rbCount}, WR/TE=${wrteCount}`);

  return rankingMap;
}
