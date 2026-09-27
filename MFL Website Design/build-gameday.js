#!/usr/bin/env node
// build-gameday.js
// Bundles the GameDay design (Game Day/Gameday MFL Message.html) + its live data
// loader (Game Day/gd-data-live.js) into a single self-contained HTML fragment
// suitable for pasting into an MFL Home Page Message. Mirrors build-standings.js,
// pointed at the same Apps Script Web App /exec URL (the shared league payload
// that powers Standings / Power Rankings / Live Scoring).
//
// The design is plain vanilla JS/CSS (no React), so — unlike the other widgets —
// there is no JSX/Babel step: we lift the paste-ready block from the design file
// (between its START/END markers), inject the live loader (with the /exec URL
// substituted) just before the render script, and emit the fragment.
//
// Usage:
//   GD_WEBAPP_URL="https://script.google.com/macros/s/…/exec" node build-gameday.js
// If unset it falls back to the shared league /exec URL below.

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR       = __dirname;
const SRC_DIR   = path.join(DIR, 'Game Day');
const HTML_PATH = path.join(SRC_DIR, 'Gameday MFL Message.html');
const DATA_PATH = path.join(SRC_DIR, 'gd-data-live.js');
const OUT_PATH  = path.join(DIR, 'home-message-gameday.html');

// Live Apps Script Web App /exec URL — the SAME deployment Standings / Power
// Rankings use. Overridable via GD_WEBAPP_URL (or the shared ST_/PR_ vars).
const WEBAPP_URL = process.env.GD_WEBAPP_URL
  || process.env.ST_WEBAPP_URL
  || process.env.PR_WEBAPP_URL
  || 'https://script.google.com/macros/s/AKfycbzPEJXZ0aL7GaveabunScoXiLhca0h52bYKJxXMkPdZexoEO186KreVclj7VcAGB_yW/exec';

function read(p) { return fs.readFileSync(p, 'utf-8'); }

// ---------------------------------------------------------------------------
// Extract the paste-ready block from the design file
// ---------------------------------------------------------------------------
// The design wraps its MFL-ready markup between explicit markers; everything
// outside them (<!DOCTYPE>, <html>/<head>/<body>, the demo page background) is
// preview-only chrome that must NOT ship in the fragment.
const html = read(HTML_PATH);
const START = '<!-- ===== START MFL MESSAGE =====';
const END   = '<!-- ===== END MFL MESSAGE ===== -->';
const sPos = html.indexOf(START);
const ePos = html.indexOf(END);
if (sPos < 0 || ePos < 0 || ePos < sPos) {
  console.error('ERROR: could not find START/END MFL MESSAGE markers in ' + HTML_PATH);
  process.exit(1);
}
const afterStart = html.indexOf('-->', sPos) + 3;
let block = html.slice(afterStart, ePos).trim();

// ---------------------------------------------------------------------------
// Build the live loader <script> (URL substituted) and inject it before render
// ---------------------------------------------------------------------------
const loaderCode = read(DATA_PATH).replace(/__WEBAPP_URL__/g, WEBAPP_URL);
if (loaderCode.indexOf('__WEBAPP_URL__') !== -1) {
  console.warn('warn: __WEBAPP_URL__ placeholder still present after substitution');
}
const loaderScript = '<script>\n' + loaderCode + '\n</script>';

// The block contains exactly one <script> — the render code. The loader must run
// first so window.__cffbGamedayData exists when the render script reads it.
const scriptIdx = block.indexOf('<script>');
if (scriptIdx < 0) {
  console.error('ERROR: no <script> found in the extracted design block.');
  process.exit(1);
}
let out = block.slice(0, scriptIdx) + loaderScript + '\n' + block.slice(scriptIdx);

// Strip HTML comments to save bytes (JS comments inside <script> are untouched).
out = out.replace(/<!--[\s\S]*?-->\s*/g, '');

// ---------------------------------------------------------------------------
// Safety: MFL rejects messages containing these tags
// ---------------------------------------------------------------------------
const banned = /<\/?(?:html|head|body|textarea)\b[^>]*>/i;
if (banned.test(out)) {
  const m = out.match(banned)[0];
  const idx = out.search(banned);
  console.error('ERROR: output contains a banned MFL tag: ' + m);
  console.error('       …' + out.slice(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ') + '…');
  process.exit(1);
}

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
console.log('home-message-gameday.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB) — MFL limit is 768 KB`);
console.log(`  Web app URL: ${WEBAPP_URL}`);
