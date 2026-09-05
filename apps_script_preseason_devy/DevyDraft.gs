/**
 * DevyDraft.gs - Devy Draft Management System
 *
 * Manages devy player drafts conducted by conference with:
 * - 2 rounds, same order each round (worst team picks first)
 * - 24 hour pick timer
 * - No pick trading
 *
 * WORKFLOW:
 * 1. Manually populate DevyDraftOrder sheet with the draft order for each conference
 * 2. Manually populate DevyPlayerPool with available devy players
 * 3. Use /devy start <conference> <year> in Discord to begin the draft
 * 4. Teams use /devy pick <player_id> to make selections
 * 5. All picks are recorded in DevyDraftHistory (accumulates year over year)
 *
 * Sheet Structures:
 * - DevyPlayerPool: Available devy players (FirstName, LastName, Position, Year, Drafted)
 * - DevyDraftOrder: MANUAL INPUT - Draft order by conference (Year, Conference, Round, Pick, OverallPick, FranchiseID, TeamName, PreviousYearStanding)
 * - DevyDraftHistory: All picks made (Year, Conference, Round, Pick, FranchiseID, TeamName, PlayerName, Position, Timestamp)
 * - DevyDraftSettings: Runtime configuration (DraftYear, DraftStatus, CurrentConference, CurrentRound, CurrentPick, PickDeadline)
 */

// ============================================================================
// CUSTOM MENU - Adds "Devy Draft" menu to Google Sheets
// ============================================================================

/**
 * Creates a custom menu when the spreadsheet is opened
 * To set up: Run this function once, or it will auto-run on spreadsheet open
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏈 Devy Draft')
    .addItem('📥 Import Players from KeepTradeCut', 'menuImportFromKTC')
    .addItem('🔄 Refresh Players from KeepTradeCut', 'menuRefreshFromKTC')
    .addItem('➕ Add Player to Pool...', 'menuAddDevyPlayer')
    .addSeparator()
    .addItem('📋 Initialize Draft Sheets', 'menuInitializeSheets')
    .addItem('📊 View Draft Status', 'menuViewDraftStatus')
    .addSeparator()
    .addSubMenu(ui.createMenu('🔒 Player Retention')
      .addItem('Open Retention Window (seed decisions)...', 'menuOpenRetentionWindow')
      .addItem('View Retained Players...', 'menuViewRetainedPlayers')
      .addItem('Finalize Retention (auto-retain)...', 'menuFinalizeDevyRetention')
      .addItem('Sweep NFL Graduates (RookieLedger)...', 'menuSweepGraduatedDevyPlayers')
      .addItem('Mark Player as Entered NFL...', 'menuMarkEnteredNFL'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📋 Draft Order')
      .addItem('Generate from Standings...', 'menuGenerateDraftOrderFromStandings')
      .addItem('Apply Retentions to Draft...', 'menuApplyRetentionsToDraft')
      .addItem('View Draft Order...', 'menuViewDraftOrder')
      .addItem('Clear Draft Order...', 'menuClearDraftOrder'))
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ Utilities')
      .addItem('Reconcile Pool from History...', 'menuReconcileDevyPool')
      .addItem('Trace Player (debug)...', 'menuTraceDevyPlayer')
      .addItem('Reset Draft for Conference...', 'menuResetDraft')
      .addItem('Clear All Available Players', 'menuClearUndrafted')
      .addItem('View Conferences', 'menuViewConferences'))
    .addSeparator()
    .addItem('📖 Open Commissioner Guide', 'menuOpenCommissionerGuide')
    .addToUi();

  // Add the Backfill History menu (from BackfillDevyHistory.gs)
  addBackfillMenu();
}

/**
 * Menu: Initialize all draft sheets
 */
