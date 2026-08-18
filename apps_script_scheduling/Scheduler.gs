/**
 * FANTASY LEAGUE SCHEDULER
 *
 * Two-phase scheduling system:
 *
 * PHASE 1 - CONFERENCE SCHEDULE (run early, before NC submission period)
 *   - Loads confirmed conference rivalries
 *   - Schedules conference rivals:
 *     • 1 rival: Week 12 (Rivalry Week)
 *     • 2 rivals: First → Week 12, Second → Week 5
 *   - Auto-fills remaining conference games (weeks 5-12)
 *   - Output: Conference portion of schedule (weeks 5-12)
 *
 * PHASE 2 - NON-CONFERENCE SCHEDULE (run after NC submission deadline)
 *   - Loads confirmed manual NC games
 *   - Loads confirmed NC rivalries
 *   - Auto-fills remaining NC games (weeks 1-4)
 *   - Output: Complete schedule (weeks 1-12)
 *
 * Schedule Structure:
 *   - Weeks 1-4: Non-Conference games (4 per team)
 *   - Weeks 5-12: Conference games (8 per team)
 *   - Week 5: Secondary Rivalry Week (for teams with 2 conference rivals)
 *   - Week 12: Primary Rivalry Week (conference rivals play here)
 */

// ============================================================================
// PHASE 1: CONFERENCE SCHEDULE
// ============================================================================

/**
 * Phase 1: Generate conference schedule (weeks 5-12)
 * Run this BEFORE the non-conference submission period opens
 *
 * Steps:
 * 1. Validate team structure
 * 2. Load confirmed conference rivalries
 * 3. Schedule conference rivals (1 rival → Week 12, 2 rivals → Week 12 + Week 5)
 * 4. Auto-fill remaining conference games
 * 5. Write conference schedule to sheet
 */
