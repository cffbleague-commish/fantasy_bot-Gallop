/**
 * WEEKLY RESULTS CACHE
 * Caches weekly results data in a sheet to avoid repeated API calls
 * Results are immutable once a week is played, so caching is safe
 */

/**
 * Get or create the WeeklyResults sheet
 * @returns {Sheet} - The WeeklyResults sheet
 */
function getWeeklyResultsSheet() {
  const config = getConfig();
  const headers = [
    "Year", "Week", "FranchiseID", "TeamScore", "Result",
    "PlayerID", "PlayerScore", "IsStarter", "ShouldStart", "CachedAt"
  ];

  return getOrCreateSheet(config.sheets.weeklyResults, headers);
}

/**
 * Check if a specific week's results are cached
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 * @returns {Boolean} - True if cached
 */
function isWeekCached(year, week) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return false; // Only headers

  // Check if any row matches year and week
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(year) && Number(data[i][1]) === Number(week)) {
      return true;
    }
  }

  return false;
}

/**
 * Get cached weeks for a year
 * @param {String|Number} year - Season year
 * @returns {Array} - Array of cached week numbers
 */
function getCachedWeeks(year) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const weeks = new Set();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(year)) {
      weeks.add(Number(data[i][1]));
    }
  }

  return [...weeks].sort((a, b) => a - b);
}

/**
 * Cache weekly results for a specific week
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 * @param {Array} results - Array of franchise results from fetchWeeklyResults
 */
function cacheWeeklyResults(year, week, results) {
  const sheet = getWeeklyResultsSheet();
  const now = new Date();
  const rows = [];

  results.forEach(franchise => {
    franchise.players.forEach(player => {
      rows.push([
        Number(year),
        Number(week),
        franchise.franchiseId,
        franchise.score,
        franchise.result,
        player.playerId,
        player.score,
        player.isStarter,
        player.shouldStart,
        now
      ]);
    });
  });

  if (rows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, 10).setValues(rows);
  }
}

/**
 * Load cached weekly results for a specific week
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 * @returns {Array} - Array of franchise results (same format as fetchWeeklyResults)
 */
function loadCachedWeeklyResults(year, week) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  // Group by franchise
  const franchiseMap = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (Number(row[0]) !== Number(year) || Number(row[1]) !== Number(week)) {
      continue;
    }

    // Normalize franchise ID to 3-digit padded string (Google Sheets may convert "001" to 1)
    const franchiseId = String(Number(row[2] || 0)).padStart(3, "0");
    const teamScore = row[3];
    const result = row[4];
    const playerId = row[5];
    const playerScore = row[6];
    const isStarter = row[7];
    const shouldStart = row[8];

    if (!franchiseMap[franchiseId]) {
      franchiseMap[franchiseId] = {
        franchiseId: franchiseId,
        score: teamScore,
        result: result,
        players: []
      };
    }

    franchiseMap[franchiseId].players.push({
      playerId: String(playerId),
      score: Number(playerScore),
      isStarter: isStarter === true || isStarter === "true",
      shouldStart: shouldStart === true || shouldStart === "true"
    });
  }

  return Object.values(franchiseMap);
}

/**
 * Load all cached weekly results for a year (multiple weeks)
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Object} - Map of week number -> weekly results array
 */
function loadAllCachedWeeklyResults(year, throughWeek) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return {};

  // Group by week, then by franchise
  const weekMap = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowYear = Number(row[0]);
    const rowWeek = Number(row[1]);

    if (rowYear !== Number(year) || rowWeek > throughWeek) {
      continue;
    }

    if (!weekMap[rowWeek]) {
      weekMap[rowWeek] = {};
    }

    // Normalize franchise ID to 3-digit padded string (Google Sheets may convert "001" to 1)
    const franchiseId = String(Number(row[2] || 0)).padStart(3, "0");
    const teamScore = row[3];
    const result = row[4];
    const playerId = row[5];
    const playerScore = row[6];
    const isStarter = row[7];
    const shouldStart = row[8];

    if (!weekMap[rowWeek][franchiseId]) {
      weekMap[rowWeek][franchiseId] = {
        franchiseId: franchiseId,
        score: teamScore,
        result: result,
        players: []
      };
    }

    weekMap[rowWeek][franchiseId].players.push({
      playerId: String(playerId),
      score: Number(playerScore),
      isStarter: isStarter === true || isStarter === "true",
      shouldStart: shouldStart === true || shouldStart === "true"
    });
  }

  // Convert franchise maps to arrays
  const cache = {};
  Object.entries(weekMap).forEach(([week, franchises]) => {
    cache[week] = Object.values(franchises);
  });

  return cache;
}

