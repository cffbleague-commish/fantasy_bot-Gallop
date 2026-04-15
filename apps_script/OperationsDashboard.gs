// ============================================================================
// OPERATIONS DASHBOARD - Server-side functions
// Interactive sidebar for managing seasonal operations checklist
// ============================================================================

const CHECKLIST_SHEET_NAME = "SeasonChecklist";

// Step definitions - order matters, these are the canonical steps
const DASHBOARD_STEPS = [
  // Phase 1: Season Wrap-Up
  { step: 1, phase: "Season Wrap-Up", name: "Process Current Year Transactions", description: "Ensure TransactionLog has all roster moves for the year", menuPath: "Sync Data → Process Current Year Transactions", runnable: true, functionName: "promptProcessCurrentYearTransactions" },
  { step: 2, phase: "Season Wrap-Up", name: "Sync Roster Ownership", description: "Update PlayerCopies ownership from TransactionLog", menuPath: "Sync Data → Sync Roster Ownership", runnable: true, functionName: "manualRosterSync" },
  { step: 3, phase: "Season Wrap-Up", name: "Calculate Final Awards", description: "Calculate Heisman, All-Conference through regular season", menuPath: "Awards → Calculate Current Awards", runnable: true, functionName: "dashboardCalculateAwards" },
  { step: 4, phase: "Season Wrap-Up", name: "Sync Awards to PlayerCopies", description: "Awards must be on PlayerCopies for declaration eligibility", menuPath: "Declarations → Sync Current Year Awards", runnable: true, functionName: "menuSyncCurrentYearAwards" },
  { step: 5, phase: "Season Wrap-Up", name: "Calculate Theoretical Draft", description: "Draft bonuses for graduating/declaring players", menuPath: "Theoretical Draft → Calculate Current Year Draft", runnable: true, functionName: "dashboardCalculateTheoreticalDraft" },
  { step: 6, phase: "Season Wrap-Up", name: "Calculate Recruiting Dollars", description: "Final bonus dollar calculation", menuPath: "Recruiting Dollars → Calculate Current", runnable: true, functionName: "dashboardCalculateRecruitingDollars" },

  // Phase 2: Declarations & Redshirts
  { step: 7, phase: "Declarations & Redshirts", name: "View Eligible Players", description: "See who qualifies to declare early (3+ program years with awards)", menuPath: "Declarations → View Eligible Players", runnable: true, functionName: "menuViewEligiblePlayers" },
  { step: 8, phase: "Declarations & Redshirts", name: "Collect RETAIN/RELEASE Decisions", description: "Get decisions from each coach via Discord bot or manual entry", menuPath: "Manual / Discord", runnable: false },
  { step: 9, phase: "Declarations & Redshirts", name: "Process Early Declarations", description: "Apply RETAIN/RELEASE decisions, mark released players inactive (safe to re-run)", menuPath: "Declarations → Process Early Declarations", runnable: true, functionName: "dashboardProcessDeclarations" },
  { step: 10, phase: "Declarations & Redshirts", name: "Process Redshirts", description: "Scan TransactionLog for end-of-season taxi/IR status", menuPath: "Season Management → End Season", runnable: true, functionName: "dashboardProcessRedshirts" },

  // Phase 3: Year Rollover
  { step: 11, phase: "Year Rollover", name: "Rollover Eligibility", description: "Increment EligibilityYearsUsed, graduate 4-year players", menuPath: "Season Management → Rollover to New Year", runnable: true, functionName: "dashboardRolloverEligibility" },
  { step: 12, phase: "Year Rollover", name: "Recalculate Active Status", description: "Verify eligibility accounting for redshirts", menuPath: "Maintenance → Recalculate Active Status", runnable: true, functionName: "runRecalculateActiveStatus" },
  { step: 13, phase: "Year Rollover", name: "Sync Roster Ownership (post-rollover)", description: "Clean up ownership after rollover", menuPath: "Sync Data → Sync Roster Ownership", runnable: true, functionName: "manualRosterSync" },
  { step: 14, phase: "Year Rollover", name: "Set League Year", description: "Update LEAGUE_YEAR to the new season", menuPath: "📅 Set League Year", runnable: true, functionName: "dashboardSetLeagueYear" },
  { step: 15, phase: "Year Rollover", name: "Ingest New Rookies", description: "Create player copies for new draft class (after NFL Draft)", menuPath: "Sync Data → Ingest Rookies", runnable: true, functionName: "manualRookieIngestion" },
  { step: 16, phase: "Year Rollover", name: "Verify Data", description: "Confirm new rookies (EligYearsUsed=0) and graduated players (Active=FALSE)", menuPath: "Manual check", runnable: false },
  { step: 17, phase: "Year Rollover", name: "Setup Weekly Triggers", description: "Enable automation for Awards and Rankings (Tuesdays 6 AM)", menuPath: "Awards / Rankings → Setup Weekly Trigger", runnable: false }
];

/**
 * Show the Operations Dashboard sidebar
 */
function showOperationsDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('OperationsDashboard')
    .setTitle('Operations Dashboard')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Get or create the SeasonChecklist sheet
 */
function getChecklistSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(CHECKLIST_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHECKLIST_SHEET_NAME);
    sheet.appendRow(["Year", "StepNumber", "StepName", "Status", "CompletedAt", "Notes"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    // Hide the sheet - it's managed by the dashboard
    sheet.hideSheet();
  }
  return sheet;
}

