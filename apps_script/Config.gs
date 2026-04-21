/**
 * CONFIGURATION
 * Central configuration for all MFL API and league settings
 */

// ============================================================================
// LEAGUE YEAR - Single source of truth for the current season
// ============================================================================

/**
 * Get the current league year from script properties.
 * This is the ONE place that determines the current season year.
 * Update via: Menu → Set League Year, or setLeagueYear(year)
 *
 * @returns {string} The current league year (e.g., "2025")
 */
function getLeagueYear() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("LEAGUE_YEAR")
      || props.getProperty("MFL_CURRENT_YEAR")
      || String(new Date().getFullYear());
}

/**
 * Set the current league year.
 * Updates both LEAGUE_YEAR and MFL_CURRENT_YEAR for backward compatibility.
 *
 * @param {string|number} year - The year to set (e.g., 2026)
 */
function setLeagueYear(year) {
  const yearStr = String(year);
  const props = PropertiesService.getScriptProperties();
  props.setProperty("LEAGUE_YEAR", yearStr);
  props.setProperty("MFL_CURRENT_YEAR", yearStr);
  Logger.log(`League year set to ${yearStr}`);
}

// ============================================================================

function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    // MFL API Settings
    mfl: {
      leagueId: props.getProperty("MFL_LEAGUE_ID") || "12011",
      apiKey: props.getProperty("MFL_API_KEY"),
      currentYear: getLeagueYear()
    },

    // Eligibility Rules
    eligibility: {
      maxYears: 4,
      allowTraditionalRedshirt: true,    // Only for NFL rookies
      allowMedicalRedshirt: true,
      maxCopiesPerConference: 2
    },

    // Sheet Names
    sheets: {
      franchiseLookup: "FranchiseLookup",
      rookieLedger: "RookieLedger",
      playerCopies: "PlayerCopies",
      transactions: "Transactions",
      rosterSnapshot: "RosterSnapshot",
      eligibilityLog: "EligibilityLog",
      awards: "Awards",
      weeklyResults: "WeeklyResults",
      recruitingDollars: "RecruitingDollars",
      theoreticalDraft: "TheoreticalDraft",
      retentionHistory: "RetentionHistory"
    },

    // MFL Roster Slot Types
    rosterSlots: {
      taxi: "TAXI",      // Traditional redshirt eligible
      ir: "Injured",     // Medical redshirt eligible
      active: "ACTIVE"
    },

    // Transaction Types that Matter
    transactionTypes: {
      auctionWon: "AUCTION_WON",
      bbidProcessing: "BBID_PROCESSING",
      activated: "activated",      // Off IR
      deactivated: "deactivated",  // Onto IR
      promoted: "promoted",        // Off Taxi
      demoted: "demoted"          // Onto Taxi
    },

    // Recruiting Dollars Configuration
    recruitingDollars: {
      regularSeasonWinValue: 1,      // $1 per regular season win
      postseasonWinValue: 2,         // $2 per postseason win (Week 13+)
      nationalChampionshipValue: 5,  // $5 per player on NC-winning team
      heismanValue: 5,               // $5 per Heisman winner
      firstTeamAllConfValue: 5,      // $5 per 1st Team All-Conference
      secondTeamAllConfValue: 4,     // $4 per 2nd Team All-Conference
      thirdTeamAllConfValue: 3       // $3 per 3rd Team All-Conference
    },

    // Season Structure Configuration
    season: {
      // Regular season weeks (conference games) - 12 weeks for all years
      // Note: 2021-2023 had 13 regular season weeks, 2024+ has 12
      getRegularSeasonWeeks: function(year) {
        const yearNum = Number(year);
        if (yearNum >= 2021 && yearNum <= 2023) {
          return 13;
        }
        return 12;
      },
      // Conference Championship week (postseason, not a conference game)
      getCCGWeek: function(year) {
        return this.getRegularSeasonWeeks(year) + 1;
      },
      // Last week to include in projections (can include CCG week)
      getProjectionMaxWeek: function(year) {
        return this.getRegularSeasonWeeks(year) + 1; // Regular season + CCG
      },
      regularSeasonWeeks: 12,  // Default for current year (2024+)
      ccgWeek: 13              // Conference Championship week (2024+)
    },

    // Awards Configuration
    awards: {
      // Regular season weeks by year (2021-2023 had 13 weeks, 2024+ has 12)
      getRegularSeasonWeeks: function(year) {
        const yearNum = Number(year);
        if (yearNum >= 2021 && yearNum <= 2023) {
          return 13;
        }
        return 12;
      },
      regularSeasonWeeks: 12,  // Default for current year (2024+)
      positionGroups: {
        QB: ["QB"],
        RB: ["RB"],
        "WR/TE": ["WR", "TE"]  // Combined for awards
      },
      allConferenceTeamSize: {
        QB: 1,
        RB: 3,
        "WR/TE": 4  // May change to flex in future
      },
      allConferenceTeamCount: 3  // 1st, 2nd, 3rd team
    },

    // Early Declaration Configuration
    declarations: {
      // Minimum years of eligibility used before a player can declare early
      // Natural Juniors (3 years used), Redshirt Sophomores (3 years used), Redshirt Juniors (3 years used)
      minYearsForDeclaration: 3,

      // Award requirements for early declaration eligibility
      // Player must meet ONE of these criteria:
      nationalAwardsRequired: 1,      // 1+ national awards (Heisman rank 1 or National_* rank 1)
      allConferenceAwardsRequired: 2, // OR 2+ all-conference selections (any team: 1st/2nd/3rd)

      // Default retention behavior when no decision is made
      defaultDecision: "RETAIN",  // "RETAIN" or "RELEASE"

      // Valid retention decision values
      validDecisions: ["RETAIN", "RELEASE"],

      // Retention costs (paid from recruiting budget)
      // National award path: $20 first time, $30 if retained again
      // All-Conference path: $10 first time, $20 if retained again
      retentionCosts: {
        national: {
          firstRetention: 20,    // $20 to retain a national award winner
          subsequentRetention: 30 // $30 if they win another award after being retained
        },
        allConference: {
          firstRetention: 10,    // $10 to retain based on 2 all-conf awards
          subsequentRetention: 20 // $20 if they win another award after being retained
        }
      },

      // Players that are retained cannot be transferred
      retainedPlayersCannotTransfer: true
    },

    // Theoretical NFL Draft Configuration
    // Graduating/early declaring players give bonus $ based on MFL position rank
    theoreticalDraft: {
      // Position groups for ranking (WR/TE combined)
      positionGroups: {
        QB: ["QB"],
        RB: ["RB"],
        "WR/TE": ["WR", "TE"]
      },

      // Tier thresholds and dollar values based on position rank
      // Uses MFL's position rankings through Week 12 (all NFL players, not just our pool)
      tiers: [
        { minRank: 1, maxRank: 8, value: 5, round: 1, label: "1st Round" },
        { minRank: 9, maxRank: 16, value: 4, round: 2, label: "2nd Round" },
        { minRank: 17, maxRank: 24, value: 3, round: 3, label: "3rd Round" },
        { minRank: 25, maxRank: 32, value: 2, round: 4, label: "4th Round" },
        { minRank: 33, maxRank: 40, value: 1, round: 5, label: "5th Round" },
        { minRank: 41, maxRank: 999, value: 0, round: 0, label: "Undrafted" }
      ],

      // Number of players per position to fetch from MFL
      rankingsCount: 50
    }
  };
}

/**
 * Initialize Script Properties
 * Run this once to set up your API credentials
 */
function initializeScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  props.setProperties({
    'LEAGUE_YEAR': '2025',
    'MFL_LEAGUE_ID': '12011',
    'MFL_API_KEY': 'YOUR_API_KEY_HERE',
    'MFL_CURRENT_YEAR': '2025'
  });

  Logger.log("✅ Script properties initialized (League Year: 2025)");
}