function runConferenceScheduler() {
  logSchedulerEvent({
    phase: "PHASE_1",
    severity: "INFO",
    type: "START",
    message: "Phase 1: Conference Scheduler started"
  });

  const teams = loadTeams();
  TEAMS_BY_ID = Object.fromEntries(teams.map(t => [t.id, t]));

  const params = getLeagueParams();

  // Pre-flight validation
  const structureValidation = validateTeamStructure(teams, params);
  if (!structureValidation.valid) {
    structureValidation.errors.forEach(err => {
      logSchedulerEvent({
        phase: "PHASE_1",
        severity: "ERROR",
        type: "VALIDATION_FAILED",
        message: err
      });
    });
    Logger.log("Phase 1 ABORTED: Team structure validation failed");
    Logger.log(structureValidation.errors.join("\n"));
    return null;
  }

  // Log any warnings
  structureValidation.warnings.forEach(warn => {
    logSchedulerEvent({
      phase: "PHASE_1",
      severity: "WARN",
      type: "VALIDATION_WARNING",
      message: warn
    });
  });

  // Initialize grid (only conference weeks for Phase 1)
  const grid = initScheduleGrid(teams, params);

  // Load confirmed conference rivalries
  const allRivalries = loadConfirmedRivalries();
  const conferenceRivalries = allRivalries.filter(r => {
    const teamA = TEAMS_BY_ID[r.teamA];
    const teamB = TEAMS_BY_ID[r.teamB];
    return teamA && teamB && teamA.conference === teamB.conference;
  });

  logSchedulerEvent({
    phase: "PHASE_1",
    severity: "INFO",
    type: "RIVALRIES_LOADED",
    message: `Found ${conferenceRivalries.length} confirmed conference rivalries`
  });

  // Schedule conference rivalries to Week 12 (Rivalry Week)
  applyConferenceRivalriesToGrid(grid, conferenceRivalries, params);

  // Fill remaining conference games (weeks 5-11, plus Week 12 for non-rivals)
  applyConferenceGames(grid, teams, params);

  // Audit conference schedule
  auditConferenceSchedule(grid, teams, params);

  // Write conference schedule (only weeks 5-12)
  writeConferenceSchedule(grid, teams, params);

  logSchedulerEvent({
    phase: "PHASE_1",
    severity: "INFO",
    type: "COMPLETE",
    message: "Phase 1: Conference Scheduler completed"
  });

  // Show completion message
  SpreadsheetApp.getUi().alert(
    "Conference Schedule Complete",
    "Conference games (Weeks 5-12) have been generated.\n\n" +
    "Check the 'Schedule' tab for results and 'Scheduler Log' for any issues.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return grid;
}

// ============================================================================
// PHASE 2: NON-CONFERENCE SCHEDULE
// ============================================================================

/**
 * Phase 2: Generate non-conference schedule (weeks 1-4)
 * Run this AFTER the non-conference submission deadline
 *
 * Steps:
 * 1. Load existing conference schedule from Phase 1
 * 2. Load confirmed manual NC games
 * 3. Load confirmed NC rivalries
 * 4. Apply manual games (highest priority)
 * 5. Apply NC rivalries (second priority)
 * 6. Auto-fill remaining NC games
 * 7. Write complete schedule
 */
function runNonConferenceScheduler() {
  logSchedulerEvent({
    phase: "PHASE_2",
    severity: "INFO",
    type: "START",
    message: "Phase 2: Non-Conference Scheduler started"
  });

  const teams = loadTeams();
  TEAMS_BY_ID = Object.fromEntries(teams.map(t => [t.id, t]));

  const params = getLeagueParams();

  // Load existing conference schedule into grid
  const grid = loadExistingScheduleIntoGrid(teams, params);

  if (!grid) {
    logSchedulerEvent({
      phase: "PHASE_2",
      severity: "ERROR",
      type: "NO_CONF_SCHEDULE",
      message: "No conference schedule found. Run Phase 1 first."
    });
    Logger.log("Phase 2 ABORTED: Run runConferenceScheduler() first");
    return null;
  }

  // Verify conference schedule is complete
  const confCheck = verifyConferenceScheduleComplete(grid, teams, params);
  if (!confCheck.complete) {
    logSchedulerEvent({
      phase: "PHASE_2",
      severity: "ERROR",
      type: "INCOMPLETE_CONF",
      message: `Conference schedule incomplete: ${confCheck.issues.length} issues found`
    });
    confCheck.issues.forEach(issue => {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "ERROR",
        type: "CONF_ISSUE",
        message: issue
      });
    });
  }

  // Wipe any NC games (weeks 1-4) carried over from a previous run so stale
  // auto-filled games don't occupy slots and block Priority-1 manual games.
  // Conference games (weeks 5-12) are preserved.
  clearNonConferenceWindow(grid, teams);
  logSchedulerEvent({
    phase: "PHASE_2",
    severity: "INFO",
    type: "NC_WINDOW_CLEARED",
    message: "Cleared non-conference window (weeks 1-4) for fresh regeneration"
  });

  // Load confirmed manual NC games
  const manualGames = loadConfirmedManualGames();
  logSchedulerEvent({
    phase: "PHASE_2",
    severity: "INFO",
    type: "MANUAL_LOADED",
    message: `Found ${manualGames.length} confirmed manual NC games`
  });

  // Load confirmed NC rivalries
  const allRivalries = loadConfirmedRivalries();
  const ncRivalries = allRivalries.filter(r => {
    const teamA = TEAMS_BY_ID[r.teamA];
    const teamB = TEAMS_BY_ID[r.teamB];
    return teamA && teamB && teamA.conference !== teamB.conference;
  });

  logSchedulerEvent({
    phase: "PHASE_2",
    severity: "INFO",
    type: "NC_RIVALRIES_LOADED",
    message: `Found ${ncRivalries.length} confirmed NC rivalries`
  });

  // PRIORITY 1: Apply confirmed manual NC games
  applyManualGamesToGrid(grid, manualGames, params);

  // PRIORITY 2: Apply NC rivalries
  applyNCRivalriesToGrid(grid, ncRivalries, params);

  // PRIORITY 3: Auto-fill remaining NC games
  fillNonConferenceGames(grid, teams, params);

  // Full audit
  auditAndLogScheduleIssues(grid, teams, params);

  // Write complete schedule
  writeScheduleFromGrid(grid);
  writeValidationMatrixWithTotals(grid, teams, params);

  logSchedulerEvent({
    phase: "PHASE_2",
    severity: "INFO",
    type: "COMPLETE",
    message: "Phase 2: Non-Conference Scheduler completed"
  });

  // Show completion message
  SpreadsheetApp.getUi().alert(
    "Non-Conference Schedule Complete",
    "Non-conference games (Weeks 1-4) have been generated.\n\n" +
    "Check the 'Schedule' tab for the complete schedule and 'Validation' tab for the matrix.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return grid;
}

