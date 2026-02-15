/*********************************
 * VALIDATION
 *
 * Functions for validating the generated schedule against league rules
 *********************************/

/**
 * Validate the complete schedule grid
 * Returns detailed validation results
 *
 * @param {Object} grid - The schedule grid
 * @param {Array} teams - Array of team objects
 * @param {Object} params - League parameters
 * @returns {Object} - { valid: boolean, errors: [], warnings: [], summary: {} }
 */
function validateGrid(grid, teams, params) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    summary: {
      totalGames: 0,
      conferenceGames: 0,
      nonConferenceGames: 0,
      teamsWithIssues: 0,
      teamsComplete: 0
    }
  };

  const seen = new Set();  // Track matchups to count unique games

  teams.forEach(t => {
    const id = t.id;
    const teamErrors = [];
    const teamWarnings = [];

    let total = 0;
    let conf = 0;
    let nc = 0;
    const missingWeeks = [];
    const opponents = new Set();

    // Check each week
    for (let w = 1; w <= params.weeks; w++) {
      const g = grid[id][w];

      if (!g) {
        missingWeeks.push(w);
        continue;
      }

      total++;

      if (g.type === "CONF") {
        conf++;

        // Verify opponent is same conference
        const opp = TEAMS_BY_ID[g.opponent];
        if (opp && opp.conference !== t.conference) {
          teamErrors.push(`Week ${w}: CONF game vs ${g.opponent} but different conferences`);
        }
      } else if (g.type === "NC") {
        nc++;

        // Verify opponent is different conference
        const opp = TEAMS_BY_ID[g.opponent];
        if (opp && opp.conference === t.conference) {
          teamErrors.push(`Week ${w}: NC game vs ${g.opponent} but same conference`);
        }
      }

      // Track unique matchups for total count
      const matchupKey = [id, g.opponent].sort().join("-");
      if (!seen.has(matchupKey)) {
        seen.add(matchupKey);
        result.summary.totalGames++;
        if (g.type === "CONF") result.summary.conferenceGames++;
        if (g.type === "NC") result.summary.nonConferenceGames++;
      }

      // Check for duplicate opponents
      if (opponents.has(g.opponent)) {
        teamErrors.push(`Plays ${g.opponent} multiple times`);
      }
      opponents.add(g.opponent);
    }

    // Validate totals
    if (missingWeeks.length > 0) {
      teamErrors.push(`Missing games in weeks: ${missingWeeks.join(", ")}`);
    }

    if (total !== params.gamesPerTeam) {
      teamErrors.push(`Has ${total}/${params.gamesPerTeam} total games`);
    }

    if (conf !== params.conferenceGames) {
      teamErrors.push(`Has ${conf}/${params.conferenceGames} conference games`);
    }

    if (nc !== params.nonConferenceGames) {
      teamErrors.push(`Has ${nc}/${params.nonConferenceGames} non-conference games`);
    }

    // Record results
    if (teamErrors.length > 0) {
      result.valid = false;
      result.summary.teamsWithIssues++;
      teamErrors.forEach(err => {
        result.errors.push(`Team ${id} (${t.name}): ${err}`);
      });
    } else {
      result.summary.teamsComplete++;
    }

    teamWarnings.forEach(warn => {
      result.warnings.push(`Team ${id} (${t.name}): ${warn}`);
    });
  });

  // Global validation
  const expectedTotalGames = (params.teams * params.gamesPerTeam) / 2;
  if (result.summary.totalGames !== expectedTotalGames) {
    result.errors.push(`Total games: ${result.summary.totalGames} (expected: ${expectedTotalGames})`);
    result.valid = false;
  }

  const expectedConfGames = (params.teams * params.conferenceGames) / 2;
  if (result.summary.conferenceGames !== expectedConfGames) {
    result.warnings.push(`Conference games: ${result.summary.conferenceGames} (expected: ${expectedConfGames})`);
  }

  const expectedNCGames = (params.teams * params.nonConferenceGames) / 2;
  if (result.summary.nonConferenceGames !== expectedNCGames) {
    result.warnings.push(`NC games: ${result.summary.nonConferenceGames} (expected: ${expectedNCGames})`);
  }

  return result;
}

/**
 * Audit and log all schedule issues to the Scheduler Log sheet
 * This is called during scheduling to log issues as they're found
 */
