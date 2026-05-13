"""
CFFB Design System — Global CSS
College Football Playoff-inspired broadcast aesthetic. Dark mode, Championship Gold accents.
Injected once at app startup via inject_global_css().
"""

import streamlit as st


GLOBAL_CSS = """
/* ============================================================
   CFFB Design System — Global Stylesheet
   ============================================================ */

/* --- Fonts ------------------------------------------------- */
@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* === Surfaces ============================================ */
  --bg-canvas:         #0A0A0A;
  --bg-surface:        #141414;
  --bg-surface-elev:   #1C1C1C;
  --bg-surface-hover:  #1F1F1F;
  --border:            #2A2A2A;
  --border-strong:     #3A3A3A;

  /* === Text ================================================ */
  --fg-primary:        #F5F5F5;
  --fg-secondary:      #9A9A9A;
  --fg-tertiary:       #5A5A5A;

  /* === Championship Gold system ============================ */
  --gold:              #C9A227;
  --gold-light:        #E8C547;
  --gold-dark:         #8B6F1F;
  --gold-gradient:     linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%);

  /* === Star tiers ========================================== */
  --star-5: #C9A227;
  --star-4: #3B82C4;
  --star-3: #7BA4C9;
  --star-2: #6A6A6A;
  --star-1: #4A4A4A;

  /* === Grade scale ========================================= */
  --grade-a: #2D7A4E;
  --grade-b: #4A9968;
  --grade-c: #C9A227;
  --grade-d: #B84545;
  --grade-f: #B84545;

  /* === Value deltas ======================================== */
  --delta-pos: #2D7A4E;
  --delta-neg: #B84545;
  --delta-flat: #5A5A5A;

  /* === Live indicator ====================================== */
  --live: #2D7A4E;

  /* === Conferences ========================================= */
  --conf-sec:      #1A3668;
  --conf-sec-gold: #FFC72A;
  --conf-b1g:      #0088CE;
  --conf-acc:      #013CA6;
  --conf-big12:    #E81E2C;
  --conf-pac:      #003F87;
  --conf-aac:      #002855;
  --conf-aac-red:  #D52B1E;

  /* === Type families ======================================= */
  --font-display: 'Saira Condensed', 'Oswald', 'Bebas Neue', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;

  /* === Type scale ========================================== */
  --ds-hero: 64px;
  --ds-1:    48px;
  --ds-2:    32px;
  --ds-3:    24px;
  --ds-4:    18px;
  --tx-lg:   16px;
  --tx-md:   14px;
  --tx-sm:   13px;
  --tx-xs:   12px;
  --tx-2xs:  11px;

  /* === Weights ============================================= */
  --w-400: 400;
  --w-500: 500;
  --w-600: 600;
  --w-700: 700;

  /* === Spacing (8px base) ================================== */
  --s-1:    8px;
  --s-2:   16px;
  --s-3:   24px;
  --s-4:   32px;
  --s-5:   40px;
  --s-6:   48px;
  --s-7:   64px;
  --s-8:   80px;
  --s-half: 4px;

  /* === Radii =============================================== */
  --r-1: 2px;
  --r-2: 4px;
  --r-3: 8px;
  --r-4: 12px;
  --r-pill: 999px;

  /* === Shadows ============================================= */
  --shadow-sm:        0 1px 2px rgba(0,0,0,0.5);
  --shadow-md:        0 8px 24px rgba(0,0,0,0.6);
  --shadow-lg:        0 20px 60px rgba(0,0,0,0.7);
  --shadow-glow-gold: 0 0 24px rgba(201,162,39,0.28);
  --shadow-glow-live: 0 0 12px rgba(45,122,78,0.55);
  --inset-metallic:   inset 0 1px 0 rgba(255,255,255,0.06);

  /* === Motion ============================================== */
  --ease-out:   cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in:    cubic-bezier(0.4, 0, 1, 1);
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 240ms;
}

/* ============================================================
   Streamlit overrides — App shell
   ============================================================ */
.stApp {
  background: var(--bg-canvas) !important;
  color: var(--fg-primary);
  font-family: var(--font-body);
}

/* --- Sidebar ------------------------------------------------ */
[data-testid="stSidebar"] {
  background: var(--bg-surface) !important;
  border-right: 1px solid var(--border) !important;
}
[data-testid="stSidebar"] .stMarkdown h2 {
  font-family: var(--font-display);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: var(--fg-primary);
}

/* --- Tabs --------------------------------------------------- */
[data-testid="stTabs"] button[data-baseweb="tab"] {
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  font-size: var(--tx-md) !important;
  color: var(--fg-secondary) !important;
  border-bottom: 2px solid transparent !important;
  transition: color var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out);
}
[data-testid="stTabs"] button[aria-selected="true"] {
  color: var(--fg-primary) !important;
  border-bottom: 2px solid var(--gold) !important;
}
/* Remove default tab highlight bar */
[data-testid="stTabs"] [role="tablist"] {
  border-bottom: 1px solid var(--border) !important;
}
[data-testid="stTabs"] button[data-baseweb="tab"]::before {
  background-color: transparent !important;
}

/* --- Dialog / Modal ----------------------------------------- */
[data-testid="stModal"] > div {
  background: var(--bg-surface) !important;
  border: 1px solid rgba(201,162,39,0.2) !important;
  border-radius: var(--r-4) !important;
  box-shadow: var(--shadow-md) !important;
}
[data-testid="stModal"] [data-testid="stModalCloseButton"] button {
  color: var(--fg-secondary) !important;
}
[data-testid="stModal"] [data-testid="stModalCloseButton"] button:hover {
  color: var(--fg-primary) !important;
}

/* ============================================================
   Streamlit overrides — Dataframe / Table
   ============================================================ */
/* Outer container */
[data-testid="stDataFrame"] {
  border: 1px solid var(--border) !important;
  border-radius: var(--r-3) !important;
  overflow: hidden;
}
/* Glide-data-grid cells */
[data-testid="stDataFrame"] [data-testid="glideDataEditor"] {
  font-family: var(--font-body) !important;
}
/* Header row */
.stDataFrame [data-testid="StyledDataFrameRowHeader"],
[data-testid="stDataFrame"] th,
[data-testid="stDataFrame"] [role="columnheader"] {
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  letter-spacing: 0.03em !important;
  text-transform: uppercase !important;
  color: var(--fg-secondary) !important;
  background: var(--bg-surface-elev) !important;
}
/* Body cells */
.stDataFrame [data-testid="StyledDataFrameDataCell"],
[data-testid="stDataFrame"] td {
  font-family: var(--font-body) !important;
  font-size: 14px !important;
  color: var(--fg-primary) !important;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid var(--border) !important;
}
/* Row hover */
[data-testid="stDataFrame"] tr:hover td {
  background: var(--bg-surface-hover) !important;
}
/* Remove heavy borders, keep hairline */
[data-testid="stDataFrame"] table {
  border-collapse: collapse !important;
}

/* ============================================================
   Streamlit overrides — Form controls
   ============================================================ */
/* Selectbox / Multiselect */
[data-baseweb="select"] {
  font-family: var(--font-body) !important;
}
[data-baseweb="select"] > div {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-2) !important;
  color: var(--fg-primary) !important;
  transition: border-color var(--dur-fast) var(--ease-out);
}
[data-baseweb="select"] > div:hover {
  border-color: var(--border-strong) !important;
}
[data-baseweb="select"] > div:focus-within {
  border-color: var(--gold) !important;
  box-shadow: 0 0 0 1px var(--gold) !important;
}
/* Dropdown list */
[data-baseweb="popover"] > div,
[data-baseweb="menu"] {
  background: var(--bg-surface-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-2) !important;
}
[data-baseweb="menu"] li {
  font-family: var(--font-body) !important;
  font-size: 14px !important;
  color: var(--fg-primary) !important;
}
[data-baseweb="menu"] li:hover {
  background: var(--bg-surface-hover) !important;
}
[data-baseweb="menu"] li[aria-selected="true"] {
  background: rgba(201,162,39,0.12) !important;
  color: var(--gold-light) !important;
}

/* Text input */
[data-testid="stTextInput"] input,
[data-baseweb="input"] input {
  font-family: var(--font-body) !important;
  font-size: 14px !important;
  background: var(--bg-surface) !important;
  color: var(--fg-primary) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-2) !important;
}
[data-testid="stTextInput"] input:focus,
[data-baseweb="input"] input:focus {
  border-color: var(--gold) !important;
  box-shadow: 0 0 0 1px var(--gold) !important;
}
[data-testid="stTextInput"] input::placeholder {
  color: var(--fg-tertiary) !important;
}
/* Input container (baseweb wraps input in a div) */
[data-baseweb="input"] > div {
  background: var(--bg-surface) !important;
  border-color: var(--border) !important;
}

/* Slider */
[data-testid="stSlider"] [data-baseweb="slider"] [role="slider"] {
  background: var(--gold) !important;
  border-color: var(--gold) !important;
}
[data-testid="stSlider"] [data-baseweb="slider"] [data-testid="stTickBar"] > div {
  background: var(--gold) !important;
}
[data-testid="stSlider"] div[data-baseweb="slider"] > div > div:first-child > div {
  background: var(--border-strong) !important;
}
[data-testid="stSlider"] div[data-baseweb="slider"] > div > div:first-child > div > div {
  background: var(--gold) !important;
}
[data-testid="stSlider"] [data-baseweb="slider"] [role="slider"]:focus {
  box-shadow: 0 0 0 3px rgba(201,162,39,0.35) !important;
}

/* Number input */
[data-testid="stNumberInput"] input {
  font-family: var(--font-body) !important;
  font-variant-numeric: tabular-nums;
  background: var(--bg-surface) !important;
  color: var(--fg-primary) !important;
  border: 1px solid var(--border) !important;
}

/* Labels for all form controls */
[data-testid="stWidgetLabel"] label,
[data-testid="stWidgetLabel"] p {
  font-family: var(--font-body) !important;
  font-weight: 500 !important;
  font-size: 13px !important;
  color: var(--fg-secondary) !important;
}

/* ============================================================
   Streamlit overrides — Expander
   ============================================================ */
[data-testid="stExpander"] {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-3) !important;
}
[data-testid="stExpander"] summary {
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  color: var(--fg-primary) !important;
  padding: 12px 16px !important;
}
[data-testid="stExpander"] summary:hover {
  background: var(--bg-surface-hover) !important;
  color: var(--gold-light) !important;
}
[data-testid="stExpander"] [data-testid="stExpanderDetails"] {
  border-top: 1px solid var(--border) !important;
  padding: 16px !important;
}
/* Expander icon color */
[data-testid="stExpander"] summary svg {
  color: var(--fg-secondary) !important;
}

/* ============================================================
   Streamlit overrides — Buttons
   ============================================================ */
/* Primary button */
[data-testid="stButton"] button[kind="primary"],
[data-testid="stButton"] button[data-testid="stBaseButton-primary"] {
  background: var(--gold) !important;
  color: #0A0A0A !important;
  border: none !important;
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  border-radius: var(--r-2) !important;
  box-shadow: var(--inset-metallic) !important;
  transition: background var(--dur-fast) var(--ease-out);
}
[data-testid="stButton"] button[kind="primary"]:hover,
[data-testid="stButton"] button[data-testid="stBaseButton-primary"]:hover {
  background: var(--gold-light) !important;
}
[data-testid="stButton"] button[kind="primary"]:active,
[data-testid="stButton"] button[data-testid="stBaseButton-primary"]:active {
  background: var(--gold-dark) !important;
}

/* Secondary button */
[data-testid="stButton"] button[kind="secondary"],
[data-testid="stButton"] button[data-testid="stBaseButton-secondary"] {
  background: transparent !important;
  color: var(--fg-primary) !important;
  border: 1px solid var(--border) !important;
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  border-radius: var(--r-2) !important;
  transition: border-color var(--dur-fast) var(--ease-out);
}
[data-testid="stButton"] button[kind="secondary"]:hover,
[data-testid="stButton"] button[data-testid="stBaseButton-secondary"]:hover {
  border-color: var(--gold) !important;
  color: var(--fg-primary) !important;
}

/* ============================================================
   Streamlit overrides — Metric
   ============================================================ */
[data-testid="stMetric"] {
  background: var(--bg-surface-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-3) !important;
  padding: 12px 16px !important;
}
[data-testid="stMetric"] [data-testid="stMetricLabel"] {
  font-family: var(--font-body) !important;
  font-weight: 600 !important;
  font-size: 11px !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  color: var(--fg-secondary) !important;
}
[data-testid="stMetric"] [data-testid="stMetricValue"] {
  font-family: var(--font-display) !important;
  font-weight: 700 !important;
  color: var(--fg-primary) !important;
  font-variant-numeric: tabular-nums !important;
}
[data-testid="stMetric"] [data-testid="stMetricDelta"] {
  font-variant-numeric: tabular-nums !important;
}

/* ============================================================
   Streamlit overrides — Misc widgets
   ============================================================ */
/* Markdown & captions */
.stMarkdown, .stCaption {
  font-family: var(--font-body) !important;
  color: var(--fg-primary);
}
.stCaption, [data-testid="stCaptionContainer"] {
  color: var(--fg-tertiary) !important;
}
/* Section headers (#### markdown) */
.stMarkdown h4 {
  font-family: var(--font-display) !important;
  font-weight: 600 !important;
  font-size: var(--ds-4) !important;
  text-transform: uppercase !important;
  letter-spacing: -0.01em !important;
  color: var(--fg-primary) !important;
}
/* Horizontal rule */
.stMarkdown hr {
  border-color: var(--border) !important;
}

/* Info / Warning / Error boxes */
[data-testid="stAlert"] {
  background: var(--bg-surface-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r-3) !important;
  color: var(--fg-primary) !important;
  font-family: var(--font-body) !important;
}

/* Checkbox */
[data-testid="stCheckbox"] label span {
  font-family: var(--font-body) !important;
  color: var(--fg-primary) !important;
}

/* Column config: image columns */
[data-testid="stDataFrame"] img {
  border-radius: 50% !important;
}

/* Scrollbar styling for dark theme */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--bg-canvas); }
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--r-pill);
}
::-webkit-scrollbar-thumb:hover { background: var(--fg-tertiary); }

/* ============================================================
   Base typography classes
   ============================================================ */
.cffb-num, .cffb-num * {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
.cffb-display-hero {
  font-family: var(--font-display);
  font-weight: var(--w-700);
  font-size: var(--ds-hero);
  line-height: 1;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.cffb-display-1 {
  font-family: var(--font-display);
  font-weight: var(--w-700);
  font-size: var(--ds-1);
  line-height: 1.05;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.cffb-display-2 {
  font-family: var(--font-display);
  font-weight: var(--w-700);
  font-size: var(--ds-2);
  line-height: 1.1;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.cffb-display-3 {
  font-family: var(--font-display);
  font-weight: var(--w-600);
  font-size: var(--ds-3);
  line-height: 1.15;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.cffb-label {
  font-family: var(--font-body);
  font-weight: var(--w-600);
  font-size: var(--tx-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-secondary);
}
.cffb-gold-grad-text {
  background: var(--gold-gradient);
  -webkit-background-clip: text;
          background-clip: text;
  -webkit-text-fill-color: transparent;
          color: transparent;
}

/* ============================================================
   KPI Tile
   ============================================================ */
.cffb-kpi {
  background: var(--bg-surface-elev);
  border: 1px solid var(--border);
  border-radius: var(--r-3);
  padding: 16px 20px 18px;
  min-width: 140px;
  display: flex; flex-direction: column; gap: 8px;
}
.cffb-kpi__label {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-secondary);
}
.cffb-kpi__value {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 40px;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--fg-primary);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
}
.cffb-kpi__value--hero {
  background: linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%);
  -webkit-background-clip: text;
          background-clip: text;
  -webkit-text-fill-color: transparent;
          color: transparent;
}
.cffb-kpi__sub {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
}
.cffb-kpi__sub--pos { color: var(--delta-pos); }
.cffb-kpi__sub--neg { color: var(--delta-neg); }
.cffb-kpi__row {
  display: flex; gap: 12px; flex-wrap: wrap;
}

/* ============================================================
   Star Rating
   ============================================================ */
.cffb-stars {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-family: var(--font-body);
}
.cffb-stars__icon {
  width: 22px; height: 22px;
  display: inline-block;
  position: relative;
  --fill: 100%;
  --color: var(--fg-tertiary);
}
.cffb-stars__icon::before,
.cffb-stars__icon::after {
  content: "\\2605";
  position: absolute; inset: 0;
  font-size: 22px; line-height: 1;
  color: #2A2A2A;
}
.cffb-stars__icon::after {
  color: var(--color);
  width: var(--fill);
  overflow: hidden;
  -webkit-text-fill-color: var(--color);
}
.cffb-stars__num {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-secondary);
  margin-left: 8px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.cffb-stars--t5 .cffb-stars__icon { --color: var(--star-5); }
.cffb-stars--t4 .cffb-stars__icon { --color: var(--star-4); }
.cffb-stars--t3 .cffb-stars__icon { --color: var(--star-3); }
.cffb-stars--t2 .cffb-stars__icon { --color: var(--star-2); }
.cffb-stars--t1 .cffb-stars__icon { --color: var(--star-1); }

/* ============================================================
   Grade Badge
   ============================================================ */
.cffb-grade {
  display: inline-flex;
  align-items: center; justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  border-radius: var(--r-2);
  padding: 4px 10px 5px;
  color: var(--fg-primary);
}
.cffb-grade--sm { font-size: 14px; padding: 2px 6px 3px; }
.cffb-grade--md { font-size: 20px; padding: 4px 10px 5px; }
.cffb-grade--lg { font-size: 36px; padding: 6px 16px 8px; line-height: 1; }
.cffb-grade--a  { background: linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%); color: #0A0A0A; box-shadow: 0 0 12px rgba(201,162,39,0.25); }
.cffb-grade--b  { background: var(--grade-a); color: var(--fg-primary); }
.cffb-grade--c  { background: var(--gold); color: #0A0A0A; }
.cffb-grade--d  { background: var(--grade-d); color: var(--fg-primary); }
.cffb-grade--f  { background: var(--grade-f); color: var(--fg-primary); }

/* ============================================================
   Value Delta
   ============================================================ */
.cffb-delta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.cffb-delta--sm { font-size: 12px; }
.cffb-delta--md { font-size: 13px; }
.cffb-delta--lg { font-size: 18px; font-weight: 700; }
.cffb-delta--pos  { color: var(--delta-pos); }
.cffb-delta--neg  { color: var(--delta-neg); }
.cffb-delta--flat { color: var(--delta-flat); }
.cffb-delta__arrow {
  display: inline-flex;
  font-size: 0.85em;
  line-height: 1;
}

/* ============================================================
   Conference Badge
   ============================================================ */
.cffb-conf {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: var(--r-1);
  color: var(--fg-primary);
  border: 1px solid transparent;
}
.cffb-conf--sec   { background: rgba(201,162,39,0.15); color: #C9A227; border-color: rgba(201,162,39,0.4); }
.cffb-conf--b1g   { background: rgba(74,111,165,0.15); color: #7DA0CC; border-color: rgba(74,111,165,0.4); }
.cffb-conf--b10   { background: rgba(74,111,165,0.15); color: #7DA0CC; border-color: rgba(74,111,165,0.4); }
.cffb-conf--acc   { background: rgba(139,74,92,0.18); color: #C58DA0; border-color: rgba(139,74,92,0.45); }
.cffb-conf--big12 { background: rgba(184,69,69,0.15); color: #D88787; border-color: rgba(184,69,69,0.4); }
.cffb-conf--b12   { background: rgba(184,69,69,0.15); color: #D88787; border-color: rgba(184,69,69,0.4); }
.cffb-conf--pac   { background: rgba(92,122,106,0.18); color: #9CB8A8; border-color: rgba(92,122,106,0.45); }
.cffb-conf--p12   { background: rgba(92,122,106,0.18); color: #9CB8A8; border-color: rgba(92,122,106,0.45); }
.cffb-conf--aac   { background: rgba(107,92,139,0.18); color: #A799C0; border-color: rgba(107,92,139,0.45); }
.cffb-conf--mw    { background: rgba(139,111,31,0.18); color: #BFA058; border-color: rgba(139,111,31,0.45); }
.cffb-conf--ind   { background: var(--bg-surface-elev); color: var(--fg-secondary); border-color: var(--border); }

/* ============================================================
   Rank Badge
   ============================================================ */
.cffb-rank {
  display: inline-flex;
  align-items: center; justify-content: center;
  border-radius: var(--r-2);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.01em;
  padding: 4px 10px 5px;
  font-variant-numeric: tabular-nums;
}
.cffb-rank--top { background: linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%); color: #0A0A0A; box-shadow: 0 0 8px rgba(201,162,39,0.25); }
.cffb-rank--mid { background: rgba(201,162,39,0.15); color: #E8C547; border: 1px solid rgba(201,162,39,0.4); }
.cffb-rank--low { background: var(--bg-surface-elev); color: var(--fg-secondary); border: 1px solid var(--border); }
.cffb-rank--lg  { font-size: 22px; padding: 5px 14px 7px; }
.cffb-rank--md  { font-size: 16px; padding: 3px 9px 4px; }
.cffb-rank--sm  { font-size: 12px; padding: 2px 6px 3px; }

/* ============================================================
   Commit Composition Bar
   ============================================================ */
.cffb-cc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-body);
  font-variant-numeric: tabular-nums;
}
.cffb-cc__header {
  display: flex; justify-content: space-between; align-items: baseline;
}
.cffb-cc__label {
  font-weight: 600; font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-secondary);
}
.cffb-cc__total {
  font-family: var(--font-display);
  font-weight: 700; font-size: 20px; color: var(--fg-primary);
}
.cffb-cc__bar {
  display: flex; height: 16px; width: 100%;
  border-radius: var(--r-2); overflow: hidden;
  background: var(--bg-surface-elev);
  border: 1px solid var(--border);
}
.cffb-cc__seg {
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #0A0A0A;
  border-right: 1px solid rgba(0,0,0,0.35);
  min-width: 0;
}
.cffb-cc__seg:last-child { border-right: 0; }
.cffb-cc__seg--5 { background: linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%); }
.cffb-cc__seg--4 { background: var(--star-4); color: var(--fg-primary); }
.cffb-cc__seg--3 { background: var(--star-3); color: #0A0A0A; }
.cffb-cc__seg--2 { background: var(--star-2); color: var(--fg-primary); }
.cffb-cc__legend {
  display: flex; gap: 16px; font-size: 11px; color: var(--fg-secondary);
}
.cffb-cc__legend-item { display: inline-flex; align-items: center; gap: 6px; }
.cffb-cc__dot { width: 8px; height: 8px; border-radius: 2px; }

/* ============================================================
   Live Indicator
   ============================================================ */
.cffb-live {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-primary);
}
.cffb-live__ring {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #E8C547, #C9A227, #8B6F1F, #C9A227, #E8C547);
  padding: 1.5px;
  display: flex; align-items: center; justify-content: center;
  animation: cffb-live-ring-spin 4s linear infinite;
}
.cffb-live__inner {
  width: 100%; height: 100%;
  border-radius: 50%;
  background: var(--bg-canvas);
  display: flex; align-items: center; justify-content: center;
  animation: cffb-live-ring-spin 4s linear infinite reverse;
}
.cffb-live__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--live);
  box-shadow: 0 0 8px rgba(45,122,78,0.85);
  animation: cffb-live-dot-pulse 1.4s ease-in-out infinite;
}

/* ============================================================
   Player Card — Compact
   ============================================================ */
.cffb-pc-c {
  display: grid;
  grid-template-columns: 40px 32px 1fr auto auto auto;
  align-items: center;
  gap: 16px;
  padding: 12px 16px 12px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-3);
  position: relative;
  overflow: hidden;
  font-family: var(--font-body);
  cursor: pointer;
  transition: background var(--dur-fast);
}
.cffb-pc-c::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0;
  width: 2px; background: var(--gold);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform var(--dur-base) var(--ease-out);
}
.cffb-pc-c:hover { background: var(--bg-surface-hover); }
.cffb-pc-c:hover::before { transform: scaleY(1); }
.cffb-pc-c__team {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display);
  font-weight: 700; font-size: 13px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
}
.cffb-pc-c__pos {
  font-family: var(--font-display);
  font-weight: 700; font-size: 14px;
  text-align: center;
  padding: 4px 6px;
  border-radius: var(--r-1);
  color: #0A0A0A;
}
.cffb-pc-c__name {
  font-family: var(--font-display);
  font-weight: 700; font-size: 20px;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: var(--fg-primary); line-height: 1.1;
}
.cffb-pc-c__meta {
  font-size: 12px; color: var(--fg-secondary); margin-top: 2px;
  display: flex; gap: 6px; align-items: center;
}
.cffb-pc-c__stars { display: inline-flex; gap: 1px; }
.cffb-pc-c__star { color: var(--gold); font-size: 14px; line-height: 1; }
.cffb-pc-c__star--off { color: var(--border); }
.cffb-pc-c__bid {
  font-family: var(--font-display);
  font-weight: 700; font-size: 22px;
  color: var(--fg-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  min-width: 64px; text-align: right;
}
.cffb-pc-c__delta {
  font-size: 12px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 54px; text-align: right;
}
.cffb-pc-c__delta--pos { color: var(--delta-pos); }
.cffb-pc-c__delta--neg { color: var(--delta-neg); }

/* ============================================================
   Player Card — Expanded
   ============================================================ */
.cffb-pc-e {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-3);
  padding: 20px 24px;
  font-family: var(--font-body);
  color: var(--fg-primary);
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 168px 1fr;
  gap: 24px;
  align-items: stretch;
}
.cffb-pc-e::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #E8C547, #C9A227 50%, #8B6F1F);
}
.cffb-pc-e__photo {
  width: 168px;
  aspect-ratio: 4 / 5;
  border-radius: 6px;
  background: var(--bg-surface-elev);
  position: relative;
  overflow: hidden;
}
.cffb-pc-e__photo img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  z-index: 1;
}
.cffb-pc-e__photo-bar {
  position: absolute; top: 0; left: 0; right: 0;
  height: 4px;
  z-index: 3;
}
.cffb-pc-e__photo-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  z-index: 2;
  color: #3A3A3A;
}
.cffb-pc-e__id {
  display: flex; flex-direction: column; gap: 10px;
  min-width: 0;
}
.cffb-pc-e__tagrow { display: flex; gap: 6px; align-items: center; }
.cffb-pc-e__pos {
  font-family: var(--font-display);
  font-weight: 700; font-size: 12px;
  text-transform: uppercase;
  padding: 3px 7px; border-radius: var(--r-1);
  color: #0A0A0A;
}
.cffb-pc-e__name {
  font-family: var(--font-display);
  font-weight: 700; font-size: 40px;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: var(--fg-primary); line-height: 0.95;
}
.cffb-pc-e__meta {
  font-size: 13px; color: var(--fg-secondary);
}
.cffb-pc-e__stars { display: inline-flex; gap: 2px; }
.cffb-pc-e__star { font-size: 18px; color: var(--gold); }
.cffb-pc-e__facts {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.cffb-pc-e__fact-label {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-secondary);
}
.cffb-pc-e__fact-val {
  font-family: var(--font-display);
  font-weight: 700; font-size: 22px;
  color: var(--fg-primary); line-height: 1; margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.cffb-pc-e__fact-val--hero {
  background: linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ============================================================
   Team Logo / Chip
   ============================================================ */
.cffb-team-chip {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  font-family: var(--font-display);
  font-weight: 700; text-transform: uppercase;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
  vertical-align: middle;
}
.cffb-team-chip--sm { width: 30px; height: 30px; font-size: 10px; }
.cffb-team-chip--md { width: 40px; height: 40px; font-size: 13px; }
.cffb-team-chip--lg { width: 60px; height: 60px; font-size: 18px; }

/* ============================================================
   Animations
   ============================================================ */
@keyframes cffb-live-ring-spin { to { transform: rotate(360deg); } }
@keyframes cffb-live-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(0.6); opacity: 0.45; }
}
@keyframes cffb-slide-in {
  from { transform: translateY(-20px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
@keyframes cffb-flash-gold {
  0%   { background-color: rgba(201,162,39,0.3); }
  100% { background-color: transparent; }
}
"""


def inject_global_css():
    """Inject the global CFFB design system CSS into the Streamlit app."""
    st.markdown(f"<style>{GLOBAL_CSS}</style>", unsafe_allow_html=True)
