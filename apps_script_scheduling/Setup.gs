/*********************************
 * SETUP & INSTRUCTIONS
 * Run createInstructionsSheet() to generate the Instructions tab
 *********************************/

/**
 * Creates or updates the Instructions sheet with usage documentation
 * Run this function once after setting up the project
 */
function createInstructionsSheet() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("Instructions");

  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet("Instructions", 0);  // Insert at beginning
  }

  // Set column widths
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 600);
  sheet.setColumnWidth(3, 300);

  const instructions = [
    ["FANTASY LEAGUE SCHEDULER", "", ""],
    ["", "", ""],
    ["OVERVIEW", "", ""],
    ["This scheduler generates a 12-week regular season schedule for a 100-team fantasy league.", "", ""],
    ["• Weeks 1-4: Non-Conference games (4 per team)", "", ""],
    ["• Weeks 5-12: Conference games (8 per team)", "", ""],
    ["• Supports rivalries with wagers (both conference and cross-conference)", "", ""],
    ["• Supports manual NC game submissions via Discord bot", "", ""],
    ["• Discord bot sends DM notifications to opponents", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["REQUIRED TABS", "Description", "Setup"],
    ["", "", ""],
    ["Teams", "Team/franchise data synced from Rankings sheet", "IMPORTRANGE (see below)"],
    ["Rivalries", "Rivalry matchups submitted via Discord", "Auto-managed by bot"],
    ["ManualGames", "Confirmed NC games (locked slots)", "Auto-managed by bot"],
    ["Manual Submissions", "Discord NC submission tracking", "Auto-created"],
    ["Settings", "Submission open/close status", "Auto-created by bot"],
    ["Schedule", "Generated schedule output", "Auto-created"],
    ["Scheduler Log", "Execution logs and errors", "Auto-created"],
    ["Validation", "Schedule validation matrix", "Auto-created"],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["STEP 1: TEAMS TAB (IMPORTRANGE)", "", ""],
    ["", "", ""],
    ["This tab syncs team data from your Rankings Google Sheet's FranchiseLookup tab.", "", ""],
    ["", "", ""],
    ["1. Create a new tab called 'Teams'", "", ""],
    ["2. In cell A1, paste this formula:", "", ""],
    ["", "=IMPORTRANGE(\"YOUR_SHEET_ID\", \"FranchiseLookup!A:Z\")", ""],
    ["", "", ""],
    ["3. Replace YOUR_SHEET_ID with the ID from your Rankings sheet URL:", "", ""],
    ["", "https://docs.google.com/spreadsheets/d/[THIS_IS_THE_ID]/edit", ""],
    ["", "", ""],
    ["4. Click 'Allow access' when prompted", "", ""],
    ["", "", ""],
    ["Required columns: Franchise ID | Team Name | Conference | Owner Discord ID", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["STEP 2: RIVALRIES TAB (Discord Bot Managed)", "", ""],
    ["", "", ""],
    ["The Rivalries tab is automatically managed by the Discord bot.", "", ""],
    ["Teams submit rivalries via Discord, and both teams must confirm.", "", ""],
    ["", "", ""],
    ["Columns:", "", ""],
    ["Team A | Team A Name | Team B | Team B Name | Rivalry Name | Wager | Type | Status | Submitted", "", ""],
    ["", "", ""],
    ["RIVALRY RULES:", "", ""],
    ["• Maximum 2 rivalries per team", "", ""],
    ["• Wager amount: $0 - $5 (both teams must agree)", "", ""],
    ["• Both teams must submit IDENTICAL name and wager to confirm", "", ""],
    ["• Conference rivalries (CONF):", "", ""],
    ["    - 1 conference rival: Scheduled in Week 12 (Rivalry Week)", "", ""],
    ["    - 2 conference rivals: One in Week 12, other in Week 5", "", ""],
    ["• Cross-conference rivalries (NC): Scheduled in Weeks 1-4", "", ""],
    ["", "", ""],
    ["STATUS VALUES:", "", ""],
    ["• PENDING = Waiting for other team to confirm", "", ""],
    ["• CONFIRMED = Both teams agreed, locked for scheduling", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["STEP 3: MANUAL NC GAMES (Discord Bot Managed)", "", ""],
    ["", "", ""],
    ["Teams can request specific NC matchups via Discord.", "", ""],
    ["Both teams must submit the same week to confirm.", "", ""],
    ["", "", ""],
    ["ManualGames Tab Columns:", "", ""],
    ["Week | Team A | Team B | Source | Created", "", ""],
    ["", "", ""],
    ["Manual Submissions Tab Columns (tracking):", "", ""],
    ["Timestamp | Week | Team A | Team B | Discord ID | Status | Match Key", "", ""],
    ["", "", ""],
    ["• Only for non-conference weeks (1-4)", "", ""],
    ["• Confirmed games are locked and won't be moved by scheduler", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["DISCORD BOT COMMANDS", "", ""],
    ["", "", ""],
    ["All commands use @mention to select opponent (no typing team names!)", "", ""],
    ["All responses are PRIVATE (only you see them)", "", ""],
    ["Opponents receive DM notifications when you submit", "", ""],
    ["", "", ""],
    ["RIVALRY COMMANDS:", "", ""],
    ["", "", ""],
    ["/rival submit", "@opponent, name, wager", "Submit a rivalry request"],
    ["", "Example: /rival submit opponent:@JohnDoe name:The Iron Bowl wager:5", ""],
    ["", "", ""],
    ["/rival status", "", "Check your rivalry status (confirmed, pending, awaiting you)"],
    ["", "", ""],
    ["NC GAME COMMANDS:", "", ""],
    ["", "", ""],
    ["/schedule submit", "week, @opponent", "Submit an NC game request"],
    ["", "Example: /schedule submit week:2 opponent:@JohnDoe", ""],
    ["", "", ""],
    ["/schedule status", "", "Check your NC game submissions"],
    ["", "", ""],
    ["COMMISH COMMANDS:", "", ""],
    ["", "", ""],
    ["/submissions open", "rivalries / nc_games / all", "Open submission period"],
    ["/submissions close", "rivalries / nc_games / all", "Close submission period"],
    ["/submissions status", "", "Check current submission status"],
    ["/pending", "", "List all pending submissions"],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["HOW CONFIRMATION WORKS", "", ""],
    ["", "", ""],
    ["RIVALRIES:", "", ""],
    ["1. Team A runs: /rival submit opponent:@TeamB name:The Showdown wager:3", "", ""],
    ["2. Team B receives a DM with the rivalry details", "", ""],
    ["3. Team B runs: /rival submit opponent:@TeamA name:The Showdown wager:3", "", ""],
    ["4. If name and wager match exactly → CONFIRMED!", "", ""],
    ["5. If they don't match → Team B sees error, must coordinate", "", ""],
    ["", "", ""],
    ["NC GAMES:", "", ""],
    ["1. Team A runs: /schedule submit week:2 opponent:@TeamB", "", ""],
    ["2. Team B receives a DM notification", "", ""],
    ["3. Team B runs: /schedule submit week:2 opponent:@TeamA", "", ""],
    ["4. Same week → Game confirmed and added to ManualGames", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["RUNNING THE SCHEDULER", "", ""],
    ["", "", ""],
    ["MENU OPTIONS:", "", ""],
    ["", "", ""],
    ["1. Clear Schedule", "", ""],
    ["• Clears the Schedule tab, Validation matrix, and Scheduler Log", "", ""],
    ["• Keeps rivalries and manual games (submitted via Discord)", "", ""],
    ["• Use this before regenerating from scratch", "", ""],
    ["", "", ""],
    ["2. Generate Conference Schedule (Weeks 5-12)", "", ""],
    ["• Run this FIRST, early in the offseason", "", ""],
    ["• Loads confirmed conference rivalries", "", ""],
    ["• Places conference rivals:", "", ""],
    ["    - 1 rival: Week 12 (Rivalry Week)", "", ""],
    ["    - 2 rivals: First → Week 12, Second → Week 5", "", ""],
    ["• Auto-fills remaining conference games per team", "", ""],
    ["", "", ""],
    ["3. Generate Non-Conference Schedule (Weeks 1-4)", "", ""],
    ["• Run this AFTER the NC submission deadline", "", ""],
    ["• Loads confirmed manual NC games (highest priority)", "", ""],
    ["• Loads confirmed NC rivalries (second priority)", "", ""],
    ["• Auto-fills remaining NC games", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["OUTPUT TABS", "", ""],
    ["", "", ""],
    ["Schedule", "The generated schedule with columns:", ""],
    ["", "Week | Home | Away | Type (CONF/NC)", ""],
    ["", "", ""],
    ["Scheduler Log", "Execution log with:", ""],
    ["", "Timestamp | Phase | Severity | Type | Team | Message", ""],
    ["", "Check here for errors if schedule is incomplete", ""],
    ["", "", ""],
    ["Validation", "Matrix showing all matchups:", ""],
    ["", "Blue = Conference game", ""],
    ["", "Green = Non-conference game", ""],
    ["", "Totals column shows games per team", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["LEAGUE PARAMETERS", "", ""],
    ["", "", ""],
    ["Current settings (edit in Config.gs):", "", ""],
    ["", "", ""],
    ["Parameter", "Value", ""],
    ["Teams", "100", ""],
    ["Regular Season Weeks", "12", ""],
    ["Conference Games", "8 (Weeks 5-12)", ""],
    ["Non-Conference Games", "4 (Weeks 1-4)", ""],
    ["Max Rivalries Per Team", "2", ""],
    ["Max Wager", "$5", ""],
    ["Primary Rivalry Week", "Week 12 (1st conference rival)", ""],
    ["Secondary Rivalry Week", "Week 5 (2nd conference rival)", ""],
    ["", "", ""],
    ["CONFERENCES:", "", ""],
    ["AAC (20) | ACC (16) | B10 (16) | B12 (16) | P12 (16) | SEC (16)", "", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["TROUBLESHOOTING", "", ""],
    ["", "", ""],
    ["Problem", "Solution", ""],
    ["'Teams sheet not found'", "Create Teams tab with IMPORTRANGE formula", ""],
    ["'Teams sheet is empty'", "Check IMPORTRANGE formula, click 'Allow access'", ""],
    ["'Conference column not found'", "Ensure FranchiseLookup has 'Conference' column", ""],
    ["'Not registered as team owner'", "Ensure Owner Discord ID is set in FranchiseLookup", ""],
    ["'Max rivalries reached'", "Team already has 2 confirmed rivalries", ""],
    ["'Could not DM opponent'", "Opponent has DMs disabled, notify them directly", ""],
    ["Schedule incomplete", "Check Scheduler Log for ERROR entries", ""],
    ["Stalled scheduling", "Too many constraints - reduce rivalries or manual games", ""],
    ["", "", ""],
    ["═══════════════════════════════════════════════════════════════════════════════", "", ""],
    ["", "", ""],
    ["QUICK START CHECKLIST", "", ""],
    ["", "", ""],
    ["☐ Create 'Teams' tab with IMPORTRANGE from FranchiseLookup", "", ""],
    ["☐ Ensure FranchiseLookup has 'Owner Discord ID' column", "", ""],
    ["☐ Click 'Allow access' for IMPORTRANGE", "", ""],
    ["☐ Run 'Initialize Sheets' from Scheduler menu", "", ""],
    ["☐ Commish: /submissions open rivalries → Open rivalry period", "", ""],
    ["☐ Commish: /submissions close rivalries → Close rivalry period", "", ""],
    ["☐ Generate Conference Schedule (Weeks 5-12)", "", ""],
    ["☐ Commish: /submissions open nc_games → Open NC submission period", "", ""],
    ["☐ Commish: /submissions close nc_games → Close NC submission period", "", ""],
    ["☐ Generate Non-Conference Schedule (Weeks 1-4)", "", ""],
    ["☐ Check 'Schedule' tab for output", "", ""],
    ["☐ Check 'Scheduler Log' for any errors", "", ""],
    ["", "", ""],
  ];

  // Write all instructions
  sheet.getRange(1, 1, instructions.length, 3).setValues(instructions);

  // Format title
  sheet.getRange(1, 1).setFontSize(18).setFontWeight("bold");

  // Format section headers dynamically (look for all-caps lines that aren't dividers)
  const sectionKeywords = [
    "OVERVIEW", "REQUIRED TABS", "STEP 1:", "STEP 2:", "STEP 3:",
    "DISCORD BOT COMMANDS", "HOW CONFIRMATION WORKS", "RUNNING THE SCHEDULER",
    "OUTPUT TABS", "LEAGUE PARAMETERS", "TROUBLESHOOTING", "QUICK START"
  ];

  for (let i = 0; i < instructions.length; i++) {
    const text = instructions[i][0];

    // Format divider lines
    if (text.includes("═══")) {
      sheet.getRange(i + 1, 1).setFontColor("#cccccc");
      continue;
    }

    // Format section headers
    if (sectionKeywords.some(kw => text.startsWith(kw))) {
      sheet.getRange(i + 1, 1).setFontSize(12).setFontWeight("bold").setBackground("#e8f0fe");
      continue;
    }

    // Format sub-headers (lines with content in column A and B that look like table headers)
    if (text && instructions[i][1] && !text.startsWith("•") && !text.startsWith("☐") &&
        !text.startsWith("/") && !text.includes("Example") && text === text.toUpperCase() &&
        text.length < 30) {
      sheet.getRange(i + 1, 1, 1, 3).setFontWeight("bold").setBackground("#f3f3f3");
    }
  }

  // Freeze first row
  sheet.setFrozenRows(1);

  // Protect sheet (optional - prevents accidental edits)
  // Uncomment if desired:
  // const protection = sheet.protect().setDescription('Instructions - Read Only');
  // protection.setWarningOnly(true);

  Logger.log("✅ Instructions sheet created successfully");
  SpreadsheetApp.getUi().alert("Instructions sheet created! Check the 'Instructions' tab.");
}

/**
 * Add custom menu to spreadsheet
 * This runs automatically when the spreadsheet is opened
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Scheduler')
    .addItem('🗑️ Clear Schedule', 'clearSchedule')
    .addItem('📋 Generate Conference Schedule (Weeks 5-12)', 'runConferenceScheduler')
    .addItem('📋 Generate Non-Conference Schedule (Weeks 1-4)', 'runNonConferenceScheduler')
    .addSeparator()
    .addItem('🔧 Initialize Sheets', 'initializeSheets')
    .addItem('📖 Create Instructions Tab', 'createInstructionsSheet')
    .addItem('🔍 Validate Current Schedule', 'validateCurrentSchedule')
    .addItem('✅ Validate Rivalries', 'validateRivalries')
    .addToUi();
}

/**
 * Validate the current schedule without regenerating
 */
function validateCurrentSchedule() {
  const teams = loadTeams();
  TEAMS_BY_ID = Object.fromEntries(teams.map(t => [t.id, t]));

  const params = getLeagueParams();
  const grid = loadScheduleIntoGrid(teams, params);

  if (!grid) {
    SpreadsheetApp.getUi().alert("No schedule found. Run the scheduler first.");
    return;
  }

  auditAndLogScheduleIssues(grid, teams, params);
  writeValidationMatrixWithTotals(grid, teams, params);

  SpreadsheetApp.getUi().alert("Validation complete. Check 'Validation' and 'Scheduler Log' tabs.");
}

/**
 * Load existing schedule into grid format for validation
 */
function loadScheduleIntoGrid(teams, params) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SCHEDULE_SHEET);

  if (!sheet || sheet.getLastRow() <= 1) return null;

  const data = sheet.getDataRange().getValues();
  const grid = initScheduleGrid(teams, params);

  // Skip header row
  data.slice(1).forEach(row => {
    const week = Number(row[0]);
    const home = String(row[1]).padStart(3, "0");
    const away = String(row[2]).padStart(3, "0");
    const type = row[3];

    if (grid[home] && grid[away]) {
      grid[home][week] = { opponent: away, type };
      grid[away][week] = { opponent: home, type };
    }
  });

  return grid;
}

/**
 * Clear the generated schedule, validation matrix, and logs
 * Keeps manual games and rivalries (submitted via Discord)
 */
function clearSchedule() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Clear Schedule',
    'This will clear:\n• Generated schedule\n• Validation matrix\n• Scheduler logs\n\n(Manual games and rivalries are kept)\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActive();

  // Clear Schedule sheet
  const scheduleSheet = ss.getSheetByName(SCHEDULE_SHEET);
  if (scheduleSheet) {
    scheduleSheet.clear();
    scheduleSheet.appendRow(["Week", "Home", "Away", "Type"]);
    scheduleSheet.getRange(1, 1, 1, 4).setFontWeight("bold");
  }

  // Clear Validation sheet
  const validationSheet = ss.getSheetByName("Validation");
  if (validationSheet) {
    validationSheet.clear();
  }

  // Clear Scheduler Log sheet
  const logSheet = ss.getSheetByName(LOG_SHEET);
  if (logSheet) {
    logSheet.clear();
    logSheet.appendRow(["Timestamp", "Phase", "Severity", "Type", "Team", "Week", "Opponent", "Message"]);
    logSheet.getRange(1, 1, 1, 8).setFontWeight("bold");
  }

  ui.alert("Schedule, validation matrix, and logs have been cleared.");
}

/**
 * Clear scheduler logs
 */
function clearLogs() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Clear Logs',
    'This will delete all scheduler logs. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActive();
  const logSheet = ss.getSheetByName(LOG_SHEET);

  if (logSheet) {
    logSheet.clear();
    logSheet.appendRow([
      "Timestamp", "Phase", "Severity", "Type", "Team", "Week", "Opponent", "Message"
    ]);
  }

  ui.alert("Logs cleared.");
}

/**
 * Initialize all required sheets with proper headers
 * Run this once when setting up a new spreadsheet
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActive();

  // Rivalries (managed by Discord bot)
  let rivalries = ss.getSheetByName(RIVALRIES_SHEET);
  if (!rivalries) {
    rivalries = ss.insertSheet(RIVALRIES_SHEET);
    rivalries.appendRow([
      "Team A",           // Franchise ID
      "Team A Name",      // Team name for readability
      "Team B",           // Franchise ID
      "Team B Name",      // Team name for readability
      "Rivalry Name",     // Name of the rivalry (e.g., "The Iron Bowl")
      "Wager",            // Wager amount ($0-5)
      "Type",             // CONF or NC (same or different conference)
      "Status",           // PENDING or CONFIRMED
      "Submitted"         // Timestamp (overwritten with confirmation time on confirm)
    ]);
    rivalries.getRange(1, 1, 1, 9).setFontWeight("bold");
    rivalries.setFrozenRows(1);
  }

  // ManualGames
  let manual = ss.getSheetByName(MANUAL_GAMES_SHEET);
  if (!manual) {
    manual = ss.insertSheet(MANUAL_GAMES_SHEET);
    manual.appendRow(["Week", "Team A", "Team B", "Source", "Created"]);
    manual.getRange(1, 1, 1, 5).setFontWeight("bold");
  }

  // Manual Submissions
  let submissions = ss.getSheetByName(MANUAL_SUBMISSIONS_SHEET);
  if (!submissions) {
    submissions = ss.insertSheet(MANUAL_SUBMISSIONS_SHEET);
    submissions.appendRow(["Timestamp", "Week", "Team A", "Team B", "Discord ID", "Status", "Match Key"]);
    submissions.getRange(1, 1, 1, 7).setFontWeight("bold");
  }

  // Schedule
  let schedule = ss.getSheetByName(SCHEDULE_SHEET);
  if (!schedule) {
    schedule = ss.insertSheet(SCHEDULE_SHEET);
    schedule.appendRow(["Week", "Home", "Away", "Type"]);
    schedule.getRange(1, 1, 1, 4).setFontWeight("bold");
  }

  // Scheduler Log
  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.appendRow(["Timestamp", "Phase", "Severity", "Type", "Team", "Week", "Opponent", "Message"]);
    log.getRange(1, 1, 1, 8).setFontWeight("bold");
  }

  Logger.log("✅ All sheets initialized");
  SpreadsheetApp.getUi().alert("All required sheets have been created!");
}
