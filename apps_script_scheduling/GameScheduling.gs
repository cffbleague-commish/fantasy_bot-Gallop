/*********************************
 * MANUAL GAMES (NC ONLY)
 *********************************/

function applyManualGames(grid) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("ManualGames");
  if (!sheet) return;

  sheet.getDataRange().getValues().slice(1).forEach(([week, a, b]) => {
    if (!week || !a || !b) return;

    a = String(a).padStart(3, "0");
    b = String(b).padStart(3, "0");

    try {
      commitGame(grid, a, b, Number(week), "NC", true);
    } catch (e) {
      logSchedulerEvent({
        phase: "MANUAL",
        severity: "ERROR",
        message: e.message
      });
    }
  });
}

/*********************************
 * NON-CONFERENCE RIVALRIES
 *
 * Handles cross-conference rivalries only.
 * Conference rivalries are handled by applyConferenceRivalries().
 *********************************/

function applyRivalries(grid, teams) {
  const rivalries = loadRivalries();
  if (!rivalries.length) {
    logSchedulerEvent({
      phase: "NC_RIVALRY",
      severity: "INFO",
      type: "NONE",
      message: "No rivalries found"
    });
    return;
  }

  let ncCount = 0;
  let skippedConf = 0;

  rivalries.forEach(r => {
    const a = r.a;
    const b = r.b;

    if (!TEAMS_BY_ID[a] || !TEAMS_BY_ID[b]) {
      logSchedulerEvent({
        phase: "NC_RIVALRY",
        severity: "ERROR",
        type: "INVALID_TEAM",
        message: `Invalid rivalry: ${a} vs ${b}`
      });
      return;
    }

    // Skip if already scheduled
    if (hasPlayed(grid, a, b)) return;

    const sameConference =
      TEAMS_BY_ID[a].conference === TEAMS_BY_ID[b].conference;

    // Skip conference rivalries - handled by applyConferenceRivalries()
    if (sameConference) {
      skippedConf++;
      return;
    }

    // Non-conference rivalries go in weeks 1-4
    const week = findOpenWeek(grid, a, b, [1, 2, 3, 4]);
    if (week != null) {
      commitGame(grid, a, b, week, "NC", true);
      ncCount++;

      logSchedulerEvent({
        phase: "NC_RIVALRY",
        severity: "INFO",
        type: "SCHEDULED",
        message: `NC rivalry: ${a} vs ${b} → Week ${week}`
      });
    } else {
      logSchedulerEvent({
        phase: "NC_RIVALRY",
        severity: "WARN",
        type: "NO_WEEK",
        message: `Could not find open week for NC rivalry: ${a} vs ${b}`
      });
    }
  });

  logSchedulerEvent({
    phase: "NC_RIVALRY",
    severity: "INFO",
    type: "COMPLETE",
    message: `NC rivalries processed: ${ncCount} scheduled, ${skippedConf} conference rivalries skipped`
  });
}

/*********************************
 * CONFERENCE RIVALRIES (HARD)
 *
 * Schedules conference rivalries:
 * - If team has 1 conference rival: Week 12 (Rivalry Week)
 * - If team has 2 conference rivals: First → Week 12, Second → Week 5
 *
 * Processes unique pairs only to avoid duplicate scheduling.
 *********************************/

