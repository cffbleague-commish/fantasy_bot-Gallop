"""
Methodology descriptions for the CFFB Recruiting Analytics dashboard.

Plain-language explanations of scoring, pricing, and grading systems.
Each key is a named block of markdown text. UI files import specific keys
and wrap them in st.expander() or st.caption() as needed.
"""

DESCRIPTIONS = {

    # ===== Board tab — Recruit Score + Star Ratings =====

    "recruit_score": """\
**Recruit Score (0-100)** measures how valuable a prospect is for your fantasy \
team. It blends multiple data points into a single number so you can compare \
players across positions.

**After the NFL Draft**, the score weights four factors:
- **Startup ADP (50%)** — Where the player is being drafted in dynasty startups. \
Lower ADP (drafted earlier) means the fantasy community values them more.
- **Draft Capital (25%)** — Where they were picked in the NFL Draft. \
First-round picks score much higher than Day 3 picks because early capital \
historically correlates with opportunity and production.
- **ESPN Scouting Grade (15%)** — ESPN's pre-draft prospect evaluation. \
A higher grade means better physical tools and college production.
- **Position Value (10%)** — A small bonus reflecting positional scarcity. \
WR and RB get full credit; QB and TE are slightly discounted since they are \
less scarce in our league format.

**Before the NFL Draft** (when we don't yet have ADP or draft capital), \
the score relies primarily on ESPN Grade (80%) plus the position adjustment (10%).

Both ADP and Draft Capital use "exponential decay" — the difference between \
pick 1 and pick 10 is much larger than the difference between pick 200 and \
pick 210. This reflects reality: early picks are worth dramatically more.\
""",

    "star_ratings": """\
**Star Ratings** are a quick visual shorthand based directly on the Recruit Score:

- **5 stars** — Score of 75 or higher (elite prospects)
- **4 stars** — Score of 50–74 (strong starters)
- **3 stars** — Score of 25–49 (solid contributors)
- **2 stars** — Score of 10–24 (depth pieces)
- **1 star** — Score below 10 (longshots)

These thresholds are fixed — they measure absolute quality, not relative rank. \
A weak draft class might have fewer 5-star players, and that is by design.\
""",

    # ===== Player Deep Dive — brief pricing model descriptions =====

    "adp_regression": """\
**ADP Regression** is the primary pricing model. It fits a trend line through \
historical auction prices plotted against each player's dynasty startup ADP. \
If a player with ADP 30 historically costs around $45, the model predicts \
similar players will cost about the same.

The model adjusts for ESPN scouting grades — a player with an above-average \
ESPN grade gets a price bump (up to +25%), and a below-average grade gets a \
discount (down to -25%). When ADP data is unavailable, it falls back to \
buckets based on draft pick, draft tier, or ESPN grade range.\
""",

    "gradient_boosting": """\
**Multi-Feature (Gradient Boosting)** is a machine learning model that \
considers multiple factors simultaneously rather than just ADP. It looks at \
ADP score, ESPN grade, draft capital, position, and copy number all at once \
to predict price.

It learns patterns that simpler models miss — for example, a TE with elite \
draft capital but mediocre ADP might be priced differently than the ADP \
model expects. The model trains on all historical auction results and is \
cross-validated to avoid overfitting.\
""",

    "replacement_level": """\
**Replacement-Level** takes a different approach: instead of predicting from \
historical prices, it distributes a conference's total auction budget based \
on each player's "value above replacement."

All positions share a fixed replacement threshold at ADP 240 (the end of \
typical startup rankings). Players beyond that threshold get $0. The \
remaining budget is split proportionally — the bigger your edge over the \
replacement level, the more you should be willing to pay.\
""",

    "confidence_labels": """\
**Confidence Labels** tell you how trustworthy a price estimate is:

- **High** — Strong sample size, tight price range, direct data match
- **Medium** — Decent data, moderate spread
- **Low** — Limited comparables or wide price spread
- **Very Low** — Sparse data; treat the estimate as a rough guess

Confidence is based on how many similar players we have historical data for, \
how tightly clustered their prices were, and whether the estimate came from \
a direct ADP match or a broader fallback bucket.\
""",

    # ===== Pricing Predictor — detailed model descriptions =====

    "adp_regression_detail": """\
**How it works:** For each position, we plot every historical rookie auction \
price against that player's dynasty startup ADP score (an exponential-decay \
transformation of raw ADP — ADP 1 maps to ~100, ADP 60 to ~49, ADP 120 to \
~24). Then we fit a straight-line regression through those points.

**Fallback system:** When ADP regression doesn't have enough data for a \
position, it tries progressively broader buckets:
1. **Per-pick** — other players drafted at the same NFL Draft slot
2. **Tier** — players in the same draft tier (e.g., "Early 2nd", "Mid 3rd")
3. **UDFA** — undrafted free agents as a group
4. **ESPN Grade Range** — players with a similar ESPN scouting grade

**Grade adjustment:** After getting a base price, the model nudges it up or \
down based on how the player's ESPN grade compares to the position average \
(capped at 25% either way).

**R-squared** (shown below) measures how well the trend line fits the data. \
Higher is better — above 0.5 is a strong fit for this kind of data.\
""",

    "gradient_boosting_detail": """\
**How it works:** This model uses 200 decision trees stacked on top of each \
other (gradient boosting), each one correcting the mistakes of the previous \
trees. It considers 7 features simultaneously:
- ADP score (dynasty startup ADP, exponential-decay transformed)
- ESPN scouting grade
- Draft capital score (NFL Draft pick, exponential-decay transformed)
- Copy number (1st or 2nd copy sold in a conference)
- Position (QB, RB, WR, or TE)

**Cross-validation:** The model is tested using 5-fold cross-validation — \
it trains on 80% of the data and predicts the other 20%, rotating 5 times. \
The CV MAE (mean absolute error) shown below tells you how far off the \
model's predictions typically are on data it hasn't seen.

**Feature Importance** (chart below) shows which inputs the model relies on \
most. ADP score typically dominates, but the other features provide \
meaningful corrections.\
""",

    "replacement_level_detail": """\
**How it works:** This is a budget-distribution model, not a regression. \
It answers: "If a conference has $X to spend on rookies, how should that \
money be split?"

1. A fixed replacement threshold of ADP 240 (the end of typical startup rankings) \
is used for all positions — players beyond that point are considered freely available.
2. For each player, we compute "Value Above Replacement" (VAR) = their ADP \
score minus the replacement-level score. Players at or below replacement \
get $0.
3. The total conference budget (based on historical spending averages) is \
divided proportionally by VAR across all players.
4. Each player's share is split into Copy 1 and Copy 2 prices using the \
copy discount curve.

**No training required** — this is a purely arithmetic model. The budget \
amounts come from historical conference spending averages.

---

**Live Mode Columns** (visible when Live is selected):

- **VAR** — Value Above Replacement score. Higher = more valuable relative \
to the ADP 240 replacement baseline.
- **Pool%** — The player's share of the remaining conference budget pool, \
weighted by VAR × copies still available.
- **Share** — Total dollar allocation for this player before the copy split \
(Pool% × remaining budget).
- **Copies** — How many copies remain unsold in the selected conference (max 2). \
Fewer remaining copies means more budget concentrates on each.
- **Replacement** — The projected next-copy price. If both copies remain, \
this is the Copy 1 price after applying the discount curve. If only one \
copy remains, the full share goes to that copy.

**Price Ceiling (Market Cap):** Prices are capped at the 2nd-highest \
remaining franchise budget in the conference. An auction needs at least \
two bidders to drive the price up, so no player can realistically exceed \
what the runner-up can afford. Any excess is redistributed proportionally \
to other players, which may push additional players to the cap — the \
model iterates until all prices stabilize.\
""",

    "copy_scarcity_detail": """\
**Conference Budgets:** Each conference auctions its own copies of every \
player. Historical data shows how much each conference typically spends \
total on rookies. Both the ADP Regression scarcity model and the \
Replacement-Level model use these budgets to determine each player's share.

**Copy Discount Curve:** When a player is auctioned a second time (Copy 2), \
the price is typically lower than Copy 1 because scarcity decreases. \
The discount depends on the player's price tier:
- **Elite players** (avg price $40+): Copy 2 is about 85% of Copy 1
- **Mid-tier players** (avg price $15–39): Copy 2 is about 65% of Copy 1
- **Flier-tier players** (avg price under $15): Copy 2 is about 75% of Copy 1

These ratios come from actual historical copy pairs when we have enough \
data (8+ pairs per tier). Otherwise we use the default ratios listed above.\
""",

    # ===== Class Grades tab =====

    "class_score": """\
**Class Score** is a team-level metric pulled from the league's official \
grading system. It reflects the overall quality of a team's recruiting \
class based on the prospects they acquired — factoring in star ratings, \
recruit scores, and class size.

Higher is better. The league average typically falls around the middle of \
the leaderboard, with elite classes scoring significantly above the mean.\
""",

    "overall_grade": """\
**Overall Grade** converts the Class Score into a letter grade using a \
league-wide curve. We compute each team's z-score (how many standard \
deviations above or below the league average) and map it to a percentile:

- **A+** — Top 10% of teams
- **A** — 75th to 90th percentile
- **B+** — 60th to 75th percentile
- **B** — 40th to 60th percentile (league average)
- **C** — 20th to 40th percentile
- **D** — 5th to 20th percentile
- **F** — Bottom 5% of teams

This is a relative grade — it compares you to other teams in the same \
draft class, not to an absolute standard.\
""",

    "efficiency_grade": """\
**Efficiency Grade** measures how well a team spent its auction budget, \
separate from the raw quality of players acquired.

It is based on **Average Savings** — the average difference between what \
a team was predicted to pay for each player and what they actually paid. \
Positive savings means the team consistently bought players below their \
expected price (bargain hunting). Negative means they overpaid.

The letter grade uses the same z-score curve as the Overall Grade, applied \
to Average Savings instead of Class Score. A team can have a mediocre class \
grade but an excellent efficiency grade if they got great deals on the \
players they did acquire.\
""",

    # ===== Team Deep Dive =====

    "savings": """\
**Savings** for each player is the difference between the predicted auction \
price and what the team actually paid:

- **Positive savings** means the team got a bargain — they paid less than \
the model expected.
- **Negative savings** means the team overpaid relative to the model's \
prediction.

**Best Value** is the player with the highest positive savings on the team. \
**Biggest Overpay** is the player with the most negative savings. These help \
identify the team's best and worst deals at a glance.\
""",

}
