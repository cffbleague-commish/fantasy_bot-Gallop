#!/usr/bin/env node
// build-contract-board.js
// Reads players.txt + template.html, generates home-message.html.
// Run: node build-contract-board.js

'use strict';

const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ============================================================
//  TEAM COLORS — used for inline --team-bg/--team-fg/--team-border
//  on .team-tag elements. Add or edit teams here as needed.
// ============================================================

const TEAM_COLORS = {
  ILL:  { bg: '#13294B', fg: '#E84A27', border: '#E84A27', name: 'Illinois Fighting Illini' },
  IU:   { bg: '#990000', fg: '#F5F5F5', border: '#990000', name: 'Indiana Hoosiers' },
  IOWA: { bg: '#FFCD00', fg: '#000000', border: '#000000', name: 'Iowa Hawkeyes' },
  MICH: { bg: '#00274C', fg: '#FFCB05', border: '#00274C', name: 'Michigan Wolverines' },
  MINN: { bg: '#7A0019', fg: '#FFCC33', border: '#7A0019', name: 'Minnesota Golden Gophers' },
  MSU:  { bg: '#18453B', fg: '#FFFFFF', border: '#18453B', name: 'Michigan State Spartans' },
  NAVY: { bg: '#003B5C', fg: '#C5B783', border: '#003B5C', name: 'Navy Midshipmen' },
  ND:   { bg: '#0C2340', fg: '#C99700', border: '#C99700', name: 'Notre Dame Fighting Irish' },
  NEB:  { bg: '#E41C38', fg: '#FFFFFF', border: '#E41C38', name: 'Nebraska Cornhuskers' },
  NU:   { bg: '#4E2A84', fg: '#FFFFFF', border: '#4E2A84', name: 'Northwestern Wildcats' },
  OSU:  { bg: '#BB0000', fg: '#F5F5F5', border: '#666666', name: 'Ohio State Buckeyes' },
  PSU:  { bg: '#041E42', fg: '#FFFFFF', border: '#041E42', name: 'Penn State Nittany Lions' },
  PUR:  { bg: '#000000', fg: '#CEB888', border: '#CEB888', name: 'Purdue Boilermakers' },
  RU:   { bg: '#CC0033', fg: '#FFFFFF', border: '#CC0033', name: 'Rutgers Scarlet Knights' },
  UMD:  { bg: '#E21833', fg: '#FFD200', border: '#E21833', name: 'Maryland Terrapins' },
  WISC: { bg: '#C5050C', fg: '#FFFFFF', border: '#C5050C', name: 'Wisconsin Badgers' },
};

const CLASS_ORDER = { FR: 1, SO: 2, JR: 3, SR: 4, GR: 5 };

// ============================================================
//  HTML HELPERS
// ============================================================

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a .team-tag span for a given owner code. */
function teamTagHtml(owner, isFreeAgent) {
  if (isFreeAgent) {
    return '<span class="team-tag team-tag--free-agent" title="Free Agent">FA</span>';
  }
  const tc = TEAM_COLORS[owner];
  const style = tc
    ? `style="--team-bg:${tc.bg};--team-fg:${tc.fg};--team-border:${tc.border}"`
    : '';
  const title = tc ? `title="${esc(tc.name)}"` : `title="${esc(owner)}"`;
  return `<span class="team-tag" ${style} ${title}>${esc(owner)}</span>`;
}

/** Build an .eligibility-chip span. */
function eligChipHtml(elig) {
  const cls = elig.toLowerCase();
  const labels = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate' };
  return `<span class="eligibility-chip eligibility-chip--${cls}" title="${labels[elig] || elig}">${esc(elig)}</span>`;
}

/** Build redshirt badge(s) for a parsed copy. */
function redshirtHtml(copy) {
  let html = '';
  if (copy.redshirt) {
    const yr = String(copy.redshirt.year).padStart(2, '0');
    html += `<span class="redshirt-badge redshirt-badge--traditional" title="Traditional Redshirt, 20${yr}">` +
      `<span class="redshirt-badge__icon" aria-hidden="true">\u{1F6E1}</span>` +
      `<span class="redshirt-badge__label">RS</span>` +
      `<span class="redshirt-badge__year">'${yr}</span>` +
      `</span>`;
  }
  if (copy.medicalRedshirt) {
    const yr = String(copy.medicalRedshirt.year).padStart(2, '0');
    html += `<span class="redshirt-badge redshirt-badge--medical" title="Medical Redshirt, 20${yr}">` +
      `<span class="redshirt-badge__icon" aria-hidden="true">\u{1F6E1}</span>` +
      `<span class="redshirt-badge__label">MRS</span>` +
      `<span class="redshirt-badge__year">'${yr}</span>` +
      `</span>`;
  }
  return html;
}

