#!/usr/bin/env node
// build-live-scoring.js
// Bundles the Live Scoring React widget into a single self-contained HTML
// fragment suitable for pasting into an MFL home page message.
//
// The widget pulls its data LIVE from the MFL export API (same-origin on an MFL
// page) — TYPE=liveScoring for scores, TYPE=projectedScores for projections,
// TYPE=players for identity — plus the page globals window.franchiseDatabase /
// franchise_id / league_id / currentWeek. Nothing to configure, no web app to
// deploy. Structurally a near-clone of build-roster-board.js.
//
// Usage:  node build-live-scoring.js   (or: npm run build:live-scoring)

'use strict';

const fs    = require('fs');
const path  = require('path');
// Build-only: compile JSX -> plain JS so the browser doesn't download + run
// (~2.9 MB) @babel/standalone at page load. Same `react` preset the browser
// would have applied at runtime, so the output is behavior-identical.
const Babel = require('@babel/standalone');

const DIR      = __dirname;
const SRC_DIR  = path.join(DIR, 'Live Scoring');
const CSS_PATH = path.join(SRC_DIR, 'ls.css');
// cffb.css is the shared design system ls.css extends; it lives in the sibling
// Apps Script project. Inline it so the widget is self-contained.
const CFFB_CSS_PATH = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System', 'cffb.css');
const OUT_PATH = path.join(DIR, 'home-message-live-scoring.html');

// ls-data-live.jsx (live MFL data) + ls-app.jsx (React UI).
const JSX_FILES = ['ls-data-live.jsx', 'ls-app.jsx'];

const ROOT_ID = 'cffb-ls-root';

// ---------------------------------------------------------------------------
// Read sources
// ---------------------------------------------------------------------------

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const lsCss   = read(CSS_PATH);
const cffbCss = fs.existsSync(CFFB_CSS_PATH) ? read(CFFB_CSS_PATH) : '';
if (!cffbCss) {
  console.warn('warn: cffb.css not found at ' + CFFB_CSS_PATH);
  console.warn('      The widget will render UNSTYLED (missing cffb-* base component styles).');
}
const jsxSources = JSX_FILES.map((name) => ({ name, code: read(path.join(SRC_DIR, name)) }));

// ---------------------------------------------------------------------------
// Transform JSX — wrap the render call with a Boot component that waits for the
// live data load before mounting <App />, and mount to a widget-unique root id.
// ---------------------------------------------------------------------------

const jsxBundle = jsxSources.map(({ name, code }) => {
  let out = code;

  if (name === 'ls-app.jsx') {
    const rendered = out.replace(
      /ReactDOM\.createRoot\([\s\S]*?\)\.render\(<App \/>\);?/,
      `
const CFFBLiveScoringBoot = () => {
  const [ready, setReady] = React.useState(false);
  const [err, setErr]     = React.useState(null);
  React.useEffect(() => {
    window.__loadLiveScoring()
      .then(() => setReady(true))
      .catch((e) => setErr(e && e.message ? e.message : String(e)));
  }, []);
  if (err)    return <div className="cffb-boot cffb-boot--err">Couldn't load live scoring: {err}</div>;
  if (!ready) return <div className="cffb-boot">Loading live scoring…</div>;
  return <App />;
};
ReactDOM.createRoot(document.getElementById('${ROOT_ID}')).render(<CFFBLiveScoringBoot />);`
    );
    if (rendered === out) {
      console.warn('warn: ls-app.jsx render() line not found — Boot wrapper not injected');
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
  '  if (window.__cffbLiveScoringBooted) return;',
  '  window.__cffbLiveScoringBooted = true;',
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
// page: *, html, body, and the bare `a` link color). Every .cffb-* / .ls-*
// class rule is safe (custom prefixes MFL never uses). Keep :root tokens.
const safeCffbCss = cffbCss
  .replace(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}/g, '')
  .replace(/\bhtml\s*,\s*body\s*\{[^}]*\}/g, '')
  .replace(/(^|\n)\s*body\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a:hover\s*\{[^}]*\}/g, '$1');

// ls.css is container-scoped via #root — rename to our widget root id.
const scopedLsCss = lsCss.replace(/#root\b/g, '#' + ROOT_ID);

const extraCss = [
  '.cffb-boot{padding:40px;text-align:center;color:var(--fg-secondary,#9A9A96);font-family:var(--font-body,sans-serif)}',
  '.cffb-boot--err{color:#D88787}',
  // Player name: force white over MFL's global gold link color; soft-red on hover.
  '#' + ROOT_ID + ' .ls-plink{color:var(--fg-primary,#F5F5F5) !important;text-decoration:none}',
  '#' + ROOT_ID + ' .ls-plink:hover{color:#D88787 !important;text-decoration:underline;text-underline-offset:3px}',
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
  scopedLsCss,
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

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
const kb    = (bytes / 1024).toFixed(1);

console.log('home-message-live-scoring.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${kb} KB) — MFL limit is 768 KB`);
