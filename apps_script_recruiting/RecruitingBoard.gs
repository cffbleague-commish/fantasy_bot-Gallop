/**
 * RECRUITING ANALYTICS - RECRUITING BOARD
 * Generates star ratings for incoming draft class prospects.
 * Combines ESPN grades, NFL draft capital, and position to evaluate players.
 *
 * Scoring handles four scenarios:
 *   1. Full data (ESPN grade + draft pick) - weighted blend
 *   2. Draft pick only (no ESPN grade) - draft capital with penalty
 *   3. ESPN grade only (pre-draft) - grade-driven evaluation
 *   4. ESPN grade only (UDFA post-draft) - capped score
 *   5. No data at all - auto 1-star
 */

// ============================================================================
// DRAFT CAPITAL SCORING
// ============================================================================

/**
 * Calculate Draft Capital Score from overall pick position.
 * Uses exponential decay: top picks are worth exponentially more.
 *
 * Examples with default decay rate (0.019):
 *   Pick 1   → 100.0    Pick 32  → 55.3
 *   Pick 10  → 84.2     Pick 64  → 30.6
 *   Pick 20  → 69.5     Pick 128 → 9.3
 *
 * @param {Number} overallPick - Overall draft pick number (1-based)
 * @param {Number} decayRate - Exponential decay rate (from config)
 * @returns {Number} - Score from 0-100
 */
function calcDraftCapitalScore(overallPick, decayRate) {
  if (!overallPick || overallPick < 1) return 0;
  return 100 * Math.exp(-decayRate * (overallPick - 1));
}

// ============================================================================
// POSITION WEIGHTS
// ============================================================================

/**
 * Get position weight modifier for recruit scoring.
 * Reflects how reliably draft capital translates to fantasy production at each position.
 *
 * WR/RB: Most reliable draft-to-fantasy correlation (baseline 1.0)
 * QB: Slightly less premium in 12-copy format (0.95)
 * TE: Fewer fantasy-relevant producers per draft class (0.90)
 *
 * @param {String} position - Player position
 * @returns {Number} - Weight multiplier (0.85-1.0)
 */
function getPositionWeight(position) {
  const weights = {
    WR: 1.00,
    RB: 1.00,
    QB: 0.95,
    TE: 0.90
  };
  return weights[position] || 0.85;
}

// ============================================================================
// COMPOSITE RECRUIT SCORE
// ============================================================================

/**
 * Calculate the composite Recruit Score for a prospect.
 * Blends draft capital, ESPN grade, and position into a single 0-100 score.
 *
 * Weight allocation (when both data sources available):
 *   55% Draft Capital Score - where the NFL valued them
 *   35% ESPN Grade - pre-draft scouting consensus
 *   10% Position modifier - fantasy position relevance
 *
 * @param {Object} params
 * @param {Number|null} params.draftCapitalScore - From calcDraftCapitalScore()
 * @param {Number|null} params.espnGrade - ESPN prospect grade (0-100)
 * @param {String} params.position - Player position (QB, RB, WR, TE)
 * @param {Boolean} params.isDrafted - Whether the player was selected in the NFL draft
 * @param {Boolean} params.isPreDraft - True if the draft hasn't happened yet for this class
 * @returns {Number} - Composite recruit score (0-100)
 */
function calcRecruitScore({ draftCapitalScore, espnGrade, position, isDrafted, isPreDraft }) {
  const posWeight = getPositionWeight(position);
  const hasDraftCapital = draftCapitalScore !== null && draftCapitalScore > 0;
  const hasGrade = espnGrade !== null && !isNaN(espnGrade);

  // Scenario 1: Both draft capital and ESPN grade (best case, post-draft)
  if (hasDraftCapital && hasGrade) {
    const raw = (draftCapitalScore * 0.55) + (espnGrade * 0.35) + (posWeight * 10);
    return Math.min(raw, 100);
  }

  // Scenario 2: Draft capital only (player drafted but not in ESPN's system)
  // 10% penalty for missing scouting data
  if (hasDraftCapital && !hasGrade) {
    return Math.min(draftCapitalScore * 0.90 * posWeight, 100);
  }

  // Scenario 3: ESPN grade only
  if (!hasDraftCapital && hasGrade) {
    // 3a: Pre-draft - ESPN grade is our best signal, no draft info exists yet
    if (isPreDraft) {
      const raw = (espnGrade * 0.80) + (posWeight * 10);
      return Math.min(raw, 100);
    }

    // 3b: UDFA (post-draft, player wasn't selected)
    // Good scouting grade but going undrafted is a strong negative signal
    // Cap at 2-star threshold so even a 95-grade UDFA maxes at high 2-star
    if (!isDrafted) {
      const raw = espnGrade * 0.30 * posWeight;
      return Math.min(raw, 25);
    }

    // 3c: Drafted but we couldn't parse pick info - treat as mid-round estimate
    const raw = (espnGrade * 0.75) + (posWeight * 10);
    return Math.min(raw, 100);
  }

  // Scenario 4: No ESPN grade, not drafted
  // Complete unknowns - auto 1-star
  return 3;
}

// ============================================================================
// STAR RATING CONVERSION
// ============================================================================

/**
 * Convert a recruit score to a star rating using config thresholds.
 * Threshold-based (not quota-based) - stars are only given when warranted.
 *
 * @param {Number} score - Composite recruit score (0-100)
 * @param {Object} thresholds - Star threshold config from getConfig()
 * @returns {Number} - Star rating (1-5)
 */
