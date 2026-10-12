#!/usr/bin/env node
/*
 * build-league-guide.js
 * ---------------------------------------------------------------------------
 * Regenerates the paste-ready MFL home-page message for the League Guide.
 *
 *   SOURCE : League Guide/League Guide MFL Message.html   (edit this one)
 *   OUTPUT : home-message-league-guide.html               (paste into MFL)
 *
 * The source file is a full, browser-openable document (it has <!doctype>/
 * <html>/<head>/<body> wrappers and is what the mobile-preview harness loads).
 * MFL's Home Page Message strips page-wrapper tags, so the pasteable widget is
 * only the block between the START/END MFL MESSAGE comments. This script lifts
 * that block out, drops the wrappers and the START/END markers, and prepends a
 * short header comment — matching the other home-message-*.html files.
 *
 * Unlike the React widgets there is nothing to bundle here (the League Guide is
 * hand-authored vanilla JS/CSS), so this is a pure extract-and-wrap step.
 *
 * Usage:  node build-league-guide.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'League Guide', 'League Guide MFL Message.html');
const OUT = path.join(__dirname, 'home-message-league-guide.html');

const HEADER = `<!-- CFFB League Guide — MFL Home Page Message. This whole file is the paste-ready
     block: copy it all into MFL’s Home Page Message. It merges the Bylaws and the
     Site Map into one guide (one bar, one search). It carries no page-wrapper tags
     (doctype / html / head / body), so it passes MFL’s tag filter, and also opens
     directly in a browser for preview.
     Source/design lives in “League Guide/League Guide MFL Message.html” — edit
     there (it has the browser wrapper + mobile-preview harness), then run
     \`node build-league-guide.js\` to regenerate this file. -->
`;

function fail(msg) { console.error('build-league-guide: ' + msg); process.exit(1); }

const src = fs.readFileSync(SRC, 'utf8');

const startIdx = src.indexOf('START MFL MESSAGE');
const endIdx = src.indexOf('END MFL MESSAGE');
if (startIdx < 0) fail('could not find the "START MFL MESSAGE" marker in the source.');
if (endIdx < 0) fail('could not find the "END MFL MESSAGE" marker in the source.');

const bodyStart = src.indexOf('-->', startIdx) + 3;   // end of the START comment
const bodyEnd = src.lastIndexOf('<!--', endIdx);      // start of the END comment
if (bodyStart < 3 || bodyEnd <= bodyStart) fail('markers found but the block boundaries look wrong.');

const body = src.slice(bodyStart, bodyEnd).trim() + '\n';
const out = HEADER + body;

// Guard: the paste-ready block must not carry page-wrapper tags (MFL strips them).
if (/<!doctype|<html[\s>]|<\/html>|<head[\s>]|<\/head>|<body[\s>]|<\/body>/i.test(body)) {
  fail('extracted block still contains page-wrapper tags — check the START/END markers.');
}

fs.writeFileSync(OUT, out, 'utf8');
console.log('build-league-guide: wrote ' + path.basename(OUT) +
  ' (' + Buffer.byteLength(out) + ' bytes, ' + out.split('\n').length + ' lines)');
