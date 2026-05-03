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
      playerGrades: "PlayerGrades",           // Individual player auction grades
      franchiseLookup: "FranchiseLookup",     // Franchise identity (team name, logo, conference, etc.)
      espnProspects: "ESPNProspects",         // ESPN draft prospect data (grades, ranks, headshots)
      dlfRookieStartupADP: "DLF Rookie Startup ADP",  // DLF startup ADP data (market consensus values)
      liveAuction: "LiveAuction"                       // Live auction transactions from MFL API
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

    // Star Rating Thresholds (based on composite Recruit Score, NOT auction price)
    // Recruit Score blends ADP (50%), draft capital (25%), ESPN grade (15%), position (10%).
    // Stars are position-agnostic - they reflect overall prospect evaluation.
    // Expected auction cost is calculated separately by position + draft tier.
    starThresholds: {
      fiveStar: 75,    // ~Top 15-20 prospects (elite)
      fourStar: 50,    // ~Picks 13-37 (first round / early second)
      threeStar: 25,   // ~Picks 38-73 (day 2 capital)
      twoStar: 10      // ~Picks 74-121 (developmental)
      // Below 10 = 1-Star (picks 122+ / UDFA)
    },

    // Draft Capital Score decay rate (controls curve steepness)
    // Higher value = steeper drop-off between picks
    draftCapitalDecayRate: 0.019,
    // Position-specific decay rates: gentler for positions drafted later in NFL
    // QB: unchanged (QBs go early, raw pick is already fair)
    // RB/WR: slightly gentler (top RBs/WRs now go picks 8-15)
    // TE: noticeably gentler (top TE often goes picks 12-20)
    draftCapitalDecayRates: { QB: 0.019, RB: 0.016, WR: 0.016, TE: 0.012 },

    // Default draft pick for UDFAs (one pick past last NFL draft pick)
    // Gives UDFAs a floor draft capital score (~0.69) instead of 0
    defaultDraftPick: 263,

    // Default ESPN grade for players without an ESPN evaluation
    // 20 = well below scoutable range, signals "not evaluated / long shot"
    defaultESPNGrade: 20,

    // Startup ADP Configuration
    // DLF Rookie Startup ADP captures fantasy market consensus on rookie value.
    // ADP = overall pick position in startup drafts (rookies mixed with veterans).
    // Pricing uses ADP regression (continuous curve) — tiers are for display labels only.
    adpConfig: {
      // Position-specific ADP tier boundaries (display labels only — pricing uses regression)
      // Different positions have different ADP distributions in startup drafts:
      //   QB/TE: wider ranges (fewer drafted, more spread out in ADP)
      //   RB/WR: tighter ranges (more drafted, clustered higher in ADP)
      tiers: {
        QB: [
          { label: "Elite", min: 1, max: 36 },
          { label: "Premium", min: 37, max: 72 },
          { label: "Starter", min: 73, max: 144 },
          { label: "Depth", min: 145, max: 240 },
          { label: "Flier", min: 241, max: 9999 }
        ],
        RB: [
          { label: "Elite", min: 1, max: 24 },
          { label: "Premium", min: 25, max: 60 },
          { label: "Starter", min: 61, max: 120 },
          { label: "Depth", min: 121, max: 200 },
          { label: "Flier", min: 201, max: 9999 }
        ],
        WR: [
          { label: "Elite", min: 1, max: 24 },
          { label: "Premium", min: 25, max: 60 },
          { label: "Starter", min: 61, max: 120 },
          { label: "Depth", min: 121, max: 200 },
          { label: "Flier", min: 201, max: 9999 }
        ],
        TE: [
          { label: "Elite", min: 1, max: 60 },
          { label: "Premium", min: 61, max: 120 },
          { label: "Starter", min: 121, max: 200 },
          { label: "Depth", min: 201, max: 300 },
          { label: "Flier", min: 301, max: 9999 }
        ]
      },
      // Canonical tier labels for cross-tabulation headers
      tierLabels: ["Elite", "Premium", "Starter", "Depth", "Flier"],
      // Default ADP for players not found in ADP data (post-draft only)
      // Treats missing ADP as worst-case: fantasy market doesn't value them
      defaultADP: 360,
      // Default ADP for recruit scoring (separate from pricing)
      // 257 = one pick outside the startup ADP zone — harsh but not extreme
      defaultADPForScoring: 257,
      // Decay rate for converting ADP to a 0-100 score (gentler than draft capital
      // because ADP range is wider: 1-360 vs 1-262 for NFL draft picks)
      adpScoreDecayRate: 0.012,
      // ESPN grade adjustment: how much each grade point above/below position average
      // adjusts the predicted price. 0.01 = 1% per point, capped at ±25%.
      gradeAdjustmentPerPoint: 0.01,
      // Minimum data points needed for ADP regression (per position)
      minRegressionPoints: 10,
      // Minimum R² for ADP regression to be used (below this, falls back to draft-capital buckets)
      minRegressionR2: 0.10
    },

    // Scarcity Pricing Configuration
    // Models how a fixed conference auction budget distributes across the draft class.
    // Cross-position (teams bid from one pool), with copy 1/copy 2 split.
    scarcityConfig: {
      // Conference structure: code → team count
      // 5 conferences with 16 teams, 1 conference (AAC) with 20 teams
      conferences: { ACC: 16, B10: 16, B12: 16, P12: 16, SEC: 16, AAC: 20 },
      copiesPerConference: 2,
      // Copy discount bins: ratio = Copy2Price / Copy1Price
      // Elite: small % gap (everyone wants them), Mid: largest gap, Flier: small absolute gap
      // Defaults used when empirical data has fewer than minCopyPairsForEmpirical pairs
      copyDiscountBins: [
        { label: "elite",  minAvgPrice: 40, defaultRatio: 0.85 },
        { label: "mid",    minAvgPrice: 15, defaultRatio: 0.65 },
        { label: "flier",  minAvgPrice: 0,  defaultRatio: 0.75 }
      ],
      minCopyPairsForEmpirical: 8
    },

    // League structure
    numberOfConferences: 6,
    copiesPerPlayer: 12
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
