/**
 * UTILITY FUNCTIONS
 * Shared helper functions used across the app
 */

/**
 * Get list of all conferences from FranchiseLookup
 */
function getConferences() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) {
    throw new Error("FranchiseLookup sheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const confIdx = headers.indexOf("Conference");

  if (confIdx === -1) {
    throw new Error("Conference column not found in FranchiseLookup");
  }

  const conferences = new Set();

  data.slice(1).forEach(row => {
    const conf = String(row[confIdx]).trim();
    if (conf) conferences.add(conf);
  });

  return Array.from(conferences).sort();
}

/**
 * Get franchise ID to conference mapping
 */
function getFranchiseConferenceMap() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) {
    throw new Error("FranchiseLookup sheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idIdx = headers.indexOf("Franchise ID");
  const confIdx = headers.indexOf("Conference");

  if (idIdx === -1 || confIdx === -1) {
    throw new Error("Required columns not found in FranchiseLookup");
  }

  const map = {};

  data.slice(1).forEach(row => {
    // Convert to number first to strip any leading zeros, then pad to 3 digits
    const franchiseId = String(Number(row[idIdx] || 0)).padStart(3, "0");
    const conference = String(row[confIdx]).trim();
    map[franchiseId] = conference;
  });

  return map;
}

/**
 * Normalize franchise ID to 3 digits with leading zeros
 * Converts to number first to strip any existing leading zeros
 */
function normalizeFranchiseId(id) {
  if (!id) return "";
  return String(Number(id)).padStart(3, "0");
}

/**
 * Get franchise ID to abbreviation mapping
 * @returns {Object} - Map of franchiseId -> abbreviation
 */
function getFranchiseAbbreviationMap() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.franchiseLookup);

  if (!sheet) {
    throw new Error("FranchiseLookup sheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idIdx = headers.indexOf("Franchise ID");
  const abbrIdx = headers.indexOf("Abbreviation");

  if (idIdx === -1) {
    throw new Error("Franchise ID column not found in FranchiseLookup");
  }

  if (abbrIdx === -1) {
    throw new Error("Abbreviation column not found in FranchiseLookup. Please add an 'Abbreviation' column.");
  }

  const map = {};

  data.slice(1).forEach(row => {
    const franchiseId = String(Number(row[idIdx] || 0)).padStart(3, "0");
    const abbreviation = String(row[abbrIdx] || "").trim();
    if (abbreviation) {
      map[franchiseId] = abbreviation;
    }
  });

  return map;
}

/**
 * Convert eligibility years used to class name
 * @param {Number} yearsUsed - Eligibility years used (0-4)
 * @param {Number} maxYears - Maximum eligibility years (default 4)
 * @returns {String} - Class abbreviation (FR, SO, JR, SR, GR)
 */
function getClassFromEligibility(yearsUsed, maxYears = 4) {
  const yearsRemaining = maxYears - yearsUsed;

  if (yearsRemaining >= 4) return "FR";  // Freshman - 4 years left
  if (yearsRemaining === 3) return "SO"; // Sophomore - 3 years left
  if (yearsRemaining === 2) return "JR"; // Junior - 2 years left
  if (yearsRemaining === 1) return "SR"; // Senior - 1 year left
  return "GR";                            // Graduated - 0 years left
}

/**
 * Get or create a sheet with headers
 * If sheet exists but headers don't match, updates the headers
 */
function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    // Create new sheet
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  } else if (headers && headers.length > 0) {
    // Sheet exists - verify headers match
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Check if headers need updating (different count or different values)
    const needsUpdate = existingHeaders.length !== headers.length ||
      !headers.every((h, i) => existingHeaders[i] === h);

    if (needsUpdate) {
      Logger.log(`Updating headers for ${sheetName} sheet (${existingHeaders.length} -> ${headers.length} columns)`);

      // Clear existing header row and set new headers
      if (sheet.getLastColumn() > 0) {
        sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }

  return sheet;
}
