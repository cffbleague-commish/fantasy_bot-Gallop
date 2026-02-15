/**
 * SCHEDULE UTILITIES
 * Reusable functions for schedule data and conference game detection
 * These utilities are designed to be used by Awards and other future features
 */

/**
 * Get full season schedule with conference game detection
 * Fetches entire schedule in one API call for efficiency
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include (default: 12)
 * @returns {Object} - Schedule data with conference game flags
 */
function getSeasonSchedule(year, throughWeek = 12) {
  const franchiseConferenceMap = getFranchiseConferenceMap();

  const schedule = {
    year: Number(year),
    weeks: [],
    conferenceGames: {},      // franchiseId -> [week numbers of conference games]
    allGames: {},             // franchiseId -> [week numbers of all games]
    conferenceWins: {},       // franchiseId -> conference win count
    conferenceLosses: {},     // franchiseId -> conference loss count
    conferencePointsFor: {}   // franchiseId -> points scored in conference games
  };

  // Initialize tracking objects for all franchises
  Object.keys(franchiseConferenceMap).forEach(franchiseId => {
    schedule.conferenceGames[franchiseId] = [];
    schedule.allGames[franchiseId] = [];
    schedule.conferenceWins[franchiseId] = 0;
    schedule.conferenceLosses[franchiseId] = 0;
    schedule.conferencePointsFor[franchiseId] = 0;
  });

  // Fetch FULL schedule in one API call (no week parameter)
  // This is more efficient and avoids issues with future weeks
  const allMatchups = fetchSchedule(year);

  // Group matchups by week
  const matchupsByWeek = {};
  allMatchups.forEach(matchup => {
    const week = matchup.week;
    if (!matchupsByWeek[week]) {
      matchupsByWeek[week] = [];
    }
    matchupsByWeek[week].push(matchup);
  });

  // Process each week up to throughWeek
  for (let week = 1; week <= throughWeek; week++) {
    const weekMatchups = matchupsByWeek[week] || [];

    const weekData = {
      week: week,
      matchups: []
    };

    weekMatchups.forEach(matchup => {
      if (matchup.franchises.length !== 2) return;

      const franchise1 = matchup.franchises[0];
      const franchise2 = matchup.franchises[1];

      const conf1 = franchiseConferenceMap[franchise1.franchiseId];
      const conf2 = franchiseConferenceMap[franchise2.franchiseId];

      const isConferenceGame = conf1 && conf2 && conf1 === conf2;

      weekData.matchups.push({
        franchise1: franchise1.franchiseId,
        franchise2: franchise2.franchiseId,
        score1: franchise1.score,
        score2: franchise2.score,
        result1: franchise1.result,
        result2: franchise2.result,
        conference: isConferenceGame ? conf1 : null,
        isConferenceGame: isConferenceGame
      });

      // Track all games per franchise
      [franchise1.franchiseId, franchise2.franchiseId].forEach(fId => {
        if (!schedule.allGames[fId]) schedule.allGames[fId] = [];
        schedule.allGames[fId].push(week);
      });

      // Track conference games and stats
      if (isConferenceGame) {
        // Track weeks
        schedule.conferenceGames[franchise1.franchiseId].push(week);
        schedule.conferenceGames[franchise2.franchiseId].push(week);

        // Track wins/losses (only if game has been played - has result)
        if (franchise1.result === "W") {
          schedule.conferenceWins[franchise1.franchiseId]++;
          schedule.conferenceLosses[franchise2.franchiseId]++;
        } else if (franchise2.result === "W") {
          schedule.conferenceWins[franchise2.franchiseId]++;
          schedule.conferenceLosses[franchise1.franchiseId]++;
        }

        // Track points for (only if game has scores)
        schedule.conferencePointsFor[franchise1.franchiseId] += franchise1.score;
        schedule.conferencePointsFor[franchise2.franchiseId] += franchise2.score;
      }
    });

    schedule.weeks.push(weekData);
  }

  return schedule;
}

/**
 * Check if a matchup between two franchises is a conference game
 * @param {String} franchiseId1 - First franchise ID
 * @param {String} franchiseId2 - Second franchise ID
 * @returns {Boolean} - True if both franchises are in the same conference
 */
function isConferenceGame(franchiseId1, franchiseId2) {
  const map = getFranchiseConferenceMap();
  const conf1 = map[franchiseId1];
  const conf2 = map[franchiseId2];
  return conf1 && conf2 && conf1 === conf2;
}

/**
 * Get conference game weeks for a specific franchise
 * @param {String|Number} year - Season year
 * @param {String} franchiseId - Franchise ID (3-digit padded)
 * @param {Number} throughWeek - Last week to check (default: 12)
 * @returns {Array} - Array of week numbers that were conference games
 */
