#!/usr/bin/env node
// build-roster-board.js
// Bundles the Roster Board React shell into a single self-contained HTML
// fragment suitable for pasting into an MFL home page message.
//
// The widget pulls its data LIVE from the MFL export API (same-origin on an MFL
// page) plus the page globals window.franchiseDatabase / franchise_id /
// league_id — so there is nothing to configure and no web app to deploy.
//
// Usage:  node build-roster-board.js   (or: npm run build:roster-board)

'use strict';

const fs    = require('fs');
const path  = require('path');
// Build-only: compile JSX -> plain JS so the browser doesn't download + run
// (~2.9 MB) @babel/standalone at page load. Same `react` preset the browser
// would have applied at runtime, so the output is behavior-identical.
const Babel = require('@babel/standalone');
const { PNG } = require('pngjs');

const DIR       = __dirname;
const SRC_DIR   = path.join(DIR, 'Roster Board');
const HTML_PATH = path.join(SRC_DIR, 'Roster Board.html');
const CSS_PATH  = path.join(SRC_DIR, 'roster.css');
// cffb.css is the shared design system roster.css extends; it lives in the
// sibling Apps Script project. Inline it so the widget is self-contained.
const CFFB_CSS_PATH = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System', 'cffb.css');
const OUT_PATH  = path.join(DIR, 'home-message-roster-board.html');

// rb-data-live.jsx (live MFL data) replaces rb-data.jsx (sample data).
const JSX_FILES = ['rb-data-live.jsx', 'rb-app.jsx'];

const ROOT_ID = 'cffb-rb-root';

// ---------------------------------------------------------------------------
// Read sources
// ---------------------------------------------------------------------------

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const htmlTemplate = read(HTML_PATH);
const rosterCss    = read(CSS_PATH);
const cffbCss      = fs.existsSync(CFFB_CSS_PATH) ? read(CFFB_CSS_PATH) : '';
if (!cffbCss) {
  console.warn('warn: cffb.css not found at ' + CFFB_CSS_PATH);
  console.warn('      The widget will render UNSTYLED (missing cffb-* base component styles).');
}
const jsxSources = JSX_FILES.map((name) => ({ name, code: read(path.join(SRC_DIR, name)) }));

// Conference logos live in the sibling design system. Inline them as base64
// data URIs (keyed by the conference id rb-data-live uses) so the tab strip is
// self-contained on MFL. Note the file for `pac` is pac12.png.
const CONF_LOGO_DIR = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System', 'assets', 'conferences');
const CONF_LOGO_FILES = { sec: 'sec.png', b1g: 'b1g.png', acc: 'acc.png', big12: 'big12.png', pac: 'pac12.png', aac: 'aac.png' };

// The source logos are print-resolution (pac12 is 1200×1514 / 229 KB) but the
// tab strip renders them at ~26 px. Downscale to a small retina-friendly cap
// before inlining so the message stays light. Box-filter over the decoded RGBA.
const LOGO_MAX = 72;
function downscalePng(buf) {
  const src = PNG.sync.read(buf);
  const scale = Math.min(1, LOGO_MAX / Math.max(src.width, src.height));
  if (scale >= 1) return PNG.sync.write(src);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const dst = new PNG({ width: dw, height: dh });
  const sx = src.width / dw, sy = src.height / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(src.width, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(src.height, Math.ceil((y + 1) * sy));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (src.width * yy + xx) << 2;
          const al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
        }
      }
      const di = (dw * y + x) << 2;
      dst.data[di]     = a ? Math.round(r / a) : 0;   // alpha-weighted (avoids dark fringing)
      dst.data[di + 1] = a ? Math.round(g / a) : 0;
      dst.data[di + 2] = a ? Math.round(b / a) : 0;
      dst.data[di + 3] = Math.round(a / n);
    }
  }
  return PNG.sync.write(dst);
}

const confLogos = {};
Object.keys(CONF_LOGO_FILES).forEach((conf) => {
  const p = path.join(CONF_LOGO_DIR, CONF_LOGO_FILES[conf]);
  if (!fs.existsSync(p)) { console.warn('warn: conference logo not found: ' + p); return; }
  let png;
  try { png = downscalePng(fs.readFileSync(p)); }
  catch (e) { console.warn('warn: could not downscale ' + conf + ' (' + e.message + ') — inlining full size'); png = fs.readFileSync(p); }
  confLogos[conf] = 'data:image/png;base64,' + png.toString('base64');
});

