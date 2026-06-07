"""
Price Prediction Board — scoped CSS.

Ported from apps_script_recruiting/CFFB Design System/Recruiting Board/
Price Prediction Board/prediction.css. Design tokens already live in
styles.GLOBAL_CSS (injected at app startup) — this module only adds the
layout + component CSS specific to the Price Prediction Board surface.

Trimmed: the dev-preview chrome (.stage--desktop / .stage--mobile / .viewtoggle)
that's only relevant inside the standalone HTML page.

Adapted: sticky offsets account for Streamlit's header (.stAppHeader) instead
of the standalone page's top: 0 anchor.
"""

import streamlit as st


PREDICTION_CSS = """
/* ============================================================
   Price Prediction Board — layout + components
   Tokens come from GLOBAL_CSS (styles.py).
   ============================================================ */

:root {
  --topbar-h: 56px;
  --yearbar-h: 52px;
  --pp-stick-top: 0px; /* Streamlit chrome offset — overridden inline below */
}

/* Neutralize Streamlit's default block container padding so the sticky
   top bar can anchor to the actual viewport top inside the tab. */
section.main > div.block-container,
.main .block-container {
  padding-top: 0.5rem !important;
}

.pp-frame { width: 100%; }
.pp-frame * { box-sizing: border-box; }

/* Kill Streamlit's default anchor styling on links we render. */
.pp-infobtn, .pp-infobtn:hover, .pp-infobtn:visited,
.pp-yearseg__btn, .pp-yearseg__btn:hover, .pp-yearseg__btn:visited,
.pp-brow, .pp-brow:hover, .pp-brow:visited {
  text-decoration: none !important;
}
/* Force the anchor's own color (children inherit by default — unless overridden
   by a more specific class or inline style, both of which we want to preserve). */
.pp-yearseg__btn { color: var(--fg-secondary) !important; }
.pp-yearseg__btn.is-on { color: #0A0A0A !important; }
.pp-brow { color: var(--fg-primary) !important; }
.pp-brow__name { color: var(--fg-primary) !important; }
.pp-brow__score { color: var(--fg-primary) !important; }

/* ============================================================ TOP BAR */
.pp-topbar {
  min-height: var(--topbar-h);
  background: #0F0F0F;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center;
  padding: 0 18px; gap: 16px;
  position: sticky;
  top: var(--pp-stick-top);
  z-index: 40;
  border-radius: var(--r-3) var(--r-3) 0 0;
}
.pp-topbar__brand { display: flex; align-items: center; gap: 11px; flex-shrink: 0; }
.pp-topbar__mark {
  width: 28px; height: 28px; border-radius: 6px;
  background: var(--gold-gradient); color: #0A0A0A;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  box-shadow: var(--inset-metallic);
}
.pp-topbar__h1 {
  font-family: var(--font-display); font-weight: 700; font-size: 24px;
  margin: 0; line-height: 1; letter-spacing: -0.005em;
  text-transform: uppercase; white-space: nowrap;
}
.pp-topbar__spacer { margin-left: auto; }

.pp-topbar__feed { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.pp-topbar__feed-txt { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.pp-topbar__feed-lbl {
  font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-secondary);
}
.pp-topbar__feed-val {
  font-size: 12px; font-weight: 500; color: var(--fg-primary);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* infobtn — styled as a clickable anchor */
.pp-infobtn {
  display: inline-flex; align-items: center; gap: 7px;
  background: #1A1A1A; border: 1px solid var(--border);
  color: var(--fg-secondary);
  font-family: var(--font-body); font-weight: 600; font-size: 12px;
  letter-spacing: 0.02em; padding: 7px 13px;
  border-radius: var(--r-pill);
  transition: color var(--dur-fast), border-color var(--dur-fast);
  margin-right: 14px; flex-shrink: 0;
  text-decoration: none;
}
.pp-infobtn:hover { color: var(--fg-primary); border-color: var(--border-strong); }
.pp-infobtn svg { width: 15px; height: 15px; }

/* ============================================================ YEAR SELECTOR */
.pp-yearbar {
  height: var(--yearbar-h);
  background: #0D0D0D;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 16px;
  padding: 0 18px;
  position: sticky;
  top: calc(var(--pp-stick-top) + var(--topbar-h));
  z-index: 35;
}
.pp-yearbar__lbl {
  font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-secondary); flex-shrink: 0;
}
.pp-yearseg {
  display: flex; gap: 3px; background: #141414;
  border: 1px solid var(--border); border-radius: var(--r-2);
  padding: 3px; flex-shrink: 0;
}
.pp-yearseg__btn {
  display: inline-flex; align-items: center; gap: 7px;
  border: 0; background: transparent;
  color: var(--fg-secondary);
  font-family: var(--font-display); font-weight: 700; font-size: 17px;
  letter-spacing: 0.02em; padding: 5px 14px; border-radius: var(--r-1);
  font-variant-numeric: tabular-nums;
  text-decoration: none;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.pp-yearseg__btn:hover { color: var(--fg-primary); }
.pp-yearseg__btn.is-on {
  background: var(--gold-gradient); color: #0A0A0A;
  box-shadow: var(--inset-metallic);
}
.pp-yearseg__count {
  font-family: var(--font-body); font-weight: 600; font-size: 11px;
  padding: 1px 6px; border-radius: var(--r-pill);
  background: rgba(0,0,0,0.28); color: inherit; opacity: 0.78;
}
.pp-yearseg__btn:not(.is-on) .pp-yearseg__count {
  background: #0B0B0B; color: var(--fg-tertiary);
}
.pp-yearbar__tag {
  font-size: 12px; color: var(--fg-tertiary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ============================================================ LIVE TOOLBAR */
.pp-livebar {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 18px; background: #0C0C0C;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: calc(var(--pp-stick-top) + var(--topbar-h) + var(--yearbar-h));
  z-index: 32;
  flex-wrap: wrap;
}
.pp-livebar__lbl {
  font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--gold);
}
.pp-livebar__stat {
  display: inline-flex; align-items: baseline; gap: 6px;
  font-size: 12px; color: var(--fg-secondary);
}
.pp-livebar__stat b {
  color: var(--fg-primary); font-family: var(--font-display);
  font-weight: 700; font-variant-numeric: tabular-nums;
}

/* ============================================================ DETAIL PANEL */
.pp-dpanel-wrap {
  background: var(--bg-canvas);
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 14px 30px -18px rgba(0,0,0,0.9);
}
.pp-dpanel {
  background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: var(--r-3);
  position: relative; overflow: hidden;
  display: grid; align-items: stretch;
  grid-template-columns: 140px minmax(170px, 1fr) 300px minmax(320px, 420px);
  grid-template-areas: "photo id stats pred";
}
.pp-dpanel::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: var(--gold-gradient); z-index: 2;
}

/* photo zone */
.pp-dpanel__photo {
  grid-area: photo; align-self: start;
  margin: 13px; width: 114px; aspect-ratio: 4 / 5;
  border-radius: 6px; background: #1C1C1C;
  position: relative; overflow: hidden;
  outline: 1px dashed rgba(201,162,39,0.32);
  outline-offset: -6px;
}
.pp-dpanel__photo img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; z-index: 2;
}
.pp-dpanel__photo-bar {
  position: absolute; top: 0; left: 0; right: 0;
  height: 4px; z-index: 3;
}
.pp-dpanel__photo-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; z-index: 1;
}
.pp-dpanel__photo-empty svg {
  width: 46px; height: 46px;
  stroke: #3A3A3A; fill: none; stroke-width: 1.5;
}
.pp-dpanel__photo-num {
  position: absolute; bottom: 7px; right: 9px; z-index: 4;
  font-family: var(--font-display); font-weight: 700; font-size: 28px;
  line-height: 0.9; letter-spacing: -0.04em;
  color: var(--fg-primary); text-shadow: 0 2px 6px rgba(0,0,0,0.7);
  font-variant-numeric: tabular-nums;
}

/* identity zone */
.pp-dpanel__id {
  grid-area: id;
  display: flex; flex-direction: column;
  justify-content: flex-start; gap: 7px;
  min-width: 0; padding: 13px 16px;
}
.pp-dpanel__tagrow {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
}
.pp-pos-tag {
  font-family: var(--font-display); font-weight: 700; font-size: 11px;
  padding: 2px 6px; border-radius: var(--r-1);
  text-align: center; letter-spacing: 0.02em; line-height: 1.3;
  display: inline-block; flex-shrink: 0;
}
.pp-dpanel__cls-chip {
  font-weight: 600; font-size: 10px; letter-spacing: 0.04em;
  color: var(--fg-secondary); background: #141414;
  border: 1px solid var(--border);
  padding: 2px 7px; border-radius: 3px;
}
.pp-dpanel__name {
  font-family: var(--font-display); font-weight: 700; font-size: 34px;
  line-height: 0.96; text-transform: uppercase; letter-spacing: -0.01em;
}
.pp-dpanel__starline {
  display: flex; align-items: center; gap: 10px;
}
.pp-dpanel__starnum {
  font-size: 14px; font-weight: 600; color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
}
.pp-dpanel__sub {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--fg-secondary);
}

/* stat grid */
.pp-dpanel__stats {
  grid-area: stats; border-left: 1px solid var(--border);
  display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr;
}
.pp-dstat {
  display: flex; flex-direction: column; justify-content: center; gap: 2px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.pp-dstat:nth-child(3n+1) { border-left: 0; }
.pp-dstat:nth-child(4), .pp-dstat:nth-child(5), .pp-dstat:nth-child(6) { border-bottom: 0; }
.pp-dstat__lbl {
  font-size: 8.5px; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--fg-secondary);
}
.pp-dstat__val {
  font-family: var(--font-display); font-weight: 700; font-size: 18px;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.pp-dstat--hero {
  background: linear-gradient(180deg, rgba(201,162,39,0.10), rgba(201,162,39,0.02));
  box-shadow: inset 2px 0 0 var(--gold);
}
.pp-dstat--hero .pp-dstat__lbl { color: var(--gold); }
.pp-dstat--hero .pp-dstat__val { font-size: 22px; }

/* pricing + chart zone */
.pp-dpanel__pred {
  grid-area: pred; border-left: 1px solid var(--border);
  padding: 12px 18px 14px;
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0; background: var(--bg-surface-elev);
}
.pp-dpanel__pred-row1 {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.pp-dpanel__pred-row2 {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
}
.pp-dpanel__pred-eyebrow {
  font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-secondary); white-space: nowrap;
}
.pp-dpanel__hero-row { display: flex; align-items: baseline; gap: 11px; }
.pp-dpanel__pred-hero {
  flex-shrink: 0; font-family: var(--font-display); font-weight: 700;
  font-size: 36px; line-height: 0.92; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums; color: var(--gold-light);
}
.pp-dpanel__live-tag {
  display: inline-flex; align-items: center; gap: 7px;
  white-space: nowrap; flex-shrink: 0;
}
.pp-dpanel__live-lbl {
  font-family: var(--font-display); font-weight: 700; font-size: 10.5px;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--fg-secondary); white-space: nowrap;
}
.pp-dpanel__band {
  font-size: 12px; color: var(--fg-secondary);
  font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
}
.pp-dpanel__band b { color: var(--gold); font-weight: 700; }
.pp-dpanel__live-note { font-size: 11px; color: var(--fg-tertiary); }

/* probability curve (inline SVG inside the pred zone) */
.pp-pcurve__svg { display: block; width: 100%; height: auto; margin-top: 2px; }
.pp-pcurve__axis { stroke: #2A2A2A; stroke-width: 1; }
.pp-pcurve__proj { stroke-width: 1.5; }
.pp-pcurve__tick {
  fill: var(--fg-tertiary); font-family: var(--font-body);
  font-size: 10px; font-variant-numeric: tabular-nums;
}
.pp-pcurve__tick.is-proj { fill: var(--gold-light); font-weight: 700; }
.pp-pcurve__legend {
  display: flex; flex-wrap: wrap; gap: 6px 12px;
  padding: 4px 2px 0; margin-top: 2px;
}
.pp-pleg { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; }
.pp-pleg__dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.pp-pleg__lbl { color: var(--fg-secondary); }
.pp-pleg.is-primary .pp-pleg__lbl { color: var(--fg-primary); font-weight: 600; }
.pp-pleg__val {
  font-family: var(--font-display); font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pp-ldelta {
  white-space: nowrap; flex-shrink: 0;
  font-family: var(--font-display); font-weight: 700; font-size: 15px;
  font-variant-numeric: tabular-nums;
  padding: 2px 9px; border-radius: var(--r-1); letter-spacing: 0.01em;
  align-self: center;
}
.pp-ldelta--up { color: var(--delta-pos); background: rgba(45,122,78,0.12); }
.pp-ldelta--down { color: var(--delta-neg); background: rgba(184,69,69,0.12); }
.pp-ldelta--flat { color: var(--fg-tertiary); }

/* ============================================================ LIVE INDICATOR */
.pp-live-ind { display: inline-flex; align-items: center; flex-shrink: 0; }
.pp-live-ind__ring {
  width: 18px; height: 18px; border-radius: 50%; padding: 1.5px;
  background: conic-gradient(from 0deg, #E8C547, #C9A227, #8B6F1F, #C9A227, #E8C547);
  animation: pp-ring-spin 4s linear infinite;
}
.pp-live-ind__ring > i {
  width: 100%; height: 100%; border-radius: 50%;
  background: #0F0F0F; display: flex; align-items: center; justify-content: center;
  animation: pp-ring-spin 4s linear infinite reverse;
}
.pp-live-ind__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--live); box-shadow: var(--shadow-glow-live);
  animation: pp-live-pulse 1.4s ease-in-out infinite;
}
@keyframes pp-ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pp-live-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.6; }
}

/* ============================================================ STARS */
.pp-stars { display: inline-flex; gap: 2px; align-items: center; line-height: 1; }
.pp-stars__s { color: #2A2A2A; line-height: 1; }
.pp-stars__s.is-on.t5 { color: var(--star-5); }
.pp-stars__s.is-on.t4 { color: var(--star-4); }
.pp-stars__s.is-on.t3 { color: var(--star-3); }
.pp-stars__s.is-on.t2 { color: var(--star-2); }
.pp-stars__s.is-on.t1 { color: var(--star-1); }

.pp-starshort {
  display: inline-flex; align-items: center; gap: 2px;
  font-family: var(--font-display); font-weight: 700; font-size: 12px;
  line-height: 1; font-variant-numeric: tabular-nums;
  padding: 2px 6px 2px 5px; border-radius: var(--r-1);
  background: rgba(255,255,255,0.04);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}
.pp-starshort.t5 { color: var(--star-5); }
.pp-starshort.t4 { color: var(--star-4); }
.pp-starshort.t3 { color: var(--star-3); }
.pp-starshort.t2 { color: var(--star-2); }
.pp-starshort.t1 { color: var(--star-1); }

/* ============================================================ HEADSHOT + TEAM LOGO */
.pp-shot {
  position: relative; flex-shrink: 0; overflow: hidden; border-radius: 50%;
  background: repeating-linear-gradient(115deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 8px),
              linear-gradient(160deg, #242D39 0%, #161A20 60%, #101216 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}
.pp-shot img {
  width: 100%; height: 100%; object-fit: cover;
}
.pp-shot__initials {
  font-family: var(--font-display); font-weight: 700;
  color: rgba(184,202,222,0.92); line-height: 1;
  text-shadow: 0 1px 6px rgba(0,0,0,0.5);
}
.pp-shot__accent {
  position: absolute; left: 12%; right: 12%; bottom: 0;
  height: 3px; border-radius: 2px 2px 0 0;
}

.pp-tlogo { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
.pp-tlogo__badge {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.pp-tlogo__img {
  width: 100%; height: 100%; object-fit: contain; display: block;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
}

/* ============================================================ PAGE + BOARD */
.pp-page { padding: 18px 18px 48px; }
.pp-board-head {
  display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px;
  padding-bottom: 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap;
}
.pp-board-head__title {
  font-family: var(--font-display); font-weight: 700; font-size: 22px;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.pp-board-head__meta {
  font-size: 12px; color: var(--fg-secondary); font-variant-numeric: tabular-nums;
}
.pp-board-head__hint {
  margin-left: auto; font-size: 11px; color: var(--fg-tertiary);
}

.pp-tbl {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-3); overflow: hidden;
}

/* column template shared by header + rows */
.pp-bhead, .pp-brow {
  display: grid; align-items: center; gap: 14px;
  grid-template-columns: 34px 42px minmax(0,1fr) 96px 56px 132px;
}
.pp-bhead {
  background: #181818; border-bottom: 1px solid var(--border);
  padding: 9px 18px;
}
.pp-bhead > span {
  font-size: 10px; font-weight: 600; color: var(--fg-secondary);
  letter-spacing: 0.1em; text-transform: uppercase;
}
.pp-bhead > span.t-r { text-align: right; }

.pp-board__rows { display: flex; flex-direction: column; }
.pp-brow {
  text-align: left; background: var(--bg-surface); color: var(--fg-primary);
  border: 0; border-top: 1px solid var(--border);
  padding: 9px 18px; position: relative;
  transition: background var(--dur-fast);
  text-decoration: none;
}
.pp-board__rows .pp-brow:first-child { border-top: 0; }
.pp-brow::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0;
  width: 2px; background: var(--gold);
  transform: scaleY(0); transform-origin: center;
  transition: transform var(--dur-fast) var(--ease-out);
}
.pp-brow:hover { background: var(--bg-surface-hover); }
.pp-brow:hover::before { transform: scaleY(1); }
.pp-brow.is-active { background: #191510; }
.pp-brow.is-active::before { transform: scaleY(1); }
.pp-brow__rank {
  font-family: var(--font-display); font-weight: 700; font-size: 17px;
  color: var(--fg-tertiary); font-variant-numeric: tabular-nums; text-align: center;
}
.pp-brow.is-active .pp-brow__rank { color: var(--gold); }
.pp-brow__shot { display: flex; }
.pp-brow__id { min-width: 0; }
.pp-brow__name {
  font-family: var(--font-display); font-weight: 700; font-size: 17px;
  line-height: 1.05; text-transform: uppercase; letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: block; color: var(--fg-primary);
}
.pp-brow__meta {
  display: flex; align-items: center; gap: 8px; margin-top: 4px;
  font-size: 11px; color: var(--fg-secondary);
}
.pp-brow__posrank {
  font-family: var(--font-display); font-weight: 700; font-size: 12px; color: var(--gold);
}
.pp-brow__year {
  font-weight: 700; font-size: 10px; letter-spacing: 0.02em;
  color: var(--fg-secondary); background: #141414; border: 1px solid var(--border);
  padding: 1px 5px; border-radius: 3px; font-variant-numeric: tabular-nums;
}
.pp-brow__school { color: var(--fg-secondary); font-weight: 600; letter-spacing: 0.02em; }
.pp-brow__stars { display: flex; }
.pp-brow__score {
  font-family: var(--font-display); font-weight: 700; font-size: 17px;
  text-align: right; font-variant-numeric: tabular-nums; color: var(--fg-primary);
}
.pp-brow__proj {
  text-align: right; display: flex; flex-direction: column;
  align-items: flex-end; gap: 1px;
}
.pp-brow__proj-val {
  font-family: var(--font-display); font-weight: 700; font-size: 21px;
  line-height: 1; font-variant-numeric: tabular-nums; color: var(--gold);
}
.pp-brow__proj-range {
  font-size: 10px; color: var(--fg-tertiary); font-variant-numeric: tabular-nums;
}
.pp-tbl__empty {
  padding: 36px; text-align: center; color: var(--fg-tertiary); font-size: 13px;
}

/* ============================================================ ROW CLICK OVERLAY
   Each board row is a st.container(key="pp_row_<id>") holding the row HTML +
   an invisible st.button. The button overlays the row and captures clicks
   via Streamlit's widget protocol — no browser navigation, instant rerun. */
[class*="st-key-pp_board_wrap"] {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-3);
  overflow: hidden;
  margin: 0 18px;
}
/* Kill Streamlit's default vertical gap between row containers. */
[class*="st-key-pp_board_wrap"] [data-testid="stVerticalBlock"] {
  gap: 0 !important;
}
[class*="st-key-pp_row_"] {
  position: relative;
}
/* The button container fills the row and sits above it. */
[class*="st-key-pp_row_"] [data-testid="stElementContainer"]:has(button) {
  position: absolute !important;
  inset: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 5;
}
[class*="st-key-pp_row_"] [data-testid="stButton"] {
  width: 100%;
  height: 100%;
}
[class*="st-key-pp_row_"] [data-testid="stButton"] > button {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  background: transparent !important;
  opacity: 0;
  cursor: pointer;
  box-shadow: none !important;
}
[class*="st-key-pp_row_"] [data-testid="stButton"] > button:focus,
[class*="st-key-pp_row_"] [data-testid="stButton"] > button:focus-visible {
  outline: 0 !important;
  box-shadow: none !important;
}
/* Container hover surfaces the row hover state (gold left bar + bg shift). */
[class*="st-key-pp_row_"]:hover .pp-brow {
  background: var(--bg-surface-hover);
}
[class*="st-key-pp_row_"]:hover .pp-brow::before {
  transform: scaleY(1);
}

/* ============================================================ RESPONSIVE */
@media (max-width: 1080px) {
  .pp-dpanel {
    grid-template-columns: 140px minmax(170px, 1fr) 300px;
    grid-template-areas: "photo id stats" "pred pred pred";
  }
  .pp-dpanel__pred {
    border-left: 0; border-top: 1px solid var(--border);
  }
}
@media (max-width: 720px) {
  .pp-topbar { padding: 0 12px; }
  .pp-topbar__h1 { font-size: 20px; }
  .pp-topbar__feed-lbl { display: none; }
  .pp-topbar__feed-val { font-size: 11px; }
  .pp-yearbar { padding: 0 10px; gap: 10px; overflow-x: auto; scrollbar-width: none; }
  .pp-yearbar::-webkit-scrollbar { display: none; }
  .pp-yearbar__lbl { display: none; }
  .pp-yearbar__tag { display: none; }
  .pp-yearseg__btn { padding: 5px 12px; font-size: 15px; }
  .pp-infobtn span { display: none; }
  .pp-infobtn { padding: 7px; margin-right: 10px; }
  .pp-dpanel-wrap { padding: 12px 12px 10px; box-shadow: none; }
  .pp-dpanel {
    grid-template-columns: 100px 1fr;
    grid-template-areas: "photo id" "stats stats" "pred pred";
  }
  .pp-dpanel__photo { width: 100px; margin: 14px; }
  .pp-dpanel__name { font-size: 28px; }
  .pp-dpanel__stats { border-left: 0; border-top: 1px solid var(--border); }
  .pp-dpanel__pred-hero { font-size: 32px; }
  .pp-page { padding: 16px 12px 48px; }
  .pp-board-head__hint { display: none; }
  .pp-bhead { display: none; }
  .pp-brow {
    grid-template-columns: 30px 42px minmax(0,1fr) auto;
    gap: 12px; padding: 11px 14px;
  }
  .pp-brow__stars, .pp-brow__score { display: none; }
  .pp-brow__proj { align-self: center; }
  .pp-brow__proj-val { font-size: 19px; }
}
"""


def inject_prediction_css():
    """Inject the Price Prediction Board CSS once per page render."""
    st.markdown(f"<style>{PREDICTION_CSS}</style>", unsafe_allow_html=True)
