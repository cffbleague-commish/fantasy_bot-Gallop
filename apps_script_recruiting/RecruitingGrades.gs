/**
 * RECRUITING ANALYTICS - RECRUITING GRADES
 * Evaluates team performance in rookie auctions with three metrics:
 *   1. Individual Player Auction Grade — letter grade per player (bid vs predicted/league avg)
 *   2. Recruiting Class Score — numeric per team (star-weighted recruit scores)
 *   3. Overall Auction Grade — letter grade per team (talent + efficiency blend)
 *
 * Reads from AuctionData (actual bids) and RecruitingBoard (predictions/ratings).
 */

// ============================================================================
// CONSTANTS
// ============================================================================

var STAR_MULTIPLIERS = { 5: 1.5, 4: 1.2, 3: 1.0, 2: 0.6, 1: 0.3 };

var PLAYER_GRADE_THRESHOLDS = [
  { grade: "A+", minSavings: 40 },
  { grade: "A",  minSavings: 25 },
  { grade: "B+", minSavings: 15 },
  { grade: "B",  minSavings: 5 },
  { grade: "C+", minSavings: -5 },
  { grade: "C",  minSavings: -15 },
  { grade: "D+", minSavings: -25 },
  { grade: "D",  minSavings: -40 },
  { grade: "F",  minSavings: -Infinity }
];

var OVERALL_GRADE_THRESHOLDS = [
  { grade: "A+", minPct: 95 },
  { grade: "A",  minPct: 85 },
  { grade: "B+", minPct: 70 },
  { grade: "B",  minPct: 50 },
  { grade: "C+", minPct: 30 },
  { grade: "C",  minPct: 15 },
  { grade: "D",  minPct: 5 },
  { grade: "F",  minPct: 0 }
];

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate recruiting grades for the current league year.
 */
function generateRecruitingGrades() {
  generateRecruitingGradesForYear(getLeagueYear());
}

/**
 * Generate recruiting grades for a specific auction year.
 * Joins AuctionData (actual bids) with RecruitingBoard (predictions/ratings)
 * to produce individual player grades, class scores, and overall team grades.
 *
 * @param {String|Number} year - The auction year to grade
 */