function getStarRating(score, thresholds) {
  if (score >= thresholds.fiveStar) return 5;
  if (score >= thresholds.fourStar) return 4;
  if (score >= thresholds.threeStar) return 3;
  if (score >= thresholds.twoStar) return 2;
  return 1;
}

/**
 * Generate a star display string.
 * @param {Number} stars - Star rating (1-5)
 * @returns {String} - Visual representation (e.g., "★★★★☆")
 */
function starDisplay(stars) {
  return "\u2605".repeat(stars) + "\u2606".repeat(5 - stars);
}

// ============================================================================
// STARTUP ADP HELPERS
// ============================================================================

/**
 * Build a lookup map from DLF Rookie Startup ADP data for name-based matching.
 * Reads from the "DLF Rookie Startup ADP" sheet.
 *
 * Sheet columns: Year(0), Rank(1), ADP(2), Pos(3), Player(4), Team(5), Position(6)
 *
 * @returns {Object} - Map keyed by "normalizedName|year" and "normalizedName"
 *                      -> { adp, rank, posRank, position, year }
 */
function buildADPLookupByName() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(config.sheets.dlfRookieStartupADP);

  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  const lookup = {};
  data.slice(1).forEach(row => {
    const year = String(row[0]);
    const rank = row[1] !== "" && row[1] !== null ? Number(row[1]) : null;
    const adp = row[2] !== "" && row[2] !== null ? Number(row[2]) : null;
    const posRank = String(row[3] || "");
    const playerName = String(row[4] || "");
    const position = String(row[6] || "");

    if (!playerName || adp === null || isNaN(adp)) return;

    const normalizedName = normalizeNameForMatch(playerName);
    if (!normalizedName) return;

    const entry = { adp, rank, posRank, position, year };

    // Key by name + year for uniqueness
    const yearKey = `${normalizedName}|${year}`;
    lookup[yearKey] = entry;

    // Also store by name only (most recent wins if duplicates)
    if (!lookup[normalizedName]) {
      lookup[normalizedName] = entry;
    }
  });

  return lookup;
}

/**
 * Get ADP tier label for a given startup ADP value.
 * @param {Number} adp - Startup ADP (1-360+)
 * @param {Array} tiers - Tier config array from getConfig().adpConfig.tiers
 * @returns {String|null} - Tier label or null if no ADP
 */
function getADPTier(adp, tiers) {
  if (!adp || adp < 1) return null;
  for (var i = 0; i < tiers.length; i++) {
    if (adp >= tiers[i].min && adp <= tiers[i].max) return tiers[i].label;
  }
  return null;
}

// ============================================================================
// PRICING MODEL
// ============================================================================

/**
 * Build a pricing model from historical auction data.
 * Uses two approaches for maximum accuracy:
 *   1. Per-pick sliding window (picks 1-32): groups nearby picks for granular pricing
 *   2. Tier-based (Round 2+): broader buckets where sample size matters more
 * Also builds ESPN grade range buckets for pre-draft fallback.
 *
 * @param {Object} config - From getConfig()
 * @returns {Object} - { byPick, byTier, byGrade, gradeAvgByTier, historicalPositionCounts }
 */
