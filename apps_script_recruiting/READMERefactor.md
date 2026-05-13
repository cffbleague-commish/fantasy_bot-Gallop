# CFFB Recruiting — Design & Refactor Brief

A Streamlit app for fantasy college football recruiting auction analytics. This document is both the design specification for Claude Design (visual references, components, layouts) and the engineering specification for Claude Code (architecture, file structure, implementation rules). Hand this README to either tool alongside captured visual references and they should produce work that integrates cleanly.

---

## 1. Product Overview

The app supports a fantasy college football recruiting auction league through four stages of user activity:

1. **Research** — Browse and evaluate available college players. Tab: **Board**.
2. **Prepare** — Predict what each player will fetch in the auction. Tab: **Pricing Predictor**.
3. **Execute** — Track an in-progress auction live, or explore historical auctions. Tab: **Live Auction**.
4. **Evaluate** — Review completed classes and team-level outcomes. Tab: **Class Grades**.

The differentiated value of the app is its **auction context**: it pairs recruiting-site-style player data (similar to 247Sports and On3) with proprietary historical auction pricing from the user's specific fantasy league. No public recruiting site has this combination.

The app is read-only with respect to the auction itself — users do not bid inside the app. The auction happens on a separate fantasy site, and the app mirrors auction data via API callouts and a Google Sheet backing store.

---

## 2. Tech Stack & Architectural Rules

### Stack

- **Frontend & app runtime:** Streamlit (Python).
- **Data source:** Google Sheets, accessed via `st.connection` with the `streamlit-gsheets-connection` package, supplemented by direct API callouts to the fantasy site for live auction data.
- **Visualization:** Plotly for all charts (interactive, themable, first-class Streamlit integration via `st.plotly_chart`).
- **Caching:** `@st.cache_data(ttl=...)` on every data fetch function. Default TTL 300 seconds (5 minutes) for most data, 3-10 seconds for active Live Auction polling.
- **Live updates:** `st.fragment(run_every="3s")` for the Live Auction tab when the selected year is the current in-progress auction. All other tabs use standard rerun behavior.
- **Custom styling:** Global CSS injected once at app startup via `st.markdown(f'<style>{GLOBAL_CSS}</style>', unsafe_allow_html=True)`. Component-level HTML rendered via the same mechanism, lifted from Claude Design output where applicable.

### Architectural rules (non-negotiable)

1. **Claude Design HTML is a visual reference and a source of self-contained component snippets, NOT code to port verbatim.** The HTML/CSS exported from Claude Design should be lifted as component snippets (small, isolated HTML chunks for things like player cards, star ratings, grade badges) and injected into Streamlit via `st.markdown`. Do not attempt to render full Claude Design pages as raw HTML inside Streamlit — Streamlit's layout primitives (`st.columns`, `st.tabs`, `st.dialog`) should structure the page, and custom HTML fills the visual elements Streamlit can't render natively.

2. **Modal pattern for all detail views.** Use `st.dialog(width="large")` for Player Deep Dive, Team Deep Dive, and any other "click to see more" interaction. Do not use dropdown selectors, separate pages, or session-state view swaps for detail content. The current Board uses a dropdown selector — replace it with `st.dialog`.

3. **Dashboard density discipline.** Every tab must place its most important information above the fold on a 1440×900 viewport. The canonical layout pattern is: KPI row at top (3-6 metric tiles via `st.columns`) → filter strip → two-column main content area (60/40 or 65/35 split) → optional supporting detail below the fold. Stacked single-column scrolling layouts are forbidden for primary content.

4. **Shared component vocabulary.** Every tab uses the same components from `components.py`. Do not inline custom HTML for things like star ratings, player cards, grade badges, or value deltas inside tab files. If a new component is needed, add it to `components.py` first and import it.

5. **Cache everything that calls an API or reads a Sheet.** Uncached data calls in render functions are forbidden. If data is needed live, use a fragment with a short TTL on the cached fetch.