function generateRecruitingGradesForYear(year) {
  var config = getConfig();
  var yearStr = String(year);
  var yearNum = Number(year);

  Logger.log("=== GENERATING RECRUITING GRADES (" + yearStr + ") ===\n");

  // --- 1. Load data ---
  var auctions = loadRookieAuctions(yearNum, config);
  if (auctions.length === 0) {
    Logger.log("  No rookie auctions found for " + yearStr + ". Run import first.");
    return;
  }
  Logger.log("  Rookie auctions loaded: " + auctions.length);

  var boardLookup = loadRecruitingBoardLookup(yearStr, config);
  Logger.log("  Board lookup entries: " + Object.keys(boardLookup).length);

  // --- 2. Build league-wide average price per player ---
  var leagueAvgPrices = buildLeagueAvgPrices(auctions);

  // --- 3. Match auctions to board and compute player grades ---
  var matched = matchAuctionsToBoard(auctions, boardLookup);
  matched.forEach(function(m) {
    var avgPrice = leagueAvgPrices[normalizeNameForMatch(m.playerName)] || null;
    m.leagueAvgPrice = avgPrice;
    m.playerGrade = calcPlayerGrade(m.bidAmount, m.predictedCost, avgPrice);
    m.savingsPct = calcBlendedSavings(m.bidAmount, m.predictedCost, avgPrice);
  });

  // --- 4. Compute class scores per franchise ---
  var franchiseMap = {};
  matched.forEach(function(m) {
    if (!franchiseMap[m.franchiseId]) {
      franchiseMap[m.franchiseId] = {
        franchiseId: m.franchiseId,
        franchiseName: m.franchiseName,
        conference: m.conference,
        players: []
      };
    }
    franchiseMap[m.franchiseId].players.push(m);
  });

  var franchises = Object.keys(franchiseMap).map(function(fid) {
    var f = franchiseMap[fid];
    var classData = calcClassScore(f.players);
    f.classScore = classData.classScore;
    f.starBreakdown = classData.starBreakdown;
    f.totalPlayers = f.players.length;
    f.totalSpent = f.players.reduce(function(s, p) { return s + p.bidAmount; }, 0);

    // Average savings % (only for players with a grade)
    var gradedPlayers = f.players.filter(function(p) { return p.savingsPct !== null; });
    f.avgSavingsPct = gradedPlayers.length > 0
      ? gradedPlayers.reduce(function(s, p) { return s + p.savingsPct; }, 0) / gradedPlayers.length
      : null;

    return f;
  });

  // --- 5. Compute overall grades (percentile-based) ---
  calcOverallGrades(franchises);

  // Log summary
  franchises.sort(function(a, b) { return b.classScore - a.classScore; });
  Logger.log("\n  Top 5 recruiting classes:");
  franchises.slice(0, 5).forEach(function(f, i) {
    Logger.log("    " + (i + 1) + ". " + f.franchiseName + " — Score: " +
      f.classScore.toFixed(1) + ", Grade: " + f.overallGrade + ", Players: " + f.totalPlayers);
  });

  // --- 6. Write output ---
  writeRecruitingGrades(yearStr, franchises, config);

  Logger.log("\n=== RECRUITING GRADES COMPLETE ===");
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load rookie auction records for a given year from AuctionData.
 * Filters to IsRookie === "TRUE" and matching year.
 *
 * @param {Number} year - Auction year
 * @param {Object} config - From getConfig()
 * @returns {Array} - Array of auction record objects
 */
function loadRookieAuctions(year, config) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.auctionData);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  data.slice(1).forEach(function(row) {
    var auctionYear = Number(row[0]) || 0;
    if (auctionYear !== year) return;

    var isRookie = String(row[12]).toUpperCase() === "TRUE";
    if (!isRookie) return;

    var position = String(row[3]);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return;

    results.push({
      playerName: String(row[2]),
      position: position,
      franchiseId: String(row[8]),
      franchiseName: String(row[9]),
      conference: String(row[10]),
      bidAmount: Number(row[11]) || 0
    });
  });

  return results;
}

/**
 * Build a lookup map from the RecruitingBoard sheet for a given draft year.
 * Keyed by normalizedName → { stars, rating, recruitScore, predictedCost, position }
 *
 * @param {String} yearStr - Draft year string
 * @param {Object} config - From getConfig()
 * @returns {Object} - Lookup map
 */
function loadRecruitingBoardLookup(yearStr, config) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.recruitingBoard);
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  var lookup = {};
  data.slice(1).forEach(function(row) {
    if (String(row[0]) !== yearStr) return;

    var playerName = String(row[3]);
    var normalizedName = normalizeNameForMatch(playerName);
    if (!normalizedName) return;

    // Predicted Cost is stored as "$123" — strip the $ sign
    var rawPredicted = String(row[15] || "");
    var predictedCost = rawPredicted.charAt(0) === "$"
      ? Number(rawPredicted.substring(1))
      : (rawPredicted !== "" ? Number(rawPredicted) : null);
    if (predictedCost !== null && isNaN(predictedCost)) predictedCost = null;

    lookup[normalizedName] = {
      stars: Number(row[2]) || 1,
      recruitScore: Number(row[14]) || 0,
      predictedCost: predictedCost,
      position: String(row[4])
    };
  });

  return lookup;
}

// ============================================================================
// MATCHING & GRADING
// ============================================================================

/**
 * Build league-wide average price per player (across all conferences).
 * Groups by normalized player name, averages all bids.
 *
 * @param {Array} auctions - From loadRookieAuctions()
 * @returns {Object} - normalizedName → average bid amount
 */
function buildLeagueAvgPrices(auctions) {
  var groups = {};
  auctions.forEach(function(a) {
    var key = normalizeNameForMatch(a.playerName);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a.bidAmount);
  });

  var avgs = {};
  Object.keys(groups).forEach(function(key) {
    var bids = groups[key];
    avgs[key] = bids.reduce(function(s, v) { return s + v; }, 0) / bids.length;
  });
  return avgs;
}