function menuInitializeSheets() {
  getDevyPlayerPoolSheet();
  getDevyDraftOrderSheet();
  getDevyDraftHistorySheet();
  getDevyDraftSettingsSheet();
  getDevyRetentionHistorySheet();

  SpreadsheetApp.getUi().alert(
    "Sheets Initialized",
    "All Devy Draft sheets have been created:\n\n• DevyPlayerPool\n• DevyDraftOrder\n• DevyDraftHistory\n• DevyRetentionHistory\n• DevyDraftSettings",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Menu: View current draft status
 */
function menuViewDraftStatus() {
  const status = getDevyDraftStatus();
  const ui = SpreadsheetApp.getUi();

  let message = `Draft Year: ${status.draftYear || 'Not set'}\n`;
  message += `Status: ${status.status || 'Not started'}\n`;
  message += `Conference: ${status.currentConference || 'N/A'}\n`;

  if (status.status === 'in_progress') {
    message += `\nCurrent Pick: Round ${status.currentRound}, Pick ${status.currentPick}\n`;
    message += `Deadline: ${status.pickDeadline || 'N/A'}`;
  }

  ui.alert("Devy Draft Status", message, ui.ButtonSet.OK);
}

/**
 * Menu: Open the Commissioner Guide
 *
 * In-sheet runbook for running the devy draft each year, plus how the
 * DevyRetentionHistory ledger works. This is the single source of truth for
 * the annual process. Shown as a modal dialog so the formatting survives.
 */
function menuOpenCommissionerGuide() {
  const html = HtmlService.createHtmlOutput(getCommissionerGuideHtml())
    .setWidth(720)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, "Devy Draft — Commissioner Guide");
}

/**
 * Build the HTML for the Commissioner Guide modal.
 * Kept as a single string so the whole runbook lives in one place.
 */
function getCommissionerGuideHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
<base target="_top">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1f2933; margin: 0; padding: 16px 20px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 6px; color: #0b5394; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  p.sub { color: #52606d; margin: 0 0 8px; font-size: 12px; }
  ol { margin: 6px 0 0; padding-left: 22px; }
  ol > li { margin-bottom: 10px; }
  code { background: #f1f5f9; border-radius: 3px; padding: 1px 5px; font-size: 12px; }
  .menu { color: #0b5394; font-weight: 600; }
  .note { background: #fff8e1; border-left: 3px solid #f0b429; padding: 8px 12px; margin: 8px 0; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; margin-top: 6px; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
  th { background: #f8fafc; }
</style>
</head>
<body>
  <h1>🏈 Devy Draft — Commissioner Guide</h1>
  <p class="sub">The annual steps for running the conference devy drafts, and how the retention ledger works.</p>

  <h2>Running the draft each year</h2>
  <p class="sub">Order matters: graduate NFL players and rebuild ownership from the ledger <em>before</em> asking anyone for retention decisions.</p>
  <ol>
    <li><b>Sweep NFL graduates.</b> <span class="menu">🔒 Player Retention → Sweep NFL Graduates (RookieLedger)</span>. Any owned devy whose name is in the <code>RookieLedger</code> (they were drafted into the NFL) is marked <code>EnteredNFL</code> and leaves the devy cycle. Run this at the auction / season start, first.</li>
    <li><b>Refresh the player pool.</b> <span class="menu">🏈 Devy Draft → 📥 Import / 🔄 Refresh Players from KeepTradeCut</span>. Pulls current devy rankings and creates one copy of each player <em>per conference</em> (each conference drafts from its own pool).</li>
    <li><b>Reconcile the pool from history.</b> <span class="menu">🏈 Devy Draft → ⚙️ Utilities → Reconcile Pool from History</span>. Replays <code>DevyDraftHistory</code> + <code>DevyRetentionHistory</code> to rebuild each copy's <code>Status</code>/owner (last event wins). After this, the pool is a faithful projection of the ledger — the retention decision list and everything downstream read from it.</li>
    <li><b>Open the retention window (seed decisions).</b> <span class="menu">🔒 Player Retention → Open Retention Window</span> writes one <code>PENDING</code> row into <code>DevyRetentionHistory</code> for every owned player — this is the worklist you can see in the sheet. Then in Discord run <code>/devy retention_start &lt;year&gt;</code>: the bot reads those <code>PENDING</code> rows and DMs each owner. Owners choose retain / release per player; each decision <b>updates that same row</b> to <code>RETAIN</code> / <code>RELEASE</code> (no guessing what the bot sees). Released players return to the pool. A team may retain at most <b>2</b> players (1st spends Round 2, 2nd Round 1).</li>
    <li><b>Finalize retention.</b> After the deadline, run <code>/devy retention_finalize &lt;year&gt;</code> (or <span class="menu">🔒 Player Retention → Finalize Retention</span>). Every owned player with <em>no</em> decision is <b>auto-retained</b> up to the 2-pick cap (cost still applies); any beyond the cap is auto-released.</li>
    <li><b>Generate the draft order.</b> <span class="menu">🏈 Devy Draft → 📋 Draft Order → Generate from Standings</span> (reads the <code>ConferenceStandings</code> sheet). Rule: <b>draft year = standings year + 1</b>. Worst team picks first, <b>2 rounds</b>, same order each round (no snake).</li>
    <li><b>Slot retentions into the draft.</b> Run <code>/devy retention_apply &lt;year&gt;</code> (or <span class="menu">📋 Draft Order → Apply Retentions to Draft</span>). Each retained player is written into their team's consumed slot (Round 2, then Round 1) in <code>DevyDraftHistory</code>, and the live draft will skip those slots automatically.</li>
    <li><b>Start the draft per conference.</b> In Discord, <code>/devy start &lt;conference&gt; &lt;year&gt;</code>. Each pick has a <b>24-hour</b> timer and there is <b>no pick trading</b>. Slots already filled by retentions are skipped.</li>
    <li><b>Owners pick.</b> <code>/devy pick</code> records the selection in <code>DevyDraftHistory</code> and marks that conference's pool copy as Drafted. Repeat for every conference.</li>
    <li><b>Next cycle.</b> Graduation is handled at the top of the next cycle by the <b>Sweep NFL Graduates</b> step, which reads the <code>RookieLedger</code> tab (columns <code>Name</code>, <code>Year</code> = NFL draft year). Keep that tab current; it supersedes the old RookieLedger IMPORTRANGE / <code>IsRookie</code>-formula approach. <span class="menu">🔒 Player Retention → Mark Player as Entered NFL</span> is still available for one-off manual removals.</li>
  </ol>

  <h2>Retention history &amp; rebates</h2>
  <p class="sub">Every retain/release decision appends one row to <code>DevyRetentionHistory</code>. It is both the decision audit and the year-over-year rebate ledger.</p>
  <table>
    <tr><th>Field</th><th>Meaning</th></tr>
    <tr><td>Decision</td><td><code>RETAIN</code> or <code>RELEASE</code> (blank on legacy rows = RETAIN).</td></tr>
    <tr><td>ConsecutiveYear</td><td>1 the first time a player is retained, 2 the next year, and so on (RETAIN only).</td></tr>
    <tr><td>PickUsed</td><td>Which pick the retention consumes — <code>Round 2</code> for a team's first retention that year, <code>Round 1</code> for the second.</td></tr>
    <tr><td>BaseRebate</td><td>Always <code>$20</code> (RETAIN only).</td></tr>
    <tr><td>RebateRemaining</td><td><code>max(0, $20 − $5 × (ConsecutiveYear − 1))</code>: $20, then $15, $10, $5, $0…</td></tr>
    <tr><td>IsRookie</td><td>Formula column — TRUE once the player appears in the RookieLedger (entered the NFL).</td></tr>
  </table>
  <div class="note"><b>Notes:</b> Releasing a player returns their pool copy to Available and logs a <code>RELEASE</code> row, but does <em>not</em> delete past ledger rows — a retention that happened is historical fact. Historical seasons are loaded separately via <span class="menu">📜 Backfill History</span>. The <code>Decision</code> column is added automatically to older sheets the next time the sheet is opened or <span class="menu">Initialize Draft Sheets</span> is run.</div>
</body>
</html>`;
}

/**
 * Menu: Reset draft for a conference
 */
function menuResetDraft() {
  const ui = SpreadsheetApp.getUi();

  const confResponse = ui.prompt(
    "Reset Draft",
    "Enter the conference to reset (e.g., ACC, B10, SEC):",
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) return;
  const conference = confResponse.getResponseText().toUpperCase().trim();

  const yearResponse = ui.prompt(
    "Reset Draft",
    "Enter the draft year to reset:",
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResponse.getResponseText().trim());

  if (!conference || isNaN(year)) {
    ui.alert("Invalid Input", "Please enter a valid conference and year.", ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert(
    "Confirm Reset",
    `Are you sure you want to reset the ${conference} draft for ${year}?\n\nThis will:\n• Clear draft history for this conference/year\n• Unmark all players drafted in this draft\n• Reset draft status`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = resetDevyDraft(conference, year);
  ui.alert("Reset Complete", result.message, ui.ButtonSet.OK);
}

/**
 * Menu: Clear all available (undrafted, non-retained) players
 */
function menuClearUndrafted() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    "Clear Available Players",
    "This will remove all AVAILABLE players from the pool.\n\nDrafted and Retained players will be preserved.\n\nContinue?",
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusCol = headers.indexOf("Status");

  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    const status = data[i][statusCol] || "Available";
    if (status === "Available") {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  ui.alert("Clear Complete", `Removed ${deleted} available players.`, ui.ButtonSet.OK);
}

/**
 * Menu: View all conferences
 */
function menuViewConferences() {
  const ui = SpreadsheetApp.getUi();
  const conferences = getAllConferences();

  if (conferences.length === 0) {
    ui.alert("No Conferences", "No conferences found in the Teams sheet.\n\nMake sure the Teams sheet has a 'Conference' column populated.", ui.ButtonSet.OK);
    return;
  }

  ui.alert("Conferences", `Found ${conferences.length} conferences:\n\n• ${conferences.join('\n• ')}`, ui.ButtonSet.OK);
}

/**
 * Menu: View retained players
 */
function menuViewRetainedPlayers() {
  const ui = SpreadsheetApp.getUi();

  const confResponse = ui.prompt(
    "View Retained Players",
    "Enter conference code (or leave blank for all):",
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) return;
  const conference = confResponse.getResponseText().toUpperCase().trim() || null;

  // Get all retained players
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const retained = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colMap["Status"]] === "Retained") {
      if (!conference || row[colMap["Conference"]] === conference) {
        retained.push({
          conference: row[colMap["Conference"]],
          name: `${row[colMap["FirstName"]]} ${row[colMap["LastName"]]}`,
          position: row[colMap["Position"]],
          retainedBy: row[colMap["RetainedBy"]],
          year: row[colMap["RetentionYear"]]
        });
      }
    }
  }

  if (retained.length === 0) {
    ui.alert("Retained Players", conference ? `No retained players in ${conference}.` : "No retained players found.", ui.ButtonSet.OK);
    return;
  }

  let message = `Found ${retained.length} retained players:\n\n`;
  retained.forEach(p => {
    message += `• ${p.name} (${p.position}) - ${p.conference} - Franchise ${p.retainedBy}\n`;
  });

  ui.alert("Retained Players", message, ui.ButtonSet.OK);
}

/**
 * Menu: Mark a player as entered NFL
 */
function menuMarkEnteredNFL() {
  const ui = SpreadsheetApp.getUi();

  const nameResponse = ui.prompt(
    "Mark Player Entered NFL",
    "Enter player name to search for:",
    ui.ButtonSet.OK_CANCEL
  );

  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
  const searchTerm = nameResponse.getResponseText().trim();

  if (!searchTerm) {
    ui.alert("Invalid Input", "Please enter a player name.", ui.ButtonSet.OK);
    return;
  }

  // Search for matching players
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const matches = [];
  const term = searchTerm.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fullName = `${row[colMap["FirstName"]]} ${row[colMap["LastName"]]}`.toLowerCase();
    if (fullName.includes(term) && row[colMap["Status"]] !== "EnteredNFL") {
      // Only add unique base player names
      const baseId = row[colMap["PlayerID"]].split('_').slice(1).join('_');
      if (!matches.some(m => m.baseId === baseId)) {
        matches.push({
          baseId: baseId,
          name: `${row[colMap["FirstName"]]} ${row[colMap["LastName"]]}`,
          position: row[colMap["Position"]]
        });
      }
    }
  }

  if (matches.length === 0) {
    ui.alert("Not Found", `No active players found matching "${searchTerm}".`, ui.ButtonSet.OK);
    return;
  }

  if (matches.length > 5) {
    ui.alert("Too Many Matches", `Found ${matches.length} players matching "${searchTerm}".\n\nPlease use a more specific search term.`, ui.ButtonSet.OK);
    return;
  }

  // Show matches and confirm
  let message = `Found ${matches.length} player(s):\n\n`;
  matches.forEach((p, idx) => {
    message += `${idx + 1}. ${p.name} (${p.position})\n`;
  });
  message += "\nEnter the number to mark as entered NFL:";

  const selectResponse = ui.prompt("Select Player", message, ui.ButtonSet.OK_CANCEL);

  if (selectResponse.getSelectedButton() !== ui.Button.OK) return;

  const selection = parseInt(selectResponse.getResponseText().trim());
  if (isNaN(selection) || selection < 1 || selection > matches.length) {
    ui.alert("Invalid Selection", "Please enter a valid number.", ui.ButtonSet.OK);
    return;
  }

  const selectedPlayer = matches[selection - 1];

  const confirm = ui.alert(
    "Confirm",
    `Mark ${selectedPlayer.name} (${selectedPlayer.position}) as entered NFL?\n\nThis will mark ALL conference copies as entered NFL.`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const result = markPlayerEnteredNFL(selectedPlayer.baseId);
  ui.alert("Complete", result.message, ui.ButtonSet.OK);
}

// ============================================================================
// SHEET HEADERS
// ============================================================================

const DEVY_PLAYER_POOL_HEADERS = [
  "PlayerID",
  "Conference",      // Each conference has its own copy of the player
  "PlayerName",      // MFL format: "LastName, FirstName" (e.g., "Lamb, CeeDee") for lookup
  "FirstName",
  "LastName",
  "Position",
  "Year",
  "Status",          // Available, Drafted, Retained, EnteredNFL
  "Drafted",
  "DraftedBy",
  "DraftYear",
  "RetainedBy",      // FranchiseID if retained
  "RetentionYear"    // Year the player was retained
];

const DEVY_DRAFT_ORDER_HEADERS = [
  "Year",
  "Conference",
  "Round",
  "Pick",
  "OverallPick",
  "FranchiseID",
  "TeamName",
  "PreviousYearStanding"
];

const DEVY_DRAFT_HISTORY_HEADERS = [
  "Year",
  "Conference",
  "Round",
  "Pick",
  "OverallPick",
  "FranchiseID",
  "TeamName",
  "PlayerID",
  "PlayerName",        // MFL format: "LastName, FirstName" for matching with RookieLedger
  "PlayerFirstName",
  "PlayerLastName",
  "PlayerPosition",
  "IsRookie",          // Formula column: TRUE if player found in RookieLedger (no longer a devy)
  "Timestamp"
];

const DEVY_DRAFT_SETTINGS_HEADERS = [
  "SettingKey",
  "SettingValue"
];

const DEVY_RETENTION_HISTORY_HEADERS = [
  "Year",              // The devy draft year this retention counts against
  "Conference",
  "FranchiseID",
  "TeamName",
  "PlayerID",
  "PlayerName",        // MFL format: "LastName, FirstName" for matching with RookieLedger
  "PlayerFirstName",
  "PlayerLastName",
  "PlayerPosition",
  "ConsecutiveYear",   // 1st retention, 2nd retention, etc.
  "PickUsed",          // "Round 1" or "Round 2"
  "BaseRebate",        // Starting rebate (e.g., $20)
  "RebateRemaining",   // BaseRebate - ($5 × (ConsecutiveYear - 1))
  "IsRookie",          // Formula column: TRUE if player found in RookieLedger (no longer a devy)
  "Timestamp",
  "Decision"           // "RETAIN" or "RELEASE" (blank on legacy rows = RETAIN)
];

// ============================================================================
// SHEET MANAGEMENT
// ============================================================================

/**
 * Get or create the DevyPlayerPool sheet
 */
function getDevyPlayerPoolSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("DevyPlayerPool");

  if (!sheet) {
    sheet = ss.insertSheet("DevyPlayerPool");
    sheet.getRange(1, 1, 1, DEVY_PLAYER_POOL_HEADERS.length).setValues([DEVY_PLAYER_POOL_HEADERS]);
    sheet.getRange(1, 1, 1, DEVY_PLAYER_POOL_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Get or create the DevyDraftOrder sheet
 */
function getDevyDraftOrderSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("DevyDraftOrder");

  if (!sheet) {
    sheet = ss.insertSheet("DevyDraftOrder");
    sheet.getRange(1, 1, 1, DEVY_DRAFT_ORDER_HEADERS.length).setValues([DEVY_DRAFT_ORDER_HEADERS]);
    sheet.getRange(1, 1, 1, DEVY_DRAFT_ORDER_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Get or create the DevyDraftHistory sheet
 */
function getDevyDraftHistorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("DevyDraftHistory");

  if (!sheet) {
    sheet = ss.insertSheet("DevyDraftHistory");
    sheet.getRange(1, 1, 1, DEVY_DRAFT_HISTORY_HEADERS.length).setValues([DEVY_DRAFT_HISTORY_HEADERS]);
    sheet.getRange(1, 1, 1, DEVY_DRAFT_HISTORY_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Get or create the DevyDraftSettings sheet
 */
function getDevyDraftSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("DevyDraftSettings");

  if (!sheet) {
    sheet = ss.insertSheet("DevyDraftSettings");
    sheet.getRange(1, 1, 1, DEVY_DRAFT_SETTINGS_HEADERS.length).setValues([DEVY_DRAFT_SETTINGS_HEADERS]);
    sheet.getRange(1, 1, 1, DEVY_DRAFT_SETTINGS_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);

    // Initialize default settings
    const defaultSettings = [
      ["DraftYear", ""],
      ["DraftStatus", "not_started"], // not_started, in_progress, completed
      ["CurrentConference", ""],
      ["CurrentRound", "1"],
      ["CurrentPick", "1"],
      ["PickDeadlineHours", "24"],
      ["CurrentPickDeadline", ""],
      ["TotalRounds", "2"]
    ];
    sheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);
  }

  return sheet;
}

/**
 * Get or create the DevyRetentionHistory sheet
 * Tracks player retentions year-over-year for rebate calculations
 */
function getDevyRetentionHistorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("DevyRetentionHistory");

  if (!sheet) {
    sheet = ss.insertSheet("DevyRetentionHistory");
    sheet.getRange(1, 1, 1, DEVY_RETENTION_HISTORY_HEADERS.length).setValues([DEVY_RETENTION_HISTORY_HEADERS]);
    sheet.getRange(1, 1, 1, DEVY_RETENTION_HISTORY_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Migrate older sheets that predate the "Decision" column (added to the end).
    ensureRetentionHistoryDecisionColumn(sheet);
  }

  return sheet;
}

/**
 * One-time migration: add the "Decision" header to an existing DevyRetentionHistory
 * sheet if it's missing. Appended at the end so existing rows stay aligned; a blank
 * Decision on legacy rows is treated as RETAIN by the counting logic.
 */
function ensureRetentionHistoryDecisionColumn(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf("Decision") === -1) {
    const cell = sheet.getRange(1, lastCol + 1);
    cell.setValue("Decision");
    cell.setFontWeight("bold");
  }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get a setting value from DevyDraftSettings
 */
function getDevyDraftSetting(key) {
  const sheet = getDevyDraftSettingsSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
  }
  return null;
}

/**
 * Set a setting value in DevyDraftSettings
 */
function setDevyDraftSetting(key, value) {
  const sheet = getDevyDraftSettingsSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  // Key not found, add new row
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[key, value]]);
}

/**
 * Get all current draft settings
 */
function getAllDevyDraftSettings() {
  const sheet = getDevyDraftSettingsSheet();
  const data = sheet.getDataRange().getValues();
  const settings = {};

  for (let i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }

  return settings;
}

// ============================================================================
// TEAM LOOKUP HELPERS
// ============================================================================

/**
 * Get team info from the Teams sheet by franchise ID
 * Returns: { franchiseId, teamName, conference, ownerDiscordId, emoji }
 */
function getTeamInfoByFranchiseId(franchiseId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const teamsSheet = ss.getSheetByName("Teams");

  if (!teamsSheet) {
    Logger.log("Teams sheet not found");
    return null;
  }

  const data = teamsSheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const normalizedId = String(franchiseId).padStart(3, "0");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowFranchiseId = String(row[colMap["Franchise ID"]] || "").padStart(3, "0");

    if (rowFranchiseId === normalizedId) {
      return {
        franchiseId: normalizedId,
        teamName: row[colMap["Team Name"]] || "",
        conference: row[colMap["Conference"]] || "",
        ownerDiscordId: String(row[colMap["Owner Discord ID"]] || ""),
        emoji: row[colMap["Emoji"]] || "",
        coachName: row[colMap["Coach Name"]] || ""
      };
    }
  }

  return null;
}

/**
 * Get Discord ID for a franchise
 */
function getDiscordIdForFranchise(franchiseId) {
  const teamInfo = getTeamInfoByFranchiseId(franchiseId);
  return teamInfo ? teamInfo.ownerDiscordId : null;
}

/**
 * Get all unique conferences from the Teams sheet
 * @returns {string[]} Array of conference names
 */
function getAllConferences() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const teamsSheet = ss.getSheetByName("Teams");

  if (!teamsSheet) {
    Logger.log("Teams sheet not found");
    return [];
  }

  const data = teamsSheet.getDataRange().getValues();
  const headers = data[0];
  const confCol = headers.indexOf("Conference");

  if (confCol === -1) {
    Logger.log("Conference column not found in Teams sheet");
    return [];
  }

  const conferences = new Set();
  for (let i = 1; i < data.length; i++) {
    const conf = data[i][confCol];
    if (conf && conf.toString().trim() !== "") {
      conferences.add(conf.toString().trim());
    }
  }

  return Array.from(conferences).sort();
}

// ============================================================================
// DRAFT ORDER - MANUAL INPUT
// ============================================================================
//
// The DevyDraftOrder sheet is MANUALLY populated by the commissioner.
// Fill in the sheet with columns:
//   Year | Conference | Round | Pick | OverallPick | FranchiseID | TeamName | PreviousYearStanding
//
// Example for a 6-team conference with 2 rounds (same order each round):
//   2026, ACC, 1, 1, 1, 001, Team A, 6    (worst team picks first)
//   2026, ACC, 1, 2, 2, 002, Team B, 5
//   ...
//   2026, ACC, 2, 1, 7, 001, Team A, 6    (round 2 same order - worst picks first again)
//   2026, ACC, 2, 2, 8, 002, Team B, 5
//   ...
//
// Once the sheet is populated, use /devy start <conference> to begin the draft.
// ============================================================================

// ============================================================================
// KEEPTRADECUT IMPORT
// ============================================================================

/**
 * Import devy players from KeepTradeCut rankings
 * Fetches the devy rankings page and parses the embedded player data
 * Creates a copy of each player for EACH conference (conference-specific pools)
 *
 * @param {boolean} clearExisting - If true, clears existing undrafted/non-retained players before import
 * @returns {Object} Result with success status and count of imported players
 */
function importFromKeepTradeCut(clearExisting = false) {
  const url = "https://keeptradecut.com/devy-rankings";

  try {
    // Get all conferences from Teams sheet
    const conferences = getAllConferences();
    if (conferences.length === 0) {
      return {
        success: false,
        message: "No conferences found in Teams sheet. Please ensure Teams sheet has Conference column populated."
      };
    }

    // Fetch the page
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (response.getResponseCode() !== 200) {
      return {
        success: false,
        message: `Failed to fetch page: HTTP ${response.getResponseCode()}`
      };
    }

    const html = response.getContentText();

    // Extract the playersArray from the JavaScript
    // Look for pattern: var defined = [...] or playersArray = [...]
    const playerArrayMatch = html.match(/var\s+defined\s*=\s*(\[[\s\S]*?\]);?\s*(?:var|const|let|function|<)/);

    if (!playerArrayMatch) {
      // Try alternative pattern
      const altMatch = html.match(/playersArray\s*=\s*(\[[\s\S]*?\]);/);
      if (!altMatch) {
        return {
          success: false,
          message: "Could not find player data in page. The page structure may have changed."
        };
      }
    }

    // Parse the JSON array
    let playersJson;
    try {
      const jsonStr = playerArrayMatch ? playerArrayMatch[1] : html.match(/playersArray\s*=\s*(\[[\s\S]*?\]);/)[1];
      playersJson = JSON.parse(jsonStr);
    } catch (parseError) {
      return {
        success: false,
        message: `Failed to parse player data: ${parseError.message}`
      };
    }

    if (!Array.isArray(playersJson) || playersJson.length === 0) {
      return {
        success: false,
        message: "No players found in data"
      };
    }

    // Get or create the player pool sheet
    const sheet = getDevyPlayerPoolSheet();

    // Optionally clear existing available players before re-importing.
    if (clearExisting) {
      const existingData = sheet.getDataRange().getValues();
      const headers = existingData[0];
      const statusCol = headers.indexOf("Status");
      const idCol = headers.indexOf("PlayerID");

      // Delete only KTC-sourced AVAILABLE players (whose PlayerID contains "_KTC_").
      // Drafted/Retained are preserved by status, and any manually-added, write-in,
      // backfilled, or reconcile-created players are preserved regardless of status
      // because their IDs are not "_KTC_" (KTC won't re-add them, so they'd be lost).
      for (let i = existingData.length - 1; i >= 1; i--) {
        const status = existingData[i][statusCol];
        const pid = String(existingData[i][idCol] || "");
        const isAvailable = (status === "Available" || status === "" || !status);
        if (isAvailable && pid.indexOf("_KTC_") !== -1) {
          sheet.deleteRow(i + 1);
        }
      }
    }

    // Build set of existing player IDs per conference to avoid duplicates
    // Format: "CONF_PLAYERID"
    const existingKeys = new Set();
    const currentData = sheet.getDataRange().getValues();
    const currentHeaders = currentData[0];
    const playerIdCol = currentHeaders.indexOf("PlayerID");
    const confCol = currentHeaders.indexOf("Conference");

    for (let i = 1; i < currentData.length; i++) {
      const key = `${currentData[i][confCol]}_${currentData[i][playerIdCol]}`;
      existingKeys.add(key);
    }

    // Process and import players - create one copy per conference
    const importedPlayers = [];
    let totalImported = 0;

    for (const player of playersJson) {
      // Extract player info from KTC format
      const playerName = player.playerName || "";
      const nameParts = playerName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Map KTC position IDs to standard positions
      const positionMap = {
        1: "QB",
        2: "RB",
        3: "WR",
        4: "TE",
        5: "K",
        6: "DST"
      };
      const position = positionMap[player.positionID] || player.position || "Unknown";

      // Get draft year (when they'll enter NFL)
      const draftYear = player.draftYear || new Date().getFullYear() + 1;

      // Generate base player ID using KTC's player ID
      const basePlayerId = `KTC_${player.playerID || Date.now()}_${firstName.substring(0,3).toUpperCase()}${lastName.substring(0,3).toUpperCase()}`;

      // Create a copy for EACH conference
      for (const conference of conferences) {
        const conferencePlayerId = `${conference}_${basePlayerId}`;
        const key = `${conference}_${conferencePlayerId}`;

        // Skip if already exists in this conference
        if (existingKeys.has(key)) {
          continue;
        }

        // Add to import list - one row per conference
        // Headers: PlayerID, Conference, PlayerName, FirstName, LastName, Position, Year, Status, Drafted, DraftedBy, DraftYear, RetainedBy, RetentionYear
        // PlayerName is in MFL format: "LastName, FirstName" (e.g., "Lamb, CeeDee")
        const mflPlayerName = `${lastName}, ${firstName}`;
        importedPlayers.push([
          conferencePlayerId,
          conference,
          mflPlayerName,  // MFL format for lookup
          firstName,
          lastName,
          position,
          draftYear,
          "Available",  // Status
          "No",         // Drafted
          "",           // DraftedBy
          "",           // DraftYear
          "",           // RetainedBy
          ""            // RetentionYear
        ]);

        existingKeys.add(key);
        totalImported++;
      }
    }

    // Append all new players at once
    if (importedPlayers.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, importedPlayers.length, DEVY_PLAYER_POOL_HEADERS.length)
        .setValues(importedPlayers);
    }

    return {
      success: true,
      message: `Imported ${playersJson.length} players × ${conferences.length} conferences = ${totalImported} total entries`,
      totalPlayers: playersJson.length,
      conferences: conferences.length,
      imported: totalImported,
      skipped: (playersJson.length * conferences.length) - totalImported
    };

  } catch (error) {
    return {
      success: false,
      message: `Error importing from KeepTradeCut: ${error.message}`,
      error: error.toString()
    };
  }
}

/**
 * Menu function to import from KeepTradeCut (can be added to Google Sheets menu)
 */
function menuImportFromKTC() {
  const result = importFromKeepTradeCut(false);

  if (result.success) {
    SpreadsheetApp.getUi().alert(
      "Import Complete",
      `${result.message}\n\nPlayers on KTC: ${result.totalPlayers}\nConferences: ${result.conferences}\nTotal Entries Created: ${result.imported}\nSkipped (duplicates): ${result.skipped}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      "Import Failed",
      result.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu function to refresh from KeepTradeCut (clears undrafted, re-imports)
 */
function menuRefreshFromKTC() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Refresh Player Pool",
    "This will remove all UNDRAFTED players and re-import from KeepTradeCut.\n\nDrafted players will be preserved.\n\nContinue?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const result = importFromKeepTradeCut(true);

  if (result.success) {
    ui.alert(
      "Refresh Complete",
      `${result.message}\n\nImported: ${result.imported} players`,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      "Refresh Failed",
      result.message,
      ui.ButtonSet.OK
    );
  }
}

// ============================================================================
// PLAYER POOL MANAGEMENT
// ============================================================================

/**
 * Add a player to the devy player pool for all conferences
 * @param {string} firstName - Player's first name
 * @param {string} lastName - Player's last name
 * @param {string} position - Player's position (QB, RB, WR, TE, etc.)
 * @param {number} year - Draft year (when they'll enter NFL)
 * @returns {Object} Result with success status and player IDs
 */
function addDevyPlayer(firstName, lastName, position, year) {
  const sheet = getDevyPlayerPoolSheet();
  const conferences = getAllConferences();

  if (conferences.length === 0) {
    return {
      success: false,
      message: "No conferences found in Teams sheet"
    };
  }

  // Generate base player ID
  const basePlayerId = `DEVY_${year}_${firstName.toUpperCase().substring(0,3)}${lastName.toUpperCase().substring(0,3)}_${Date.now()}`;

  const newRows = [];
  const playerIds = [];

  // Create a copy for each conference
  // PlayerName is in MFL format: "LastName, FirstName" (e.g., "Lamb, CeeDee")
  const mflPlayerName = `${lastName}, ${firstName}`;

  for (const conference of conferences) {
    const conferencePlayerId = `${conference}_${basePlayerId}`;
    playerIds.push(conferencePlayerId);

    // Headers: PlayerID, Conference, PlayerName, FirstName, LastName, Position, Year, Status, Drafted, DraftedBy, DraftYear, RetainedBy, RetentionYear
    newRows.push([
      conferencePlayerId,
      conference,
      mflPlayerName,  // MFL format for lookup
      firstName,
      lastName,
      position,
      year,
      "Available",  // Status
      "No",         // Drafted
      "",           // DraftedBy
      "",           // DraftYear
      "",           // RetainedBy
      ""            // RetentionYear
    ]);
  }

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, DEVY_PLAYER_POOL_HEADERS.length).setValues(newRows);

  return {
    success: true,
    playerIds,
    message: `Added ${firstName} ${lastName} (${position}) to devy pool for ${conferences.length} conferences`
  };
}

/**
 * Menu: add a write-in / manual player to the pool for all conferences.
 * Uses a non-KTC PlayerID (via addDevyPlayer) so a KTC refresh won't erase it.
 */
function menuAddDevyPlayer() {
  const ui = SpreadsheetApp.getUi();

  const fnResp = ui.prompt("Add Player to Pool", "Player first name:", ui.ButtonSet.OK_CANCEL);
  if (fnResp.getSelectedButton() !== ui.Button.OK) return;
  const firstName = fnResp.getResponseText().trim();

  const lnResp = ui.prompt("Add Player to Pool", "Player last name:", ui.ButtonSet.OK_CANCEL);
  if (lnResp.getSelectedButton() !== ui.Button.OK) return;
  const lastName = lnResp.getResponseText().trim();

  const posResp = ui.prompt("Add Player to Pool", "Position (QB / RB / WR / TE):", ui.ButtonSet.OK_CANCEL);
  if (posResp.getSelectedButton() !== ui.Button.OK) return;
  const position = posResp.getResponseText().trim().toUpperCase();

  const yrResp = ui.prompt("Add Player to Pool", "Draft-class year (optional, e.g. 2027):", ui.ButtonSet.OK_CANCEL);
  if (yrResp.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yrResp.getResponseText().trim()) || (new Date().getFullYear() + 1);

  if (!firstName || !lastName || !position) {
    ui.alert("Invalid Input", "First name, last name, and position are all required.", ui.ButtonSet.OK);
    return;
  }

  const result = addDevyPlayer(firstName, lastName, position, year);
  ui.alert(result.success ? "Player Added" : "Error", result.message, ui.ButtonSet.OK);
}

/**
 * Get available players from the pool for a specific conference
 * Available means: Status is "Available" AND Drafted is "No"
 * @param {string} conference - Conference code (e.g., "ACC", "B10", "SEC")
 * @returns {Array} Array of available player objects
 */
function getAvailableDevyPlayers(conference) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const players = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowConference = row[colMap["Conference"]];
    const status = row[colMap["Status"]] || "Available";
    const drafted = row[colMap["Drafted"]];

    // Filter by conference if provided, and only include available, undrafted players
    const matchesConference = !conference || rowConference === conference;
    const isAvailable = (status === "Available" || status === "Retained") && drafted !== "Yes";

    if (matchesConference && isAvailable) {
      players.push({
        playerId: row[colMap["PlayerID"]],
        conference: rowConference,
        playerName: row[colMap["PlayerName"]],  // MFL format: "LastName, FirstName"
        firstName: row[colMap["FirstName"]],
        lastName: row[colMap["LastName"]],
        position: row[colMap["Position"]],
        year: row[colMap["Year"]],
        status: status,
        retainedBy: row[colMap["RetainedBy"]] || null,
        retentionYear: row[colMap["RetentionYear"]] || null
      });
    }
  }

  return players;
}

/**
 * Search available players by name or position within a conference
 * @param {string} searchTerm - Search term (name or position)
 * @param {string} conference - Optional conference code to filter by
 * @returns {Array} Array of matching player objects
 */
function searchDevyPlayers(searchTerm, conference) {
  const players = getAvailableDevyPlayers(conference);
  const term = searchTerm.toLowerCase();

  return players.filter(p =>
    p.firstName.toLowerCase().includes(term) ||
    p.lastName.toLowerCase().includes(term) ||
    p.position.toLowerCase().includes(term) ||
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(term)
  );
}

/**
 * Mark a player as drafted in a specific conference
 * Only marks the conference-specific copy, other conferences still have their copy available
 * @param {string} playerId - The conference-specific player ID
 * @param {string} franchiseId - The franchise that drafted the player
 * @param {number} draftYear - The year the player was drafted
 * @returns {boolean} True if player was found and marked
 */
function markPlayerDrafted(playerId, franchiseId, draftYear) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap["PlayerID"]] === playerId) {
      sheet.getRange(i + 1, colMap["Status"] + 1).setValue("Drafted");
      sheet.getRange(i + 1, colMap["Drafted"] + 1).setValue("Yes");
      sheet.getRange(i + 1, colMap["DraftedBy"] + 1).setValue(franchiseId);
      sheet.getRange(i + 1, colMap["DraftYear"] + 1).setValue(draftYear);
      return true;
    }
  }

  return false;
}

