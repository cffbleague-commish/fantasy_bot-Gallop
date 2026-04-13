/**
 * RECRUITING ANALYTICS - WEB APP
 * Serves a public dashboard for viewing recruiting data.
 * Deploy as: Web app > Execute as me > Anyone can access.
 */

// ============================================================================
// WEB APP ENTRY POINT
// ============================================================================

/**
 * Serve the dashboard HTML.
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Recruiting Analytics Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include helper for templated HTML files.
 * Usage in HTML: <?!= include('Stylesheet') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// DATA API (called via google.script.run from client)
// ============================================================================

/**
 * Get list of available draft years from existing data.
 * Scans RecruitingBoard and RecruitingGrades for unique DraftYear values.
 * @returns {String[]} Years sorted descending (newest first)
 */
function getAvailableYears() {
  var config = getConfig();
  var ss = SpreadsheetApp.getActive();
  var years = {};

  // Scan RecruitingBoard (column 0 = DraftYear)
  var boardSheet = ss.getSheetByName(config.sheets.recruitingBoard);
  if (boardSheet && boardSheet.getLastRow() > 1) {
    boardSheet.getRange(2, 1, boardSheet.getLastRow() - 1, 1).getValues()
      .forEach(function(row) { if (row[0]) years[String(row[0])] = true; });
  }

  // Also scan RecruitingGrades
  var gradesSheet = ss.getSheetByName(config.sheets.recruitingGrades);
  if (gradesSheet && gradesSheet.getLastRow() > 1) {
    gradesSheet.getRange(2, 1, gradesSheet.getLastRow() - 1, 1).getValues()
      .forEach(function(row) { if (row[0]) years[String(row[0])] = true; });
  }

  return Object.keys(years).sort().reverse();
}

/**
 * Get Recruiting Board data for a specific draft year.
 * @param {String} year - Draft year
 * @returns {Object[]} Array of player objects
 */
function getRecruitingBoardData(year) {
  var config = getConfig();
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.recruitingBoard);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var yearStr = String(year);
  var results = [];

  data.slice(1).forEach(function(row) {
    if (String(row[0]) !== yearStr) return;
    results.push({
      stars: String(row[1]),
      rating: Number(row[2]) || 0,
      player: String(row[3]),
      position: String(row[4]),
      college: String(row[5]),
      espnGrade: row[6] !== "" && row[6] !== null ? Number(row[6]) : null,
      espnRank: row[7] !== "" && row[7] !== null ? Number(row[7]) : null,
      posRank: row[8] !== "" && row[8] !== null ? Number(row[8]) : null,
      draftRd: String(row[9] || ""),
      draftPick: row[10] !== "" && row[10] !== null ? Number(row[10]) : null,
      draftCapital: row[11] !== "" && row[11] !== null ? Number(row[11]) : null,
      startupADP: row[12] !== "" && row[12] !== null ? Number(row[12]) : null,
      adpTier: String(row[13] || ""),
      recruitScore: Number(row[14]) || 0,
      predictedCost: String(row[15] || ""),
      copy1_16: String(row[16] || ""),
      copy2_16: String(row[17] || ""),
      copy1_20: String(row[18] || ""),
      copy2_20: String(row[19] || ""),
      priceRange: String(row[20] || ""),
      confidence: String(row[23] || ""),
      headshotUrl: String(row[25] || "")
    });
  });

  return results;
}

/**
 * Get Team Rankings data for a specific draft year.
 * @param {String} year - Draft year
 * @returns {Object[]} Array of team summary objects
 */
function getTeamRankingsData(year) {
  var config = getConfig();
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.recruitingGrades);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var yearStr = String(year);
  var results = [];

  data.slice(1).forEach(function(row) {
    if (String(row[0]) !== yearStr) return;
    results.push({
      franchise: String(row[1]),
      conference: String(row[2]),
      classScore: Number(row[3]) || 0,
      classRank: Number(row[4]) || 0,
      confRank: Number(row[5]) || 0,
      star5: Number(row[6]) || 0,
      star4: Number(row[7]) || 0,
      star3: Number(row[8]) || 0,
      star2: Number(row[9]) || 0,
      star1: Number(row[10]) || 0,
      totalPlayers: Number(row[11]) || 0,
      totalSpent: String(row[12] || ""),
      avgSavings: String(row[13] || ""),
      efficiencyGrade: String(row[14] || ""),
      overallGrade: String(row[15] || ""),
      franchiseLogo: String(row[16] || "")
    });
  });

  return results;
}

/**
 * Get Player Grades data for a specific draft year.
 * @param {String} year - Draft year
 * @returns {Object[]} Array of player grade objects
 */
function getPlayerGradesData(year) {
  var config = getConfig();
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.playerGrades);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var yearStr = String(year);
  var results = [];

  data.slice(1).forEach(function(row) {
    if (String(row[0]) !== yearStr) return;
    results.push({
      franchise: String(row[1]),
      player: String(row[2]),
      position: String(row[3]),
      stars: Number(row[4]) || 1,
      recruitScore: Number(row[5]) || 0,
      bidAmount: String(row[6] || ""),
      predictedCost: String(row[7] || ""),
      leagueAvgPrice: String(row[8] || ""),
      savingsDollars: String(row[9] || ""),
      playerGrade: String(row[10] || "")
    });
  });

  return results;
}