function buildPricingModel(config) {
  const ss = SpreadsheetApp.getActive();
  const dataSheet = ss.getSheetByName(config.sheets.auctionData);

  if (!dataSheet) {
    Logger.log("  No AuctionData found - skipping price predictions.");
    return null;
  }

  const data = dataSheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const rows = data.slice(1);
  const excludeYears = config.excludeYears || [];
  const draftRounds = ["1", "2", "3", "4", "5", "6", "7"];

  // Parse all rookie auctions with their overall pick
  const rookieAuctions = [];
  rows.forEach(row => {
    const auctionYear = Number(row[0]) || 0;
    if (excludeYears.includes(auctionYear)) return;
    const draftYear = String(row[5]);
    if (draftYear !== String(auctionYear)) return;
    const position = String(row[3]);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return;

    const draftRound = String(row[6]);
    const draftPick = String(row[7]);
    const overallPick = parseOverallPick(draftPick, draftRound);

    rookieAuctions.push({
      auctionYear, position, draftRound, draftPick, overallPick,
      playerName: String(row[2]),
      bidAmount: Number(row[11]) || 0
    });
  });

  if (rookieAuctions.length === 0) return null;
  Logger.log(`  Pricing model: ${rookieAuctions.length} historical rookie auctions`);

  // --- 1. Per-pick sliding window for Round 1 (picks 1-32) ---
  // Window radius varies by position based on how often they're drafted in Round 1:
  //   WR: ±3  (most frequent Round 1 position, tight window is accurate)
  //   QB: ±4  (fewer per round, need slightly wider reach)
  //   RB: ±6  (1-3 per year in Round 1, spread across the round)
  //   TE: ±8  (rarely in Round 1, need wide window to find enough data)
  const WINDOW_BY_POSITION = { WR: 3, QB: 4, RB: 6, TE: 8 };
  const byPick = {};

  for (let targetPick = 1; targetPick <= 32; targetPick++) {
    ["QB", "RB", "WR", "TE"].forEach(pos => {
      const radius = WINDOW_BY_POSITION[pos] || 5;
      const windowBids = rookieAuctions
        .filter(a => {
          if (a.position !== pos || !a.overallPick) return false;
          // MUST filter to Round 1 only — plain-number draft_pick values from
          // Round 2+ get misinterpreted as low overall picks by parseOverallPick(),
          // which would contaminate top-pick pricing with cheap late-round bids
          return a.draftRound === "1" && Math.abs(a.overallPick - targetPick) <= radius;
        })
        .map(a => a.bidAmount);

      if (windowBids.length >= 3) {
        byPick[`${pos}|${targetPick}`] = computeBucketStats(windowBids);
      }
    });
  }

  // --- 2. Tier-based for Round 2+ and UDFA ---
  const byTier = {};
  rookieAuctions.forEach(a => {
    // Skip Round 1 picks from tier buckets (they use per-pick above)
    if (a.draftRound === "1") return;

    const tier = getDraftPickTier(a.overallPick, a.draftRound);
    const tierLabel = tier || (draftRounds.includes(a.draftRound) ? null : "UDFA");
    if (!tierLabel) return;

    const key = `${a.position}|${tierLabel}`;
    if (!byTier[key]) byTier[key] = [];
    byTier[key].push(a.bidAmount);
  });

  // Also add UDFA auctions
  rookieAuctions.forEach(a => {
    if (draftRounds.includes(a.draftRound)) return;
    const key = `${a.position}|UDFA`;
    if (!byTier[key]) byTier[key] = [];
    byTier[key].push(a.bidAmount);
  });

  const byTierStats = {};
  Object.keys(byTier).forEach(key => {
    if (byTier[key].length >= 3) {
      byTierStats[key] = computeBucketStats(byTier[key]);
    }
  });

  // --- 3. ESPN grade range buckets (pre-draft fallback) ---
  const byGrade = {};
  const espnLookup = buildESPNLookupByName();

  // Also track average ESPN grade per position × tier for grade adjustment
  const gradesByTier = {};

  rows.forEach(row => {
    const auctionYear = Number(row[0]) || 0;
    if (excludeYears.includes(auctionYear)) return;
    const draftYear = String(row[5]);
    if (draftYear !== String(auctionYear)) return;
    const position = String(row[3]);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return;
    const playerName = String(row[2]);
    const bidAmount = Number(row[11]) || 0;
    const draftRound = String(row[6]);
    const draftPick = String(row[7]);

    const normalizedName = normalizeNameForMatch(playerName);
    const yearKey = `${normalizedName}|${auctionYear}`;
    const espn = espnLookup[yearKey] || espnLookup[normalizedName];

    if (espn && espn.grade !== null) {
      // Grade range bucket
      const gradeRange = getESPNGradeRange(espn.grade);
      const gradeKey = `${position}|${gradeRange}`;
      if (!byGrade[gradeKey]) byGrade[gradeKey] = [];
      byGrade[gradeKey].push(bidAmount);

      // Track grades per tier for grade adjustment calculation
      const overallPick = parseOverallPick(draftPick, draftRound);
      const tier = getDraftPickTier(overallPick, draftRound);
      if (tier) {
        const tierKey = `${position}|${tier}`;
        if (!gradesByTier[tierKey]) gradesByTier[tierKey] = [];
        gradesByTier[tierKey].push({ grade: espn.grade, bid: bidAmount });
      }
    }
  });

  const byGradeStats = {};
  Object.keys(byGrade).forEach(key => {
    if (byGrade[key].length >= 3) {
      byGradeStats[key] = computeBucketStats(byGrade[key]);
    }
  });

  // Compute average grade per tier (for grade adjustment)
  const gradeAvgByTier = {};
  Object.keys(gradesByTier).forEach(key => {
    const grades = gradesByTier[key].map(g => g.grade);
    gradeAvgByTier[key] = grades.reduce((s, v) => s + v, 0) / grades.length;
  });

  // --- 4. ADP-based tier buckets ---
  // Cross-reference historical rookie auctions with startup ADP data
  // to build pricing buckets by position × ADP tier
  const adpLookup = buildADPLookupByName();
  const adpConfig = config.adpConfig || {};
  const adpTiers = adpConfig.tiers || [];
  const byADPRaw = {};
  const adpByDraftTier = {}; // Track ADP values per draft-capital tier for adjustment calc

  rookieAuctions.forEach(a => {
    const normalizedName = normalizeNameForMatch(a.playerName);
    if (!normalizedName) return;

    // Look up this player's ADP for their auction year
    const yearKey = `${normalizedName}|${a.auctionYear}`;
    const adpEntry = adpLookup[yearKey] || adpLookup[normalizedName];

    if (!adpEntry || !adpEntry.adp) return;

    // Bucket by position + ADP tier
    const adpTierLabel = getADPTier(adpEntry.adp, adpTiers);
    if (adpTierLabel) {
      const key = `${a.position}|${adpTierLabel}`;
      if (!byADPRaw[key]) byADPRaw[key] = [];
      byADPRaw[key].push(a.bidAmount);
    }

    // Track ADP per draft-capital tier for the ADP adjustment multiplier
    const draftTier = getDraftPickTier(a.overallPick, a.draftRound);
    if (draftTier) {
      const tierKey = `${a.position}|${draftTier}`;
      if (!adpByDraftTier[tierKey]) adpByDraftTier[tierKey] = [];
      adpByDraftTier[tierKey].push(adpEntry.adp);
    }
  });

  const byADP = {};
  Object.keys(byADPRaw).forEach(key => {
    if (byADPRaw[key].length >= (adpConfig.minSampleSize || 3)) {
      byADP[key] = computeBucketStats(byADPRaw[key]);
    }
  });

  // Compute average ADP per draft-capital tier (for ADP adjustment)
  const adpAvgByTier = {};
  Object.keys(adpByDraftTier).forEach(key => {
    const adps = adpByDraftTier[key];
    adpAvgByTier[key] = adps.reduce((s, v) => s + v, 0) / adps.length;
  });

  Logger.log(`  ADP lookup entries: ${Object.keys(adpLookup).length}`);
  Logger.log(`  ADP tier buckets: ${Object.keys(byADP).length}, ADP-tracked draft tiers: ${Object.keys(adpAvgByTier).length}`);

  // --- 5. Historical position counts per year (for scarcity) ---
  const positionsByYear = {};
  rookieAuctions.forEach(a => {
    const yk = `${a.auctionYear}|${a.position}`;
    if (!positionsByYear[yk]) positionsByYear[yk] = new Set();
    positionsByYear[yk].add(`${a.draftRound}|${a.draftPick}`);
  });

  const years = [...new Set(rookieAuctions.map(a => a.auctionYear))];
  const historicalPositionCounts = {};
  ["QB", "RB", "WR", "TE"].forEach(pos => {
    const yearCounts = years.map(y => {
      const key = `${y}|${pos}`;
      return positionsByYear[key] ? positionsByYear[key].size : 0;
    }).filter(c => c > 0);
    historicalPositionCounts[pos] = yearCounts.length > 0
      ? yearCounts.reduce((s, v) => s + v, 0) / yearCounts.length
      : 0;
  });

  Logger.log(`  Historical avg per year: QB=${historicalPositionCounts.QB.toFixed(1)}, RB=${historicalPositionCounts.RB.toFixed(1)}, WR=${historicalPositionCounts.WR.toFixed(1)}, TE=${historicalPositionCounts.TE.toFixed(1)}`);
  Logger.log(`  Per-pick buckets (Rd 1): ${Object.keys(byPick).length}, Tier buckets (Rd 2+): ${Object.keys(byTierStats).length}`);

  // Log sample per-pick stats for top picks to verify pricing
  [1, 4, 6, 10].forEach(pick => {
    const wrKey = `WR|${pick}`;
    if (byPick[wrKey]) {
      const s = byPick[wrKey];
      Logger.log(`    WR pick ${pick}: median=$${s.median}, range=$${s.p25}-$${s.p75}, n=${s.count}, ${s.skew}`);
    }
  });

  return {
    byPick,
    byTier: byTierStats,
    byGrade: byGradeStats,
    byADP,
    gradeAvgByTier,
    adpAvgByTier,
    historicalPositionCounts
  };
}

