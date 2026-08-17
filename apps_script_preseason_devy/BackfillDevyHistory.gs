/**
 * BackfillDevyHistory.gs - Import historical devy picks and retentions from CSV
 *
 * This script imports past devy draft picks from the exported CSV into the
 * DevyDraftHistory sheet, and retention data into DevyRetentionHistory.
 *
 * NOTE: Some historical teams may not have matching Franchise IDs in the current
 * Teams sheet. The script will import the team name regardless, leaving the
 * FranchiseID blank for manual update later.
 *
 * CSV Columns:
 * Year, Pick, Conference, School, School ID, Player, Player ID, Position,
 * Rebate, Years Retained, Rebate Amount, Adjusted Rebate, Proj. Score,
 * Proj. Star Ranking, Recruited in Auction, Recruited, Final Auction
 *
 * DevyDraftHistory Columns:
 * Year, Conference, Round, Pick, OverallPick, FranchiseID, TeamName,
 * PlayerID, PlayerName, PlayerFirstName, PlayerLastName, PlayerPosition, IsRookie, Timestamp
 *
 * DevyRetentionHistory Columns:
 * Year, Conference, FranchiseID, TeamName, PlayerID, PlayerName,
 * PlayerFirstName, PlayerLastName, PlayerPosition, ConsecutiveYear,
 * PickUsed, BaseRebate, RebateRemaining, IsRookie, Timestamp
 *
 * ============================================================================
 * IMPORTRANGE SETUP FOR ROOKIE DETECTION
 * ============================================================================
 *
 * To automatically detect when a devy player has entered the NFL (is now a rookie),
 * use IMPORTRANGE to pull the RookieLedger from your main League Sheet.
 *
 * STEP 1: Create a hidden sheet called "RookieLedger_Import" in this spreadsheet
 *
 * STEP 2: In cell A1 of RookieLedger_Import, paste this formula:
 *   =IMPORTRANGE("YOUR_LEAGUE_SHEET_ID", "RookieLedger!A:Z")
 *
 *   Replace YOUR_LEAGUE_SHEET_ID with the ID from your League Sheet URL:
 *   https://docs.google.com/spreadsheets/d/YOUR_LEAGUE_SHEET_ID/edit
 *
 * STEP 3: Click "Allow access" when prompted to authorize the IMPORTRANGE
 *
 * STEP 4: The IsRookie column in DevyDraftHistory uses this formula:
 *   =IF(I2="", "", IF(COUNTIF(RookieLedger_Import!$A:$A, I2) > 0, TRUE, FALSE))
 *
 *   Where column I is the PlayerName column (MFL format: "LastName, FirstName")
 *
 * STEP 5: Copy this formula down for all rows in DevyDraftHistory
 *
 * HOW IT WORKS:
 * - PlayerName in DevyDraftHistory uses MFL format: "LastName, FirstName"
 * - RookieLedger in MFL also uses this format
 * - When a player appears in both sheets, IsRookie = TRUE
 * - IsRookie = TRUE means they're no longer a devy (they've entered the NFL)
 *
 * ============================================================================
 */

// ============================================================================
// MENU ADDITIONS
// ============================================================================

/**
 * Add backfill options to the custom menu
 * Call this after onOpen or add to existing onOpen function
 */
function addBackfillMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📜 Backfill History')
    .addItem('📋 Import from Paste', 'menuImportFromPaste')
    .addItem('📁 Import from Sheet', 'menuImportFromSheet')
    .addSeparator()
    .addItem('🔍 Preview Import', 'menuPreviewImport')
    .addItem('📊 View Import Stats', 'menuViewImportStats')
    .addItem('⚠️ View Missing Franchise IDs', 'menuViewMissingFranchiseIds')
    .addSeparator()
    .addItem('🔗 Setup RookieLedger IMPORTRANGE', 'menuSetupRookieLedgerImport')
    .addItem('📋 Apply IsRookie Formulas', 'menuApplyIsRookieFormulas')
    .addSeparator()
    .addItem('🗑️ Clear Year from History', 'menuClearYearFromHistory')
    .addToUi();
}

// ============================================================================
// MAIN IMPORT FUNCTIONS
// ============================================================================

/**
 * Import historical picks from a CSV-formatted sheet
 * Expects a sheet named "BackfillData" with the CSV data pasted in
 *
 * NOTE: Team names are always imported. FranchiseID is left blank if no match
 * is found - these can be manually updated in DevyDraftHistory later.
 *
 * @param {boolean} dryRun - If true, only counts and validates, doesn't import
 * @returns {Object} Result with success status and import counts
 */