/**
 * Join auction records to RecruitingBoard data by normalized player name.
 * Attaches stars, recruitScore, predictedCost to each auction record.
 *
 * @param {Array} auctions - From loadRookieAuctions()
 * @param {Object} boardLookup - From loadRecruitingBoardLookup()
 * @returns {Array} - Enriched auction records
 */
function matchAuctionsToBoard(auctions, boardLookup) {
  return auctions.map(function(a) {
    var key = normalizeNameForMatch(a.playerName);
    var board = boardLookup[key] || null;

    return {
      playerName: a.playerName,
      position: a.position,
      franchiseId: a.franchiseId,
      franchiseName: a.franchiseName,
      conference: a.conference,
      bidAmount: a.bidAmount,
      stars: board ? board.stars : 1,
      recruitScore: board ? board.recruitScore : 0,
      predictedCost: board ? board.predictedCost : null,
      leagueAvgPrice: null,   // filled in later
      playerGrade: null,      // filled in later
      savingsPct: null         // filled in later
    };
  });
}

/**
 * Calculate blended savings percentage for a player acquisition.
 * Signal A (60%): savings vs predicted cost
 * Signal B (40%): savings vs league average price
 *
 * @param {Number} bidAmount - What was paid
 * @param {Number|null} predictedCost - Model prediction
 * @param {Number|null} leagueAvgPrice - League-wide average for this player
 * @returns {Number|null} - Blended savings % or null if ungraded
 */
function calcBlendedSavings(bidAmount, predictedCost, leagueAvgPrice) {
  var hasA = predictedCost !== null && predictedCost > 0;
  var hasB = leagueAvgPrice !== null && leagueAvgPrice > 0;

  if (!hasA && !hasB) return null;

  var savingsA = hasA ? ((predictedCost - bidAmount) / predictedCost) * 100 : 0;
  var savingsB = hasB ? ((leagueAvgPrice - bidAmount) / leagueAvgPrice) * 100 : 0;

  if (hasA && hasB) return savingsA * 0.60 + savingsB * 0.40;
  if (hasA) return savingsA;
  return savingsB;
}

/**
 * Calculate individual player auction grade.
 *
 * @param {Number} bidAmount - What was paid
 * @param {Number|null} predictedCost - Model prediction
 * @param {Number|null} leagueAvgPrice - League-wide average for this player
 * @returns {String|null} - Letter grade (A+ through F) or null if ungraded
 */
function calcPlayerGrade(bidAmount, predictedCost, leagueAvgPrice) {
  var savings = calcBlendedSavings(bidAmount, predictedCost, leagueAvgPrice);
  if (savings === null) return null;

  for (var i = 0; i < PLAYER_GRADE_THRESHOLDS.length; i++) {
    if (savings >= PLAYER_GRADE_THRESHOLDS[i].minSavings) {
      return PLAYER_GRADE_THRESHOLDS[i].grade;
    }
  }
  return "F";
}

// ============================================================================
// CLASS SCORE
// ============================================================================

/**
 * Calculate recruiting class score for a team's auction haul.
 * Star-weighted sum of recruit scores.
 *
 * @param {Array} players - Matched auction records for one franchise
 * @returns {Object} - { classScore, starBreakdown: { 5: n, 4: n, ... } }
 */
function calcClassScore(players) {
  var classScore = 0;
  var starBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  players.forEach(function(p) {
    var mult = STAR_MULTIPLIERS[p.stars] || 0.3;
    classScore += p.recruitScore * mult;
    starBreakdown[p.stars] = (starBreakdown[p.stars] || 0) + 1;
  });

  return { classScore: classScore, starBreakdown: starBreakdown };
}

// ============================================================================
// OVERALL GRADES
// ============================================================================

/**
 * Calculate overall auction grades for all franchises using percentile rankings.
 * Mutates each franchise object to add: classRank, efficiencyGrade, overallGrade.
 *
 * @param {Array} franchises - Array of franchise objects with classScore and avgSavingsPct
 */
