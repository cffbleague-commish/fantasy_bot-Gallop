/**
 * MAIN ORCHESTRATION
 * High-level functions to run complete workflows
 */

/**
 * STEP 1: Run at start of season after NFL draft
 * Ingests rookies and creates their player copies
 */
function startNewSeason(year) {
  Logger.log(`=== Starting Season ${year} ===`);

  const rookiesAdded = ingestRookiesForYear(year);
  Logger.log(`Added ${rookiesAdded} rookies`);

  updatePlayerCopyOwnership(year);

  Logger.log(`✅ Season ${year} initialized`);
}

/**
 * STEP 2: Run weekly/bi-weekly during season
 * Updates roster ownership based on current MFL rosters
 */
function syncRosterOwnership(year) {
  Logger.log(`=== Syncing Roster Ownership for ${year} ===`);

  const updated = updatePlayerCopyOwnership(year);

  Logger.log(`✅ Updated ${updated} player copy ownerships`);
}

/**
 * STEP 3: Run at end of season BEFORE year rollover
 * Processes redshirts for players who stayed on Taxi/IR
 * Also syncs awards and processes early declarations
 */
function endSeasonProcessing(year) {
  Logger.log(`=== End of Season Processing for ${year} ===`);

  // Step 3a: Process redshirts
  const redshirtResults = processRedshirtsForSeason(year);
  Logger.log(`   Traditional Redshirts: ${redshirtResults.traditional}`);
  Logger.log(`   Medical Redshirts: ${redshirtResults.medical}`);

  // Step 3b: Sync awards from Awards sheet to PlayerCopies
  Logger.log(`\n--- Syncing Awards ---`);
  try {
    const awardSync = syncAwardsToPlayerCopies(year);
    Logger.log(`   Awards synced: ${awardSync.copiesUpdated} copies updated`);
  } catch (e) {
    Logger.log(`   Warning: Could not sync awards - ${e.message}`);
  }

  // Step 3c: Process early declarations
  Logger.log(`\n--- Processing Early Declarations ---`);
  const declarationResults = processEarlyDeclarations(year);
  Logger.log(`   Released (declared early): ${declarationResults.released}`);
  Logger.log(`   Retained: ${declarationResults.retained}`);
  Logger.log(`   Auto-Retained: ${declarationResults.autoRetained}`);

  Logger.log(`\n✅ Season ${year} ended`);

  return {
    redshirts: redshirtResults,
    declarations: declarationResults
  };
}

/**
 * STEP 4: Run at start of new league year
 * Increments eligibility years for all active player copies
 */
function rolloverToNewYear(fromYear, toYear) {
  Logger.log(`=== Rolling Over: ${fromYear} → ${toYear} ===`);

  const incremented = incrementEligibilityYears(fromYear, toYear);

  Logger.log(`✅ Incremented eligibility for ${incremented} player copies`);

  // Now ready to run startNewSeason(toYear)
  Logger.log(`Ready to run startNewSeason(${toYear})`);
}

/**
 * COMPLETE WORKFLOW: Annual Cycle
 * 1. End previous season
 * 2. Rollover eligibility
 * 3. Start new season
 */
function completeYearlyWorkflow(oldYear, newYear) {
  Logger.log(`=== Complete Yearly Workflow: ${oldYear} → ${newYear} ===`);

  // Step 1: End old season (process redshirts)
  endSeasonProcessing(oldYear);

  // Step 2: Rollover eligibility
  rolloverToNewYear(oldYear, newYear);

  // Step 3: Start new season (ingest rookies)
  startNewSeason(newYear);

  Logger.log(`✅ Complete! ${oldYear} ended, ${newYear} started`);
}

/**
 * Manual trigger for roster sync from TransactionLog
 * Uses TransactionLog as source of truth for ownership
 * Also syncs ALL years of awards to PlayerCopies (not just current year)
 */
function manualRosterSync() {
  const ui = SpreadsheetApp.getUi();
  const year = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();

  Logger.log("=== Manual Roster Sync (from TransactionLog) ===");

  // Step 1: Sync ownership
  const ownershipUpdated = syncOwnershipFromTransactionLog();
  Logger.log(`✅ Ownership sync: ${ownershipUpdated} copies updated`);

  // Step 2: Sync ALL years of awards to PlayerCopies (wipe and rebuild)
  // This ensures PlayerCopies reflects exactly what's in the Awards sheet
  Logger.log(`\n--- Syncing ALL Years Awards to PlayerCopies ---`);
  let totalAwardsUpdated = 0;
  let yearsProcessed = 0;
  let awardsError = null;

  // Get list of years that have awards in the Awards sheet
  const awardsYears = getAwardsYears();
  Logger.log(`  Found awards for years: ${awardsYears.join(', ')}`);

  if (awardsYears.length === 0) {
    awardsError = "No awards found in Awards sheet";
    Logger.log(`⚠️ ${awardsError}`);
  } else {
    // Step 2a: Clear all existing award data first (wipe the 3 award columns)
    Logger.log(`  Clearing existing award data...`);
    const clearedCount = clearAllAwardsFromPlayerCopies();

    // Step 2b: Rebuild from Awards sheet for each year
    Logger.log(`  Rebuilding awards from Awards sheet...`);
    for (const awardYear of awardsYears) {
      try {
        const awardSync = syncAwardsToPlayerCopies(awardYear);
        totalAwardsUpdated += awardSync.copiesUpdated || 0;
        yearsProcessed++;
        Logger.log(`  ${awardYear}: ${awardSync.copiesUpdated} copies updated`);
      } catch (e) {
        Logger.log(`  ${awardYear}: ERROR - ${e.message}`);
      }
    }
    Logger.log(`✅ Awards sync complete: ${totalAwardsUpdated} total updates across ${yearsProcessed} years`);
  }

  // Build result message
  let resultMsg = `Roster Sync Complete\n\n` +
    `• Ownership updated: ${ownershipUpdated} copies\n` +
    `• Awards synced: ${totalAwardsUpdated} updates across ${yearsProcessed} years`;

  if (awardsError) {
    resultMsg += `\n\n⚠️ Awards sync warning: ${awardsError}\n` +
      `Run "Calculate Awards" first if awards haven't been calculated.`;
  }

  // Add Theoretical Draft reminder if Week 12+ (regular season complete)
  if (currentWeek >= 12) {
    resultMsg += `\n\n🎓 Regular Season Complete (Week ${currentWeek})\n` +
      `Awards and scoring are now finalized.\n\n` +
      `Next Step: Run "Calculate Theoretical Draft" to generate draft bonuses.`;
  }

  ui.alert('Sync Complete', resultMsg, ui.ButtonSet.OK);
}

/**
 * Get list of unique years that have awards in the Awards sheet
 * @returns {Array} - Array of years (numbers) sorted ascending
 */
function getAwardsYears() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.awards);

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const yearCol = headers.indexOf("Year");
  if (yearCol === -1) return [];

  const years = new Set();
  data.slice(1).forEach(row => {
    const year = Number(row[yearCol]);
    if (year && year >= 2020 && year <= 2030) {
      years.add(year);
    }
  });

  return Array.from(years).sort((a, b) => a - b);
}

/**
 * Manual trigger for rookie ingestion
 * Run after NFL draft
 */
function manualRookieIngestion() {
  ingestRookiesForYear(getLeagueYear());
}

/**
 * Custom menu in Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('⚡ League Management')
    .addItem('📅 Set League Year', 'promptSetLeagueYear')
    .addSeparator()
    .addSubMenu(ui.createMenu('📋 Season Checklist')
      .addItem('📊 Open Dashboard (Sidebar)', 'showOperationsDashboard')
      .addSeparator()
      .addItem('1. End of Season Processing', 'wizardEndOfSeason')
      .addItem('2. Declarations & Redshirts', 'wizardDeclarationsAndRedshirts')
      .addItem('3. Year Rollover', 'wizardYearRollover')
      .addSeparator()
      .addItem('Open Commissioner Guide', 'generateOperationsGuide'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🔄 Sync Data')
      .addItem('Sync Roster Ownership', 'manualRosterSync')
      .addItem('Ingest Rookies', 'manualRookieIngestion')
      .addItem('Process Current Year Transactions', 'promptProcessCurrentYearTransactions'))
    .addSubMenu(ui.createMenu('📅 Season Management')
      .addItem('Start New Season', 'promptStartNewSeason')
      .addItem('End Season (Process Redshirts)', 'promptEndSeason')
      .addItem('Rollover to New Year', 'promptRollover'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🏆 Awards')
      .addItem('Calculate Current Awards', 'promptCalculateAwards')
      .addItem('Calculate for Specific Year/Week', 'promptCalculateAwardsCustom')
      .addItem('Backfill Historical Awards', 'promptHistoricalAwards')
      .addSeparator()
      .addItem('View Award Leaders', 'promptViewAwardLeaders')
      .addSeparator()
      .addItem('Populate Results Cache', 'promptPopulateResultsCache')
      .addItem('Refresh Week Cache', 'promptRefreshWeekCache')
      .addItem('Clear Results Cache', 'promptClearResultsCache')
      .addSeparator()
      .addItem('Setup Weekly Trigger', 'setupAwardsTrigger')
      .addItem('Remove Weekly Trigger', 'removeAwardsTrigger'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📦 Backfill Data')
      .addItem('Backfill Historical Data', 'interactiveBackfill')
      .addItem('Verify Data Integrity', 'verifyBackfillIntegrity')
      .addSeparator()
      .addItem('Backfill 2021 WITH Awards', 'backfillWithAwards2021')
      .addItem('Backfill 2022 WITH Awards', 'backfillWithAwards2022')
      .addItem('Backfill 2023 WITH Awards', 'backfillWithAwards2023')
      .addItem('Backfill 2024 WITH Awards', 'backfillWithAwards2024')
      .addSeparator()
      .addItem('Run All Backfills WITH Awards', 'runAllBackfillsWithAwards'))
    .addSubMenu(ui.createMenu('📋 Declarations')
      .addItem('Sync Current Year Awards', 'menuSyncCurrentYearAwards')
      .addItem('Sync All Historical Awards (2021+)', 'menuSyncAllHistoricalAwards')
      .addItem('Cleanup Award History (Fix Duplicates)', 'menuCleanupAwardHistory')
      .addSeparator()
      .addItem('View Eligible Players', 'menuViewEligiblePlayers')
      .addItem('View Pending Decisions', 'menuViewPendingDecisions')
      .addSeparator()
      .addItem('Process Early Declarations', 'menuProcessDeclarations')
      .addSeparator()
      .addItem('Find Players Needing Retention Backfill', 'menuFindPlayersNeedingBackfill')
      .addItem('Backfill Retention History', 'menuBackfillRetentionHistory')
      .addItem('Migrate PlayerCopies Schema', 'migratePlayerCopiesToNewSchema'))
    .addSubMenu(ui.createMenu('🔧 Maintenance')
      .addItem('Recalculate Active Status', 'runRecalculateActiveStatus')
      .addItem('Recalculate All Redshirts', 'recalculateAllRedshirts')
      .addItem('View Transaction Log Summary', 'viewTransactionLogSummary'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📊 Power Rankings')
      .addItem('Calculate Current Rankings', 'promptCalculateRankings')
      .addItem('View Top 25', 'promptViewTop25')
      .addItem('View Team Ranking', 'promptViewTeamRanking')
      .addSeparator()
      .addItem('View Week Schedule & Rankings', 'promptViewWeekSchedule')
      .addItem('View College Gameday', 'promptViewCollegeGameday')
      .addItem('Reset ScheduleResults Sheet', 'promptResetScheduleResults')
      .addSeparator()
      .addItem('Backfill Historical Rankings', 'promptBackfillRankings')
      .addSeparator()
      .addItem('Setup Weekly Trigger', 'setupRankingsTrigger')
      .addItem('Remove Weekly Trigger', 'removeRankingsTrigger'))
    .addSubMenu(ui.createMenu('🎯 Projections')
      .addItem('Calculate Projections', 'promptCalculateProjections')
      .addItem('Calculate Conference Standings', 'promptCalculateConferenceStandings')
      .addSeparator()
      .addItem('View Playoff Contenders', 'promptViewPlayoffContenders')
      .addItem('View Bowl Projections', 'promptViewBowlProjections')
      .addItem('View Conference Race', 'promptViewConferenceRace')
      .addItem('View Team Projection', 'promptViewTeamProjection')
      .addSeparator()
      .addItem('View Conference Standings', 'promptViewConferenceStandings')
      .addItem('View All CCG Matchups', 'promptViewAllCCGMatchups'))
    .addSubMenu(ui.createMenu('🎓 Theoretical Draft')
      .addItem('Calculate Current Year Draft', 'menuCalculateTheoreticalDraft')
      .addItem('Calculate for Specific Year', 'menuCalculateTheoreticalDraftCustom')
      .addSeparator()
      .addItem('View Draft-Eligible Players', 'menuViewDraftEligible')
      .addItem('Diagnose Eligibility Data', 'menuDiagnoseEligibility'))
    .addSubMenu(ui.createMenu('💰 Recruiting Dollars')
      .addItem('Calculate Current Recruiting Dollars', 'promptCalculateRecruitingDollars')
      .addItem('Calculate for Specific Year/Week', 'promptCalculateRecruitingDollarsCustom'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📤 Export')
      .addItem('Export Conference Roster', 'promptExportConference')
      .addItem('Export All Conferences', 'promptExportAllConferences')
      .addSeparator()
      .addItem('Export for MFL Import', 'promptExportForMFL')
      .addItem('Export All for MFL Import', 'promptExportAllForMFL'))
    .addSeparator()
    .addItem('📊 Open Operations Dashboard', 'showOperationsDashboard')
    .addItem('⚙️ Initialize Settings', 'initializeScriptProperties')
    .addToUi();
}

// Prompt functions for season management
function promptStartNewSeason() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();
  const response = ui.prompt('Start New Season', `Enter year (default: ${defaultYear}):`, ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() == ui.Button.OK) {
    const year = response.getResponseText().trim() || defaultYear;
    startNewSeason(year);
    ui.alert(`Season ${year} initialized!`);
  }
}

function promptEndSeason() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();
  const response = ui.prompt('End Season', `Enter year to end (default: ${defaultYear}):`, ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() == ui.Button.OK) {
    const year = response.getResponseText().trim() || defaultYear;
    endSeasonProcessing(year);
    ui.alert(`Season ${year} ended. Redshirts processed.`);
  }
}

function promptRollover() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();
  const nextYear = String(Number(currentYear) + 1);
  const response = ui.prompt('Rollover Years', `Enter years as old,new (default: ${currentYear},${nextYear}):`, ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() == ui.Button.OK) {
    const input = response.getResponseText().trim();
    const years = input ? input.split(',').map(y => y.trim()) : [currentYear, nextYear];
    if (years.length === 2) {
      rolloverToNewYear(years[0], years[1]);
      ui.alert(`Rolled over from ${years[0]} to ${years[1]}`);
    }
  }
}

/**
 * Menu wrapper for recalculating Active status
 * Shows results in a dialog
 */