function importHistoricalPicks(dryRun = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName("BackfillData");

  if (!sourceSheet) {
    return {
      success: false,
      message: "Sheet 'BackfillData' not found. Please create it and paste your CSV data."
    };
  }

  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    return {
      success: false,
      message: "No data found in BackfillData sheet (need header row + data rows)"
    };
  }

  // Parse headers
  const headers = data[0].map(h => String(h).trim());
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  // Validate required columns
  const requiredCols = ["Year", "Pick", "Conference", "School", "Player", "Position"];
  const missingCols = requiredCols.filter(c => !(c in colMap));
  if (missingCols.length > 0) {
    return {
      success: false,
      message: `Missing required columns: ${missingCols.join(", ")}`
    };
  }

  // Build franchise lookup from Teams sheet (best effort - won't block import)
  const franchiseLookup = buildFranchiseLookup();

  // Check for retention columns (optional)
  const hasRetentionCols = "Years Retained" in colMap || "Recruited" in colMap;

  // Process rows
  const historyRows = [];
  const retentionRows = [];  // For DevyRetentionHistory
  const skipped = [];
  const errors = [];
  const unmatchedTeams = new Set();  // Track teams without franchise IDs
  let overallPickCounter = {};  // Track overall picks per year/conference

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;

    // Extract values
    const year = Number(row[colMap["Year"]]);
    const pickStr = String(row[colMap["Pick"]] || "").trim();
    const conference = String(row[colMap["Conference"]] || "").trim();
    const school = String(row[colMap["School"]] || "").trim();
    const playerName = String(row[colMap["Player"]] || "").trim();
    const position = String(row[colMap["Position"]] || "").trim();

    // Extract retention data (if columns exist)
    const yearsRetained = colMap["Years Retained"] !== undefined ?
      parseInt(row[colMap["Years Retained"]]) || 0 : 0;
    const recruitedInAuction = colMap["Recruited in Auction"] !== undefined ?
      String(row[colMap["Recruited in Auction"]]).toUpperCase() === "TRUE" : false;
    const recruitedCheckbox = colMap["Recruited"] !== undefined ?
      String(row[colMap["Recruited"]]).includes("☑") : false;
    const finalAuction = colMap["Final Auction"] !== undefined ?
      String(row[colMap["Final Auction"]] || "").replace(/[$,]/g, "") : "";

    const wasRecruited = recruitedInAuction || recruitedCheckbox;

    // Skip empty rows or rows without players (empty draft slots)
    if (!year || !pickStr || !playerName) {
      skipped.push({ row: rowNum, reason: "Empty year, pick, or player" });
      continue;
    }

    // Parse pick string (e.g., "1.01" -> Round 1, Pick 1)
    const pickParts = pickStr.split(".");
    if (pickParts.length !== 2) {
      errors.push({ row: rowNum, reason: `Invalid pick format: ${pickStr}` });
      continue;
    }

    const round = parseInt(pickParts[0]);
    const pick = parseInt(pickParts[1]);

    if (isNaN(round) || isNaN(pick)) {
      errors.push({ row: rowNum, reason: `Could not parse pick: ${pickStr}` });
      continue;
    }

    // Get or calculate overall pick number
    const yearConfKey = `${year}_${conference}`;
    if (!overallPickCounter[yearConfKey]) {
      overallPickCounter[yearConfKey] = 0;
    }
    overallPickCounter[yearConfKey]++;
    const overallPick = overallPickCounter[yearConfKey];

    // Look up franchise ID from school name (best effort)
    const franchiseInfo = franchiseLookup[school.toLowerCase()] ||
                          findFranchiseByPartialMatch(school, franchiseLookup);

    // FranchiseID may be empty if team doesn't match - that's OK, user will fix manually
    const franchiseId = franchiseInfo ? franchiseInfo.franchiseId : "";
    const teamName = school;  // Always keep original school name

    // Track unmatched teams for reporting
    if (!franchiseInfo) {
      unmatchedTeams.add(school);
    }

    // Parse player name into first/last
    const { firstName, lastName } = parsePlayerName(playerName);

    // Calculate the original draft year
    // If player was retained, the draft happened (yearsRetained) years ago
    const numRetentions = Math.max(yearsRetained, wasRecruited ? 1 : 0);
    const originalDraftYear = numRetentions > 0 ? year - numRetentions : year;

    // Generate a player ID for historical records using original draft year
    const playerId = generateHistoricalPlayerId(conference, firstName, lastName, originalDraftYear);

    // PlayerName in MFL format: "LastName, FirstName"
    const playerNameMFL = `${lastName}, ${firstName}`;

    // Create history row - use ORIGINAL draft year, not the CSV year
    // Headers: Year, Conference, Round, Pick, OverallPick, FranchiseID, TeamName,
    //          PlayerID, PlayerName, PlayerFirstName, PlayerLastName, PlayerPosition, IsRookie, Timestamp
    historyRows.push([
      originalDraftYear,  // Use original draft year when player was first drafted
      conference,
      round,
      pick,
      overallPick,
      franchiseId,  // May be empty - user can update manually
      teamName,     // Always populated with original school name
      playerId,
      playerNameMFL,  // MFL format for matching with RookieLedger
      firstName,
      lastName,
      position,
      "",             // IsRookie - populated by IMPORTRANGE formula
      `${originalDraftYear}-01-01T00:00:00Z`  // Use original draft year as historical timestamp
    ]);

    // Create retention rows if player was retained
    // For historical data, "Years Retained" indicates how many times the player
    // was retained BEFORE the current year shown in the CSV.
    //
    // Example: Year=2025, YearsRetained=2 means:
    //   - Original draft year: 2023 (2025 - 2)
    //   - 1st retention: 2024 (ConsecutiveYear=1)
    //   - 2nd retention: 2025 (ConsecutiveYear=2)
    //
    // Note: The draft pick row above already uses the ORIGINAL draft year.
    if (numRetentions > 0) {
      const baseRebate = 20;
      // originalDraftYear already calculated above

      for (let retYear = 1; retYear <= numRetentions; retYear++) {
        // Retention year is original draft year + retention number
        const retentionYear = originalDraftYear + retYear;
        const rebateRemaining = Math.max(0, baseRebate - (5 * (retYear - 1)));
        const pickUsed = "Round 2";  // Assume Round 2 for historical (single retention)

        // Headers: Year, Conference, FranchiseID, TeamName, PlayerID, PlayerName,
        //          PlayerFirstName, PlayerLastName, PlayerPosition, ConsecutiveYear,
        //          PickUsed, BaseRebate, RebateRemaining, IsRookie, Timestamp, Decision
        retentionRows.push([
          retentionYear,
          conference,
          franchiseId,
          teamName,
          playerId,
          playerNameMFL,
          firstName,
          lastName,
          position,
          retYear,           // ConsecutiveYear
          pickUsed,
          baseRebate,
          rebateRemaining,
          "",                // IsRookie - populated by formula
          `${retentionYear}-01-01T00:00:00Z`,
          "RETAIN"           // Decision (all historical rows are retentions)
        ]);
      }
    }
  }

  // If dry run, just return stats
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      message: `Preview: Would import ${historyRows.length} picks and ${retentionRows.length} retentions`,
      toImport: historyRows.length,
      retentionsToImport: retentionRows.length,
      skipped: skipped.length,
      errors: errors.length,
      unmatchedTeams: Array.from(unmatchedTeams),
      skippedDetails: skipped.slice(0, 10),  // First 10 skipped
      errorDetails: errors.slice(0, 10),      // First 10 errors
      yearBreakdown: getYearBreakdown(historyRows),
      retentionYearBreakdown: getYearBreakdown(retentionRows)
    };
  }

  // Actually import the data
  if (historyRows.length === 0) {
    return {
      success: false,
      message: "No valid rows to import"
    };
  }

  // Import draft history
  const historySheet = getDevyDraftHistorySheet();
  const lastHistoryRow = historySheet.getLastRow();
  const numHistoryCols = historyRows[0].length;  // 14 columns with PlayerName and IsRookie
  historySheet.getRange(lastHistoryRow + 1, 1, historyRows.length, numHistoryCols).setValues(historyRows);

  // Import retention history (if any)
  let retentionsImported = 0;
  if (retentionRows.length > 0) {
    const retentionSheet = getDevyRetentionHistorySheet();
    const lastRetentionRow = retentionSheet.getLastRow();
    const numRetentionCols = retentionRows[0].length;  // 15 columns
    retentionSheet.getRange(lastRetentionRow + 1, 1, retentionRows.length, numRetentionCols).setValues(retentionRows);
    retentionsImported = retentionRows.length;
  }

  return {
    success: true,
    message: `Imported ${historyRows.length} picks and ${retentionsImported} retentions`,
    imported: historyRows.length,
    retentionsImported: retentionsImported,
    skipped: skipped.length,
    errors: errors.length,
    unmatchedTeams: Array.from(unmatchedTeams),
    yearBreakdown: getYearBreakdown(historyRows)
  };
}