/**
 * Retain a player for a franchise (keeps them on the team's devy roster)
 * Retained players stay on the team until they enter the NFL
 * @param {string} playerId - The conference-specific player ID
 * @param {string} franchiseId - The franchise retaining the player
 * @param {number} retentionYear - The year of retention
 * @returns {Object} Result with success status
 */
function retainDevyPlayer(playerId, franchiseId, retentionYear) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap["PlayerID"]] === playerId) {
      const playerName = `${data[i][colMap["FirstName"]]} ${data[i][colMap["LastName"]]}`;

      // Enforce the 2-per-team-per-year cap BEFORE flipping the pool status.
      const counts = getDevyRetentionCounts(playerId, franchiseId, retentionYear);
      if (counts.teamRetentionsThisYear >= 2) {
        return {
          success: false,
          message: `Retention limit reached: a team may retain at most 2 players per year (${retentionYear}).`
        };
      }

      sheet.getRange(i + 1, colMap["Status"] + 1).setValue("Retained");
      sheet.getRange(i + 1, colMap["RetainedBy"] + 1).setValue(franchiseId);
      sheet.getRange(i + 1, colMap["RetentionYear"] + 1).setValue(retentionYear);

      // Log the retention to DevyRetentionHistory (rebate ledger). Wrapped so a
      // logging failure never blocks the retention itself, which already succeeded.
      try {
        appendDevyRetentionRecord({
          playerId: playerId,
          conference: data[i][colMap["Conference"]],
          franchiseId: franchiseId,
          firstName: data[i][colMap["FirstName"]],
          lastName: data[i][colMap["LastName"]],
          position: data[i][colMap["Position"]],
          retentionYear: retentionYear,
          decision: "RETAIN"
        });
      } catch (e) {
        Logger.log(`Failed to log devy retention for ${playerId}: ${e}`);
      }

      return {
        success: true,
        message: `${playerName} retained by franchise ${franchiseId} for ${retentionYear}`
      };
    }
  }

  return {
    success: false,
    message: "Player not found"
  };
}

/**
 * Count existing RETAIN rows in DevyRetentionHistory. A blank Decision on legacy
 * rows is treated as RETAIN for back-compat.
 * @returns {Object} { playerPriorRetentions, teamRetentionsThisYear }
 */
function getDevyRetentionCounts(playerId, franchiseId, year) {
  const sheet = getDevyRetentionHistorySheet();
  const data = sheet.getDataRange().getValues();
  const colMap = {};
  data[0].forEach((h, i) => colMap[h] = i);

  const normFid = String(franchiseId).padStart(3, "0");
  let playerPriorRetentions = 0;
  let teamRetentionsThisYear = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // colMap["Decision"] may be undefined on a not-yet-migrated read; blank = RETAIN
    const decisionRaw = colMap["Decision"] !== undefined ? row[colMap["Decision"]] : "";
    const isRetain = String(decisionRaw || "RETAIN").toUpperCase() === "RETAIN";
    if (!isRetain) continue;

    if (row[colMap["PlayerID"]] === playerId) {
      playerPriorRetentions++;
    }
    if (String(row[colMap["FranchiseID"]]).padStart(3, "0") === normFid &&
        Number(row[colMap["Year"]]) === Number(year)) {
      teamRetentionsThisYear++;
    }
  }

  return { playerPriorRetentions, teamRetentionsThisYear };
}

/**
 * Append one row to DevyRetentionHistory for a retention decision.
 * Centralizes field order + rebate math so live rows match the backfill importer
 * (BackfillDevyHistory.gs): BaseRebate $20, decreasing $5 per consecutive retention
 * year, floored at 0. The first retention a team makes in a year spends Round 2, the
 * second spends Round 1 (max 2 per team per year).
 *
 * @param {Object} info - { playerId, conference, franchiseId, firstName, lastName,
 *                          position, retentionYear, decision }
 *                          decision defaults to "RETAIN"; "RELEASE" writes a decision-only row.
 * @returns {number} The ConsecutiveYear recorded (0 for RELEASE rows)
 */
function appendDevyRetentionRecord(info) {
  const sheet = getDevyRetentionHistorySheet();
  const decision = (info.decision || "RETAIN").toUpperCase();

  const data = sheet.getDataRange().getValues();
  const colMap = {};
  data[0].forEach((h, i) => colMap[h] = i);

  const teamInfo = getTeamInfoByFranchiseId(info.franchiseId);
  const teamName = teamInfo ? teamInfo.teamName : "";
  const playerNameMFL = `${info.lastName}, ${info.firstName}`;

  let consecutiveYear = "";
  let pickUsed = "";
  let baseRebate = "";
  let rebateRemaining = "";

  if (decision === "RETAIN") {
    const counts = getDevyRetentionCounts(info.playerId, info.franchiseId, info.retentionYear);
    consecutiveYear = counts.playerPriorRetentions + 1;
    // 1st retention of the year -> Round 2, 2nd -> Round 1
    pickUsed = counts.teamRetentionsThisYear === 0 ? "Round 2" : "Round 1";
    baseRebate = 20;
    rebateRemaining = Math.max(0, baseRebate - 5 * (consecutiveYear - 1));
  } else if (decision === "PENDING") {
    // Preview the rebate on the seeded worklist row (PickUsed decided at retain time).
    const counts = getDevyRetentionCounts(info.playerId, info.franchiseId, info.retentionYear);
    consecutiveYear = counts.playerPriorRetentions + 1;
    baseRebate = 20;
    rebateRemaining = Math.max(0, baseRebate - 5 * (consecutiveYear - 1));
  }

  // Order must match DEVY_RETENTION_HISTORY_HEADERS
  const row = [
    info.retentionYear,   // Year
    info.conference,
    info.franchiseId,
    teamName,
    info.playerId,
    playerNameMFL,        // MFL format for matching with RookieLedger
    info.firstName,
    info.lastName,
    info.position,
    consecutiveYear,
    pickUsed,
    baseRebate,
    rebateRemaining,
    "",                   // IsRookie - populated by IMPORTRANGE formula
    new Date().toISOString(),
    decision
  ];

  // Upsert: one row per (PlayerID, Year). Update the existing worklist row (e.g. a
  // PENDING row seeded by the retention window) in place; otherwise append.
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap["PlayerID"]] === info.playerId &&
        Number(data[i][colMap["Year"]]) === Number(info.retentionYear)) {
      targetRow = i + 1; // 1-based sheet row
      break;
    }
  }
  if (targetRow === -1) targetRow = sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, DEVY_RETENTION_HISTORY_HEADERS.length).setValues([row]);

  return decision === "RETAIN" ? consecutiveYear : 0;
}

/**
 * Mark a player as entered NFL (removes them from the devy pool)
 * This should be called when a player declares for or is drafted into the NFL
 * @param {string} basePlayerId - The base player ID (without conference prefix)
 * @returns {Object} Result with success status
 */