/**
 * Compute stats for a bucket of bid amounts.
 * @param {Number[]} bids - Array of bid amounts
 * @returns {Object} - { median, p25, p75, mean, count, skew }
 */
function computeBucketStats(bids) {
  const sorted = [...bids].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const med = n % 2 !== 0 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p25 = sorted[Math.floor(n * 0.25)];
  const p75 = sorted[Math.min(Math.floor(n * 0.75), n - 1)];

  let skew = "Even";
  if (med > 0) {
    const ratio = mean / med;
    if (ratio > 1.10) skew = "Skews High";
    else if (ratio < 0.90) skew = "Skews Low";
  }

  return { median: med, p25, p75, mean, count: n, skew };
}

/**
 * Get ESPN grade range label for pricing lookup.
 * @param {Number} grade - ESPN grade (0-100)
 * @returns {String} - Range label (e.g., "90+", "80-89")
 */
function getESPNGradeRange(grade) {
  if (grade >= 90) return "90+";
  if (grade >= 80) return "80-89";
  if (grade >= 70) return "70-79";
  if (grade >= 60) return "60-69";
  return "Below 60";
}

/**
 * Calculate confidence score for a price prediction.
 * Combines sample size, price spread tightness, and data source quality
 * into a single 0-100 score with a human-readable label.
 *
 * @param {Object} bucket - Bucket stats from computeBucketStats()
 * @param {String} sourceType - "perPick", "tier", "udfa", or "grade"
 * @param {Boolean} hasADP - Whether ADP data contributed to the prediction
 * @returns {Object} - { score: Number, label: String }
 */
function calcConfidence(bucket, sourceType, hasADP) {
  // 1. Sample size (40%) — log scale, diminishing returns past ~30
  var sampleScore = Math.min(100, 30 * Math.log(bucket.count));

  // 2. Spread tightness (35%) — IQR relative to median
  var spreadScore = 50; // default when median is 0 or undefined
  if (bucket.median > 0) {
    var spreadRatio = (bucket.p75 - bucket.p25) / bucket.median;
    spreadScore = Math.max(0, 100 * (1 - spreadRatio));
  }

  // 3. Data source quality (25%)
  var sourceScores = { perPick: 100, tier: 80, udfa: 60, grade: 40 };
  var sourceScore = sourceScores[sourceType] || 40;

  // 4. ADP bonus — additional signal from startup ADP data (+5 points)
  var adpBonus = hasADP ? 5 : 0;

  var score = Math.round(
    (sampleScore * 0.40) + (spreadScore * 0.35) + (sourceScore * 0.25) + adpBonus
  );
  score = Math.max(0, Math.min(100, score));

  var label = "Very Low";
  if (score >= 75) label = "High";
  else if (score >= 50) label = "Medium";
  else if (score >= 25) label = "Low";

  return { score: score, label: label };
}

/**
 * Calculate positional scarcity factor for a given draft class.
 * Compares current year's prospect count to historical average.
 *
 * @param {String} position - Player position
 * @param {Object} currentYearCounts - { QB: n, RB: n, WR: n, TE: n } for this draft class
 * @param {Object} historicalAvgCounts - Historical average from pricing model
 * @returns {Number} - Scarcity multiplier (clamped 0.75-1.35)
 */