/**
 * Get step definitions (called from HTML sidebar)
 */
function getDashboardSteps() {
  return DASHBOARD_STEPS;
}

/**
 * Get the current league year
 */
function getDashboardLeagueYear() {
  return getLeagueYear();
}

/**
 * Get checklist status for a given year
 * @param {Number|String} year
 * @returns {Object} Map of stepNumber -> {status, completedAt, notes}
 */
function getChecklistStatus(year) {
  year = Number(year);
  const sheet = getChecklistSheet_();
  const data = sheet.getDataRange().getValues();

  const status = {};
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === year) {
      status[data[i][1]] = {
        status: data[i][3] || "pending",
        completedAt: data[i][4] ? new Date(data[i][4]).toLocaleString() : "",
        notes: data[i][5] || ""
      };
    }
  }
  return status;
}

/**
 * Mark a step as complete
 * @param {Number|String} year
 * @param {Number} stepNumber
 * @param {String} notes - Optional notes
 */
function markStepComplete(year, stepNumber, notes) {
  year = Number(year);
  stepNumber = Number(stepNumber);
  const sheet = getChecklistSheet_();
  const data = sheet.getDataRange().getValues();

  const stepDef = DASHBOARD_STEPS.find(s => s.step === stepNumber);
  const stepName = stepDef ? stepDef.name : `Step ${stepNumber}`;

  // Check if entry exists for this year+step
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === year && Number(data[i][1]) === stepNumber) {
      // Update existing row
      const rowNum = i + 1;
      sheet.getRange(rowNum, 4).setValue("completed");
      sheet.getRange(rowNum, 5).setValue(new Date());
      if (notes) sheet.getRange(rowNum, 6).setValue(notes);
      return { success: true, updated: true };
    }
  }

  // Add new row
  sheet.appendRow([year, stepNumber, stepName, "completed", new Date(), notes || ""]);
  return { success: true, updated: false };
}

/**
 * Mark a step as incomplete (unchecked)
 * @param {Number|String} year
 * @param {Number} stepNumber
 */
function markStepIncomplete(year, stepNumber) {
  year = Number(year);
  stepNumber = Number(stepNumber);
  const sheet = getChecklistSheet_();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === year && Number(data[i][1]) === stepNumber) {
      // Remove the row
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true }; // Nothing to remove
}

/**
 * Run a step and mark it complete on success
 * @param {Number|String} year
 * @param {Number} stepNumber
 * @returns {Object} Result with success flag and message
 */
function runDashboardStep(year, stepNumber) {
  year = Number(year);
  stepNumber = Number(stepNumber);

  const stepDef = DASHBOARD_STEPS.find(s => s.step === stepNumber);
  if (!stepDef || !stepDef.runnable || !stepDef.functionName) {
    return { success: false, message: "Step is not runnable" };
  }

  try {
    // Call the function by name
    const fn = globalThis[stepDef.functionName];
    if (!fn) {
      return { success: false, message: `Function ${stepDef.functionName} not found` };
    }

    const result = fn();
    const notes = typeof result === "object" ? JSON.stringify(result) : String(result || "");

    // Mark as complete
    markStepComplete(year, stepNumber, notes);

    return { success: true, message: `${stepDef.name} completed successfully`, notes: notes };
  } catch (e) {
    return { success: false, message: `Error: ${e.message}` };
  }
}

/**
 * Get available years that have checklist data
 */
function getAvailableYears() {
  const sheet = getChecklistSheet_();
  const data = sheet.getDataRange().getValues();
  const years = new Set();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) years.add(Number(data[i][0]));
  }

  // Always include current league year
  const currentYear = Number(getLeagueYear());
  years.add(currentYear);
  if (currentYear > 0) years.add(currentYear - 1);

  return Array.from(years).sort((a, b) => b - a); // Descending
}

// ============================================================================
// DASHBOARD WRAPPER FUNCTIONS
// These wrap existing functions to work without UI prompts from the sidebar
// ============================================================================

function dashboardCalculateAwards() {
  const year = Number(getLeagueYear());
  const config = getConfig();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(year);
  const rankings = calculateAwards(year, regularSeasonWeeks);
  return { year: year, week: regularSeasonWeeks, heisman: rankings.heisman[0]?.playerName || "N/A" };
}

function dashboardCalculateTheoreticalDraft() {
  const year = Number(getLeagueYear());
  return calculateTheoreticalDraft(year);
}

function dashboardCalculateRecruitingDollars() {
  const year = Number(getLeagueYear());
  const currentWeek = getCurrentNFLWeek();
  return calculateRecruitingDollars(year, currentWeek);
}

function dashboardProcessDeclarations() {
  const year = Number(getLeagueYear());
  return processEarlyDeclarations(year);
}

function dashboardProcessRedshirts() {
  const year = Number(getLeagueYear());
  return processRedshirtsForSeason(year);
}

function dashboardRolloverEligibility() {
  const currentYear = Number(getLeagueYear());
  const newYear = currentYear + 1;
  const incremented = incrementEligibilityYears(currentYear, newYear);
  return { from: currentYear, to: newYear, incremented: incremented };
}

function dashboardSetLeagueYear() {
  const currentYear = Number(getLeagueYear());
  const newYear = currentYear + 1;
  setLeagueYear(String(newYear));
  return { previousYear: currentYear, newYear: newYear };
}
