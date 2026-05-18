# Plan: Add Methodology Descriptions Across the App

## Goal
Add collapsible explanations (via `st.expander`) that help team owners understand how players are scored, priced, and graded.

## Approach
Create a new `descriptions.py` module with all explanation text in one place, then import specific keys into each UI file. This avoids duplication and makes future methodology changes a single-file update.

## Changes

### 1. New file: `streamlit_recruiting/descriptions.py`
A `DESCRIPTIONS` dictionary with plain-language text blocks keyed by topic:
- `recruit_score` — what drives the 0-100 score (ADP 50%, Draft Capital 25%, ESPN Grade 15%, Position 10%; pre-draft variant)
- `star_ratings` — thresholds (5★ ≥75, 4★ ≥50, 3★ ≥25, 2★ ≥10)
- `adp_regression` — brief: fits price vs ADP trend line, ESPN grade adjustment, fallback buckets
- `gradient_boosting` — brief: ML model using 7 features simultaneously
- `replacement_level` — brief: distributes budget by value-above-replacement
- `confidence_labels` — High/Medium/Low/Very Low and what drives them
- `price_range` — 25th-to-75th percentile band meaning
- `adp_regression_detail` — detailed version for Pricing Predictor (R², fallback system, grade adjustment)
- `gradient_boosting_detail` — detailed version (200 trees, 7 features, cross-validation, feature importance)
- `replacement_level_detail` — detailed version (replacement thresholds, VAR, budget distribution)
- `copy_scarcity_detail` — conference budgets + copy discount curve (elite/mid/flier tiers)
- `class_score` — what ClassScore represents
- `overall_grade` — z-score curve → letter grades (A+ top 10% through F bottom 5%)
- `efficiency_grade` — based on AvgSavings z-score, separate from class quality
- `savings` — predicted price minus actual bid, positive = bargain, negative = overpay

### 2. `tabs/board.py` — after KPI row (line 60), before search input
- Single expander: "How are players scored and rated?"
- Contains: `recruit_score` + `star_ratings`

### 3. `modals/player_deep_dive.py` — end of `_render_board_context()` (after price source caption ~line 289)
- Single expander: "How are prices estimated?"
- Contains: `adp_regression`, `gradient_boosting`, `replacement_level`, `confidence_labels`

### 4. `tabs/pricing_predictor.py` — inside existing 3 model expanders + 1 new expander
- Insert methodology paragraph at the top of each existing expander (lines 164, 172, 181), before the metrics
- Add 4th expander "Copy & Scarcity Pricing" after the replacement-level expander
- Uses: `adp_regression_detail`, `gradient_boosting_detail`, `replacement_level_detail`, `copy_scarcity_detail`

### 5. `tabs/class_grades.py` — after KPI row (line 72), before league overview
- Single expander: "How are class grades calculated?"
- Contains: `class_score`, `overall_grade`, `efficiency_grade`

### 6. `modals/team_deep_dive.py` — after star composition bar (line 129), before separator
- Single expander: "How are value and efficiency measured?"
- Contains: `savings`, `efficiency_grade`
