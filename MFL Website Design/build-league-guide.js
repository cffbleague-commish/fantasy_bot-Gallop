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
 * Screenshot inlining: on MFL the message is served from a different path than
 * the "screenshots/" folder, so relative image paths 404 and every site-map
 * widget falls back to its placeholder. To make the message self-contained (the
 * same trick the Devy/Roster widgets use for their art), this build compresses
 * each screenshot and embeds it as a base64 data URI, then sets SM.img = ''.
 * Widgets with no screenshot yet (bylaws/auction/almanac) keep their relative
 * name, 404 harmlessly, and show the "coming soon" placeholder.
 *
 * Usage:  node build-league-guide.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'League Guide', 'League Guide MFL Message.html');
const SHOTS = path.join(__dirname, 'League Guide', 'screenshots');
const OUT = path.join(__dirname, 'home-message-league-guide.html');

// Widget key → screenshot basename (matches the img:'…' fields in the W array).
const SHOT_FILES = {
  standings: 'standings.jpg', roster: 'roster.jpg', rankings: 'rankings.jpg',
  gameday: 'gameday.jpg', live: 'live.jpg', playoffs: 'playoffs.jpg',
  awards: 'awards.jpg', devy: 'devy.jpg'
};
const SHOT_MAXWIDTH = 800;    // downscale wide captures; the detail panel renders ≤ ~780px
const SHOT_QUALITY = 60;      // JPEG quality for the inlined copies (keeps the message under MFL's 768 KB cap)

const HEADER = `<!-- CFFB League Guide — MFL Home Page Message. This whole file is the paste-ready
     block: copy it all into MFL’s Home Page Message. It merges the Bylaws and the
     Site Map into one guide (one bar, one search). Site-map screenshots are
     embedded as base64 so the message is self-contained — nothing to host.
     It carries no page-wrapper tags (doctype / html / head / body), so it passes
     MFL’s tag filter, and also opens directly in a browser for preview.
     Source/design lives in “League Guide/League Guide MFL Message.html” — edit
     there (it has the browser wrapper + mobile-preview harness), then run
     \`node build-league-guide.js\` to regenerate this file. -->
`;

function fail(msg) { console.error('build-league-guide: ' + msg); process.exit(1); }

async function dataUri(file) {
  const raw = fs.readFileSync(file);
  try {
    const sharp = require('sharp');
    const buf = await sharp(raw).resize({ width: SHOT_MAXWIDTH, withoutEnlargement: true })
      .jpeg({ quality: SHOT_QUALITY }).toBuffer();
    // keep whichever is smaller (a tiny capture may already beat a re-encode)
    const best = buf.length < raw.length ? buf : raw;
    return 'data:image/jpeg;base64,' + best.toString('base64');
  } catch (e) {
    console.warn('build-league-guide: sharp unavailable, inlining ' + path.basename(file) + ' uncompressed (' + e.code + ')');
    return 'data:image/jpeg;base64,' + raw.toString('base64');
  }
}

(async () => {
  const src = fs.readFileSync(SRC, 'utf8');

  const startIdx = src.indexOf('START MFL MESSAGE');
  const endIdx = src.indexOf('END MFL MESSAGE');
  if (startIdx < 0) fail('could not find the "START MFL MESSAGE" marker in the source.');
  if (endIdx < 0) fail('could not find the "END MFL MESSAGE" marker in the source.');

  const bodyStart = src.indexOf('-->', startIdx) + 3;   // end of the START comment
  const bodyEnd = src.lastIndexOf('<!--', endIdx);      // start of the END comment
  if (bodyStart < 3 || bodyEnd <= bodyStart) fail('markers found but the block boundaries look wrong.');

  let body = src.slice(bodyStart, bodyEnd).trim() + '\n';

  // Guard: the paste-ready block must not carry page-wrapper tags (MFL strips them).
  if (/<!doctype|<html[\s>]|<\/html>|<head[\s>]|<\/head>|<body[\s>]|<\/body>/i.test(body)) {
    fail('extracted block still contains page-wrapper tags — check the START/END markers.');
  }

  // Inline each screenshot that exists; report which widgets are still placeholders.
  const inlined = [], missing = [];
  for (const key of Object.keys(SHOT_FILES)) {
    const name = SHOT_FILES[key];
    const file = path.join(SHOTS, name);
    const token = "img:'" + name + "'";
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    if (body.indexOf(token) < 0) { console.warn('build-league-guide: token ' + token + ' not found in widget data.'); continue; }
    const uri = await dataUri(file);
    body = body.replace(token, "img:'" + uri + "'");
    inlined.push(name);
  }
  // Relative base is now unused for inlined shots; blank it so the remaining
  // placeholders (bylaws/auction/almanac) resolve to a harmless 404 → placeholder.
  if (inlined.length) body = body.replace("img: 'screenshots/',", "img: '',");

  const out = HEADER + body;
  fs.writeFileSync(OUT, out, 'utf8');
  console.log('build-league-guide: wrote ' + path.basename(OUT) +
    ' (' + Math.round(Buffer.byteLength(out) / 1024) + ' KB, ' + out.split('\n').length + ' lines)');
  console.log('  inlined ' + inlined.length + ' screenshots: ' + inlined.join(', '));
  console.log('  placeholder (no screenshot): bylaws, auction, almanac' +
    (missing.length ? '; also missing files: ' + missing.join(', ') : ''));
})();