function calcOverallGrades(franchises) {
  if (franchises.length === 0) return;

  var n = franchises.length;

  // Rank by class score (desc)
  var byScore = franchises.slice().sort(function(a, b) { return b.classScore - a.classScore; });
  byScore.forEach(function(f, i) { f.classRank = i + 1; });

  // Talent percentile (higher class score = higher percentile)
  byScore.forEach(function(f, i) {
    f.talentPct = ((n - 1 - i) / Math.max(1, n - 1)) * 100;
  });

  // Efficiency percentile (higher avg savings = higher percentile)
  // Teams with no graded players get 0 percentile
  var byEfficiency = franchises.slice().sort(function(a, b) {
    var aVal = a.avgSavingsPct !== null ? a.avgSavingsPct : -Infinity;
    var bVal = b.avgSavingsPct !== null ? b.avgSavingsPct : -Infinity;
    return aVal - bVal;
  });
  byEfficiency.forEach(function(f, i) {
    f.efficiencyPct = ((i) / Math.max(1, n - 1)) * 100;
  });

  // Assign efficiency letter grade (using same player grade thresholds on avg savings %)
  franchises.forEach(function(f) {
    if (f.avgSavingsPct === null) {
      f.efficiencyGrade = "N/A";
    } else {
      f.efficiencyGrade = "F";
      for (var i = 0; i < PLAYER_GRADE_THRESHOLDS.length; i++) {
        if (f.avgSavingsPct >= PLAYER_GRADE_THRESHOLDS[i].minSavings) {
          f.efficiencyGrade = PLAYER_GRADE_THRESHOLDS[i].grade;
          break;
        }
      }
    }
  });

  // Blend: 60% talent + 40% efficiency → overall grade (percentile-based)
  franchises.forEach(function(f) {
    var overallScore = f.talentPct * 0.60 + f.efficiencyPct * 0.40;
    f.overallGrade = "F";
    for (var i = 0; i < OVERALL_GRADE_THRESHOLDS.length; i++) {
      if (overallScore >= OVERALL_GRADE_THRESHOLDS[i].minPct) {
        f.overallGrade = OVERALL_GRADE_THRESHOLDS[i].grade;
        break;
      }
    }
  });
}

// ============================================================================
// OUTPUT
// ============================================================================

/**
 * Write recruiting grades to the RecruitingGrades sheet.
 * Two sections: Team Summary then Player Detail.
 *
 * @param {String} yearStr - Draft year
 * @param {Array} franchises - Graded franchise objects (sorted by classScore desc)
 * @param {Object} config - From getConfig()
 */
