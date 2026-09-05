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
  '.rb-plink{color:inherit;text-decoration:none}',
  '.rb-plink:hover{color:var(--gold,#C9A227);text-decoration:underline;text-underline-offset:3px}',
  '.rb-copy-badge{display:inline-flex;align-items:center;font:700 10px/1 var(--font-body,sans-serif);letter-spacing:.08em;color:var(--fg-tertiary,#6A6A66);border:1px solid var(--border,#262629);border-radius:2px;padding:3px 5px}',
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
