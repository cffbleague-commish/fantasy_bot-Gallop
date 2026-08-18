/*********************************
 * GRID MANAGEMENT
 *********************************/

function initScheduleGrid(teams, params) {
  const grid = {};
  teams.forEach(t => {
    grid[t.id] = {};
    for (let w = 1; w <= params.weeks; w++) {
      grid[t.id][w] = null;
    }
  });
  return grid;
}

/**
 * Clear the non-conference window (weeks 1-4) for every team.
 * Phase 2 regenerates NC games from scratch each run, so any NC games loaded
 * from a previous run must be wiped first — otherwise stale auto-filled games
 * occupy slots and block Priority-1 confirmed manual games. Conference games
 * (weeks 5-12) are untouched.
 */
function clearNonConferenceWindow(grid, teams) {
  teams.forEach(t => {
    for (let w = WEEK_WINDOWS.NC.start; w <= WEEK_WINDOWS.NC.end; w++) {
      grid[t.id][w] = null;
    }
  });
}

/*********************************
 * CORE HELPERS
 *********************************/

function commitGame(grid, a, b, week, type, forced = false) {
  if (!a || !b) throw new Error("Undefined opponent");

  const w = WEEK_WINDOWS[type];
  if (week < w.start || week > w.end) {
    throw new Error(`Illegal ${type} game in week ${week}`);
  }

  if (grid[a][week] || grid[b][week]) return false;

  grid[a][week] = { opponent: b, type, forced };
  grid[b][week] = { opponent: a, type, forced };
  return true;
}

function hasPlayed(grid, a, b) {
  return Object.values(grid[a]).some(g => g?.opponent === b);
}

function countGames(grid, id) {
  return Object.values(grid[id]).filter(Boolean).length;
}

function countType(grid, id, type) {
  return Object.values(grid[id])
    .filter(g => g && g.type === type)
    .length;
}

function findOpenWeek(grid, a, b, window) {
  // Handle array of weeks (for rivalry scheduling)
  if (Array.isArray(window)) {
    for (const w of window) {
      if (!grid[a][w] && !grid[b][w]) return w;
    }
    return null;
  }

  // Handle window object
  for (let w = window.start; w <= window.end; w++) {
    if (!grid[a][w] && !grid[b][w]) return w;
  }
  return null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
