#!/usr/bin/env node
// build-player-awards.js
// Bundles the "Player Awards & Recruiting Dollars" DesignSync dashboard into a
// single self-contained HTML fragment for an MFL home page message.
//
// Unlike the other CFFB widgets (hand-written React), this component is authored
// in DesignSync (DCLogic + <sc-for>/<sc-if>), but its runtime (support.js) is
// itself built on React/ReactDOM — the SAME runtime the other widgets load and
// share. So the bundle inlines: the dc-runtime, the design-system CSS, the
// component template + logic, and a LIVE data adapter (pa-data-live.js) that
// pulls awards + recruiting dollars from the Apps Script /exec feed
// (?feed=awards) — the same deployment Power Rankings / Standings / Ledger use.
//
// Usage:  node build-player-awards.js   (or: npm run build:player-awards)

'use strict';

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR      = __dirname;
const SRC_DIR  = path.join(DIR, 'Player Awards & Recruiting Dollars', 'player-awards');
const DC_PATH        = path.join(SRC_DIR, 'PlayerAwards.dc.html');
const RUNTIME_PATH   = path.join(SRC_DIR, 'support.js');
const DATA_LIVE_PATH = path.join(SRC_DIR, 'pa-data-live.js');
const OUT_PATH       = path.join(DIR, 'home-message-player-awards.html');

// Shared design system (sibling Apps Script project) — inline for self-containment.
const DS_DIR = path.join(DIR, '..', 'apps_script_recruiting', 'CFFB Design System');
const CSS_FILES = ['colors_and_type.css', 'cffb.css'];

// Same /exec deployment as Power Rankings / Standings / Ledger. The feed rides
// it via ?feed=awards. Overridable via PA_WEBAPP_URL / PR_WEBAPP_URL.
const WEBAPP_URL = process.env.PA_WEBAPP_URL
  || process.env.PR_WEBAPP_URL
  || 'https://script.google.com/macros/s/AKfycbzPEJXZ0aL7GaveabunScoXiLhca0h52bYKJxXMkPdZexoEO186KreVclj7VcAGB_yW/exec';

function read(p) { return fs.readFileSync(p, 'utf-8'); }

// ---------------------------------------------------------------------------
// Conference logos -> inlined data URIs (window.__CFFB_AWARDS_LOGOS)
// Keyed by the dashboard's canonical conf ids. Note pac -> pac12.png. Same
// downscale pipeline the other widgets use (render at ~22px).
// ---------------------------------------------------------------------------

const CONF_LOGO_DIR = path.join(DS_DIR, 'assets', 'conferences');
const CONF_LOGO_FILES = { sec: 'sec.png', b1g: 'b1g.png', acc: 'acc.png', big12: 'big12.png', pac: 'pac12.png', aac: 'aac.png' };
const LOGO_MAX = 72;

function downscalePng(buf) {
  const src = PNG.sync.read(buf);
  const scale = Math.min(1, LOGO_MAX / Math.max(src.width, src.height));
  if (scale >= 1) return PNG.sync.write(src);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const dst = new PNG({ width: dw, height: dh });
  const sx = src.width / dw, sy = src.height / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(src.width, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(src.height, Math.ceil((y + 1) * sy));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (src.width * yy + xx) << 2;
          const al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
        }
      }
      const di = (dw * y + x) << 2;
      dst.data[di]     = a ? Math.round(r / a) : 0;
      dst.data[di + 1] = a ? Math.round(g / a) : 0;
      dst.data[di + 2] = a ? Math.round(b / a) : 0;
      dst.data[di + 3] = Math.round(a / n);
    }
  }
  return PNG.sync.write(dst);
}

const confLogos = {};
Object.keys(CONF_LOGO_FILES).forEach((conf) => {
  const p = path.join(CONF_LOGO_DIR, CONF_LOGO_FILES[conf]);
  if (!fs.existsSync(p)) { console.warn('warn: conference logo not found: ' + p); return; }
  let png;
  try { png = downscalePng(fs.readFileSync(p)); }
  catch (e) { console.warn('warn: could not downscale ' + conf + ' (' + e.message + ')'); png = fs.readFileSync(p); }
  confLogos[conf] = 'data:image/png;base64,' + png.toString('base64');
});

// ---------------------------------------------------------------------------
// Extract the DesignSync component: <x-dc> template + the DCLogic script.
// ---------------------------------------------------------------------------

const dcSrc = read(DC_PATH);

const xdcMatch = dcSrc.match(/<x-dc>[\s\S]*?<\/x-dc>/);
if (!xdcMatch) { console.error('ERROR: <x-dc> block not found in ' + DC_PATH); process.exit(1); }
let template = xdcMatch[0];

// The <helmet> loads the design system + sample data via <script src>. On MFL we
// inline the DS CSS ourselves and feed LIVE data, so drop those loaders. Their
// keyframe <style> stays.
template = template.replace(/<script\s+src="\.\/(?:ds-base|awards-data|recruiting-data)\.js"><\/script>\s*/g, '');