function markPlayerEnteredNFL(basePlayerId) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  let updated = 0;

  // Mark all conference copies of this player as entered NFL
  for (let i = 1; i < data.length; i++) {
    const playerId = data[i][colMap["PlayerID"]] || "";
    // Check if this row's player ID ends with the base player ID
    if (playerId.includes(basePlayerId) || playerId === basePlayerId) {
      sheet.getRange(i + 1, colMap["Status"] + 1).setValue("EnteredNFL");
      updated++;
    }
  }

  return {
    success: updated > 0,
    message: updated > 0 ? `Marked ${updated} conference entries as entered NFL` : "Player not found",
    updated
  };
}

/**
 * Normalize a player name for matching across sheets (RookieLedger, pool, history).
 * Lowercases, drops commas/periods, strips Jr/Sr/II-V suffixes, collapses spaces.
 * Works for MFL "Last, First" format on both sides.
 */
function normalizeDevyName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a position for cross-sheet matching. Uppercases/trims and canonicalizes
 * the few KTC-vs-MFL variants (PK->K, DEF/D->DST). Devy players are overwhelmingly
 * QB/RB/WR/TE, which already align between sources.
 */
function normalizeDevyPosition(pos) {
  const p = String(pos || "").toUpperCase().trim();
  if (p === "PK") return "K";
  if (p === "DEF" || p === "D") return "DST";
  return p;
}

/**
 * Order-agnostic name key for joining across sheets whose PlayerIDs don't line up
 * (KTC-based pool vs backfilled/manually-logged history). Normalizes, splits to
 * tokens, sorts, and rejoins so "Smith, Jeremiah" and "Jeremiah Smith" match.
 */
function devyNameKey(name) {
  return normalizeDevyName(name).split(" ").filter(Boolean).sort().join(" ");
}

/**
 * Read the native RookieLedger tab and return an index of normalized name ->
 * Set of normalized positions (from the "Name" and "Position" columns). Single
 * source of truth for "who is in the RookieLedger" — used by both the graduation
 * sweep and the IsRookie flags. Position lets us disambiguate same-name players.
 *
 * @returns {Object} { ok, index?: Map<string, Set<string>>, message?: string }
 */
function getRookieLedgerIndex() {
  const ledger = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("RookieLedger");
  if (!ledger) {
    return { ok: false, message: "RookieLedger tab not found." };
  }

  const ledgerData = ledger.getDataRange().getValues();
  const lc = {};
  ledgerData[0].forEach((h, i) => lc[String(h).trim()] = i);
  if (lc["Name"] === undefined) {
    return { ok: false, message: "RookieLedger is missing a 'Name' column." };
  }
  const posIdx = lc["Position"];

  const index = new Map();
  for (let i = 1; i < ledgerData.length; i++) {
    const n = normalizeDevyName(ledgerData[i][lc["Name"]]);
    if (!n) continue;
    if (!index.has(n)) index.set(n, new Set());
    const pos = posIdx !== undefined ? normalizeDevyPosition(ledgerData[i][posIdx]) : "";
    if (pos) index.get(n).add(pos);
  }
  return { ok: true, index };
}

/**
 * Does a player (name + position) appear in the RookieLedger index? Requires a name
 * match; also requires a position match when both sides have a position on record,
 * so same-name players at different positions don't collide. Falls back to name-only
 * when either side lacks position info.
 */
function isInRookieLedger(index, name, position) {
  const n = normalizeDevyName(name);
  if (!n) return false;
  const positions = index.get(n);
  if (!positions) return false;
  const normPos = normalizeDevyPosition(position);
  if (positions.size === 0 || !normPos) return true;
  return positions.has(normPos);
}

/**
 * Graduation sweep: mark every owned devy copy whose PlayerName appears in the
 * RookieLedger (they were drafted into the NFL) as EnteredNFL, and refresh the
 * IsRookie audit flags on DevyDraftHistory/DevyRetentionHistory in the same pass.
 * Run at auction / season start, BEFORE reconcileDevyPoolFromLedger. Matches by
 * normalized name (RookieLedger.Name and pool.PlayerName are both MFL "Last, First").
 *
 * @returns {Object} Result with counts
 */
function sweepGraduatedDevyPlayers() {
  const ledgerResult = getRookieLedgerIndex();
  if (!ledgerResult.ok) {
    return { success: false, message: ledgerResult.message };
  }
  const rookieIndex = ledgerResult.index;

  const poolSheet = getDevyPlayerPoolSheet();
  const data = poolSheet.getDataRange().getValues();
  const pc = {};
  data[0].forEach((h, i) => pc[h] = i);
  if (pc["Status"] === undefined || pc["PlayerName"] === undefined) {
    return { success: false, message: "DevyPlayerPool is missing 'Status' or 'PlayerName'. Rebuild the pool first." };
  }

  let copiesMarked = 0;
  const gradedPlayers = new Set();
  const statusValues = [];
  for (let i = 1; i < data.length; i++) {
    let status = data[i][pc["Status"]];
    if (status !== "EnteredNFL" &&
        isInRookieLedger(rookieIndex, data[i][pc["PlayerName"]], data[i][pc["Position"]])) {
      status = "EnteredNFL";
      copiesMarked++;
      gradedPlayers.add(normalizeDevyName(data[i][pc["PlayerName"]]));
    }
    statusValues.push([status]);
  }

  if (statusValues.length > 0) {
    poolSheet.getRange(2, pc["Status"] + 1, statusValues.length, 1).setValues(statusValues);
  }

  // The same RookieLedger index also refreshes the IsRookie audit flags on the
  // history sheets, so one sweep keeps pool status and history flags in sync.
  const draftFlags = applyIsRookieFlagsToSheet(getDevyDraftHistorySheet(), rookieIndex);
  const retentionFlags = applyIsRookieFlagsToSheet(getDevyRetentionHistorySheet(), rookieIndex);

  return {
    success: true,
    message: `Graduation sweep: ${gradedPlayers.size} player(s) matched RookieLedger; ${copiesMarked} pool copies marked EnteredNFL. ` +
      `IsRookie flags refreshed (${draftFlags.trueCount} draft-history, ${retentionFlags.trueCount} retention-history rows TRUE).`,
    playersGraduated: gradedPlayers.size,
    copiesMarked,
    isRookieFlagged: draftFlags.trueCount + retentionFlags.trueCount
  };
}

/**
 * Menu: run the NFL graduation sweep
 */
function menuSweepGraduatedDevyPlayers() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Sweep NFL Graduates",
    "Mark every owned devy whose name is in the RookieLedger as EnteredNFL, and refresh the IsRookie flags on the history sheets?\n\nRun this at auction / season start, before reconciling the pool.",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  const r = sweepGraduatedDevyPlayers();
  ui.alert("Graduation Sweep", r.message, ui.ButtonSet.OK);
}

/**
 * Reconcile the pool from the ledger (the "replay"). For each copy, replay its
 * DevyDraftHistory picks + DevyRetentionHistory decisions in time order and let the
 * last event win, writing Status/Drafted/DraftedBy/DraftYear/RetainedBy/RetentionYear
 * back into DevyPlayerPool. EnteredNFL copies are left untouched (they've left the
 * system), so run sweepGraduatedDevyPlayers() first.
 *
 * Within a year, retention decisions precede that year's draft (phase 0 before 1).
 *
 * @returns {Object} Result with counts
 */
function reconcileDevyPoolFromLedger() {
  const poolSheet = getDevyPlayerPoolSheet();
  const data = poolSheet.getDataRange().getValues();
  const pc = {};
  data[0].forEach((h, i) => pc[h] = i);
  const cols = ["Status", "Drafted", "DraftedBy", "DraftYear", "RetainedBy", "RetentionYear"];
  for (const c of cols.concat(["Conference", "PlayerName"])) {
    if (pc[c] === undefined) {
      return { success: false, message: `DevyPlayerPool is missing the '${c}' column. Rebuild the pool first.` };
    }
  }

  // Join on BOTH exact PlayerID and CONFERENCE|nameKey. PlayerIDs differ between the
  // KTC pool and backfilled/manually-logged history, and the history names can be
  // unreliable too, so a history row matches a pool copy if EITHER key lines up.
  // Events dedup by row uid so a row reachable by both keys is only counted once.
  const byId = {};
  const byNc = {};
  const allEvents = [];
  const ncKeyFor = (conf, name) => {
    const nk = devyNameKey(name);
    return nk ? `${String(conf).toUpperCase()}|${nk}` : null;
  };
  const indexRow = (pid, conf, name, ident, ev) => {
    ev.ncKey = ncKeyFor(conf, name);
    ev.ident = ident;
    allEvents.push(ev);
    if (pid) (byId[pid] = byId[pid] || []).push(ev);
    if (ev.ncKey) (byNc[ev.ncKey] = byNc[ev.ncKey] || []).push(ev);
  };

  const histData = getDevyDraftHistorySheet().getDataRange().getValues();
  const hc = {};
  histData[0].forEach((h, i) => hc[h] = i);
  for (let i = 1; i < histData.length; i++) {
    const fn = histData[i][hc["PlayerFirstName"]];
    const ln = histData[i][hc["PlayerLastName"]];
    const name = histData[i][hc["PlayerName"]] || `${ln}, ${fn}`;
    const conf = histData[i][hc["Conference"]];
    indexRow(histData[i][hc["PlayerID"]], conf, name,
      { conference: conf, playerId: histData[i][hc["PlayerID"]], playerName: name, firstName: fn, lastName: ln, position: histData[i][hc["PlayerPosition"]] },
      { uid: "H" + i, year: Number(histData[i][hc["Year"]]), phase: 1, type: "DRAFT", franchise: String(histData[i][hc["FranchiseID"]]).padStart(3, "0") });
  }

  const retData = getDevyRetentionHistorySheet().getDataRange().getValues();
  const rc = {};
  retData[0].forEach((h, i) => rc[h] = i);
  for (let i = 1; i < retData.length; i++) {
    const decision = String(retData[i][rc["Decision"]] || "RETAIN").toUpperCase();
    if (decision === "PENDING") continue; // not a decision yet - ignore for status
    const fn = retData[i][rc["PlayerFirstName"]];
    const ln = retData[i][rc["PlayerLastName"]];
    const name = retData[i][rc["PlayerName"]] || `${ln}, ${fn}`;
    const conf = retData[i][rc["Conference"]];
    // Within a year: RELEASE precedes a possible re-draft (phase 0); a RETAIN must beat
    // its own same-year draft-slot entry, so it sorts AFTER draft (phase 2 > draft's 1).
    const phase = decision === "RELEASE" ? 0 : 2;
    indexRow(retData[i][rc["PlayerID"]], conf, name,
      { conference: conf, playerId: retData[i][rc["PlayerID"]], playerName: name, firstName: fn, lastName: ln, position: retData[i][rc["PlayerPosition"]] },
      { uid: "R" + i, year: Number(retData[i][rc["Year"]]), phase: phase, type: decision, franchise: String(retData[i][rc["FranchiseID"]]).padStart(3, "0") });
  }

  // Last-event-wins status from a chronologically sorted event list.
  const computeStatus = (evs) => {
    let status = "Available", drafted = "No", draftedBy = "", draftYear = "", retainedBy = "", retentionYear = "";
    let lastDraft = null;
    evs.forEach(e => { if (e.type === "DRAFT") lastDraft = e; });
    const last = evs.length ? evs[evs.length - 1] : null;
    if (last) {
      if (last.type === "DRAFT") {
        status = "Drafted"; drafted = "Yes"; draftedBy = last.franchise; draftYear = last.year;
      } else if (last.type === "RETAIN") {
        status = "Retained"; drafted = "Yes";
        draftedBy = lastDraft ? lastDraft.franchise : last.franchise;
        draftYear = lastDraft ? lastDraft.year : "";
        retainedBy = last.franchise; retentionYear = last.year;
      } // RELEASE (or anything else) -> stays Available with cleared ownership
    }
    return { status, drafted, draftedBy, draftYear, retainedBy, retentionYear };
  };

  const consumed = new Set();
  const out = {};
  cols.forEach(c => out[c] = []);
  let reconciled = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const poolName = row[pc["PlayerName"]] || `${row[pc["LastName"]]}, ${row[pc["FirstName"]]}`;
    const ncKey = ncKeyFor(row[pc["Conference"]], poolName);
    const seen = new Set();
    const evs = [];
    [byId[row[pc["PlayerID"]]], byNc[ncKey]].forEach(arr => {
      (arr || []).forEach(ev => { if (!seen.has(ev.uid)) { seen.add(ev.uid); evs.push(ev); } });
    });
    evs.forEach(e => consumed.add(e.uid)); // consume even for EnteredNFL, so we don't recreate

    // Preserve graduated players - they've left the devy system.
    if (row[pc["Status"]] === "EnteredNFL") {
      cols.forEach(c => out[c].push([row[pc[c]]]));
      continue;
    }

    evs.sort((a, b) => (a.year - b.year) || (a.phase - b.phase));
    if (evs.length) reconciled++;
    const s = computeStatus(evs);
    cols.forEach(c => out[c].push([s[c.charAt(0).toLowerCase() + c.slice(1)]]));
  }

  const numRows = data.length - 1;
  if (numRows > 0) {
    cols.forEach(c => poolSheet.getRange(2, pc[c] + 1, numRows, 1).setValues(out[c]));
  }

  // Append pool copies for OWNED ledger players who have no pool row (write-ins,
  // backfilled historical players). Group unconsumed events by conference+name.
  // New rows get non-KTC IDs so a KTC refresh won't erase them. Skip anyone already
  // in the RookieLedger so we don't resurrect a graduated player.
  const rl = getRookieLedgerIndex();
  const rookieIndex = rl.ok ? rl.index : null;

  const leftover = {};
  allEvents.forEach(e => {
    if (consumed.has(e.uid) || !e.ncKey) return;
    (leftover[e.ncKey] = leftover[e.ncKey] || []).push(e);
  });

  const newRows = [];
  Object.keys(leftover).forEach(ncKey => {
    const evs = leftover[ncKey].slice().sort((a, b) => (a.year - b.year) || (a.phase - b.phase));
    const s = computeStatus(evs);
    if (s.status !== "Drafted" && s.status !== "Retained") return; // only owned players need a copy
    const id = leftover[ncKey][0].ident;
    if (rookieIndex && isInRookieLedger(rookieIndex, id.playerName, id.position)) return; // graduated
    const fallbackId = `${String(id.conference).toUpperCase()}_LEDGER_${devyNameKey(id.playerName).replace(/\s+/g, "").toUpperCase()}`;
    // Order must match DEVY_PLAYER_POOL_HEADERS
    newRows.push([
      id.playerId || fallbackId,
      id.conference,
      id.playerName,
      id.firstName,
      id.lastName,
      id.position,
      "",             // Year (draft-class year unknown for a historical add)
      s.status,
      s.drafted,
      s.draftedBy,
      s.draftYear,
      s.retainedBy,
      s.retentionYear
    ]);
  });

  let added = 0;
  if (newRows.length > 0) {
    const lastRow = poolSheet.getLastRow();
    poolSheet.getRange(lastRow + 1, 1, newRows.length, DEVY_PLAYER_POOL_HEADERS.length).setValues(newRows);
    added = newRows.length;
  }

  return {
    success: true,
    message: `Reconciled ${reconciled} existing copies; added ${added} owned player(s) that were missing from the pool.`,
    reconciled,
    added,
    totalRows: numRows
  };
}

/**
 * Menu: reconcile the pool from history
 */
function menuReconcileDevyPool() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Reconcile Pool from History",
    "Rebuild each player's Status/ownership from DevyDraftHistory + DevyRetentionHistory?\n\nRun the NFL graduate sweep first.",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  const r = reconcileDevyPoolFromLedger();
  ui.alert("Reconcile Pool", r.message, ui.ButtonSet.OK);
}

