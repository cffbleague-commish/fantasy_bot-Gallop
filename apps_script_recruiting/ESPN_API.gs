/**
 * RECRUITING ANALYTICS - ESPN API CLIENT
 * Fetches draft prospect data from ESPN's public API.
 * Provides grades, rankings, and scouting data for incoming draft classes.
 *
 * ESPN API Structure:
 *   - Paginated athlete list: /seasons/{year}/draft/athletes?limit=500
 *   - Individual athlete: /seasons/{year}/draft/athletes/{id}
 *   - Attributes: grade (0-100), overall rank, position rank
 *   - Pick info: parsed from $ref URL (available post-draft)
 *   - College: resolved via batch fetch of college $ref endpoints
 */

var ESPN_FANTASY_POSITIONS = ["QB", "RB", "WR", "TE"];
var ESPN_CORE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

// ============================================================================
// MAIN FETCH FUNCTIONS
// ============================================================================

/**
 * Fetch all fantasy-relevant draft prospects from ESPN for a given year.
 * Returns prospects sorted by overall rank.
 *
 * @param {Number|String} year - Draft year (e.g., 2025, 2026)
 * @returns {Array} - Array of prospect objects
 */
function fetchESPNProspects(year) {
  const yearStr = String(year);
  Logger.log(`\nFetching ESPN prospects for ${yearStr}...`);

  // Step 1: Get all athlete IDs from paginated list
  const athleteIds = getESPNAthleteIds(yearStr);
  Logger.log(`  Total prospect IDs: ${athleteIds.length}`);

  if (athleteIds.length === 0) {
    Logger.log("  No prospects found for this year.");
    return [];
  }

  // Step 2: Batch fetch athlete details, filtering to fantasy positions
  const prospects = batchFetchESPNAthletes(yearStr, athleteIds);

  // Step 3: Resolve college names for prospects
  resolveCollegeNames(prospects);

  // Sort by overall rank
  prospects.sort((a, b) => (a.overallRank || 999) - (b.overallRank || 999));

  // Summary
  const posCounts = {};
  ESPN_FANTASY_POSITIONS.forEach(pos => {
    posCounts[pos] = prospects.filter(p => p.position === pos).length;
  });
  Logger.log(`  Fantasy prospects: ${prospects.length} (QB=${posCounts.QB}, RB=${posCounts.RB}, WR=${posCounts.WR}, TE=${posCounts.TE})`);

  return prospects;
}

// ============================================================================
// PAGINATION & BATCH FETCHING
// ============================================================================

/**
 * Get all athlete IDs from ESPN's paginated draft athlete list.
 */