const dcScriptMatch = dcSrc.match(/<script\s+type="text\/x-dc"[\s\S]*?<\/script>/);
if (!dcScriptMatch) { console.error('ERROR: data-dc-script block not found in ' + DC_PATH); process.exit(1); }
const dcScript = dcScriptMatch[0];

// ---------------------------------------------------------------------------
// dc-runtime + live data adapter.
// ---------------------------------------------------------------------------

// The runtime injects FULL_PAGE_CSS (html,body{...}) only when no $preview is
// present; the component keeps $preview so it is skipped. Neutralize the
// html,body rule anyway so it can never repaint MFL's page.
let runtime = read(RUNTIME_PATH).replace('html,body{height:100%;margin:0}', '');

let dataLive = read(DATA_LIVE_PATH).replace(/__WEBAPP_URL__/g, WEBAPP_URL);

// ---------------------------------------------------------------------------
// Design system CSS — strip the global reset so it can't leak onto MFL chrome
// (identical treatment to build-live-scoring.js). Every .cffb-* class rule and
// the :root tokens are safe to keep.
// ---------------------------------------------------------------------------

const dsCss = CSS_FILES.map((f) => {
  const p = path.join(DS_DIR, f);
  if (!fs.existsSync(p)) { console.warn('warn: design-system css not found: ' + p); return ''; }
  return read(p);
}).join('\n');

const safeCss = dsCss
  .replace(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*\}/g, '')
  .replace(/\bhtml\s*,\s*body\s*\{[^}]*\}/g, '')
  .replace(/(^|\n)\s*body\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a\s*\{[^}]*\}/g, '$1')
  .replace(/(^|\n)\s*a:hover\s*\{[^}]*\}/g, '$1');

const extraCss = [
  '.cffb-boot{padding:40px;text-align:center;color:var(--fg-secondary,#9A9A96);font-family:var(--font-body,sans-serif)}',
].join('\n');

// ---------------------------------------------------------------------------
// Executable boot. Mirrors build-live-scoring.js: guarded IIFE, shares one React
// runtime across CFFB widgets via window.__cffbReactPromise, then runs the
// inlined dc-runtime (which finds our <x-dc> and mounts it). The live adapter
// kicks off the feed fetch; the component polls for the globals and re-renders.
// ---------------------------------------------------------------------------

const bootScript = [
  '(function () {',
  '  if (window.__cffbPlayerAwardsBooted) return;',
  '  window.__cffbPlayerAwardsBooted = true;',
  '  window.__resources = true;',   // skip the runtime\'s self re-fetch of location.href
  '  window.__CFFB_AWARDS_LOGOS = ' + JSON.stringify(confLogos) + ';',
  '  function __paData() {',
  dataLive,
  '  }',
  '  function __paRuntime() {',
  runtime,
  '  }',
  '  try { __paData(); } catch (e) { console.error("[CFFB Player Awards] data adapter error:", e); }',
  '  var RV = "18.3.1";',
  '  function ready() { return window.React && window.ReactDOM && window.ReactDOM.createRoot; }',
  '  if (ready()) { __paRuntime(); return; }',
  '  window.__cffbReactPromise = window.__cffbReactPromise || new Promise(function (resolve) {',
  '    function load(src, cb) { var s = document.createElement("script"); s.src = src; s.crossOrigin = "anonymous"; s.onload = cb; s.onerror = cb; document.head.appendChild(s); }',
  '    load("https://unpkg.com/react@" + RV + "/umd/react.production.min.js", function () {',
  '      load("https://unpkg.com/react-dom@" + RV + "/umd/react-dom.production.min.js", resolve);',
  '    });',
  '  });',
  '  window.__cffbReactPromise.then(__paRuntime);',
  '})();'
].join('\n');

// ---------------------------------------------------------------------------
// Assemble fragment (no <html>/<head>/<body> — embedded in MFL's own page).
// Order matters: the static <x-dc> + dc-script must precede the boot so the
// runtime's document.querySelector("x-dc") finds them.
// ---------------------------------------------------------------------------

let out = [
  '<style>',
  safeCss,
  extraCss,
  '</style>',
  template,
  dcScript,
  '<script>',
  bootScript,
  '</script>'
].join('\n');

// Strip HTML comments (saves bytes; also removes any tag names hiding in
// comments before the banned-tag check).
out = out.replace(/<!--[\s\S]*?-->\s*/g, '');

// Sanity check: never ship a tag MFL rejects.
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
console.log('home-message-player-awards.html generated.');
console.log('  Path: ' + OUT_PATH);
console.log('  Feed: ' + WEBAPP_URL + '?feed=awards');
console.log('  Logos inlined: ' + Object.keys(confLogos).join(', '));
console.log('  Size: ' + bytes + ' bytes (' + (bytes / 1024).toFixed(1) + ' KB) — MFL limit is 768 KB');