// ---------------------------------------------------------------------------
// Transform JSX — wrap the render call with a Boot component that waits for the
// live data load before mounting <App />, and mount to a widget-unique root id.
// ---------------------------------------------------------------------------

const jsxBundle = jsxSources.map(({ name, code }) => {
  let out = code;

  if (name === 'rb-app.jsx') {
    const rendered = out.replace(
      /ReactDOM\.createRoot\([\s\S]*?\)\.render\(<App \/>\);?/,
      `
const CFFBRosterBoot = () => {
  const [ready, setReady] = React.useState(false);
  const [err, setErr]     = React.useState(null);
  React.useEffect(() => {
    window.__loadRosterBoard()
      .then(() => setReady(true))
      .catch((e) => setErr(e && e.message ? e.message : String(e)));
  }, []);
  if (err)    return <div className="cffb-boot cffb-boot--err">Couldn't load rosters: {err}</div>;
  if (!ready) return <div className="cffb-boot">Loading rosters…</div>;
  return <App />;
};
ReactDOM.createRoot(document.getElementById('${ROOT_ID}')).render(<CFFBRosterBoot />);`
    );
    if (rendered === out) {
      console.warn('warn: rb-app.jsx render() line not found — Boot wrapper not injected');
    }
    out = rendered;
  }

  return `/* ---- ${name} ---- */\n${out}\n`;
}).join('\n');

// Precompile JSX -> plain JS at build time (drops the runtime Babel dependency).
const compiledApp = Babel.transform(jsxBundle, { presets: ['react'] }).code;

// Boot wrapper. Guarded IIFE (function-scoped — no cross-widget const collisions,
// idempotent). Loads React ONCE, shared across every CFFB widget on the page via
// window.__cffbReactPromise, and works even when MFL injects the message via
// innerHTML/AJAX (static <script src> never executes there; we append scripts
// programmatically, which do).
const bootScript = [
  '(function () {',
  '  if (window.__cffbRosterBoardBooted) return;',
  '  window.__cffbRosterBoardBooted = true;',
  '  window.__CFFB_CONF_LOGOS = ' + JSON.stringify(confLogos) + ';',
  '  function __cffbApp() {',
  compiledApp,
  '  }',
  '  var RV = "18.3.1";',
  '  function ready() { return window.React && window.ReactDOM && window.ReactDOM.createRoot; }',
  '  if (ready()) { __cffbApp(); return; }',
  '  window.__cffbReactPromise = window.__cffbReactPromise || new Promise(function (resolve) {',
  '    function load(src, cb) { var s = document.createElement("script"); s.src = src; s.crossOrigin = "anonymous"; s.onload = cb; s.onerror = cb; document.head.appendChild(s); }',
  '    load("https://unpkg.com/react@" + RV + "/umd/react.production.min.js", function () {',
  '      load("https://unpkg.com/react-dom@" + RV + "/umd/react-dom.production.min.js", resolve);',
  '    });',
  '  });',
  '  window.__cffbReactPromise.then(__cffbApp);',
  '})();'
].join('\n');

// ---------------------------------------------------------------------------
// Assemble CSS
// ---------------------------------------------------------------------------
//
// The message is embedded inside MFL's own page, so any bare-element selector
// leaks onto MFL's chrome. Strip cffb.css's global reset (it repaints the whole
// page: *, html, body, and the bare `a` link color). Every .cffb-* / .rb-*
// class rule is safe (custom prefixes MFL never uses). Keep :root tokens.
const safeCffbCss = cffbCss
  .replace(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}/g, '')
  .replace(/\bhtml\s*,\s*body\s*\{[^}]*\}/g, '')
  .replace(/(^|\n)\s*body\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a:hover\s*\{[^}]*\}/g, '$1');