function applyConferenceRivalries(grid, teams) {
  const rivals = loadRivalries();

  // Filter to only confirmed conference rivalries
  const confRivals = rivals.filter(r =>
    TEAMS_BY_ID[r.a] &&
    TEAMS_BY_ID[r.b] &&
    TEAMS_BY_ID[r.a].conference === TEAMS_BY_ID[r.b].conference
  );

  if (!confRivals.length) {
    logSchedulerEvent({
      phase: "CONF_RIVALRY",
      severity: "INFO",
      type: "NONE",
      message: "No conference rivalries found"
    });
    return;
  }

  // Build a map of each team's conference rivals
  const byTeam = {};
  confRivals.forEach(r => {
    byTeam[r.a] = byTeam[r.a] || [];
    byTeam[r.b] = byTeam[r.b] || [];
    byTeam[r.a].push({ opponent: r.b, name: r.name });
    byTeam[r.b].push({ opponent: r.a, name: r.name });
  });

  // Track which pairs have been scheduled to avoid duplicates
  const scheduled = new Set();

  // Track week assignments per team for logging
  const assignments = [];

  // Process each team's rivalries
  Object.keys(byTeam).forEach(teamId => {
    const rivalList = byTeam[teamId];

    rivalList.forEach((rival, index) => {
      const pairKey = [teamId, rival.opponent].sort().join("-");

      // Skip if this pair is already scheduled
      if (scheduled.has(pairKey)) return;
      if (hasPlayed(grid, teamId, rival.opponent)) {
        scheduled.add(pairKey);
        return;
      }

      // Determine target week based on how many rivals this team has
      // and which index this rival is in their list
      let targetWeek;
      let fallbackWeek;

      if (rivalList.length === 1) {
        // Only one rival → Week 12 (Rivalry Week)
        targetWeek = 12;
        fallbackWeek = 5;
      } else {
        // Two rivals → First gets Week 12, Second gets Week 5
        // But we need to check if opponent also has 2 rivals and coordinate
        const opponentRivals = byTeam[rival.opponent] || [];

        if (index === 0) {
          // First rival in this team's list → Week 12
          targetWeek = 12;
          fallbackWeek = 5;
        } else {
          // Second rival → Week 5
          targetWeek = 5;
          fallbackWeek = 12;
        }
      }

      // Try target week first, then fallback
      const weekOptions = [targetWeek, fallbackWeek];
      const week = findOpenWeek(grid, teamId, rival.opponent, weekOptions);

      if (week != null) {
        commitGame(grid, teamId, rival.opponent, week, "CONF", true);
        scheduled.add(pairKey);

        assignments.push({
          teamA: teamId,
          teamB: rival.opponent,
          week: week,
          name: rival.name || "Unnamed Rivalry"
        });

        logSchedulerEvent({
          phase: "CONF_RIVALRY",
          severity: "INFO",
          type: "SCHEDULED",
          message: `${rival.name || "Conference rivalry"}: ${teamId} vs ${rival.opponent} → Week ${week}`
        });
      } else {
        // No open week found - try any conference week as last resort
        const anyWeek = findOpenWeek(grid, teamId, rival.opponent,
          Array.from({ length: 8 }, (_, i) => i + 5) // Weeks 5-12
        );

        if (anyWeek != null) {
          commitGame(grid, teamId, rival.opponent, anyWeek, "CONF", true);
          scheduled.add(pairKey);

          logSchedulerEvent({
            phase: "CONF_RIVALRY",
            severity: "WARN",
            type: "FALLBACK",
            message: `${rival.name || "Conference rivalry"}: ${teamId} vs ${rival.opponent} → Week ${anyWeek} (fallback)`
          });
        } else {
          logSchedulerEvent({
            phase: "CONF_RIVALRY",
            severity: "ERROR",
            type: "FAILED",
            message: `Could not schedule ${rival.name || "conference rivalry"}: ${teamId} vs ${rival.opponent}`
          });
        }
      }
    });
  });

  logSchedulerEvent({
    phase: "CONF_RIVALRY",
    severity: "INFO",
    type: "COMPLETE",
    message: `Conference rivalries processed: ${scheduled.size} games scheduled`
  });
}

/*********************************
 * CONFERENCE GAMES
 *********************************/

