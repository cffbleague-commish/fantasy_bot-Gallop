/**
 * RECRUITING ANALYTICS - MAIN ENTRY POINTS
 * Menu functions and workflow orchestration.
 */

// ============================================================================
// CUSTOM MENU
// ============================================================================

/**
 * Add custom menu when the spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Recruiting Analytics")
    .addItem("1. Verify Configuration", "verifyConfig")
    .addSeparator()
    .addItem("2. Import Auction Data from League Sheet", "importTransactionLog")
    .addItem("3. Import ESPN Prospects (Current Year)", "importESPNProspects")
    .addItem("4. Import ESPN Prospects (Pick Year...)", "promptImportESPNYear")
    .addItem("5. Analyze Auction History", "analyzeAuctionHistory")
    .addSeparator()
    .addItem("6. Generate Recruiting Board (Current Year)", "generateRecruitingBoard")
    .addItem("7. Generate Recruiting Board (Pick Year...)", "promptGenerateRecruitingBoard")
    .addSeparator()
    .addItem("8. Generate Recruiting Grades (Current Year)", "generateRecruitingGrades")
    .addItem("9. Generate Recruiting Grades (Pick Year...)", "promptGenerateRecruitingGrades")
    .addSeparator()
    .addItem("Run Full Pipeline (Import + Analyze)", "runFullPipeline")
    .addSeparator()
    .addItem("Start Live Auction Sync (Hourly)", "startLiveAuctionSync")
    .addItem("Stop Live Auction Sync", "stopLiveAuctionSync")
    .addItem("Import Live Auction (Once)", "importLiveAuction")
    .addItem("Test Live Auction (2025 Data)", "testLiveAuctionWith2025")
    .addSeparator()
    .addItem("Set League Year...", "promptSetLeagueYear")
    .addToUi();
}

// ============================================================================
// WORKFLOWS
// ============================================================================

/**
 * Run the full pipeline: import data, then analyze.
 */
function runFullPipeline() {
  Logger.log("=== FULL PIPELINE START ===\n");

  // Verify config first
  if (!verifyConfig()) {
    Logger.log("\nPipeline aborted - fix configuration issues first.");
    return;
  }

  // Step 1: Import auction data
  Logger.log("\n--- Step 1: Importing Auction Data ---");
  importTransactionLog();

  // Step 2: Analyze
  Logger.log("\n--- Step 2: Analyzing Auction History ---");
  analyzeAuctionHistory();

  Logger.log("\n=== FULL PIPELINE COMPLETE ===");
  Logger.log("Check the AuctionData and AuctionAnalysis tabs for results.");
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Prompt to set the league year
 */
function promptSetLeagueYear() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();

  const response = ui.prompt(
    "Set League Year",
    `Current year: ${currentYear}\n\nEnter the new league year:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const newYear = response.getResponseText().trim();
  if (!/^\d{4}$/.test(newYear)) {
    ui.alert("Invalid year. Please enter a 4-digit year (e.g., 2025).");
    return;
  }

  setLeagueYear(newYear);
  ui.alert(`League year set to ${newYear}.`);
}