6. **Year selector behavior.** Two distinct year concepts in this app: **Draft Year** (which auction year's data to view) and **League Year** (the current fantasy league year, mostly informational). Board and Class Grades use the Draft Year selector. Live Auction also uses Draft Year (selecting a past year shows historical data; selecting the current year shows live data). Pricing Predictor uses the League Year as a backdrop and the Draft Year for model targets. Document this on the sidebar exactly as the current app does ("Board & Recruiting use the draft year selector. Other tabs use the league year.") with the renames applied.

---

## 3. Shared Design System

The visual identity is **College Football Playoff-inspired, dark mode, lighter touch**. This means: keep the existing dark base, upgrade the gold accent to Championship Gold (with selective use of a metallic gradient on hero elements), add a wide display font for headings while keeping Inter for body text, and skip the bracket motif decoration that appears in CFP's broadcast graphics. The aesthetic should evoke a premium sports broadcast (think ESPN College GameDay graphics, CFP National Championship broadcast lower-thirds) rather than a data notebook.

Three substantive upgrades from the current app, no custom graphic elements to maintain:
1. Upgrade flat gold accent to Championship Gold (with gradient on hero elements only).
2. Add a wide condensed display font for H1/H2/KPI values; keep Inter for body and tables.
3. Tighten the color palette around true matte black + Championship Gold, with desaturated value-delta and grade colors that live comfortably alongside the gold.

**Important:** Do not use the actual CFP logo, wordmark, or trademarked assets anywhere in the app. The aesthetic is inspired by the broadcast/branding language, not a license to reproduce it.

Claude Code should write `styles.py` to encode the tokens below, and Claude Design should set up its design system to match these tokens during onboarding.

### Color tokens

- **Background (primary):** True matte black, `#0A0A0A`. Slightly deeper than Streamlit's default `#0E1117` to evoke CFP's broadcast black aesthetic. Override Streamlit's default via `.streamlit/config.toml` and global CSS.
- **Surface (cards, tables, modals):** `#141414`. One step lighter than background.
- **Surface elevated (KPI tiles, hover states):** `#1C1C1C`. Two steps lighter, used for elements that should appear "lifted" off the background.
- **Border / divider:** `#2A2A2A`. Just visible against the surface, never against the background.
- **Text (primary):** `#F5F5F5`. Slightly warmer than pure white to harmonize with the gold.
- **Text (secondary / muted):** `#9A9A9A`. Used for labels, captions, timestamps.
- **Text (tertiary / disabled):** `#5A5A5A`. Used sparingly for placeholder or disabled state.

**Championship Gold system:**
- **Gold (flat / primary accent):** `#C9A227`. Warm, slightly brassy, saturated. Used for star ratings (5★ tier), active tab underline, links, secondary accents, table sort indicators, and most everyday gold needs.
- **Gold (light / highlight):** `#E8C547`. The brighter end of the gradient. Used on hover states for gold elements.
- **Gold (dark / shadow):** `#8B6F1F`. The darker end of the gradient. Used in gradient mid-stops and on pressed/active button states.
- **Gold gradient (Championship Gold):** `linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%)`. The metallic sheen. **Use sparingly — maximum one or two elements per page.** Reserve for: hero KPI tile values (current bid, total spent in Live Auction; top score in Class Grades), the active tab indicator underline, A-tier grade badges in Class Grades, the LIVE indicator border ring.

**Star tier colors** (used in `render_star_rating`):
- 5★: Championship Gold flat (`#C9A227`).
- 4★: Deep blue, `#3B82C4`. Slightly desaturated against the warm gold.
- 3★: Light blue, `#7BA4C9`.
- 2★ and below: Neutral gray `#6A6A6A`.

**Grade colors** (used in `render_grade_badge`):
- A+ / A: Deep green `#2D7A4E`. Desaturated forest tone — not Streamlit-success green.
- B+ / B: Lighter green `#4A9968`.
- C+ / C: Championship Gold flat `#C9A227`. The middle of the scale lands on the brand accent.
- D / F: Brick red `#B84545`. Desaturated to harmonize with the palette.

**Value delta colors** (used in `render_value_delta`):
- Positive (under-paid, good value): `#2D7A4E` (matches the A-grade green for visual consistency).
- Negative (over-paid): `#B84545` (matches the F-grade red).
- Neutral / zero: Muted gray `#9A9A9A`.

**Live indicator:** Pulsing green dot, `#2D7A4E` at peak, fading to ~25% opacity, 1.5-second cycle. Surrounded by a thin Championship Gold gradient ring (the gold gradient applied to a 1px border on a circular wrapper, ~24px diameter).

### Typography

The typography is where the CFP feel lives most. A wide condensed display face for headers and large numeric values, paired with Inter for body and tabular data.

- **Display font (headings, large KPI values):** **Saira Condensed** (Google Fonts), weights 600 (semibold) and 700 (bold). Wide, geometric, slightly futuristic — visually adjacent to CFP's "Video" typeface without licensing concerns. Used for: H1 page titles, H2 section headers, large KPI tile values (the big numbers, not their labels), team name in detail modals, hero player name in Player Deep Dive.
- **Body font (everything else):** **Inter** (Google Fonts), weights 400 (regular), 500 (medium), 600 (semibold). Used for: body text, table cells (including numeric cells), KPI tile labels, captions, form controls, button text, navigation.
- **Both fonts loaded via Google Fonts** in the `<head>` (injected via Streamlit's component HTML or in the global CSS via `@import`). Pin specific weights to avoid loading the full family.

**Type scale:**
- H1 (page title, e.g. "2024 Recruiting Dashboard"): Saira Condensed 700, 2.5rem, letter-spacing -0.01em.
- H2 (section header, e.g. "2024 Recruiting Class Leaderboard"): Saira Condensed 600, 1.625rem.
- H3 (subsection): Inter 600, 1.125rem.
- Body: Inter 400, 1rem, line-height 1.5.
- Caption / muted: Inter 400, 0.875rem.
- KPI tile value (large number): Saira Condensed 700, 2.25rem, with `font-variant-numeric: tabular-nums`.
- KPI tile label (above the value): Inter 500, 0.875rem, color `#9A9A9A`, letter-spacing 0.02em, uppercase optional.
- Table headers: Inter 600, 0.8125rem, letter-spacing 0.03em, uppercase. Color `#9A9A9A`.
- Table body cells: Inter 400, 0.9375rem.
- Numeric table cells: Inter 500, 0.9375rem, `font-variant-numeric: tabular-nums`.

**Tabular numbers:** Use `font-variant-numeric: tabular-nums` on every numeric cell, KPI value, and price display in the app. Digit alignment matters for the dashboard feel.

### Spacing

- Base unit: 8px. All padding, margins, and gaps use multiples of 8 (8, 16, 24, 32, 48, 64).
- KPI tile internal padding: 20px vertical, 24px horizontal.
- KPI row gap (between tiles): 16px.
- Table row padding: 12px vertical, 16px horizontal.
- Section margin (between KPI row and main content): 32px.
- Tab content top padding (below tab strip): 24px.
- Modal padding: 32px all sides; modal header bottom margin 24px.

### Component visual treatment notes

- **KPI tiles** sit on `#1C1C1C` (surface elevated) with no border. Label on top in muted gray uppercase, value below in Saira Condensed large. The **single most important KPI on each tab** (e.g., Total Spent on Live Auction; top team's Score on Class Grades) gets the Championship Gold gradient applied to the value. All other tile values are in primary text color.
- **Active tab indicator** is a 2px Championship Gold gradient underline beneath the active tab label. Inactive tabs have no underline, label color `#9A9A9A`. Active tab label color `#F5F5F5`.
- **Tables** use surface color `#141414` for the table background, no row borders (separation by spacing only), header row uses uppercase Inter 600 caps in muted gray, sortable column headers get a small flat gold sort indicator (↑/↓) when active.
- **Buttons (primary):** Background flat gold `#C9A227`, text near-black, no border. Hover: lift to light gold `#E8C547`. Active: dark gold `#8B6F1F`.
- **Buttons (secondary):** Transparent background, 1px border `#2A2A2A`, text `#F5F5F5`. Hover: border becomes flat gold, text stays.
- **Modals (`st.dialog`)** use surface color `#141414` for the modal panel, with a subtle 1px gold gradient border (very thin — the gradient is barely visible, just enough to feel premium). Background overlay behind modal is rgba(0,0,0,0.7).
- **Section dividers** are plain 1px horizontal lines in `#2A2A2A`. No decorative terminators.

### Canonical components

These live in `components.py` as Python functions that return HTML strings or render directly via `st.markdown`. Every tab uses them.

- **`render_star_rating(stars: float)`** — 1-5 star display with half-star support. Filled stars use the tier color (5★ gold, 4★ blue, etc.).
- **`render_player_card(player: Player, compact: bool = False)`** — Player photo (or position-colored avatar fallback), name, position, school, star rating, predicted price. Compact variant for table rows; expanded variant for modal headers.
- **`render_team_logo(team_id: str, size: int = 24)`** — Circular cropped team logo with consistent sizing.
- **`render_grade_badge(grade: str)`** — Letter grade pill (A+, A, B+, etc.) with the grade-color scale background.
- **`render_value_delta(delta: float)`** — Dollar value delta with arrow icon and green/red coloring. Used in Class Grades and Player Deep Dive.
- **`render_commit_composition_bar(stars: dict)`** — Horizontal stacked bar showing 5★/4★/3★/2★ proportions for a team's class. Used on Class Grades leaderboard rows and team detail modal.
- **`render_rank_badge(rank: int, trend: int | None = None)`** — Large rank number with optional up/down trend indicator.
- **`render_conference_badge(conf: str)`** — Conference abbreviation pill (SEC, B12, B10, etc.) with conference-specific accent color.
- **`render_live_indicator()`** — Pulsing green dot + "LIVE" label, used on Live Auction tab when current year is selected.
- **`render_kpi_tile(label: str, value: str, delta: str | None = None)`** — Standard KPI metric tile. Use instead of `st.metric` for visual consistency with the rest of the app.

### Interaction patterns

- **Detail views:** `st.dialog(width="large")`. Modal contains: optional close button (Streamlit provides), title row, content. For rich content (Player Deep Dive, Team Deep Dive), use a KPI row at the top of the modal followed by a two-column or tabbed layout — the same density rules as full pages apply inside modals.
- **Filters:** Sidebar for global filters that affect all tabs (Draft Year, Position, Conference). Inline filter strip at the top of a tab for tab-specific filters.
- **Sortable tables:** Use `st.dataframe` with `column_config` for native sortability when the visual matches the design system after CSS overrides. For tables that need richer visual treatment (logos, star ratings, grade badges, value deltas), render as custom HTML and provide sort controls as separate widgets above the table.
- **Above-the-fold rule:** A user on a 1440×900 laptop should see the primary content of every tab without scrolling. If a tab's primary content does not fit, restructure with `st.columns` and `st.tabs` until it does.

---

## 4. Data Model

The data lives in a Google Sheet with multiple worksheets, plus live API callouts to the fantasy site for in-progress auction data. The structure below should be confirmed against the actual sheet; correct the README with the real column names where they differ.

### Worksheets (expected)

- **`players`** — One row per recruit. Columns: `player_id`, `name`, `position`, `class_year`, `college`, `conference`, `star_rating`, `composite_score`, `height`, `weight`, `hometown`, `high_school`, `photo_url`, `rivals_rank`, `247_rank`, `espn_rank`, `on3_rank`.
- **`auction_transactions`** — One row per transaction event. Columns: `timestamp`, `draft_year`, `event_type` (Bid / Nomination / Won), `player_id`, `copy_number`, `franchise`, `conference`, `bid_amount`, `note`, `rookie_flag`.
- **`teams`** — One row per fantasy franchise per year. Columns: `franchise_id`, `franchise_name`, `conference`, `draft_year`, `budget_total`, `budget_spent`, `budget_remaining`, `roster_count`, `logo_url`.
- **`class_grades`** — One row per franchise per draft year, with the team's auction-class outcome metrics. Columns: `franchise_id`, `draft_year`, `rank`, `grade`, `score`, `stars_5`, `stars_4`, `stars_3`, `stars_2`, `stars_1`, `players`, `spent`, `efficiency`, `avg_savings`.
- **`predictions`** — Output of the pricing model. Columns: `player_id`, `draft_year`, `predicted_price`, `prediction_interval_low`, `prediction_interval_high`, `model_version`, `predicted_at`.

### Python schema layer

In `data.py`, expose typed fetch functions for each entity:

```python
@st.cache_data(ttl=300)
def get_players(draft_year: int) -> pd.DataFrame: ...

@st.cache_data(ttl=300)
def get_transactions(draft_year: int) -> pd.DataFrame: ...

@st.cache_data(ttl=300)
def get_teams(draft_year: int) -> pd.DataFrame: ...

@st.cache_data(ttl=300)
def get_class_grades(draft_year: int) -> pd.DataFrame: ...

@st.cache_data(ttl=300)
def get_predictions(draft_year: int) -> pd.DataFrame: ...

# For live auction polling, a shorter TTL
@st.cache_data(ttl=10)
def get_live_transactions(draft_year: int) -> pd.DataFrame: ...
```

All UI code reads from these functions. No tab module should call the Google Sheets API or fantasy site API directly.

---

## 5. Tab Specifications

### 5.1 Board

**Purpose:** Research mode. The master player list. Users browse, filter, and drill into individual players.

**Layout (above the fold on 1440×900):**
- KPI row (4 tiles): Total Players, 5-Stars, 4-Stars, Avg Composite Score (filtered).
- Filter strip: search box (player name or college), with sidebar global filters (year, position, conference) already in place.
- Main content: full-width sortable table.

**Table columns:** `#` (rank), Stars (visual), Player, Pos, College (with logo), Score, Predicted Price.

**Interaction:**
- Click a player row → opens Player Deep Dive in a `st.dialog(width="large")` modal.
- Sort by any column.
- Search filters table live as user types.

**Components used:** `render_star_rating`, `render_team_logo`, `render_kpi_tile`. Predicted price column links the user's thinking to the Pricing Predictor tab.

**Implementation notes:** Use `st.dataframe` with `column_config` if visual matches design system; otherwise render custom HTML table. The current dropdown selector for player detail is replaced by the modal-on-click pattern. Selection state stored in `st.session_state['board_selected_player']`.

### 5.2 Pricing Predictor

**Purpose:** Preparation mode. Surface the existing pricing model's predictions in a visually clean dashboard.

This section is intentionally directional until a screenshot of the existing Models tab is provided. The architectural and visual rules below apply regardless of model specifics.

**Layout (above the fold on 1440×900):**
- KPI row (4-5 tiles): Model R² or MAE (whatever your fit metric is), Total Predictions, Avg Predicted Price, Sample Size (historical training data count), Last Trained timestamp.
- Filter strip: position, conference, star rating range, predicted price range.
- Main content: two-column split.
  - Left (60%): Predictions table — player, position, school, star rating, predicted price, prediction interval (low–high), historical avg for comparable players.
  - Right (40%): Stacked panels — top panel a scatter plot of predicted price vs. composite rating (with trend line); middle panel a distribution histogram of predicted prices by tier; bottom panel a "biggest value gaps" mini-list (players whose predicted price seems unusually low relative to rating).

**Interaction:**
- Click a player row → modal Player Deep Dive (same modal as Board).
- Filters apply to all panels simultaneously.

**Components used:** `render_player_card` (compact), `render_star_rating`, `render_kpi_tile`. Plotly for the scatter and histogram.

**Open design questions (resolve when Models screenshot is shared):**
- Do you have multiple models, and should the tab show model agreement/disagreement?
- Is there a "value finder" view that should be a sub-tab here (now that the standalone Value Finder tab is dropped)?
- How do you currently surface model confidence — point estimates, intervals, or distributions?

### 5.3 Live Auction

**Purpose:** Execution mode. For the in-progress current-year auction, this tab is a live tracker. For past years, it's a historical transactions explorer. Same tab, two modes.

**Mode detection:** If the selected Draft Year matches the configured current league year, the tab renders in **live mode** with active polling and live-indicator UI. Otherwise it renders in **historical mode** with no polling, no live indicator.

**Layout (above the fold on 1440×900) — applies to both modes:**
- Header row: tab title, plus live indicator (`render_live_indicator()`) only in live mode.
- KPI row (6 tiles, exactly as the current app has): Total Events, Completed, Total Spent, Avg Win, Highest Win, Rookie Wins.
- Filter strip: Transaction Type, Position, Conference, Player Type — all on one row.
- Time range slider — compress to one line below the filter strip (not its own section).
- Main content: two-column split.
  - Left (60%): Auction Activity Over Time scatter plot (current chart, but properly sized at ~60% width instead of full-width).
  - Right (40%): Stacked panels — top panel three small metric tiles (Bid count, Nomination count, Won count for current filter); middle panel a small horizontal bar chart showing top 5 highest wins; bottom panel a small distribution chart showing bid amount histogram for current filter.

**Below the fold:**
- Recent Transactions table — the existing table, full-width below the main dashboard area. In live mode, new rows animate in from the top via CSS slide-in. In historical mode, no animation.

**Interaction:**
- Click a player name in the Recent Transactions table → modal Player Deep Dive.
- Click a team/franchise → modal Team Deep Dive (jumps the user contextually toward Class Grades).
- Time range slider filters all panels including the table.

**Live mode polish:**
- `st.fragment(run_every="3s")` wrapping the KPI row, main scatter, right column panels, and recent transactions table. The fragment fetches via `get_live_transactions()` with TTL=10s.
- Pulsing LIVE indicator in the header.
- Slide-in animation on new Recent Transactions rows (CSS keyframe, ~400ms slide from above with fade-in).
- "Last updated X seconds ago" timestamp in muted text in the header.
- Brief flash highlight (yellow background fading to transparent over 800ms) on KPI tile values when they change.

**Historical mode:**
- No fragment polling. Standard `@st.cache_data(ttl=300)` data fetch.
- No live indicator.
- No animations on table rows.

**Components used:** `render_player_card` (compact), `render_team_logo`, `render_kpi_tile`, `render_live_indicator`. Plotly for scatter, bar chart, histogram.

### 5.4 Class Grades

**Purpose:** Evaluation mode. Post-auction retrospective showing how each team's recruiting class graded out. Renamed from "Recruiting" tab — the current app's Recruiting tab is functionally Class Grades and should be relabeled accordingly.

**Layout (above the fold on 1440×900):**
- KPI row (4 tiles, matching current app): Teams Graded, Avg Class Score, Total 5-Stars, Total 4-Stars.
- Filter strip: conference filter (already in sidebar globally — confirm whether to keep there or add a quick-filter inline).
- Main content: two-column split.
  - Left (65%): Class Leaderboard table — Rank, Logo, Team, Conf, Grade (badge), Score, 5★/4★/3★/2★/1★ counts (consider replacing the five separate columns with a single `render_commit_composition_bar` cell to compress horizontal real estate), Players, Spent, Efficiency, Avg Savings.
  - Right (35%): Selected-team preview panel. When no team is selected, shows league-wide overview (grade distribution histogram, spend distribution, top-3 efficiency teams). When a team row is clicked, the right panel swaps to show that team's summary (logo, name, headline grade, total spent, total score, best value pick callout, biggest overpay callout) — quick context without opening a modal.

**Interaction:**
- Click a team row → right panel updates to that team's summary.
- "View full detail" link on the right panel summary → opens Team Deep Dive in `st.dialog(width="large")` modal.
- Sort by any leaderboard column.

**Team Deep Dive modal contents:**
- Header: team logo, name, headline grade, KPI row (total spent, total score, efficiency, rank).
- Below header: two-column layout inside modal.
  - Left: position-grouped commit list — for each position (QB, RB, WR, etc.) show a small header followed by the players acquired, each with star rating, price paid, predicted price, and value delta (color-coded).
  - Right: a scatter plot of composite rating (x-axis) vs. price paid (y-axis) for this team's picks, with the league-wide trend line overlaid. Picks above the trend line are over-pays; below are value buys.
- Below: best value pick callout and biggest overpay callout as two side-by-side highlight cards.

**Grading methodology (specify in code):**
- The three grade dimensions are: **Value Efficiency** (talent per dollar — headline grade shown in the leaderboard table), **Class Quality** (raw total talent), **Strategic Fit** (positional balance against ideal allocation).
- All three are computed and shown in the Team Deep Dive modal. Only Value Efficiency appears in the leaderboard table as the headline grade.
- Grading is z-score-within-league: each team's value differential is normalized against the league mean and standard deviation for that draft year, then mapped to letter grades (A+ = top 10%, A = next 15%, B+ = next 20%, B = next 25%, C+ = next 15%, C = next 10%, D/F = bottom 5%).

**Components used:** `render_team_logo`, `render_grade_badge`, `render_commit_composition_bar`, `render_value_delta`, `render_player_card` (compact, inside modal), `render_kpi_tile`. Plotly for the team scatter and the league-wide distributions.

### 5.5 Player Deep Dive (modal, not a tab)

**Purpose:** Per-player, per-copy auction history. Launched from the Board, Pricing Predictor, and Live Auction tabs via row click. Not a top-level destination.

**Layout (inside `st.dialog(width="large")`):**
- Header row: player photo + name + position + school + star rating (using `render_player_card` expanded variant).
- KPI row (5 tiles, matching current app): Total Copies, Sold, Available, Copies Nominated, Avg Price.
- Two-column area.
  - Left (50%): Conference availability table — Conference, Teams, Sold, Available, Status. Compact.
  - Right (50%): Small horizontal bar chart showing copies sold per conference.
- Below: tabbed section with two tabs.
  - Tab 1 "Copy Auction Summary" — the existing copy summary table (Copy #, Status, Nominated By, Opening Bid, # Bids, Max Bid, Winner, Won By, Winning Price, Conference, Duration).
  - Tab 2 "Bid History by Copy" — for each copy, a clean per-copy timeline visualization (Plotly horizontal timeline or a small scatter showing bid amounts over time within that copy's auction window). Replace the current expandable text-list treatment with this visual.

**Components used:** `render_player_card` (expanded), `render_team_logo`, `render_kpi_tile`, `render_value_delta`. Plotly for the per-conference bar and per-copy timelines.

**Implementation note:** The modal must fit comfortably without aggressive inside-modal scrolling. The two-column-plus-tabs layout is designed specifically to compress what is currently a long vertically stacked page into a denser modal-friendly form.

---

## 6. File Structure

```
cffb-recruiting/
├── app.py                       # Streamlit entry point, sidebar, tab dispatch
├── data.py                      # All cached data fetchers (Google Sheets, API)
├── components.py                # Shared component render functions
├── styles.py                    # GLOBAL_CSS constant; injected once at startup
├── models.py                    # Pricing model loading/inference (existing)
├── grading.py                   # Class grade calculations (z-score logic)
├── tabs/
│   ├── __init__.py
│   ├── board.py                 # def render() for Board tab
│   ├── pricing_predictor.py     # def render() for Pricing Predictor tab
│   ├── live_auction.py          # def render() for Live Auction (live + historical modes)
│   └── class_grades.py          # def render() for Class Grades tab
├── modals/
│   ├── __init__.py
│   ├── player_deep_dive.py      # @st.dialog for Player Deep Dive
│   └── team_deep_dive.py        # @st.dialog for Team Deep Dive
├── .streamlit/
│   ├── config.toml              # Theme config (font, primaryColor, backgroundColor)
│   └── secrets.toml             # Google Sheets credentials, fantasy site API key
└── README.md                    # This document
```

Each `tabs/<name>.py` module exposes a single `render()` function. `app.py` dispatches to it based on the active tab. Modals are decorated with `@st.dialog(width="large")` and called from inside tab render functions or via session state triggers.

---

## 7. Claude Design Handoff Notes

### Reference captures to make in Claude Design (web capture tool)

These references should be captured during Claude Design onboarding and used as visual references for the tabs noted:

1. **ESPN College GameDay broadcast graphics / CFP National Championship broadcast lower-thirds** — Primary reference for the overall aesthetic. Black/gold contrast, condensed display type, KPI tile treatment, hero number prominence. Drives the design system as a whole.
2. **CFP National Championship field design (black end zones with gold accents)** — Reference for the matte-black-plus-gold dominance and how restrained color application can still feel premium.
3. **247sports.com/season/2026-football/compositeteamrankings/** — Reference for: Class Grades leaderboard table density, star rating treatment, conference badge styling, ranking column treatment. Information density only — color and typography come from the CFP references above, not from 247.
4. **on3.com Industry Rankings page** — Reference for: Class Grades leaderboard, multi-source ranking comparison treatment (used in Player Deep Dive).
5. **On3 team commits page (any team)** — Reference for: Team Deep Dive position-grouped commit list, player row treatment.
6. **On3 or 247Sports player profile page** — Reference for: Player Deep Dive header content structure, player card expanded variant.
7. **DraftKings or FanDuel live odds page** — Reference for: Live Auction live-mode treatment of dynamic numeric data, dashboard density on data-heavy screens.

**Capture priority:** References 1 and 2 set the aesthetic. References 3-6 inform information architecture and density only — do not pull color or typography from them since their light-mode recruiting-site palettes are not what the app is going for.

### Claude Design prompts (suggested)

**Design system setup prompt:**

> "Set up the design system for a fantasy college football recruiting auction app. The aesthetic is **College Football Playoff-inspired, dark mode, lighter touch** — premium sports broadcast feel (ESPN College GameDay graphics, CFP National Championship broadcast lower-thirds) rather than a data notebook. Do NOT use any actual CFP logos, wordmarks, or trademarked assets — this is inspiration only.
>
> The app is built in Streamlit (Python) with custom HTML injection for visual components.
>
> Color palette:
> - True matte black background `#0A0A0A`; surface cards `#141414`; elevated surface (KPI tiles) `#1C1C1C`; borders `#2A2A2A`.
> - Text: primary `#F5F5F5` (warm white), secondary `#9A9A9A`, tertiary `#5A5A5A`.
> - Championship Gold system: flat gold `#C9A227` (warm, brassy, saturated); light gold `#E8C547`; dark gold `#8B6F1F`; metallic gradient `linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%)`. Use the gradient sparingly — maximum one or two elements per page, reserved for the most important hero values.
> - Star tiers: 5★ Championship Gold, 4★ deep blue `#3B82C4`, 3★ light blue `#7BA4C9`, 2★ and below neutral gray.
> - Grade scale: A green `#2D7A4E`, B lighter green `#4A9968`, C Championship Gold, D/F brick red `#B84545`. All desaturated to harmonize with the warm gold.
> - Value deltas: positive green `#2D7A4E`, negative red `#B84545`. Live indicator: pulsing green dot with thin gold gradient ring.
>
> Typography:
> - Display font (H1, H2, large KPI values, hero player/team names): **Saira Condensed** weights 600 and 700. Wide condensed geometric sans, visually adjacent to CFP's 'Video' typeface.
> - Body font (body text, tables, labels, buttons): **Inter** weights 400, 500, 600.
> - All numeric cells and KPI values use `font-variant-numeric: tabular-nums`.
>
> Spacing: 8px base unit, all padding and margins multiples of 8.
>
> Establish components: PlayerCard (compact and expanded variants), StarRating (1-5 with half-stars and tier coloring), TeamLogo (circular crop), GradeBadge (letter grade pill with grade-color background, A-tier badges use the Championship Gold gradient), ValueDelta (dollar value with arrow and green/red), CommitCompositionBar (horizontal stacked bar by star tier), RankBadge, ConferenceBadge (conference-specific accent color per conference), LiveIndicator (pulsing dot with gold gradient ring + LIVE text in Saira Condensed), KpiTile (label in Inter uppercase muted gray, value in Saira Condensed large; primary hero KPI on each page uses Championship Gold gradient on the value).
>
> All components should be self-contained HTML+CSS blocks renderable standalone via st.markdown injection.
>
> Capture references from: ESPN College GameDay broadcast graphics; CFP National Championship broadcast lower-thirds and field designs (note the signature black/gold contrast); 247sports.com and on3.com for recruiting-site information density; DraftKings live odds pages for dashboard-density treatment of live numeric data."

**Per-tab prompts:** Generate one Claude Design project per tab using the spec in section 5 of this README as the prompt, with the captured references attached.

### Claude Code handoff readme (to accompany the design bundle)

When handing off from Claude Design to Claude Code, include this README plus the Claude Design export bundle. Tell Claude Code:

> "This is the design and engineering specification for the CFFB Recruiting Streamlit app refactor. The current app is live at https://cffb-recruiting.streamlit.app/. The refactor consolidates 7 tabs into 4 (Board, Pricing Predictor, Live Auction, Class Grades), standardizes on a modal pattern for detail views (Player Deep Dive, Team Deep Dive), and enforces dashboard density rules (KPI row + two-column main layout, above-the-fold discipline). Treat the Claude Design HTML as a visual reference and a source of self-contained component snippets, not as code to port directly. Use Streamlit layout primitives (st.columns, st.tabs, st.dialog) for page structure and inject component HTML via st.markdown. All data flows through cached fetchers in data.py — no direct API or Sheet access in tab modules. Implement tabs incrementally: Board first (proves the modal pattern and shared component vocabulary), then Class Grades (proves the dashboard density refactor), then Live Auction (proves the live/historical dual mode), then Pricing Predictor (depends on existing model code which should be preserved as-is in models.py)."

---

## 8. Build Sequencing

Recommended order for implementing the refactor:

1. **Establish the design system in code.** Write `styles.py` (GLOBAL_CSS) and `components.py` (all shared components). Confirm visually against the existing app before touching tabs.
2. **Refactor Board.** Smallest scope, validates the modal pattern and component vocabulary. Replace dropdown detail selector with `st.dialog` Player Deep Dive.
3. **Refactor Class Grades.** Renames from Recruiting tab. Adds Team Deep Dive modal. Implements the leaderboard + preview panel + modal pattern. Validates dashboard density refactor.
4. **Refactor Live Auction.** Implements the two-column dashboard layout, the live/historical dual mode, the fragment polling for live mode. Most complex single tab.
5. **Refactor Pricing Predictor.** Consolidates / replaces Models tab. Preserves existing model code in `models.py`. Layout per section 5.2.
6. **Remove dropped tabs.** Once new tabs are stable, remove Value Finder, Budget Tool, Team Needs from the tab dispatch.

Each step should be a separate PR. Do not refactor multiple tabs in a single change — the goal is incremental validation that the shared design system holds up across diverse tab types.

---

## 9. Open Items

These remain to be resolved and should be filled in as a v1.1 of this README:

- **Pricing Predictor specifics.** Awaiting screenshot of the current Models tab. The section 5.2 spec is directional until the existing model behavior is documented.
- **Google Sheet column names.** The data model in section 4 is the expected shape. Confirm against the actual sheet and correct any mismatches.
- **Grade thresholds.** The z-score-to-letter mapping in section 5.4 is a reasonable default but should be tuned against the actual distribution of historical class outcomes to produce a sensible grade distribution.
- **Conference accent colors.** Section 3 mentions conference-specific accent colors for the ConferenceBadge component but doesn't enumerate them. Define one color per major conference (SEC, B10, B12, ACC, P12, AAC, etc.) during design system setup. Keep these desaturated to live alongside Championship Gold.
- **Saira Condensed loading.** Confirm Google Fonts loading approach in Streamlit — the cleanest path is `@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap');` at the top of `GLOBAL_CSS`. Validate this works inside Streamlit's CSS injection mechanism on first build.
- **Trademark caution.** The aesthetic is CFP-inspired only. Do not include the literal CFP logo, the CFP wordmark, the stylized football, or any official CFP trademark assets in the app. The bracket motifs from CFP's branding are explicitly excluded from this design (see section 3 — "skip the bracket motif decoration"). If at any point the app's visual treatment starts to look like it's reproducing CFP brand assets rather than evoking the broadcast aesthetic, pull back.