function runRecalculateActiveStatus() {
  const ui = SpreadsheetApp.getUi();

  // Confirm before running
  const confirm = ui.alert(
    'Recalculate Active Status',
    'This will recalculate the Active column for all player copies based on their eligibility and redshirts.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Run the recalculation
  const results = recalculateAllActiveStatus();

  // Show results
  ui.alert(
    'Recalculation Complete',
    `Processed: ${results.processed} copies\n` +
    `Already correct: ${results.alreadyCorrect}\n` +
    `Changed to ACTIVE: ${results.changedToActive}\n` +
    `Changed to INACTIVE: ${results.changedToInactive}\n\n` +
    `Check the Logs (View > Logs) for detailed changes.`,
    ui.ButtonSet.OK
  );
}

/**
 * Menu prompt for processing current year transactions
 * Processes all auctions, drops, IR/TAXI moves with logging
 * Clears previous logs for that year to avoid duplicates
 */
function promptProcessCurrentYearTransactions() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const response = ui.prompt(
    'Process Current Year Transactions',
    `Enter year to process (default: ${defaultYear}):\n\n` +
    'This will:\n' +
    '• Clear existing transaction logs for that year\n' +
    '• Process all auctions, drops, IR & taxi moves\n' +
    '• Update ownership and calculate redshirts\n' +
    '• Log all transactions for auditing',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const inputYear = response.getResponseText().trim();
  const year = inputYear ? Number(inputYear) : Number(defaultYear);

  if (isNaN(year) || year < 2018 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2018 and 2030.');
    return;
  }

  // Confirm before processing
  const confirm = ui.alert(
    'Confirm Processing',
    `Process all transactions for ${year}?\n\n` +
    `This will clear and rebuild the transaction log for ${year}.`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Run the processing
  const results = processCurrentYearTransactions(year);

  // Show results
  ui.alert(
    'Processing Complete',
    `Year: ${results.year}\n\n` +
    `Previous log entries cleared: ${results.transactionLogCleared}\n` +
    `Active status changes: ${results.activeStatusChanges.changedToActive + results.activeStatusChanges.changedToInactive}\n\n` +
    `Check the "TransactionLog" sheet for details.\n` +
    `Check Logs (View > Logs) for processing details.`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// AWARDS PROMPT FUNCTIONS
// ============================================================================

/**
 * Prompt to calculate awards for a specific year and week range
 */
function promptCalculateAwards() {
  const ui = SpreadsheetApp.getUi();
  const config = getConfig();
  const defaultYear = getLeagueYear();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(defaultYear);
  const currentWeek = Math.min(getCurrentNFLWeek(), regularSeasonWeeks); // Cap at regular season

  // Get cached weeks to show status
  const cachedWeeks = getCachedWeeks(defaultYear);
  const cachedStatus = cachedWeeks.length > 0
    ? `Cached: weeks ${cachedWeeks.join(', ')}`
    : 'No cached data yet';

  // Single confirmation dialog with all info
  const confirm = ui.alert(
    'Calculate Current Awards',
    `Year: ${defaultYear}\n` +
    `Current Week: ${currentWeek}\n` +
    `${cachedStatus}\n\n` +
    `This will:\n` +
    `• Fetch any new weekly results from MFL\n` +
    `• Cache them to the WeeklyResults sheet\n` +
    `• Calculate awards through Week ${currentWeek}\n\n` +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Run calculation
  const rankings = calculateAwards(defaultYear, currentWeek);

  // Get updated cache status
  const newCachedWeeks = getCachedWeeks(defaultYear);

  // Show summary with reminder
  const heismanWinner = rankings.heisman[0];
  const isEndOfSeason = currentWeek >= 12;

  let reminderText = '\n📋 Next Step: Run "Sync Roster Ownership" to update PlayerCopies with these awards.';
  if (isEndOfSeason) {
    reminderText += '\n\n🎓 End of Season: After syncing, run "Calculate Theoretical Draft" for draft bonuses.';
  }

  ui.alert(
    'Awards Calculated',
    `Year: ${defaultYear} (through Week ${currentWeek})\n\n` +
    `Heisman Leader: ${heismanWinner?.playerName || 'N/A'}\n` +
    `Score: ${heismanWinner?.awardScore || 'N/A'}\n\n` +
    `Cached weeks: ${newCachedWeeks.join(', ')}\n` +
    `Total entries: ${rankings.heisman.length + rankings.national.length + rankings.allConference.length}\n\n` +
    'Check the "Awards" sheet for full results.' + reminderText,
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to backfill historical awards
 */
function promptHistoricalAwards() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Backfill Historical Awards',
    'Enter year range (e.g., "2021,2024" for 2021 to 2024):\n\n' +
    'Each year will be calculated through Week 12.\n' +
    'Existing data for those years will be replaced.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText();
  const years = input.split(',').map(y => Number(y.trim()));

  if (years.length !== 2 || isNaN(years[0]) || isNaN(years[1])) {
    ui.alert('Invalid input. Use format: 2021,2024');
    return;
  }

  // Check which years already have cached weekly results
  const yearsWithCache = [];
  const yearsWithoutCache = [];
  for (let y = years[0]; y <= years[1]; y++) {
    const cached = getCachedWeeks(y);
    if (cached.length >= 12) {
      yearsWithCache.push(y);
    } else {
      yearsWithoutCache.push(`${y} (${cached.length}/12 weeks)`);
    }
  }

  let cacheWarning = '';
  if (yearsWithoutCache.length > 0) {
    cacheWarning = `\n\nYears needing API calls:\n${yearsWithoutCache.join('\n')}\n\n` +
      'This may take longer for years without cached data.';
  }

  const confirm = ui.alert(
    'Confirm Backfill',
    `Calculate awards for ${years[0]} to ${years[1]}?${cacheWarning}`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  backfillHistoricalAwards(years[0], years[1]);

  ui.alert(
    'Backfill Complete',
    `Awards calculated for ${years[0]} to ${years[1]}.\n\n` +
    'Check the "Awards" sheet for results.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to calculate awards for a specific year and week
 */
function promptCalculateAwardsCustom() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  // Get year
  const yearResponse = ui.prompt(
    'Calculate Awards',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = Number(yearResponse.getResponseText().trim() || defaultYear);

  if (isNaN(year) || year < 2018 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2018 and 2030.');
    return;
  }

  // Get week
  const weekResponse = ui.prompt(
    'Calculate Awards',
    'Enter week to calculate through (1-12):\n\n' +
    'Awards are only calculated for regular season (weeks 1-12).',
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const week = Number(weekResponse.getResponseText().trim());

  if (isNaN(week) || week < 1 || week > 12) {
    ui.alert('Invalid week. Please enter a number between 1 and 12.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Calculation',
    `Calculate awards for ${year} through Week ${week}?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  const rankings = calculateAwards(year, week);

  const heismanWinner = rankings.heisman[0];
  ui.alert(
    'Awards Calculated',
    `Year: ${year} (through Week ${week})\n\n` +
    `Heisman Leader: ${heismanWinner?.playerName || 'N/A'}\n` +
    `Score: ${heismanWinner?.awardScore || 'N/A'}\n\n` +
    'Check the "Awards" sheet for results.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view award leaders for a specific year
 */
function promptViewAwardLeaders() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const response = ui.prompt(
    'View Award Leaders',
    `Enter year to view (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = response.getResponseText().trim() || defaultYear;

  viewAwardLeaders(year);

  ui.alert(
    'Award Leaders',
    `Award leaders for ${year} have been logged.\n\n` +
    'View > Logs to see the full output.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to populate weekly results cache for a year
 */
function promptPopulateResultsCache() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const response = ui.prompt(
    'Populate Results Cache',
    `Enter year to cache (default: ${defaultYear}):\n\n` +
    'This will fetch and store weekly results for weeks 1-12.\n' +
    'Already cached weeks will be skipped.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = response.getResponseText().trim() || defaultYear;

  // Get already cached weeks
  const cachedWeeks = getCachedWeeks(year);

  const confirm = ui.alert(
    'Confirm Cache Population',
    `Populate cache for ${year}?\n\n` +
    `Already cached: ${cachedWeeks.length > 0 ? 'weeks ' + cachedWeeks.join(', ') : 'none'}\n\n` +
    'This will fetch missing weeks from the MFL API.',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  populateWeeklyResultsCache(year, 12);

  const newCachedWeeks = getCachedWeeks(year);

  ui.alert(
    'Cache Population Complete',
    `Year: ${year}\n\n` +
    `Cached weeks: ${newCachedWeeks.join(', ') || 'none'}\n\n` +
    'Check Logs (View > Logs) for details.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to refresh cache for a specific week
 */
function promptRefreshWeekCache() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const yearResponse = ui.prompt(
    'Refresh Week Cache',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = yearResponse.getResponseText().trim() || defaultYear;

  const weekResponse = ui.prompt(
    'Refresh Week Cache',
    'Enter week number to refresh (1-12):',
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const week = Number(weekResponse.getResponseText().trim());

  if (isNaN(week) || week < 1 || week > 18) {
    ui.alert('Invalid week number. Please enter a number between 1 and 18.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Refresh',
    `Refresh cache for ${year} Week ${week}?\n\n` +
    'This will clear the cached data and re-fetch from MFL.',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  const results = refreshWeekCache(year, week);

  ui.alert(
    'Week Cache Refreshed',
    `Year: ${year}, Week: ${week}\n\n` +
    `Franchises loaded: ${results ? results.length : 0}`,
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to clear weekly results cache
 */
function promptClearResultsCache() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const response = ui.prompt(
    'Clear Results Cache',
    `Enter year to clear (or "all" to clear everything):\n\n` +
    `Default: ${defaultYear}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim().toLowerCase();

  if (input === 'all') {
    const confirm = ui.alert(
      'Confirm Clear ALL',
      'This will delete ALL cached weekly results for ALL years.\n\n' +
      'Are you sure?',
      ui.ButtonSet.YES_NO
    );

    if (confirm !== ui.Button.YES) {
      return;
    }

    // Clear all by getting the sheet and clearing it
    const sheet = getWeeklyResultsSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      sheet.deleteRows(2, data.length - 1);
    }

    ui.alert(
      'Cache Cleared',
      'All weekly results cache has been deleted.',
      ui.ButtonSet.OK
    );
  } else {
    const year = input || defaultYear;

    // Get cached weeks before clearing
    const cachedWeeks = getCachedWeeks(year);

    if (cachedWeeks.length === 0) {
      ui.alert('No Cache', `No cached data found for ${year}.`, ui.ButtonSet.OK);
      return;
    }

    const confirm = ui.alert(
      'Confirm Clear',
      `Clear cached weekly results for ${year}?\n\n` +
      `Cached weeks: ${cachedWeeks.join(', ')}\n\n` +
      'This will require re-fetching from MFL API next time.',
      ui.ButtonSet.YES_NO
    );

    if (confirm !== ui.Button.YES) {
      return;
    }

    clearWeeklyResultsCache(year);

    ui.alert(
      'Cache Cleared',
      `Weekly results cache for ${year} has been deleted.\n\n` +
      `Cleared ${cachedWeeks.length} weeks.`,
      ui.ButtonSet.OK
    );
  }
}

// ============================================================================
// POWER RANKINGS PROMPT FUNCTIONS
// ============================================================================

/**
 * Prompt to calculate power rankings for current week
 */
function promptCalculateRankings() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();

  const confirm = ui.alert(
    'Calculate Power Rankings',
    `Year: ${defaultYear}\n` +
    `Current Week: ${currentWeek}\n\n` +
    `This will:\n` +
    `• Calculate All-Play % for all 100 teams\n` +
    `• Calculate Opponent All-Play %\n` +
    `• Compute ranking scores\n` +
    `• Track movement from previous week\n\n` +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Get week input
  const weekResponse = ui.prompt(
    'Week Selection',
    `Enter week to calculate through (1-18):\n\nDefault: ${currentWeek}\n\nNote: Week 18 = Final Rankings (no games)`,
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const weekInput = weekResponse.getResponseText().trim();
  const week = weekInput ? Number(weekInput) : currentWeek;

  if (isNaN(week) || week < 1 || week > 18) {
    ui.alert('Invalid week. Please enter a number between 1 and 18.');
    return;
  }

  // Run calculation
  const rankings = calculateAndSaveRankings(Number(defaultYear), week);

  // Show summary
  const top5 = rankings.slice(0, 5);
  const top5Text = top5.map(t =>
    `${t.rank}. ${t.teamName} (${t.movement}) - ${t.rankingScore.toFixed(3)}`
  ).join('\n');

  ui.alert(
    'Rankings Calculated',
    `Year: ${defaultYear} Week ${week}\n\n` +
    `Top 5:\n${top5Text}\n\n` +
    `Total teams ranked: ${rankings.length}\n\n` +
    'Check the "PowerRankings" sheet for full results.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view top 25 rankings
 */
function promptViewTop25() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const response = ui.prompt(
    'View Top 25 Rankings',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = Number(response.getResponseText().trim() || defaultYear);
  const rankings = getTopRankings(year, 25);

  if (rankings.length === 0) {
    ui.alert('No Rankings', `No rankings found for ${year}. Run "Calculate Current Rankings" first.`, ui.ButtonSet.OK);
    return;
  }

  // Build display text
  const lines = rankings.map(t => {
    const record = `${t.regularSeasonWins}-${t.regularSeasonLosses}`;
    const confRecord = `${t.conferenceWins}-${t.conferenceLosses}`;
    return `${t.rank}. ${t.teamName} (${t.movement}) | ${record} | Conf: ${confRecord} | Score: ${t.rankingScore.toFixed(3)}`;
  });

  // Log full results
  Logger.log(`\n=== Top 25 Rankings for ${year} ===`);
  lines.forEach(line => Logger.log(line));

  // Show abbreviated in dialog (first 15)
  ui.alert(
    `Top 25 Rankings - ${year}`,
    lines.slice(0, 15).join('\n') + '\n\n... (see Logs for full list)',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view a specific team's ranking
 */
function promptViewTeamRanking() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const teamResponse = ui.prompt(
    'View Team Ranking',
    'Enter team name or franchise ID:',
    ui.ButtonSet.OK_CANCEL
  );

  if (teamResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const searchTerm = teamResponse.getResponseText().trim().toLowerCase();
  if (!searchTerm) {
    ui.alert('Please enter a team name or franchise ID.');
    return;
  }

  const year = Number(defaultYear);
  const allRankings = getCurrentRankings(year);

  if (allRankings.length === 0) {
    ui.alert('No Rankings', `No rankings found for ${year}. Run "Calculate Current Rankings" first.`, ui.ButtonSet.OK);
    return;
  }

  // Search for team
  const team = allRankings.find(t =>
    t.teamName.toLowerCase().includes(searchTerm) ||
    t.franchiseId === searchTerm ||
    t.franchiseId === searchTerm.padStart(3, '0')
  );

  if (!team) {
    ui.alert('Team Not Found', `No team found matching "${searchTerm}".`, ui.ButtonSet.OK);
    return;
  }

  // Build detailed view
  const details = `
Team: ${team.teamName}
Conference: ${team.conference}
Franchise ID: ${team.franchiseId}

RANKING: #${team.rank} (${team.movement} from last week)
Score: ${team.rankingScore.toFixed(4)}

RECORD:
• Overall: ${team.regularSeasonWins}-${team.regularSeasonLosses}${team.regularSeasonTies ? `-${team.regularSeasonTies}` : ''}
• Conference: ${team.conferenceWins}-${team.conferenceLosses}
• Postseason: ${team.postseasonWins}-${team.postseasonLosses}

ALL-PLAY:
• All-Play %: ${(team.allPlayPct * 100).toFixed(1)}%
• Opp All-Play %: ${(team.oppAllPlayPct * 100).toFixed(1)}%

POINTS:
• Total Points Scored: ${team.totalPointsScored.toFixed(1)}
`.trim();

  ui.alert(`${team.teamName} - Rank #${team.rank}`, details, ui.ButtonSet.OK);
}

/**
 * Prompt to backfill historical rankings
 */
function promptBackfillRankings() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Backfill Historical Rankings',
    'Enter year to backfill (e.g., 2024):\n\n' +
    'This will calculate rankings for each week 1 through current week.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = Number(response.getResponseText().trim());

  if (isNaN(year) || year < 2020 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2020 and 2030.');
    return;
  }

  const config = getConfig();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(year);

  const weekResponse = ui.prompt(
    'Through Week',
    `Enter last week to calculate (1-18):\n\nDefault: ${regularSeasonWeeks} (end of regular season for ${year})\nUse 18 for Final Rankings`,
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const weekInput = weekResponse.getResponseText().trim();
  const throughWeek = weekInput ? Number(weekInput) : regularSeasonWeeks;

  if (isNaN(throughWeek) || throughWeek < 1 || throughWeek > 18) {
    ui.alert('Invalid week. Please enter a number between 1 and 18.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Backfill',
    `Backfill rankings for ${year} weeks 1-${throughWeek}?\n\n` +
    'This may take several minutes.',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  backfillRankings(year, throughWeek);

  ui.alert(
    'Backfill Complete',
    `Rankings calculated for ${year} weeks 1-${throughWeek}.\n\n` +
    'Check the "PowerRankings" sheet for results.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view schedule and rankings for a specific week
 */
function promptViewWeekSchedule() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  // Get year
  const yearResponse = ui.prompt(
    'View Week Schedule & Rankings',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;

  const year = Number(yearResponse.getResponseText()) || Number(defaultYear);

  // Get week
  const weekResponse = ui.prompt(
    'View Week Schedule & Rankings',
    'Enter week number (1-18):\n\nWeek 18 = Final Rankings',
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) return;

  const week = Number(weekResponse.getResponseText());
  if (!week || week < 1 || week > 18) {
    ui.alert('Invalid Input', 'Please enter a week between 1 and 18.', ui.ButtonSet.OK);
    return;
  }

  // Get data from ScheduleResults
  const sheet = getScheduleResultsSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    ui.alert('No Data', 'ScheduleResults is empty. Run "Calculate Current Rankings" first to populate data.', ui.ButtonSet.OK);
    return;
  }

  const headers = data[0];
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = i; });

  // Filter to the selected week
  const weekData = data.slice(1).filter(row =>
    Number(row[colMap["Year"]]) === year &&
    Number(row[colMap["Week"]]) === week
  );

  if (weekData.length === 0) {
    ui.alert('No Data', `No data found for ${year} Week ${week}. Make sure ScheduleResults is populated.`, ui.ButtonSet.OK);
    return;
  }

  // Sort by SeasonRank
  weekData.sort((a, b) => Number(a[colMap["SeasonRank"]]) - Number(b[colMap["SeasonRank"]]));

  // Build display - Top 25 with their matchups
  const lines = [];
  lines.push(`=== ${year} Week ${week} Schedule & Rankings ===\n`);

  weekData.slice(0, 25).forEach(row => {
    const rank = row[colMap["SeasonRank"]];
    const teamName = row[colMap["TeamName"]];
    const opponent = row[colMap["OpponentName"]];
    const gameResult = row[colMap["GameResult"]];
    const teamScore = row[colMap["TeamScore"]];
    const oppScore = row[colMap["OpponentScore"]];
    const seasonRecord = `${row[colMap["SeasonWins"]]}-${row[colMap["SeasonLosses"]]}`;
    const rankingScore = Number(row[colMap["RankingScore"]]).toFixed(3);

    let matchupStr = "";
    if (gameResult === "BYE") {
      matchupStr = "BYE";
    } else if (teamScore > 0) {
      matchupStr = `vs ${opponent} (${teamScore}-${oppScore}) ${gameResult}`;
    } else {
      matchupStr = `vs ${opponent}`;
    }

    lines.push(`#${rank} ${teamName} (${seasonRecord}) | ${matchupStr} | Score: ${rankingScore}`);
  });

  // Log full results
  Logger.log(lines.join('\n'));

  // Show in alert (truncated if needed)
  const displayText = lines.slice(0, 30).join('\n');
  ui.alert(
    `Week ${week} Schedule & Rankings`,
    displayText + (lines.length > 30 ? '\n\n(See Logger for full list)' : ''),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to reset ScheduleResults sheet with new headers
 */
function promptResetScheduleResults() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Reset ScheduleResults Sheet',
    'This will delete all existing ScheduleResults data and recreate the sheet with updated headers.\n\n' +
    'You will need to run "Calculate Current Rankings" again to repopulate the data.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActive();
  const existingSheet = ss.getSheetByName("ScheduleResults");

  if (existingSheet) {
    ss.deleteSheet(existingSheet);
    Logger.log("Deleted existing ScheduleResults sheet");
  }

  // Recreate with new headers
  const newSheet = getScheduleResultsSheet();

  ui.alert(
    'Sheet Reset',
    'ScheduleResults sheet has been reset with updated headers.\n\n' +
    'Run "Calculate Current Rankings" to populate data.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view College Gameday matchups for a specific week
 */
function promptViewCollegeGameday() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  // Get year
  const yearResponse = ui.prompt(
    'View College Gameday',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;

  const year = Number(yearResponse.getResponseText()) || Number(defaultYear);

  // Get week
  const weekResponse = ui.prompt(
    'View College Gameday',
    'Enter upcoming week number (1-17):',
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) return;

  const week = Number(weekResponse.getResponseText());
  if (!week || week < 1 || week > 17) {
    ui.alert('Invalid Input', 'Please enter a week between 1 and 17.', ui.ButtonSet.OK);
    return;
  }

  // Get College Gameday matchups
  const gamedayData = getCollegeGamedayMatchups(year, week);

  if (!gamedayData.gamedayMatchup) {
    ui.alert('No Data', `No matchup data available for Week ${week}. Make sure ScheduleResults is populated.`, ui.ButtonSet.OK);
    return;
  }

  // Build display
  const lines = [];
  lines.push(`🏈 COLLEGE GAMEDAY - Week ${week} 🏈\n`);

  const gm = gamedayData.gamedayMatchup;
  lines.push(`═══════════════════════════════════════`);
  lines.push(`        THE MAIN EVENT`);
  lines.push(`═══════════════════════════════════════`);
  lines.push(`  #${gm.team1.rank} ${gm.team1.name}`);
  lines.push(`           VS`);
  lines.push(`  #${gm.team2.rank} ${gm.team2.name}`);
  lines.push(`═══════════════════════════════════════`);
  lines.push(`  Average Rank: ${gm.avgRank.toFixed(1)}\n`);

  if (gamedayData.gamesOfTheWeek.length > 0) {
    lines.push(`🌟 GAMES OF THE WEEK (Avg Rank < 15):`);
    gamedayData.gamesOfTheWeek.forEach((m, i) => {
      lines.push(`${i + 1}. #${m.team1.rank} ${m.team1.name} vs #${m.team2.rank} ${m.team2.name} (Avg: ${m.avgRank.toFixed(1)})`);
    });
  } else {
    lines.push(`No other Games of the Week (Avg Rank < 15)`);
  }

  // Log full results
  Logger.log(lines.join('\n'));

  ui.alert(
    `College Gameday - Week ${week}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

// ============================================================================
// PROJECTIONS MENU FUNCTIONS
// ============================================================================

/**
 * Prompt to calculate playoff/bowl projections
 */
function promptCalculateProjections() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();

  // Only makes sense during regular season (weeks 1-12)
  if (currentWeek > 12) {
    ui.alert(
      'Season Complete',
      'Projections are only calculated during the regular season (Weeks 1-12).\n\n' +
      'The regular season has ended and playoff/bowl matchups are now set.',
      ui.ButtonSet.OK
    );
    return;
  }

  const confirm = ui.alert(
    'Calculate Projections',
    `Year: ${defaultYear}\n` +
    `Current Week: ${currentWeek}\n\n` +
    `This will calculate:\n` +
    `• Playoff probability for all 100 teams\n` +
    `• Conference championship odds\n` +
    `• Bowl eligibility projections\n` +
    `• Expected final records\n\n` +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Get week input
  const weekResponse = ui.prompt(
    'Week Selection',
    `Enter week to calculate projections as of (1-12):\n\nDefault: ${currentWeek}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const weekInput = weekResponse.getResponseText().trim();
  const week = weekInput ? Number(weekInput) : currentWeek;

  if (isNaN(week) || week < 1 || week > 12) {
    ui.alert('Invalid week. Please enter a number between 1 and 12.');
    return;
  }

  // Run calculation with error handling
  let projections;
  try {
    projections = calculateAndSaveProjections(Number(defaultYear), week);
  } catch (e) {
    Logger.log(`Projection calculation error: ${e.message}`);

    // Check if it's an API availability issue
    if (e.message.includes('unavailable') || e.message.includes('schedule data')) {
      ui.alert(
        'API Data Unavailable',
        `Unable to calculate projections for ${defaultYear}.\n\n` +
        `The MFL API schedule data for ${defaultYear} is not available.\n\n` +
        `This typically means:\n` +
        `• The ${defaultYear} season hasn't started yet on MFL\n` +
        `• Or the league hasn't been set up for ${defaultYear}\n\n` +
        `Please verify the year is correct in Settings, or try again when the season is active.`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('Error', `Failed to calculate projections: ${e.message}`, ui.ButtonSet.OK);
    }
    return;
  }

  if (!projections || projections.length === 0) {
    ui.alert(
      'No Data Available',
      `No projections could be calculated for ${defaultYear} Week ${week}.\n\n` +
      `This typically means rankings haven't been calculated yet for this year.\n\n` +
      `Please run "Calculate Rankings" from the Rankings menu first, ` +
      `which will populate the ScheduleResults data needed for projections.`,
      ui.ButtonSet.OK
    );
    return;
  }

  // Show summary - top 5 playoff contenders
  const top5 = projections.slice(0, 5);
  const top5Text = top5.map(p =>
    `${p.currentRank}. ${p.teamName} - ${p.playoffPct.toFixed(1)}% (${p.playoffPath})`
  ).join('\n');

  ui.alert(
    'Projections Calculated',
    `Year: ${defaultYear} as of Week ${week}\n\n` +
    `Top 5 Playoff Contenders:\n${top5Text}\n\n` +
    `Total teams projected: ${projections.length}\n\n` +
    'Check the "Projections" sheet for full results.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view playoff contenders
 */
function promptViewPlayoffContenders() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const projections = getProjections(Number(defaultYear));

  if (projections.length === 0) {
    ui.alert('No Projections', `No projections found for ${defaultYear}. Run "Calculate Projections" first.`, ui.ButtonSet.OK);
    return;
  }

  // Get top 20 playoff contenders
  const top20 = projections.slice(0, 20);
  const lines = top20.map((p, i) =>
    `${i + 1}. #${p.currentRank} ${p.teamName} (${p.conference}) - ${p.playoffPct.toFixed(1)}% | ${p.playoffPath}`
  );

  // Log full results
  Logger.log(`\n=== Top 20 Playoff Contenders for ${defaultYear} ===`);
  lines.forEach(line => Logger.log(line));

  ui.alert(
    `Playoff Contenders - ${defaultYear}`,
    lines.slice(0, 15).join('\n') + '\n\n... (see Logs for full list)',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view bowl projections
 */
function promptViewBowlProjections() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const projections = getProjections(Number(defaultYear));

  if (projections.length === 0) {
    ui.alert('No Projections', `No projections found for ${defaultYear}. Run "Calculate Projections" first.`, ui.ButtonSet.OK);
    return;
  }

  // Filter to non-playoff contenders with bowl chances
  const bowlTeams = projections
    .filter(p => p.playoffPct < 50 && p.bowlPct > 0)
    .sort((a, b) => b.bowlPct - a.bowlPct);

  const likely = bowlTeams.filter(p => p.bowlPct >= 70).slice(0, 10);
  const bubble = bowlTeams.filter(p => p.bowlPct >= 30 && p.bowlPct < 70).slice(0, 10);
  const longShot = bowlTeams.filter(p => p.bowlPct > 0 && p.bowlPct < 30).slice(0, 5);

  const lines = [];
  lines.push(`✅ LIKELY BOWL BOUND:`);
  likely.forEach(p => lines.push(`  ${p.teamName} (${p.currentWins}-${p.currentLosses}) - ${p.bowlPct.toFixed(0)}%`));

  lines.push(`\n⚠️ BOWL BUBBLE:`);
  bubble.forEach(p => lines.push(`  ${p.teamName} (${p.currentWins}-${p.currentLosses}) - ${p.bowlPct.toFixed(0)}%`));

  if (longShot.length > 0) {
    lines.push(`\n❌ LONG SHOT:`);
    longShot.forEach(p => lines.push(`  ${p.teamName} (${p.currentWins}-${p.currentLosses}) - ${p.bowlPct.toFixed(0)}%`));
  }

  // Log full results
  Logger.log(`\n=== Bowl Projections for ${defaultYear} ===`);
  lines.forEach(line => Logger.log(line));

  ui.alert(
    `Bowl Projections - ${defaultYear}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view conference championship race
 */
function promptViewConferenceRace() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const confResponse = ui.prompt(
    'View Conference Race',
    'Enter conference (ACC, B10, B12, P12, SEC, or other):',
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const conference = confResponse.getResponseText().trim().toUpperCase();
  if (!conference) {
    ui.alert('Please enter a conference name.');
    return;
  }

  const projections = getProjections(Number(defaultYear));

  if (projections.length === 0) {
    ui.alert('No Projections', `No projections found for ${defaultYear}. Run "Calculate Projections" first.`, ui.ButtonSet.OK);
    return;
  }

  // Filter to conference and sort by champ probability
  const confTeams = projections
    .filter(p => p.conference.toUpperCase() === conference)
    .sort((a, b) => b.conferenceChampPct - a.conferenceChampPct);

  if (confTeams.length === 0) {
    ui.alert('Conference Not Found', `No teams found in "${conference}".`, ui.ButtonSet.OK);
    return;
  }

  const isAutoBid = ['ACC', 'B10', 'B12', 'P12', 'SEC'].includes(conference);
  const lines = [];

  lines.push(`${conference} CHAMPIONSHIP RACE\n`);
  if (isAutoBid) {
    lines.push(`🏆 Winner gets automatic playoff bid\n`);
  }

  confTeams.forEach((p, i) => {
    const bar = '█'.repeat(Math.round(p.conferenceChampPct / 10)) + '░'.repeat(10 - Math.round(p.conferenceChampPct / 10));
    lines.push(`${i + 1}. ${p.teamName} (${p.currentWins}-${p.currentLosses})`);
    lines.push(`   ${bar} ${p.conferenceChampPct.toFixed(1)}%`);
  });

  // Log full results
  Logger.log(`\n=== ${conference} Championship Race ===`);
  lines.forEach(line => Logger.log(line));

  ui.alert(
    `${conference} Championship Race - ${defaultYear}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view a specific team's projection
 */
function promptViewTeamProjection() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  const teamResponse = ui.prompt(
    'View Team Projection',
    'Enter team name or franchise ID:',
    ui.ButtonSet.OK_CANCEL
  );

  if (teamResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const searchTerm = teamResponse.getResponseText().trim().toLowerCase();
  if (!searchTerm) {
    ui.alert('Please enter a team name or franchise ID.');
    return;
  }

  const projections = getProjections(Number(defaultYear));

  if (projections.length === 0) {
    ui.alert('No Projections', `No projections found for ${defaultYear}. Run "Calculate Projections" first.`, ui.ButtonSet.OK);
    return;
  }

  // Search for team
  const team = projections.find(p =>
    p.teamName.toLowerCase().includes(searchTerm) ||
    p.franchiseId === searchTerm ||
    p.franchiseId === searchTerm.padStart(3, '0')
  );

  if (!team) {
    ui.alert('Team Not Found', `No team found matching "${searchTerm}".`, ui.ButtonSet.OK);
    return;
  }

  // Build display
  const playoffBar = '█'.repeat(Math.round(team.playoffPct / 10)) + '░'.repeat(10 - Math.round(team.playoffPct / 10));
  const bowlBar = '█'.repeat(Math.round(team.bowlPct / 10)) + '░'.repeat(10 - Math.round(team.bowlPct / 10));
  const champBar = '█'.repeat(Math.round(team.conferenceChampPct / 10)) + '░'.repeat(10 - Math.round(team.conferenceChampPct / 10));

  const lines = [];
  lines.push(`${team.teamName}`);
  lines.push(`Conference: ${team.conference}`);
  lines.push(`Current Rank: #${team.currentRank}`);
  lines.push(`Record: ${team.currentWins}-${team.currentLosses}`);
  lines.push(`Games Remaining: ${team.gamesRemaining}`);
  lines.push(`Expected Final Wins: ${team.expectedFinalWins.toFixed(1)}`);
  lines.push('');
  lines.push(`🏆 PLAYOFF: ${playoffBar} ${team.playoffPct.toFixed(1)}%`);
  lines.push(`   Path: ${team.playoffPath}`);
  lines.push('');
  lines.push(`🏟️ CONF CHAMP: ${champBar} ${team.conferenceChampPct.toFixed(1)}%`);
  lines.push(`   Conference Rank: #${team.conferenceRank}`);

  if (team.playoffPct < 80) {
    lines.push('');
    lines.push(`🎯 BOWL: ${bowlBar} ${team.bowlPct.toFixed(1)}%`);
  }

  ui.alert(
    `Projection - ${team.teamName}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to calculate conference standings for a specific week
 * Uses ScheduleResults data to calculate standings with tiebreakers
 */
function promptCalculateConferenceStandings() {
  const ui = SpreadsheetApp.getUi();
  const config = getConfig();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(defaultYear);

  // Prompt for year
  const yearResponse = ui.prompt(
    'Calculate Conference Standings',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const yearInput = yearResponse.getResponseText().trim();
  const year = yearInput ? Number(yearInput) : Number(defaultYear);

  if (isNaN(year) || year < 2020 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2020 and 2030.');
    return;
  }

  // Get regular season weeks for the selected year
  const yearRegularSeasonWeeks = config.season.getRegularSeasonWeeks(year);

  // Prompt for week
  const weekResponse = ui.prompt(
    'Through Week',
    `Enter week to calculate standings through (1-${yearRegularSeasonWeeks}):\n\n` +
    `Default: ${Math.min(currentWeek, yearRegularSeasonWeeks)} (current week, capped at regular season)\n\n` +
    `Note: Conference standings only count regular season games (weeks 1-${yearRegularSeasonWeeks}).`,
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const weekInput = weekResponse.getResponseText().trim();
  const throughWeek = weekInput ? Number(weekInput) : Math.min(currentWeek, yearRegularSeasonWeeks);

  if (isNaN(throughWeek) || throughWeek < 1 || throughWeek > yearRegularSeasonWeeks) {
    ui.alert(`Invalid week. Please enter a number between 1 and ${yearRegularSeasonWeeks}.`);
    return;
  }

  // Confirm
  const confirm = ui.alert(
    'Calculate Conference Standings',
    `Calculate conference standings for ${year} through Week ${throughWeek}?\n\n` +
    `This will:\n` +
    `• Read game results from ScheduleResults\n` +
    `• Apply tiebreakers (H2H → All-Play% → PF → Rank)\n` +
    `• Save standings to ConferenceStandings sheet\n` +
    `• Identify CCG-bound teams for each conference`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  // Calculate and save
  const count = calculateAndSaveConferenceStandings(year, throughWeek);

  // Show summary
  const championships = getProjectedConferenceChampionships(year, throughWeek);
  const lines = [`Conference standings calculated for ${year} Week ${throughWeek}.\n`];

  lines.push('PROJECTED CCG MATCHUPS:');
  ['ACC', 'B10', 'B12', 'P12', 'SEC'].forEach(conf => {
    const matchup = championships[conf];
    if (matchup.team1 && matchup.team2) {
      lines.push(`${conf}: ${matchup.team1.teamName} vs ${matchup.team2.teamName}`);
    } else {
      lines.push(`${conf}: TBD`);
    }
  });

  ui.alert(
    'Conference Standings Calculated',
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view conference standings with tiebreakers
 */
function promptViewConferenceStandings() {
  const ui = SpreadsheetApp.getUi();
  const config = getConfig();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(defaultYear);

  const confResponse = ui.prompt(
    'View Conference Standings',
    'Enter conference (ACC, B10, B12, P12, SEC):',
    ui.ButtonSet.OK_CANCEL
  );

  if (confResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const conference = confResponse.getResponseText().trim().toUpperCase();
  if (!conference) {
    ui.alert('Please enter a conference name.');
    return;
  }

  const throughWeek = Math.min(currentWeek, regularSeasonWeeks);
  const standings = getConferenceStandingsWithTiebreakers(Number(defaultYear), conference, throughWeek);

  if (standings.length === 0) {
    ui.alert('Conference Not Found', `No teams found in "${conference}".`, ui.ButtonSet.OK);
    return;
  }

  const isAutoBid = ['ACC', 'B10', 'B12', 'P12', 'SEC'].includes(conference);
  const lines = [];

  lines.push(`${conference} STANDINGS (Week ${throughWeek})\n`);
  if (isAutoBid) {
    lines.push(`🏆 Top 2 teams advance to Conference Championship\n`);
  }

  standings.forEach(team => {
    const record = `${team.confWins}-${team.confLosses}`;
    const winPct = (team.confWinPct * 100).toFixed(1);
    const ccgIcon = team.ccgBound ? '📍' : '  ';
    const tiebreaker = team.tiebreaker ? ` (${team.tiebreaker})` : '';

    lines.push(`${ccgIcon} ${team.standing}. ${team.teamName}`);
    lines.push(`     ${record} (${winPct}%)${tiebreaker}`);
  });

  if (isAutoBid) {
    lines.push('');
    lines.push('📍 = Conference Championship bound');
  }

  // Log for full details
  Logger.log(`\n=== ${conference} Standings (Week ${throughWeek}) ===`);
  standings.forEach(t => {
    Logger.log(`${t.standing}. ${t.teamName} ${t.confWins}-${t.confLosses} CCG:${t.ccgBound} TB:${t.tiebreaker || 'N/A'}`);
  });

  ui.alert(
    `${conference} Standings - ${defaultYear}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to view all Conference Championship Game matchups
 */
function promptViewAllCCGMatchups() {
  const ui = SpreadsheetApp.getUi();
  const config = getConfig();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(defaultYear);
  const throughWeek = Math.min(currentWeek, regularSeasonWeeks);

  const championships = getProjectedConferenceChampionships(Number(defaultYear), throughWeek);

  const lines = [];
  lines.push(`PROJECTED CONFERENCE CHAMPIONSHIPS`);
  lines.push(`As of Week ${throughWeek}\n`);

  const confOrder = ['ACC', 'B10', 'B12', 'P12', 'SEC'];

  confOrder.forEach(conf => {
    const matchup = championships[conf];

    if (matchup.team1 && matchup.team2) {
      const t1 = matchup.team1;
      const t2 = matchup.team2;
      const t1Record = `(${t1.confWins}-${t1.confLosses})`;
      const t2Record = `(${t2.confWins}-${t2.confLosses})`;
      const t1TB = t1.tiebreaker ? ` [${t1.tiebreaker}]` : '';
      const t2TB = t2.tiebreaker ? ` [${t2.tiebreaker}]` : '';

      lines.push(`🏆 ${conf} CHAMPIONSHIP`);
      lines.push(`   #1 ${t1.teamName} ${t1Record}${t1TB}`);
      lines.push(`   #2 ${t2.teamName} ${t2Record}${t2TB}`);
      lines.push('');
    } else {
      lines.push(`🏆 ${conf}: TBD`);
      lines.push('');
    }
  });

  lines.push('Winner of each game receives automatic playoff bid');

  // Log full details
  Logger.log(`\n=== Projected Conference Championships (Week ${throughWeek}) ===`);
  Object.entries(championships).forEach(([conf, m]) => {
    if (m.team1 && m.team2) {
      Logger.log(`${conf}: ${m.team1.teamName} vs ${m.team2.teamName}`);
    }
  });

  ui.alert(
    `Conference Championships - ${defaultYear}`,
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

// ============================================================================
// RECRUITING DOLLARS MENU FUNCTIONS
// ============================================================================

/**
 * Prompt to calculate recruiting dollars for current year
 */
function promptCalculateRecruitingDollars() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();
  const currentWeek = getCurrentNFLWeek();

  const confirm = ui.alert(
    'Calculate Recruiting Dollars',
    `Year: ${defaultYear}\n` +
    `Current Week: ${currentWeek}\n\n` +
    `This will calculate bonus dollars from:\n` +
    `• Regular season wins ($1/win)\n` +
    `• Postseason wins ($2/win)\n` +
    `• Awards (Heisman, All-Conference)\n` +
    `• Rivalry wagers\n` +
    `• Draft bonuses (if Week 17+)\n\n` +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  calculateRecruitingDollars(defaultYear, currentWeek);

  ui.alert(
    'Recruiting Dollars Calculated',
    `Year: ${defaultYear} (through Week ${currentWeek})\n\n` +
    'Check the "RecruitingDollars" sheet for results.\n' +
    'Check Logs (View > Logs) for calculation details.',
    ui.ButtonSet.OK
  );
}

/**
 * Prompt to calculate recruiting dollars for a specific year and week
 */
function promptCalculateRecruitingDollarsCustom() {
  const ui = SpreadsheetApp.getUi();
  const defaultYear = getLeagueYear();

  // Get year
  const yearResponse = ui.prompt(
    'Calculate Recruiting Dollars',
    `Enter year (default: ${defaultYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const year = Number(yearResponse.getResponseText().trim() || defaultYear);

  if (isNaN(year) || year < 2018 || year > 2030) {
    ui.alert('Invalid year. Please enter a year between 2018 and 2030.');
    return;
  }

  // Get week
  const weekResponse = ui.prompt(
    'Calculate Recruiting Dollars',
    'Enter week to calculate through (1-17):\n\n' +
    '• Weeks 1-12: Regular season only\n' +
    '• Week 17: Final (includes draft bonuses)',
    ui.ButtonSet.OK_CANCEL
  );

  if (weekResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const week = Number(weekResponse.getResponseText().trim());

  if (isNaN(week) || week < 1 || week > 17) {
    ui.alert('Invalid week. Please enter a number between 1 and 17.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Calculation',
    `Calculate recruiting dollars for ${year} through Week ${week}?`,
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return;
  }

  calculateRecruitingDollars(year, week);

  const status = week >= 17 ? "FINAL" : "PROJECTED";
  ui.alert(
    'Recruiting Dollars Calculated',
    `Year: ${year} (through Week ${week})\n` +
    `Status: ${status}\n\n` +
    'Check the "RecruitingDollars" sheet for results.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// SET LEAGUE YEAR
// ============================================================================

/**
 * Menu prompt to set the league year
 * This is THE one place to update when a new season starts
 */
function promptSetLeagueYear() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();

  const response = ui.prompt(
    '📅 Set League Year',
    `Current league year: ${currentYear}\n\n` +
    'Enter the new league year (e.g., 2026):\n\n' +
    'This affects which year all menu functions default to.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const newYear = response.getResponseText().trim();
  if (!newYear || isNaN(Number(newYear)) || Number(newYear) < 2020 || Number(newYear) > 2035) {
    ui.alert('Invalid year. Please enter a valid year between 2020 and 2035.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Year Change',
    `Change league year from ${currentYear} to ${newYear}?\n\n` +
    'This will update the default year for all menu functions.',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  setLeagueYear(newYear);

  ui.alert('League Year Updated',
    `League year changed: ${currentYear} → ${newYear}\n\n` +
    'All menu functions will now default to ' + newYear + '.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// SEASON CHECKLIST WIZARDS
// ============================================================================

/**
 * Wizard: End of Season Processing
 * Walks through: Awards → Sync → Theoretical Draft → Recruiting Dollars
 */
function wizardEndOfSeason() {
  const ui = SpreadsheetApp.getUi();
  const year = getLeagueYear();
  const config = getConfig();
  const regularSeasonWeeks = config.season.getRegularSeasonWeeks(year);

  // Step 0: Confirm
  const start = ui.alert(
    '📋 End of Season Wizard (Step 1 of 4)',
    `League Year: ${year}\n\n` +
    'This wizard will walk you through:\n' +
    '1. Calculate final awards\n' +
    '2. Sync awards to PlayerCopies\n' +
    '3. Calculate theoretical draft bonuses\n' +
    '4. Calculate recruiting dollars\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (start !== ui.Button.YES) return;

  // Step 1: Calculate Awards
  Logger.log(`=== Wizard: End of Season for ${year} ===`);
  Logger.log(`Step 1: Calculating awards through Week ${regularSeasonWeeks}...`);
  const rankings = calculateAwards(year, regularSeasonWeeks);
  const heismanWinner = rankings.heisman[0];

  const step1 = ui.alert(
    '✅ Step 1 Complete: Awards Calculated',
    `Year: ${year} (through Week ${regularSeasonWeeks})\n\n` +
    `Heisman Leader: ${heismanWinner?.playerName || 'N/A'}\n\n` +
    'Proceed to Step 2: Sync Awards to PlayerCopies?',
    ui.ButtonSet.YES_NO
  );
  if (step1 !== ui.Button.YES) {
    ui.alert('Wizard paused. You can resume individual steps from the menu.');
    return;
  }

  // Step 2: Sync to PlayerCopies
  Logger.log('Step 2: Syncing awards to PlayerCopies...');
  const ownershipUpdated = syncOwnershipFromTransactionLog();
  const awardsYears = getAwardsYears();
  let totalAwardsUpdated = 0;
  clearAllAwardsFromPlayerCopies();
  for (const awardYear of awardsYears) {
    try {
      const awardSync = syncAwardsToPlayerCopies(awardYear);
      totalAwardsUpdated += awardSync.copiesUpdated || 0;
    } catch (e) {
      Logger.log(`  ${awardYear}: ERROR - ${e.message}`);
    }
  }

  const step2 = ui.alert(
    '✅ Step 2 Complete: Awards Synced',
    `Ownership updated: ${ownershipUpdated} copies\n` +
    `Awards synced: ${totalAwardsUpdated} updates\n\n` +
    'Proceed to Step 3: Calculate Theoretical Draft?',
    ui.ButtonSet.YES_NO
  );
  if (step2 !== ui.Button.YES) {
    ui.alert('Wizard paused. Run Theoretical Draft and Recruiting Dollars manually.');
    return;
  }

  // Step 3: Theoretical Draft
  Logger.log('Step 3: Calculating theoretical draft...');
  try {
    calculateTheoreticalDraft(year);
    var draftMsg = 'Theoretical draft calculated.';
  } catch (e) {
    var draftMsg = 'Warning: ' + e.message;
    Logger.log('Theoretical draft error: ' + e.message);
  }

  const step3 = ui.alert(
    '✅ Step 3 Complete: Theoretical Draft',
    draftMsg + '\n\n' +
    'Proceed to Step 4: Calculate Recruiting Dollars?',
    ui.ButtonSet.YES_NO
  );
  if (step3 !== ui.Button.YES) {
    ui.alert('Wizard paused. Run Recruiting Dollars manually.');
    return;
  }

  // Step 4: Recruiting Dollars
  Logger.log('Step 4: Calculating recruiting dollars...');
  const currentWeek = getCurrentNFLWeek();
  calculateRecruitingDollars(year, currentWeek);

  ui.alert(
    '🎉 End of Season Complete!',
    `All 4 steps completed for ${year}:\n\n` +
    '✅ Awards calculated\n' +
    '✅ Awards synced to PlayerCopies\n' +
    '✅ Theoretical draft calculated\n' +
    '✅ Recruiting dollars calculated\n\n' +
    'NEXT: Run "2. Declarations & Redshirts" from the Season Checklist.',
    ui.ButtonSet.OK
  );
}

/**
 * Wizard: Declarations & Redshirts
 * Walks through: View eligible → Process declarations → End season (redshirts)
 */
function wizardDeclarationsAndRedshirts() {
  const ui = SpreadsheetApp.getUi();
  const year = getLeagueYear();

  // Step 0: Confirm
  const start = ui.alert(
    '📋 Declarations & Redshirts Wizard',
    `League Year: ${year}\n\n` +
    'This wizard will walk you through:\n' +
    '1. View declaration-eligible players\n' +
    '2. Process early declarations (⚠️ irreversible)\n' +
    '3. End season processing (redshirts)\n\n' +
    'PREREQUISITE: Awards must be synced to PlayerCopies.\n' +
    '(Run "1. End of Season Processing" first if you haven\'t.)\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (start !== ui.Button.YES) return;

  // Step 1: View eligible players
  Logger.log(`=== Wizard: Declarations & Redshirts for ${year} ===`);
  Logger.log('Step 1: Showing eligible declaration players...');

  // Use the existing view function - it logs details
  try {
    const config = getConfig();
    const pcSheet = SpreadsheetApp.getActive().getSheetByName(config.sheets.playerCopies);
    if (!pcSheet) throw new Error("PlayerCopies sheet not found");
    const data = pcSheet.getDataRange().getValues();
    const headers = data[0];
    const colMap = {};
    headers.forEach((h, i) => colMap[h] = i);

    let eligibleCount = 0;
    const eligibleList = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[colMap["Active"]] !== true) continue;
      const yearsUsed = Number(row[colMap["EligibilityYearsUsed"]] || 0);
      const tradRS = row[colMap["TraditionalRedshirtUsed"]] === true || row[colMap["TraditionalRedshirtUsed"]] === "TRUE";
      const medRS = row[colMap["MedicalRedshirtUsed"]] === true || row[colMap["MedicalRedshirtUsed"]] === "TRUE";
      const programYears = yearsUsed + (tradRS ? 1 : 0) + (medRS ? 1 : 0);
      if (programYears < config.declarations.minYearsForDeclaration) continue;
      const natAwards = Number(row[colMap["NationalAwards"]] || 0);
      const acAwards = Number(row[colMap["AllConferenceAwards"]] || 0);
      if (natAwards >= config.declarations.nationalAwardsRequired ||
          acAwards >= config.declarations.allConferenceAwardsRequired) {
        eligibleCount++;
        if (eligibleList.length < 15) {
          eligibleList.push(`${row[colMap["PlayerName"]]} (${row[colMap["Conference"]]}) - Nat:${natAwards} AC:${acAwards}`);
        }
      }
    }

    const step1 = ui.alert(
      'Step 1: Declaration-Eligible Players',
      `Found ${eligibleCount} eligible player copies.\n\n` +
      (eligibleList.length > 0 ? eligibleList.join('\n') + '\n' : '') +
      (eligibleCount > 15 ? `\n... and ${eligibleCount - 15} more (see Logger)\n` : '') +
      '\n⚠️ Have all coaches submitted RETAIN/RELEASE decisions?\n\n' +
      'Click YES to proceed to Process Declarations.\n' +
      'Click NO to pause and collect decisions first.',
      ui.ButtonSet.YES_NO
    );

    if (step1 !== ui.Button.YES) {
      ui.alert('Wizard Paused',
        'Collect RETAIN/RELEASE decisions from coaches, then run this wizard again\n' +
        'or use Declarations → Process Early Declarations.',
        ui.ButtonSet.OK
      );
      return;
    }
  } catch (e) {
    ui.alert('Error', `Could not read PlayerCopies: ${e.message}`, ui.ButtonSet.OK);
    return;
  }

  // Step 2: Process declarations
  const confirmDecl = ui.alert(
    '⚠️ Step 2: Process Early Declarations',
    `This will process early declarations for ${year}.\n\n` +
    '⚠️ THIS IS IRREVERSIBLE.\n\n' +
    'Players with RELEASE decisions will be marked inactive.\n' +
    'Players with RETAIN (or no decision) will be retained at cost.\n\n' +
    'Are you sure?',
    ui.ButtonSet.YES_NO
  );

  if (confirmDecl !== ui.Button.YES) {
    ui.alert('Wizard paused. Run declarations manually when ready.');
    return;
  }

  Logger.log('Step 2: Processing early declarations...');
  const declResults = processEarlyDeclarations(year);

  const step2 = ui.alert(
    '✅ Step 2 Complete: Declarations Processed',
    `Released: ${declResults.released}\n` +
    `Retained: ${declResults.retained}\n` +
    `Auto-Retained: ${declResults.autoRetained}\n\n` +
    'Proceed to Step 3: End Season (Redshirts)?',
    ui.ButtonSet.YES_NO
  );
  if (step2 !== ui.Button.YES) {
    ui.alert('Wizard paused. Run "End Season" from Season Management manually.');
    return;
  }

  // Step 3: End season (redshirts)
  Logger.log('Step 3: Processing redshirts...');
  const redshirtResults = processRedshirtsForSeason(year);

  ui.alert(
    '🎉 Declarations & Redshirts Complete!',
    `All steps completed for ${year}:\n\n` +
    `✅ Declarations: ${declResults.released} released, ${declResults.retained} retained\n` +
    `✅ Traditional redshirts: ${redshirtResults.traditional}\n` +
    `✅ Medical redshirts: ${redshirtResults.medical}\n\n` +
    'NEXT: Run "3. Year Rollover" from the Season Checklist.',
    ui.ButtonSet.OK
  );
}

/**
 * Wizard: Year Rollover
 * Walks through: Set year → Rollover eligibility → Ingest rookies
 */
function wizardYearRollover() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();
  const suggestedNewYear = String(Number(currentYear) + 1);

  // Step 0: Confirm
  const yearResponse = ui.prompt(
    '📋 Year Rollover Wizard',
    `Current league year: ${currentYear}\n\n` +
    'This wizard will:\n' +
    '1. Set the new league year\n' +
    '2. Rollover eligibility (increment years, graduate seniors)\n' +
    '3. Optionally ingest new rookies\n\n' +
    'PREREQUISITE: End season processing must be complete.\n' +
    '(Run "2. Declarations & Redshirts" first.)\n\n' +
    `Enter the NEW league year (default: ${suggestedNewYear}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;

  const newYear = yearResponse.getResponseText().trim() || suggestedNewYear;
  if (isNaN(Number(newYear)) || Number(newYear) < 2020 || Number(newYear) > 2035) {
    ui.alert('Invalid year.');
    return;
  }

  // Step 1: Set league year
  Logger.log(`=== Wizard: Year Rollover ${currentYear} → ${newYear} ===`);
  Logger.log('Step 1: Setting league year...');
  setLeagueYear(newYear);

  const step1 = ui.alert(
    '✅ Step 1 Complete: League Year Updated',
    `League year changed: ${currentYear} → ${newYear}\n\n` +
    'Proceed to Step 2: Rollover Eligibility?\n\n' +
    `This will increment EligibilityYearsUsed for all active players\n` +
    `and graduate (deactivate) players at 4 years.`,
    ui.ButtonSet.YES_NO
  );
  if (step1 !== ui.Button.YES) {
    ui.alert('Wizard paused. Year is set to ' + newYear + '. Run rollover manually.');
    return;
  }

  // Step 2: Rollover eligibility
  Logger.log('Step 2: Rolling over eligibility...');
  const incremented = incrementEligibilityYears(currentYear, newYear);

  const step2 = ui.alert(
    '✅ Step 2 Complete: Eligibility Rolled Over',
    `Incremented eligibility for ${incremented} player copies.\n` +
    `(${currentYear} → ${newYear})\n\n` +
    'Players at 4 years have been graduated (marked inactive).\n\n' +
    'Would you like to ingest rookies for ' + newYear + ' now?\n\n' +
    '(Only do this AFTER the NFL draft has completed)',
    ui.ButtonSet.YES_NO
  );

  if (step2 === ui.Button.YES) {
    // Step 3: Ingest rookies
    Logger.log('Step 3: Ingesting rookies...');
    const rookiesAdded = ingestRookiesForYear(newYear);
    updatePlayerCopyOwnership(newYear);

    ui.alert(
      '🎉 Year Rollover Complete!',
      `All steps completed:\n\n` +
      `✅ League year set to ${newYear}\n` +
      `✅ Eligibility rolled over (${incremented} copies)\n` +
      `✅ Rookies ingested: ${rookiesAdded}\n\n` +
      'The league is ready for the ' + newYear + ' season!\n\n' +
      'Don\'t forget to:\n' +
      '• Run the Devy Draft (separate sheet)\n' +
      '• Generate the game schedule (separate sheet)\n' +
      '• Set up weekly triggers (Awards/Rankings menus)',
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      '🎉 Year Rollover Complete!',
      `Steps completed:\n\n` +
      `✅ League year set to ${newYear}\n` +
      `✅ Eligibility rolled over (${incremented} copies)\n` +
      `⏸️ Rookie ingestion skipped (run manually after NFL draft)\n\n` +
      'Use Sync Data → Ingest Rookies when ready.',
      ui.ButtonSet.OK
    );
  }
}

// ============================================================================
// OPERATIONS GUIDE
// ============================================================================

/**
 * Generate or update the Operations Guide sheet
 * Creates a comprehensive guide for managing the league throughout the season
 */
function generateOperationsGuide() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();

  // Check if sheet exists
  let sheet = ss.getSheetByName("📖 Operations Guide");
  const isUpdate = !!sheet;

  if (sheet) {
    // Clear existing content
    sheet.clear();
  } else {
    // Create new sheet
    sheet = ss.insertSheet("📖 Operations Guide");
  }

  // Move to first position
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);

  // Set up formatting
  sheet.setColumnWidth(1, 50);   // Section marker
  sheet.setColumnWidth(2, 250);  // Step/Item
  sheet.setColumnWidth(3, 350);  // Description
  sheet.setColumnWidth(4, 200);  // Menu Path
  sheet.setColumnWidth(5, 300);  // Notes

  const rows = [];

  // ===== HEADER =====
  rows.push(["", "LEAGUE OPERATIONS GUIDE", "", "", ""]);
  rows.push(["", "Last Updated: " + new Date().toLocaleDateString(), "", "", ""]);
  rows.push(["", "", "", "", ""]);

  // ===== SEASON LIFECYCLE OVERVIEW =====
  rows.push(["═══", "SEASON LIFECYCLE OVERVIEW", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Phase", "Timing", "Key Actions", ""]);
  rows.push(["1", "Pre-Season", "After NFL Draft", "Ingest rookies, create player copies", ""]);
  rows.push(["2", "Regular Season", "Weeks 1-12", "Weekly: Rankings, Awards, Projections (automated)", ""]);
  rows.push(["3", "Postseason", "Weeks 13-17", "Final rankings, Theoretical Draft, Recruiting Dollars", ""]);
  rows.push(["4", "End of Season", "After Week 17", "Process declarations, redshirts", ""]);
  rows.push(["5", "Year Rollover", "Before new season", "Increment eligibility, update year setting", ""]);
  rows.push(["", "", "", "", ""]);

  // ===== WEEKLY OPERATIONS (AUTOMATED) =====
  rows.push(["═══", "WEEKLY OPERATIONS (AUTOMATED)", "", "", ""]);
  rows.push(["", "When triggers are set up, these run automatically every Tuesday at 6 AM:", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Trigger", "What It Does", "Menu to Setup", ""]);
  rows.push(["✓", "Rankings Trigger", "1) Calculate rankings  2) Calculate projections", "Power Rankings → Setup Weekly Trigger", ""]);
  rows.push(["✓", "Awards Trigger", "1) Refresh week cache  2) Calculate awards", "Awards → Setup Weekly Trigger", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "⚠️ STILL MANUAL: Run 'Sync Roster Ownership' periodically to update PlayerCopies", "", "Sync Data → Sync Roster Ownership", ""]);
  rows.push(["", "", "", "", ""]);

  // ===== PRE-SEASON SETUP =====
  rows.push(["═══", "PRE-SEASON SETUP (After NFL Draft)", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Step", "Description", "Menu Path", "Notes"]);
  rows.push(["1", "Update Year Setting", "Set LEAGUE_YEAR to new season", "📅 Set League Year", "Enter new year when prompted"]);
  rows.push(["2", "Ingest Rookies", "Fetch rookies from MFL, create player copies", "Sync Data → Ingest Rookies", "Creates 2 copies per conference"]);
  rows.push(["3", "Verify Data", "Check RookieLedger and PlayerCopies", "Manual check", "New rookies should have EligibilityYearsUsed=0"]);
  rows.push(["4", "Setup Triggers", "Enable weekly automation", "Awards/Rankings → Setup Weekly Trigger", "Both should run Tuesdays 6 AM"]);
  rows.push(["", "", "", "", ""]);

  // ===== REGULAR SEASON =====
  rows.push(["═══", "REGULAR SEASON (Weeks 1-12)", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "If using triggers, most tasks are automated. Manual tasks:", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Task", "Frequency", "Menu Path", "Notes"]);
  rows.push(["•", "Sync Roster Ownership", "Weekly/Bi-weekly", "Sync Data → Sync Roster Ownership", "Updates ownership + syncs awards to PlayerCopies"]);
  rows.push(["•", "Process Transactions", "As needed", "Sync Data → Process Current Year Transactions", "If TransactionLog needs rebuild"]);
  rows.push(["", "", "", "", ""]);

  // ===== POSTSEASON =====
  rows.push(["═══", "POSTSEASON (Weeks 13-17)", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Step", "When", "Menu Path", "Notes"]);
  rows.push(["1", "Final Awards", "After Week 12", "Awards → Calculate Current Awards", "Finalizes Heisman, All-Conference"]);
  rows.push(["2", "Sync to PlayerCopies", "After Week 12", "Sync Data → Sync Roster Ownership", "CRITICAL: Awards must be synced before declarations"]);
  rows.push(["3", "Final Rankings", "After Championship", "Power Rankings → Calculate Current Rankings", "Select Week 18 for Final Rankings"]);
  rows.push(["4", "Theoretical Draft", "After Week 12+", "Theoretical Draft → Calculate Current Year Draft", "Calculates draft bonuses for graduating players"]);
  rows.push(["5", "Recruiting Dollars", "After Championship", "Recruiting Dollars → Calculate Current", "Final bonus dollar calculation"]);
  rows.push(["", "", "", "", ""]);

  // ===== END OF SEASON - PHASE 1: SEASON WRAP-UP =====
  rows.push(["═══", "PHASE 1: SEASON WRAP-UP", "", "", ""]);
  rows.push(["", "⚠️ ORDER MATTERS! Follow these steps exactly.", "", "", ""]);
  rows.push(["", "Wizard shortcut: Season Checklist → 1. End of Season Processing", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Step", "Description", "Menu Path", "Notes"]);
  rows.push(["1", "Process Transactions", "Ensure TransactionLog has all roster moves for the year", "Sync Data → Process Current Year Transactions", "Source of truth for ownership and redshirts"]);
  rows.push(["2", "Sync Roster Ownership", "Update PlayerCopies ownership from TransactionLog", "Sync Data → Sync Roster Ownership", "Sets CurrentFranchiseID on each copy"]);
  rows.push(["3", "Calculate Final Awards", "Calculate Heisman, All-Conference through Week 12", "Awards → Calculate Current Awards", "Must be done before declarations"]);
  rows.push(["4", "Sync Awards to PlayerCopies", "Awards must be on PlayerCopies for declaration eligibility", "Sync Data → Sync Roster Ownership", "Also done as part of Step 2 if awards exist"]);
  rows.push(["5", "Calculate Theoretical Draft", "Draft bonuses for graduating/declaring players", "Theoretical Draft → Calculate Current Year Draft", "Requires Week 12+ rankings"]);
  rows.push(["6", "Calculate Recruiting Dollars", "Final bonus dollar calculation", "Recruiting Dollars → Calculate Current", "Requires Rankings, Awards, Theoretical Draft"]);
  rows.push(["", "", "", "", ""]);

  // ===== END OF SEASON - PHASE 2: DECLARATIONS & REDSHIRTS =====
  rows.push(["═══", "PHASE 2: DECLARATIONS & REDSHIRTS", "", "", ""]);
  rows.push(["", "⚠️ Awards MUST be synced to PlayerCopies before this phase.", "", "", ""]);
  rows.push(["", "Wizard shortcut: Season Checklist → 2. Declarations & Redshirts", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Step", "Description", "Menu Path", "Notes"]);
  rows.push(["7", "View Eligible Players", "See who qualifies to declare early", "Declarations → View Eligible Players", "3+ program years (playing + redshirt) AND (1 nat'l award OR 2 all-conf)"]);
  rows.push(["8", "Collect Decisions", "Get RETAIN/RELEASE from each coach", "Manual / Discord bot", "Set a deadline — default is RETAIN"]);
  rows.push(["9", "Process Declarations", "Apply RETAIN/RELEASE, mark released players inactive", "Declarations → Process Early Declarations", "⚠️ IRREVERSIBLE — double-check decisions"]);
  rows.push(["10", "Process Redshirts", "Scan TransactionLog for end-of-season taxi/IR status", "Season Management → End Season", "Last move rule: must be ON taxi/IR at season end"]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "REDSHIRT RULES:", "", "", ""]);
  rows.push(["", "  Traditional", "Rookie on TAXI at season end (last taxi move = demotion)", "", "Once per copy, rookie year only"]);
  rows.push(["", "  Medical", "Player on IR at season end (last IR move = deactivation)", "", "Once per copy EVER (no second medical)"]);
  rows.push(["", "", "", "", ""]);

  // ===== PHASE 3: YEAR ROLLOVER =====
  rows.push(["═══", "PHASE 3: YEAR ROLLOVER", "", "", ""]);
  rows.push(["", "⚠️ Declarations and redshirts MUST be processed before rollover.", "", "", ""]);
  rows.push(["", "Wizard shortcut: Season Checklist → 3. Year Rollover", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Step", "Description", "Menu Path", "Notes"]);
  rows.push(["11", "Rollover Eligibility", "Increment EligibilityYearsUsed for active copies", "Season Management → Rollover to New Year", "Skips redshirted copies (year didn't count). Graduates 4-year players."]);
  rows.push(["12", "Recalculate Active Status", "Verify eligibility is correct accounting for redshirts", "Maintenance → Recalculate Active Status", "Uses yearsPassed − redshirts formula. Clears ownership for graduated copies."]);
  rows.push(["13", "Sync Roster Ownership", "Clean up ownership after rollover", "Sync Data → Sync Roster Ownership", "Ensures graduated copies have no owner"]);
  rows.push(["14", "Set League Year", "Update LEAGUE_YEAR to the new season", "📅 Set League Year", "MUST be done before ingesting rookies"]);
  rows.push(["15", "Ingest New Rookies", "Create player copies for new draft class", "Sync Data → Ingest Rookies", "Only after NFL Draft. Creates 2 copies per conference."]);
  rows.push(["16", "Verify Data", "Confirm new rookies and graduated players", "Manual check", "Rookies: EligYearsUsed=0, Active=TRUE. Seniors: Active=FALSE."]);
  rows.push(["17", "Setup Weekly Triggers", "Enable automation for new season", "Awards / Rankings → Setup Weekly Trigger", "Both should run Tuesdays 6 AM"]);
  rows.push(["", "", "", "", ""]);

  // ===== COMMON PITFALLS =====
  rows.push(["═══", "COMMON PITFALLS - DON'T DO THIS!", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Mistake", "Why It's Bad", "Correct Approach", ""]);
  rows.push(["❌", "Process declarations before syncing awards", "Players won't have award counts for eligibility", "Always run Sync Roster Ownership first (Steps 2-4)"]);
  rows.push(["❌", "Rollover before processing redshirts", "Redshirts won't be applied, eligibility will be wrong", "Complete Phase 2 (Steps 7-10) before Phase 3"]);
  rows.push(["❌", "Process redshirts before processing transactions", "TransactionLog won't have taxi/IR moves to read", "Run Process Transactions (Step 1) first"]);
  rows.push(["❌", "Calculate draft before Week 12 rankings", "No graduation/eligibility data", "Wait until Week 12+"]);
  rows.push(["❌", "Ingest rookies before updating year", "Creates copies with wrong year", "Set League Year (Step 14) before Ingest Rookies (Step 15)"]);
  rows.push(["❌", "Skip Recalculate Active Status after rollover", "Redshirted copies may have wrong eligibility count", "Always run Step 12 after rollover"]);
  rows.push(["❌", "Manual edits to EligibilityYearsUsed", "Breaks graduation/draft calculations", "Use Recalculate Active Status instead"]);
  rows.push(["", "", "", "", ""]);

  // ===== DATA DEPENDENCIES =====
  rows.push(["═══", "DATA DEPENDENCIES", "", "", ""]);
  rows.push(["", "Understanding what data each function needs:", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Function", "Requires", "Produces", ""]);
  rows.push(["→", "Ingest Rookies", "MFL API access", "RookieLedger, PlayerCopies entries"]);
  rows.push(["→", "Calculate Rankings", "MFL schedule/results", "PowerRankings, ScheduleResults"]);
  rows.push(["→", "Calculate Awards", "WeeklyResults cache", "Awards sheet"]);
  rows.push(["→", "Sync Roster Ownership", "TransactionLog, Awards", "PlayerCopies ownership + award counts"]);
  rows.push(["→", "Calculate Projections", "ScheduleResults", "Projections sheet"]);
  rows.push(["→", "Theoretical Draft", "Awards synced to PlayerCopies, Week 12+ rankings", "TheoreticalDraft sheet"]);
  rows.push(["→", "Recruiting Dollars", "PowerRankings, Awards, TheoreticalDraft", "RecruitingDollars sheet"]);
  rows.push(["→", "Process Declarations", "Awards synced to PlayerCopies", "Updated PlayerCopies (inactive)"]);
  rows.push(["", "", "", "", ""]);

  // ===== KEY SHEETS =====
  rows.push(["═══", "KEY SHEETS REFERENCE", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Sheet", "Purpose", "Auto-Populated By", ""]);
  rows.push(["📄", "RookieLedger", "All NFL rookies by draft year", "Ingest Rookies"]);
  rows.push(["📄", "PlayerCopies", "Player copies with eligibility, ownership, awards", "Multiple functions"]);
  rows.push(["📄", "TransactionLog", "All roster moves (source of truth for ownership)", "Process Transactions"]);
  rows.push(["📄", "Awards", "Heisman, National, All-Conference awards", "Calculate Awards"]);
  rows.push(["📄", "WeeklyResults", "Cached weekly results from MFL", "Awards trigger / Populate Cache"]);
  rows.push(["📄", "PowerRankings", "Team rankings by week", "Calculate Rankings"]);
  rows.push(["📄", "ScheduleResults", "Game-by-game results with rankings", "Calculate Rankings"]);
  rows.push(["📄", "Projections", "Playoff/bowl probability projections", "Calculate Projections"]);
  rows.push(["📄", "TheoreticalDraft", "Draft bonus calculations", "Calculate Theoretical Draft"]);
  rows.push(["📄", "RecruitingDollars", "Bonus dollar summary by team", "Calculate Recruiting Dollars"]);
  rows.push(["📄", "FranchiseLookup", "Franchise ID → Name, Conference mapping", "Manual setup"]);
  rows.push(["", "", "", "", ""]);

  // ===== TROUBLESHOOTING =====
  rows.push(["═══", "TROUBLESHOOTING", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Problem", "Cause", "Solution", ""]);
  rows.push(["?", "No draft-eligible players found", "Program years not met (playing + redshirt years)", "Check EligibilityYearsUsed + redshirts >= 3. Run 'Diagnose Eligibility Data'"]);
  rows.push(["?", "Awards not on PlayerCopies", "Awards calculated but not synced", "Run 'Sync Roster Ownership'"]);
  rows.push(["?", "Wrong ownership after transactions", "TransactionLog out of sync", "Run 'Process Current Year Transactions' then 'Sync Roster'"]);
  rows.push(["?", "Franchise IDs missing leading zeros", "Google Sheets number formatting", "Run 'Recalculate Active Status' (includes fix)"]);
  rows.push(["?", "Projections show 0% for everyone", "ScheduleResults not populated", "Run 'Calculate Rankings' first"]);
  rows.push(["?", "Declaration eligible but 0 awards", "Awards not synced to PlayerCopies", "Run 'Sync Current Year Awards' under Declarations menu"]);
  rows.push(["", "", "", "", ""]);

  // ===== YEAR-END CHECKLIST =====
  rows.push(["═══", "YEAR-END CHECKLIST", "", "", ""]);
  rows.push(["", "Follow steps in order. Check off each item as you go.", "", "", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "PHASE 1: SEASON WRAP-UP", "", "Menu Path", ""]);
  rows.push(["☐", "Step 1:  Process Current Year Transactions", "", "Sync Data → Process Current Year Transactions", ""]);
  rows.push(["☐", "Step 2:  Sync Roster Ownership", "", "Sync Data → Sync Roster Ownership", ""]);
  rows.push(["☐", "Step 3:  Calculate Final Awards (Week 12)", "", "Awards → Calculate Current Awards", ""]);
  rows.push(["☐", "Step 4:  Sync Awards to PlayerCopies", "", "Sync Data → Sync Roster Ownership", ""]);
  rows.push(["☐", "Step 5:  Calculate Theoretical Draft", "", "Theoretical Draft → Calculate Current Year Draft", ""]);
  rows.push(["☐", "Step 6:  Calculate Recruiting Dollars", "", "Recruiting Dollars → Calculate Current", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "PHASE 2: DECLARATIONS & REDSHIRTS", "", "", ""]);
  rows.push(["☐", "Step 7:  View Eligible Players", "", "Declarations → View Eligible Players", ""]);
  rows.push(["☐", "Step 8:  Collect RETAIN/RELEASE decisions from coaches", "", "Manual / Discord", ""]);
  rows.push(["☐", "Step 9:  Process Early Declarations ⚠️", "", "Declarations → Process Early Declarations", ""]);
  rows.push(["☐", "Step 10: Process Redshirts (End Season)", "", "Season Management → End Season", ""]);
  rows.push(["", "", "", "", ""]);
  rows.push(["", "PHASE 3: YEAR ROLLOVER", "", "", ""]);
  rows.push(["☐", "Step 11: Rollover Eligibility", "", "Season Management → Rollover to New Year", ""]);
  rows.push(["☐", "Step 12: Recalculate Active Status", "", "Maintenance → Recalculate Active Status", ""]);
  rows.push(["☐", "Step 13: Sync Roster Ownership (post-rollover)", "", "Sync Data → Sync Roster Ownership", ""]);
  rows.push(["☐", "Step 14: Set League Year to new season", "", "📅 Set League Year", ""]);
  rows.push(["☐", "Step 15: Ingest New Rookies (after NFL Draft)", "", "Sync Data → Ingest Rookies", ""]);
  rows.push(["☐", "Step 16: Verify data (rookies=0 years, seniors=inactive)", "", "Manual check", ""]);
  rows.push(["☐", "Step 17: Setup Weekly Triggers for new season", "", "Awards / Rankings → Setup Weekly Trigger", ""]);

  // Write all rows
  sheet.getRange(1, 1, rows.length, 5).setValues(rows);

  // Apply formatting

  // Title formatting
  sheet.getRange(1, 2).setFontSize(18).setFontWeight("bold");
  sheet.getRange(2, 2).setFontSize(10).setFontColor("#666666");

  // Section headers (rows starting with ═══)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === "═══") {
      const range = sheet.getRange(i + 1, 1, 1, 5);
      range.setBackground("#1a73e8");
      range.setFontColor("white");
      range.setFontWeight("bold");
      range.setFontSize(12);
    }
    // Sub-headers (column headers within sections)
    if (rows[i][1] === "Step" || rows[i][1] === "Phase" || rows[i][1] === "Trigger" ||
        rows[i][1] === "Task" || rows[i][1] === "Mistake" || rows[i][1] === "Function" ||
        rows[i][1] === "Sheet" || rows[i][1] === "Problem") {
      const range = sheet.getRange(i + 1, 1, 1, 5);
      range.setBackground("#e8f0fe");
      range.setFontWeight("bold");
    }
    // Phase sub-headers in checklist
    if (String(rows[i][1]).startsWith("PHASE ") || String(rows[i][1]).startsWith("REDSHIRT RULES:")) {
      const range = sheet.getRange(i + 1, 1, 1, 5);
      range.setBackground("#fce8e6");
      range.setFontWeight("bold");
    }
    // Checklist items
    if (rows[i][0] === "☐") {
      sheet.getRange(i + 1, 1).setFontSize(14);
    }
    // Warning/error items
    if (rows[i][0] === "❌") {
      sheet.getRange(i + 1, 2, 1, 3).setFontColor("#d93025");
    }
    // Success/checkmark items
    if (rows[i][0] === "✓") {
      sheet.getRange(i + 1, 1).setFontColor("#1e8e3e").setFontWeight("bold");
    }
  }

  // Freeze first row and protect sheet
  sheet.setFrozenRows(0);

  // Set text wrapping
  sheet.getRange(1, 1, rows.length, 5).setWrap(true);

  // Auto-resize rows
  for (let i = 1; i <= rows.length; i++) {
    try {
      sheet.setRowHeight(i, 21);
    } catch (e) {
      // Ignore if row doesn't exist
    }
  }

  // Show confirmation
  const action = isUpdate ? "updated" : "created";
  ui.alert(
    'Operations Guide ' + (isUpdate ? 'Updated' : 'Created'),
    `The Operations Guide has been ${action}.\n\n` +
    'It contains:\n' +
    '• Season lifecycle overview\n' +
    '• Weekly operations (automated triggers)\n' +
    '• Step-by-step guides for each phase\n' +
    '• Common pitfalls to avoid\n' +
    '• Data dependencies\n' +
    '• Troubleshooting tips\n' +
    '• Year-end checklist\n\n' +
    'The guide is now the first sheet in your workbook.',
    ui.ButtonSet.OK
  );

  Logger.log(`Operations Guide ${action} successfully`);
}