function getConferenceGamesForFranchise(year, franchiseId, throughWeek = 12) {
  const schedule = getSeasonSchedule(year, throughWeek);
  return schedule.conferenceGames[franchiseId] || [];
}

/**
 * Get conference standings (wins/losses in conference games only)
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include (default: 12)
 * @returns {Object} - Map of franchiseId -> { wins, losses, pointsFor }
 */
function getConferenceStandings(year, throughWeek = 12) {
  const schedule = getSeasonSchedule(year, throughWeek);

  const standings = {};

  Object.keys(schedule.conferenceWins).forEach(franchiseId => {
    standings[franchiseId] = {
      wins: schedule.conferenceWins[franchiseId],
      losses: schedule.conferenceLosses[franchiseId],
      pointsFor: schedule.conferencePointsFor[franchiseId]
    };
  });

  return standings;
}

/**
 * Get opponent for a franchise in a specific week
 * @param {String|Number} year - Season year
 * @param {String} franchiseId - Franchise ID
 * @param {Number} week - Week number
 * @returns {Object|null} - Opponent info or null if bye week
 */
function getOpponentForWeek(year, franchiseId, week) {
  // Fetch full schedule and filter to the requested week
  const allMatchups = fetchSchedule(year);
  const weekMatchups = allMatchups.filter(m => m.week === week);

  for (const matchup of weekMatchups) {
    if (matchup.franchises.length !== 2) continue;

    const f1 = matchup.franchises[0];
    const f2 = matchup.franchises[1];

    if (f1.franchiseId === franchiseId) {
      return {
        opponentId: f2.franchiseId,
        isConferenceGame: isConferenceGame(franchiseId, f2.franchiseId),
        myScore: f1.score,
        opponentScore: f2.score,
        result: f1.result
      };
    }

    if (f2.franchiseId === franchiseId) {
      return {
        opponentId: f1.franchiseId,
        isConferenceGame: isConferenceGame(franchiseId, f1.franchiseId),
        myScore: f2.score,
        opponentScore: f1.score,
        result: f2.result
      };
    }
  }

  return null; // Bye week
}

/**
 * Get all matchups for a specific conference in a given week range
 * @param {String|Number} year - Season year
 * @param {String} conference - Conference name (e.g., "ACC", "SEC")
 * @param {Number} throughWeek - Last week to include (default: 12)
 * @returns {Array} - Array of conference matchups
 */
function getConferenceMatchups(year, conference, throughWeek = 12) {
  const schedule = getSeasonSchedule(year, throughWeek);
  const conferenceMatchups = [];

  schedule.weeks.forEach(weekData => {
    weekData.matchups.forEach(matchup => {
      if (matchup.isConferenceGame && matchup.conference === conference) {
        conferenceMatchups.push({
          week: weekData.week,
          ...matchup
        });
      }
    });
  });

  return conferenceMatchups;
}

/**
 * Debug function to display schedule information
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to show
 */
function debugSchedule(year, throughWeek = 12) {
  const schedule = getSeasonSchedule(year, throughWeek);
  const franchiseMap = getFranchiseConferenceMap();
  const conferences = getConferences();

  Logger.log(`=== SCHEDULE DEBUG: ${year} (Weeks 1-${throughWeek}) ===\n`);

  // Summary by conference
  conferences.forEach(conf => {
    Logger.log(`\n--- ${conf} Conference Games ---`);

    const confFranchises = Object.entries(franchiseMap)
      .filter(([id, c]) => c === conf)
      .map(([id]) => id);

    confFranchises.forEach(fId => {
      const weeks = schedule.conferenceGames[fId] || [];
      const wins = schedule.conferenceWins[fId] || 0;
      const losses = schedule.conferenceLosses[fId] || 0;
      const pf = schedule.conferencePointsFor[fId] || 0;
      Logger.log(`  ${fId}: ${weeks.length} conf games (W${wins}-L${losses}), ${pf.toFixed(1)} PF`);
    });
  });

  Logger.log(`\n=== END DEBUG ===`);
}

// ============================================================================
// CONFERENCE STANDINGS WITH TIEBREAKERS
// ============================================================================

/**
 * Calculate tiebreaker data (AllPlayPct, TotalPF, rank) directly from ScheduleResults
 * Used as fallback when Rankings sheet doesn't have data for the requested week
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Array} - Array of objects with franchiseId, allPlayPct, totalPointsScored, rank
 */
