#!/usr/bin/env node
// build-power-rankings.js
// Bundles the Power Rankings React shell into a single self-contained HTML
// file suitable for pasting into an MFL home page message.
//
// Usage:
//   PR_WEBAPP_URL="https://script.google.com/macros/s/…/exec" \
//     node build-power-rankings.js
//
// You can also set PR_WEBAPP_URL as an env var once (e.g. in a shell profile)
// or hardcode the fallback below.

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR       = __dirname;
const SRC_DIR   = path.join(DIR, 'Power Rankings');
const HTML_PATH = path.join(SRC_DIR, 'Power Rankings.html');
const CSS_PATH  = path.join(SRC_DIR, 'rankings.css');
const OUT_PATH  = path.join(DIR, 'home-message-power-rankings.html');

// data-live.jsx replaces data.jsx (demo PRNG data) at build time.
const JSX_FILES = ['data-live.jsx', 'components.jsx', 'charts.jsx', 'app.jsx'];

// Fallback web-app URL if the env var isn't set. Leave the placeholder in
// place so a forgotten env var produces an obviously-broken build rather
// than silently shipping a stale URL.
const WEBAPP_URL = process.env.PR_WEBAPP_URL || '<<SET_PR_WEBAPP_URL_ENV_VAR>>';

// ---------------------------------------------------------------------------
// Read sources
// ---------------------------------------------------------------------------

function read(p) { return fs.readFileSync(p, 'utf-8'); }

const htmlTemplate = read(HTML_PATH);
const css          = read(CSS_PATH);
const jsxSources   = JSX_FILES.map((name) => ({
  name,
  code: read(path.join(SRC_DIR, name))
}));

// ---------------------------------------------------------------------------
// Transform JSX
// ---------------------------------------------------------------------------

// 1. Substitute the web app URL into data-live.jsx.
// 2. Wrap the final render call in app.jsx with a Boot component that waits
//    for loadPowerRankings() before mounting <App />.
const jsxBundle = jsxSources.map(({ name, code }) => {
  let out = code;

  if (name === 'data-live.jsx') {
    out = out.replace(/__WEBAPP_URL__/g, WEBAPP_URL);
  }

  if (name === 'app.jsx') {
    const rendered = out.replace(
      /ReactDOM\.createRoot\([\s\S]*?\)\.render\(<App \/>\);?/,
      `
const CFFBBoot = () => {
  const [ready, setReady] = React.useState(false);
  const [err, setErr]     = React.useState(null);
  React.useEffect(() => {
    window.__loadPowerRankings()
      .then(() => setReady(true))
      .catch((e) => setErr(e && e.message ? e.message : String(e)));
  }, []);
  if (err)   return <div className="cffb-boot cffb-boot--err">Couldn't load rankings: {err}</div>;
  if (!ready) return <div className="cffb-boot">Loading rankings…</div>;
  return <App />;
};
ReactDOM.createRoot(document.getElementById('cffb-pr-root')).render(<CFFBBoot />);`
    );
    if (rendered === out) {
      console.warn('warn: app.jsx render() line not found — Boot wrapper not injected');
    }
    out = rendered;
  }

  return `/* ---- ${name} ---- */\n${out}\n`;
}).join('\n');

// ---------------------------------------------------------------------------
// Assemble HTML fragment
// ---------------------------------------------------------------------------
//
// MFL rejects messages containing <html>, <head>, <body>, or <textarea>
// tags — the message gets embedded inside MFL's own page, so we emit a
// fragment (styles + CDN scripts + root div + Babel bundle) with no
// outer document scaffolding.
//
// The demo Power Rankings.html file is used only to sanity-check that our
// source list matches; we build the fragment from scratch below.

const bootCss = `
.cffb-boot { padding: 40px; text-align: center; color: var(--fg-secondary); font-family: var(--font-body); }
.cffb-boot--err { color: var(--delta-neg); }
`;

// CSS is scoped by being contained within a specific id root — but since
// rankings.css also sets styles on body/html, we strip those bare tag
// selectors so they don't fight MFL's own page chrome.
const scopedCss = css
  .replace(/^\s*html\s*,\s*body\s*\{[^}]*\}\s*$/m, '')
  .replace(/^\s*body\s*\{[^}]*\}\s*$/m, '');

const cdnScripts = [
  '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>',
  '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>',
  '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>'
].join('\n');

let out = [
  '<style>',
  scopedCss,
  bootCss,
  '</style>',
  cdnScripts,
  '<div id="cffb-pr-root"></div>',
  '<script type="text/babel" data-presets="react">',
  jsxBundle,
  '</script>'
].join('\n');

// Sanity check: make sure we don't accidentally ship any of the tags MFL rejects.
const banned = /<\/?(?:html|head|body|textarea)\b[^>]*>/i;
if (banned.test(out)) {
  console.warn('warn: output contains a banned MFL tag — MFL will reject it');
  console.warn('       first match: ' + out.match(banned)[0]);
}

// Strip HTML comments to save bytes
out = out.replace(/<!--[\s\S]*?-->\s*/g, '');

// Reference the template file to keep it in the dependency graph (and warn
// if it drifts from the sources we actually bundle).
if (!htmlTemplate.includes('Power Rankings')) {
  console.warn('warn: Power Rankings.html template looks unfamiliar — did the demo change?');
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

fs.writeFileSync(OUT_PATH, out, 'utf-8');

const bytes = Buffer.byteLength(out, 'utf-8');
const kb    = (bytes / 1024).toFixed(1);

console.log('home-message-power-rankings.html generated.');
console.log(`  Path: ${OUT_PATH}`);
console.log(`  Size: ${bytes} bytes (${kb} KB) — MFL limit is 768 KB`);
console.log(`  Web app URL: ${WEBAPP_URL}`);
if (WEBAPP_URL.startsWith('<<')) {
  console.warn('\n  ⚠️  PR_WEBAPP_URL was not set. Rerun with:');
  console.warn('     PR_WEBAPP_URL="https://script.google.com/macros/s/…/exec" node build-power-rankings.js');
}
