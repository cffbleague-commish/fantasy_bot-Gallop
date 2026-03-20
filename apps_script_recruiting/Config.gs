/**
 * RECRUITING ANALYTICS - CONFIGURATION
 * Standalone project for analyzing auction data and generating recruit star ratings.
 *
 * SETUP:
 * 1. Create a new Google Sheet for this project
 * 2. Open Extensions > Apps Script
 * 3. Copy all .gs files from this directory into the Apps Script editor
 * 4. Run initializeScriptProperties() to set up your API credentials
 * 5. Run importTransactionLog() to pull auction data from the League Sheet
 * 6. Run analyzeAuctionHistory() to generate the analysis
 */

// ============================================================================
// SCRIPT PROPERTIES
// ============================================================================

/**
 * Get the current league year from script properties.
 * @returns {string} The current league year (e.g., "2025")
 */
function getLeagueYear() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("LEAGUE_YEAR") || String(new Date().getFullYear());
}

/**
 * Set the current league year.
 * @param {string|number} year - The year to set
 */
function setLeagueYear(year) {
  const yearStr = String(year);
  PropertiesService.getScriptProperties().setProperty("LEAGUE_YEAR", yearStr);
  Logger.log(`League year set to ${yearStr}`);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    // MFL API Settings
    mfl: {
      leagueId: props.getProperty("MFL_LEAGUE_ID") || "12011",
      apiKey: props.getProperty("MFL_API_KEY"),
      currentYear: getLeagueYear()
    },

    // Source Sheet IDs (read-only access)
    sourceSheets: {
      // League Sheet - where TransactionLog lives
      leagueSheetId: props.getProperty("LEAGUE_SHEET_ID") || ""
    },

    // Local Sheet Names (tabs in this project's spreadsheet)
    sheets: {
      auctionData: "AuctionData",           // Raw auction transactions imported from League Sheet
      auctionAnalysis: "AuctionAnalysis",    // Processed analysis output
      recruitingBoard: "RecruitingBoard",    // Star ratings and cost predictions
      recruitingGrades: "RecruitingGrades",  // Team recruiting class grades
      espnProspects: "ESPNProspects"         // ESPN draft prospect data (grades, ranks, headshots)
    },

    // Source Sheet Tab Names (tabs in the League Sheet we read from)
    sourceSheetTabs: {
      transactionLog: "TransactionLog",
      franchiseLookup: "FranchiseLookup"
    },

    // Years to exclude from analysis (e.g., startup auction year with different economics)
    excludeYears: [2021],

    // Fantasy Positions
    positions: ["QB", "RB", "WR", "TE"],

    // Position groups (matching league config)
    positionGroups: {
      QB: ["QB"],
      RB: ["RB"],
      "WR/TE": ["WR", "TE"]
    },

    // Star Rating Thresholds (based on Draft Capital Score, NOT auction price)
    // Draft Capital Score uses exponential decay from overall pick position.
    // Stars are position-agnostic - they reflect draft investment/talent evaluation.
    // Expected auction cost is calculated separately by position + draft tier.
    starThresholds: {
      fiveStar: 80,    // ~Picks 1-12  (elite prospects)
      fourStar: 50,    // ~Picks 13-37 (first round / early second)
      threeStar: 25,   // ~Picks 38-73 (day 2 capital)
      twoStar: 10      // ~Picks 74-121 (developmental)
      // Below 10 = 1-Star (picks 122+ / UDFA)
    },

    // Draft Capital Score decay rate (controls curve steepness)
    // Higher value = steeper drop-off between picks
    draftCapitalDecayRate: 0.019
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Script Properties
 * Run this ONCE to set up your credentials and sheet references.
 */
function initializeScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  props.setProperties({
    "LEAGUE_YEAR": "2025",
    "MFL_LEAGUE_ID": "12011",
    "MFL_API_KEY": "YOUR_API_KEY_HERE",
    "LEAGUE_SHEET_ID": "YOUR_LEAGUE_SHEET_ID_HERE"
  });

  Logger.log("Script properties initialized. Update MFL_API_KEY and LEAGUE_SHEET_ID with real values.");
}

/**
 * Verify configuration is set up correctly
 */
function verifyConfig() {
  const config = getConfig();
  const issues = [];

  if (!config.mfl.apiKey || config.mfl.apiKey === "YOUR_API_KEY_HERE") {
    issues.push("MFL_API_KEY not configured");
  }
  if (!config.sourceSheets.leagueSheetId || config.sourceSheets.leagueSheetId === "YOUR_LEAGUE_SHEET_ID_HERE") {
    issues.push("LEAGUE_SHEET_ID not configured");
  }

  if (issues.length > 0) {
    Logger.log("Configuration issues found:");
    issues.forEach(issue => Logger.log(`  - ${issue}`));
    Logger.log("\nRun initializeScriptProperties() and update the values.");
    return false;
  }

  Logger.log("Configuration verified - all settings look good.");
  Logger.log(`  League Year: ${config.mfl.currentYear}`);
  Logger.log(`  MFL League ID: ${config.mfl.leagueId}`);
  Logger.log(`  League Sheet ID: ${config.sourceSheets.leagueSheetId}`);
  return true;
}