/** Build early-declare badge. */
function earlyDeclareHtml(copy) {
  if (!copy.isEarlyDeclare) return '';
  return `<span class="early-declare-badge" title="Early Declare">` +
    `<span class="early-declare-badge__icon" aria-hidden="true">\u2197</span>` +
    `<span class="early-declare-badge__label">EARLY</span>` +
    `</span>`;
}

/** Build award badge(s). */
function awardsHtml(copy) {
  let html = '';
  if (copy.awards.national > 0) {
    const count = copy.awards.national > 1
      ? `<span class="award-badge__count">\u00d7${copy.awards.national}</span>` : '';
    html += `<span class="award-badge award-badge--national" title="National Award${copy.awards.national > 1 ? 's' : ''}">` +
      `<span class="award-badge__icon" aria-hidden="true">\u2605</span>${count}</span>`;
  }
  if (copy.awards.allConference > 0) {
    const count = copy.awards.allConference > 1
      ? `<span class="award-badge__count">\u00d7${copy.awards.allConference}</span>` : '';
    html += `<span class="award-badge award-badge--all-conference" title="All-Conference${copy.awards.allConference > 1 ? 's' : ''}">` +
      `<span class="award-badge__icon" aria-hidden="true">\u2605</span>${count}</span>`;
  }
  return html;
}

/** Render a single copy's .player-card contents. Returns raw HTML string. */
function renderCopy(copy) {
  // Parse error — show raw string
  if (copy.error) {
    return `<span class="cfb-raw" title="${esc(copy.error)}">${esc(copy.raw)}</span>`;
  }

  const classes = ['player-card'];
  if (copy.isFreeAgent) classes.push('player-card--unowned');
  if (copy.eligibility === 'GR') classes.push('player-card--graduated');

  let inner = teamTagHtml(copy.owner, copy.isFreeAgent);
  inner += eligChipHtml(copy.eligibility);
  inner += redshirtHtml(copy);
  inner += earlyDeclareHtml(copy);
  inner += awardsHtml(copy);

  if (copy.eligibility === 'GR') {
    inner += '<span class="graduated-label">GRADUATED</span>';
  }

  return `<span class="${classes.join(' ')}">${inner}</span>`;
}

/** Count total awards across both copies. */
function totalAwards(p) {
  let n = 0;
  if (!p.copy1.error) n += p.copy1.awards.national + p.copy1.awards.allConference;
  if (!p.copy2.error) n += p.copy2.awards.national + p.copy2.awards.allConference;
  return n;
}

function isBothFa(p) {
  return (!p.copy1.error && p.copy1.isFreeAgent) &&
         (!p.copy2.error && p.copy2.isFreeAgent);
}

function hasRedshirt(p) {
  const c1 = !p.copy1.error && (p.copy1.redshirt || p.copy1.medicalRedshirt);
  const c2 = !p.copy2.error && (p.copy2.redshirt || p.copy2.medicalRedshirt);
  return !!(c1 || c2);
}

function primaryClass(p) {
  const a = p.copy1.error ? null : p.copy1.eligibility;
  const b = p.copy2.error ? null : p.copy2.eligibility;
  if (!a) return b || 'GR';
  if (!b) return a;
  return (CLASS_ORDER[a] || 9) <= (CLASS_ORDER[b] || 9) ? a : b;
}

function primaryTeam(p) {
  if (!p.copy1.error && !p.copy1.isFreeAgent) return p.copy1.owner;
  if (!p.copy2.error && !p.copy2.isFreeAgent) return p.copy2.owner;
  return 'FA';
}


// ============================================================
//  MAIN BUILD
// ============================================================

