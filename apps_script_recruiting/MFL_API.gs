/**
 * RECRUITING ANALYTICS - MFL API CLIENT
 * Lightweight MFL API functions for player data enrichment.
 * Only includes what's needed for recruiting analysis (no roster/schedule functions).
 */

/**
 * Generic MFL API fetch
 */
function mflFetch(year, type, additionalParams = {}) {
  const config = getConfig();

  if (!config.mfl.apiKey || config.mfl.apiKey === "YOUR_API_KEY_HERE") {
    throw new Error("MFL_API_KEY not set. Run initializeScriptProperties() and update the value.");
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

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (response.getResponseCode() !== 200) {
      throw new Error(`MFL API Error (${response.getResponseCode()}): ${response.getContentText()}`);
    }

    return JSON.parse(response.getContentText());
  } catch (e) {
    if (e.message.includes("Address unavailable") || e.message.includes("DNS") || e.message.includes("timed out")) {
      throw new Error(`MFL API network error for ${type}: ${e.message}. Try again shortly.`);
    }
    throw e;
  }
}

/**
 * Fetch all players for a given year with details (includes draft_year, draft_pick, etc.)
 * @param {String|Number} year - Season year
 * @returns {Array} - Array of player objects from MFL
 */
function fetchPlayers(year) {
  const data = mflFetch(year, "players", { DETAILS: "1" });

  if (!data.players || !data.players.player) {
    return [];
  }

  return Array.isArray(data.players.player)
    ? data.players.player
    : [data.players.player];
}

/**
 * Build a player lookup map: playerId -> { name, position, team, draftYear, draftPick, draftRound, draftTeam }
 * This is the main function used by the analysis to enrich auction data.
 *
 * @param {String|Number} year - Season year to query (use current year for most complete data)
 * @returns {Object} - Map of playerId -> player info
 */
function buildPlayerLookup(year) {
  Logger.log(`Building player lookup from MFL (${year})...`);
  const players = fetchPlayers(year);

  const lookup = {};

  players.forEach(p => {
    // Only include fantasy-relevant positions
    if (!["QB", "RB", "WR", "TE"].includes(p.position)) return;

    lookup[String(p.id)] = {
      name: p.name || "",
      position: p.position || "",
      team: p.team || "",
      draftYear: p.draft_year || "",
      draftPick: p.draft_pick || "",    // Overall pick number (e.g., "1.01" or "32")
      draftRound: p.draft_round || "",  // Round number
      draftTeam: p.draft_team || ""     // NFL team that drafted them
    };
  });

  Logger.log(`  Player lookup built: ${Object.keys(lookup).length} players`);
  return lookup;
}

/**
 * Fetch only rookies for a given draft year
 * @param {String|Number} draftYear - The NFL draft year
 * @returns {Array} - Array of rookie player objects
 */
function fetchRookiesByDraftYear(draftYear) {
  const currentYear = getLeagueYear();
  const players = fetchPlayers(currentYear);

  return players.filter(p => {
    if (!["QB", "RB", "WR", "TE"].includes(p.position)) return false;
    return p.draft_year === String(draftYear);
  });
}