/**
 * Import from a specific range (for flexibility)
 * @param {string} sheetName - Name of sheet containing data
 * @param {string} rangeA1 - A1 notation of range to import
 * @returns {Object} Result object
 */
function importFromRange(sheetName, rangeA1) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: `Sheet '${sheetName}' not found` };
  }

  const range = sheet.getRange(rangeA1);
  const data = range.getValues();

  // Create temporary BackfillData sheet with this data
  let tempSheet = ss.getSheetByName("BackfillData");
  if (tempSheet) {
    tempSheet.clear();
  } else {
    tempSheet = ss.insertSheet("BackfillData");
  }

  tempSheet.getRange(1, 1, data.length, data[0].length).setValues(data);

  // Run import
  const result = importHistoricalPicks(false);

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a lookup table of school names to franchise info
 * This is best-effort - historical teams that no longer exist won't match
 */
function buildFranchiseLookup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const teamsSheet = ss.getSheetByName("Teams");

  if (!teamsSheet) {
    Logger.log("Teams sheet not found - franchise IDs will be empty");
    return {};
  }

  const data = teamsSheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);

  const lookup = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const franchiseId = String(row[colMap["Franchise ID"]] || "").padStart(3, "0");
    const teamName = String(row[colMap["Team Name"]] || "").trim();
    const conference = String(row[colMap["Conference"]] || "").trim();

    // Add multiple lookup keys for flexibility
    if (teamName) {
      lookup[teamName.toLowerCase()] = { franchiseId, teamName, conference };

      // Also add without common suffixes for matching
      const simplifiedName = teamName
        .replace(/\s+(Wildcats|Tigers|Bulldogs|Eagles|Bears|Lions|Panthers|Cardinals|Rebels|Gators|Seminoles|Hurricanes|Yellow Jackets|Demon Deacons|Tar Heels|Wolfpack|Cavaliers|Knights|Cougars|Mountaineers|Longhorns|Aggies|Sooners|Cowboys|Cyclones|Red Raiders|Jayhawks|Horned Frogs|Mustangs|Bearcats|Golden Hurricanes|Thundering Herd|Black Knights|Cornhuskers|Terrapins|Fighting Irish|Nittany Lions|Wolverines|Buckeyes|Spartans|Hawkeyes|Badgers|Golden Gophers|Boilermakers|Hoosiers|Scarlet Knights|Fighting Illini|Midshipmen|Volunteers|Crimson Tide|Razorbacks|Commodores|Gamecocks|Pirates|Sun Devils|Ducks|Huskies|Cougars|Beavers|Bruins|Trojans|Buffaloes|Utes|Falcons|Broncos|Rams|Golden Bears|Aztecs|Lobos|Warriors|Rockets|Chippewas|Bulls|Flashes|Bobcats|Redhawks|Huskies|Aggies)$/i, "")
        .trim()
        .toLowerCase();

      if (simplifiedName !== teamName.toLowerCase()) {
        lookup[simplifiedName] = { franchiseId, teamName, conference };
      }
    }
  }

  return lookup;
}

