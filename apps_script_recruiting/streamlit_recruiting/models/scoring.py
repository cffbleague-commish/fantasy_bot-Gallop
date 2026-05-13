"""
Recruit scoring and star rating functions.
Port of scoring logic from RecruitingBoard.gs lines 34-244.
"""

import math
from typing import Optional

from models.config import (
    DRAFT_CAPITAL_DECAY_RATES, DRAFT_CAPITAL_DECAY_RATE,
    ADP_SCORE_DECAY_RATE, DEFAULT_ADP_FOR_SCORING, DEFAULT_DRAFT_PICK,
    DEFAULT_ESPN_GRADE, POSITION_WEIGHTS, DEFAULT_POSITION_WEIGHT,
    STAR_THRESHOLDS,
)


def calc_draft_capital_score(overall_pick: Optional[int], decay_rate: float = None) -> float:
    """
    Calculate Draft Capital Score from overall pick position.
    Uses exponential decay: top picks are worth exponentially more.

    Pick 1 → 100.0, Pick 32 → 55.3 (at default 0.019 decay)
    """
    if not overall_pick or overall_pick < 1:
        return 0.0
    if decay_rate is None:
        decay_rate = DRAFT_CAPITAL_DECAY_RATE
    return 100.0 * math.exp(-decay_rate * (overall_pick - 1))


def calc_draft_capital_score_for_position(
    overall_pick: Optional[int], position: str
) -> float:
    """Calculate draft capital score using position-specific decay rate."""
    rate = DRAFT_CAPITAL_DECAY_RATES.get(position, DRAFT_CAPITAL_DECAY_RATE)
    return calc_draft_capital_score(overall_pick, rate)


def calc_adp_score(adp: Optional[float], decay_rate: float = None) -> float:
    """
    Calculate ADP Score from startup draft ADP position.
    Uses gentler decay than draft capital (ADP range is 1-360 vs 1-262).

    ADP 1 → 100.0, ADP 60 → 49.3, ADP 120 → 24.0
    """
    if not adp or adp < 1:
        return 0.0
    if decay_rate is None:
        decay_rate = ADP_SCORE_DECAY_RATE
    return 100.0 * math.exp(-decay_rate * (adp - 1))


def get_position_weight(position: str) -> float:
    """Get position weight modifier for recruit scoring."""
    return POSITION_WEIGHTS.get(position, DEFAULT_POSITION_WEIGHT)


def calc_recruit_score(
    draft_capital_score: Optional[float],
    espn_grade: Optional[float],
    position: str,
    is_drafted: bool,
    is_pre_draft: bool,
    startup_adp: Optional[float],
) -> float:
    """
    Calculate the composite Recruit Score for a prospect.
    Port of calcRecruitScore() from RecruitingBoard.gs.

    Post-draft: 50% ADP + 25% Draft Capital + 15% ESPN Grade + 10% Position
    Pre-draft:  80% ESPN Grade + 10% Position
    """
    pos_weight = get_position_weight(position)
    has_draft_capital = draft_capital_score is not None and draft_capital_score > 0

    if not is_pre_draft:
        # Post-draft scoring
        effective_adp = startup_adp if startup_adp else DEFAULT_ADP_FOR_SCORING
        adp_score = calc_adp_score(effective_adp)

        # Floor scores for missing data
        if has_draft_capital:
            effective_dc = draft_capital_score
        else:
            dc_rate = DRAFT_CAPITAL_DECAY_RATES.get(position, DRAFT_CAPITAL_DECAY_RATE)
            effective_dc = calc_draft_capital_score(DEFAULT_DRAFT_PICK, dc_rate)

        effective_grade = espn_grade if (espn_grade is not None and not math.isnan(espn_grade)) else DEFAULT_ESPN_GRADE

        raw = (adp_score * 0.50) + (effective_dc * 0.25) + (effective_grade * 0.15) + (pos_weight * 10)
        return min(raw, 100.0)

    # Pre-draft scoring
    effective_grade = espn_grade if (espn_grade is not None and not math.isnan(espn_grade)) else DEFAULT_ESPN_GRADE
    raw = (effective_grade * 0.80) + (pos_weight * 10)
    return min(raw, 100.0)


def get_star_rating(score: float) -> int:
    """Convert a recruit score to a star rating using thresholds."""
    if score >= STAR_THRESHOLDS["fiveStar"]:
        return 5
    if score >= STAR_THRESHOLDS["fourStar"]:
        return 4
    if score >= STAR_THRESHOLDS["threeStar"]:
        return 3
    if score >= STAR_THRESHOLDS["twoStar"]:
        return 2
    return 1


def star_display(stars: int) -> str:
    """Generate a star display string (e.g., '★★★★☆')."""
    return "\u2605" * stars + "\u2606" * (5 - stars)
