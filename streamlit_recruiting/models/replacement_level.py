"""
Option 3: Replacement-Level Surplus Value pricing.
Prices players based on their value above a replacement-level baseline.
"""

import pandas as pd
from typing import Optional

from models.config import (
    POSITIONS, ADP_SCORE_DECAY_RATE, DEFAULT_ADP,
    COPIES_PER_CONFERENCE, COPY_DISCOUNT_BINS,
)
from models.scoring import calc_adp_score
from models.current_model import get_copy_discount_ratio


# Default replacement-level ADP per position (end of "Depth" tier)
# Configurable via UI sliders
DEFAULT_REPLACEMENT_ADP = {
    "QB": 240,
    "RB": 200,
    "WR": 200,
    "TE": 300,
}


def calc_var_score(
    adp: Optional[float],
    position: str,
    replacement_adps: dict = None,
) -> float:
    """
    Calculate Value Above Replacement (VAR) score for a player.

    VAR = max(0, playerADPScore - replacementADPScore)
    Players at or below replacement level get VAR = 0.
    """
    if replacement_adps is None:
        replacement_adps = DEFAULT_REPLACEMENT_ADP

    effective_adp = adp if adp else DEFAULT_ADP
    player_score = calc_adp_score(effective_adp, ADP_SCORE_DECAY_RATE)

    replacement_adp = replacement_adps.get(position, 200)
    replacement_score = calc_adp_score(replacement_adp, ADP_SCORE_DECAY_RATE)

    return max(0.0, player_score - replacement_score)


def calc_replacement_prices(
    board_df: pd.DataFrame,
    conference_budgets: dict,
    copy_discount_curve: dict,
    replacement_adps: dict = None,
    is_pre_draft: bool = False,
) -> pd.DataFrame:
    """
    Calculate replacement-level surplus value prices.

    For each player:
    1. Compute VAR = max(0, adpScore - replacementScore)
    2. Total VAR across all players × 2 copies
    3. Player's share = (VAR × 2 / totalVAR) × budget
    4. Split into Copy 1/Copy 2 using discount curve

    Returns DataFrame with: Player, var_score, copy1_16, copy2_16, copy1_20, copy2_20
    """
    if replacement_adps is None:
        replacement_adps = DEFAULT_REPLACEMENT_ADP

    if not conference_budgets:
        return pd.DataFrame()

    # Compute VAR for each player
    players = []
    for _, row in board_df.iterrows():
        name = row.get("Player") or row.get("name", "")
        position = row.get("Position") or row.get("position", "")
        adp = row.get("StartupADP") or row.get("startupADP")

        if is_pre_draft:
            # Use recruit score as proxy when no ADP available
            score = row.get("RecruitScore") or row.get("recruitScore") or 0
            var = max(0, score - 10)  # floor at 2-star threshold
        else:
            var = calc_var_score(adp, position, replacement_adps)

        players.append({"name": name, "position": position, "var": var})

    # Total VAR across all copies
    total_var = sum(p["var"] * COPIES_PER_CONFERENCE for p in players)
    if total_var <= 0:
        return pd.DataFrame()

    results = []
    sizes = sorted(int(s) for s in conference_budgets.keys())

    for p in players:
        entry = {"Player": p["name"], "var_score": round(p["var"], 2)}

        for size_str, budget in conference_budgets.items():
            size = int(size_str)
            if budget <= 0:
                continue

            if p["var"] <= 0:
                # Replacement-level players get $0
                if size == sizes[0]:
                    entry["copy1_16"] = 0
                    entry["copy2_16"] = 0
                if size == sizes[-1]:
                    entry["copy1_20"] = 0
                    entry["copy2_20"] = 0
                continue

            player_share = (p["var"] * COPIES_PER_CONFERENCE / total_var) * budget
            avg_copy_price = player_share / COPIES_PER_CONFERENCE

            ratio = get_copy_discount_ratio(avg_copy_price, copy_discount_curve, COPY_DISCOUNT_BINS)
            copy1 = player_share / (1 + ratio)
            copy2 = player_share * ratio / (1 + ratio)

            if size == sizes[0]:
                entry["copy1_16"] = max(0, round(copy1))
                entry["copy2_16"] = max(0, round(copy2))
            if size == sizes[-1]:
                entry["copy1_20"] = max(0, round(copy1))
                entry["copy2_20"] = max(0, round(copy2))

        results.append(entry)

    return pd.DataFrame(results)
