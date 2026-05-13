"""
Current pricing model — port of buildPricingModel(), predictPrice(), and
calcScarcityPrices() from RecruitingBoard.gs.

This is the ADP regression model with fallback buckets and grade adjustment.
"""

import math
from typing import Optional
import pandas as pd

from models.config import (
    POSITIONS, EXCLUDE_YEARS, ADP_SCORE_DECAY_RATE, DEFAULT_ADP,
    GRADE_ADJUSTMENT_PER_POINT, MIN_REGRESSION_POINTS, MIN_REGRESSION_R2,
    WINDOW_BY_POSITION, COPY_DISCOUNT_BINS, COPIES_PER_CONFERENCE,
    MIN_COPY_PAIRS_FOR_EMPIRICAL,
)
from models.scoring import calc_adp_score, calc_draft_capital_score_for_position
from utils.parsing import (
    normalize_name, parse_overall_pick, get_draft_pick_tier, get_espn_grade_range,
)


# ---------------------------------------------------------------------------
# Linear Regression
# ---------------------------------------------------------------------------

def fit_linear_regression(points: list[dict]) -> Optional[dict]:
    """
    Fit y = intercept + slope * x via least squares.
    Port of fitLinearRegression() from RecruitingBoard.gs.

    Returns {slope, intercept, r2, se, n, x_mean, x_var} or None.
    """
    n = len(points)
    if n < 5:
        return None

    sum_x = sum_y = sum_xy = sum_x2 = sum_y2 = 0.0
    for p in points:
        x, y = p["x"], p["y"]
        sum_x += x
        sum_y += y
        sum_xy += x * y
        sum_x2 += x * x
        sum_y2 += y * y

    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None

    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n

    y_mean = sum_y / n
    ss_tot = sum_y2 - n * y_mean * y_mean
    ss_res = sum((p["y"] - (intercept + slope * p["x"])) ** 2 for p in points)
    r2 = (1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    se = math.sqrt(ss_res / max(1, n - 2))
    x_mean = sum_x / n
    x_var = sum_x2 / n - x_mean * x_mean

    return {
        "slope": slope, "intercept": intercept, "r2": r2,
        "se": se, "n": n, "x_mean": x_mean, "x_var": x_var,
    }


def get_regression_prediction(reg: dict, x: float) -> dict:
    """
    Get prediction interval bounds for a regression at x.
    Port of getRegressionPrediction().
    """
    predicted = reg["intercept"] + reg["slope"] * x

    x_deviation = ((x - reg["x_mean"]) ** 2 / (reg["n"] * reg["x_var"])) if reg["x_var"] > 0 else 0
    se_pred = reg["se"] * math.sqrt(1 + 1 / reg["n"] + x_deviation)

    p25 = predicted - 0.675 * se_pred
    p75 = predicted + 0.675 * se_pred

    return {
        "predicted": max(0, round(predicted)),
        "p25": max(0, round(p25)),
        "p75": max(0, round(p75)),
    }


# ---------------------------------------------------------------------------
# Bucket Statistics
# ---------------------------------------------------------------------------

def compute_bucket_stats(bids: list[float]) -> dict:
    """Compute stats for a bucket of bid amounts. Port of computeBucketStats()."""
    sorted_bids = sorted(bids)
    n = len(sorted_bids)
    mean = sum(sorted_bids) / n
    med = sorted_bids[n // 2] if n % 2 != 0 else (sorted_bids[n // 2 - 1] + sorted_bids[n // 2]) / 2
    p25 = sorted_bids[int(n * 0.25)]
    p75 = sorted_bids[min(int(n * 0.75), n - 1)]

    skew = "Even"
    if med > 0:
        ratio = mean / med
        if ratio > 1.10:
            skew = "Skews High"
        elif ratio < 0.90:
            skew = "Skews Low"

    return {"median": med, "p25": p25, "p75": p75, "mean": mean, "count": n, "skew": skew}


# ---------------------------------------------------------------------------
# Confidence Scoring
# ---------------------------------------------------------------------------

def calc_confidence(bucket: dict, source_type: str, has_adp: bool = False) -> dict:
    """Calculate confidence score. Port of calcConfidence()."""
    sample_score = min(100, 30 * math.log(bucket["count"])) if bucket["count"] > 0 else 0

    spread_score = 50
    if bucket["median"] > 0:
        spread_ratio = (bucket["p75"] - bucket["p25"]) / bucket["median"]
        spread_score = max(0, 100 * (1 - spread_ratio))

    source_scores = {"perPick": 100, "tier": 80, "udfa": 60, "grade": 40}
    source_score = source_scores.get(source_type, 40)

    adp_bonus = 5 if has_adp else 0

    score = round(sample_score * 0.40 + spread_score * 0.35 + source_score * 0.25 + adp_bonus)
    score = max(0, min(100, score))

    label = "Very Low"
    if score >= 75:
        label = "High"
    elif score >= 50:
        label = "Medium"
    elif score >= 25:
        label = "Low"

    return {"score": score, "label": label}


def calc_regression_confidence(reg: dict) -> dict:
    """Calculate confidence for an ADP regression prediction."""
    r2_score = min(100, reg["r2"] * 120)
    sample_score = min(100, 30 * math.log(reg["n"])) if reg["n"] > 0 else 0

    score = round(r2_score * 0.50 + sample_score * 0.50)
    score = max(0, min(100, score))

    label = "Very Low"
    if score >= 75:
        label = "High"
    elif score >= 50:
        label = "Medium"
    elif score >= 25:
        label = "Low"

    return {"score": score, "label": label}


# ---------------------------------------------------------------------------
# Grade Adjustment
# ---------------------------------------------------------------------------

def calc_grade_adjustment(
    espn_grade: Optional[float],
    position: str,
    avg_grade_by_position: dict,
) -> float:
    """
    Calculate ESPN grade adjustment multiplier.
    Port of calcGradeAdjustment().
    """
    if espn_grade is None or math.isnan(espn_grade):
        return 1.0
    avg_grade = avg_grade_by_position.get(position)
    if not avg_grade or avg_grade <= 0:
        return 1.0

    grade_diff = espn_grade - avg_grade
    multiplier = 1.0 + (grade_diff * GRADE_ADJUSTMENT_PER_POINT)
    return max(0.75, min(1.25, multiplier))


# ---------------------------------------------------------------------------
# Build Pricing Model
# ---------------------------------------------------------------------------

def build_pricing_model(
    auction_df: pd.DataFrame,
    adp_df: pd.DataFrame,
    espn_df: pd.DataFrame,
) -> Optional[dict]:
    """
    Build pricing model from historical data.
    Port of buildPricingModel() from RecruitingBoard.gs.

    Returns dict with: adp_regression, by_pick, by_tier, by_grade,
    avg_grade_by_position, conference_budgets, copy_discount_curve,
    historical_position_counts.
    """
    if auction_df.empty:
        return None

    # Filter to rookie auctions only
    rookies = auction_df[auction_df["IsRookie"]].copy()
    rookies = rookies[rookies["Position"].isin(POSITIONS)]

    if rookies.empty:
        return None

    # Parse overall picks
    rookies["OverallPick"] = rookies.apply(
        lambda r: parse_overall_pick(r["DraftPick"], r["DraftRound"]), axis=1
    )

    # Build ADP lookup from DLF data
    adp_lookup = {}
    for _, row in adp_df.iterrows():
        if pd.isna(row.get("ADP")) or not row.get("Player"):
            continue
        name = normalize_name(row["Player"])
        year = str(row.get("Year", ""))
        entry = {"adp": row["ADP"], "position": row.get("Position", "")}
        adp_lookup[f"{name}|{year}"] = entry
        if name not in adp_lookup:
            adp_lookup[name] = entry

    # --- 1. ADP regression per position ---
    regression_points: dict[str, list] = {pos: [] for pos in POSITIONS}

    for _, r in rookies.iterrows():
        name = normalize_name(r["PlayerName"])
        if not name:
            continue
        year_key = f"{name}|{int(r['AuctionYear'])}"
        adp_entry = adp_lookup.get(year_key) or adp_lookup.get(name)
        if not adp_entry or not adp_entry["adp"]:
            continue
        adp_score = calc_adp_score(adp_entry["adp"])
        regression_points[r["Position"]].append({"x": adp_score, "y": r["BidAmount"]})

    adp_regression = {}
    for pos in POSITIONS:
        pts = regression_points[pos]
        if len(pts) < MIN_REGRESSION_POINTS:
            continue
        reg = fit_linear_regression(pts)
        if reg and reg["r2"] >= MIN_REGRESSION_R2:
            adp_regression[pos] = reg

    # --- 2. Per-pick sliding window for Round 1 ---
    by_pick = {}
    for target_pick in range(1, 33):
        for pos in POSITIONS:
            radius = WINDOW_BY_POSITION.get(pos, 5)
            window_bids = rookies[
                (rookies["Position"] == pos) &
                (rookies["DraftRound"] == "1") &
                (rookies["OverallPick"].notna()) &
                ((rookies["OverallPick"] - target_pick).abs() <= radius)
            ]["BidAmount"].tolist()

            if len(window_bids) >= 3:
                by_pick[f"{pos}|{target_pick}"] = compute_bucket_stats(window_bids)

    # --- 3. Tier-based for Round 2+ and UDFA ---
    draft_rounds = {"1", "2", "3", "4", "5", "6", "7"}
    by_tier_raw: dict[str, list] = {}

    for _, r in rookies.iterrows():
        if r["DraftRound"] == "1":
            continue
        tier = get_draft_pick_tier(r["OverallPick"], r["DraftRound"])
        if not tier:
            if r["DraftRound"] not in draft_rounds:
                tier = "UDFA"
            else:
                continue
        key = f"{r['Position']}|{tier}"
        by_tier_raw.setdefault(key, []).append(r["BidAmount"])

    # Also add UDFA entries for non-drafted players
    for _, r in rookies.iterrows():
        if r["DraftRound"] in draft_rounds:
            continue
        key = f"{r['Position']}|UDFA"
        by_tier_raw.setdefault(key, []).append(r["BidAmount"])

    by_tier = {k: compute_bucket_stats(v) for k, v in by_tier_raw.items() if len(v) >= 3}

    # --- 4. ESPN grade range buckets ---
    espn_lookup = {}
    for _, row in espn_df.iterrows():
        name = normalize_name(row.get("PlayerName", ""))
        if not name:
            continue
        year = str(row.get("DraftYear", ""))
        entry = {"grade": row.get("Grade"), "position": row.get("Position", "")}
        espn_lookup[f"{name}|{year}"] = entry
        if name not in espn_lookup:
            espn_lookup[name] = entry

    by_grade_raw: dict[str, list] = {}
    grades_by_position: dict[str, list] = {}

    for _, r in rookies.iterrows():
        name = normalize_name(r["PlayerName"])
        year_key = f"{name}|{int(r['AuctionYear'])}"
        espn = espn_lookup.get(year_key) or espn_lookup.get(name)
        if not espn or espn["grade"] is None or pd.isna(espn["grade"]):
            continue

        grade_range = get_espn_grade_range(espn["grade"])
        key = f"{r['Position']}|{grade_range}"
        by_grade_raw.setdefault(key, []).append(r["BidAmount"])
        grades_by_position.setdefault(r["Position"], []).append(espn["grade"])

    by_grade = {k: compute_bucket_stats(v) for k, v in by_grade_raw.items() if len(v) >= 3}

    avg_grade_by_position = {
        pos: sum(grades) / len(grades)
        for pos, grades in grades_by_position.items()
        if grades
    }

    # --- 5. Conference budgets ---
    from models.config import CONFERENCES
    conf_size_map = dict(CONFERENCES)

    conf_year_spend: dict[str, float] = {}
    for _, r in rookies.iterrows():
        if not r["Conference"]:
            continue
        key = f"{r['Conference']}|{int(r['AuctionYear'])}"
        conf_year_spend[key] = conf_year_spend.get(key, 0) + r["BidAmount"]

    budgets_by_size: dict[int, list] = {}
    for key, spend in conf_year_spend.items():
        conf_code = key.split("|")[0]
        team_count = conf_size_map.get(conf_code, 16)
        budgets_by_size.setdefault(team_count, []).append(spend)

    conference_budgets = {
        size: sum(spends) / len(spends)
        for size, spends in budgets_by_size.items()
    }

    # --- 5b. Copy discount curve (empirical) ---
    copy_groups: dict[str, list] = {}
    for _, r in rookies.iterrows():
        if not r["PlayerID"] or not r["Conference"]:
            continue
        key = f"{r['PlayerID']}|{r['Conference']}|{int(r['AuctionYear'])}"
        copy_groups.setdefault(key, []).append(r["BidAmount"])

    discount_bins = [
        {"label": b["label"], "minAvgPrice": b["minAvgPrice"],
         "defaultRatio": b["defaultRatio"], "ratios": []}
        for b in COPY_DISCOUNT_BINS
    ]

    for bids in copy_groups.values():
        if len(bids) != 2:
            continue
        sorted_bids = sorted(bids, reverse=True)
        copy1, copy2 = sorted_bids[0], sorted_bids[1]
        if copy1 <= 0 or copy2 <= 0:
            continue
        ratio = copy2 / copy1
        avg_price = (copy1 + copy2) / 2
        for b in discount_bins:
            if avg_price >= b["minAvgPrice"]:
                b["ratios"].append(ratio)
                break

    copy_discount_curve = {}
    for b in discount_bins:
        ratios = sorted(b["ratios"])
        n = len(ratios)
        if n >= MIN_COPY_PAIRS_FOR_EMPIRICAL:
            median_ratio = ratios[n // 2] if n % 2 != 0 else (ratios[n // 2 - 1] + ratios[n // 2]) / 2
            copy_discount_curve[b["label"]] = {"ratio": median_ratio, "count": n, "source": "empirical"}
        else:
            copy_discount_curve[b["label"]] = {"ratio": b["defaultRatio"], "count": n, "source": "default"}

    # --- 6. Historical position counts ---
    years = rookies["AuctionYear"].unique().tolist()
    historical_position_counts = {}
    for pos in POSITIONS:
        year_counts = []
        for y in years:
            count = rookies[(rookies["AuctionYear"] == y) & (rookies["Position"] == pos)].drop_duplicates(
                subset=["DraftRound", "DraftPick"]
            ).shape[0]
            if count > 0:
                year_counts.append(count)
        historical_position_counts[pos] = sum(year_counts) / len(year_counts) if year_counts else 0

    return {
        "adp_regression": adp_regression,
        "by_pick": by_pick,
        "by_tier": by_tier,
        "by_grade": by_grade,
        "avg_grade_by_position": avg_grade_by_position,
        "conference_budgets": conference_budgets,
        "copy_discount_curve": copy_discount_curve,
        "historical_position_counts": historical_position_counts,
    }


# ---------------------------------------------------------------------------
# Price Prediction
# ---------------------------------------------------------------------------

def predict_price(
    position: str,
    startup_adp: Optional[float],
    espn_grade: Optional[float],
    draft_round: str,
    overall_pick: Optional[int],
    data_source: str,
    pricing_model: dict,
    is_pre_draft: bool,
) -> Optional[dict]:
    """
    Predict auction price for a prospect.
    Port of predictPrice() from RecruitingBoard.gs.

    Returns {predicted, p25, p75, source_type, count, confidence} or None.
    """
    if not pricing_model:
        return None

    # 1. ADP regression (primary)
    if not is_pre_draft and position in pricing_model.get("adp_regression", {}):
        effective_adp = startup_adp if startup_adp else DEFAULT_ADP
        adp_score = calc_adp_score(effective_adp)
        reg = pricing_model["adp_regression"][position]
        pred = get_regression_prediction(reg, adp_score)

        grade_adj = calc_grade_adjustment(
            espn_grade, position, pricing_model.get("avg_grade_by_position", {})
        )
        return {
            "predicted": max(0, round(pred["predicted"] * grade_adj)),
            "p25": max(0, round(pred["p25"] * grade_adj)),
            "p75": max(0, round(pred["p75"] * grade_adj)),
            "source_type": "adpRegression",
            "count": reg["n"],
            "confidence": calc_regression_confidence(reg),
        }

    # 2. Draft-capital bucket fallback (post-draft)
    bucket = None
    source_type = None

    if not is_pre_draft:
        # Round 1: per-pick
        if draft_round == "1" and overall_pick and overall_pick <= 32:
            bucket = pricing_model.get("by_pick", {}).get(f"{position}|{overall_pick}")
            if bucket:
                source_type = "perPick"

        # Round 2+: tier
        if not bucket and overall_pick:
            tier = get_draft_pick_tier(overall_pick, draft_round)
            if tier:
                bucket = pricing_model.get("by_tier", {}).get(f"{position}|{tier}")
                if bucket:
                    source_type = "tier"

        # UDFA
        if not bucket and data_source and "UDFA" in data_source:
            bucket = pricing_model.get("by_tier", {}).get(f"{position}|UDFA")
            if bucket:
                source_type = "udfa"

    # 3. ESPN grade range fallback
    if not bucket and espn_grade is not None and not (isinstance(espn_grade, float) and math.isnan(espn_grade)):
        grade_range = get_espn_grade_range(espn_grade)
        bucket = pricing_model.get("by_grade", {}).get(f"{position}|{grade_range}")
        if bucket:
            source_type = "grade"

    if not bucket or bucket["count"] < 3:
        return None

    # Grade adjustment (skip for grade-bucketed)
    grade_mult = 1.0
    if source_type != "grade":
        grade_mult = calc_grade_adjustment(
            espn_grade, position, pricing_model.get("avg_grade_by_position", {})
        )
    total_mult = max(0.75, min(1.25, grade_mult))

    return {
        "predicted": max(0, round(bucket["median"] * total_mult)),
        "p25": max(0, round(bucket["p25"] * total_mult)),
        "p75": max(0, round(bucket["p75"] * total_mult)),
        "source_type": source_type,
        "count": bucket["count"],
        "confidence": calc_confidence(bucket, source_type, False),
    }


# ---------------------------------------------------------------------------
# Scarcity Pricing
# ---------------------------------------------------------------------------

def get_copy_discount_ratio(
    avg_copy_price: float,
    discount_curve: dict,
    discount_bins: list[dict],
) -> float:
    """Look up copy discount ratio by avg copy price."""
    for b in discount_bins:
        if avg_copy_price >= b["minAvgPrice"]:
            curve_entry = discount_curve.get(b["label"])
            return curve_entry["ratio"] if curve_entry else b["defaultRatio"]
    return 0.75


def calc_scarcity_prices(
    board_df: pd.DataFrame,
    pricing_model: dict,
    is_pre_draft: bool,
) -> pd.DataFrame:
    """
    Calculate scarcity-based Copy 1/Copy 2 prices.
    Port of calcScarcityPrices() from RecruitingBoard.gs.

    Returns DataFrame with columns: Player, copy1_16, copy2_16, copy1_20, copy2_20.
    """
    if not pricing_model or "conference_budgets" not in pricing_model:
        return pd.DataFrame()

    discount_curve = pricing_model.get("copy_discount_curve", {})
    budgets = pricing_model["conference_budgets"]

    # Compute weights
    weights = []
    for _, row in board_df.iterrows():
        if not is_pre_draft:
            adp = row.get("StartupADP") or row.get("startupADP") or DEFAULT_ADP
            weight = calc_adp_score(adp)
        else:
            weight = row.get("RecruitScore") or row.get("recruitScore") or 1
        weights.append({"name": row.get("Player") or row.get("name", ""), "weight": weight})

    total_weight = sum(p["weight"] * COPIES_PER_CONFERENCE for p in weights)
    if total_weight <= 0:
        return pd.DataFrame()

    results = []
    for p in weights:
        entry = {"Player": p["name"]}
        for size_str, budget in budgets.items():
            size = int(size_str)
            if budget <= 0:
                continue

            player_share = (p["weight"] * COPIES_PER_CONFERENCE / total_weight) * budget
            avg_copy_price = player_share / COPIES_PER_CONFERENCE

            ratio = get_copy_discount_ratio(avg_copy_price, discount_curve, COPY_DISCOUNT_BINS)

            copy1 = player_share / (1 + ratio)
            copy2 = player_share * ratio / (1 + ratio)

            sizes = sorted(int(s) for s in budgets.keys())
            if size == sizes[0]:  # smaller conference (16)
                entry["copy1_16"] = max(0, round(copy1))
                entry["copy2_16"] = max(0, round(copy2))
            if size == sizes[-1]:  # larger conference (20)
                entry["copy1_20"] = max(0, round(copy1))
                entry["copy2_20"] = max(0, round(copy2))

        results.append(entry)

    return pd.DataFrame(results)