function getESPNAthleteIds(year) {
  const ids = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${ESPN_CORE_URL}/seasons/${year}/draft/athletes?limit=500&page=${page}`;

    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log(`  ESPN API error on page ${page}: ${response.getResponseCode()}`);
        break;
      }

      const data = JSON.parse(response.getContentText());
      totalPages = data.pageCount || 1;

      if (data.items) {
        data.items.forEach(item => {
          const ref = item["$ref"] || "";
          const match = String(ref).match(/athletes\/(\d+)/);
          if (match) ids.push(match[1]);
        });
      }

      page++;
      if (page <= totalPages) Utilities.sleep(100);
    } catch (e) {
      Logger.log(`  Error fetching athlete IDs page ${page}: ${e.message}`);
      break;
    }
  }

  return ids;
}

/**
 * Batch fetch athlete details using fetchAll for performance.
 * Filters to fantasy-relevant positions only.
 */
function batchFetchESPNAthletes(year, athleteIds) {
  const prospects = [];
  const batchSize = 75;
  const totalBatches = Math.ceil(athleteIds.length / batchSize);

  for (let i = 0; i < athleteIds.length; i += batchSize) {
    const batch = athleteIds.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const requests = batch.map(id => ({
      url: `${ESPN_CORE_URL}/seasons/${year}/draft/athletes/${id}?lang=en&region=us`,
      muteHttpExceptions: true
    }));

    try {
      const responses = UrlFetchApp.fetchAll(requests);

      responses.forEach((resp, idx) => {
        if (resp.getResponseCode() !== 200) return;

        try {
          const data = JSON.parse(resp.getContentText());
          const prospect = parseESPNAthlete(data, batch[idx]);
          if (prospect && ESPN_FANTASY_POSITIONS.includes(prospect.position)) {
            prospects.push(prospect);
          }
        } catch (e) {
          // Skip unparseable athletes
        }
      });
    } catch (e) {
      Logger.log(`  Batch ${batchNum} error: ${e.message}`);
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < athleteIds.length) {
      Utilities.sleep(100);
    }

    // Progress log every 3 batches
    if (batchNum % 3 === 0 || batchNum === totalBatches) {
      Logger.log(`  Fetched ${Math.min(i + batchSize, athleteIds.length)}/${athleteIds.length} athletes (${prospects.length} fantasy)...`);
    }
  }

  return prospects;
}

// ============================================================================
// ATHLETE PARSING
// ============================================================================

/**
 * Parse an ESPN draft athlete JSON into a clean prospect object.
 *
 * ESPN attribute structure:
 *   { name: "grade", value: 94.0, displayValue: "94" }
 *   { name: "overall", value: 1.0, abbreviation: "OVR RK" }
 *   { name: "rank", value: 1.0, abbreviation: "POS RK" }
 */
function parseESPNAthlete(data, espnId) {
  try {
    // Position (abbreviation like QB, RB, WR, TE, EDGE, etc.)
    let position = "";
    if (data.position) {
      position = data.position.abbreviation || "";
    }
    if (!position && data.positions && Array.isArray(data.positions) && data.positions.length > 0) {
      position = data.positions[0].abbreviation || "";
    }

    // Skip non-fantasy positions early
    if (!ESPN_FANTASY_POSITIONS.includes(position)) return null;

    // Attributes: grade, overall rank, position rank
    let grade = null;
    let overallRank = null;
    let positionRank = null;

    if (data.attributes && Array.isArray(data.attributes)) {
      data.attributes.forEach(attr => {
        const name = String(attr.name || "").toLowerCase();
        const val = Number(attr.value);
        if (isNaN(val)) return;

        if (name === "grade") grade = val;
        if (name === "overall") overallRank = val;
        if (name === "rank") positionRank = val;
      });
    }

    // Draft pick info - parse from $ref URL to avoid extra API calls
    // URL format: .../draft/rounds/{round}/picks/{pick}
    let draftRound = "";
    let draftPick = "";
    if (data.pick) {
      const pickRef = data.pick["$ref"] || "";
      const pickMatch = String(pickRef).match(/rounds\/(\d+)\/picks\/(\d+)/);
      if (pickMatch) {
        draftRound = pickMatch[1];
        draftPick = pickMatch[2];
      }
    }

    // College - extract $ref for later batch resolution
    let collegeRef = "";
    let collegeName = "";
    if (data.college) {
      collegeRef = data.college["$ref"] || "";
      // Sometimes inline name is available
      collegeName = data.college.name || data.college.shortName || "";
    }

    // Profile link - extract from links array if available
    let profileUrl = "";
    if (data.links && Array.isArray(data.links)) {
      const playerCard = data.links.find(l => {
        const rels = l.rel || [];
        return rels.includes("playercard") || rels.includes("overview");
      });
      if (playerCard) {
        profileUrl = playerCard.href || "";
      } else if (data.links.length > 0) {
        profileUrl = data.links[0].href || "";
      }
    }

    // Headshot URL - use NFL path for drafted players, college path for pre-draft
    const headshotPath = (draftRound && draftRound !== "0")
      ? `/i/headshots/nfl/players/full/${espnId}.png`
      : `/i/headshots/college-football/players/full/${espnId}.png`;
    const headshotUrl = `https://a.espncdn.com/combiner/i?img=${headshotPath}&w=350&h=254`;

    return {
      espnId: String(espnId),
      name: data.displayName || data.fullName || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      position: position,
      collegeRef: collegeRef,
      collegeName: collegeName,
      height: data.height || "",
      weight: data.weight || "",
      grade: grade,
      overallRank: overallRank,
      positionRank: positionRank,
      headshotUrl: headshotUrl,
      profileUrl: profileUrl,
      draftRound: draftRound,
      draftPick: draftPick
    };
  } catch (e) {
    return null;
  }
}

// ============================================================================
// COLLEGE NAME RESOLUTION
// ============================================================================

/**
 * Resolve college names for prospects by batch-fetching unique college $ref URLs.
 * Modifies prospects in-place.
 */
function resolveCollegeNames(prospects) {
  // Collect unique college refs
  const refToProspects = {};
  prospects.forEach(p => {
    if (p.collegeName || !p.collegeRef) return; // Already have name or no ref
    if (!refToProspects[p.collegeRef]) refToProspects[p.collegeRef] = [];
    refToProspects[p.collegeRef].push(p);
  });

  const uniqueRefs = Object.keys(refToProspects);
  if (uniqueRefs.length === 0) return;

  Logger.log(`  Resolving ${uniqueRefs.length} unique college names...`);

  const batchSize = 75;
  for (let i = 0; i < uniqueRefs.length; i += batchSize) {
    const batch = uniqueRefs.slice(i, i + batchSize);
    const requests = batch.map(ref => ({
      url: ref.replace("http://", "https://"),
      muteHttpExceptions: true
    }));

    try {
      const responses = UrlFetchApp.fetchAll(requests);
      responses.forEach((resp, idx) => {
        if (resp.getResponseCode() !== 200) return;
        try {
          const data = JSON.parse(resp.getContentText());
          const name = data.name || data.shortName || data.displayName || "";
          if (name) {
            refToProspects[batch[idx]].forEach(p => {
              p.collegeName = name;
            });
          }
        } catch (e) { /* skip */ }
      });
    } catch (e) {
      Logger.log(`  College batch error: ${e.message}`);
    }

    if (i + batchSize < uniqueRefs.length) Utilities.sleep(100);
  }
}