/**
 * Diagnostic: trace a player by name across DevyPlayerPool, DevyDraftHistory, and
 * DevyRetentionHistory. Name-matched (order-agnostic) so it surfaces PlayerID
 * mismatches between the pool and the ledger — the usual cause of a reconcile that
 * doesn't line up. Read-only.
 *
 * @param {string} searchTerm - Player name (any order, e.g. "Jeremiah Smith")
 * @returns {string} A human-readable trace
 */
function traceDevyPlayer(searchTerm) {
  const tokens = normalizeDevyName(searchTerm).split(" ").filter(Boolean);
  if (tokens.length === 0) return "Enter a player name.";
  const matches = (nm) => {
    const norm = normalizeDevyName(nm);
    return tokens.every(t => norm.indexOf(t) !== -1);
  };

  const lines = [];

  // Pool copies
  const pool = getDevyPlayerPoolSheet().getDataRange().getValues();
  const pc = {}; pool[0].forEach((h, i) => pc[h] = i);
  lines.push("=== DevyPlayerPool ===");
  let poolHits = 0;
  for (let i = 1; i < pool.length; i++) {
    const r = pool[i];
    const nm = r[pc["PlayerName"]] || `${r[pc["LastName"]]}, ${r[pc["FirstName"]]}`;
    if (!matches(nm)) continue;
    poolHits++;
    lines.push(`${r[pc["Conference"]]} | id=${r[pc["PlayerID"]]} | Status=${r[pc["Status"]]} | Drafted=${r[pc["Drafted"]]} | DraftedBy=${r[pc["DraftedBy"]]} | RetainedBy=${r[pc["RetainedBy"]]} | RetYr=${r[pc["RetentionYear"]]}`);
  }
  if (!poolHits) lines.push("(no pool copies matched)");

  // Draft history
  const hist = getDevyDraftHistorySheet().getDataRange().getValues();
  const hc = {}; hist[0].forEach((h, i) => hc[h] = i);
  lines.push("", "=== DevyDraftHistory ===");
  let histHits = 0;
  for (let i = 1; i < hist.length; i++) {
    const r = hist[i];
    const nm = r[hc["PlayerName"]] || `${r[hc["PlayerLastName"]]}, ${r[hc["PlayerFirstName"]]}`;
    if (!matches(nm)) continue;
    histHits++;
    lines.push(`${r[hc["Year"]]} ${r[hc["Conference"]]} R${r[hc["Round"]]}.${r[hc["Pick"]]} | id=${r[hc["PlayerID"]]} | Fran=${r[hc["FranchiseID"]]}`);
  }
  if (!histHits) lines.push("(no draft-history rows matched)");

  // Retention history
  const ret = getDevyRetentionHistorySheet().getDataRange().getValues();
  const rcc = {}; ret[0].forEach((h, i) => rcc[h] = i);
  lines.push("", "=== DevyRetentionHistory ===");
  let retHits = 0;
  for (let i = 1; i < ret.length; i++) {
    const r = ret[i];
    const nm = r[rcc["PlayerName"]] || `${r[rcc["PlayerLastName"]]}, ${r[rcc["PlayerFirstName"]]}`;
    if (!matches(nm)) continue;
    retHits++;
    lines.push(`${r[rcc["Year"]]} ${r[rcc["Conference"]]} | id=${r[rcc["PlayerID"]]} | Fran=${r[rcc["FranchiseID"]]} | ${String(r[rcc["Decision"]] || "RETAIN")}`);
  }
  if (!retHits) lines.push("(no retention-history rows matched)");

  lines.push("", "TIP: the pool 'id' must exactly equal the DevyDraftHistory 'id' for reconcile to mark that copy Drafted.");
  return lines.join("\n");
}

/**
 * Menu: trace a player across the pool + history sheets
 */
function menuTraceDevyPlayer() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    "Trace Devy Player",
    "Enter a player name to trace across DevyPlayerPool + history (any name order):",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const term = resp.getResponseText().trim();
  if (!term) return;
  const trace = traceDevyPlayer(term);
  Logger.log(trace);
  ui.alert("Player Trace", trace, ui.ButtonSet.OK);
}

/**
 * Release a retained player back to available status
 * @param {string} playerId - The conference-specific player ID
 * @returns {Object} Result with success status
 */
function releaseRetainedPlayer(playerId, decisionYear) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap["PlayerID"]] === playerId) {
      const status = data[i][colMap["Status"]];

      // "Release" = the owner is not keeping this player. Only owned players
      // (Drafted or Retained) can be released back to the pool.
      if (status !== "Retained" && status !== "Drafted") {
        return {
          success: false,
          message: "Player is not currently owned (must be Drafted or Retained to release)"
        };
      }

      const playerName = `${data[i][colMap["FirstName"]]} ${data[i][colMap["LastName"]]}`;
      const franchiseId = String(
        data[i][colMap["RetainedBy"]] || data[i][colMap["DraftedBy"]] || ""
      ).padStart(3, "0");

      // Return the pool copy to the available pool for the coming draft.
      sheet.getRange(i + 1, colMap["Status"] + 1).setValue("Available");
      sheet.getRange(i + 1, colMap["RetainedBy"] + 1).setValue("");
      sheet.getRange(i + 1, colMap["RetentionYear"] + 1).setValue("");
      sheet.getRange(i + 1, colMap["Drafted"] + 1).setValue("No");
      sheet.getRange(i + 1, colMap["DraftedBy"] + 1).setValue("");
      sheet.getRange(i + 1, colMap["DraftYear"] + 1).setValue("");

      // Log the RELEASE decision (audit). Wrapped so it never blocks the release.
      const year = decisionYear || getDevyDraftSetting("DraftYear");
      try {
        appendDevyRetentionRecord({
          playerId: playerId,
          conference: data[i][colMap["Conference"]],
          franchiseId: franchiseId,
          firstName: data[i][colMap["FirstName"]],
          lastName: data[i][colMap["LastName"]],
          position: data[i][colMap["Position"]],
          retentionYear: year,
          decision: "RELEASE"
        });
      } catch (e) {
        Logger.log(`Failed to log devy release for ${playerId}: ${e}`);
      }

      return {
        success: true,
        message: `${playerName} released back to available pool`
      };
    }
  }

  return {
    success: false,
    message: "Player not found"
  };
}

/**
 * Get all retained players for a franchise in a conference
 * @param {string} franchiseId - The franchise ID
 * @param {string} conference - The conference code
 * @returns {Array} Array of retained player objects
 */
function getRetainedPlayers(franchiseId, conference) {
  const sheet = getDevyPlayerPoolSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const normalizedFranchiseId = String(franchiseId).padStart(3, "0");
  const players = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowConference = row[colMap["Conference"]];
    const status = row[colMap["Status"]];
    const retainedBy = String(row[colMap["RetainedBy"]] || "").padStart(3, "0");

    if (status === "Retained" && retainedBy === normalizedFranchiseId) {
      // Filter by conference if provided
      if (!conference || rowConference === conference) {
        players.push({
          playerId: row[colMap["PlayerID"]],
          conference: rowConference,
          playerName: row[colMap["PlayerName"]],  // MFL format: "LastName, FirstName"
          firstName: row[colMap["FirstName"]],
          lastName: row[colMap["LastName"]],
          position: row[colMap["Position"]],
          year: row[colMap["Year"]],
          retentionYear: row[colMap["RetentionYear"]]
        });
      }
    }
  }

  return players;
}

// ============================================================================
// DRAFT EXECUTION
// ============================================================================

/**
 * Start the devy draft for a specific conference
 */
function startDevyDraft(conference) {
  const settings = getAllDevyDraftSettings();
  const draftYear = settings["DraftYear"];

  if (!draftYear) {
    throw new Error("Draft order has not been generated. Please run generateDevyDraftOrder first.");
  }

  // Verify conference exists in draft order
  const orderSheet = getDevyDraftOrderSheet();
  const orderData = orderSheet.getDataRange().getValues();
  const headers = orderData[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const conferencePicks = orderData.slice(1).filter(row =>
    row[colMap["Year"]] === Number(draftYear) &&
    row[colMap["Conference"]] === conference
  ).sort((a, b) => a[colMap["OverallPick"]] - b[colMap["OverallPick"]]);

  if (conferencePicks.length === 0) {
    throw new Error(`Conference '${conference}' not found in draft order for ${draftYear}`);
  }

  // Find the first slot NOT already consumed by a retention (or prior pick).
  const filled = getFilledSlotSet(Number(draftYear), conference);
  const firstOpen = conferencePicks.find(row =>
    !filled.has(`${row[colMap["Round"]]}-${row[colMap["Pick"]]}`)
  );

  if (!firstOpen) {
    // Every slot is already filled (e.g., all retentions) - nothing to draft.
    setDevyDraftSetting("DraftStatus", "completed");
    setDevyDraftSetting("CurrentConference", conference);
    setDevyDraftSetting("CurrentPickDeadline", "");
    return {
      success: true,
      draftComplete: true,
      message: `All picks for ${conference} are already filled by retentions`,
      draftYear,
      conference
    };
  }

  // Set draft in progress at the first open slot
  setDevyDraftSetting("DraftStatus", "in_progress");
  setDevyDraftSetting("CurrentConference", conference);
  setDevyDraftSetting("CurrentRound", String(firstOpen[colMap["Round"]]));
  setDevyDraftSetting("CurrentPick", String(firstOpen[colMap["Pick"]]));

  // Set initial pick deadline
  const deadlineHours = parseInt(settings["PickDeadlineHours"]) || 24;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + deadlineHours);
  setDevyDraftSetting("CurrentPickDeadline", deadline.toISOString());

  return {
    success: true,
    message: `Devy draft started for ${conference}`,
    draftYear,
    conference,
    pickDeadline: deadline.toISOString()
  };
}

/**
 * Build a Set of "round-pick" slot keys that are already filled in DevyDraftHistory
 * for a given year/conference. A slot is "consumed" if a history row exists for it —
 * whether from a retention pre-fill or an already-made live pick.
 */
function getFilledSlotSet(year, conference) {
  const sheet = getDevyDraftHistorySheet();
  const data = sheet.getDataRange().getValues();
  const colMap = {};
  data[0].forEach((h, i) => colMap[h] = i);

  const filled = new Set();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (Number(row[colMap["Year"]]) === Number(year) &&
        row[colMap["Conference"]] === conference) {
      filled.add(`${row[colMap["Round"]]}-${row[colMap["Pick"]]}`);
    }
  }
  return filled;
}

/**
 * Get current pick information for a conference
 */
function getCurrentDevyPick(conference) {
  const settings = getAllDevyDraftSettings();

  if (settings["DraftStatus"] !== "in_progress") {
    return {
      success: false,
      message: "Draft is not in progress"
    };
  }

  if (settings["CurrentConference"] !== conference) {
    return {
      success: false,
      message: `Draft is currently running for ${settings["CurrentConference"]}, not ${conference}`
    };
  }

  const draftYear = Number(settings["DraftYear"]);
  const currentRound = Number(settings["CurrentRound"]);
  const currentPick = Number(settings["CurrentPick"]);

  // Get the team on the clock
  const orderSheet = getDevyDraftOrderSheet();
  const orderData = orderSheet.getDataRange().getValues();
  const headers = orderData[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  let onTheClock = null;

  for (let i = 1; i < orderData.length; i++) {
    const row = orderData[i];
    if (row[colMap["Year"]] === draftYear &&
        row[colMap["Conference"]] === conference &&
        row[colMap["Round"]] === currentRound &&
        row[colMap["Pick"]] === currentPick) {
      onTheClock = {
        franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
        teamName: row[colMap["TeamName"]],
        round: currentRound,
        pick: currentPick,
        overallPick: row[colMap["OverallPick"]]
      };
      break;
    }
  }

  if (!onTheClock) {
    return {
      success: false,
      message: "Could not find current pick in draft order - draft may be complete"
    };
  }

  return {
    success: true,
    draftYear,
    conference,
    ...onTheClock,
    pickDeadline: settings["CurrentPickDeadline"]
  };
}

/**
 * Make a devy draft pick
 * Players are conference-specific, so only players available in that conference can be drafted
 */
function makeDevyPick(conference, franchiseId, playerId) {
  const settings = getAllDevyDraftSettings();

  // Validate draft is in progress for this conference
  if (settings["DraftStatus"] !== "in_progress") {
    return {
      success: false,
      message: "Draft is not in progress"
    };
  }

  if (settings["CurrentConference"] !== conference) {
    return {
      success: false,
      message: `Draft is currently running for ${settings["CurrentConference"]}, not ${conference}`
    };
  }

  // Get current pick info
  const currentPick = getCurrentDevyPick(conference);
  if (!currentPick.success) {
    return currentPick;
  }

  // Validate it's this team's turn
  const normalizedFranchiseId = String(franchiseId).padStart(3, "0");
  if (currentPick.franchiseId !== normalizedFranchiseId) {
    return {
      success: false,
      message: `It's not your turn. Currently on the clock: ${currentPick.teamName}`
    };
  }

  // Validate player is available IN THIS CONFERENCE
  const availablePlayers = getAvailableDevyPlayers(conference);
  const player = availablePlayers.find(p => p.playerId === playerId);

  if (!player) {
    return {
      success: false,
      message: "Player not found in this conference or already drafted"
    };
  }

  // Verify player ID matches the conference
  if (player.conference !== conference) {
    return {
      success: false,
      message: `Player belongs to ${player.conference} conference, not ${conference}`
    };
  }

  // Record the pick
  const draftYear = Number(settings["DraftYear"]);
  const historySheet = getDevyDraftHistorySheet();
  const timestamp = new Date().toISOString();

  // PlayerName in MFL format: "LastName, FirstName"
  const playerNameMFL = `${player.lastName}, ${player.firstName}`;

  const historyRow = [
    draftYear,
    conference,
    currentPick.round,
    currentPick.pick,
    currentPick.overallPick,
    normalizedFranchiseId,
    currentPick.teamName,
    player.playerId,
    playerNameMFL,      // MFL format for matching with RookieLedger
    player.firstName,
    player.lastName,
    player.position,
    "",                 // IsRookie - populated by IMPORTRANGE formula
    timestamp
  ];

  const lastRow = historySheet.getLastRow();
  historySheet.getRange(lastRow + 1, 1, 1, DEVY_DRAFT_HISTORY_HEADERS.length).setValues([historyRow]);

  // Mark player as drafted (only this conference's copy)
  markPlayerDrafted(playerId, normalizedFranchiseId, draftYear);

  // Advance to next pick
  const advanceResult = advanceDevyDraft(conference);

  return {
    success: true,
    message: `${currentPick.teamName} selected ${player.firstName} ${player.lastName} (${player.position})`,
    pick: {
      round: currentPick.round,
      pick: currentPick.pick,
      overallPick: currentPick.overallPick,
      player: `${player.firstName} ${player.lastName}`,
      position: player.position
    },
    nextPick: advanceResult.nextPick,
    draftComplete: advanceResult.draftComplete
  };
}

/**
 * Advance to the next pick in the draft
 */
function advanceDevyDraft(conference) {
  const settings = getAllDevyDraftSettings();
  const draftYear = Number(settings["DraftYear"]);
  const currentRound = Number(settings["CurrentRound"]);
  const currentPick = Number(settings["CurrentPick"]);
  const totalRounds = Number(settings["TotalRounds"]) || 2;

  // Get draft order to find next pick
  const orderSheet = getDevyDraftOrderSheet();
  const orderData = orderSheet.getDataRange().getValues();
  const headers = orderData[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  // Get all picks for this conference/year
  const conferencePicks = orderData.slice(1).filter(row =>
    row[colMap["Year"]] === draftYear &&
    row[colMap["Conference"]] === conference
  ).sort((a, b) => a[colMap["OverallPick"]] - b[colMap["OverallPick"]]);

  // Find current position and get next
  const currentOverall = conferencePicks.find(row =>
    row[colMap["Round"]] === currentRound &&
    row[colMap["Pick"]] === currentPick
  );

  if (!currentOverall) {
    return { draftComplete: true };
  }

  const currentIndex = conferencePicks.indexOf(currentOverall);

  // Skip forward over any slots already consumed by a retention (or prior pick).
  const filled = getFilledSlotSet(draftYear, conference);
  let nextIndex = currentIndex + 1;
  while (nextIndex < conferencePicks.length) {
    const candidate = conferencePicks[nextIndex];
    if (!filled.has(`${candidate[colMap["Round"]]}-${candidate[colMap["Pick"]]}`)) {
      break;
    }
    nextIndex++;
  }

  if (nextIndex >= conferencePicks.length) {
    // Draft complete for this conference
    setDevyDraftSetting("DraftStatus", "completed");
    setDevyDraftSetting("CurrentPickDeadline", "");

    return {
      draftComplete: true,
      message: `Devy draft complete for ${conference}`
    };
  }

  // Move to next open pick
  const nextPickRow = conferencePicks[nextIndex];
  const nextRound = nextPickRow[colMap["Round"]];
  const nextPick = nextPickRow[colMap["Pick"]];

  setDevyDraftSetting("CurrentRound", String(nextRound));
  setDevyDraftSetting("CurrentPick", String(nextPick));

  // Reset pick deadline
  const deadlineHours = parseInt(settings["PickDeadlineHours"]) || 24;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + deadlineHours);
  setDevyDraftSetting("CurrentPickDeadline", deadline.toISOString());

  // Get Discord ID for next picker
  const nextFranchiseId = String(nextPickRow[colMap["FranchiseID"]]).padStart(3, "0");
  const nextTeamInfo = getTeamInfoByFranchiseId(nextFranchiseId);

  return {
    draftComplete: false,
    nextPick: {
      round: nextRound,
      pick: nextPick,
      franchiseId: nextFranchiseId,
      teamName: nextPickRow[colMap["TeamName"]],
      pickDeadline: deadline.toISOString(),
      ownerDiscordId: nextTeamInfo ? nextTeamInfo.ownerDiscordId : null,
      emoji: nextTeamInfo ? nextTeamInfo.emoji : null
    }
  };
}

// ============================================================================
// DRAFT HISTORY & STATUS
// ============================================================================

/**
 * Get draft history for a conference/year
 */
function getDevyDraftHistory(conference, year) {
  const sheet = getDevyDraftHistorySheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const history = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colMap["Year"]] === year && row[colMap["Conference"]] === conference) {
      history.push({
        round: row[colMap["Round"]],
        pick: row[colMap["Pick"]],
        overallPick: row[colMap["OverallPick"]],
        franchiseId: String(row[colMap["FranchiseID"]]).padStart(3, "0"),
        teamName: row[colMap["TeamName"]],
        playerName: `${row[colMap["PlayerFirstName"]]} ${row[colMap["PlayerLastName"]]}`,
        position: row[colMap["PlayerPosition"]],
        timestamp: row[colMap["Timestamp"]]
      });
    }
  }

  return history.sort((a, b) => a.overallPick - b.overallPick);
}