function calculateTiebreakerDataFromSchedule(year, throughWeek) {
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log("ScheduleResults empty - cannot calculate tiebreaker data");
    return [];
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Read cumulative season data from the throughWeek rows
  // ScheduleResults has SeasonAllPlayPct, SeasonPointsFor, SeasonRank already computed
  const results = [];

  data.slice(1).forEach(row => {
    const rowYear = Number(row[colMap["Year"]]);
    const rowWeek = Number(row[colMap["Week"]]);

    // Only read from the throughWeek rows (cumulative data is already computed)
    if (rowYear !== year || rowWeek !== throughWeek) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const allPlayPct = Number(row[colMap["SeasonAllPlayPct"]] || 0);
    const totalPointsScored = Number(row[colMap["SeasonPointsFor"]] || 0);
    const rank = Number(row[colMap["SeasonRank"]] || 99);

    results.push({
      franchiseId: franchiseId,
      allPlayPct: allPlayPct,
      totalPointsScored: totalPointsScored,
      rank: rank
    });
  });

  Logger.log(`Read tiebreaker data for ${results.length} teams from ScheduleResults Week ${throughWeek}`);
  if (results.length > 0) {
    Logger.log(`Sample: ${results[0].franchiseId} - AllPlayPct: ${results[0].allPlayPct}, TotalPF: ${results[0].totalPointsScored}, Rank: ${results[0].rank}`);
  }
  return results;
}

/**
 * Get schedule data from ScheduleResults sheet (instead of API)
 * Returns same structure as getSeasonSchedule() for compatibility
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Last week to include (defaults to regular season weeks)
 * @returns {Object} - Schedule object with weeks, conferenceWins, etc.
 */
function getScheduleFromResults(year, throughWeek = null) {
  // Default to regular season weeks (conference games only, not CCG)
  if (throughWeek === null) {
    const config = getConfig();
    throughWeek = config.season.getRegularSeasonWeeks(year);
  }

  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  const schedule = {
    year: Number(year),
    weeks: [],
    conferenceWins: {},
    conferenceLosses: {},
    conferencePointsFor: {}
  };

  if (data.length <= 1) {
    Logger.log("ScheduleResults empty, falling back to API");
    return getSeasonSchedule(year, throughWeek);
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Initialize weeks
  for (let w = 1; w <= throughWeek; w++) {
    schedule.weeks.push({ week: w, matchups: [] });
  }

  // Track seen matchups to avoid duplicates (each game appears twice in ScheduleResults)
  const seenMatchups = new Set();

  // Process rows - assume all data in ScheduleResults is for the correct year
  // Only filter by week number
  data.slice(1).forEach(row => {
    const rowWeek = Number(row[colMap["Week"]]);

    if (rowWeek > throughWeek || rowWeek < 1) return;

    const franchiseId = String(row[colMap["FranchiseID"]]).padStart(3, "0");
    const opponentId = row[colMap["OpponentID"]] ? String(row[colMap["OpponentID"]]).padStart(3, "0") : null;
    const teamScore = Number(row[colMap["TeamScore"]] || 0);
    const oppScore = Number(row[colMap["OpponentScore"]] || 0);
    const gameResult = row[colMap["GameResult"]];
    const rawIsConf = row[colMap["IsConferenceGame"]];
    const isConferenceGame = rawIsConf === true || String(rawIsConf).toUpperCase() === "TRUE";

    // Track conference stats - use 'in' operator to check existence (0 is falsy!)
    if (!(franchiseId in schedule.conferenceWins)) {
      schedule.conferenceWins[franchiseId] = 0;
      schedule.conferenceLosses[franchiseId] = 0;
      schedule.conferencePointsFor[franchiseId] = 0;
    }

    if (isConferenceGame && gameResult !== "BYE") {
      schedule.conferencePointsFor[franchiseId] += teamScore;
      if (gameResult === "W") {
        schedule.conferenceWins[franchiseId]++;
      } else if (gameResult === "L") {
        schedule.conferenceLosses[franchiseId]++;
      }
    }

    // Add matchup (avoid duplicates)
    if (opponentId && gameResult !== "BYE") {
      const matchupKey = rowWeek + "-" + [franchiseId, opponentId].sort().join("-");
      if (!seenMatchups.has(matchupKey)) {
        seenMatchups.add(matchupKey);

        const weekData = schedule.weeks[rowWeek - 1];
        weekData.matchups.push({
          franchise1: franchiseId,
          franchise2: opponentId,
          score1: teamScore,
          score2: oppScore,
          result1: gameResult,
          result2: gameResult === "W" ? "L" : (gameResult === "L" ? "W" : gameResult),
          isConferenceGame: isConferenceGame
        });
      }
    }
  });

  return schedule;
}

/**
 * Get head-to-head result between two teams (conference games only)
 * @param {Object} schedule - Schedule object from getSeasonSchedule or getScheduleFromResults
 * @param {String} team1 - Franchise ID
 * @param {String} team2 - Franchise ID
 * @returns {Object} - { team1Wins, team2Wins, played }
 */
function getHeadToHeadResult(schedule, team1, team2) {
  let team1Wins = 0;
  let team2Wins = 0;

  schedule.weeks.forEach(weekData => {
    weekData.matchups.forEach(matchup => {
      if (!matchup.isConferenceGame) return;

      const isMatch = (matchup.franchise1 === team1 && matchup.franchise2 === team2) ||
                      (matchup.franchise1 === team2 && matchup.franchise2 === team1);

      if (isMatch) {
        if (matchup.result1 === "W") {
          if (matchup.franchise1 === team1) team1Wins++;
          else team2Wins++;
        } else if (matchup.result2 === "W") {
          if (matchup.franchise2 === team1) team1Wins++;
          else team2Wins++;
        }
      }
    });
  });

  return { team1Wins, team2Wins, played: team1Wins + team2Wins > 0 };
}

/**
 * Get combined head-to-head record among multiple teams
 * Returns each team's record against the other tied teams
 * @param {Object} schedule - Schedule object
 * @param {Array} teams - Array of franchise IDs
 * @returns {Object} - Map of franchiseId -> { wins, losses, beatAll, lostToAll }
 */
function getMultiTeamHeadToHead(schedule, teams) {
  const records = {};

  teams.forEach(team => {
    records[team] = { wins: 0, losses: 0, opponents: {} };
  });

  // Check each pair
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const h2h = getHeadToHeadResult(schedule, teams[i], teams[j]);
      records[teams[i]].wins += h2h.team1Wins;
      records[teams[i]].losses += h2h.team2Wins;
      records[teams[i]].opponents[teams[j]] = h2h.team1Wins > h2h.team2Wins ? "W" : (h2h.team2Wins > h2h.team1Wins ? "L" : "N");

      records[teams[j]].wins += h2h.team2Wins;
      records[teams[j]].losses += h2h.team1Wins;
      records[teams[j]].opponents[teams[i]] = h2h.team2Wins > h2h.team1Wins ? "W" : (h2h.team1Wins > h2h.team2Wins ? "L" : "N");
    }
  }

  // Determine beatAll and lostToAll
  teams.forEach(team => {
    const others = teams.filter(t => t !== team);
    const opponentResults = others.map(o => records[team].opponents[o]);
    records[team].beatAll = opponentResults.every(r => r === "W");
    records[team].lostToAll = opponentResults.every(r => r === "L");
    records[team].allPlayed = opponentResults.every(r => r !== "N");
  });

  return records;
}