// ============================================================================
// FULL SCHEDULER (BOTH PHASES)
// ============================================================================

/**
 * Run both phases in sequence
 * Use for testing or when generating a complete schedule at once
 */
function runFullScheduler() {
  logSchedulerEvent({
    phase: "SYSTEM",
    severity: "INFO",
    type: "START",
    message: "Full Scheduler execution started (Phase 1 + Phase 2)"
  });

  // Phase 1: Conference
  const confGrid = runConferenceScheduler();
  if (!confGrid) {
    logSchedulerEvent({
      phase: "SYSTEM",
      severity: "ERROR",
      type: "PHASE1_FAILED",
      message: "Full scheduler aborted: Phase 1 failed"
    });
    return;
  }

  // Phase 2: Non-Conference
  const fullGrid = runNonConferenceScheduler();
  if (!fullGrid) {
    logSchedulerEvent({
      phase: "SYSTEM",
      severity: "ERROR",
      type: "PHASE2_FAILED",
      message: "Full scheduler aborted: Phase 2 failed"
    });
    return;
  }

  logSchedulerEvent({
    phase: "SYSTEM",
    severity: "INFO",
    type: "COMPLETE",
    message: "Full Scheduler execution completed"
  });

  return fullGrid;
}

/**
 * Legacy function - runs full scheduler
 * Kept for backwards compatibility
 */
function runScheduler() {
  return runFullScheduler();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Load existing schedule from the Schedule sheet into a grid
 * Used by Phase 2 to load Phase 1 results
 */
function loadExistingScheduleIntoGrid(teams, params) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SCHEDULE_SHEET);

  if (!sheet || sheet.getLastRow() <= 1) {
    return null;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find column indices
  const weekCol = headers.indexOf("Week");
  const homeCol = headers.indexOf("Home");
  const awayCol = headers.indexOf("Away");
  const typeCol = headers.indexOf("Type");

  if (weekCol === -1 || homeCol === -1 || awayCol === -1) {
    Logger.log("Schedule sheet missing required columns");
    return null;
  }

  const grid = initScheduleGrid(teams, params);

  // Load existing games into grid
  data.slice(1).forEach(row => {
    const week = Number(row[weekCol]);
    const home = String(row[homeCol]).padStart(3, "0");
    const away = String(row[awayCol]).padStart(3, "0");
    const type = row[typeCol] || "CONF";

    if (grid[home] && grid[away] && week >= 1 && week <= params.weeks) {
      grid[home][week] = { opponent: away, type, forced: true };
      grid[away][week] = { opponent: home, type, forced: true };
    }
  });

  return grid;
}

/**
 * Verify that conference schedule (weeks 5-12) is complete
 */
function verifyConferenceScheduleComplete(grid, teams, params) {
  const issues = [];

  teams.forEach(t => {
    let confGames = 0;

    for (let w = WEEK_WINDOWS.CONF.start; w <= WEEK_WINDOWS.CONF.end; w++) {
      if (grid[t.id][w] && grid[t.id][w].type === "CONF") {
        confGames++;
      }
    }

    if (confGames !== params.conferenceGames) {
      issues.push(`Team ${t.id} has ${confGames}/${params.conferenceGames} conference games`);
    }
  });

  return {
    complete: issues.length === 0,
    issues
  };
}

