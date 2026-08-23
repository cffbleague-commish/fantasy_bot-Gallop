#!/usr/bin/env node
// build-player-ledger.js
// Bundles the Player Ledger React shell into a single self-contained HTML
// fragment for pasting into an MFL home page message. Mirrors build-standings.js,
// pointed at the same Apps Script Web App /exec URL (with ?feed=ledger routing).
//
// Usage:
//   PL_WEBAPP_URL="https://script.google.com/macros/s/…/exec" \
//     node build-player-ledger.js
//
// If PL_WEBAPP_URL is unset it falls back to the shared league /exec URL below
// (the same endpoint Standings / Power Rankings use).

'use strict';

const fs    = require('fs');
const path  = require('path');
// Build-only: compiles JSX → plain JS so the browser doesn't download (~2.9 MB)
// and run @babel/standalone at page load (the demo's Player Ledger.html does).
const Babel = require('@babel/standalone');

const DIR       = __dirname;
const SRC_DIR   = path.join(DIR, 'Player Ledger');
const HTML_PATH = path.join(SRC_DIR, 'Player Ledger.html'); // holds the inline SVG sprite
const CSS_PATH  = path.join(SRC_DIR, 'ledger.css');
// Shared design-system stylesheet (tokens + cffb-* component classes). Same file
// the other widgets inline; not part of the installed mfl-custom.css.
const CFFB_CSS_PATH = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System', 'cffb.css');
const OUT_PATH  = path.join(DIR, 'home-message-player-ledger.html');

// pl-data-live.jsx replaces the mock pl-data.jsx AND ../Auction Board/data.jsx.
const JSX_FILES = ['pl-data-live.jsx', 'pl-components.jsx', 'pl-app.jsx'];

// Live Apps Script Web App /exec URL. Same deployment as the other widgets; the
// ?feed=ledger routing is added by pl-data-live.jsx, not here.
const WEBAPP_URL = process.env.PL_WEBAPP_URL
  || process.env.ST_WEBAPP_URL
  || process.env.PR_WEBAPP_URL
  || 'https://script.google.com/macros/s/AKfycbzPEJXZ0aL7GaveabunScoXiLhca0h52bYKJxXMkPdZexoEO186KreVclj7VcAGB_yW/exec';

// ---------------------------------------------------------------------------
// Read sources
// ---------------------------------------------------------------------------

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const htmlTemplate = read(HTML_PATH);
const cffbCss      = read(CFFB_CSS_PATH);
const css          = read(CSS_PATH);
const jsxSources   = JSX_FILES.map((name) => ({ name, code: read(path.join(SRC_DIR, name)) }));

// ---------------------------------------------------------------------------
// Transform JSX
// ---------------------------------------------------------------------------
// 1. Substitute the web app URL into pl-data-live.jsx.
// 2. Repoint the mount from #root to a namespaced #cffb-pl-root.
const jsxBundle = jsxSources.map(({ name, code }) => {
  let out = code;

  if (name === 'pl-data-live.jsx') {
    out = out.replace(/__WEBAPP_URL__/g, WEBAPP_URL);
    if (out.indexOf(WEBAPP_URL) < 0) {
      console.warn('warn: __WEBAPP_URL__ placeholder not found in pl-data-live.jsx');
    }
  }

  if (name === 'pl-app.jsx') {
    const rebased = out.replace(
      /document\.getElementById\(['"]root['"]\)/,
      "document.getElementById('cffb-pl-root')"
    );
    if (rebased === out) {
      console.warn('warn: pl-app.jsx mount getElementById("root") not found — id not rebased');
    }
    out = rebased;
  }

  return `/* ---- ${name} ---- */\n${out}\n`;
}).join('\n');

// Precompile JSX → plain JS at build time (drops the runtime Babel dependency).
const compiledApp = Babel.transform(jsxBundle, { presets: ['react'] }).code;

// Boot wrapper — guarded IIFE, idempotent, function-scoped (no cross-widget const
// collisions). Loads React ONCE, shared across every CFFB widget on the page via
// a single window.__cffbReactPromise, and works even when MFL injects the message
// via innerHTML/AJAX (static <script src> never runs then; appended scripts do).
const bootScript = [
  '(function () {',
  '  if (window.__cffbPlayerLedgerBooted) return;',
  '  window.__cffbPlayerLedgerBooted = true;',
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
// Strip bare element selectors from cffb.css so they don't restyle MFL's own
// page chrome. Everything else is class-scoped (cffb-* / pl-*) and safe to inline.
function stripBareSelectors(sheet) {
  return sheet
    .replace(/^\s*html\s*,\s*body\s*\{[^}]*\}/m, '')
    .replace(/^\s*body\s*\{[^}]*\}/m, '')
    .replace(/^\s*a\s*\{[^}]*\}/m, '')
    .replace(/^\s*a:hover\s*\{[^}]*\}/m, '');
}
const scopedCss = [stripBareSelectors(cffbCss), stripBareSelectors(css)].join('\n');

// ---------------------------------------------------------------------------
// Extract the inline SVG sprite (redshirt shields + award glyphs) from the demo
// HTML — pl-components.jsx references it via <use href="#cffb-icon-…" />.
// ---------------------------------------------------------------------------
const spriteMatch = htmlTemplate.match(/<svg\b[^>]*>[\s\S]*?cffb-icon-rs-trad[\s\S]*?<\/svg>/i);
const sprite = spriteMatch ? spriteMatch[0] : '';
if (!sprite) {
  console.warn('warn: inline SVG sprite (#cffb-icon-rs-trad) not found in Player Ledger.html');
}

// ---------------------------------------------------------------------------
// Assemble HTML fragment (bare — MFL rejects <html>/<head>/<body>/<textarea>)
// ---------------------------------------------------------------------------
let out = [
  '<style>',
  scopedCss,
  '</style>',
  sprite,
  '<div id="cffb-pl-root"></div>',
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

console.log('home-message-player-ledger.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${kb} KB) — MFL limit is 768 KB`);
console.log(`  Web app URL: ${WEBAPP_URL}`);
