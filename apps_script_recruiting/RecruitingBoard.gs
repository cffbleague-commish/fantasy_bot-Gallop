/**
 * RECRUITING ANALYTICS - RECRUITING BOARD
 * Generates star ratings and price predictions for incoming draft class prospects.
 *
 * RECRUIT SCORING (0-100):
 *   Post-draft: 50% ADP + 25% Draft Capital + 15% ESPN Grade + 10% Position
 *   Pre-draft:  80% ESPN Grade + 10% Position (ADP unavailable)
 *   Missing data gets floor scores (defaultDraftPick, defaultESPNGrade, defaultADP)
 *
 * PRICE PREDICTION (two independent prices):
 *   Predicted Cost: ADP regression (continuous curve, no tier jumps) with grade adjustment
 *     - Fallback: draft-capital buckets when ADP regression unavailable
 *   Scarcity Price: Budget allocation model (conference budget ÷ class size × player quality)
 *     - Models how a fixed conference auction budget distributes across the draft class
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

/**
 * Calculate ADP Score from startup draft ADP position.
 * Uses exponential decay like draft capital, but with a gentler curve
 * because ADP ranges 1-360 (wider than NFL draft's 1-262).
 *
 * Examples with default decay rate (0.012):
 *   ADP 1   → 100.0    ADP 60  → 49.3
 *   ADP 12  → 87.7     ADP 120 → 24.0
 *   ADP 24  → 75.9     ADP 257 → 4.6   (default for missing ADP)
 *
 * @param {Number} adp - Startup ADP position (1-based, lower = better)
 * @param {Number} decayRate - Exponential decay rate (from config)
 * @returns {Number} - Score from 0-100
 */
function calcADPScore(adp, decayRate) {
  if (!adp || adp < 1) return 0;
  return 100 * Math.exp(-decayRate * (adp - 1));
}

// ============================================================================
// LINEAR REGRESSION
// ============================================================================

/**
 * Fit a simple linear regression: y = intercept + slope * x
 * Used to model continuous ADP → auction price relationships per position.
 *
 * @param {Array<{x: Number, y: Number}>} points - Data points
 * @returns {Object|null} - { slope, intercept, r2, se, n, xMean, xVar } or null if insufficient data
 */
function fitLinearRegression(points) {
  var n = points.length;
  if (n < 5) return null;

  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
    sumXY += points[i].x * points[i].y;
    sumX2 += points[i].x * points[i].x;
    sumY2 += points[i].y * points[i].y;
  }

  var denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  var slope = (n * sumXY - sumX * sumY) / denom;
  var intercept = (sumY - slope * sumX) / n;

  // R-squared (coefficient of determination)
  var yMean = sumY / n;
  var ssTot = sumY2 - n * yMean * yMean;
  var ssRes = 0;
  for (var j = 0; j < n; j++) {
    var residual = points[j].y - (intercept + slope * points[j].x);
    ssRes += residual * residual;
  }
  var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Standard error of estimate (for prediction intervals)
  var se = Math.sqrt(ssRes / Math.max(1, n - 2));

  // Store x stats for prediction interval width calculation
  var xMean = sumX / n;
  var xVar = sumX2 / n - xMean * xMean;

  return { slope: slope, intercept: intercept, r2: r2, se: se, n: n, xMean: xMean, xVar: xVar };
}

/**
 * Get prediction interval bounds for a regression at a given x value.
 * Returns the approximate 25th and 75th percentile bounds.
 *
 * @param {Object} reg - Regression result from fitLinearRegression()
 * @param {Number} x - The x value to predict at
 * @returns {Object} - { predicted, p25, p75 }
 */
