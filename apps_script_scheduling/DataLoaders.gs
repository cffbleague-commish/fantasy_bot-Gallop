/*********************************
 * DATA LOADERS
 *
 * Teams data comes from IMPORTRANGE synced from FranchiseLookup
 * Expected columns: Franchise ID | Team Name | Conference | ...
 *********************************/

/**
 * Load all teams from the Teams sheet (IMPORTRANGE from FranchiseLookup)
 * @returns {Array} Array of team objects with id, name, conference
 */
function loadTeams() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TEAMS_SHEET);

  if (!sheet) {
    throw new Error(`${TEAMS_SHEET} sheet not found. Create it with IMPORTRANGE from FranchiseLookup.`);
  }

  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    throw new Error(`${TEAMS_SHEET} sheet is empty. Check your IMPORTRANGE formula.`);
  }

  const headers = data[0];

  // Find column indices (flexible to handle different column orders)
  const idCol = findColumn(headers, ["Franchise ID", "FranchiseID", "ID"]);
  const confCol = findColumn(headers, ["Conference", "Conf"]);
  const nameCol = findColumn(headers, ["Team Name", "TeamName", "Name"]);

  if (idCol === -1) {
    throw new Error("Franchise ID column not found in Teams sheet");
  }
  if (confCol === -1) {
    throw new Error("Conference column not found in Teams sheet");
  }

  return data.slice(1)
    .filter(r => r[idCol])  // Skip empty rows
    .map(r => ({
      id: String(r[idCol]).padStart(3, "0"),
      name: nameCol !== -1 ? r[nameCol] : "",
      conference: r[confCol]
    }));
}

/**
 * Load CONFIRMED rivalries from the Rivalries sheet
 * Only returns rivalries with Status = "CONFIRMED"
 *
 * Expected columns: Team A | Team B | Rivalry Name | Wager | Status | Type | Submitted
 *
 * @returns {Array} Array of confirmed rivalry objects
 */
function loadConfirmedRivalries() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(RIVALRIES_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Required columns
  const teamACol = colMap["Team A"] ?? colMap["TeamA"] ?? 0;
  const teamBCol = colMap["Team B"] ?? colMap["TeamB"] ?? 1;
  const nameCol = colMap["Rivalry Name"] ?? colMap["Name"] ?? -1;
  const wagerCol = colMap["Wager"] ?? colMap["Wager Amount"] ?? -1;
  const statusCol = colMap["Status"] ?? -1;

  return data.slice(1)
    .filter(r => {
      // Must have both teams
      if (!r[teamACol] || !r[teamBCol]) return false;
      // Must be confirmed (if status column exists)
      if (statusCol !== -1 && r[statusCol] !== "CONFIRMED") return false;
      return true;
    })
    .map(r => ({
      teamA: String(r[teamACol]).padStart(3, "0"),
      teamB: String(r[teamBCol]).padStart(3, "0"),
      name: nameCol !== -1 ? r[nameCol] : "",
      wager: wagerCol !== -1 ? Number(r[wagerCol]) || 0 : 0
    }));
}

/**
 * Load ALL rivalries (including pending) for validation
 * @returns {Array} Array of all rivalry objects with status
 */
function loadAllRivalries() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(RIVALRIES_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const teamACol = colMap["Team A"] ?? colMap["TeamA"] ?? 0;
  const teamBCol = colMap["Team B"] ?? colMap["TeamB"] ?? 1;
  const nameCol = colMap["Rivalry Name"] ?? colMap["Name"] ?? -1;
  const wagerCol = colMap["Wager"] ?? colMap["Wager Amount"] ?? -1;
  const statusCol = colMap["Status"] ?? -1;

  return data.slice(1)
    .filter(r => r[teamACol] && r[teamBCol])
    .map(r => ({
      teamA: String(r[teamACol]).padStart(3, "0"),
      teamB: String(r[teamBCol]).padStart(3, "0"),
      name: nameCol !== -1 ? r[nameCol] : "",
      wager: wagerCol !== -1 ? Number(r[wagerCol]) || 0 : 0,
      status: statusCol !== -1 ? r[statusCol] : "UNKNOWN"
    }));
}

/**
 * Load CONFIRMED manual NC games from ManualGames sheet
 * @returns {Array} Array of confirmed manual game objects
 */
function loadConfirmedManualGames() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(MANUAL_GAMES_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  const weekCol = colMap["Week"] ?? 0;
  const teamACol = colMap["Team A"] ?? colMap["TeamA"] ?? 1;
  const teamBCol = colMap["Team B"] ?? colMap["TeamB"] ?? 2;

  // The Discord bot writes team NAMES (not franchise IDs) into ManualGames'
  // Team A / Team B columns, so build a normalized name -> ID map to resolve
  // them. Rows may also contain a raw franchise ID; resolveTeamRef handles both.
  const teams = loadTeams();
  const idByName = {};
  const validId = {};
  teams.forEach(t => {
    idByName[normalizeTeamName(t.name)] = t.id;
    validId[t.id] = true;
  });

  return data.slice(1)
    .filter(r => r[weekCol] && r[teamACol] && r[teamBCol])
    .map(r => ({
      week: Number(r[weekCol]),
      teamA: resolveTeamRef(r[teamACol], idByName, validId),
      teamB: resolveTeamRef(r[teamBCol], idByName, validId)
    }));
}