/**
 * Get full draft order with pick status for a conference
 */
function getDevyDraftOrderWithStatus(conference, year) {
  const orderSheet = getDevyDraftOrderSheet();
  const orderData = orderSheet.getDataRange().getValues();
  const orderHeaders = orderData[0];
  const orderColMap = {};
  orderHeaders.forEach((h, i) => orderColMap[h] = i);

  // Get history to mark completed picks
  const history = getDevyDraftHistory(conference, year);
  const completedPicks = new Set(history.map(h => `${h.round}-${h.pick}`));

  const draftOrder = [];

  for (let i = 1; i < orderData.length; i++) {
    const row = orderData[i];
    if (row[orderColMap["Year"]] === year && row[orderColMap["Conference"]] === conference) {
      const round = row[orderColMap["Round"]];
      const pick = row[orderColMap["Pick"]];
      const pickKey = `${round}-${pick}`;

      const historyEntry = history.find(h => h.round === round && h.pick === pick);

      draftOrder.push({
        round,
        pick,
        overallPick: row[orderColMap["OverallPick"]],
        franchiseId: String(row[orderColMap["FranchiseID"]]).padStart(3, "0"),
        teamName: row[orderColMap["TeamName"]],
        previousYearStanding: row[orderColMap["PreviousYearStanding"]],
        completed: completedPicks.has(pickKey),
        playerSelected: historyEntry ? historyEntry.playerName : null,
        playerPosition: historyEntry ? historyEntry.position : null
      });
    }
  }

  return draftOrder.sort((a, b) => a.overallPick - b.overallPick);
}

/**
 * Get draft status summary
 */
function getDevyDraftStatus() {
  const settings = getAllDevyDraftSettings();

  return {
    draftYear: settings["DraftYear"],
    status: settings["DraftStatus"],
    currentConference: settings["CurrentConference"],
    currentRound: settings["CurrentRound"],
    currentPick: settings["CurrentPick"],
    pickDeadline: settings["CurrentPickDeadline"],
    totalRounds: settings["TotalRounds"]
  };
}

// ============================================================================
// API ENDPOINTS FOR DISCORD BOT
// ============================================================================

/**
 * Main API handler for devy draft operations
 * Called from Discord bot via web app
 */
