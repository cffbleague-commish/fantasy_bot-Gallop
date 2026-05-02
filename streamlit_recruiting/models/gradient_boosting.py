"""
Option 2: Multi-feature historical auction price prediction.
Uses gradient boosting on multiple features instead of single-variable ADP regression.
"""

import math
import pandas as pd
import numpy as np
import streamlit as st
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score
from typing import Optional

from models.config import (
    POSITIONS, ADP_SCORE_DECAY_RATE, DRAFT_CAPITAL_DECAY_RATES,
    DRAFT_CAPITAL_DECAY_RATE, DEFAULT_ADP, DEFAULT_ESPN_GRADE,
)
from models.scoring import calc_adp_score, calc_draft_capital_score
from utils.parsing import normalize_name


def _derive_copy_number(auction_df: pd.DataFrame) -> pd.Series:
    """
    Derive copy number from auction data.
    Within each (PlayerID, Conference, AuctionYear) group,
    rank bids descending: highest bid = Copy 1, second = Copy 2.
    """
    return auction_df.groupby(
        ["PlayerID", "Conference", "AuctionYear"]
    )["BidAmount"].rank(method="first", ascending=False).astype(int)


def _build_feature_matrix(
    auction_df: pd.DataFrame,
    adp_df: pd.DataFrame,
    espn_df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series]:
    """
    Build feature matrix from historical auction + ADP + ESPN data.

    Features per auction record:
    - adp_score: exponential decay of ADP
    - espn_grade: ESPN prospect grade
    - draft_capital_score: exponential decay of draft pick (position-specific)
    - position_QB/RB/WR/TE: one-hot encoded position
    - copy_number: 1 = first sold, 2 = second sold in conference
    """
    rookies = auction_df[auction_df["IsRookie"]].copy()
    rookies = rookies[rookies["Position"].isin(POSITIONS)]

    if rookies.empty:
        return pd.DataFrame(), pd.Series()

    # Add copy number
    rookies["CopyNumber"] = _derive_copy_number(rookies)

    # Build ADP lookup
    adp_lookup = {}
    for _, row in adp_df.iterrows():
        if pd.isna(row.get("ADP")) or not row.get("Player"):
            continue
        name = normalize_name(row["Player"])
        year = str(row.get("Year", ""))
        adp_lookup[f"{name}|{year}"] = row["ADP"]
        if name not in adp_lookup:
            adp_lookup[name] = row["ADP"]

    # Build ESPN lookup
    espn_lookup = {}
    for _, row in espn_df.iterrows():
        name = normalize_name(row.get("PlayerName", ""))
        if not name:
            continue
        year = str(row.get("DraftYear", ""))
        grade = row.get("Grade")
        if grade is not None and not pd.isna(grade):
            espn_lookup[f"{name}|{year}"] = grade
            if name not in espn_lookup:
                espn_lookup[name] = grade

    # Build features
    features = []
    target = []

    for _, r in rookies.iterrows():
        name = normalize_name(r["PlayerName"])
        year_key = f"{name}|{int(r['AuctionYear'])}"

        # ADP score
        adp = adp_lookup.get(year_key) or adp_lookup.get(name)
        adp_score = calc_adp_score(adp, ADP_SCORE_DECAY_RATE) if adp else calc_adp_score(DEFAULT_ADP, ADP_SCORE_DECAY_RATE)

        # ESPN grade
        grade = espn_lookup.get(year_key) or espn_lookup.get(name)
        if grade is None or pd.isna(grade):
            grade = DEFAULT_ESPN_GRADE

        # Draft capital score (position-specific decay)
        from utils.parsing import parse_overall_pick
        overall_pick = parse_overall_pick(r["DraftPick"], r["DraftRound"])
        dc_rate = DRAFT_CAPITAL_DECAY_RATES.get(r["Position"], DRAFT_CAPITAL_DECAY_RATE)
        dc_score = calc_draft_capital_score(overall_pick, dc_rate) if overall_pick else 0

        features.append({
            "adp_score": adp_score,
            "espn_grade": grade,
            "draft_capital_score": dc_score,
            "copy_number": r["CopyNumber"],
            "pos_QB": 1 if r["Position"] == "QB" else 0,
            "pos_RB": 1 if r["Position"] == "RB" else 0,
            "pos_WR": 1 if r["Position"] == "WR" else 0,
            "pos_TE": 1 if r["Position"] == "TE" else 0,
        })
        target.append(r["BidAmount"])

    return pd.DataFrame(features), pd.Series(target, name="BidAmount")


@st.cache_resource
def train_gradient_boosting(
    _auction_df: pd.DataFrame,
    _adp_df: pd.DataFrame,
    _espn_df: pd.DataFrame,
) -> tuple[Optional[GradientBoostingRegressor], dict]:
    """
    Train a gradient boosting model on historical auction data.
    Cached via st.cache_resource (persists across reruns).

    Returns (model, metrics_dict) or (None, {error: message}).
    """
    X, y = _build_feature_matrix(_auction_df, _adp_df, _espn_df)

    if X.empty or len(X) < 20:
        return None, {"error": f"Insufficient training data ({len(X)} rows, need 20+)"}

    model = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        min_samples_split=5,
        min_samples_leaf=3,
        random_state=42,
    )

    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=min(5, len(X) // 10), scoring="neg_mean_absolute_error")

    # Train on full data
    model.fit(X, y)
    y_pred = model.predict(X)

    # Feature importances
    feature_names = X.columns.tolist()
    importances = dict(zip(feature_names, model.feature_importances_))

    metrics = {
        "r2": r2_score(y, y_pred),
        "mae": mean_absolute_error(y, y_pred),
        "rmse": float(np.sqrt(np.mean((y - y_pred) ** 2))),
        "cv_mae": float(-cv_scores.mean()),
        "cv_mae_std": float(cv_scores.std()),
        "n_train": len(X),
        "feature_importances": importances,
        "feature_names": feature_names,
    }

    return model, metrics


def predict_gb(
    model: GradientBoostingRegressor,
    position: str,
    startup_adp: Optional[float],
    espn_grade: Optional[float],
    overall_pick: Optional[int],
    copy_number: int = 1,
) -> float:
    """Predict price for a single player using the trained GB model."""
    if model is None:
        return 0.0

    adp = startup_adp if startup_adp else DEFAULT_ADP
    adp_score = calc_adp_score(adp, ADP_SCORE_DECAY_RATE)

    grade = espn_grade if (espn_grade is not None and not math.isnan(espn_grade)) else DEFAULT_ESPN_GRADE

    dc_rate = DRAFT_CAPITAL_DECAY_RATES.get(position, DRAFT_CAPITAL_DECAY_RATE)
    dc_score = calc_draft_capital_score(overall_pick, dc_rate) if overall_pick else 0

    features = pd.DataFrame([{
        "adp_score": adp_score,
        "espn_grade": grade,
        "draft_capital_score": dc_score,
        "copy_number": copy_number,
        "pos_QB": 1 if position == "QB" else 0,
        "pos_RB": 1 if position == "RB" else 0,
        "pos_WR": 1 if position == "WR" else 0,
        "pos_TE": 1 if position == "TE" else 0,
    }])

    return max(0, round(model.predict(features)[0]))