function auditAndLogScheduleIssues(grid, teams, params) {
  const logged = new Set(); // prevents duplicates

  const logOnce = (key, payload) => {
    if (logged.has(key)) return;
    logged.add(key);
    logSchedulerEvent(payload);
  };

  let issueCount = 0;

  teams.forEach(team => {
    const id = team.id;
    const games = grid[id];

    let total = 0;
    let conf = 0;
    let nc = 0;
    const missingWeeks = [];

    for (let w = 1; w <= params.weeks; w++) {
      const g = games[w];
      if (!g) {
        missingWeeks.push(w);
        continue;
      }

      total++;
      if (g.type === "CONF") conf++;
      if (g.type === "NC") nc++;
    }

    if (missingWeeks.length) {
      logOnce(
        `${id}:MISSING_WEEKS`,
        {
          phase: "AUDIT",
          severity: "ERROR",
          type: "MISSING_WEEKS",
          team: id,
          message: `Missing games in weeks: ${missingWeeks.join(", ")}`
        }
      );
      issueCount++;
    }

    if (total !== params.gamesPerTeam) {
      logOnce(
        `${id}:TOTAL`,
        {
          phase: "AUDIT",
          severity: "ERROR",
          type: "TOTAL_GAMES",
          team: id,
          message: `Has ${total}/${params.gamesPerTeam} total games`
        }
      );
      issueCount++;
    }

    if (conf !== params.conferenceGames) {
      logOnce(
        `${id}:CONF`,
        {
          phase: "AUDIT",
          severity: "ERROR",
          type: "CONF_GAMES",
          team: id,
          message: `Has ${conf}/${params.conferenceGames} conference games`
        }
      );
      issueCount++;
    }

    if (nc !== params.nonConferenceGames) {
      logOnce(
        `${id}:NC`,
        {
          phase: "AUDIT",
          severity: "ERROR",
          type: "NC_GAMES",
          team: id,
          message: `Has ${nc}/${params.nonConferenceGames} non-conference games`
        }
      );
      issueCount++;
    }
  });

  // Log summary
  if (issueCount === 0) {
    logSchedulerEvent({
      phase: "AUDIT",
      severity: "INFO",
      type: "COMPLETE",
      message: `Schedule audit complete: No issues found for ${teams.length} teams`
    });
  } else {
    logSchedulerEvent({
      phase: "AUDIT",
      severity: "WARN",
      type: "ISSUES_FOUND",
      message: `Schedule audit complete: ${issueCount} issues found`
    });
  }
}

/**
 * Run full validation and return a formatted report
 * Can be called independently to check a schedule
 */
function runScheduleValidation() {
  const teams = loadTeams();
  TEAMS_BY_ID = Object.fromEntries(teams.map(t => [t.id, t]));

  const params = getLeagueParams();
  const grid = loadExistingScheduleIntoGrid(teams, params);

  if (!grid) {
    Logger.log("No schedule found to validate");
    return null;
  }

  const result = validateGrid(grid, teams, params);

  // Log results
  Logger.log("=== SCHEDULE VALIDATION REPORT ===");
  Logger.log(`Valid: ${result.valid}`);
  Logger.log(`Teams Complete: ${result.summary.teamsComplete}/${teams.length}`);
  Logger.log(`Teams With Issues: ${result.summary.teamsWithIssues}`);
  Logger.log(`Total Games: ${result.summary.totalGames}`);
  Logger.log(`Conference Games: ${result.summary.conferenceGames}`);
  Logger.log(`NC Games: ${result.summary.nonConferenceGames}`);

  if (result.errors.length > 0) {
    Logger.log("\n--- ERRORS ---");
    result.errors.slice(0, 20).forEach(e => Logger.log(e));
    if (result.errors.length > 20) {
      Logger.log(`... and ${result.errors.length - 20} more errors`);
    }
  }

  if (result.warnings.length > 0) {
    Logger.log("\n--- WARNINGS ---");
    result.warnings.forEach(w => Logger.log(w));
  }

  return result;
}

/**
 * Validate rivalries against league rules
 * @returns {Object} - { valid: boolean, errors: [], warnings: [] }
 */
function validateRivalries() {
  const params = getLeagueParams();
  const rivalries = loadAllRivalries();
  const teams = loadTeams();
  TEAMS_BY_ID = Object.fromEntries(teams.map(t => [t.id, t]));

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    teamCounts: {}
  };

  // Count rivalries per team
  rivalries.forEach(r => {
    // Only count confirmed rivalries toward limits
    if (r.status !== "CONFIRMED") return;

    result.teamCounts[r.teamA] = (result.teamCounts[r.teamA] || 0) + 1;
    result.teamCounts[r.teamB] = (result.teamCounts[r.teamB] || 0) + 1;
  });

  // Check for over-limit
  Object.entries(result.teamCounts).forEach(([teamId, count]) => {
    if (count > params.maxRivalsPerTeam) {
      const team = TEAMS_BY_ID[teamId];
      const teamName = team ? team.name : teamId;
      result.errors.push(`${teamName} has ${count} rivalries (max: ${params.maxRivalsPerTeam})`);
      result.valid = false;
    }
  });

  // Check for invalid teams in rivalries
  rivalries.forEach(r => {
    if (!TEAMS_BY_ID[r.teamA]) {
      result.errors.push(`Invalid team in rivalry: ${r.teamA}`);
      result.valid = false;
    }
    if (!TEAMS_BY_ID[r.teamB]) {
      result.errors.push(`Invalid team in rivalry: ${r.teamB}`);
      result.valid = false;
    }
  });

  // Check wager amounts
  rivalries.forEach(r => {
    if (r.wager < 0 || r.wager > params.maxWager) {
      result.warnings.push(`Rivalry ${r.name || r.teamA + ' vs ' + r.teamB}: Invalid wager $${r.wager} (max: $${params.maxWager})`);
    }
  });

  Logger.log("=== RIVALRY VALIDATION ===");
  Logger.log(`Valid: ${result.valid}`);
  Logger.log(`Total Rivalries: ${rivalries.length}`);
  Logger.log(`Confirmed: ${rivalries.filter(r => r.status === "CONFIRMED").length}`);
  Logger.log(`Pending: ${rivalries.filter(r => r.status === "PENDING").length}`);

  if (result.errors.length > 0) {
    Logger.log("\nErrors:");
    result.errors.forEach(e => Logger.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    Logger.log("\nWarnings:");
    result.warnings.forEach(w => Logger.log(`  - ${w}`));
  }

  return result;
}