function writeRecruitingGrades(yearStr, franchises, config) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(config.sheets.recruitingGrades);
  var isNewSheet = !sheet;

  if (isNewSheet) {
    sheet = ss.insertSheet(config.sheets.recruitingGrades);
  } else {
    // Remove existing rows for this year
    var existingData = sheet.getDataRange().getValues();
    for (var i = existingData.length - 1; i >= 1; i--) {
      if (String(existingData[i][0]) === yearStr) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  // --- Team Summary Section ---
  var teamHeaders = [
    "DraftYear", "Franchise", "Conference", "Class Score", "Class Rank",
    "5-Star", "4-Star", "3-Star", "2-Star", "1-Star",
    "Total Players", "Total Spent", "Avg Savings %",
    "Efficiency Grade", "Overall Grade"
  ];

  // Write team header if new sheet
  if (isNewSheet) {
    sheet.appendRow(teamHeaders);
    sheet.getRange(1, 1, 1, teamHeaders.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var teamRows = franchises.map(function(f) {
    return [
      Number(yearStr),
      f.franchiseName,
      f.conference,
      Math.round(f.classScore * 10) / 10,
      f.classRank,
      f.starBreakdown[5] || 0,
      f.starBreakdown[4] || 0,
      f.starBreakdown[3] || 0,
      f.starBreakdown[2] || 0,
      f.starBreakdown[1] || 0,
      f.totalPlayers,
      "$" + f.totalSpent,
      f.avgSavingsPct !== null ? (Math.round(f.avgSavingsPct * 10) / 10) + "%" : "N/A",
      f.efficiencyGrade,
      f.overallGrade
    ];
  });

  if (teamRows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, teamRows.length, teamHeaders.length).setValues(teamRows);
  }

  // --- Blank separator + Player Detail header ---
  var blankRow = new Array(teamHeaders.length).fill("");
  sheet.appendRow(blankRow);

  var detailHeaders = [
    "DraftYear", "Franchise", "Player", "Position", "Stars",
    "Recruit Score", "Bid Amount", "Predicted Cost", "League Avg Price",
    "Savings %", "Player Grade"
  ];
  // Pad to match team header width
  while (detailHeaders.length < teamHeaders.length) detailHeaders.push("");
  sheet.appendRow(detailHeaders);
  var detailHeaderRow = sheet.getLastRow();
  sheet.getRange(detailHeaderRow, 1, 1, teamHeaders.length).setFontWeight("bold");

  // --- Player Detail rows (sorted by franchise, then recruit score desc) ---
  var allPlayerRows = [];
  franchises.forEach(function(f) {
    var sorted = f.players.slice().sort(function(a, b) { return b.recruitScore - a.recruitScore; });
    sorted.forEach(function(p) {
      var row = [
        Number(yearStr),
        f.franchiseName,
        p.playerName,
        p.position,
        p.stars,
        Math.round(p.recruitScore * 10) / 10,
        "$" + p.bidAmount,
        p.predictedCost !== null ? "$" + p.predictedCost : "",
        p.leagueAvgPrice !== null ? "$" + (Math.round(p.leagueAvgPrice * 10) / 10) : "",
        p.savingsPct !== null ? (Math.round(p.savingsPct * 10) / 10) + "%" : "N/A",
        p.playerGrade || "N/A"
      ];
      while (row.length < teamHeaders.length) row.push("");
      allPlayerRows.push(row);
    });
  });

  if (allPlayerRows.length > 0) {
    var playerStartRow = sheet.getLastRow() + 1;
    sheet.getRange(playerStartRow, 1, allPlayerRows.length, teamHeaders.length).setValues(allPlayerRows);
  }

  // Set column widths on new sheet
  if (isNewSheet) {
    sheet.setColumnWidth(1, 75);    // DraftYear
    sheet.setColumnWidth(2, 180);   // Franchise
    sheet.setColumnWidth(3, 80);    // Conference
    sheet.setColumnWidth(4, 90);    // Class Score
    sheet.setColumnWidth(5, 80);    // Class Rank
    sheet.setColumnWidth(6, 60);    // 5-Star
    sheet.setColumnWidth(7, 60);    // 4-Star
    sheet.setColumnWidth(8, 60);    // 3-Star
    sheet.setColumnWidth(9, 60);    // 2-Star
    sheet.setColumnWidth(10, 60);   // 1-Star
    sheet.setColumnWidth(11, 90);   // Total Players
    sheet.setColumnWidth(12, 80);   // Total Spent
    sheet.setColumnWidth(13, 95);   // Avg Savings %
    sheet.setColumnWidth(14, 110);  // Efficiency Grade
    sheet.setColumnWidth(15, 100);  // Overall Grade
  }

  Logger.log("  Wrote " + teamRows.length + " team summaries and " +
    allPlayerRows.length + " player details to " + config.sheets.recruitingGrades);
}

// ============================================================================
// UI
// ============================================================================

/**
 * Prompt to generate recruiting grades for a specific year.
 */
function promptGenerateRecruitingGrades() {
  var ui = SpreadsheetApp.getUi();
  var currentYear = getLeagueYear();

  var response = ui.prompt(
    "Generate Recruiting Grades",
    "Enter the auction year to grade.\n\nCurrent league year: " + currentYear +
    "\n\nNote: Requires AuctionData and RecruitingBoard for the chosen year.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var yearInput = response.getResponseText().trim();
  if (!/^\d{4}$/.test(yearInput)) {
    ui.alert("Invalid year. Please enter a 4-digit year (e.g., 2025).");
    return;
  }

  generateRecruitingGradesForYear(yearInput);
  ui.alert("Recruiting Grades for " + yearInput + " generated. Check the RecruitingGrades tab.");
}