function calcScarcityFactor(position, currentYearCounts, historicalAvgCounts) {
  const current = currentYearCounts[position] || 0;
  const historical = historicalAvgCounts[position] || 0;

  if (current === 0 || historical === 0) return 1.0;

  // Fewer than average → factor > 1 → prices go up
  // More than average → factor < 1 → prices go down
  const factor = historical / current;
  return Math.max(0.75, Math.min(1.35, factor));
}

/**
 * Predict auction price for a prospect using the pricing model.
 *
 * Lookup priority:
 *   1. Per-pick sliding window (Round 1, picks 1-32) — most granular
 *   2. Tier-based (Round 2+, UDFA) — broader buckets
 *   3. ESPN grade range (pre-draft fallback)
 *
 * After finding the base price, applies:
 *   - ADP blending: blends draft-capital pricing with ADP-tier pricing
 *   - ESPN grade adjustment: scale price based on grade vs tier average
 *   - ADP adjustment: scale price based on ADP vs tier average
 *   - Scarcity factor: fewer prospects at this position = higher prices
 *
 * Missing ADP (post-draft) is treated as worst-case (defaultADP from config),
 * reflecting that the fantasy market doesn't value the player.
 *
 * @param {Object} player - Board player object (must include startupADP)
 * @param {Object} pricingModel - From buildPricingModel()
 * @param {Object} currentYearCounts - Position counts for this draft class
 * @param {Boolean} isPreDraft - Whether the draft has occurred
 * @returns {Object|null} - { predicted, p25, p75, skew, count, confidence } or null
 */
function predictPrice(player, pricingModel, currentYearCounts, isPreDraft) {
  if (!pricingModel) return null;

  const pos = player.position;
  const config = getConfig();
  const adpConfig = config.adpConfig || {};
  const adpTiers = adpConfig.tiers || [];

  let bucket = null;
  let tierKey = null; // For grade/ADP adjustment lookup
  let sourceType = null; // For confidence calculation

  // 1. Post-draft Round 1: per-pick sliding window (most granular)
  if (!isPreDraft && player.draftRound === "1" && player.overallPick && player.overallPick <= 32) {
    bucket = pricingModel.byPick[`${pos}|${player.overallPick}`];
    tierKey = `${pos}|${getDraftPickTier(player.overallPick, player.draftRound) || ""}`;
    if (bucket) sourceType = "perPick";
  }

  // 2. Post-draft Round 2+: tier-based
  if (!bucket && !isPreDraft && player.overallPick && player.overallPick > 32) {
    const tier = getDraftPickTier(player.overallPick, player.draftRound);
    if (tier) {
      bucket = pricingModel.byTier[`${pos}|${tier}`];
      tierKey = `${pos}|${tier}`;
      if (bucket) sourceType = "tier";
    }
  }

  // 3. Post-draft UDFA
  if (!bucket && !isPreDraft && !player.overallPick && player.dataSource && player.dataSource.includes("UDFA")) {
    bucket = pricingModel.byTier[`${pos}|UDFA`];
    tierKey = `${pos}|UDFA`;
    if (bucket) sourceType = "udfa";
  }

  // 4. Pre-draft or no match: fall back to ESPN grade range
  if (!bucket && player.espnGrade !== null) {
    const gradeRange = getESPNGradeRange(player.espnGrade);
    bucket = pricingModel.byGrade[`${pos}|${gradeRange}`];
    // No grade adjustment needed here - already bucketed by grade
    tierKey = null;
    if (bucket) sourceType = "grade";
  }

  if (!bucket || bucket.count < 3) return null;

  // --- ADP blending ---
  // Blend draft-capital-based pricing with ADP-tier pricing when available.
  // Post-draft: use player's actual ADP, or defaultADP if not in ADP data.
  // Pre-draft: skip ADP entirely (startup drafts haven't happened yet).
  let baseMedian = bucket.median;
  let baseP25 = bucket.p25;
  let baseP75 = bucket.p75;
  let hasADP = false;

  if (!isPreDraft && pricingModel.byADP) {
    const effectiveADP = player.startupADP || adpConfig.defaultADP || 360;
    const adpTierLabel = getADPTier(effectiveADP, adpTiers);

    if (adpTierLabel) {
      const adpBucket = pricingModel.byADP[`${pos}|${adpTierLabel}`];

      if (adpBucket && adpBucket.count >= (adpConfig.minSampleSize || 3) && sourceType !== "grade") {
        // Blend weights: Round 1 per-pick data is already granular, so ADP gets less weight
        const blendWeights = adpConfig.blendWeights || { round1: 0.30, round2Plus: 0.50 };
        const adpWeight = (sourceType === "perPick") ? blendWeights.round1 : blendWeights.round2Plus;
        const draftWeight = 1.0 - adpWeight;

        baseMedian = (bucket.median * draftWeight) + (adpBucket.median * adpWeight);
        baseP25 = (bucket.p25 * draftWeight) + (adpBucket.p25 * adpWeight);
        baseP75 = (bucket.p75 * draftWeight) + (adpBucket.p75 * adpWeight);
        hasADP = true;
      }
    }
  }

  // --- ESPN grade adjustment ---
  // If the player's grade is above/below the historical average for this tier,
  // scale prices proportionally. A 96-grade pick at #1 should price higher
  // than an 85-grade pick at #1.
  let gradeMultiplier = 1.0;
  if (tierKey && player.espnGrade !== null && pricingModel.gradeAvgByTier[tierKey]) {
    const avgGrade = pricingModel.gradeAvgByTier[tierKey];
    if (avgGrade > 0) {
      // Each grade point above/below average adjusts price by ~1.5%
      // e.g., grade 96 vs avg 88 = +8 points = +12% price
      const gradeDiff = player.espnGrade - avgGrade;
      gradeMultiplier = 1.0 + (gradeDiff * 0.015);
      gradeMultiplier = Math.max(0.70, Math.min(1.50, gradeMultiplier));
    }
  }

  // --- ADP adjustment multiplier ---
  // If a player's startup ADP is better/worse than the average ADP for their
  // draft-capital tier, adjust price proportionally. Lower ADP = better value.
  // Post-draft only. Missing ADP uses defaultADP (worst-case).
  let adpMultiplier = 1.0;
  if (!isPreDraft && tierKey && pricingModel.adpAvgByTier && pricingModel.adpAvgByTier[tierKey]) {
    const effectiveADP = player.startupADP || adpConfig.defaultADP || 360;
    const avgADP = pricingModel.adpAvgByTier[tierKey];
    if (avgADP > 0) {
      // Lower ADP = better → positive adjustment
      // (avgADP - playerADP) is positive when player is better than tier avg
      const sensitivity = adpConfig.adjustmentSensitivity || 0.30;
      adpMultiplier = 1.0 + ((avgADP - effectiveADP) / avgADP) * sensitivity;
      adpMultiplier = Math.max(0.70, Math.min(1.50, adpMultiplier));
    }
  }

  // --- Scarcity adjustment ---
  const scarcity = calcScarcityFactor(pos, currentYearCounts, pricingModel.historicalPositionCounts);

  const totalMultiplier = gradeMultiplier * adpMultiplier * scarcity;
  const predicted = Math.round(baseMedian * totalMultiplier);
  const p25 = Math.round(baseP25 * totalMultiplier);
  const p75 = Math.round(baseP75 * totalMultiplier);

  return {
    predicted: predicted,
    p25: p25,
    p75: p75,
    skew: bucket.skew,
    count: bucket.count,
    confidence: calcConfidence(bucket, sourceType, hasADP)
  };
}

