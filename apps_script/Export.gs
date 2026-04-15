/**
 * EXPORT FUNCTIONS
 * Generate reports and exports for MFL integration
 */

/**
 * Generate Copy Info string for a player copy
 * Format: [Owner]_[Class]_[Redshirts][_Status]
 *
 * Examples:
 *   ND_SR_r21         - Notre Dame, Senior, traditional redshirt 2021
 *   FA_GR             - Free Agent, Graduated
 *   OSU_FR_m24        - Ohio State, Freshman, medical redshirt 2024
 *   MICH_JR_r22m23    - Michigan, Junior, both redshirts
 *   ND_SR_r21_D       - Declared early (released)
 *   OSU_JR_E          - Eligible to declare (pending decision)
 *   MICH_SR_N1        - Has 1 national award
 *   USC_JR_A2         - Has 2 all-conference selections
 *   ND_SR_N1A2        - Has 1 national + 2 all-conf awards
 *
 * @param {String} ownerFranchiseId - The franchise ID that owns this copy (or empty for FA)
 * @param {Number} eligibilityYearsUsed - Years of eligibility used
 * @param {Boolean} traditionalRedshirtUsed - Whether traditional redshirt was used
 * @param {Boolean} medicalRedshirtUsed - Whether medical redshirt was used
 * @param {String|Number} traditionalRedshirtYear - Year traditional redshirt was used
 * @param {String|Number} medicalRedshirtYear - Year medical redshirt was used
 * @param {Object} abbreviationMap - Map of franchiseId -> abbreviation
 * @param {Number} maxYears - Maximum eligibility years (default 4)
 * @param {Object} declarationInfo - Optional: { nationalAwards, allConfAwards, declaredEarly, retentionDecision }
 * @returns {String} - Formatted copy info string
 */
function generateCopyInfo(ownerFranchiseId, eligibilityYearsUsed, traditionalRedshirtUsed, medicalRedshirtUsed, traditionalRedshirtYear, medicalRedshirtYear, abbreviationMap, maxYears = 4, declarationInfo = null) {
  // Owner part
  let owner = "FA";
  if (ownerFranchiseId && ownerFranchiseId !== "") {
    const normalizedId = String(Number(ownerFranchiseId)).padStart(3, "0");
    owner = abbreviationMap[normalizedId] || "UNK";
  }

  // Class part
  const classYear = getClassFromEligibility(eligibilityYearsUsed, maxYears);

  // Redshirt part
  let redshirtSuffix = "";
  if (traditionalRedshirtUsed) {
    const year = traditionalRedshirtYear ? String(traditionalRedshirtYear).slice(-2) : "";
    redshirtSuffix += year ? `r${year}` : "r";
  }
  if (medicalRedshirtUsed) {
    const year = medicalRedshirtYear ? String(medicalRedshirtYear).slice(-2) : "";
    redshirtSuffix += year ? `m${year}` : "m";
  }

  // Declaration/Award status part
  let statusSuffix = "";
  if (declarationInfo) {
    const nationalAwards = Number(declarationInfo.nationalAwards) || 0;
    const allConfAwards = Number(declarationInfo.allConfAwards) || 0;
    const declaredEarly = declarationInfo.declaredEarly === true || declarationInfo.declaredEarly === "TRUE";
    const retentionDecision = String(declarationInfo.retentionDecision || "").toUpperCase().trim();

    if (declaredEarly) {
      // Player has declared early (released)
      statusSuffix = "_D";
    } else {
      // Check if eligible for declaration (3+ program years and has awards)
      const totalProgramYears = eligibilityYearsUsed + (traditionalRedshirtUsed ? 1 : 0) + (medicalRedshirtUsed ? 1 : 0);
      const isEligible = totalProgramYears >= 3 && (nationalAwards >= 1 || allConfAwards >= 2);

      if (isEligible && retentionDecision === "") {
        // Eligible but no decision yet
        statusSuffix = "_E";
      }

      // Add award indicators
      let awardIndicator = "";
      if (nationalAwards > 0) {
        awardIndicator += `N${nationalAwards}`;
      }
      if (allConfAwards > 0) {
        awardIndicator += `A${allConfAwards}`;
      }

      if (awardIndicator && !statusSuffix) {
        statusSuffix = `_${awardIndicator}`;
      } else if (awardIndicator && statusSuffix) {
        statusSuffix = `${statusSuffix}${awardIndicator}`;
      }
    }
  }

  // Combine parts
  let result = `${owner}_${classYear}`;
  if (redshirtSuffix) {
    result += `_${redshirtSuffix}`;
  }
  if (statusSuffix) {
    result += statusSuffix;
  }

  return result;
}