function handleDevyDraftRequest(action, params) {
  try {
    switch (action) {
      case "startDraft":
        return startDevyDraft(params.conference);

      case "getCurrentPick":
        return getCurrentDevyPick(params.conference);

      case "makePick":
        return makeDevyPick(params.conference, params.franchiseId, params.playerId);

      case "getAvailablePlayers":
        // Now requires conference parameter for conference-specific pools
        return { success: true, players: getAvailableDevyPlayers(params.conference) };

      case "searchPlayers":
        // Now accepts optional conference parameter
        return { success: true, players: searchDevyPlayers(params.searchTerm, params.conference) };

      case "addPlayer":
        // Creates player for all conferences
        return addDevyPlayer(params.firstName, params.lastName, params.position, params.year);

      case "importFromKTC":
        return importFromKeepTradeCut(params.clearExisting || false);

      case "getDraftOrder":
        return { success: true, order: getDevyDraftOrderWithStatus(params.conference, params.year) };

      case "getDraftHistory":
        return { success: true, history: getDevyDraftHistory(params.conference, params.year) };

      case "getDraftStatus":
        return { success: true, ...getDevyDraftStatus() };

      case "getConferences":
        return { success: true, conferences: getAllConferences() };

      case "retainPlayer":
        return retainDevyPlayer(params.playerId, params.franchiseId, params.retentionYear);

      case "releasePlayer":
        return releaseRetainedPlayer(params.playerId, params.decisionYear || params.retentionYear);

      case "getRetainedPlayers":
        return { success: true, players: getRetainedPlayers(params.franchiseId, params.conference) };

      case "applyRetentionsToDraft":
        return applyRetentionsToDraft(params.draftYear, params.conferences || null);

      case "openRetentionWindow":
        return openRetentionWindow(params.year, params.conference || null);

      case "finalizeRetention":
        return finalizeDevyRetention(params.year, params.conference || null);

      case "sweepGraduated":
        return sweepGraduatedDevyPlayers();

      case "reconcilePool":
        return reconcileDevyPoolFromLedger();

      case "markEnteredNFL":
        return markPlayerEnteredNFL(params.basePlayerId);

      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error: error.toString()
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Reset devy draft for a conference (use with caution)
 * Only resets players from this specific conference
 */
function resetDevyDraft(conference, year) {
  // Clear draft history for this conference/year
  const historySheet = getDevyDraftHistorySheet();
  const historyData = historySheet.getDataRange().getValues();
  const historyHeaders = historyData[0];
  const hColMap = {};
  historyHeaders.forEach((h, i) => hColMap[h] = i);

  // Get players that were drafted in this conference/year to unmark them
  const playersToUnmark = [];

  for (let i = historyData.length - 1; i >= 1; i--) {
    const row = historyData[i];
    if (row[hColMap["Year"]] === year && row[hColMap["Conference"]] === conference) {
      playersToUnmark.push(row[hColMap["PlayerID"]]);
      historySheet.deleteRow(i + 1);
    }
  }

  // Unmark players as drafted - reset to Available status
  const poolSheet = getDevyPlayerPoolSheet();
  const poolData = poolSheet.getDataRange().getValues();
  const poolHeaders = poolData[0];
  const pColMap = {};
  poolHeaders.forEach((h, i) => pColMap[h] = i);

  for (let i = 1; i < poolData.length; i++) {
    if (playersToUnmark.includes(poolData[i][pColMap["PlayerID"]])) {
      poolSheet.getRange(i + 1, pColMap["Status"] + 1).setValue("Available");
      poolSheet.getRange(i + 1, pColMap["Drafted"] + 1).setValue("No");
      poolSheet.getRange(i + 1, pColMap["DraftedBy"] + 1).setValue("");
      poolSheet.getRange(i + 1, pColMap["DraftYear"] + 1).setValue("");
    }
  }

  // Reset settings if this was the active conference
  const settings = getAllDevyDraftSettings();
  if (settings["CurrentConference"] === conference && Number(settings["DraftYear"]) === year) {
    setDevyDraftSetting("DraftStatus", "not_started");
    setDevyDraftSetting("CurrentRound", "1");
    setDevyDraftSetting("CurrentPick", "1");
    setDevyDraftSetting("CurrentPickDeadline", "");
  }

  return {
    success: true,
    message: `Draft reset for ${conference} (${year}). ${playersToUnmark.length} picks cleared.`
  };
}

/**
 * Import players from a 2D array (for bulk import)
 * Creates copies for ALL conferences
 * Array format: [[firstName, lastName, position, year], ...]
 */
function bulkImportDevyPlayers(playersArray) {
  const conferences = getAllConferences();
  if (conferences.length === 0) {
    return {
      success: false,
      message: "No conferences found in Teams sheet"
    };
  }

  const results = [];
  let totalCreated = 0;

  for (const player of playersArray) {
    if (player.length >= 3) {
      const result = addDevyPlayer(
        player[0], // firstName
        player[1], // lastName
        player[2], // position
        player[3] || new Date().getFullYear() // year (default to current year)
      );
      results.push(result);
      if (result.success) {
        totalCreated += conferences.length;
      }
    }
  }

  return {
    success: true,
    message: `Imported ${results.length} players × ${conferences.length} conferences = ${totalCreated} total entries`,
    results,
    totalCreated
  };
}

// ============================================================================
// TEST FUNCTIONS - Run these from Apps Script editor to test the system
// ============================================================================

/**
 * TEST 1: Initialize all sheets
 * Run this first to create all required sheets
 */
function TEST_1_InitializeSheets() {
  Logger.log("Creating DevyPlayerPool sheet...");
  getDevyPlayerPoolSheet();

  Logger.log("Creating DevyDraftOrder sheet...");
  getDevyDraftOrderSheet();

  Logger.log("Creating DevyDraftHistory sheet...");
  getDevyDraftHistorySheet();

  Logger.log("Creating DevyDraftSettings sheet...");
  getDevyDraftSettingsSheet();

  Logger.log("✅ All sheets created successfully!");
  Logger.log("Check your spreadsheet - you should see 4 new tabs.");
}

/**
 * TEST 2: Add sample devy players to the pool
 * Run this to populate the player pool with test data
 * NOTE: This creates copies for ALL conferences in the Teams sheet
 */
function TEST_2_AddSamplePlayers() {
  const conferences = getAllConferences();
  if (conferences.length === 0) {
    Logger.log("❌ No conferences found. Make sure you have a Teams sheet with Conference column populated.");
    Logger.log("   For testing, you can use TEST_2A_SetupTestTeams first.");
    return;
  }

  Logger.log(`Found ${conferences.length} conferences: ${conferences.join(', ')}`);

  const samplePlayers = [
    ["Travis", "Hunter", "WR", 2025],
    ["Tetairoa", "McMillan", "WR", 2025],
    ["Luther", "Burden", "WR", 2025],
    ["Arch", "Manning", "QB", 2026],
    ["Dylan", "Raiola", "QB", 2026],
    ["Julian", "Lewis", "QB", 2027],
    ["Jeremiah", "Smith", "WR", 2026],
    ["Ryan", "Williams", "WR", 2026],
    ["Cam", "Skattebo", "RB", 2025],
    ["Ashton", "Jeanty", "RB", 2025],
    ["Quinshon", "Judkins", "RB", 2025],
    ["TreVeyon", "Henderson", "RB", 2025]
  ];

  Logger.log(`Adding ${samplePlayers.length} sample players × ${conferences.length} conferences...`);
  const result = bulkImportDevyPlayers(samplePlayers);
  Logger.log(`✅ ${result.message}`);
  Logger.log("Check the DevyPlayerPool sheet to see the players.");
}

/**
 * TEST 2A: Setup test teams (for testing without real Teams sheet)
 * Run this first if you don't have a Teams sheet populated
 */
function TEST_2A_SetupTestTeams() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let teamsSheet = ss.getSheetByName("Teams");

  if (!teamsSheet) {
    teamsSheet = ss.insertSheet("Teams");
    Logger.log("Created Teams sheet");
  }

  // Check if already has data
  const existingData = teamsSheet.getDataRange().getValues();
  if (existingData.length > 1) {
    Logger.log("Teams sheet already has data. Skipping test setup.");
    return;
  }

  const headers = ["Franchise ID", "Team Name", "Conference", "Abbreviation", "Owner Discord ID", "Coach Name", "Coach Email", "Emoji"];
  const testTeams = [
    ["001", "Test Team Alpha", "TEST", "TTA", "123456789", "Coach A", "a@test.com", "🔴"],
    ["002", "Test Team Beta", "TEST", "TTB", "234567890", "Coach B", "b@test.com", "🔵"],
    ["003", "Test Team Gamma", "TEST", "TTG", "345678901", "Coach C", "c@test.com", "🟢"],
    ["004", "Test Team Delta", "TEST", "TTD", "456789012", "Coach D", "d@test.com", "🟡"],
    ["005", "Test Team Epsilon", "TEST", "TTE", "567890123", "Coach E", "e@test.com", "🟣"],
    ["006", "Test Team Zeta", "TEST", "TTZ", "678901234", "Coach F", "f@test.com", "🟠"]
  ];

  teamsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  teamsSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  teamsSheet.getRange(2, 1, testTeams.length, headers.length).setValues(testTeams);
  teamsSheet.setFrozenRows(1);

  Logger.log("✅ Test teams created:");
  testTeams.forEach(t => Logger.log(`   ${t[0]}: ${t[1]} (${t[2]})`));
}

/**
 * TEST 2B: Import players from KeepTradeCut
 * Run this to populate the player pool from KTC devy rankings
 */
function TEST_2B_ImportFromKeepTradeCut() {
  Logger.log("Fetching devy players from KeepTradeCut...");
  Logger.log("This may take a few seconds...");

  const result = importFromKeepTradeCut(false);

  if (result.success) {
    Logger.log(`✅ ${result.message}`);
    Logger.log(`   Total on KTC: ${result.totalPlayers}`);
    Logger.log(`   Imported: ${result.imported}`);
    Logger.log(`   Skipped (duplicates): ${result.skipped}`);
    Logger.log("");
    Logger.log("Check the DevyPlayerPool sheet to see the players.");
  } else {
    Logger.log(`❌ Import failed: ${result.message}`);
  }
}

/**
 * TEST 3: Create mock draft order (simulates manual entry)
 * Run this to populate DevyDraftOrder with test data for a fictional "TEST" conference
 * In production, you would manually enter this data in the DevyDraftOrder sheet
 */
function TEST_3_CreateMockDraftOrder() {
  const draftYear = 2026;
  const testConference = "TEST";

  // Mock teams with standings (worst to best for draft order)
  const mockTeams = [
    { franchiseId: "001", teamName: "Test Team Alpha", standing: 6 },
    { franchiseId: "002", teamName: "Test Team Beta", standing: 5 },
    { franchiseId: "003", teamName: "Test Team Gamma", standing: 4 },
    { franchiseId: "004", teamName: "Test Team Delta", standing: 3 },
    { franchiseId: "005", teamName: "Test Team Epsilon", standing: 2 },
    { franchiseId: "006", teamName: "Test Team Zeta", standing: 1 }
  ];

  const orderSheet = getDevyDraftOrderSheet();
  const totalRounds = 2;
  const draftOrderRows = [];
  let overallPick = 0;

  for (let round = 1; round <= totalRounds; round++) {
    // Same order each round (no snake) - worst team picks first every round
    const orderedTeams = mockTeams;

    for (let pick = 1; pick <= orderedTeams.length; pick++) {
      overallPick++;
      const team = orderedTeams[pick - 1];
      draftOrderRows.push([
        draftYear,
        testConference,
        round,
        pick,
        overallPick,
        team.franchiseId,
        team.teamName,
        team.standing
      ]);
    }
  }

  // Append to sheet
  const lastRow = orderSheet.getLastRow();
  orderSheet.getRange(lastRow + 1, 1, draftOrderRows.length, 8).setValues(draftOrderRows);

  // Set settings
  setDevyDraftSetting("DraftYear", draftYear);
  setDevyDraftSetting("DraftStatus", "not_started");
  setDevyDraftSetting("TotalRounds", "2");

  Logger.log(`✅ Mock draft order created for ${testConference} conference`);
  Logger.log(`   Year: ${draftYear}`);
  Logger.log(`   Teams: ${mockTeams.length}`);
  Logger.log(`   Total Picks: ${draftOrderRows.length}`);
  Logger.log("");
  Logger.log("Draft Order (same order each round):");
  draftOrderRows.forEach(row => {
    Logger.log(`   R${row[2]}P${row[3]}: ${row[6]}`);
  });
}

/**
 * TEST 4: Start the test draft
 * Run this after TEST_3 to start the draft
 */
function TEST_4_StartTestDraft() {
  const result = startDevyDraft("TEST");
  Logger.log("Start Draft Result:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("");
    Logger.log("✅ Draft started! First team is on the clock.");
    Logger.log(`   Pick deadline: ${result.pickDeadline}`);
  }
}

/**
 * TEST 5: View current pick
 * Run this to see who is on the clock
 */
function TEST_5_ViewCurrentPick() {
  const result = getCurrentDevyPick("TEST");
  Logger.log("Current Pick:");
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * TEST 6: Make a test pick
 * Run this to simulate making a pick
 */
function TEST_6_MakeTestPick() {
  const conference = "TEST";

  // Get available players for this conference
  const players = getAvailableDevyPlayers(conference);
  if (players.length === 0) {
    Logger.log("❌ No available players in TEST conference. Run TEST_2 first.");
    return;
  }

  // Get current pick
  const currentPick = getCurrentDevyPick(conference);
  if (!currentPick.success) {
    Logger.log("❌ " + currentPick.message);
    Logger.log("Run TEST_4 to start the draft first.");
    return;
  }

  // Make the pick with first available player
  const player = players[0];
  Logger.log(`Making pick: ${currentPick.teamName} selects ${player.firstName} ${player.lastName}`);

  const result = makeDevyPick(conference, currentPick.franchiseId, player.playerId);
  Logger.log("");
  Logger.log("Pick Result:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("");
    Logger.log("✅ Pick recorded successfully!");
    if (result.draftComplete) {
      Logger.log("🏆 DRAFT COMPLETE!");
    } else if (result.nextPick) {
      Logger.log(`Next on the clock: ${result.nextPick.teamName} (R${result.nextPick.round}P${result.nextPick.pick})`);
    }
  }
}

/**
 * TEST 7: View draft history
 * Run this to see all picks made
 */
function TEST_7_ViewDraftHistory() {
  const history = getDevyDraftHistory("TEST", 2026);
  Logger.log(`Draft History (${history.length} picks):`);
  history.forEach(pick => {
    Logger.log(`   R${pick.round}P${pick.pick}: ${pick.teamName} → ${pick.playerName} (${pick.position})`);
  });
}

/**
 * TEST 8: View draft order with status
 * Run this to see the full draft board
 */
function TEST_8_ViewDraftBoard() {
  const order = getDevyDraftOrderWithStatus("TEST", 2026);
  Logger.log("Draft Board:");
  order.forEach(pick => {
    const status = pick.completed ? "✅" : "⬜";
    const player = pick.completed ? ` → ${pick.playerSelected} (${pick.playerPosition})` : "";
    Logger.log(`   ${status} R${pick.round}P${pick.pick}: ${pick.teamName}${player}`);
  });
}

/**
 * TEST 9: Simulate full draft (auto-picks all remaining)
 * Run this to complete the entire draft automatically
 */
function TEST_9_SimulateFullDraft() {
  const conference = "TEST";
  let pickCount = 0;
  const maxPicks = 20; // Safety limit

  while (pickCount < maxPicks) {
    const currentPick = getCurrentDevyPick(conference);
    if (!currentPick.success) {
      Logger.log("Draft complete or not in progress.");
      break;
    }

    // Get players for this specific conference
    const players = getAvailableDevyPlayers(conference);
    if (players.length === 0) {
      Logger.log("No more players available in this conference!");
      break;
    }

    // Pick a random player
    const player = players[Math.floor(Math.random() * Math.min(5, players.length))];
    const result = makeDevyPick(conference, currentPick.franchiseId, player.playerId);

    if (result.success) {
      Logger.log(`R${currentPick.round}P${currentPick.pick}: ${currentPick.teamName} → ${player.firstName} ${player.lastName}`);
      pickCount++;

      if (result.draftComplete) {
        Logger.log("");
        Logger.log("🏆 DRAFT COMPLETE!");
        break;
      }
    } else {
      Logger.log("Error: " + result.message);
      break;
    }
  }

  Logger.log("");
  Logger.log(`Total picks made: ${pickCount}`);
}

/**
 * TEST CLEANUP: Reset test data
 * Run this to clear test data and start fresh
 */
function TEST_CLEANUP_ResetTestDraft() {
  const result = resetDevyDraft("TEST", 2026);
  Logger.log(result.message);

  // Also clear draft order for TEST conference
  const orderSheet = getDevyDraftOrderSheet();
  const data = orderSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === "TEST") { // Conference column
      orderSheet.deleteRow(i + 1);
    }
  }

  Logger.log("✅ Test data cleared. Ready to run tests again.");
}

// ============================================================================
// DRAFT ORDER GENERATION FROM STANDINGS
// ============================================================================

/**
 * Menu: Generate draft order from conference standings
 * Reads ConferenceStandings sheet and creates inverse draft order
 */
function menuGenerateDraftOrderFromStandings() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if ConferenceStandings sheet exists
  const standingsSheet = ss.getSheetByName("ConferenceStandings");
  if (!standingsSheet) {
    ui.alert(
      "Sheet Not Found",
      "ConferenceStandings sheet not found.\n\nPlease create this sheet with IMPORTRANGE from your league standings.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Auto-detect standings year from the sheet
  const standingsData = standingsSheet.getDataRange().getValues();
  const standingsHeaders = standingsData[0].map(h => String(h).trim());
  const yearCol = standingsHeaders.indexOf("Year");

  let detectedStandingsYear = null;
  if (yearCol !== -1) {
    // Find the most recent year in the data
    for (let i = 1; i < standingsData.length; i++) {
      const rowYear = parseInt(standingsData[i][yearCol]);
      if (!isNaN(rowYear) && (detectedStandingsYear === null || rowYear > detectedStandingsYear)) {
        detectedStandingsYear = rowYear;
      }
    }
  }

  // Draft year = standings year + 1 (standings reflect last season, draft is for next)
  const suggestedDraftYear = detectedStandingsYear ? detectedStandingsYear + 1 : new Date().getFullYear();

  // Confirm the year with the user
  const yearResponse = ui.prompt(
    "Generate Draft Order",
    `Standings year detected: ${detectedStandingsYear || "unknown"}\n\n` +
    `Draft order will be generated for: ${suggestedDraftYear}\n` +
    `(Standings from ${detectedStandingsYear || "?"} determine ${suggestedDraftYear} draft order)\n\n` +
    `Press OK to confirm, or enter a different draft year:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;

  const userInput = yearResponse.getResponseText().trim();
  const draftYear = userInput ? parseInt(userInput) : suggestedDraftYear;
  if (isNaN(draftYear)) {
    ui.alert("Error", "Please enter a valid year.", ui.ButtonSet.OK);
    return;
  }

  // Ask which conferences to generate
  const confResponse = ui.prompt(
    "Select Conferences",
    "Enter conferences to generate (comma-separated), or 'ALL' for all conferences:\n\n" +
    "Example: AAC, P12, SEC, B12, ACC, B10",
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) return;

  const confInput = confResponse.getResponseText().trim().toUpperCase();
  const selectedConferences = confInput === "ALL" ? null : confInput.split(",").map(c => c.trim());

  // Generate the draft order
  const result = generateDraftOrderFromStandings(draftYear, selectedConferences);

  if (result.success) {
    ui.alert(
      "Draft Order Generated",
      result.message + "\n\n" +
      `Total picks created: ${result.totalPicks}\n\n` +
      "Conferences processed:\n" +
      result.conferences.map(c => `• ${c.conference}: ${c.teams} teams, ${c.picks} picks`).join("\n"),
      ui.ButtonSet.OK
    );
  } else {
    ui.alert("Error", result.message, ui.ButtonSet.OK);
  }
}

/**
 * Generate draft order from ConferenceStandings sheet
 * Creates inverse order (worst standing = first pick) - same order each round (no snake)
 *
 * NOTE: draftYear = standings year + 1. Standings from 2025 produce the 2026 draft order.
 * The menu auto-detects the standings year and suggests draftYear accordingly.
 *
 * ConferenceStandings expected columns:
 * Year, AsOfWeek, Conference, FranchiseID, TeamName, ConfWins, ConfLosses,
 * ConfWinPct, ConfPointsFor, Standing, CCGBound, Tiebreaker, AllPlayPct,
 * TotalPF, NationalRank, CalculatedAt
 *
 * @param {number} draftYear - The year for the draft order (standings year + 1)
 * @param {string[]|null} conferences - Array of conference codes, or null for all
 * @returns {Object} Result with success status and details
 */
function generateDraftOrderFromStandings(draftYear, conferences = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const standingsSheet = ss.getSheetByName("ConferenceStandings");

  if (!standingsSheet) {
    return { success: false, message: "ConferenceStandings sheet not found" };
  }

  const data = standingsSheet.getDataRange().getValues();
  if (data.length < 2) {
    return { success: false, message: "No data in ConferenceStandings sheet" };
  }

  // Parse headers
  const headers = data[0].map(h => String(h).trim());
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  // Validate required columns
  const requiredCols = ["Conference", "FranchiseID", "TeamName", "Standing"];
  const missingCols = requiredCols.filter(c => !(c in colMap));
  if (missingCols.length > 0) {
    return { success: false, message: `Missing required columns: ${missingCols.join(", ")}` };
  }

  // Group teams by conference
  const conferenceTeams = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const conference = String(row[colMap["Conference"]] || "").trim();
    const franchiseId = String(row[colMap["FranchiseID"]] || "").trim();
    const teamName = String(row[colMap["TeamName"]] || "").trim();
    const standing = parseInt(row[colMap["Standing"]]) || 999;

    // Skip if no conference or team
    if (!conference || !teamName) continue;

    // Filter by selected conferences if specified
    if (conferences && !conferences.includes(conference.toUpperCase())) continue;

    if (!conferenceTeams[conference]) {
      conferenceTeams[conference] = [];
    }

    conferenceTeams[conference].push({
      franchiseId,
      teamName,
      standing
    });
  }

  if (Object.keys(conferenceTeams).length === 0) {
    return { success: false, message: "No teams found in standings for selected conferences" };
  }

  // Get draft settings
  const settings = getAllDevyDraftSettings();
  const totalRounds = parseInt(settings["TotalRounds"]) || 2;

  // Generate draft order for each conference
  const orderSheet = getDevyDraftOrderSheet();
  const conferenceResults = [];
  let totalPicks = 0;

  for (const conference in conferenceTeams) {
    const teams = conferenceTeams[conference];

    // Sort by standing DESCENDING (worst = highest standing number = picks first)
    // Standing 16 picks before Standing 1
    teams.sort((a, b) => b.standing - a.standing);

    const numTeams = teams.length;
    const draftRows = [];

    for (let round = 1; round <= totalRounds; round++) {
      // Same order each round (no snake) - worst team picks first every round
      const roundTeams = [...teams];

      for (let pick = 1; pick <= numTeams; pick++) {
        const team = roundTeams[pick - 1];
        const overallPick = (round - 1) * numTeams + pick;

        // Get original standing (before inversion)
        const originalStanding = team.standing;

        // Headers: Year, Conference, Round, Pick, OverallPick, FranchiseID, TeamName, PreviousYearStanding
        draftRows.push([
          draftYear,
          conference,
          round,
          pick,
          overallPick,
          team.franchiseId,
          team.teamName,
          originalStanding
        ]);
      }
    }

    // Write to sheet
    if (draftRows.length > 0) {
      const lastRow = orderSheet.getLastRow();
      orderSheet.getRange(lastRow + 1, 1, draftRows.length, DEVY_DRAFT_ORDER_HEADERS.length).setValues(draftRows);
      totalPicks += draftRows.length;

      conferenceResults.push({
        conference,
        teams: numTeams,
        picks: draftRows.length
      });
    }
  }

  // Update DraftYear setting so startDevyDraft knows what year to use
  setDevyDraftSetting("DraftYear", draftYear);

  return {
    success: true,
    message: `Draft order generated for ${draftYear} (based on ${draftYear - 1} standings)`,
    totalPicks,
    conferences: conferenceResults
  };
}

/**
 * Pre-fill retained players into the coming draft's DevyDraftHistory at the slot
 * their retention consumed (Round 2 for the team's first retention, Round 1 for the
 * second). Run AFTER generateDraftOrderFromStandings and after the retention window
 * closes. Idempotent: a slot that already has a history row is left untouched.
 *
 * @param {number} draftYear - The draft year to slot retentions into
 * @param {string[]|null} conferences - Conference codes, or null for all
 * @returns {Object} Result with applied/skipped counts
 */
function applyRetentionsToDraft(draftYear, conferences = null) {
  const year = Number(draftYear);
  const confFilter = conferences ? conferences.map(c => c.toUpperCase()) : null;

  // RETAIN rows for this year
  const retSheet = getDevyRetentionHistorySheet();
  const retData = retSheet.getDataRange().getValues();
  const rc = {};
  retData[0].forEach((h, i) => rc[h] = i);

  // Draft order lookup: "conf|round|franchise" -> { pick, overallPick, teamName }
  const orderSheet = getDevyDraftOrderSheet();
  const orderData = orderSheet.getDataRange().getValues();
  const oc = {};
  orderData[0].forEach((h, i) => oc[h] = i);
  const orderLookup = {};
  for (let i = 1; i < orderData.length; i++) {
    const row = orderData[i];
    if (Number(row[oc["Year"]]) !== year) continue;
    const key = `${row[oc["Conference"]]}|${row[oc["Round"]]}|${String(row[oc["FranchiseID"]]).padStart(3, "0")}`;
    orderLookup[key] = {
      pick: row[oc["Pick"]],
      overallPick: row[oc["OverallPick"]],
      teamName: row[oc["TeamName"]]
    };
  }

  // Existing filled slots per conference, so we stay idempotent
  const historySheet = getDevyDraftHistorySheet();
  const filledByConf = {};

  const applied = [];
  const skipped = [];

  for (let i = 1; i < retData.length; i++) {
    const row = retData[i];
    if (Number(row[rc["Year"]]) !== year) continue;
    const decision = String(row[rc["Decision"]] || "RETAIN").toUpperCase();
    if (decision !== "RETAIN") continue;

    const conference = row[rc["Conference"]];
    if (confFilter && !confFilter.includes(String(conference).toUpperCase())) continue;

    const franchiseId = String(row[rc["FranchiseID"]]).padStart(3, "0");
    const round = String(row[rc["PickUsed"]]).indexOf("1") !== -1 ? 1 : 2;

    const slot = orderLookup[`${conference}|${round}|${franchiseId}`];
    if (!slot) {
      skipped.push(`${row[rc["PlayerName"]]} (${conference}): no ${`Round ${round}`} slot in order`);
      continue;
    }

    if (!filledByConf[conference]) {
      filledByConf[conference] = getFilledSlotSet(year, conference);
    }
    const slotKey = `${round}-${slot.pick}`;
    if (filledByConf[conference].has(slotKey)) {
      skipped.push(`${row[rc["PlayerName"]]} (${conference}): slot ${slotKey} already filled`);
      continue;
    }

    // Append the retained player into DevyDraftHistory at their consumed slot.
    // Order must match DEVY_DRAFT_HISTORY_HEADERS.
    const historyRow = [
      year,
      conference,
      round,
      slot.pick,
      slot.overallPick,
      franchiseId,
      slot.teamName,
      row[rc["PlayerID"]],
      row[rc["PlayerName"]],        // MFL format
      row[rc["PlayerFirstName"]],
      row[rc["PlayerLastName"]],
      row[rc["PlayerPosition"]],
      "",                            // IsRookie - populated by IMPORTRANGE formula
      new Date().toISOString()
    ];
    const lastRow = historySheet.getLastRow();
    historySheet.getRange(lastRow + 1, 1, 1, DEVY_DRAFT_HISTORY_HEADERS.length).setValues([historyRow]);
    filledByConf[conference].add(slotKey);
    applied.push(`${row[rc["PlayerName"]]} → ${conference} R${round}.${slot.pick}`);
  }

  return {
    success: true,
    message: `Applied ${applied.length} retention(s) to the ${year} draft; skipped ${skipped.length}.`,
    applied,
    skipped
  };
}

/**
 * Menu: Apply retentions to the draft order for a year
 */
function menuApplyRetentionsToDraft() {
  const ui = SpreadsheetApp.getUi();
  const yearResponse = ui.prompt(
    "Apply Retentions to Draft",
    "Enter the draft year to slot retained players into:",
    ui.ButtonSet.OK_CANCEL
  );
  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResponse.getResponseText().trim());
  if (isNaN(year)) {
    ui.alert("Invalid Input", "Please enter a valid year.", ui.ButtonSet.OK);
    return;
  }

  const result = applyRetentionsToDraft(year);
  let message = result.message;
  if (result.applied.length > 0) {
    message += `\n\nApplied:\n• ${result.applied.slice(0, 20).join("\n• ")}`;
  }
  if (result.skipped.length > 0) {
    message += `\n\nSkipped:\n• ${result.skipped.slice(0, 20).join("\n• ")}`;
  }
  ui.alert("Apply Retentions to Draft", message, ui.ButtonSet.OK);
}

/**
 * Open the retention window for a year by seeding PENDING decision rows into
 * DevyRetentionHistory — one per owned player (Drafted/Retained, not EnteredNFL)
 * that doesn't already have a row for the year. This materializes the decision
 * worklist in the sheet so the bot (and the commissioner) read the same thing.
 * Run AFTER reconcile. Idempotent — re-running only adds newly-eligible players.
 *
 * @param {number} year - The retention/decision (league) year
 * @param {string|null} conference - Limit to one conference, or null for all
 * @returns {Object} Result with a seeded count
 */
function openRetentionWindow(year, conference) {
  year = Number(year);
  const confUpper = conference ? String(conference).toUpperCase() : null;

  // Snapshot the ledger once: prior RETAIN count per PlayerID (for the rebate
  // preview) and which PlayerIDs already have a row for this year.
  const retSheet = getDevyRetentionHistorySheet();
  const retData = retSheet.getDataRange().getValues();
  const rc = {};
  retData[0].forEach((h, i) => rc[h] = i);

  const priorRetainByPlayer = {};
  const rowedThisYear = new Set();
  for (let i = 1; i < retData.length; i++) {
    const pid = retData[i][rc["PlayerID"]];
    if (Number(retData[i][rc["Year"]]) === year) rowedThisYear.add(pid);
    const dec = String(retData[i][rc["Decision"]] || "RETAIN").toUpperCase();
    if (dec === "RETAIN") priorRetainByPlayer[pid] = (priorRetainByPlayer[pid] || 0) + 1;
  }

  const poolSheet = getDevyPlayerPoolSheet();
  const poolData = poolSheet.getDataRange().getValues();
  const pc = {};
  poolData[0].forEach((h, i) => pc[h] = i);

  const teamNameCache = {};
  const newRows = [];
  for (let i = 1; i < poolData.length; i++) {
    const row = poolData[i];
    const status = row[pc["Status"]];
    if (status !== "Drafted" && status !== "Retained") continue;
    const conf = row[pc["Conference"]];
    if (confUpper && String(conf).toUpperCase() !== confUpper) continue;
    const playerId = row[pc["PlayerID"]];
    if (rowedThisYear.has(playerId)) continue; // already seeded/decided for this year

    const owner = String(
      (status === "Retained" ? row[pc["RetainedBy"]] : row[pc["DraftedBy"]]) || ""
    ).padStart(3, "0");
    if (!owner || owner === "000") continue;

    if (teamNameCache[owner] === undefined) {
      const ti = getTeamInfoByFranchiseId(owner);
      teamNameCache[owner] = ti ? ti.teamName : "";
    }

    const consecutiveYear = (priorRetainByPlayer[playerId] || 0) + 1;
    const rebateRemaining = Math.max(0, 20 - 5 * (consecutiveYear - 1));

    // Order must match DEVY_RETENTION_HISTORY_HEADERS
    newRows.push([
      year,
      conf,
      owner,
      teamNameCache[owner],
      playerId,
      row[pc["PlayerName"]] || `${row[pc["LastName"]]}, ${row[pc["FirstName"]]}`,
      row[pc["FirstName"]],
      row[pc["LastName"]],
      row[pc["Position"]],
      consecutiveYear,     // preview
      "",                  // PickUsed - assigned when the retain decision lands
      20,                  // BaseRebate
      rebateRemaining,     // preview
      "",                  // IsRookie
      new Date().toISOString(),
      "PENDING"            // Decision
    ]);
  }

  if (newRows.length > 0) {
    const lastRow = retSheet.getLastRow();
    retSheet.getRange(lastRow + 1, 1, newRows.length, DEVY_RETENTION_HISTORY_HEADERS.length).setValues(newRows);
  }

  return {
    success: true,
    message: `Opened retention window for ${year}: seeded ${newRows.length} PENDING decision(s).`,
    seeded: newRows.length
  };
}

/**
 * Menu: open the retention window (seed PENDING decisions) for a year
 */
function menuOpenRetentionWindow() {
  const ui = SpreadsheetApp.getUi();
  const yearResponse = ui.prompt(
    "Open Retention Window",
    "Enter the retention year to open.\n\nSeeds a PENDING row in DevyRetentionHistory for every owned player. Run Reconcile first:",
    ui.ButtonSet.OK_CANCEL
  );
  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResponse.getResponseText().trim());
  if (isNaN(year)) {
    ui.alert("Invalid Input", "Please enter a valid year.", ui.ButtonSet.OK);
    return;
  }

  const confResponse = ui.prompt(
    "Open Retention Window",
    "Enter a conference code to limit to (or leave blank for all):",
    ui.ButtonSet.OK_CANCEL
  );
  if (confResponse.getSelectedButton() !== ui.Button.OK) return;
  const conference = confResponse.getResponseText().toUpperCase().trim() || null;

  const result = openRetentionWindow(year, conference);
  ui.alert("Open Retention Window", result.message, ui.ButtonSet.OK);
}

/**
 * Finalize the retention window for a year: every owned player (Drafted or
 * Retained) with no recorded decision is auto-retained up to the 2-per-team cap;
 * any beyond the cap is auto-released. Idempotent — players who already have a
 * decision for the year are skipped. Run after the retention window closes and
 * BEFORE applyRetentionsToDraft.
 *
 * @param {number} year - The retention/decision year
 * @param {string|null} conference - Limit to one conference, or null for all
 * @returns {Object} Result with retained/released lists
 */
function finalizeDevyRetention(year, conference) {
  year = Number(year);
  const confUpper = conference ? String(conference).toUpperCase() : null;

  // Players who already have a decision for this year, and per-team RETAIN counts.
  const retSheet = getDevyRetentionHistorySheet();
  const retData = retSheet.getDataRange().getValues();
  const rc = {};
  retData[0].forEach((h, i) => rc[h] = i);

  const decided = new Set();
  const existingRetainsByTeam = {};
  for (let i = 1; i < retData.length; i++) {
    const row = retData[i];
    if (Number(row[rc["Year"]]) !== year) continue;
    const dec = String(row[rc["Decision"]] || "RETAIN").toUpperCase();
    // PENDING rows are NOT decided - they're exactly what finalize resolves.
    if (dec === "RETAIN" || dec === "RELEASE") decided.add(row[rc["PlayerID"]]);
    if (dec === "RETAIN") {
      const fid = String(row[rc["FranchiseID"]]).padStart(3, "0");
      existingRetainsByTeam[fid] = (existingRetainsByTeam[fid] || 0) + 1;
    }
  }

  // Eligible owned players (Drafted or Retained), grouped by owning franchise.
  const poolSheet = getDevyPlayerPoolSheet();
  const poolData = poolSheet.getDataRange().getValues();
  const pc = {};
  poolData[0].forEach((h, i) => pc[h] = i);

  const undecidedByTeam = {};
  for (let i = 1; i < poolData.length; i++) {
    const row = poolData[i];
    const status = row[pc["Status"]];
    if (status !== "Drafted" && status !== "Retained") continue;
    const conf = row[pc["Conference"]];
    if (confUpper && String(conf).toUpperCase() !== confUpper) continue;
    const playerId = row[pc["PlayerID"]];
    if (decided.has(playerId)) continue;
    const owner = String(
      (status === "Retained" ? row[pc["RetainedBy"]] : row[pc["DraftedBy"]]) || ""
    ).padStart(3, "0");
    if (!owner || owner === "000") continue;
    if (!undecidedByTeam[owner]) undecidedByTeam[owner] = [];
    undecidedByTeam[owner].push(playerId);
  }

  const retained = [];
  const released = [];
  for (const fid in undecidedByTeam) {
    let remaining = Math.max(0, 2 - (existingRetainsByTeam[fid] || 0));
    for (const playerId of undecidedByTeam[fid]) {
      if (remaining > 0) {
        const r = retainDevyPlayer(playerId, fid, year);
        if (r.success) {
          retained.push(playerId);
          remaining--;
        } else {
          releaseRetainedPlayer(playerId, year);
          released.push(playerId);
        }
      } else {
        releaseRetainedPlayer(playerId, year);
        released.push(playerId);
      }
    }
  }

  return {
    success: true,
    message: `Finalized ${year}: auto-retained ${retained.length}, auto-released ${released.length}.`,
    retained,
    released
  };
}

/**
 * Menu: Finalize retention for a year (auto-retain undecided players)
 */
function menuFinalizeDevyRetention() {
  const ui = SpreadsheetApp.getUi();
  const yearResponse = ui.prompt(
    "Finalize Retention",
    "Enter the retention year to finalize.\n\nEvery undecided owned player will be auto-retained (up to 2 per team); any beyond the cap will be released:",
    ui.ButtonSet.OK_CANCEL
  );
  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResponse.getResponseText().trim());
  if (isNaN(year)) {
    ui.alert("Invalid Input", "Please enter a valid year.", ui.ButtonSet.OK);
    return;
  }

  const confResponse = ui.prompt(
    "Finalize Retention",
    "Enter a conference code to limit to (or leave blank for all):",
    ui.ButtonSet.OK_CANCEL
  );
  if (confResponse.getSelectedButton() !== ui.Button.OK) return;
  const conference = confResponse.getResponseText().toUpperCase().trim() || null;

  const result = finalizeDevyRetention(year, conference);
  ui.alert("Finalize Retention", result.message, ui.ButtonSet.OK);
}

/**
 * Menu: View current draft order for a conference
 */
function menuViewDraftOrder() {
  const ui = SpreadsheetApp.getUi();

  const confResponse = ui.prompt(
    "View Draft Order",
    "Enter conference code to view (e.g., P12, SEC, B12):",
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) return;

  const conference = confResponse.getResponseText().trim().toUpperCase();
  if (!conference) {
    ui.alert("Error", "Please enter a conference code.", ui.ButtonSet.OK);
    return;
  }

  const orderSheet = getDevyDraftOrderSheet();
  const data = orderSheet.getDataRange().getValues();
  const headers = data[0];
  const confCol = headers.indexOf("Conference");
  const yearCol = headers.indexOf("Year");
  const roundCol = headers.indexOf("Round");
  const pickCol = headers.indexOf("Pick");
  const teamCol = headers.indexOf("TeamName");
  const standingCol = headers.indexOf("PreviousYearStanding");

  // Filter for this conference
  const picks = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][confCol]).toUpperCase() === conference) {
      picks.push({
        year: data[i][yearCol],
        round: data[i][roundCol],
        pick: data[i][pickCol],
        team: data[i][teamCol],
        standing: data[i][standingCol]
      });
    }
  }

  if (picks.length === 0) {
    ui.alert("No Draft Order", `No draft order found for conference: ${conference}`, ui.ButtonSet.OK);
    return;
  }

  // Sort by round then pick
  picks.sort((a, b) => a.round - b.round || a.pick - b.pick);

  // Build display message
  let msg = `Draft Order for ${conference} (${picks[0].year}):\n\n`;

  let currentRound = 0;
  for (const p of picks) {
    if (p.round !== currentRound) {
      currentRound = p.round;
      msg += `\n--- Round ${currentRound} ---\n`;
    }
    msg += `${p.round}.${String(p.pick).padStart(2, "0")}: ${p.team} (was #${p.standing})\n`;
  }

  ui.alert("Draft Order", msg, ui.ButtonSet.OK);
}

/**
 * Menu: Clear draft order for a conference
 */
function menuClearDraftOrder() {
  const ui = SpreadsheetApp.getUi();

  const confResponse = ui.prompt(
    "Clear Draft Order",
    "Enter conference code to clear (e.g., P12, SEC, B12):\n\nThis will delete all draft order entries for this conference.",
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) return;

  const conference = confResponse.getResponseText().trim().toUpperCase();
  if (!conference) {
    ui.alert("Error", "Please enter a conference code.", ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert(
    "Confirm Delete",
    `Are you sure you want to delete all draft order entries for ${conference}?\n\nThis cannot be undone.`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const orderSheet = getDevyDraftOrderSheet();
  const data = orderSheet.getDataRange().getValues();
  const confCol = data[0].indexOf("Conference");

  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][confCol]).toUpperCase() === conference) {
      orderSheet.deleteRow(i + 1);
      deleted++;
    }
  }

  ui.alert(
    "Draft Order Cleared",
    `Deleted ${deleted} picks from ${conference} draft order.`,
    ui.ButtonSet.OK
  );
}