// ============================================================================
// BOARD GENERATION
// ============================================================================

/**
 * Generate the Recruiting Board for the current league year.
 */
function generateRecruitingBoard() {
  const year = getLeagueYear();
  generateRecruitingBoardForYear(year);
}

/**
 * Generate the Recruiting Board for a specific draft year.
 * Merges ESPN prospect data with MFL roster data, calculates recruit scores
 * and star ratings, and writes results to the RecruitingBoard tab.
 *
 * Works in two modes:
 *   Pre-draft:  ESPN grades drive ratings (no draft capital available)
 *   Post-draft: Full blend of draft capital + ESPN grade + position
 *
 * @param {String|Number} year - Draft year to generate board for
 */
function generateRecruitingBoardForYear(year) {
  const config = getConfig();
  const ss = SpreadsheetApp.getActive();
  const yearStr = String(year);

  Logger.log(`=== GENERATING RECRUITING BOARD (${yearStr}) ===\n`);

  // --- 1. Load ESPN prospect data for this year ---
  const espnProspects = [];
  const espnSheet = ss.getSheetByName(config.sheets.espnProspects);

  if (espnSheet) {
    const espnData = espnSheet.getDataRange().getValues();
    espnData.slice(1).forEach(row => {
      if (String(row[0]) !== yearStr) return;
      espnProspects.push({
        espnId: String(row[1]),
        name: String(row[2]),
        position: String(row[3]),
        college: String(row[4]),
        grade: row[5] !== "" && row[5] !== null ? Number(row[5]) : null,
        overallRank: row[6] !== "" && row[6] !== null ? Number(row[6]) : null,
        positionRank: row[7] !== "" && row[7] !== null ? Number(row[7]) : null,
        headshotUrl: String(row[8] || ""),
        profileUrl: String(row[9] || ""),
        draftRound: String(row[10] || ""),
        draftPick: String(row[11] || ""),
        height: String(row[12] || ""),
        weight: String(row[13] || "")
      });
    });
  }

  Logger.log(`  ESPN prospects for ${yearStr}: ${espnProspects.length}`);

  // Detect pre-draft vs post-draft:
  // If ANY ESPN prospect for this year has a draft round, the draft has happened
  const draftHasOccurred = espnProspects.some(p => p.draftRound !== "" && p.draftRound !== "0");
  Logger.log(`  Draft status: ${draftHasOccurred ? "Post-draft (picks found)" : "Pre-draft (no picks yet)"}`);

  // --- 2. Load MFL rookies (for players not in ESPN) ---
  let mflRookies = [];
  try {
    mflRookies = fetchRookiesByDraftYear(yearStr);
    Logger.log(`  MFL rookies for ${yearStr}: ${mflRookies.length}`);
  } catch (e) {
    Logger.log(`  Warning: Could not fetch MFL rookies: ${e.message}`);
  }

  // --- Build pricing model from historical auction data ---
  const pricingModel = buildPricingModel(config);

  // --- Build ADP lookup for this year's prospects ---
  const adpLookup = buildADPLookupByName();
  const adpTiers = (config.adpConfig || {}).tiers || [];
  Logger.log(`  ADP lookup entries: ${Object.keys(adpLookup).length}`);

  // Count prospects at each position in this draft class (for scarcity)
  const currentYearCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  espnProspects.forEach(p => {
    if (currentYearCounts.hasOwnProperty(p.position)) currentYearCounts[p.position]++;
  });
  mflRookies.forEach(mfl => {
    const pos = mfl.position || "";
    const normalizedName = normalizeNameForMatch(mfl.name || "");
    // Only count MFL players not already in ESPN to avoid double-counting
    if (currentYearCounts.hasOwnProperty(pos) && !espnProspects.some(e => normalizeNameForMatch(e.name) === normalizedName)) {
      currentYearCounts[pos]++;
    }
  });

  if (pricingModel) {
    Logger.log(`  Current class size: QB=${currentYearCounts.QB}, RB=${currentYearCounts.RB}, WR=${currentYearCounts.WR}, TE=${currentYearCounts.TE}`);
    ["QB", "RB", "WR", "TE"].forEach(pos => {
      const factor = calcScarcityFactor(pos, currentYearCounts, pricingModel.historicalPositionCounts);
      if (factor !== 1.0) Logger.log(`    ${pos} scarcity factor: ${factor.toFixed(2)}`);
    });
  }

  // --- 3. Merge data sources and score each player ---
  const boardPlayers = [];
  const processedNames = new Set();
  const processedDraftPicks = new Set(); // "round|pick" to catch name variants (e.g., Ken vs Kenneth)

  // Process ESPN prospects first (most complete data)
  espnProspects.forEach(espn => {
    const normalizedName = normalizeNameForMatch(espn.name);
    processedNames.add(normalizedName);

    // ESPN stores pick-within-round (not overall pick) from URL: /rounds/{R}/picks/{P}
    // Convert to overall pick: (round - 1) * 32 + pickInRound
    // Don't use parseOverallPick() here — that's designed for MFL's "1.05" format
    const round = Number(espn.draftRound);
    const pickInRound = Number(espn.draftPick);
    const overallPick = (!isNaN(round) && round > 0 && !isNaN(pickInRound) && pickInRound > 0)
      ? (round - 1) * 32 + pickInRound
      : null;

    // Track draft slot to catch name variants (Ken vs Kenneth, etc.)
    if (espn.draftRound && espn.draftPick) {
      processedDraftPicks.add(`${espn.draftRound}|${espn.draftPick}`);
    }
    const isDrafted = espn.draftRound !== "" && espn.draftRound !== "0";
    const draftCapital = calcDraftCapitalScore(overallPick, config.draftCapitalDecayRate);

    const recruitScore = calcRecruitScore({
      draftCapitalScore: draftCapital > 0 ? draftCapital : null,
      espnGrade: espn.grade,
      position: espn.position,
      isDrafted: isDrafted,
      isPreDraft: !draftHasOccurred
    });

    const stars = getStarRating(recruitScore, config.starThresholds);

    // Determine data source label
    let dataSource = "ESPN (No Grade)";
    if (espn.grade !== null && isDrafted) dataSource = "ESPN + Draft";
    else if (espn.grade !== null && !draftHasOccurred) dataSource = "ESPN (Pre-Draft)";
    else if (espn.grade !== null && !isDrafted) dataSource = "ESPN (UDFA)";
    else if (isDrafted) dataSource = "Draft Only";

    // Look up startup ADP for this player
    const adpYearKey = `${normalizedName}|${yearStr}`;
    const adpEntry = adpLookup[adpYearKey] || adpLookup[normalizedName];

    const playerObj = {
      name: espn.name,
      position: espn.position,
      college: espn.college,
      espnGrade: espn.grade,
      espnOverallRank: espn.overallRank,
      espnPositionRank: espn.positionRank,
      draftRound: espn.draftRound || "",
      draftPick: espn.draftPick || "",
      overallPick: overallPick,
      draftCapitalScore: draftCapital,
      startupADP: adpEntry ? adpEntry.adp : null,
      adpTier: adpEntry ? getADPTier(adpEntry.adp, adpTiers) : null,
      recruitScore: recruitScore,
      stars: stars,
      headshotUrl: espn.headshotUrl,
      dataSource: dataSource
    };
    playerObj.pricing = predictPrice(playerObj, pricingModel, currentYearCounts, !draftHasOccurred);
    boardPlayers.push(playerObj);
  });

  // Add MFL-only players (drafted but not in ESPN system)
  mflRookies.forEach(mfl => {
    const mflName = mfl.name || "";
    const normalizedName = normalizeNameForMatch(mflName);

    if (processedNames.has(normalizedName)) return;

    // Also skip if same draft slot already processed (catches name variants like Ken/Kenneth)
    if (mfl.draft_round && mfl.draft_pick) {
      const draftKey = `${mfl.draft_round}|${mfl.draft_pick}`;
      if (processedDraftPicks.has(draftKey)) return;
      processedDraftPicks.add(draftKey);
    }

    processedNames.add(normalizedName);

    const overallPick = parseOverallPick(mfl.draft_pick, mfl.draft_round);
    const isDrafted = mfl.draft_round && mfl.draft_round !== "0";
    const draftCapital = calcDraftCapitalScore(overallPick, config.draftCapitalDecayRate);

    const recruitScore = calcRecruitScore({
      draftCapitalScore: draftCapital > 0 ? draftCapital : null,
      espnGrade: null,
      position: mfl.position,
      isDrafted: isDrafted !== false,
      isPreDraft: false
    });

    const stars = getStarRating(recruitScore, config.starThresholds);

    // Convert MFL "Last, First" format to "First Last"
    let displayName = mflName;
    if (mflName.includes(",")) {
      const parts = mflName.split(",").map(s => s.trim());
      if (parts.length >= 2) displayName = `${parts[1]} ${parts[0]}`;
    }

    // Look up startup ADP for this player
    const adpYearKey = `${normalizedName}|${yearStr}`;
    const adpEntry = adpLookup[adpYearKey] || adpLookup[normalizedName];

    const mflPlayerObj = {
      name: displayName,
      position: mfl.position || "",
      college: "",
      espnGrade: null,
      espnOverallRank: null,
      espnPositionRank: null,
      draftRound: mfl.draft_round || "",
      draftPick: mfl.draft_pick || "",
      overallPick: overallPick,
      draftCapitalScore: draftCapital,
      startupADP: adpEntry ? adpEntry.adp : null,
      adpTier: adpEntry ? getADPTier(adpEntry.adp, adpTiers) : null,
      recruitScore: recruitScore,
      stars: stars,
      headshotUrl: "",
      dataSource: isDrafted ? "MFL Only" : "MFL (UDFA)"
    };
    mflPlayerObj.pricing = predictPrice(mflPlayerObj, pricingModel, currentYearCounts, false);
    boardPlayers.push(mflPlayerObj);
  });

  // Sort by recruit score descending
  boardPlayers.sort((a, b) => b.recruitScore - a.recruitScore);

  Logger.log(`\n  Total board players: ${boardPlayers.length}`);

  // Log star distribution
  for (let s = 5; s >= 1; s--) {
    const count = boardPlayers.filter(p => p.stars === s).length;
    Logger.log(`    ${s}-Star: ${count} players`);
  }

  // --- 4. Write to RecruitingBoard sheet ---
  let sheet = ss.getSheetByName(config.sheets.recruitingBoard);
  const isNewSheet = !sheet;
  if (isNewSheet) {
    sheet = ss.insertSheet(config.sheets.recruitingBoard);
  }

  const headers = [
    "DraftYear", "Stars", "Rating", "Player", "Position", "College",
    "ESPN Grade", "ESPN Rank", "Pos Rank",
    "Draft Rd", "Draft Pick", "Draft Capital",
    "Startup ADP", "ADP Tier",
    "Recruit Score",
    "Predicted Cost", "Price Range", "Skew", "Sample (n)", "Confidence",
    "Data Source", "HeadshotURL"
  ];

  if (isNewSheet) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Remove existing rows for this year to allow clean re-generation
    const existingData = sheet.getDataRange().getValues();
    for (let i = existingData.length - 1; i >= 1; i--) {
      if (String(existingData[i][0]) === yearStr) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  const rows = boardPlayers.map(p => {
    const pr = p.pricing;
    return [
      Number(yearStr),
      starDisplay(p.stars),
      p.stars,
      p.name,
      p.position,
      p.college,
      p.espnGrade !== null ? p.espnGrade : "",
      p.espnOverallRank !== null ? p.espnOverallRank : "",
      p.espnPositionRank !== null ? p.espnPositionRank : "",
      p.draftRound || "",
      p.overallPick || "",
      p.draftCapitalScore > 0 ? p.draftCapitalScore.toFixed(1) : "",
      p.startupADP || "",
      p.adpTier || "",
      p.recruitScore.toFixed(1),
      pr ? `$${pr.predicted}` : "",
      pr ? `$${pr.p25}-$${pr.p75}` : "",
      pr ? pr.skew : "",
      pr ? pr.count : "",
      pr && pr.confidence ? `${pr.confidence.label} (${pr.confidence.score})` : "",
      p.dataSource,
      p.headshotUrl
    ];
  });

  if (rows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  }

  // Column widths (only set on new sheet to avoid resetting user adjustments)
  if (isNewSheet) {
    sheet.setColumnWidth(1, 75);    // DraftYear
    sheet.setColumnWidth(2, 90);    // Stars display
    sheet.setColumnWidth(3, 50);    // Rating number
    sheet.setColumnWidth(4, 180);   // Player
    sheet.setColumnWidth(5, 55);    // Position
    sheet.setColumnWidth(6, 130);   // College
    sheet.setColumnWidth(7, 75);    // ESPN Grade
    sheet.setColumnWidth(8, 75);    // ESPN Rank
    sheet.setColumnWidth(9, 65);    // Pos Rank
    sheet.setColumnWidth(10, 60);   // Draft Rd
    sheet.setColumnWidth(11, 70);   // Draft Pick
    sheet.setColumnWidth(12, 85);   // Draft Capital
    sheet.setColumnWidth(13, 80);   // Startup ADP
    sheet.setColumnWidth(14, 120);  // ADP Tier
    sheet.setColumnWidth(15, 90);   // Recruit Score
    sheet.setColumnWidth(16, 95);   // Predicted Cost
    sheet.setColumnWidth(17, 110);  // Price Range
    sheet.setColumnWidth(18, 80);   // Skew
    sheet.setColumnWidth(19, 70);   // Sample (n)
    sheet.setColumnWidth(20, 110);  // Confidence
    sheet.setColumnWidth(21, 110);  // Data Source
    sheet.setColumnWidth(22, 80);   // Headshot URL
  }

  Logger.log(`\n  Wrote ${rows.length} prospects to ${config.sheets.recruitingBoard}`);
  Logger.log("=== RECRUITING BOARD COMPLETE ===");
}

/**
 * Prompt to generate the recruiting board for a specific year.
 */
function promptGenerateRecruitingBoard() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getLeagueYear();

  const response = ui.prompt(
    "Generate Recruiting Board",
    `Enter the draft year to generate the recruiting board for.\n\nCurrent league year: ${currentYear}\n\nNote: Import ESPN prospects first for best results.\nMFL data fills in any players not in ESPN's system.`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const yearInput = response.getResponseText().trim();
  if (!/^\d{4}$/.test(yearInput)) {
    ui.alert("Invalid year. Please enter a 4-digit year (e.g., 2025).");
    return;
  }

  generateRecruitingBoardForYear(yearInput);
  ui.alert(`Recruiting Board for ${yearInput} generated. Check the RecruitingBoard tab.`);
}