/**
 * Export player roster for a specific conference
 * Creates a sheet with MFL import format: Player;Contract Status;Contract Info
 *
 * @param {String} conference - The conference to export
 * @returns {Object} - Summary of export
 */
function exportConferenceRoster(conference) {
  if (!conference) {
    throw new Error("Conference parameter is required");
  }

  const config = getConfig();
  const currentYear = Number(getLeagueYear());
  const maxYears = config.eligibility.maxYears;

  Logger.log(`=== EXPORTING ROSTER FOR ${conference} ===`);

  // Get all needed data
  const abbreviationMap = getFranchiseAbbreviationMap();
  Logger.log(`  Abbreviation map has ${Object.keys(abbreviationMap).length} entries`);

  const playerCopiesSheet = getPlayerCopiesSheet();
  const copiesData = playerCopiesSheet.getDataRange().getValues();
  const copies = copiesData.slice(1);
  Logger.log(`  Total player copies: ${copies.length}`);

  // Column indices for PlayerCopies
  const copyIdCol = 0;
  const playerIdCol = 1;
  const playerNameCol = 2;
  const conferenceCol = 3;
  const ownerCol = 4;
  const eligibilityCol = 5;
  const traditionalUsedCol = 6;
  const medicalUsedCol = 7;
  const createdSeasonCol = 8;
  const activeCol = 9;
  const traditionalYearCol = 11;
  const medicalYearCol = 12;
  const nationalAwardsCol = 13;
  const allConfAwardsCol = 14;
  const declaredEarlyCol = 16;
  const retentionDecisionCol = 18;

  // Debug: Show unique conferences in the data
  const uniqueConferences = new Set(copies.map(row => row[conferenceCol]));
  Logger.log(`  Conferences in data: ${Array.from(uniqueConferences).join(', ')}`);

  // Filter copies for this conference and group by player
  const playerCopies = {}; // playerId -> { name, copies: [copy1, copy2] }
  let matchedRows = 0;

  copies.forEach(row => {
    if (row[conferenceCol] !== conference) return;
    matchedRows++;

    const playerId = String(row[playerIdCol]);
    const playerName = row[playerNameCol];
    const copyId = row[copyIdCol];

    // Determine copy number from ID (e.g., PC-12345-ACC-1 -> 1)
    const copyNum = copyId.endsWith("-1") ? 1 : copyId.endsWith("-2") ? 2 : 0;

    if (!playerCopies[playerId]) {
      playerCopies[playerId] = {
        name: playerName,
        copies: [null, null]
      };
    }

    // Build declaration info for export
    const declarationInfo = {
      nationalAwards: row[nationalAwardsCol],
      allConfAwards: row[allConfAwardsCol],
      declaredEarly: row[declaredEarlyCol],
      retentionDecision: row[retentionDecisionCol]
    };

    const copyInfo = generateCopyInfo(
      row[ownerCol],
      Number(row[eligibilityCol]) || 0,
      row[traditionalUsedCol] === true || row[traditionalUsedCol] === "TRUE",
      row[medicalUsedCol] === true || row[medicalUsedCol] === "TRUE",
      row[traditionalYearCol],
      row[medicalYearCol],
      abbreviationMap,
      maxYears,
      declarationInfo
    );

    if (copyNum === 1) {
      playerCopies[playerId].copies[0] = copyInfo;
    } else if (copyNum === 2) {
      playerCopies[playerId].copies[1] = copyInfo;
    }
  });

  Logger.log(`  Matched ${matchedRows} rows for conference "${conference}"`);

  // Create or get export sheet
  const exportSheetName = `Export_${conference}`;
  const ss = SpreadsheetApp.getActive();
  let exportSheet = ss.getSheetByName(exportSheetName);

  if (exportSheet) {
    // Clear existing data
    exportSheet.clear();
  } else {
    exportSheet = ss.insertSheet(exportSheetName);
  }

  // Write MFL import format header
  const headers = ["Player", "Contract Status", "Contract Info"];
  exportSheet.appendRow(headers);
  exportSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  exportSheet.setFrozenRows(1);

  // Write player data (MFL format uses Player Name for Player column)
  const rows = [];
  Object.entries(playerCopies)
    .sort((a, b) => a[1].name.localeCompare(b[1].name)) // Sort by player name
    .forEach(([playerId, data]) => {
      rows.push([
        data.name,               // Player (Player Name)
        data.copies[0] || "",    // Contract Status (Copy 1 Info)
        data.copies[1] || ""     // Contract Info (Copy 2 Info)
      ]);
    });

  if (rows.length > 0) {
    exportSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Format columns
  exportSheet.setColumnWidth(1, 100);  // Player
  exportSheet.setColumnWidth(2, 150);  // Contract Status
  exportSheet.setColumnWidth(3, 150);  // Contract Info

  Logger.log(`Exported ${rows.length} players to ${exportSheetName}`);

  return {
    conference: conference,
    playerCount: rows.length,
    sheetName: exportSheetName
  };
}

/**
 * Export conference roster as MFL import text (semicolon-delimited)
 * Creates a sheet with a single cell containing the full import text
 *
 * @param {String} conference - The conference to export
 * @returns {Object} - Summary of export including the import text
 */
function exportConferenceForMFL(conference) {
  if (!conference) {
    throw new Error("Conference parameter is required");
  }

  const config = getConfig();
  const maxYears = config.eligibility.maxYears;

  Logger.log(`=== EXPORTING MFL IMPORT FOR ${conference} ===`);

  // Get all needed data
  const abbreviationMap = getFranchiseAbbreviationMap();
  const playerCopiesSheet = getPlayerCopiesSheet();
  const copiesData = playerCopiesSheet.getDataRange().getValues();
  const copies = copiesData.slice(1);

  // Column indices for PlayerCopies
  const copyIdCol = 0;
  const playerIdCol = 1;
  const playerNameCol = 2;
  const conferenceCol = 3;
  const ownerCol = 4;
  const eligibilityCol = 5;
  const traditionalUsedCol = 6;
  const medicalUsedCol = 7;
  const traditionalYearCol = 11;
  const medicalYearCol = 12;
  const nationalAwardsCol = 13;
  const allConfAwardsCol = 14;
  const declaredEarlyCol = 16;
  const retentionDecisionCol = 18;

  // Filter copies for this conference and group by player
  const playerCopies = {}; // playerId -> { name, copies: [copy1, copy2] }

  copies.forEach(row => {
    if (row[conferenceCol] !== conference) return;

    const playerId = String(row[playerIdCol]);
    const playerName = row[playerNameCol];
    const copyId = row[copyIdCol];

    // Determine copy number from ID (e.g., PC-12345-ACC-1 -> 1)
    const copyNum = copyId.endsWith("-1") ? 1 : copyId.endsWith("-2") ? 2 : 0;

    if (!playerCopies[playerId]) {
      playerCopies[playerId] = {
        name: playerName,
        copies: [null, null]
      };
    }

    // Build declaration info for export
    const declarationInfo = {
      nationalAwards: row[nationalAwardsCol],
      allConfAwards: row[allConfAwardsCol],
      declaredEarly: row[declaredEarlyCol],
      retentionDecision: row[retentionDecisionCol]
    };

    const copyInfo = generateCopyInfo(
      row[ownerCol],
      Number(row[eligibilityCol]) || 0,
      row[traditionalUsedCol] === true || row[traditionalUsedCol] === "TRUE",
      row[medicalUsedCol] === true || row[medicalUsedCol] === "TRUE",
      row[traditionalYearCol],
      row[medicalYearCol],
      abbreviationMap,
      maxYears,
      declarationInfo
    );

    if (copyNum === 1) {
      playerCopies[playerId].copies[0] = copyInfo;
    } else if (copyNum === 2) {
      playerCopies[playerId].copies[1] = copyInfo;
    }
  });

  // Build MFL import lines
  const lines = ["Player;Contract Status;Contract Info"]; // Header

  Object.entries(playerCopies)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([playerId, data]) => {
      lines.push(`${data.name};${data.copies[0] || ""};${data.copies[1] || ""}`);
    });

  const importText = lines.join("\n");

  // Create or get export sheet
  const exportSheetName = `MFL_Import_${conference}`;
  const ss = SpreadsheetApp.getActive();
  let exportSheet = ss.getSheetByName(exportSheetName);

  if (exportSheet) {
    exportSheet.clear();
  } else {
    exportSheet = ss.insertSheet(exportSheetName);
  }

  // Write the full import text to cell A1
  exportSheet.getRange(1, 1).setValue(importText);

  // Also write as separate rows for reference (starting at row 3)
  exportSheet.getRange(3, 1).setValue("--- Parsed View (for reference) ---");
  exportSheet.getRange(3, 1).setFontWeight("bold");

  const headers = ["Player", "Contract Status", "Contract Info"];
  exportSheet.getRange(4, 1, 1, headers.length).setValues([headers]);
  exportSheet.getRange(4, 1, 1, headers.length).setFontWeight("bold");

  const rows = [];
  Object.entries(playerCopies)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([playerId, data]) => {
      rows.push([data.name, data.copies[0] || "", data.copies[1] || ""]);
    });

  if (rows.length > 0) {
    exportSheet.getRange(5, 1, rows.length, headers.length).setValues(rows);
  }

  // Format
  exportSheet.setColumnWidth(1, 400); // Wide for import text
  exportSheet.setColumnWidth(2, 150);
  exportSheet.setColumnWidth(3, 150);

  Logger.log(`Exported ${rows.length} players to ${exportSheetName}`);
  Logger.log(`MFL import text ready in cell A1`);

  return {
    conference: conference,
    playerCount: rows.length,
    sheetName: exportSheetName,
    importText: importText
  };
}