// ============================================================================
// IMPORT TO SHEET
// ============================================================================

/**
 * Import ESPN prospects for the current league year.
 */
function importESPNProspects() {
  const year = getLeagueYear();
  importESPNProspectsForYear(year, false);
}

/**
 * Import ESPN prospects for a specific year.
 * Replaces any existing data for that year (allows re-imports).
 *
 * @param {String|Number} year - Draft year to import
 * @param {Boolean} clearAll - If true, clear entire sheet first (used for first year of multi-year)
 */
function importESPNProspectsForYear(year, clearAll) {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const yearStr = String(year);

  Logger.log(`=== IMPORTING ESPN PROSPECTS (${yearStr}) ===\n`);

  const prospects = fetchESPNProspects(yearStr);

  if (prospects.length === 0) {
    Logger.log("No fantasy-relevant prospects found for this year.");
    return;
  }

  // Get or create sheet
  let sheet = ss.getSheetByName(config.sheets.espnProspects);
  const isNewSheet = !sheet;
  if (isNewSheet) {
    sheet = ss.insertSheet(config.sheets.espnProspects);
    clearAll = true;
  }

  const headers = [
    "DraftYear", "ESPN_ID", "PlayerName", "Position", "College",
    "Grade", "OverallRank", "PositionRank",
    "HeadshotURL", "ProfileURL",
    "DraftRound", "DraftPick",
    "Height", "Weight"
  ];

  if (clearAll) {
    sheet.clearContents();
    sheet.clearFormats();
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Remove existing rows for this year to allow clean re-import
    const existingData = sheet.getDataRange().getValues();
    for (let i = existingData.length - 1; i >= 1; i--) {
      if (String(existingData[i][0]) === yearStr) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  // Build rows
  const rows = prospects.map(p => [
    Number(year),
    p.espnId,
    p.name,
    p.position,
    p.collegeName || "",
    p.grade,
    p.overallRank,
    p.positionRank,
    p.headshotUrl,
    p.profileUrl,
    p.draftRound || "",
    p.draftPick || "",
    p.height ? `${Math.floor(p.height / 12)}'${p.height % 12}"` : "",
    p.weight ? `${p.weight} lbs` : ""
  ]);

  // Write data
  if (rows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  }

  // Format columns (only on new/cleared sheet)
  if (clearAll || isNewSheet) {
    sheet.setColumnWidth(1, 75);    // DraftYear
    sheet.setColumnWidth(2, 75);    // ESPN_ID
    sheet.setColumnWidth(3, 180);   // PlayerName
    sheet.setColumnWidth(4, 50);    // Position
    sheet.setColumnWidth(5, 130);   // College
    sheet.setColumnWidth(6, 55);    // Grade
    sheet.setColumnWidth(7, 90);    // OverallRank
    sheet.setColumnWidth(8, 90);    // PositionRank
    sheet.setColumnWidth(9, 80);    // HeadshotURL (truncated in display)
    sheet.setColumnWidth(10, 80);   // ProfileURL
    sheet.setColumnWidth(11, 75);   // DraftRound
    sheet.setColumnWidth(12, 65);   // DraftPick
    sheet.setColumnWidth(13, 60);   // Height
    sheet.setColumnWidth(14, 70);   // Weight
  }

  Logger.log(`\n  Wrote ${rows.length} prospects for ${yearStr} to ${config.sheets.espnProspects}`);
  Logger.log("=== ESPN IMPORT COMPLETE ===");
}

/**
 * Prompt user to select which year to import ESPN prospects for.
 * Each year runs individually to stay within Apps Script execution limits.
 */
function promptImportESPNYear() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();

  const response = ui.prompt(
    "Import ESPN Prospects",
    `Enter the draft year to import (e.g., 2022, 2023, 2024, 2025, 2026).\n\nCurrent league year: ${currentYear}\n\nEach year imports separately to avoid timeout.\nExisting data for that year will be replaced.`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const yearInput = response.getResponseText().trim();
  if (!/^\d{4}$/.test(yearInput)) {
    ui.alert("Invalid year. Please enter a 4-digit year (e.g., 2025).");
    return;
  }

  importESPNProspectsForYear(yearInput, false);
  ui.alert(`ESPN prospects for ${yearInput} imported successfully. Check the ESPNProspects tab.`);
}

// ============================================================================
// NAME MATCHING UTILITY
// ============================================================================

/**
 * Normalize a player name for cross-source matching.
 * Handles MFL format "Last, First" and ESPN format "First Last".
 *
 * @param {String} name - Player name in any format
 * @returns {String} - Normalized lowercase "first last" format
 */
// Common nickname → canonical first name mappings.
// Used by normalizeNameForMatch() to resolve name variants across data sources.
var NICKNAME_MAP = {
  "ken": "kenneth",
  "kenny": "kenneth",
  "mike": "michael",
  "mikey": "michael",
  "matt": "matthew",
  "matty": "matthew",
  "rob": "robert",
  "robby": "robert",
  "robbie": "robert",
  "bob": "robert",
  "bobby": "robert",
  "chris": "christopher",
  "dan": "daniel",
  "danny": "daniel",
  "dave": "david",
  "davey": "david",
  "dj": "daniel",       // DJ Moore etc. — first initial combos
  "tj": "thomas",       // TJ Hockenson etc.
  "rj": "robert",
  "aj": "albert",       // AJ Brown etc.
  "cj": "christopher",
  "jj": "james",
  "kj": "kenneth",
  "pj": "patrick",
  "bj": "brian",
  "pat": "patrick",
  "nick": "nicholas",
  "nic": "nicholas",
  "nicky": "nicholas",
  "joe": "joseph",
  "joey": "joseph",
  "josh": "joshua",
  "tom": "thomas",
  "tommy": "thomas",
  "tony": "anthony",
  "will": "william",
  "willy": "william",
  "bill": "william",
  "billy": "william",
  "ben": "benjamin",
  "benny": "benjamin",
  "drew": "andrew",
  "andy": "andrew",
  "alex": "alexander",
  "zach": "zachary",
  "zack": "zachary",
  "jake": "jacob",
  "jim": "james",
  "jimmy": "james",
  "jeff": "jeffrey",
  "greg": "gregory",
  "greg": "gregory",
  "steve": "steven",
  "gabe": "gabriel",
  "abe": "abraham",
  "ed": "edward",
  "ted": "theodore",
  "rick": "richard",
  "dick": "richard",
  "rich": "richard",
  "sam": "samuel",
  "sammy": "samuel",
  "ray": "raymond",
  "charlie": "charles",
  "chuck": "charles",
  "jon": "jonathan",
  "nate": "nathaniel",
  "terry": "terrence",
  "marv": "marvin"
};

function normalizeNameForMatch(name) {
  if (!name) return "";
  let normalized = String(name).trim().toLowerCase();

  // Handle "Last, First" format (MFL)
  if (normalized.includes(",")) {
    const parts = normalized.split(",").map(s => s.trim());
    if (parts.length >= 2) {
      normalized = parts[1] + " " + parts[0];
    }
  }

  // Remove common suffixes
  normalized = normalized.replace(/\s+(jr\.?|sr\.?|iii|ii|iv|v)$/i, "");

  // Remove periods, hyphens in first names, and normalize whitespace
  normalized = normalized.replace(/\./g, "").replace(/\s+/g, " ").trim();

  // Expand nickname to canonical first name for consistent matching
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx > 0) {
    const firstName = normalized.substring(0, spaceIdx);
    const rest = normalized.substring(spaceIdx);
    const canonical = NICKNAME_MAP[firstName];
    if (canonical) {
      normalized = canonical + rest;
    }
  }

  return normalized;
}

/**
 * Build a lookup map from ESPN prospect data for name-based matching.
 * Reads from the ESPNProspects sheet.
 *
 * @returns {Object} - Map of normalized name -> { grade, overallRank, positionRank, position, draftYear }
 */
function buildESPNLookupByName() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.espnProspects);

  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  const lookup = {};
  data.slice(1).forEach(row => {
    const draftYear = String(row[0]);
    const name = String(row[2]);
    const position = String(row[3]);
    const grade = row[5] !== "" && row[5] !== null ? Number(row[5]) : null;
    const overallRank = row[6] !== "" && row[6] !== null ? Number(row[6]) : null;
    const positionRank = row[7] !== "" && row[7] !== null ? Number(row[7]) : null;

    const normalizedName = normalizeNameForMatch(name);
    if (!normalizedName) return;

    // Key by name + year for uniqueness
    const key = `${normalizedName}|${draftYear}`;
    lookup[key] = { grade, overallRank, positionRank, position, draftYear, name };

    // Also store by name only (for cases where year matching is flexible)
    if (!lookup[normalizedName]) {
      lookup[normalizedName] = { grade, overallRank, positionRank, position, draftYear, name };
    }
  });

  return lookup;
}
