#!/usr/bin/env node
// build-scenario-builder.js
// Bundles the Scenario Builder (Projections/) into a single self-contained HTML
// fragment to paste into an MFL home page message. Unlike the React widgets this
// source is already a hand-authored fragment with an inline engine; the build
// just (1) extracts the START→END paste block, (2) inlines the live-data loader
// sb-data-live.js with the real /exec URL substituted, and (3) enforces the MFL
// guards (no banned tags, < 768 KB).
//
// Usage:
//   SB_WEBAPP_URL="https://script.google.com/macros/s/…/exec" node build-scenario-builder.js
// Falls back to the shared league /exec URL (same endpoint Standings uses).

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR      = __dirname;
const SRC_HTML = path.join(DIR, 'Projections', 'Scenario Builder MFL Message.html');
const DATA_JS  = path.join(DIR, 'Projections', 'sb-data-live.js');
const OUT_PATH = path.join(DIR, 'home-message-scenario-builder.html');

// Live Apps Script Web App /exec URL — the SAME deployment that powers Standings
// and Power Rankings (the payload already carries games + upcoming + rankings).
const WEBAPP_URL = process.env.SB_WEBAPP_URL
  || process.env.PR_WEBAPP_URL
  || 'https://script.google.com/macros/s/AKfycbzPEJXZ0aL7GaveabunScoXiLhca0h52bYKJxXMkPdZexoEO186KreVclj7VcAGB_yW/exec';

const html = fs.readFileSync(SRC_HTML, 'utf-8');
const dataJs = fs.readFileSync(DATA_JS, 'utf-8').replace(/__WEBAPP_URL__/g, WEBAPP_URL);

// ---------------------------------------------------------------------------
// Extract the paste block between the MFL markers (drops the standalone
// <!DOCTYPE>/<html>/<head>/<body> scaffold that wraps it for local preview).
// ---------------------------------------------------------------------------
const block = html.match(/START MFL MESSAGE[^\n]*-->([\s\S]*?)<!--\s*=+\s*END MFL MESSAGE/);
if (!block) {
  console.error('ERROR: could not find the START/END MFL MESSAGE markers in ' + SRC_HTML);
  process.exit(1);
}
let fragment = block[1].trim();

// ---------------------------------------------------------------------------
// Inline the live-data loader BEFORE the engine script so window.CFFB_SB_LOAD
// is defined by the time the engine's init() runs. The engine is the only
// <script> in the fragment, so inject ahead of its first occurrence.
// ---------------------------------------------------------------------------
if (fragment.indexOf('<script>') === -1) {
  console.error('ERROR: engine <script> not found in the Scenario Builder fragment.');
  process.exit(1);
}
const dataBlock = '<script>\n' + dataJs + '\n</script>\n';
fragment = fragment.replace('<script>', dataBlock + '<script>');

// ---------------------------------------------------------------------------
// Guards + output
// ---------------------------------------------------------------------------
let out = fragment;

// MFL rejects messages containing these tags (the message embeds inside MFL's
// own page). <link>/<style>/<script>/<svg> are allowed.
const banned = /<\/?(?:html|head|body|textarea)\b[^>]*>/i;
if (banned.test(out)) {
  const m = out.match(banned)[0];
  const idx = out.search(banned);
  console.error('ERROR: output contains a banned MFL tag: ' + m);
  console.error('       …' + out.slice(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ') + '…');
  process.exit(1);
}

// Strip HTML comments to save bytes (keeps data: URIs / scripts intact).
out = out.replace(/<!--[\s\S]*?-->\s*/g, '');

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
const kb = (bytes / 1024).toFixed(1);
console.log('home-message-scenario-builder.html generated.');
console.log('  Path: ' + OUT_PATH);
console.log('  Size: ' + bytes + ' bytes (' + kb + ' KB) — MFL limit is 768 KB');
console.log('  Web app URL: ' + WEBAPP_URL);
if (bytes > 768 * 1024) {
  console.warn('  WARNING: exceeds MFL 768 KB home-message limit.');
}