function getRegressionPrediction(reg, x) {
  var predicted = reg.intercept + reg.slope * x;

  // Prediction interval widens for x values far from the mean
  // SE_pred = SE * sqrt(1 + 1/n + (x - xMean)^2 / (n * xVar))
  var xDeviation = (reg.xVar > 0) ? (x - reg.xMean) * (x - reg.xMean) / (reg.n * reg.xVar) : 0;
  var sePred = reg.se * Math.sqrt(1 + 1 / reg.n + xDeviation);

  // z ≈ 0.675 for 25th/75th percentile of normal distribution
  var p25 = predicted - 0.675 * sePred;
  var p75 = predicted + 0.675 * sePred;

  return {
    predicted: Math.max(1, Math.round(predicted)),
    p25: Math.max(1, Math.round(p25)),
    p75: Math.max(1, Math.round(p75))
  };
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
 * Blends startup ADP, draft capital, ESPN grade, and position into a single 0-100 score.
 *
 * ADP is the strongest signal — it reflects how the fantasy market values each rookie
 * including landing spot, opportunity, and positional value that raw draft capital misses.
 *
 * Post-draft weight allocation (when all data available):
 *   50% ADP Score     - fantasy market consensus (startup drafts)
 *   25% Draft Capital - where the NFL valued them
 *   15% ESPN Grade    - pre-draft scouting consensus
 *   10% Position      - fantasy position relevance
 *
 * Pre-draft: ADP is unavailable (startup drafts happen after NFL draft),
 * so existing grade-based logic applies.
 *
 * @param {Object} params
 * @param {Number|null} params.draftCapitalScore - From calcDraftCapitalScore()
 * @param {Number|null} params.espnGrade - ESPN prospect grade (0-100)
 * @param {String} params.position - Player position (QB, RB, WR, TE)
 * @param {Boolean} params.isDrafted - Whether the player was selected in the NFL draft
 * @param {Boolean} params.isPreDraft - True if the draft hasn't happened yet for this class
 * @param {Number|null} params.startupADP - Startup draft ADP (1-360+), lower = better
 * @returns {Number} - Composite recruit score (0-100)
 */
function calcRecruitScore({ draftCapitalScore, espnGrade, position, isDrafted, isPreDraft, startupADP }) {
  const posWeight = getPositionWeight(position);
  const hasDraftCapital = draftCapitalScore !== null && draftCapitalScore > 0;
  const hasGrade = espnGrade !== null && !isNaN(espnGrade);

  // --- Post-draft with ADP available ---
  // ADP is the dominant signal. Missing data gets placeholder scores:
  //   Missing ADP → defaultADPForScoring (257): just outside startup draft range
  //   UDFA → defaultDraftPick (263): one pick worse than last NFL draft pick
  if (!isPreDraft) {
    const config = getConfig();
    const adpConfig = config.adpConfig || {};
    const effectiveADP = startupADP || adpConfig.defaultADPForScoring || 257;
    const adpScore = calcADPScore(effectiveADP, adpConfig.adpScoreDecayRate || 0.012);

    // Floor scores for missing data instead of dropping components:
    //   UDFA → defaultDraftPick (263): one pick worse than last NFL draft pick (~0.69)
    //   No ESPN grade → defaultESPNGrade (20): well below scoutable range
    const effectiveDraftCapital = hasDraftCapital
      ? draftCapitalScore
      : calcDraftCapitalScore(config.defaultDraftPick || 263, config.draftCapitalDecayRate || 0.019);
    const effectiveGrade = hasGrade ? espnGrade : (config.defaultESPNGrade || 20);

    // Single consistent formula for all post-draft players:
    // 50% ADP, 25% Draft Capital, 15% ESPN Grade, 10% Position
    const raw = (adpScore * 0.50) + (effectiveDraftCapital * 0.25) + (effectiveGrade * 0.15) + (posWeight * 10);
    return Math.min(raw, 100);
  }

  // --- Pre-draft (no ADP available — startup drafts haven't happened) ---
  // Use floor grade (20) when ESPN hasn't evaluated the player
  const config = getConfig();
  const effectiveGrade = hasGrade ? espnGrade : (config.defaultESPNGrade || 20);
  const raw = (effectiveGrade * 0.80) + (posWeight * 10);
  return Math.min(raw, 100);
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
  // Round up decimal ADPs so they land in a definitive bucket
  // e.g., ADP 24.5 → 25 → "Premium (25-60)"
  var rounded = Math.ceil(adp);
  for (var i = 0; i < tiers.length; i++) {
    if (rounded >= tiers[i].min && rounded <= tiers[i].max) return tiers[i].label;
  }
  return null;
}

// ============================================================================
// PRICING MODEL
// ============================================================================

/**
 * Build a pricing model from historical auction data.
 *
 * Pricing approaches (in priority order):
 *   1. ADP regression (post-draft, ADP available): continuous price curve per position
 *   2. Per-pick sliding window (Round 1 fallback): groups nearby picks for granular pricing
 *   3. Tier-based (Round 2+ fallback): broader buckets when no ADP
 *   4. ESPN grade range (pre-draft fallback)
 *
 * Also builds:
 *   - Position budgets: avg conference spend per position per year (for scarcity pricing)
 *   - Avg ESPN grade per position (for grade adjustment reference)
 *   - Historical position counts (for scarcity factor)
 *
 * @param {Object} config - From getConfig()
 * @returns {Object} - { adpRegression, byPick, byTier, byGrade, avgGradeByPosition,
 *                        positionBudgets, historicalPositionCounts }
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

  // Parse all rookie auctions with their overall pick.
  // Uses the IsRookie flag (column 13) set during import to filter out non-rookie transactions.
  const rookieAuctions = [];
  rows.forEach(row => {
    const auctionYear = Number(row[0]) || 0;
    if (excludeYears.includes(auctionYear)) return;

    // Use IsRookie flag from import; fall back to draftYear check for older data
    const isRookie = String(row[12]).toUpperCase() === "TRUE";
    const draftYear = String(row[5]);
    if (!isRookie && draftYear !== String(auctionYear)) return;

    const position = String(row[3]);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return;

    const draftRound = String(row[6]);
    const draftPick = String(row[7]);
    const overallPick = parseOverallPick(draftPick, draftRound);
    const conference = String(row[10]);

    rookieAuctions.push({
      auctionYear, position, draftRound, draftPick, overallPick, conference,
      playerName: String(row[2]),
      bidAmount: Number(row[11]) || 0
    });
  });

  if (rookieAuctions.length === 0) return null;
  Logger.log(`  Pricing model: ${rookieAuctions.length} historical rookie auctions`);

  // --- 1. ADP regression per position (primary pricing method) ---
  // Fits a linear regression: auctionPrice = intercept + slope × adpScore
  // adpScore uses exponential decay (calcADPScore), so the regression captures
  // the non-linear relationship between raw ADP and price.
  const adpLookup = buildADPLookupByName();
  const adpConfig = config.adpConfig || {};
  const adpDecayRate = adpConfig.adpScoreDecayRate || 0.012;

  const regressionPoints = {};
  rookieAuctions.forEach(a => {
    const normalizedName = normalizeNameForMatch(a.playerName);
    if (!normalizedName) return;

    const yearKey = `${normalizedName}|${a.auctionYear}`;
    const adpEntry = adpLookup[yearKey] || adpLookup[normalizedName];
    if (!adpEntry || !adpEntry.adp) return;

    const adpScore = calcADPScore(adpEntry.adp, adpDecayRate);
    if (!regressionPoints[a.position]) regressionPoints[a.position] = [];
    regressionPoints[a.position].push({ x: adpScore, y: a.bidAmount });
  });

  const adpRegression = {};
  var minRegPoints = (adpConfig.minRegressionPoints || 10);
  var minR2 = (adpConfig.minRegressionR2 || 0.10);
  ["QB", "RB", "WR", "TE"].forEach(function(pos) {
    var pts = regressionPoints[pos];
    if (!pts || pts.length < minRegPoints) return;
    var reg = fitLinearRegression(pts);
    if (reg && reg.r2 >= minR2) {
      adpRegression[pos] = reg;
      Logger.log("  ADP regression " + pos + ": price = " + reg.intercept.toFixed(1) +
        " + " + reg.slope.toFixed(2) + " × adpScore (R²=" + reg.r2.toFixed(3) +
        ", SE=" + reg.se.toFixed(1) + ", n=" + reg.n + ")");
    } else if (reg) {
      Logger.log("  ADP regression " + pos + ": R²=" + reg.r2.toFixed(3) +
        " too low (min " + minR2 + "), using fallback buckets");
    }
  });

  Logger.log("  ADP lookup entries: " + Object.keys(adpLookup).length +
    ", regressions fit: " + Object.keys(adpRegression).length);

  // --- 2. Per-pick sliding window for Round 1 (picks 1-32) ---
  // Fallback when ADP regression isn't available for a position.
  // Also used for Round 1 grade-adjustment reference.
  const WINDOW_BY_POSITION = { WR: 3, QB: 4, RB: 6, TE: 8 };
  const byPick = {};

  for (let targetPick = 1; targetPick <= 32; targetPick++) {
    ["QB", "RB", "WR", "TE"].forEach(pos => {
      const radius = WINDOW_BY_POSITION[pos] || 5;
      const windowBids = rookieAuctions
        .filter(a => {
          if (a.position !== pos || !a.overallPick) return false;
          return a.draftRound === "1" && Math.abs(a.overallPick - targetPick) <= radius;
        })
        .map(a => a.bidAmount);

      if (windowBids.length >= 3) {
        byPick[`${pos}|${targetPick}`] = computeBucketStats(windowBids);
      }
    });
  }

  // --- 3. Tier-based for Round 2+ and UDFA (fallback) ---
  const byTier = {};
  rookieAuctions.forEach(a => {
    if (a.draftRound === "1") return;

    const tier = getDraftPickTier(a.overallPick, a.draftRound);
    const tierLabel = tier || (draftRounds.includes(a.draftRound) ? null : "UDFA");
    if (!tierLabel) return;

    const key = `${a.position}|${tierLabel}`;
    if (!byTier[key]) byTier[key] = [];
    byTier[key].push(a.bidAmount);
  });

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

  // --- 4. ESPN grade range buckets (pre-draft fallback) ---
  const byGrade = {};
  const espnLookup = buildESPNLookupByName();

  // Track grades per position for the position-level average used in grade adjustments
  const gradesByPosition = {};

  rows.forEach(row => {
    const auctionYear = Number(row[0]) || 0;
    if (excludeYears.includes(auctionYear)) return;
    const draftYear = String(row[5]);
    if (draftYear !== String(auctionYear)) return;
    const position = String(row[3]);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return;
    const playerName = String(row[2]);
    const bidAmount = Number(row[11]) || 0;

    const normalizedName = normalizeNameForMatch(playerName);
    const yearKey = `${normalizedName}|${auctionYear}`;
    const espn = espnLookup[yearKey] || espnLookup[normalizedName];

    if (espn && espn.grade !== null) {
      const gradeRange = getESPNGradeRange(espn.grade);
      const gradeKey = `${position}|${gradeRange}`;
      if (!byGrade[gradeKey]) byGrade[gradeKey] = [];
      byGrade[gradeKey].push(bidAmount);

      if (!gradesByPosition[position]) gradesByPosition[position] = [];
      gradesByPosition[position].push(espn.grade);
    }
  });

  const byGradeStats = {};
  Object.keys(byGrade).forEach(key => {
    if (byGrade[key].length >= 3) {
      byGradeStats[key] = computeBucketStats(byGrade[key]);
    }
  });

  // Average ESPN grade per position (for grade adjustment: player grade vs position average)
  const avgGradeByPosition = {};
  Object.keys(gradesByPosition).forEach(pos => {
    const grades = gradesByPosition[pos];
    avgGradeByPosition[pos] = grades.reduce((s, v) => s + v, 0) / grades.length;
  });

  Logger.log("  Avg ESPN grade: " + ["QB", "RB", "WR", "TE"].map(function(pos) {
    return pos + "=" + (avgGradeByPosition[pos] ? avgGradeByPosition[pos].toFixed(1) : "N/A");
  }).join(", "));

  // --- 5. Position budgets (for scarcity pricing) ---
  // Compute avg total spend per conference per position per year.
  // This represents the "budget" each conference allocates to a position's rookie auction.
  const years = [...new Set(rookieAuctions.map(a => a.auctionYear))];
  const conferences = new Set();
  rookieAuctions.forEach(a => { if (a.conference) conferences.add(a.conference); });
  const numConferences = conferences.size || (config.numberOfConferences || 6);

  // Total league spend per position per year, then divide by conferences
  const yearPosSpend = {};
  rookieAuctions.forEach(a => {
    const key = `${a.auctionYear}|${a.position}`;
    yearPosSpend[key] = (yearPosSpend[key] || 0) + a.bidAmount;
  });

  const positionBudgets = {};
  ["QB", "RB", "WR", "TE"].forEach(pos => {
    const yearSpends = years.map(y => {
      var total = yearPosSpend[`${y}|${pos}`] || 0;
      return total / numConferences;
    }).filter(s => s > 0);
    positionBudgets[pos] = yearSpends.length > 0
      ? yearSpends.reduce((s, v) => s + v, 0) / yearSpends.length
      : 0;
  });

  Logger.log("  Avg conference budget/yr: " + ["QB", "RB", "WR", "TE"].map(function(pos) {
    return pos + "=$" + (positionBudgets[pos] ? positionBudgets[pos].toFixed(0) : "0");
  }).join(", ") + " (from " + numConferences + " conferences, " + years.length + " years)");

  // --- 6. Historical position counts per year (for reference/scarcity factor) ---
  const positionsByYear = {};
  rookieAuctions.forEach(a => {
    const yk = `${a.auctionYear}|${a.position}`;
    if (!positionsByYear[yk]) positionsByYear[yk] = new Set();
    positionsByYear[yk].add(`${a.draftRound}|${a.draftPick}`);
  });

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

  return {
    adpRegression,
    byPick,
    byTier: byTierStats,
    byGrade: byGradeStats,
    avgGradeByPosition,
    positionBudgets,
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
 * Priority:
 *   1. ADP regression (post-draft, ADP available) — continuous, no tier jumps
 *   2. Per-pick sliding window (Round 1, no ADP regression) — granular fallback
 *   3. Tier-based (Round 2+/UDFA, no ADP regression) — broader fallback
 *   4. ESPN grade range (pre-draft) — grade-only fallback
 *
 * After finding the base price, applies:
 *   - ESPN grade adjustment: scale price based on grade vs position average
 *     (ADP already captures draft capital, so grade is the only independent signal)
 *   - No ADP multiplier — ADP is the base price source, not a modifier
 *   - No tier blending — regression is continuous, no buckets to blend
 *
 * @param {Object} player - Board player object (must include startupADP)
 * @param {Object} pricingModel - From buildPricingModel()
 * @param {Object} currentYearCounts - Position counts for this draft class
 * @param {Boolean} isPreDraft - Whether the draft has occurred
 * @returns {Object|null} - { predicted, p25, p75, sourceType, count, confidence } or null
 */
function predictPrice(player, pricingModel, currentYearCounts, isPreDraft) {
  if (!pricingModel) return null;

  var pos = player.position;
  var config = getConfig();
  var adpConfig = config.adpConfig || {};

  var predicted, p25, p75, sourceType, sampleSize;

  // === 1. ADP regression (post-draft, primary) ===
  // When ADP data exists, the regression gives a continuous price curve per position.
  // ADP already incorporates draft capital + landing spot + positional value,
  // so draft capital is NOT weighted separately — avoiding double-counting.
  if (!isPreDraft && pricingModel.adpRegression && pricingModel.adpRegression[pos]) {
    var effectiveADP = player.startupADP || adpConfig.defaultADP || 360;
    var adpScore = calcADPScore(effectiveADP, adpConfig.adpScoreDecayRate || 0.012);
    var reg = pricingModel.adpRegression[pos];
    var pred = getRegressionPrediction(reg, adpScore);

    predicted = pred.predicted;
    p25 = pred.p25;
    p75 = pred.p75;
    sourceType = "adpRegression";
    sampleSize = reg.n;

    // Grade adjustment: ESPN grade provides independent signal about player quality
    // that the market (ADP) may not fully capture. Compare to position average.
    var gradeAdj = calcGradeAdjustment(player.espnGrade, pos, pricingModel, adpConfig);
    predicted = Math.max(1, Math.round(predicted * gradeAdj));
    p25 = Math.max(1, Math.round(p25 * gradeAdj));
    p75 = Math.max(1, Math.round(p75 * gradeAdj));

    return {
      predicted: predicted,
      p25: p25,
      p75: p75,
      sourceType: sourceType,
      count: sampleSize,
      confidence: calcRegressionConfidence(reg)
    };
  }

  // === 2. Draft-capital bucket fallback (post-draft, no ADP regression) ===
  var bucket = null;

  if (!isPreDraft) {
    // Round 1: per-pick sliding window
    if (player.draftRound === "1" && player.overallPick && player.overallPick <= 32) {
      bucket = pricingModel.byPick[pos + "|" + player.overallPick];
      if (bucket) sourceType = "perPick";
    }

    // Round 2+: tier-based
    if (!bucket && player.overallPick) {
      var tier = getDraftPickTier(player.overallPick, player.draftRound);
      if (tier) {
        bucket = pricingModel.byTier[pos + "|" + tier];
        if (bucket) sourceType = "tier";
      }
    }

    // UDFA
    if (!bucket && player.dataSource && player.dataSource.includes("UDFA")) {
      bucket = pricingModel.byTier[pos + "|UDFA"];
      if (bucket) sourceType = "udfa";
    }
  }

  // === 3. ESPN grade range fallback (pre-draft or no other match) ===
  if (!bucket && player.espnGrade !== null) {
    var gradeRange = getESPNGradeRange(player.espnGrade);
    bucket = pricingModel.byGrade[pos + "|" + gradeRange];
    if (bucket) sourceType = "grade";
  }

  if (!bucket || bucket.count < 3) return null;

  // Grade adjustment for bucket-based predictions (skip for grade-bucketed since already grouped by grade)
  var gradeMultiplier = 1.0;
  if (sourceType !== "grade") {
    gradeMultiplier = calcGradeAdjustment(player.espnGrade, pos, pricingModel, adpConfig);
  }

  // Scarcity factor for bucket-based fallback (regression users get scarcity via separate scarcity price)
  var scarcity = calcScarcityFactor(pos, currentYearCounts, pricingModel.historicalPositionCounts);
  var totalMult = Math.max(0.50, Math.min(1.40, gradeMultiplier * scarcity));

  return {
    predicted: Math.max(1, Math.round(bucket.median * totalMult)),
    p25: Math.max(1, Math.round(bucket.p25 * totalMult)),
    p75: Math.max(1, Math.round(bucket.p75 * totalMult)),
    sourceType: sourceType,
    count: bucket.count,
    confidence: calcConfidence(bucket, sourceType, false)
  };
}

/**
 * Calculate ESPN grade adjustment multiplier.
 * Compares a player's grade to the position average.
 * Each grade point above/below average adjusts price by a configurable %.
 *
 * @param {Number|null} espnGrade - Player's ESPN grade
 * @param {String} position - Player position
 * @param {Object} pricingModel - From buildPricingModel()
 * @param {Object} adpConfig - ADP config from getConfig()
 * @returns {Number} - Multiplier (0.75-1.25, or 1.0 if no grade)
 */
function calcGradeAdjustment(espnGrade, position, pricingModel, adpConfig) {
  if (espnGrade === null || espnGrade === undefined || isNaN(espnGrade)) return 1.0;
  if (!pricingModel.avgGradeByPosition || !pricingModel.avgGradeByPosition[position]) return 1.0;

  var avgGrade = pricingModel.avgGradeByPosition[position];
  if (avgGrade <= 0) return 1.0;

  var perPoint = adpConfig.gradeAdjustmentPerPoint || 0.01;
  var gradeDiff = espnGrade - avgGrade;
  var multiplier = 1.0 + (gradeDiff * perPoint);
  return Math.max(0.75, Math.min(1.25, multiplier));
}

/**
 * Calculate confidence for an ADP regression prediction.
 * Based on R² (model quality) and sample size.
 *
 * @param {Object} reg - Regression result from fitLinearRegression()
 * @returns {Object} - { score: Number, label: String }
 */
function calcRegressionConfidence(reg) {
  // R² contribution (50%) — how well ADP explains price
  var r2Score = Math.min(100, reg.r2 * 120);  // R²=0.83 → 100

  // Sample size contribution (50%) — log scale
  var sampleScore = Math.min(100, 30 * Math.log(reg.n));

  var score = Math.round(r2Score * 0.50 + sampleScore * 0.50);
  score = Math.max(0, Math.min(100, score));

  var label = "Very Low";
  if (score >= 75) label = "High";
  else if (score >= 50) label = "Medium";
  else if (score >= 25) label = "Low";

  return { score: score, label: label };
}

// ============================================================================
// SCARCITY PRICING (BUDGET ALLOCATION MODEL)
// ============================================================================

/**
 * Calculate scarcity-based price for all prospects at a given position.
 * Models how a fixed conference budget gets allocated across this year's draft class.
 *
 * Logic:
 *   1. From historical data: average conference spend per position per year
 *   2. Current year: distribute that same budget across this year's prospects
 *   3. Each player's share is proportional to their ADP score relative to the group
 *   4. Per-copy price: divide by copies per conference (12 total / 6 conferences = 2)
 *
 * When scarcity price > predicted price: thin class, expect bidding wars.
 * When scarcity price < predicted price: deep class, potential bargains.
 *
 * @param {Array} boardPlayers - All players on the board (need full list for position totals)
 * @param {Object} pricingModel - From buildPricingModel() (needs positionBudgets)
 * @param {Object} config - From getConfig()
 * @returns {Object} - Map of playerName → scarcityPrice (Number)
 */
function calcScarcityPrices(boardPlayers, pricingModel, config) {
  var result = {};
  if (!pricingModel || !pricingModel.positionBudgets) return result;

  var adpConfig = config.adpConfig || {};
  var adpDecayRate = adpConfig.adpScoreDecayRate || 0.012;
  var defaultADP = adpConfig.defaultADP || 360;
  var numConferences = config.numberOfConferences || 6;
  var copiesPerPlayer = config.copiesPerPlayer || 12;
  var copiesPerConference = copiesPerPlayer / numConferences;

  // Group players by position and compute ADP scores
  var positionGroups = {};
  boardPlayers.forEach(function(p) {
    var pos = p.position;
    if (!positionGroups[pos]) positionGroups[pos] = [];
    var adp = p.startupADP || defaultADP;
    var adpScore = calcADPScore(adp, adpDecayRate);
    positionGroups[pos].push({ name: p.name, adpScore: adpScore });
  });

  // For each position, distribute the conference budget proportionally
  Object.keys(positionGroups).forEach(function(pos) {
    var players = positionGroups[pos];
    var budget = pricingModel.positionBudgets[pos] || 0;
    if (budget <= 0 || players.length === 0) return;

    // Total ADP score across all copies in the conference
    // Each player has copiesPerConference copies, all with the same ADP score
    var totalScore = 0;
    players.forEach(function(p) { totalScore += p.adpScore * copiesPerConference; });
    if (totalScore <= 0) return;

    players.forEach(function(p) {
      // This player's per-copy share of the conference position budget
      var perCopyShare = (p.adpScore / totalScore) * budget;
      result[p.name] = Math.max(1, Math.round(perCopyShare));
    });
  });

  return result;
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

  // --- Build lookups for cross-referencing data sources ---
  const adpLookup = buildADPLookupByName();
  const adpTiers = (config.adpConfig || {}).tiers || [];
  const espnLookup = buildESPNLookupByName();
  Logger.log(`  ADP lookup entries: ${Object.keys(adpLookup).length}`);
  Logger.log(`  ESPN lookup entries: ${Object.keys(espnLookup).length}`);

  // Build MFL lookup by normalized name for cross-referencing draft info into ESPN prospects
  const mflLookup = {};
  mflRookies.forEach(mfl => {
    const name = normalizeNameForMatch(mfl.name || "");
    if (name) mflLookup[name] = mfl;
  });

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

    // Cross-reference MFL data to fill in missing draft info
    let draftRound = espn.draftRound;
    let draftPick = espn.draftPick;
    if ((!draftRound || draftRound === "0") && mflLookup[normalizedName]) {
      const mfl = mflLookup[normalizedName];
      if (mfl.draft_round && mfl.draft_round !== "0") {
        draftRound = String(mfl.draft_round);
        draftPick = String(mfl.draft_pick || "");
      }
    }

    // ESPN stores pick-within-round (not overall pick) from URL: /rounds/{R}/picks/{P}
    // Convert to overall pick: (round - 1) * 32 + pickInRound
    // Don't use parseOverallPick() here — that's designed for MFL's "1.05" format
    const round = Number(draftRound);
    const pickInRound = Number(draftPick);
    let overallPick = (!isNaN(round) && round > 0 && !isNaN(pickInRound) && pickInRound > 0)
      ? (round - 1) * 32 + pickInRound
      : null;

    // If draft info came from MFL, the pick format is MFL's "1.05" style — use parseOverallPick
    if (!overallPick && draftRound && draftPick && mflLookup[normalizedName]) {
      overallPick = parseOverallPick(draftPick, draftRound);
    }

    // Track draft slot to catch name variants (Ken vs Kenneth, etc.)
    if (draftRound && draftPick) {
      processedDraftPicks.add(`${draftRound}|${draftPick}`);
    }
    const isDrafted = draftRound !== "" && draftRound !== "0";
    const draftCapital = calcDraftCapitalScore(overallPick, config.draftCapitalDecayRate);

    // Look up startup ADP for this player (needed for recruit score)
    const adpYearKey = `${normalizedName}|${yearStr}`;
    const adpEntry = adpLookup[adpYearKey] || adpLookup[normalizedName];

    const recruitScore = calcRecruitScore({
      draftCapitalScore: draftCapital > 0 ? draftCapital : null,
      espnGrade: espn.grade,
      position: espn.position,
      isDrafted: isDrafted,
      isPreDraft: !draftHasOccurred,
      startupADP: adpEntry ? adpEntry.adp : null
    });

    const stars = getStarRating(recruitScore, config.starThresholds);

    // Determine data source label
    let dataSource = "ESPN (No Grade)";
    if (espn.grade !== null && isDrafted) dataSource = "ESPN + Draft";
    else if (espn.grade !== null && !draftHasOccurred) dataSource = "ESPN (Pre-Draft)";
    else if (espn.grade !== null && !isDrafted) dataSource = "ESPN (UDFA)";
    else if (isDrafted) dataSource = "Draft Only";

    const playerObj = {
      name: espn.name,
      position: espn.position,
      college: espn.college,
      espnGrade: espn.grade,
      espnOverallRank: espn.overallRank,
      espnPositionRank: espn.positionRank,
      draftRound: draftRound || "",
      draftPick: draftPick || "",
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

    // Cross-reference ESPN data for grade/rank info
    const espnYearKey = `${normalizedName}|${yearStr}`;
    const espnEntry = espnLookup[espnYearKey] || espnLookup[normalizedName];

    // Look up startup ADP for this player (needed for recruit score)
    const adpYearKey = `${normalizedName}|${yearStr}`;
    const adpEntry = adpLookup[adpYearKey] || adpLookup[normalizedName];

    const espnGrade = espnEntry ? espnEntry.grade : null;

    const recruitScore = calcRecruitScore({
      draftCapitalScore: draftCapital > 0 ? draftCapital : null,
      espnGrade: espnGrade,
      position: mfl.position,
      isDrafted: isDrafted !== false,
      isPreDraft: false,
      startupADP: adpEntry ? adpEntry.adp : null
    });

    const stars = getStarRating(recruitScore, config.starThresholds);

    // Convert MFL "Last, First" format to "First Last"
    let displayName = mflName;
    if (mflName.includes(",")) {
      const parts = mflName.split(",").map(s => s.trim());
      if (parts.length >= 2) displayName = `${parts[1]} ${parts[0]}`;
    }

    const mflPlayerObj = {
      name: displayName,
      position: mfl.position || "",
      college: "",
      espnGrade: espnGrade,
      espnOverallRank: espnEntry ? espnEntry.overallRank : null,
      espnPositionRank: espnEntry ? espnEntry.positionRank : null,
      draftRound: mfl.draft_round || "",
      draftPick: mfl.draft_pick || "",
      overallPick: overallPick,
      draftCapitalScore: draftCapital,
      startupADP: adpEntry ? adpEntry.adp : null,
      adpTier: adpEntry ? getADPTier(adpEntry.adp, adpTiers) : null,
      recruitScore: recruitScore,
      stars: stars,
      headshotUrl: "",
      dataSource: espnEntry && espnGrade !== null
        ? (isDrafted ? "MFL + ESPN" : "MFL + ESPN (UDFA)")
        : (isDrafted ? "MFL Only" : "MFL (UDFA)")
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

  // --- 4. Calculate scarcity prices (budget allocation model) ---
  const scarcityPrices = calcScarcityPrices(boardPlayers, pricingModel, config);
  const scarcityCount = Object.keys(scarcityPrices).length;
  if (scarcityCount > 0) {
    Logger.log(`  Scarcity prices calculated for ${scarcityCount} players`);
    // Log a few examples
    boardPlayers.slice(0, 3).forEach(p => {
      const sp = scarcityPrices[p.name];
      const pp = p.pricing ? p.pricing.predicted : null;
      if (sp && pp) {
        Logger.log(`    ${p.name} (${p.position}): predicted=$${pp}, scarcity=$${sp}`);
      }
    });
  }

  // --- 5. Write to RecruitingBoard sheet ---
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
    "Predicted Cost", "Scarcity Price", "Price Range", "Price Source", "Sample (n)", "Confidence",
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
    const sp = scarcityPrices[p.name] || null;
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
      sp ? `$${sp}` : "",
      pr ? `$${pr.p25}-$${pr.p75}` : "",
      pr ? pr.sourceType : "",
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
    sheet.setColumnWidth(17, 95);   // Scarcity Price
    sheet.setColumnWidth(18, 110);  // Price Range
    sheet.setColumnWidth(19, 95);   // Price Source
    sheet.setColumnWidth(20, 70);   // Sample (n)
    sheet.setColumnWidth(21, 110);  // Confidence
    sheet.setColumnWidth(22, 110);  // Data Source
    sheet.setColumnWidth(23, 80);   // Headshot URL
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