/**
 * Apply conference rivalries to grid
 *
 * Scheduling logic:
 * - If team has 1 conference rival: Schedule to Week 12 (Rivalry Week)
 * - If team has 2 conference rivals: First → Week 12, Second → Week 5
 *
 * This ensures rivalry games get premium placement while handling
 * teams with multiple conference rivals.
 */
function applyConferenceRivalriesToGrid(grid, rivalries, params) {
  const rivalryWeek = params.conferenceRivalryWeek;        // Week 12 (primary)
  const secondRivalryWeek = params.secondaryRivalryWeek;   // Week 5 (secondary)

  if (!rivalries || rivalries.length === 0) {
    logSchedulerEvent({
      phase: "PHASE_1",
      severity: "INFO",
      type: "NO_RIVALRIES",
      message: "No conference rivalries to schedule"
    });
    return;
  }

  // Build a map of each team's conference rivals
  const rivalsByTeam = {};
  rivalries.forEach(r => {
    const a = r.teamA;
    const b = r.teamB;

    if (!TEAMS_BY_ID[a] || !TEAMS_BY_ID[b]) {
      logSchedulerEvent({
        phase: "PHASE_1",
        severity: "ERROR",
        type: "INVALID_RIVALRY",
        message: `Invalid rivalry: ${a} vs ${b} - team not found`
      });
      return;
    }

    rivalsByTeam[a] = rivalsByTeam[a] || [];
    rivalsByTeam[b] = rivalsByTeam[b] || [];
    rivalsByTeam[a].push({ opponent: b, name: r.name, data: r });
    rivalsByTeam[b].push({ opponent: a, name: r.name, data: r });
  });

  // Track scheduled pairs to avoid duplicates
  const scheduled = new Set();

  // Process each team's rivalries
  Object.keys(rivalsByTeam).forEach(teamId => {
    const teamRivals = rivalsByTeam[teamId];

    teamRivals.forEach((rival, index) => {
      const pairKey = [teamId, rival.opponent].sort().join("-");

      // Skip if already scheduled
      if (scheduled.has(pairKey)) return;

      // Determine target week based on rivalry index
      // First rival → Week 12, Second rival → Week 5
      let targetWeek, fallbackWeek;

      if (teamRivals.length === 1) {
        // Only one rival: Week 12 primary, Week 5 fallback
        targetWeek = rivalryWeek;
        fallbackWeek = secondRivalryWeek;
      } else {
        // Two rivals: distribute between Week 12 and Week 5
        if (index === 0) {
          targetWeek = rivalryWeek; // Week 12
          fallbackWeek = secondRivalryWeek; // Week 5
        } else {
          targetWeek = secondRivalryWeek; // Week 5
          fallbackWeek = rivalryWeek; // Week 12
        }
      }

      // Try target week first
      if (!grid[teamId][targetWeek] && !grid[rival.opponent][targetWeek]) {
        commitGame(grid, teamId, rival.opponent, targetWeek, "CONF", true);
        scheduled.add(pairKey);
        logSchedulerEvent({
          phase: "PHASE_1",
          severity: "INFO",
          type: "RIVALRY_SCHEDULED",
          message: `Rivalry "${rival.name || 'Conference Rivalry'}": ${teamId} vs ${rival.opponent} → Week ${targetWeek}`
        });
        return;
      }

      // Try fallback week
      if (!grid[teamId][fallbackWeek] && !grid[rival.opponent][fallbackWeek]) {
        commitGame(grid, teamId, rival.opponent, fallbackWeek, "CONF", true);
        scheduled.add(pairKey);
        logSchedulerEvent({
          phase: "PHASE_1",
          severity: "INFO",
          type: "RIVALRY_SCHEDULED_FALLBACK",
          message: `Rivalry "${rival.name || 'Conference Rivalry'}": ${teamId} vs ${rival.opponent} → Week ${fallbackWeek} (fallback)`
        });
        return;
      }

      // Both preferred weeks taken - find any open conference week
      const altWeek = findOpenWeek(grid, teamId, rival.opponent, WEEK_WINDOWS.CONF);
      if (altWeek) {
        commitGame(grid, teamId, rival.opponent, altWeek, "CONF", true);
        scheduled.add(pairKey);
        logSchedulerEvent({
          phase: "PHASE_1",
          severity: "WARN",
          type: "RIVALRY_RESCHEDULED",
          message: `Rivalry "${rival.name || 'Conference Rivalry'}": ${teamId} vs ${rival.opponent} → Week ${altWeek} (no preferred weeks available)`
        });
        return;
      }

      // Could not schedule
      logSchedulerEvent({
        phase: "PHASE_1",
        severity: "ERROR",
        type: "RIVALRY_FAILED",
        message: `Could not schedule rivalry "${rival.name || 'Conference Rivalry'}": ${teamId} vs ${rival.opponent} - no open weeks`
      });
    });
  });

  logSchedulerEvent({
    phase: "PHASE_1",
    severity: "INFO",
    type: "RIVALRIES_COMPLETE",
    message: `Conference rivalries processed: ${scheduled.size} games scheduled`
  });
}