/**
 * Check if all teams in a group are common opponents (all played each other)
 * @param {Object} schedule - Schedule object
 * @param {Array} teams - Array of franchise IDs
 * @returns {Boolean}
 */
function areCommonOpponents(schedule, teams) {
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const h2h = getHeadToHeadResult(schedule, teams[i], teams[j]);
      if (!h2h.played) return false;
    }
  }
  return true;
}

/**
 * Apply tiebreaker to select one team from a group of tied teams
 * Tiebreaker order:
 * 1. Conference Win %
 * 2. H2H (2-team: direct, 3+: combined or sweep rules)
 * 3. All-Play %
 * 4. Total PF
 * 5. National Ranking
 *
 * @param {Object} schedule - Schedule object
 * @param {Array} tiedTeams - Array of team objects with stats
 * @param {Object} rankings - Map of franchiseId -> ranking data
 * @returns {Object} - { winner, reason, remaining }
 */
function applyTiebreaker(schedule, tiedTeams, rankings) {
  if (tiedTeams.length === 1) {
    return { winner: tiedTeams[0], reason: "Only team", remaining: [] };
  }

  const teamIds = tiedTeams.map(t => t.franchiseId);

  // 2-team tiebreaker: simple H2H
  if (tiedTeams.length === 2) {
    const h2h = getHeadToHeadResult(schedule, teamIds[0], teamIds[1]);

    if (h2h.team1Wins > h2h.team2Wins) {
      return { winner: tiedTeams[0], reason: "H2H", remaining: [tiedTeams[1]] };
    } else if (h2h.team2Wins > h2h.team1Wins) {
      return { winner: tiedTeams[1], reason: "H2H", remaining: [tiedTeams[0]] };
    }
    // H2H tied or not played, fall through to next tiebreakers
  }

  // 3+ team tiebreaker
  if (tiedTeams.length >= 3) {
    const h2hRecords = getMultiTeamHeadToHead(schedule, teamIds);
    const allCommon = areCommonOpponents(schedule, teamIds);

    if (allCommon) {
      // 2.b.1: Combined H2H among tied teams
      const sorted = [...tiedTeams].sort((a, b) => {
        const aRec = h2hRecords[a.franchiseId];
        const bRec = h2hRecords[b.franchiseId];
        const aWinPct = aRec.wins / (aRec.wins + aRec.losses || 1);
        const bWinPct = bRec.wins / (bRec.wins + bRec.losses || 1);
        return bWinPct - aWinPct;
      });

      const bestWinPct = h2hRecords[sorted[0].franchiseId].wins /
        (h2hRecords[sorted[0].franchiseId].wins + h2hRecords[sorted[0].franchiseId].losses || 1);
      const secondWinPct = h2hRecords[sorted[1].franchiseId].wins /
        (h2hRecords[sorted[1].franchiseId].wins + h2hRecords[sorted[1].franchiseId].losses || 1);

      if (bestWinPct > secondWinPct) {
        return {
          winner: sorted[0],
          reason: "Combined H2H",
          remaining: sorted.slice(1)
        };
      }
    } else {
      // 2.b.2: Check for sweep winners/losers
      for (const team of tiedTeams) {
        if (h2hRecords[team.franchiseId].beatAll) {
          return {
            winner: team,
            reason: "Beat all tied teams",
            remaining: tiedTeams.filter(t => t.franchiseId !== team.franchiseId)
          };
        }
      }

      // Eliminate teams that lost to all others
      const notLostToAll = tiedTeams.filter(t => !h2hRecords[t.franchiseId].lostToAll);
      if (notLostToAll.length < tiedTeams.length && notLostToAll.length > 0) {
        const eliminated = tiedTeams.filter(t => h2hRecords[t.franchiseId].lostToAll);
        // Recursively apply tiebreaker to remaining teams
        return applyTiebreaker(schedule, notLostToAll, rankings);
      }
    }
  }

  // Tiebreaker 3: All-Play %
  const sortedByAllPlay = [...tiedTeams].sort((a, b) => {
    const aAllPlay = rankings[a.franchiseId]?.allPlayPct || 0;
    const bAllPlay = rankings[b.franchiseId]?.allPlayPct || 0;
    return bAllPlay - aAllPlay;
  });

  const bestAllPlay = rankings[sortedByAllPlay[0].franchiseId]?.allPlayPct || 0;
  const secondAllPlay = rankings[sortedByAllPlay[1].franchiseId]?.allPlayPct || 0;

  if (bestAllPlay > secondAllPlay) {
    return {
      winner: sortedByAllPlay[0],
      reason: "All-Play %",
      remaining: sortedByAllPlay.slice(1)
    };
  }

  // Tiebreaker 4: Total PF
  const sortedByPF = [...tiedTeams].sort((a, b) => {
    const aPF = rankings[a.franchiseId]?.totalPointsScored || 0;
    const bPF = rankings[b.franchiseId]?.totalPointsScored || 0;
    return bPF - aPF;
  });

  const bestPF = rankings[sortedByPF[0].franchiseId]?.totalPointsScored || 0;
  const secondPF = rankings[sortedByPF[1].franchiseId]?.totalPointsScored || 0;

  if (bestPF > secondPF) {
    return {
      winner: sortedByPF[0],
      reason: "Total PF",
      remaining: sortedByPF.slice(1)
    };
  }

  // Tiebreaker 5: National Ranking
  const sortedByRank = [...tiedTeams].sort((a, b) => {
    const aRank = rankings[a.franchiseId]?.rank || 999;
    const bRank = rankings[b.franchiseId]?.rank || 999;
    return aRank - bRank;
  });

  return {
    winner: sortedByRank[0],
    reason: "National Ranking",
    remaining: sortedByRank.slice(1)
  };
}

