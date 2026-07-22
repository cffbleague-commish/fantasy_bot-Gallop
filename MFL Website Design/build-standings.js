#!/usr/bin/env node
// build-standings.js
// Bundles the Standings React shell into a single self-contained HTML fragment
// suitable for pasting into an MFL home page message. Mirrors
// build-power-rankings.js, pointed at the same Apps Script Web App /exec URL.
//
// Usage:
//   ST_WEBAPP_URL="https://script.google.com/macros/s/…/exec" \
//     node build-standings.js
//
// If ST_WEBAPP_URL is unset it falls back to the shared league /exec URL below
// (the same endpoint Power Rankings uses).

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR       = __dirname;
const SRC_DIR   = path.join(DIR, 'Standings');
const HTML_PATH = path.join(SRC_DIR, 'Standings.html');
const CSS_PATH  = path.join(SRC_DIR, 'standings.css');
// Shared design-system stylesheet: defines the :root tokens AND the cffb-*
// component classes (cffb-table, cffb-num, cffb-team-chip, …) that st-app.jsx
// and standings.css consume. It is NOT part of the installed mfl-custom.css,
// so it must be inlined for the fragment to render correctly inside MFL.
const CFFB_CSS_PATH = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System', 'cffb.css');
const OUT_PATH  = path.join(DIR, 'home-message-standings.html');

// st-data-live.jsx replaces st-data.jsx (sample CSV + PRNG) at build time.
const JSX_FILES = ['st-data-live.jsx', 'st-app.jsx'];

// Live Apps Script Web App /exec URL. Same deployment as Power Rankings.
// Overridable via ST_WEBAPP_URL (or PR_WEBAPP_URL) for staging deployments.
const WEBAPP_URL = process.env.ST_WEBAPP_URL
  || process.env.PR_WEBAPP_URL
  || 'https://script.google.com/macros/s/AKfycbzPEJXZ0aL7GaveabunScoXiLhca0h52bYKJxXMkPdZexoEO186KreVclj7VcAGB_yW/exec';

// ---------------------------------------------------------------------------
// Read sources
// ---------------------------------------------------------------------------

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const htmlTemplate = read(HTML_PATH);
const cffbCss      = read(CFFB_CSS_PATH);
const css          = read(CSS_PATH);
const jsxSources   = JSX_FILES.map((name) => ({
  name,
  code: read(path.join(SRC_DIR, name))
}));

// ---------------------------------------------------------------------------
// Transform JSX
// ---------------------------------------------------------------------------
//
// 1. Substitute the web app URL into st-data-live.jsx.
// 2. Repoint the mount from #root to a namespaced #cffb-st-root so the fragment
//    can't collide with anything else on the MFL page. The App component boots
//    itself (it calls loadStandings() in a useEffect and renders its own
//    loading/error states), so no Boot wrapper is needed — unlike Power
//    Rankings, whose components read window globals at render time.
const jsxBundle = jsxSources.map(({ name, code }) => {
  let out = code;

  if (name === 'st-data-live.jsx') {
    out = out.replace(/__WEBAPP_URL__/g, WEBAPP_URL);
  }

  if (name === 'st-app.jsx') {
    const rebased = out.replace(
      /document\.getElementById\(['"]root['"]\)/,
      "document.getElementById('cffb-st-root')"
    );
    if (rebased === out) {
      console.warn('warn: st-app.jsx mount getElementById("root") not found — id not rebased');
    }
    out = rebased;
  }

  return `/* ---- ${name} ---- */\n${out}\n`;
}).join('\n');

// ---------------------------------------------------------------------------
// Assemble CSS
// ---------------------------------------------------------------------------
//
// Strip the handful of bare element selectors from cffb.css so they don't
// restyle MFL's own page chrome (its links, body layout). Everything else is
// class-scoped (cffb-* / st-*) and safe to inline.
function stripBareSelectors(sheet) {
  return sheet
    .replace(/^\s*html\s*,\s*body\s*\{[^}]*\}/m, '')
    .replace(/^\s*body\s*\{[^}]*\}/m, '')
    .replace(/^\s*a\s*\{[^}]*\}/m, '')
    .replace(/^\s*a:hover\s*\{[^}]*\}/m, '');
}

const scopedCss = [stripBareSelectors(cffbCss), stripBareSelectors(css)].join('\n');

// ---------------------------------------------------------------------------
// Extract the rivalry-swords SVG sprite from Standings.html
// ---------------------------------------------------------------------------
// st-app.jsx's schedule modal references <use href="#cffb-icon-rivalry" />, so
// the hidden sprite must ride along in the fragment.
const spriteMatch = htmlTemplate.match(/<svg\b[^>]*>[\s\S]*?cffb-icon-rivalry[\s\S]*?<\/svg>/i);
const rivalrySprite = spriteMatch ? spriteMatch[0] : '';
if (!rivalrySprite) {
  console.warn('warn: rivalry SVG sprite (#cffb-icon-rivalry) not found in Standings.html');
}

// ---------------------------------------------------------------------------
// Assemble HTML fragment
// ---------------------------------------------------------------------------
//
// MFL rejects messages containing <html>, <head>, <body>, or <textarea> tags —
// the message is embedded inside MFL's own page, so we emit a bare fragment
// (styles + sprite + CDN scripts + root div + Babel bundle).

const cdnScripts = [
  '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>',
  '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>',
  '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>'
].join('\n');

let out = [
  '<style>',
  scopedCss,
  '</style>',
  rivalrySprite,
  cdnScripts,
  '<div id="cffb-st-root"></div>',
  '<script type="text/babel" data-presets="react">',
  jsxBundle,
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

// Keep the demo shell in the dependency graph / warn on drift.
if (!htmlTemplate.includes('CFFB')) {
  console.warn('warn: Standings.html template looks unfamiliar — did the demo change?');
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
const kb    = (bytes / 1024).toFixed(1);

console.log('home-message-standings.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${kb} KB) — MFL limit is 768 KB`);
console.log(`  Web app URL: ${WEBAPP_URL}`);
