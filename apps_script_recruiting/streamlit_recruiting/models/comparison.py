"""
Model comparison metrics and utilities.
Computes R², MAE, RMSE across the current model, gradient boosting, and replacement-level.
"""

import numpy as np
import pandas as pd
from typing import Optional


def calc_model_metrics(actual: list[float], predicted: list[float]) -> dict:
    """Calculate comparison metrics between actual and predicted prices."""
    if not actual or not predicted or len(actual) != len(predicted):
        return {"r2": 0, "mae": 0, "rmse": 0, "median_ae": 0, "n": 0}

    actual_arr = np.array(actual)
    predicted_arr = np.array(predicted)

    # Remove NaN pairs
    mask = ~(np.isnan(actual_arr) | np.isnan(predicted_arr))
    actual_arr = actual_arr[mask]
    predicted_arr = predicted_arr[mask]
    n = len(actual_arr)

    if n == 0:
        return {"r2": 0, "mae": 0, "rmse": 0, "median_ae": 0, "n": 0}

    residuals = actual_arr - predicted_arr
    ss_res = np.sum(residuals ** 2)
    ss_tot = np.sum((actual_arr - np.mean(actual_arr)) ** 2)

    r2 = (1 - ss_res / ss_tot) if ss_tot > 0 else 0
    mae = np.mean(np.abs(residuals))
    rmse = np.sqrt(np.mean(residuals ** 2))
    median_ae = np.median(np.abs(residuals))

    return {
        "r2": float(r2),
        "mae": float(mae),
        "rmse": float(rmse),
        "median_ae": float(median_ae),
        "n": int(n),
    }


def build_comparison_table(
    board_df: pd.DataFrame,
    current_prices: dict[str, float],
    gb_prices: dict[str, float],
    replacement_prices: dict[str, float],
    actual_prices: Optional[dict[str, float]] = None,
) -> pd.DataFrame:
    """
    Build a per-player comparison table across models.

    Returns DataFrame with: Player, Position, ADP, Actual, Current, GradientBoosting, Replacement
    """
    rows = []
    for _, player in board_df.iterrows():
        name = player.get("Player", "")
        row = {
            "Player": name,
            "Position": player.get("Position", ""),
            "ADP": player.get("StartupADP"),
            "Current": current_prices.get(name),
            "Multi-Feature": gb_prices.get(name),
            "Replacement": replacement_prices.get(name),
        }
        if actual_prices:
            row["Actual"] = actual_prices.get(name)
        rows.append(row)

    return pd.DataFrame(rows)