/**
 * Calculate conference standings with full tiebreaker resolution
 * Returns teams in order with their CCG status
 *
 * @param {Number} year - Season year
 * @param {String} conference - Conference name
 * @param {Number} throughWeek - Week to calculate through (default 12)
 * @returns {Array} - Array of { franchiseId, teamName, confWins, confLosses, confWinPct, standing, ccgBound, tiebreaker }
 */
function getConferenceStandingsWithTiebreakers(year, conference, throughWeek = null) {
  // Default to regular season weeks (conference games only, not CCG)
  if (throughWeek === null) {
    const config = getConfig();
    throughWeek = config.season.getRegularSeasonWeeks(year);
  }

  // Use ScheduleResults sheet data instead of API for consistency with rankings
  const schedule = getScheduleFromResults(year, throughWeek);
  const franchiseMap = getFranchiseConferenceMap();
  const franchiseNames = getTeamNameMap();

  // Get rankings for tiebreaker data
  // Rankings use "week ahead" convention: data through Week 10 = Week 11 rankings
  const rankingsWeek = throughWeek + 1;
  let allRankings = getCurrentRankings(year, rankingsWeek);

  if (allRankings && allRankings.length > 0) {
    Logger.log(`Using ${allRankings.length} rankings from PowerRankings Week ${rankingsWeek}`);
  } else {
    // No rankings found - calculate tiebreaker data from ScheduleResults cumulative columns
    Logger.log(`No rankings found for Week ${rankingsWeek}, reading tiebreaker data from ScheduleResults Week ${throughWeek}...`);
    allRankings = calculateTiebreakerDataFromSchedule(year, throughWeek);
  }

  const rankingsMap = {};
  allRankings.forEach(r => { rankingsMap[r.franchiseId] = r; });

  // Get teams in this conference
  const confTeams = Object.entries(franchiseMap)
    .filter(([id, conf]) => conf === conference)
    .map(([franchiseId]) => {
      const wins = schedule.conferenceWins[franchiseId] || 0;
      const losses = schedule.conferenceLosses[franchiseId] || 0;
      const totalGames = wins + losses;
      const ranking = rankingsMap[franchiseId] || {};
      return {
        franchiseId,
        teamName: franchiseNames[franchiseId] || franchiseId,
        confWins: wins,
        confLosses: losses,
        confWinPct: totalGames > 0 ? wins / totalGames : 0,
        confPointsFor: schedule.conferencePointsFor[franchiseId] || 0,
        allPlayPct: ranking.allPlayPct || 0,
        totalPF: ranking.totalPointsScored || 0,
        nationalRank: ranking.rank || 99
      };
    });

  // Sort by conference win percentage (primary)
  confTeams.sort((a, b) => b.confWinPct - a.confWinPct);

  // Group teams by win percentage for tiebreaking
  const standingsResult = [];
  let currentStanding = 1;

  // Process CCG spots (top 2)
  const ccgTeams = [];
  let remainingTeams = [...confTeams];

  // Select first CCG team
  if (remainingTeams.length > 0) {
    const topWinPct = remainingTeams[0].confWinPct;
    const tiedForFirst = remainingTeams.filter(t => t.confWinPct === topWinPct);

    if (tiedForFirst.length === 1) {
      ccgTeams.push({ ...tiedForFirst[0], tiebreaker: null });
      remainingTeams = remainingTeams.filter(t => t.franchiseId !== tiedForFirst[0].franchiseId);
    } else {
      const result = applyTiebreaker(schedule, tiedForFirst, rankingsMap);
      ccgTeams.push({ ...result.winner, tiebreaker: result.reason });
      remainingTeams = remainingTeams.filter(t => t.franchiseId !== result.winner.franchiseId);
    }
  }

  // Select second CCG team (restart tiebreaker process)
  if (remainingTeams.length > 0) {
    const topWinPct = remainingTeams.reduce((max, t) => Math.max(max, t.confWinPct), 0);
    const tiedForSecond = remainingTeams.filter(t => t.confWinPct === topWinPct);

    if (tiedForSecond.length === 1) {
      ccgTeams.push({ ...tiedForSecond[0], tiebreaker: null });
      remainingTeams = remainingTeams.filter(t => t.franchiseId !== tiedForSecond[0].franchiseId);
    } else {
      const result = applyTiebreaker(schedule, tiedForSecond, rankingsMap);
      ccgTeams.push({ ...result.winner, tiebreaker: result.reason });
      remainingTeams = remainingTeams.filter(t => t.franchiseId !== result.winner.franchiseId);
    }
  }

  // Build final standings
  ccgTeams.forEach((team, idx) => {
    standingsResult.push({
      ...team,
      standing: idx + 1,
      ccgBound: true
    });
  });

  // Add remaining teams with tiebreaker resolution at every position
  remainingTeams.sort((a, b) => b.confWinPct - a.confWinPct);
  let nextStanding = ccgTeams.length + 1;

  while (remainingTeams.length > 0) {
    const topWinPct = remainingTeams[0].confWinPct;
    const tiedGroup = remainingTeams.filter(t => t.confWinPct === topWinPct);

    if (tiedGroup.length === 1) {
      // No tie - just add the team
      standingsResult.push({
        ...tiedGroup[0],
        standing: nextStanding,
        ccgBound: false,
        tiebreaker: null
      });
      remainingTeams = remainingTeams.filter(t => t.franchiseId !== tiedGroup[0].franchiseId);
      nextStanding++;
    } else {
      // Resolve tiebreakers within the tied group one position at a time
      let tiedRemaining = [...tiedGroup];
      while (tiedRemaining.length > 1) {
        const result = applyTiebreaker(schedule, tiedRemaining, rankingsMap);
        standingsResult.push({
          ...result.winner,
          standing: nextStanding,
          ccgBound: false,
          tiebreaker: result.reason
        });
        remainingTeams = remainingTeams.filter(t => t.franchiseId !== result.winner.franchiseId);
        tiedRemaining = tiedRemaining.filter(t => t.franchiseId !== result.winner.franchiseId);
        nextStanding++;
      }
      // Last team in the tied group
      if (tiedRemaining.length === 1) {
        standingsResult.push({
          ...tiedRemaining[0],
          standing: nextStanding,
          ccgBound: false,
          tiebreaker: null
        });
        remainingTeams = remainingTeams.filter(t => t.franchiseId !== tiedRemaining[0].franchiseId);
        nextStanding++;
      }
    }
  }

  return standingsResult;
}

