"""
Class grade calculations — z-score normalization within league,
letter grade mapping for recruiting class evaluation.
"""

import pandas as pd
import numpy as np


# Grade ladder — mirrors Apps Script applyGradeThresholds() in RecruitingGrades.gs.
# Thresholds are cumulative percentiles (0.0–1.0); thresholds in Apps Script use
# 0–100 minPct, so each minPct is divided by 100 here.
_GRADE_THRESHOLDS = [
    ("A+", 0.95), ("A", 0.90), ("A-", 0.85),
    ("B+", 0.75), ("B", 0.65), ("B-", 0.55),
    ("C+", 0.45), ("C", 0.35), ("C-", 0.25),
    ("D+", 0.15), ("D", 0.08), ("D-", 0.03),
    ("F",  0.00),
]


def _zscore_to_grade(z: float, n: int) -> str:
    """Convert a z-score to a letter grade using percentile thresholds.

    With small samples (n < 8), we use the z-score directly against
    standard normal percentiles. With larger samples, same logic applies.
    """
    from scipy.stats import norm  # type: ignore

    pct = norm.cdf(z)
    for grade, threshold in _GRADE_THRESHOLDS:
        if pct >= threshold:
            return grade
    return "F"


def compute_class_grades(grades_df: pd.DataFrame) -> pd.DataFrame:
    """Add letter grades via z-score normalization within the league.

    Expects columns: ClassScore, TotalSpent, AvgSavings
    Adds columns: OverallGrade (if not already computed by the sheet),
                  EfficiencyGrade (if not already computed)

    If grades are already present from the Google Sheet, this function
    preserves them and only fills missing values.
    """
    if grades_df.empty:
        return grades_df

    df = grades_df.copy()
    n = len(df)

    # Only compute grades if the sheet didn't already provide them
    if "OverallGrade" not in df.columns or df["OverallGrade"].isna().all():
        if "ClassScore" in df.columns and n >= 3:
            mean = df["ClassScore"].mean()
            std = df["ClassScore"].std()
            if std > 0:
                df["_z_class"] = (df["ClassScore"] - mean) / std
                try:
                    df["OverallGrade"] = df["_z_class"].apply(lambda z: _zscore_to_grade(z, n))
                except ImportError:
                    # scipy not available — use simple percentile-based fallback
                    df["OverallGrade"] = df["ClassScore"].rank(pct=True).apply(_pct_to_grade)
                df.drop(columns=["_z_class"], inplace=True)
            else:
                df["OverallGrade"] = "C"
        else:
            df["OverallGrade"] = "N/A"

    if "EfficiencyGrade" not in df.columns or df["EfficiencyGrade"].isna().all():
        if "AvgSavings" in df.columns and n >= 3:
            mean = df["AvgSavings"].mean()
            std = df["AvgSavings"].std()
            if std > 0:
                df["_z_eff"] = (df["AvgSavings"] - mean) / std
                try:
                    df["EfficiencyGrade"] = df["_z_eff"].apply(lambda z: _zscore_to_grade(z, n))
                except ImportError:
                    df["EfficiencyGrade"] = df["AvgSavings"].rank(pct=True).apply(_pct_to_grade)
                df.drop(columns=["_z_eff"], inplace=True)
            else:
                df["EfficiencyGrade"] = "C"
        else:
            df["EfficiencyGrade"] = "N/A"

    return df


def _pct_to_grade(pct: float) -> str:
    """Simple percentile-to-grade fallback (no scipy needed)."""
    for grade, threshold in _GRADE_THRESHOLDS:
        if pct >= threshold:
            return grade
    return "F"