/**
 * Normalize a team name for lookup. Mirrors the Discord bot's _norm_team_name
 * (strip + lowercase) so names written by the bot match the Teams sheet.
 */
function normalizeTeamName(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * Resolve a ManualGames team reference (a team name OR a franchise ID) to its
 * 3-digit franchise ID. Returns the trimmed raw value unchanged if it can't be
 * resolved, so the caller's guard can log and skip it.
 * @param {*} raw - cell value from the Team A / Team B column
 * @param {Object} idByName - normalized team name -> franchise ID
 * @param {Object} validId - set of valid franchise IDs (id -> true)
 */
function resolveTeamRef(raw, idByName, validId) {
  const rawStr = String(raw).trim();

  // Already a valid franchise ID (e.g. "5" -> "005", or "005")?
  const padded = rawStr.padStart(3, "0");
  if (validId[padded]) return padded;

  // Otherwise resolve by team name.
  const byName = idByName[normalizeTeamName(rawStr)];
  if (byName) return byName;

  // Unresolved — return raw so applyManualGamesToGrid's guard logs/skips it.
  return rawStr;
}

/**
 * Get team name map (franchise ID -> team name)
 * @returns {Object} Map of franchiseId -> teamName
 */
function getTeamNameMap() {
  const teams = loadTeams();
  const map = {};
  teams.forEach(t => {
    map[t.id] = t.name || `Team ${t.id}`;
  });
  return map;
}

/**
 * Get franchise conference map (franchise ID -> conference)
 * @returns {Object} Map of franchiseId -> conference
 */
function getFranchiseConferenceMap() {
  const teams = loadTeams();
  const map = {};
  teams.forEach(t => {
    map[t.id] = t.conference;
  });
  return map;
}

/**
 * Get rivalry count for a specific team
 * Counts CONFIRMED rivalries only (deduplicated by pair)
 * @param {String} franchiseId - Team's franchise ID
 * @returns {Number} Number of confirmed rivalries
 */
function getTeamRivalryCount(franchiseId) {
  const normalizedId = String(franchiseId).padStart(3, "0");
  const rivalries = loadConfirmedRivalries();
  const seenPairs = new Set();

  return rivalries.filter(r => {
    if (r.teamA !== normalizedId && r.teamB !== normalizedId) {
      return false;
    }
    // Create unique key for this rivalry pair (sorted to handle A-B and B-A as same)
    const pairKey = [r.teamA, r.teamB].sort().join("-");
    if (seenPairs.has(pairKey)) {
      return false;
    }
    seenPairs.add(pairKey);
    return true;
  }).length;
}

/**
 * Check if a team can add another rivalry
 * @param {String} franchiseId - Team's franchise ID
 * @returns {Object} { canAdd: boolean, currentCount: number, maxAllowed: number }
 */
function canTeamAddRivalry(franchiseId) {
  const params = getLeagueParams();
  const count = getTeamRivalryCount(franchiseId);

  return {
    canAdd: count < params.maxRivalsPerTeam,
    currentCount: count,
    maxAllowed: params.maxRivalsPerTeam
  };
}

/**
 * Helper: Find column index by trying multiple possible header names
 * @param {Array} headers - Header row
 * @param {Array} possibleNames - Array of possible column names to try
 * @returns {Number} Column index or -1 if not found
 */
function findColumn(headers, possibleNames) {
  for (const name of possibleNames) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ============================================================================
// RIVALRY SUBMISSION HELPERS (for Discord bot integration)
// ============================================================================

/**
 * Get the Rivalries sheet with proper headers
 * Creates it if it doesn't exist
 */
function getRivalriesSheet() {
  const headers = [
    "Team A",           // Franchise ID of first team
    "Team A Name",      // Team name (for readability)
    "Team B",           // Franchise ID of second team
    "Team B Name",      // Team name (for readability)
    "Rivalry Name",     // Name of the rivalry (e.g., "The Iron Bowl")
    "Wager",            // Wager amount ($0-5)
    "Type",             // CONF or NC (same or different conference)
    "Status",           // PENDING or CONFIRMED
    "Submitted"         // Timestamp (overwritten with confirmation time on confirm)
  ];

  return getOrCreateSheet(RIVALRIES_SHEET, headers);
}

/**
 * Initialize the Rivalries sheet with proper headers
 * Run this once when setting up
 */
function initializeRivalriesSheet() {
  getRivalriesSheet();
  Logger.log("Rivalries sheet initialized");
}