/**
 * Get projected conference championship matchups for all auto-bid conferences
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Week to calculate through
 * @returns {Object} - Map of conference -> { team1, team2, team1Tiebreaker, team2Tiebreaker }
 */
function getProjectedConferenceChampionships(year, throughWeek = null) {
  // Default to regular season weeks if not specified
  if (throughWeek === null) {
    const config = getConfig();
    throughWeek = config.season.getRegularSeasonWeeks(year);
  }

  const AUTO_BID_CONFERENCES = ["ACC", "B10", "B12", "P12", "SEC"];
  const results = {};

  AUTO_BID_CONFERENCES.forEach(conf => {
    const standings = getConferenceStandingsWithTiebreakers(year, conf, throughWeek);
    const ccgTeams = standings.filter(t => t.ccgBound);

    results[conf] = {
      team1: ccgTeams[0] || null,
      team2: ccgTeams[1] || null
    };
  });

  return results;
}

/**
 * Display conference standings with tiebreaker info
 * @param {Number} year - Season year
 * @param {String} conference - Conference name
 * @param {Number} throughWeek - Week number
 */
function displayConferenceStandings(year, conference, throughWeek = 12) {
  const standings = getConferenceStandingsWithTiebreakers(year, conference, throughWeek);

  Logger.log(`\n=== ${conference} CONFERENCE STANDINGS (Week ${throughWeek}) ===\n`);

  standings.forEach(team => {
    const record = `${team.confWins}-${team.confLosses}`;
    const winPct = (team.confWinPct * 100).toFixed(1);
    const ccgStatus = team.ccgBound ? "📍 CCG" : "";
    const tiebreaker = team.tiebreaker ? `(${team.tiebreaker})` : "";

    Logger.log(`${team.standing}. ${team.teamName} ${record} (${winPct}%) ${ccgStatus} ${tiebreaker}`);
  });

  return standings;
}