// roster.css is container-scoped via #root — rename to our widget root id.
const scopedRosterCss = rosterCss.replace(/#root\b/g, '#' + ROOT_ID);

const extraCss = [
  '.cffb-boot{padding:40px;text-align:center;color:var(--fg-secondary,#9A9A96);font-family:var(--font-body,sans-serif)}',
  '.cffb-boot--err{color:#D88787}',
  // Player name: force white over MFL\'s global gold link color; soft-red on hover.
  '#' + ROOT_ID + ' .rb-plink{color:var(--fg-primary,#F5F5F5) !important;text-decoration:none}',
  '#' + ROOT_ID + ' .rb-plink:hover{color:#D88787 !important;text-decoration:underline;text-underline-offset:3px}',
  '.rb-copy-badge{display:inline-flex;align-items:center;font:700 10px/1 var(--font-body,sans-serif);letter-spacing:.08em;color:var(--fg-tertiary,#6A6A66);border:1px solid var(--border,#262629);border-radius:2px;padding:3px 5px}',
  // Other-copy franchise logo: constrain so wide "pill" logos fit the narrow column.
  '#' + ROOT_ID + ' .rb-copy .cffb-team{height:20px;width:auto;max-width:110px;object-fit:contain}',
  // Unverified-contract marker (owner abbrev didn\'t match this franchise).
  '.rb-flag{display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;color:#E8C547;cursor:help;flex:none}',
  // ── Manage Roster (Taxi/IR) — button + modal ──────────────────────────────
  // Right-side group: KPIs + Manage button travel together and wrap as one unit
  // (instead of the button and KPIs fighting over the right edge and splitting onto
  // separate lines). align-items:flex-end keeps the button baseline-aligned with the KPI values.
  '#' + ROOT_ID + ' .rb-team__aside{margin-left:auto;display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;justify-content:flex-end}',
  '#' + ROOT_ID + ' .rb-team__aside .rb-team__kpis{margin-left:0}',
  '#' + ROOT_ID + ' .rb-manage-btn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font:700 11px/1 var(--font-body,sans-serif);letter-spacing:.06em;text-transform:uppercase;color:#0A0A0A;background:var(--gold-gradient,linear-gradient(135deg,#E8C547,#C9A227 50%,#8B6F1F));border:none;border-radius:4px;padding:9px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.15)}',
  '#' + ROOT_ID + ' .rb-manage-btn:hover{filter:brightness(1.07)}',
  // Mobile (container ≤720px): the aside spans full width; the button drops below the
  // KPI row full-width so nothing is cramped.
  '@container (max-width:720px){#' + ROOT_ID + ' .rb-team__aside{width:100%;margin-left:0;gap:12px}#' + ROOT_ID + ' .rb-manage-btn{width:100%;justify-content:center;padding:11px 14px}}',
  '.rb-modal{position:fixed;inset:0;z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;background:rgba(0,0,0,.66);overflow-y:auto}',
  '.rb-modal__box{width:100%;max-width:560px;background:var(--bg-surface,#141414);border:1px solid var(--border,#2A2A2A);border-top:3px solid var(--gold,#C9A227);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.7)}',
  '.rb-modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 20px 8px}',
  '.rb-modal__eyebrow{font:700 9px/1 var(--font-body,sans-serif);letter-spacing:.2em;text-transform:uppercase;color:var(--gold,#C9A227);margin-bottom:7px}',
  '.rb-modal__title{font-family:var(--font-display,sans-serif);font-weight:700;font-size:22px;line-height:1;text-transform:uppercase;color:var(--fg-primary,#F5F5F5)}',
  '#' + ROOT_ID + ' .rb-modal__x{cursor:pointer;background:transparent;border:none;color:var(--fg-secondary,#9A9A9A);font-size:18px;line-height:1;padding:4px 6px;border-radius:4px}',
  '#' + ROOT_ID + ' .rb-modal__x:hover{color:var(--fg-primary,#F5F5F5);background:var(--bg-surface-hover,#1F1F1F)}',
  '.rb-modal__note{padding:0 20px 12px;font:500 11px/1.5 var(--font-body,sans-serif);color:var(--fg-tertiary,#6A6A66)}',
  '.rb-mng__load{padding:24px 20px;text-align:center;font:500 12px/1.4 var(--font-body,sans-serif);color:var(--fg-secondary,#9A9A9A)}',
  '.rb-mng__load--err{color:#D88787}',
  '.rb-mng__result{margin:0 20px 12px;padding:10px 12px;border-radius:6px;font:600 12px/1.4 var(--font-body,sans-serif)}',
  '.rb-mng__result.is-ok{color:#8FCBA4;background:rgba(45,122,78,.12);border:1px solid rgba(45,122,78,.4)}',
  '.rb-mng__result.is-err{color:#E4A6A6;background:rgba(184,69,69,.12);border:1px solid rgba(184,69,69,.45)}',
  '.rb-mng__confirm{margin:0 20px 12px;padding:12px;border-radius:6px;background:var(--bg-surface-elev,#1C1C1C);border:1px solid var(--gold,#C9A227);display:flex;flex-direction:column;gap:10px}',
  '.rb-mng__confirm-txt{font:600 13px/1.4 var(--font-body,sans-serif);color:var(--fg-primary,#F5F5F5);display:flex;flex-direction:column;gap:4px}',
  '.rb-mng__warn{font:500 11px/1.4 var(--font-body,sans-serif);color:var(--gold-light,#E8C547)}',
  '.rb-mng__confirm-btns{display:flex;gap:8px}',
  '.rb-mng__body{padding:0 20px 20px}',
  '.rb-mng__sec{margin-top:14px}',
  '.rb-mng__sechead{display:flex;align-items:center;gap:8px;font:700 10px/1 var(--font-body,sans-serif);letter-spacing:.14em;text-transform:uppercase;color:var(--fg-tertiary,#6A6A66);padding-bottom:8px;border-bottom:1px solid var(--border,#2A2A2A);margin-bottom:6px}',
  '.rb-mng__sechead span{color:var(--fg-secondary,#9A9A9A)}',
  '.rb-mng__row{display:flex;align-items:center;gap:12px;padding:7px 0}',
  '.rb-mng__id{min-width:0;flex:1}',
  '.rb-mng__name{font-family:var(--font-display,sans-serif);font-weight:700;font-size:14px;line-height:1.1;text-transform:uppercase;color:var(--fg-primary,#F5F5F5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.rb-mng__sub{font:500 10.5px/1.3 var(--font-body,sans-serif);color:var(--fg-tertiary,#6A6A66);margin-top:2px}',
  '.rb-mng__acts{display:flex;gap:6px;flex:none;align-items:center}',
  '.rb-mng__none{font:600 10px/1 var(--font-body,sans-serif);color:var(--fg-tertiary,#5A5A5A);letter-spacing:.08em}',
  '#' + ROOT_ID + ' .rb-mbtn{cursor:pointer;font:700 10px/1 var(--font-body,sans-serif);letter-spacing:.06em;text-transform:uppercase;color:var(--fg-primary,#F5F5F5);background:var(--bg-surface-elev,#1C1C1C);border:1px solid var(--border-strong,#3A3A3A);border-radius:4px;padding:8px 11px;white-space:nowrap;transition:filter 120ms}',
  '#' + ROOT_ID + ' .rb-mbtn:hover{filter:brightness(1.15)}',
  '#' + ROOT_ID + ' .rb-mbtn:disabled{opacity:.5;cursor:default}',
  '#' + ROOT_ID + ' .rb-mbtn--taxi{border-color:rgba(201,162,39,.55);color:var(--gold-light,#E8C547)}',
  '#' + ROOT_ID + ' .rb-mbtn--ir{border-color:rgba(184,69,69,.55);color:#D88787}',
  '#' + ROOT_ID + ' .rb-mbtn--go{background:var(--gold-gradient,linear-gradient(135deg,#E8C547,#C9A227 50%,#8B6F1F));color:#0A0A0A;border-color:transparent}',
  // "no new redshirt" flag on IR actions for players who already used a medical RS
  '.rb-mng__nors{font:700 8px/1 var(--font-body,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#D88787;border:1px solid rgba(184,69,69,.5);border-radius:2px;padding:3px 5px;white-space:nowrap;cursor:help}',
  // season-retention note in the Manage modal (amber, tighter to the note above)
  '.rb-modal__note--rs{padding-top:0;color:var(--gold-light,#E8C547)}',
].join('\n');

// ---------------------------------------------------------------------------
// Assemble HTML fragment
// ---------------------------------------------------------------------------
//
// MFL rejects messages containing <html>, <head>, <body>, or <textarea> tags —
// the message is embedded inside MFL's page — so we emit a fragment (styles +
// root div + Babel bundle) with no outer document scaffolding.

let out = [
  '<style>',
  safeCffbCss,
  scopedRosterCss,
  extraCss,
  '</style>',
  '<div id="' + ROOT_ID + '"></div>',
  '<script>',
  bootScript,
  '</script>'
].join('\n');

// Sanity check: never ship a tag MFL rejects.
const banned = /<\/?(?:html|head|body|textarea)\b[^>]*>/i;
if (banned.test(out)) {
  console.warn('warn: output contains a banned MFL tag — MFL will reject it');
  console.warn('       first match: ' + out.match(banned)[0]);
}

// Strip HTML comments to save bytes.
out = out.replace(/<!--[\s\S]*?-->\s*/g, '');

// Keep the demo template in the dependency graph / warn if it drifts.
if (!htmlTemplate.includes('Roster Board')) {
  console.warn('warn: Roster Board.html template looks unfamiliar — did the demo change?');
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
const kb    = (bytes / 1024).toFixed(1);

console.log('home-message-roster-board.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${kb} KB) — MFL limit is 768 KB`);
