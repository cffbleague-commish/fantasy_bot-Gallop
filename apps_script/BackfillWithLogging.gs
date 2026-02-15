/**
 * BACKFILL WITH TRANSACTION LOGGING
 * Run backfill with full transaction logging enabled for auditing
 *
 * Transaction logs are APPENDED, not cleared, so you can run backfills
 * for multiple years and build up a complete history.
 *
 * Use clearTransactionLog() manually if you need to start fresh.
 */

/**
 * Incremental backfill with transaction logging
 * Use this to audit what transactions are being processed
 *
 * Note: For 2021, this will also ingest rookies from 2018-2020 to ensure
 * players acquired in 2021 who were drafted earlier have copies available.
 *
 * Transaction logs are APPENDED (not cleared) so history builds up across years.
 */
function incrementalBackfillWithLogging(year) {
  Logger.log(`=== INCREMENTAL BACKFILL WITH LOGGING: ${year} ===`);

  const currentYear = Number(getLeagueYear());
  const priorYearsToIngest = 3; // How many years before 2021 to ingest

  // NOTE: We do NOT clear transaction log here - logs accumulate across years
  // Use clearTransactionLog() manually if you need to start fresh

  // Step 1: Ingest rookies
  Logger.log('\n--- Step 1: Ingesting Rookies ---');

  // For 2021 (first year), also ingest prior years so players drafted before 2021 have copies
  if (year === 2021) {
    Logger.log('  (First year - also ingesting prior years for existing players)');
    for (let priorYear = year - priorYearsToIngest; priorYear < year; priorYear++) {
      const priorRookies = ingestRookiesForYear(String(priorYear));
      Logger.log(`  ${priorYear}: ${priorRookies} rookies ingested`);
    }
  }

  // Ingest current year's rookies
  const rookiesAdded = ingestRookiesForYear(String(year));
  Logger.log(`  ${year}: ${rookiesAdded} rookies ingested`);

  // Step 2: Update eligibility for all player copies
  Logger.log('\n--- Step 2: Calculating Eligibility ---');
  const firstYear = year === 2021 ? year - priorYearsToIngest : 2021;
  backfillEligibilityYears(firstYear, currentYear);

  // Step 3: Process ownership for this year WITH LOGGING ENABLED
  Logger.log('\n--- Step 3: Backfilling Ownership with Transaction Logging ---');
  backfillHistoricalOwnership([year], true); // true = enable logging

  Logger.log(`\n✅ ${year} COMPLETE WITH LOGGING`);
  Logger.log(`Check the "TransactionLog" sheet to see all transactions processed`);
  Logger.log(`Run viewTransactionLogSummary() to see stats`);
}

/**
 * Quick wrappers with logging
 * These APPEND to the transaction log (don't clear it)
 */
function backfill2021WithLogging() { incrementalBackfillWithLogging(2021); }
function backfill2022WithLogging() { incrementalBackfillWithLogging(2022); }
function backfill2023WithLogging() { incrementalBackfillWithLogging(2023); }
function backfill2024WithLogging() { incrementalBackfillWithLogging(2024); }

/**
 * Start fresh: Clear transaction log and run 2021 backfill
 * Use this only when you want to completely reset and start over
 */
function backfill2021WithLoggingFresh() {
  clearTransactionLog();
  incrementalBackfillWithLogging(2021);
}