/**
 * Display all conference championship projections
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Week number
 */
function displayAllConferenceChampionships(year, throughWeek = 12) {
  const championships = getProjectedConferenceChampionships(year, throughWeek);

  Logger.log(`\n=== PROJECTED CONFERENCE CHAMPIONSHIPS (Week ${throughWeek}) ===\n`);

  Object.entries(championships).forEach(([conf, matchup]) => {
    const team1 = matchup.team1;
    const team2 = matchup.team2;

    if (team1 && team2) {
      const t1Record = `${team1.confWins}-${team1.confLosses}`;
      const t2Record = `${team2.confWins}-${team2.confLosses}`;
      const t1TB = team1.tiebreaker ? ` (${team1.tiebreaker})` : "";
      const t2TB = team2.tiebreaker ? ` (${team2.tiebreaker})` : "";

      Logger.log(`${conf}: #1 ${team1.teamName} ${t1Record}${t1TB} vs #2 ${team2.teamName} ${t2Record}${t2TB}`);
    } else {
      Logger.log(`${conf}: TBD`);
    }
  });

  return championships;
}

// ============================================================================
// CONFERENCE STANDINGS SHEET
// ============================================================================

/**
 * Get or create the ConferenceStandings sheet
 */
function getConferenceStandingsSheet() {
  const headers = [
    "Year",
    "AsOfWeek",
    "Conference",
    "FranchiseID",
    "TeamName",
    "ConfWins",
    "ConfLosses",
    "ConfWinPct",
    "ConfPointsFor",
    "Standing",
    "CCGBound",
    "Tiebreaker",
    "AllPlayPct",
    "TotalPF",
    "NationalRank",
    "CalculatedAt"
  ];

  return getOrCreateSheet("ConferenceStandings", headers);
}

/**
 * Calculate and save conference standings for all conferences
 * @param {Number} year - Season year
 * @param {Number} throughWeek - Week number of data (defaults to regular season weeks)
 *                              Standings are saved as "going into Week N+1" to match rankings convention
 */