(async function main() {
  const DIR = __dirname;
  const playersPath  = path.join(DIR, 'players.txt');
  const templatePath = path.join(DIR, 'template.html');
  const outputPath   = path.join(DIR, 'home-message.html');

  // ---- Import parser (ES module) via dynamic import ----
  const parserUrl = pathToFileURL(path.join(DIR, 'mfl-player-parser.js')).href;
  const { parsePlayerLine } = await import(parserUrl);

  // ---- Read inputs ----
  const playersRaw = fs.readFileSync(playersPath, 'utf-8');
  const template   = fs.readFileSync(templatePath, 'utf-8');

  // ---- Parse all players ----
  const lines = playersRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const players = lines.map(line => {
    const p = parsePlayerLine(line);
    p._raw = line;
    return p;
  });

  // Separate good parses from line-level errors
  const good   = players.filter(p => !p.error);
  const errors = players.filter(p => p.error);

  if (errors.length > 0) {
    console.warn(`Warning: ${errors.length} line(s) failed to parse:`);
    errors.forEach(e => console.warn(`  ${e.error} — "${e.raw}"`));
  }

  // Sort alphabetically for the default static view
  good.sort((a, b) => {
    const la = a.name.last.toLowerCase(), lb = b.name.last.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    const fa = a.name.first.toLowerCase(), fb = b.name.first.toLowerCase();
    if (fa < fb) return -1;
    if (fa > fb) return 1;
    return 0;
  });

  // ---- Compute summary stats ----
  const stats = { total: good.length, rostered: 0, fa: 0, rs: 0, awards: 0 };
  const classCounts = { FR: 0, SO: 0, JR: 0, SR: 0, GR: 0 };
  const teamCounts = {};

  good.forEach(p => {
    const cls = primaryClass(p);
    classCounts[cls] = (classCounts[cls] || 0) + 1;

    if (isBothFa(p)) {
      stats.fa++;
    } else {
      stats.rostered++;
    }
    if (hasRedshirt(p)) stats.rs++;
    if (totalAwards(p) > 0) stats.awards++;

    const tm = primaryTeam(p);
    if (tm !== 'FA') teamCounts[tm] = (teamCounts[tm] || 0) + 1;
  });

  // ---- Generate summary HTML ----
  let summaryHtml = '';
  summaryHtml += `<span class="cfb-stat"><strong>${stats.total}</strong> players</span>`;
  summaryHtml += `<span class="cfb-stat cfb-stat--fr">FR <strong>${classCounts.FR}</strong></span>`;
  summaryHtml += `<span class="cfb-stat cfb-stat--so">SO <strong>${classCounts.SO}</strong></span>`;
  summaryHtml += `<span class="cfb-stat cfb-stat--jr">JR <strong>${classCounts.JR}</strong></span>`;
  summaryHtml += `<span class="cfb-stat cfb-stat--sr">SR <strong>${classCounts.SR}</strong></span>`;
  summaryHtml += `<span class="cfb-stat cfb-stat--gr">GR <strong>${classCounts.GR}</strong></span>`;
  summaryHtml += `<span class="cfb-stat">Rostered <strong>${stats.rostered}</strong></span>`;
  summaryHtml += `<span class="cfb-stat">Free Agents <strong>${stats.fa}</strong></span>`;
  summaryHtml += `<span class="cfb-stat">Redshirts <strong>${stats.rs}</strong></span>`;
  summaryHtml += `<span class="cfb-stat">Award Winners <strong>${stats.awards}</strong></span>`;

  // ---- Generate player card HTML ----
  let cardsHtml = '';

  good.forEach(p => {
    const name      = `${p.name.last}, ${p.name.first}`;
    const teamA     = p.copy1.error ? 'FA' : p.copy1.owner;
    const teamB     = p.copy2.error ? 'FA' : p.copy2.owner;
    const classA    = p.copy1.error ? 'GR' : p.copy1.eligibility;
    const classB    = p.copy2.error ? 'GR' : p.copy2.eligibility;
    const awCount   = totalAwards(p);
    const bothFa    = isBothFa(p) ? '1' : '0';

    cardsHtml += `<div class="cfb-row" role="listitem"` +
      ` data-name="${esc(name.toLowerCase())}"` +
      ` data-team-a="${esc(teamA)}"` +
      ` data-team-b="${esc(teamB)}"` +
      ` data-class-a="${esc(classA)}"` +
      ` data-class-b="${esc(classB)}"` +
      ` data-awards="${awCount}"` +
      ` data-fa="${bothFa}">\n`;

    cardsHtml += `  <div class="cfb-player-name">${esc(name)}</div>\n`;
    cardsHtml += `  <div class="cfb-copies">\n`;

    // Copy A
    cardsHtml += `    <div class="cfb-copy">`;
    cardsHtml += `<span class="cfb-copy-label">A</span>`;
    cardsHtml += renderCopy(p.copy1);
    cardsHtml += `</div>\n`;

    // Copy B
    cardsHtml += `    <div class="cfb-copy">`;
    cardsHtml += `<span class="cfb-copy-label">B</span>`;
    cardsHtml += renderCopy(p.copy2);
    cardsHtml += `</div>\n`;

    cardsHtml += `  </div>\n`;
    cardsHtml += `</div>\n`;
  });

  // ---- Fill template and write output ----
  let output = template
    .replace('{{SUMMARY}}', summaryHtml)
    .replace('{{PLAYER_CARDS}}', cardsHtml);

  fs.writeFileSync(outputPath, output, 'utf-8');

  console.log(`home-message.html generated successfully.`);
  console.log(`  Players: ${good.length} parsed, ${errors.length} error(s)`);
  console.log(`  Rostered: ${stats.rostered}  |  Free agents: ${stats.fa}`);
  console.log(`  Teams: ${Object.keys(teamCounts).sort().join(', ')}`);
  console.log(`  Class breakdown: FR=${classCounts.FR} SO=${classCounts.SO} JR=${classCounts.JR} SR=${classCounts.SR} GR=${classCounts.GR}`);

})().catch(err => {
  console.error('Build failed:', err.message || err);
  process.exit(1);
});