/**
 * Export all conferences to separate sheets
 * @returns {Object} - Summary of all exports
 */
function exportAllConferences() {
  const conferences = getConferences();
  const results = [];

  conferences.forEach(conference => {
    const result = exportConferenceRoster(conference);
    results.push(result);
  });

  Logger.log(`\n=== EXPORT COMPLETE ===`);
  results.forEach(r => {
    Logger.log(`  ${r.conference}: ${r.playerCount} players -> ${r.sheetName}`);
  });

  return results;
}

/**
 * Menu prompt to export a specific conference (spreadsheet format)
 */
function promptExportConference() {
  const ui = SpreadsheetApp.getUi();
  const conferences = getConferences();

  const response = ui.prompt(
    'Export Conference Roster',
    `Available conferences: ${conferences.join(', ')}\n\nEnter conference name:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const conference = response.getResponseText().trim();

  if (!conferences.includes(conference)) {
    ui.alert('Error', `Conference "${conference}" not found.\n\nAvailable: ${conferences.join(', ')}`, ui.ButtonSet.OK);
    return;
  }

  const result = exportConferenceRoster(conference);

  ui.alert(
    'Export Complete',
    `Exported ${result.playerCount} players for ${result.conference}.\n\nSee sheet: "${result.sheetName}"`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu prompt to export for MFL import (semicolon-delimited)
 */
function promptExportForMFL() {
  const ui = SpreadsheetApp.getUi();
  const conferences = getConferences();

  const response = ui.prompt(
    'Export for MFL Import',
    `This creates a semicolon-delimited format ready for MFL import.\n\nAvailable conferences: ${conferences.join(', ')}\n\nEnter conference name:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const conference = response.getResponseText().trim();

  if (!conferences.includes(conference)) {
    ui.alert('Error', `Conference "${conference}" not found.\n\nAvailable: ${conferences.join(', ')}`, ui.ButtonSet.OK);
    return;
  }

  const result = exportConferenceForMFL(conference);

  ui.alert(
    'MFL Export Complete',
    `Exported ${result.playerCount} players for ${result.conference}.\n\nSheet: "${result.sheetName}"\n\nThe MFL import text is in cell A1.\nCopy and paste it directly into MFL's import tool.`,
    ui.ButtonSet.OK
  );
}

/**
 * Export all conferences for MFL import
 */
function exportAllConferencesForMFL() {
  const conferences = getConferences();
  const results = [];

  conferences.forEach(conference => {
    const result = exportConferenceForMFL(conference);
    results.push(result);
  });

  Logger.log(`\n=== MFL EXPORT COMPLETE ===`);
  results.forEach(r => {
    Logger.log(`  ${r.conference}: ${r.playerCount} players -> ${r.sheetName}`);
  });

  return results;
}

/**
 * Menu prompt to export all conferences for MFL
 */
function promptExportAllForMFL() {
  const ui = SpreadsheetApp.getUi();
  const conferences = getConferences();

  const confirm = ui.alert(
    'Export All Conferences for MFL',
    `This will create MFL import sheets for ${conferences.length} conferences:\n${conferences.join(', ')}\n\nEach sheet will have semicolon-delimited text ready for MFL import.\n\nProceed?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  const results = exportAllConferencesForMFL();

  const summary = results.map(r => `${r.conference}: ${r.playerCount} players`).join('\n');

  ui.alert(
    'MFL Export Complete',
    `Exported ${results.length} conferences:\n\n${summary}\n\nEach sheet has the import text in cell A1.`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu prompt to export all conferences
 */
function promptExportAllConferences() {
  const ui = SpreadsheetApp.getUi();
  const conferences = getConferences();

  const confirm = ui.alert(
    'Export All Conferences',
    `This will create/update export sheets for ${conferences.length} conferences:\n${conferences.join(', ')}\n\nProceed?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  const results = exportAllConferences();

  const summary = results.map(r => `${r.conference}: ${r.playerCount} players`).join('\n');

  ui.alert(
    'Export Complete',
    `Exported ${results.length} conferences:\n\n${summary}`,
    ui.ButtonSet.OK
  );
}