function calculateAndSaveConferenceStandings(year, throughWeek = null) {
  // Default to regular season weeks if not specified
  if (throughWeek === null) {
    const config = getConfig();
    throughWeek = config.season.getRegularSeasonWeeks(year);
  }

  // Display week is throughWeek + 1 (standings going into that week)
  // This matches how rankings work - data through Week 10 = "Week 11 standings"
  const displayWeek = throughWeek + 1;

  Logger.log(`=== Calculating Conference Standings ===`);
  Logger.log(`Data through Week ${throughWeek} -> Standings for Week ${displayWeek}`);

  const sheet = getConferenceStandingsSheet();
  const calculatedAt = new Date().toISOString();

  // Get all conferences
  const conferences = getConferences();

  // Clear existing data for this year/displayWeek
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    const headers = data[0];
    const yearIdx = headers.indexOf("Year");
    const weekIdx = headers.indexOf("AsOfWeek");

    const rowsToKeep = data.slice(1).filter(row =>
      !(Number(row[yearIdx]) === year && Number(row[weekIdx]) === displayWeek)
    );

    sheet.getRange(2, 1, data.length - 1, headers.length).clearContent();

    if (rowsToKeep.length > 0) {
      sheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    }
  }

  // Calculate standings for each conference
  const allRows = [];

  conferences.forEach(conf => {
    const standings = getConferenceStandingsWithTiebreakers(year, conf, throughWeek);

    standings.forEach(team => {
      allRows.push([
        year,
        displayWeek,
        conf,
        team.franchiseId,
        team.teamName,
        team.confWins,
        team.confLosses,
        team.confWinPct,
        team.confPointsFor,
        team.standing,
        team.ccgBound,
        team.tiebreaker || "",
        team.allPlayPct,
        team.totalPF,
        team.nationalRank,
        calculatedAt
      ]);
    });
  });

  // Write new standings
  if (allRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, allRows.length, allRows[0].length).setValues(allRows);
  }

  Logger.log(`Saved ${allRows.length} conference standings records for Week ${displayWeek}`);

  // Log CCG matchups
  const championships = getProjectedConferenceChampionships(year, throughWeek);
  Logger.log(`\nProjected Conference Championship Matchups (Week ${displayWeek}):`);

  Object.entries(championships).forEach(([conf, m]) => {
    if (m.team1 && m.team2) {
      Logger.log(`  ${conf}: ${m.team1.teamName} vs ${m.team2.teamName}`);
    }
  });

  return allRows.length;
}

/**
 * Get conference standings from sheet
 * @param {Number} year - Season year
 * @param {String} conference - Conference name (optional, returns all if not specified)
 * @param {Number} week - Week number (optional, defaults to latest)
 * @returns {Array} - Array of standing objects
 */
function getConferenceStandingsFromSheet(year, conference = null, week = null) {
  const sheet = getConferenceStandingsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Find latest week if not specified
  if (week === null) {
    let maxWeek = 0;
    data.slice(1).forEach(row => {
      if (Number(row[colMap["Year"]]) === year) {
        maxWeek = Math.max(maxWeek, Number(row[colMap["AsOfWeek"]]));
      }
    });
    week = maxWeek;
  }

  if (week === 0) return [];

  // Filter and map
  return data.slice(1)
    .filter(row => {
      const matchYear = Number(row[colMap["Year"]]) === year;
      const matchWeek = Number(row[colMap["AsOfWeek"]]) === week;
      const matchConf = conference ? row[colMap["Conference"]] === conference : true;
      return matchYear && matchWeek && matchConf;
    })
    .map(row => ({
      year: Number(row[colMap["Year"]]),
      week: Number(row[colMap["AsOfWeek"]]),
      conference: row[colMap["Conference"]],
      franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
      teamName: row[colMap["TeamName"]],
      confWins: Number(row[colMap["ConfWins"]]),
      confLosses: Number(row[colMap["ConfLosses"]]),
      confWinPct: Number(row[colMap["ConfWinPct"]]),
      confPointsFor: Number(row[colMap["ConfPointsFor"]]),
      standing: Number(row[colMap["Standing"]]),
      ccgBound: row[colMap["CCGBound"]] === true || row[colMap["CCGBound"]] === "TRUE",
      tiebreaker: row[colMap["Tiebreaker"]] || null,
      allPlayPct: Number(row[colMap["AllPlayPct"]] || 0),
      totalPF: Number(row[colMap["TotalPF"]] || 0),
      nationalRank: Number(row[colMap["NationalRank"]] || 99)
    }))
    .sort((a, b) => a.standing - b.standing);
}