/**
 * Fetch weekly results with caching
 * Checks cache first, then fetches from API if not cached
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 * @returns {Array} - Array of franchise results
 */
function getWeeklyResultsWithCache(year, week) {
  // Check if cached
  if (isWeekCached(year, week)) {
    return loadCachedWeeklyResults(year, week);
  }

  // Fetch from API
  const results = fetchWeeklyResults(year, week);

  // Cache if we got results
  if (results && results.length > 0) {
    cacheWeeklyResults(year, week, results);
  }

  return results;
}

/**
 * Fetch all weekly results for a year with caching
 * Only makes API calls for weeks not already cached
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to include
 * @returns {Object} - Map of week number -> weekly results array
 */
function fetchAllWeeklyResultsWithCache(year, throughWeek) {
  // Load existing cache
  const cache = loadAllCachedWeeklyResults(year, throughWeek);
  const cachedWeeks = new Set(Object.keys(cache).map(Number));

  Logger.log(`    Cached weeks for ${year}: ${[...cachedWeeks].join(", ") || "none"}`);

  // Fetch missing weeks
  for (let week = 1; week <= throughWeek; week++) {
    if (cachedWeeks.has(week)) {
      continue; // Already cached
    }

    try {
      const results = fetchWeeklyResults(year, week);

      if (!results || results.length === 0) {
        Logger.log(`    Week ${week}: No results available (not yet played)`);
        continue;
      }

      // Cache and add to result
      cacheWeeklyResults(year, week, results);
      cache[week] = results;
      Logger.log(`    Week ${week}: Fetched and cached`);
    } catch (error) {
      Logger.log(`    Week ${week}: Error - ${error.message}`);
    }
  }

  return cache;
}

/**
 * Clear cached results for a specific year
 * Useful if you need to refresh data
 * @param {String|Number} year - Season year
 */
function clearWeeklyResultsCache(year) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  // Find rows to keep (header + other years)
  const rowsToKeep = [data[0]]; // Keep header
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) !== Number(year)) {
      rowsToKeep.push(data[i]);
    }
  }

  // Rewrite sheet
  sheet.clearContents();
  if (rowsToKeep.length > 0) {
    sheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
  }

  Logger.log(`Cleared weekly results cache for ${year}`);
}

/**
 * Clear cached results for a specific week
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 */
function clearWeekCache(year, week) {
  const sheet = getWeeklyResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  // Find rows to keep
  const rowsToKeep = [data[0]]; // Keep header
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) !== Number(year) || Number(data[i][1]) !== Number(week)) {
      rowsToKeep.push(data[i]);
    }
  }

  // Rewrite sheet
  sheet.clearContents();
  if (rowsToKeep.length > 0) {
    sheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
  }

  Logger.log(`Cleared week ${week} cache for ${year}`);
}

/**
 * Refresh the cache for a specific week (clear and re-fetch)
 * @param {String|Number} year - Season year
 * @param {Number} week - Week number
 */
function refreshWeekCache(year, week) {
  clearWeekCache(year, week);
  return getWeeklyResultsWithCache(year, week);
}

/**
 * Pre-populate cache for a year's regular season
 * Useful for backfilling historical data
 * @param {String|Number} year - Season year
 * @param {Number} throughWeek - Last week to cache (default: 12)
 */
function populateWeeklyResultsCache(year, throughWeek = 12) {
  Logger.log(`=== POPULATING WEEKLY RESULTS CACHE FOR ${year} ===`);

  const cachedWeeks = getCachedWeeks(year);
  Logger.log(`Already cached: weeks ${cachedWeeks.join(", ") || "none"}`);

  let fetched = 0;
  let skipped = 0;

  for (let week = 1; week <= throughWeek; week++) {
    if (cachedWeeks.includes(week)) {
      skipped++;
      continue;
    }

    try {
      const results = fetchWeeklyResults(year, week);

      if (!results || results.length === 0) {
        Logger.log(`  Week ${week}: No results (not played)`);
        continue;
      }

      cacheWeeklyResults(year, week, results);
      fetched++;
      Logger.log(`  Week ${week}: Cached (${results.length} franchises)`);
    } catch (error) {
      Logger.log(`  Week ${week}: Error - ${error.message}`);
    }
  }

  Logger.log(`\nComplete: ${fetched} weeks fetched, ${skipped} already cached`);
}