/**
 * Apply confirmed manual NC games to grid
 */
function applyManualGamesToGrid(grid, manualGames, params) {
  manualGames.forEach(game => {
    const week = game.week;
    const a = game.teamA;
    const b = game.teamB;

    // Guard: both teams must exist in the roster/grid (mirrors the guards in
    // loadExistingScheduleIntoGrid and the NC rivalry loader)
    if (!grid[a] || !grid[b] || !TEAMS_BY_ID[a] || !TEAMS_BY_ID[b]) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "ERROR",
        type: "UNKNOWN_TEAM",
        message: `Manual game references a team not in the Teams sheet (A=${a}, B=${b}) - could not resolve name/ID; skipping`
      });
      return;
    }

    // Validate week is in NC window
    if (week < WEEK_WINDOWS.NC.start || week > WEEK_WINDOWS.NC.end) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "ERROR",
        type: "INVALID_WEEK",
        message: `Manual game ${a} vs ${b}: Week ${week} is not in NC window (1-4)`
      });
      return;
    }

    // Check if slot is available
    if (grid[a][week] || grid[b][week]) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "WARN",
        type: "MANUAL_CONFLICT",
        message: `Manual game conflict: ${a} vs ${b} Week ${week} - slot taken`
      });
      return;
    }

    // Check teams are different conferences
    if (TEAMS_BY_ID[a].conference === TEAMS_BY_ID[b].conference) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "ERROR",
        type: "SAME_CONFERENCE",
        message: `Manual game ${a} vs ${b}: Same conference - must be NC`
      });
      return;
    }

    commitGame(grid, a, b, week, "NC", true);
    logSchedulerEvent({
      phase: "PHASE_2",
      severity: "INFO",
      type: "MANUAL_SCHEDULED",
      message: `Manual game: ${a} vs ${b} scheduled to Week ${week}`
    });
  });
}

/**
 * Apply NC rivalries to grid (any week 1-4)
 */