/**
 * Try to find a franchise by partial name match
 */
function findFranchiseByPartialMatch(schoolName, lookup) {
  const searchTerm = schoolName.toLowerCase();

  // Try exact match first
  if (lookup[searchTerm]) {
    return lookup[searchTerm];
  }

  // Try partial matches
  for (const key in lookup) {
    if (key.includes(searchTerm) || searchTerm.includes(key)) {
      return lookup[key];
    }
  }

  // Try matching just the school part (before mascot)
  const schoolPart = searchTerm.split(/\s+/)[0];
  for (const key in lookup) {
    if (key.startsWith(schoolPart)) {
      return lookup[key];
    }
  }

  return null;
}

/**
 * Parse a player name into first and last name
 * Handles formats like:
 * - "Breece Hall"
 * - "Hall, Breece"
 * - "Breece Michael Hall"
 */
function parsePlayerName(fullName) {
  if (!fullName || fullName.trim() === "") {
    return { firstName: "", lastName: "" };
  }

  fullName = fullName.trim();

  // Check for "Last, First" format
  if (fullName.includes(",")) {
    const parts = fullName.split(",").map(p => p.trim());
    return {
      firstName: parts[1] || "",
      lastName: parts[0] || ""
    };
  }

  // Standard "First Last" format (or "First Middle Last")
  const parts = fullName.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

/**
 * Generate a player ID for historical records
 */
function generateHistoricalPlayerId(conference, firstName, lastName, year) {
  const firstPart = (firstName || "X").substring(0, 3).toUpperCase();
  const lastPart = (lastName || "X").substring(0, 3).toUpperCase();
  return `${conference}_HIST_${year}_${firstPart}${lastPart}`;
}

/**
 * Get breakdown of rows by year
 */
function getYearBreakdown(rows) {
  const breakdown = {};
  rows.forEach(row => {
    const year = row[0];
    breakdown[year] = (breakdown[year] || 0) + 1;
  });
  return breakdown;
}

// ============================================================================
// MENU FUNCTIONS
// ============================================================================

/**
 * Menu: Import from pasted data in BackfillData sheet
 */
function menuImportFromPaste() {
  const ui = SpreadsheetApp.getUi();

  // Check if BackfillData exists
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backfillSheet = ss.getSheetByName("BackfillData");

  if (!backfillSheet) {
    const create = ui.alert(
      "Create BackfillData Sheet?",
      "The BackfillData sheet doesn't exist.\n\nCreate it now so you can paste your CSV data?",
      ui.ButtonSet.YES_NO
    );

    if (create === ui.Button.YES) {
      backfillSheet = ss.insertSheet("BackfillData");
      ui.alert(
        "Sheet Created",
        "BackfillData sheet created.\n\nPaste your CSV data into this sheet, then run this import again.",
        ui.ButtonSet.OK
      );
    }
    return;
  }

  // Preview first
  const preview = importHistoricalPicks(true);

  if (!preview.success) {
    ui.alert("Import Error", preview.message, ui.ButtonSet.OK);
    return;
  }

  // Show preview and confirm
  let previewMsg = `Found ${preview.toImport} picks and ${preview.retentionsToImport || 0} retentions to import:\n\n`;

  const yearBreakdown = preview.yearBreakdown;
  for (const year in yearBreakdown) {
    previewMsg += `• ${year}: ${yearBreakdown[year]} picks\n`;
  }

  if (preview.retentionsToImport > 0) {
    previewMsg += `\nRetentions: ${preview.retentionsToImport} records`;
  }

  if (preview.skipped > 0) {
    previewMsg += `\nSkipped: ${preview.skipped} rows (empty/incomplete)`;
  }
  if (preview.errors > 0) {
    previewMsg += `\nErrors: ${preview.errors} rows`;
  }

  // Note about unmatched teams
  if (preview.unmatchedTeams && preview.unmatchedTeams.length > 0) {
    previewMsg += `\n\n⚠️ ${preview.unmatchedTeams.length} teams have no matching Franchise ID.`;
    previewMsg += `\nTeam names will be imported - you can update Franchise IDs manually later.`;
  }

  previewMsg += "\n\nProceed with import?";

  const confirm = ui.alert("Confirm Import", previewMsg, ui.ButtonSet.YES_NO);

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Run actual import
  const result = importHistoricalPicks(false);

  if (result.success) {
    let successMsg = `Successfully imported:\n`;
    successMsg += `• ${result.imported} picks → DevyDraftHistory\n`;
    successMsg += `• ${result.retentionsImported || 0} retentions → DevyRetentionHistory\n`;

    if (result.unmatchedTeams && result.unmatchedTeams.length > 0) {
      successMsg += `\n⚠️ ${result.unmatchedTeams.length} teams need manual Franchise ID updates.`;
      successMsg += `\nUse "View Missing Franchise IDs" to see the list.`;
    }

    ui.alert("Import Complete", successMsg, ui.ButtonSet.OK);
  } else {
    ui.alert("Import Failed", result.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Import from another sheet
 */
function menuImportFromSheet() {
  const ui = SpreadsheetApp.getUi();

  const sheetResponse = ui.prompt(
    "Import from Sheet",
    "Enter the name of the sheet containing your CSV data:",
    ui.ButtonSet.OK_CANCEL
  );

  if (sheetResponse.getSelectedButton() !== ui.Button.OK) return;
  const sheetName = sheetResponse.getResponseText().trim();

  if (!sheetName) {
    ui.alert("Error", "Please enter a sheet name.", ui.ButtonSet.OK);
    return;
  }

  const result = importFromRange(sheetName, "A:Q");  // Assuming columns A-Q

  if (result.success) {
    let successMsg = `Successfully imported ${result.imported} historical picks.`;

    if (result.unmatchedTeams && result.unmatchedTeams.length > 0) {
      successMsg += `\n\n⚠️ ${result.unmatchedTeams.length} teams need manual Franchise ID updates.`;
    }

    ui.alert("Import Complete", successMsg, ui.ButtonSet.OK);
  } else {
    ui.alert("Import Failed", result.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Preview import without actually importing
 */
function menuPreviewImport() {
  const ui = SpreadsheetApp.getUi();

  const result = importHistoricalPicks(true);

  if (!result.success) {
    ui.alert("Preview Error", result.message, ui.ButtonSet.OK);
    return;
  }

  let msg = `Import Preview:\n\n`;
  msg += `Total picks to import: ${result.toImport}\n`;
  msg += `Total retentions to import: ${result.retentionsToImport || 0}\n`;
  msg += `Skipped rows: ${result.skipped}\n`;
  msg += `Error rows: ${result.errors}\n\n`;

  msg += `Picks by year:\n`;
  for (const year in result.yearBreakdown) {
    msg += `• ${year}: ${result.yearBreakdown[year]} picks\n`;
  }

  if (result.retentionYearBreakdown && Object.keys(result.retentionYearBreakdown).length > 0) {
    msg += `\nRetentions by year:\n`;
    for (const year in result.retentionYearBreakdown) {
      msg += `• ${year}: ${result.retentionYearBreakdown[year]} retentions\n`;
    }
  }

  if (result.unmatchedTeams && result.unmatchedTeams.length > 0) {
    msg += `\n⚠️ Teams without Franchise ID match (${result.unmatchedTeams.length}):\n`;
    result.unmatchedTeams.slice(0, 10).forEach(team => {
      msg += `• ${team}\n`;
    });
    if (result.unmatchedTeams.length > 10) {
      msg += `... and ${result.unmatchedTeams.length - 10} more`;
    }
  }

  if (result.errorDetails && result.errorDetails.length > 0) {
    msg += `\nFirst few errors:\n`;
    result.errorDetails.slice(0, 5).forEach(e => {
      msg += `• Row ${e.row}: ${e.reason}\n`;
    });
  }

  ui.alert("Import Preview", msg, ui.ButtonSet.OK);
}

/**
 * Menu: View stats about what's already imported
 */
function menuViewImportStats() {
  const ui = SpreadsheetApp.getUi();
  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();

  if (data.length < 2) {
    ui.alert("Stats", "No picks in DevyDraftHistory yet.", ui.ButtonSet.OK);
    return;
  }

  const headers = data[0];
  const yearCol = headers.indexOf("Year");
  const confCol = headers.indexOf("Conference");

  const stats = {
    total: data.length - 1,
    byYear: {},
    byConference: {}
  };

  for (let i = 1; i < data.length; i++) {
    const year = data[i][yearCol];
    const conf = data[i][confCol];

    stats.byYear[year] = (stats.byYear[year] || 0) + 1;
    stats.byConference[conf] = (stats.byConference[conf] || 0) + 1;
  }

  let msg = `DevyDraftHistory Stats:\n\n`;
  msg += `Total picks: ${stats.total}\n\n`;

  msg += `By Year:\n`;
  Object.keys(stats.byYear).sort().forEach(year => {
    msg += `• ${year}: ${stats.byYear[year]} picks\n`;
  });

  msg += `\nBy Conference:\n`;
  Object.keys(stats.byConference).sort().forEach(conf => {
    msg += `• ${conf}: ${stats.byConference[conf]} picks\n`;
  });

  ui.alert("Import Stats", msg, ui.ButtonSet.OK);
}

/**
 * Menu: View teams with missing Franchise IDs in history
 */
function menuViewMissingFranchiseIds() {
  const ui = SpreadsheetApp.getUi();
  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();

  if (data.length < 2) {
    ui.alert("No Data", "No picks in DevyDraftHistory yet.", ui.ButtonSet.OK);
    return;
  }

  const headers = data[0];
  const franchiseIdCol = headers.indexOf("FranchiseID");
  const teamNameCol = headers.indexOf("TeamName");

  const missingTeams = new Set();
  let missingCount = 0;

  for (let i = 1; i < data.length; i++) {
    const franchiseId = String(data[i][franchiseIdCol] || "").trim();
    const teamName = String(data[i][teamNameCol] || "").trim();

    if (!franchiseId && teamName) {
      missingTeams.add(teamName);
      missingCount++;
    }
  }

  if (missingTeams.size === 0) {
    ui.alert("All Good!", "All picks have Franchise IDs assigned.", ui.ButtonSet.OK);
    return;
  }

  let msg = `Found ${missingCount} picks across ${missingTeams.size} teams missing Franchise IDs:\n\n`;

  Array.from(missingTeams).sort().forEach(team => {
    msg += `• ${team}\n`;
  });

  msg += `\nYou can manually update the FranchiseID column in DevyDraftHistory.`;

  ui.alert("Missing Franchise IDs", msg, ui.ButtonSet.OK);
}

/**
 * Menu: Clear a specific year from history (for re-import)
 */
function menuClearYearFromHistory() {
  const ui = SpreadsheetApp.getUi();

  const yearResponse = ui.prompt(
    "Clear Year",
    "Enter the year to clear from DevyDraftHistory:\n\n(This cannot be undone!)",
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;

  const year = parseInt(yearResponse.getResponseText().trim());
  if (isNaN(year)) {
    ui.alert("Error", "Please enter a valid year.", ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert(
    "Confirm Delete",
    `Are you sure you want to delete ALL picks from ${year}?\n\nThis cannot be undone!`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();
  const headers = data[0];
  const yearCol = headers.indexOf("Year");

  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][yearCol]) === year) {
      historySheet.deleteRow(i + 1);
      deleted++;
    }
  }

  ui.alert(
    "Clear Complete",
    `Deleted ${deleted} picks from ${year}.`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// API ENDPOINT FOR DISCORD BOT
// ============================================================================

/**
 * Handle backfill requests from Discord bot
 * @param {string} action - The action to perform
 * @param {Object} params - Parameters for the action
 */
function handleBackfillRequest(action, params) {
  try {
    switch (action) {
      case "importPicks":
        return importHistoricalPicks(params.dryRun || false);

      case "getStats":
        return getHistoryStats();

      case "clearYear":
        return clearYearFromHistory(params.year);

      case "getMissingFranchiseIds":
        return getMissingFranchiseIds();

      default:
        return { success: false, message: `Unknown backfill action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error: error.toString()
    };
  }
}

/**
 * Get history stats programmatically
 */
function getHistoryStats() {
  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();

  if (data.length < 2) {
    return { success: true, total: 0, byYear: {}, byConference: {} };
  }

  const headers = data[0];
  const yearCol = headers.indexOf("Year");
  const confCol = headers.indexOf("Conference");

  const stats = {
    success: true,
    total: data.length - 1,
    byYear: {},
    byConference: {}
  };

  for (let i = 1; i < data.length; i++) {
    const year = data[i][yearCol];
    const conf = data[i][confCol];

    stats.byYear[year] = (stats.byYear[year] || 0) + 1;
    stats.byConference[conf] = (stats.byConference[conf] || 0) + 1;
  }

  return stats;
}

/**
 * Clear a year from history programmatically
 */
function clearYearFromHistory(year) {
  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();
  const headers = data[0];
  const yearCol = headers.indexOf("Year");

  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][yearCol]) === Number(year)) {
      historySheet.deleteRow(i + 1);
      deleted++;
    }
  }

  return {
    success: true,
    message: `Deleted ${deleted} picks from ${year}`,
    deleted
  };
}

/**
 * Get teams with missing franchise IDs programmatically
 */
function getMissingFranchiseIds() {
  const historySheet = getDevyDraftHistorySheet();
  const data = historySheet.getDataRange().getValues();

  if (data.length < 2) {
    return { success: true, teams: [], count: 0 };
  }

  const headers = data[0];
  const franchiseIdCol = headers.indexOf("FranchiseID");
  const teamNameCol = headers.indexOf("TeamName");

  const missingTeams = new Set();
  let missingCount = 0;

  for (let i = 1; i < data.length; i++) {
    const franchiseId = String(data[i][franchiseIdCol] || "").trim();
    const teamName = String(data[i][teamNameCol] || "").trim();

    if (!franchiseId && teamName) {
      missingTeams.add(teamName);
      missingCount++;
    }
  }

  return {
    success: true,
    teams: Array.from(missingTeams).sort(),
    count: missingCount
  };
}

// ============================================================================
// IMPORTRANGE SETUP FOR ROOKIE DETECTION
// ============================================================================

/**
 * Menu: Setup RookieLedger IMPORTRANGE
 * Creates a hidden sheet and guides user through IMPORTRANGE setup
 */
function menuSetupRookieLedgerImport() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if sheet already exists
  let importSheet = ss.getSheetByName("RookieLedger_Import");

  if (importSheet) {
    const overwrite = ui.alert(
      "Sheet Exists",
      "RookieLedger_Import sheet already exists.\n\nDo you want to reconfigure it?",
      ui.ButtonSet.YES_NO
    );
    if (overwrite !== ui.Button.YES) return;
  } else {
    importSheet = ss.insertSheet("RookieLedger_Import");
  }

  // Prompt for League Sheet ID
  const idResponse = ui.prompt(
    "Enter League Sheet ID",
    "Enter the ID of your main League Sheet.\n\n" +
    "Find it in the URL: https://docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit\n\n" +
    "Just paste the ID part:",
    ui.ButtonSet.OK_CANCEL
  );

  if (idResponse.getSelectedButton() !== ui.Button.OK) return;

  const sheetId = idResponse.getResponseText().trim();
  if (!sheetId) {
    ui.alert("Error", "No Sheet ID provided.", ui.ButtonSet.OK);
    return;
  }

  // Prompt for RookieLedger sheet name and range
  const rangeResponse = ui.prompt(
    "Enter RookieLedger Range",
    "Enter the sheet name and range for the RookieLedger.\n\n" +
    "Default: RookieLedger!A:Z\n\n" +
    "Make sure the Player Name column uses MFL format (LastName, FirstName):",
    ui.ButtonSet.OK_CANCEL
  );

  if (rangeResponse.getSelectedButton() !== ui.Button.OK) return;

  const range = rangeResponse.getResponseText().trim() || "RookieLedger!A:Z";

  // Set the IMPORTRANGE formula
  const formula = `=IMPORTRANGE("${sheetId}", "${range}")`;
  importSheet.getRange("A1").setFormula(formula);

  // Hide the sheet
  importSheet.hideSheet();

  ui.alert(
    "Setup Complete",
    "RookieLedger_Import sheet created with IMPORTRANGE formula.\n\n" +
    "IMPORTANT: You may need to click on the sheet and 'Allow access' for the IMPORTRANGE to work.\n\n" +
    "The sheet has been hidden. To view it, go to View → Hidden sheets.\n\n" +
    "Next step: Run 'Apply IsRookie Formulas' to add the lookup formulas to DevyDraftHistory.",
    ui.ButtonSet.OK
  );
}

/**
 * Menu: Apply IsRookie formulas to DevyDraftHistory and DevyRetentionHistory
 * Adds formulas that check if player is in RookieLedger
 */
function menuApplyIsRookieFormulas() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if RookieLedger_Import exists
  const importSheet = ss.getSheetByName("RookieLedger_Import");
  if (!importSheet) {
    ui.alert(
      "Setup Required",
      "RookieLedger_Import sheet not found.\n\n" +
      "Please run 'Setup RookieLedger IMPORTRANGE' first.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Prompt for which column in RookieLedger_Import contains the player name
  const colResponse = ui.prompt(
    "RookieLedger Player Name Column",
    "Which column in RookieLedger contains the player name?\n\n" +
    "Enter the column letter (e.g., A, B, C):\n\n" +
    "The player name should be in MFL format: 'LastName, FirstName'",
    ui.ButtonSet.OK_CANCEL
  );

  if (colResponse.getSelectedButton() !== ui.Button.OK) return;

  const rookieCol = colResponse.getResponseText().trim().toUpperCase() || "A";

  // Apply to DevyDraftHistory
  const historySheet = getDevyDraftHistorySheet();
  const historyData = historySheet.getDataRange().getValues();
  const historyHeaders = historyData[0];
  const historyPlayerNameCol = historyHeaders.indexOf("PlayerName");
  const historyIsRookieCol = historyHeaders.indexOf("IsRookie");

  if (historyPlayerNameCol === -1 || historyIsRookieCol === -1) {
    ui.alert(
      "Error",
      "DevyDraftHistory is missing PlayerName or IsRookie column.\n\n" +
      "Please ensure the sheet has the correct headers.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Get column letters for formula
  const playerNameColLetter = String.fromCharCode(65 + historyPlayerNameCol);  // A=65
  const isRookieColLetter = String.fromCharCode(65 + historyIsRookieCol);

  // Apply formula to all data rows in DevyDraftHistory
  const historyLastRow = historySheet.getLastRow();
  if (historyLastRow > 1) {
    const formulas = [];
    for (let row = 2; row <= historyLastRow; row++) {
      // Formula: =IF(PlayerNameCell="", "", IF(COUNTIF(RookieLedger_Import!$A:$A, PlayerNameCell) > 0, TRUE, FALSE))
      formulas.push([
        `=IF(${playerNameColLetter}${row}="", "", IF(COUNTIF(RookieLedger_Import!$${rookieCol}:$${rookieCol}, ${playerNameColLetter}${row}) > 0, TRUE, FALSE))`
      ]);
    }
    historySheet.getRange(2, historyIsRookieCol + 1, formulas.length, 1).setFormulas(formulas);
  }

  // Apply to DevyRetentionHistory
  const retentionSheet = getDevyRetentionHistorySheet();
  const retentionData = retentionSheet.getDataRange().getValues();
  const retentionHeaders = retentionData[0];
  const retentionPlayerNameCol = retentionHeaders.indexOf("PlayerName");
  const retentionIsRookieCol = retentionHeaders.indexOf("IsRookie");

  if (retentionPlayerNameCol !== -1 && retentionIsRookieCol !== -1) {
    const retentionPlayerNameColLetter = String.fromCharCode(65 + retentionPlayerNameCol);
    const retentionLastRow = retentionSheet.getLastRow();

    if (retentionLastRow > 1) {
      const formulas = [];
      for (let row = 2; row <= retentionLastRow; row++) {
        formulas.push([
          `=IF(${retentionPlayerNameColLetter}${row}="", "", IF(COUNTIF(RookieLedger_Import!$${rookieCol}:$${rookieCol}, ${retentionPlayerNameColLetter}${row}) > 0, TRUE, FALSE))`
        ]);
      }
      retentionSheet.getRange(2, retentionIsRookieCol + 1, formulas.length, 1).setFormulas(formulas);
    }
  }

  ui.alert(
    "Formulas Applied",
    `IsRookie formulas applied to:\n\n` +
    `• DevyDraftHistory: ${historyLastRow - 1} rows\n` +
    `• DevyRetentionHistory: ${retentionSheet.getLastRow() - 1} rows\n\n` +
    `Players appearing in RookieLedger will show IsRookie = TRUE\n` +
    `(meaning they've entered the NFL and are no longer devy players)`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * TEST: Create sample backfill data for testing
 */
function TEST_CreateSampleBackfillData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("BackfillData");

  if (!sheet) {
    sheet = ss.insertSheet("BackfillData");
  } else {
    sheet.clear();
  }

  // Sample data matching the CSV format
  const sampleData = [
    ["Year", "Pick", "Conference", "School", "School ID", "Player", "Player ID", "Position", "Rebate", "Years Retained", "Rebate Amount", "Adjusted Rebate", "Proj. Score", "Proj. Star Ranking", "Recruited in Auction", "Recruited", "Final Auction"],
    [2021, "1.01", "P12", "Arizona Wildcats", "", "Breece Hall", "", "RB", "$20", "", "$20", "", "84.29", "⭐⭐⭐⭐⭐", "FALSE", "☐", ""],
    [2021, "1.02", "P12", "BYU Cougars", "", "Isaiah Spiller", "", "RB", "$20", "", "$20", "", "38.70", "⭐⭐⭐", "FALSE", "☐", ""],
    [2021, "1.03", "P12", "ASU Sun Devils", "", "David Bell", "", "WR", "$20", "0", "$20", "$20", "38.90", "⭐⭐⭐", "TRUE", "☑", "$61"],
    [2021, "1.04", "P12", "Utah Utes", "", "Malik Willis", "", "QB", "$20", "0", "$20", "$20", "42.33", "⭐⭐⭐⭐", "TRUE", "☑", "$30"],
    [2021, "1.05", "P12", "Oregon Ducks", "", "Garrett Wilson", "", "WR", "$20", "0", "$20", "$20", "59.00", "⭐⭐⭐⭐", "TRUE", "☑", "$71"],
    [2021, "2.01", "P12", "Oregon State Beavers", "", "Justyn Ross", "", "WR", "$20", "0", "$20", "$8", "34.00", "⭐⭐⭐", "TRUE", "☑", "$8"],
    [2021, "2.02", "P12", "WSU Cougars", "", "", "", "", "", "", "", "", "", "", "FALSE", "☐", ""],  // Empty pick - will be skipped
  ];

  sheet.getRange(1, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
  sheet.getRange(1, 1, 1, sampleData[0].length).setFontWeight("bold");

  Logger.log("✅ Sample backfill data created in 'BackfillData' sheet");
  Logger.log("   Now run TEST_PreviewImport() or TEST_RunImport()");
}

/**
 * TEST: Preview import of sample data
 */
function TEST_PreviewImport() {
  const result = importHistoricalPicks(true);
  Logger.log("Preview Result:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.unmatchedTeams && result.unmatchedTeams.length > 0) {
    Logger.log("\nTeams without Franchise ID matches:");
    result.unmatchedTeams.forEach(t => Logger.log("  - " + t));
    Logger.log("\nThese team names will be imported - update Franchise IDs manually after import.");
  }
}

/**
 * TEST: Actually import sample data
 */
function TEST_RunImport() {
  const result = importHistoricalPicks(false);
  Logger.log("Import Result:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("\n✅ Check the DevyDraftHistory sheet to see imported picks");

    if (result.unmatchedTeams && result.unmatchedTeams.length > 0) {
      Logger.log("\n⚠️ Update Franchise IDs for these teams manually:");
      result.unmatchedTeams.forEach(t => Logger.log("  - " + t));
    }
  }
}