function applyConferenceGames(grid, teams, params) {
  const byConf = {};

  teams.forEach(t => {
    if (!byConf[t.conference]) byConf[t.conference] = [];
    byConf[t.conference].push(t.id);
  });

  Object.entries(byConf).forEach(([conf, idsRaw]) => {
    const ids = shuffle(idsRaw);

    // Track conference games per team
    const confCount = {};
    ids.forEach(id => confCount[id] = 0);

    // Count pre-seeded CONF games
    ids.forEach(id => {
      Object.values(grid[id]).forEach(g => {
        if (g?.type === "CONF") confCount[id]++;
      });
    });

    let totalPlaced = 0;

    // WEEK-BY-WEEK LOOP
    for (let week = WEEK_WINDOWS.CONF.start; week <= WEEK_WINDOWS.CONF.end; week++) {
      let progress = true;
      let safety = 0;

      while (progress) {
        progress = false;
        safety++;

        if (safety > 500) {
          logSchedulerEvent({
            phase: "CONF",
            severity: "ERROR",
            type: "WEEK_STALL",
            conference: conf,
            week,
            message: "Conference scheduling stalled in week"
          });
          break;
        }

        // Teams that:
        // - still need CONF games
        // - are free this week
        const openTeams = ids.filter(id =>
          confCount[id] < params.conferenceGames &&
          !grid[id][week]
        );

        if (openTeams.length < 2) break;

        // MRV: most constrained team THIS WEEK
        const a = openTeams
          .map(id => ({
            id,
            options: openTeams.filter(b =>
              b !== id &&
              !hasPlayed(grid, id, b) &&
              !grid[b][week]
            ).length
          }))
          .sort((x, y) => x.options - y.options)[0]?.id;

        if (!a) break;

        const opponents = shuffle(
          openTeams.filter(b =>
            b !== a &&
            !hasPlayed(grid, a, b) &&
            !grid[b][week]
          )
        );

        let placed = false;

        for (const b of opponents) {
          commitGame(grid, a, b, week, "CONF");
          confCount[a]++;
          confCount[b]++;
          totalPlaced++;
          placed = true;
          progress = true;
          break;
        }

        // Fail-soft: skip this team, continue others
        if (!placed) continue;
      }
    }

    // Conference audit
    const unmet = ids.filter(id => confCount[id] < params.conferenceGames);

    if (unmet.length) {
      unmet.forEach(id => {
        logSchedulerEvent({
          phase: "CONF",
          severity: "WARN",
          type: "INCOMPLETE",
          team: id,
          conference: conf,
          message: `Scheduled ${confCount[id]} / ${params.conferenceGames} conference games`
        });
      });
    } else {
      logSchedulerEvent({
        phase: "CONF",
        severity: "INFO",
        type: "COMPLETE",
        conference: conf,
        message: `All conference games scheduled (${totalPlaced} total)`
      });
    }
  });
}

/*********************************
 * NON-CONFERENCE GAMES
 *********************************/

function fillNonConferenceGames(grid, teams, params) {
  const teamsByConf = {};

  teams.forEach(t => {
    if (!teamsByConf[t.conference]) teamsByConf[t.conference] = [];
    teamsByConf[t.conference].push(t.id);
  });

  // Track NC counts per team
  const ncCount = {};
  teams.forEach(t => {
    ncCount[t.id] = 0;
    Object.values(grid[t.id]).forEach(g => {
      if (g?.type === "NC") ncCount[t.id]++;
    });
  });

  let safety = 0;

  while (true) {
    safety++;
    if (safety > 2000) {
      logSchedulerEvent({
        phase: "NC_FILL",
        severity: "ERROR",
        type: "STALL",
        message: "Non-conference scheduling stalled after 2000 iterations"
      });
      break;
    }

    // Teams still needing NC games
    const openTeams = teams
      .map(t => t.id)
      .filter(id => ncCount[id] < params.nonConferenceGames);

    if (openTeams.length === 0) break;

    // Pick most constrained team first (MRV)
    const a = openTeams
      .map(id => ({
        id,
        options: openTeams.filter(b =>
          b !== id &&
          TEAMS_BY_ID[b].conference !== TEAMS_BY_ID[id].conference &&
          !hasPlayed(grid, id, b)
        ).length
      }))
      .sort((x, y) => x.options - y.options)[0].id;

    const confA = TEAMS_BY_ID[a].conference;

    const opponents = shuffle(
      openTeams.filter(b =>
        b !== a &&
        TEAMS_BY_ID[b].conference !== confA &&
        !hasPlayed(grid, a, b)
      )
    );

    if (opponents.length === 0) {
      logSchedulerEvent({
        phase: "NC_FILL",
        severity: "ERROR",
        type: "NO_ELIGIBLE_OPPONENTS",
        team: a,
        message: "No remaining cross-conference opponents needing NC games"
      });
      break;
    }

    let placed = false;
    let attempted = 0;

    for (const b of opponents) {
      attempted++;

      const week = findOpenWeek(grid, a, b, WEEK_WINDOWS.NC);
      if (!week) continue;

      commitGame(grid, a, b, week, "NC", true);
      ncCount[a]++;
      ncCount[b]++;
      placed = true;
      break;
    }

    if (!placed) {
      logSchedulerEvent({
        phase: "NC_FILL",
        severity: "ERROR",
        type: "NO_OPEN_WEEK",
        team: a,
        message: `Tried ${attempted} opponents but no mutual open week in weeks 1–4`
      });
      break;
    }
  }

  logSchedulerEvent({
    phase: "NC_FILL",
    severity: "INFO",
    type: "COMPLETE",
    message: "Non-conference games scheduled with constrained-first pairing"
  });
}