function applyNCRivalriesToGrid(grid, rivalries, params) {
  rivalries.forEach(r => {
    const a = r.teamA;
    const b = r.teamB;

    if (!TEAMS_BY_ID[a] || !TEAMS_BY_ID[b]) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "ERROR",
        type: "INVALID_RIVALRY",
        message: `Invalid NC rivalry: ${a} vs ${b} - team not found`
      });
      return;
    }

    // Check if already scheduled (from manual games)
    if (hasPlayed(grid, a, b)) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "INFO",
        type: "RIVALRY_ALREADY_SCHEDULED",
        message: `NC Rivalry ${r.name || ''}: ${a} vs ${b} already scheduled`
      });
      return;
    }

    // Check if both teams have NC slots available
    const aNCCount = countType(grid, a, "NC");
    const bNCCount = countType(grid, b, "NC");

    if (aNCCount >= params.nonConferenceGames) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "WARN",
        type: "RIVALRY_DROPPED",
        message: `NC Rivalry ${r.name || ''}: ${a} has no NC slots left - rivalry dropped`
      });
      return;
    }

    if (bNCCount >= params.nonConferenceGames) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "WARN",
        type: "RIVALRY_DROPPED",
        message: `NC Rivalry ${r.name || ''}: ${b} has no NC slots left - rivalry dropped`
      });
      return;
    }

    // Find open week for both teams
    const week = findOpenWeek(grid, a, b, WEEK_WINDOWS.NC);
    if (!week) {
      logSchedulerEvent({
        phase: "PHASE_2",
        severity: "WARN",
        type: "RIVALRY_NO_WEEK",
        message: `NC Rivalry ${r.name || ''}: ${a} vs ${b} - no mutual open week in 1-4`
      });
      return;
    }

    commitGame(grid, a, b, week, "NC", true);
    logSchedulerEvent({
      phase: "PHASE_2",
      severity: "INFO",
      type: "NC_RIVALRY_SCHEDULED",
      message: `NC Rivalry ${r.name || ''}: ${a} vs ${b} scheduled to Week ${week}`
    });
  });
}

/**
 * Write only conference schedule (weeks 5-12) to sheet
 * Used after Phase 1 to allow review before NC period
 */
function writeConferenceSchedule(grid, teams, params) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SCHEDULE_SHEET);
  if (!sheet) sheet = ss.insertSheet(SCHEDULE_SHEET);

  // Clear and write headers
  sheet.clearContents();
  sheet.appendRow(["Week", "Home", "Away", "Type"]);

  const seen = new Set();
  let gameCount = 0;

  // Only write conference games (weeks 5-12)
  Object.keys(grid).forEach(teamId => {
    for (let week = WEEK_WINDOWS.CONF.start; week <= WEEK_WINDOWS.CONF.end; week++) {
      const slot = grid[teamId][week];
      if (!slot || slot.type !== "CONF") continue;

      const oppId = slot.opponent;
      const key = [teamId, oppId, week].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      sheet.appendRow([week, teamId, oppId, slot.type]);
      gameCount++;
    }
  });

  logSchedulerEvent({
    phase: "PHASE_1",
    severity: gameCount === 400 ? "INFO" : "WARNING",  // 100 teams * 8 conf games / 2 = 400
    type: "CONF_SCHEDULE_WRITTEN",
    message: `Conference schedule written: ${gameCount} games (expected: 400)`
  });
}

/**
 * Audit only conference portion of schedule
 */
function auditConferenceSchedule(grid, teams, params) {
  const logged = new Set();

  const logOnce = (key, payload) => {
    if (logged.has(key)) return;
    logged.add(key);
    logSchedulerEvent(payload);
  };

  teams.forEach(team => {
    const id = team.id;
    let confGames = 0;
    const missingConfWeeks = [];

    for (let w = WEEK_WINDOWS.CONF.start; w <= WEEK_WINDOWS.CONF.end; w++) {
      const g = grid[id][w];
      if (!g) {
        missingConfWeeks.push(w);
      } else if (g.type === "CONF") {
        confGames++;
      }
    }

    if (missingConfWeeks.length) {
      logOnce(`${id}:MISSING_CONF_WEEKS`, {
        phase: "PHASE_1_AUDIT",
        severity: "ERROR",
        type: "MISSING_CONF_WEEKS",
        team: id,
        message: `Missing conference games in weeks: ${missingConfWeeks.join(", ")}`
      });
    }

    if (confGames !== params.conferenceGames) {
      logOnce(`${id}:CONF_COUNT`, {
        phase: "PHASE_1_AUDIT",
        severity: "ERROR",
        type: "CONF_GAMES",
        team: id,
        message: `Has ${confGames}/${params.conferenceGames} conference games`
      });
    }
  });
}
