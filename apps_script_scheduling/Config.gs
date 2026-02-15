/***********************
 * CONFIGURATION
 ***********************/

/**
 * IMPORTRANGE SETUP INSTRUCTIONS
 * ==============================
 *
 * 1. In your Scheduling Google Sheet, create a tab called "Teams"
 *
 * 2. In cell A1 of the Teams tab, paste this formula:
 *    =IMPORTRANGE("YOUR_RANKINGS_SHEET_ID", "FranchiseLookup!A:Z")
 *
 * 3. Replace YOUR_RANKINGS_SHEET_ID with the actual ID from your Rankings sheet URL:
 *    https://docs.google.com/spreadsheets/d/[THIS_IS_THE_ID]/edit
 *
 * 4. Click "Allow access" when prompted
 *
 * The Teams tab will now auto-sync with FranchiseLookup from your Rankings sheet.
 * Expected columns: Franchise ID | Team Name | Conference | Abbreviation | ...
 */

/***********************
 * GLOBAL STATE
 ***********************/
let TEAMS_BY_ID = {};

/*********************************
 * CONSTANTS - SHEET NAMES
 *********************************/
const SCHEDULE_SHEET = "Schedule";
const LOG_SHEET = "Scheduler Log";
const VALIDATION_SHEET = "Validation Matrix";
const TEAMS_SHEET = "Teams";  // IMPORTRANGE from FranchiseLookup
const RIVALRIES_SHEET = "Rivalries";
const MANUAL_GAMES_SHEET = "ManualGames";
const MANUAL_SUBMISSIONS_SHEET = "Manual Submissions";

/*********************************
 * WEEK WINDOWS
 * NC = Non-Conference (Weeks 1-4)
 * CONF = Conference (Weeks 5-12)
 *********************************/
const WEEK_WINDOWS = {
  NC: { start: 1, end: 4 },
  CONF: { start: 5, end: 12 }
};

/*********************************
 * LEAGUE PARAMETERS
 *********************************/
function getLeagueParams() {
  return {
    // Team counts
    teams: 100,

    // Schedule structure
    weeks: 12,
    gamesPerTeam: 12,
    conferenceGames: 8,
    nonConferenceGames: 4,

    // Conference structure
    // 5 major conferences with 16 teams each
    // 1 AAC conference with 20 teams
    conferences: {
      AAC: 20,
      ACC: 16,
      B10: 16,
      B12: 16,
      P12: 16,
      SEC: 16
    },

    // Rivalry settings
    maxRivalsPerTeam: 2,
    maxWager: 5,
    conferenceRivalryWeek: 12,     // Week 12 is primary "Rivalry Week" for conference rivals
    secondaryRivalryWeek: 5,       // Week 5 for teams with 2 conference rivals

    // Scheduling phases
    // Phase 1: Conference schedule (run early, before NC submission period)
    // Phase 2: NC schedule (run after NC submission deadline)
    phases: {
      CONFERENCE: 1,
      NON_CONFERENCE: 2
    }
  };
}

/*********************************
 * VALIDATION HELPERS
 *********************************/

/**
 * Validate that loaded teams match expected conference structure
 * @param {Array} teams - Array of team objects
 * @param {Object} params - League parameters
 * @returns {Object} - { valid: boolean, errors: [], warnings: [] }
 */
function validateTeamStructure(teams, params) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Count teams by conference
  const confCounts = {};
  teams.forEach(t => {
    confCounts[t.conference] = (confCounts[t.conference] || 0) + 1;
  });

  // Check total team count
  if (teams.length !== params.teams) {
    result.errors.push(`Expected ${params.teams} teams, found ${teams.length}`);
    result.valid = false;
  }

  // Check each conference
  Object.entries(params.conferences).forEach(([conf, expectedCount]) => {
    const actualCount = confCounts[conf] || 0;

    if (actualCount !== expectedCount) {
      result.errors.push(`${conf}: Expected ${expectedCount} teams, found ${actualCount}`);
      result.valid = false;
    }

    // Check if conference can support required games
    // Need at least (conferenceGames + 1) teams to play conferenceGames unique opponents
    if (actualCount < params.conferenceGames + 1) {
      result.errors.push(`${conf}: Only ${actualCount} teams, cannot schedule ${params.conferenceGames} unique conference games`);
      result.valid = false;
    }
  });

  // Check for unknown conferences
  Object.keys(confCounts).forEach(conf => {
    if (!params.conferences[conf]) {
      result.warnings.push(`Unknown conference found: ${conf} (${confCounts[conf]} teams)`);
    }
  });

  return result;
}

/**
 * Validate rivalries don't exceed limits
 * @param {Array} rivalries - Array of confirmed rivalries
 * @param {Object} params - League parameters
 * @returns {Object} - { valid: boolean, errors: [], teamCounts: {} }
 */
function validateRivalryCounts(rivalries, params) {
  const result = {
    valid: true,
    errors: [],
    teamCounts: {}
  };

  // Count rivalries per team
  rivalries.forEach(r => {
    result.teamCounts[r.teamA] = (result.teamCounts[r.teamA] || 0) + 1;
    result.teamCounts[r.teamB] = (result.teamCounts[r.teamB] || 0) + 1;
  });

  // Check for over-limit
  Object.entries(result.teamCounts).forEach(([team, count]) => {
    if (count > params.maxRivalsPerTeam) {
      result.errors.push(`Team ${team} has ${count} rivalries (max: ${params.maxRivalsPerTeam})`);
      result.valid = false;
    }
  });

  return result;
}

/*********************************
 * HELPER: Get or Create Sheet
 *********************************/
function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }

  return sheet;
}
