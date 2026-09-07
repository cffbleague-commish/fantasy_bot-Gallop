// CFFB · Live Scoring — LIVE data layer
// ---------------------------------------------------------------------------
// Feeds ls-app.jsx with real, live head-to-head scoring from the MFL export
// API. The widget runs ON an MFL page (a home-page message), so every export
// call is SAME-ORIGIN (no CORS). It reads the page globals:
//   window.franchiseDatabase  fid_XXXX -> Franchise(id,name,division,icon,logo,abbrev)
//   window.franchise_id       the signed-in franchise ('0000' = commissioner)
//   window.league_id          the league id (e.g. '12011')
//   window.currentWeek        the live scoring week (falls back to a clock guess)
//
// Data sources (all real MFL data):
//   TYPE=players&DETAILS=1        player identity (name / position / NFL team) — cached
//   TYPE=projectedScores&W=WEEK   pre-scored projected fantasy points       — cached
//   TYPE=liveScoring&W=WEEK       live franchise + per-player scores + clock — never cached
//
// Per-player live/pre/final state is derived from gameSecondsRemaining, whose
// semantics are confirmed against MFL's own mfl_common.js: < 3600 = currently
// playing, 3600 (or unset) = yet to play, 0 = game over.
//
// Win probability is a fast normal-distribution ESTIMATE from the projected
// margin (NOT MFL's exact 400-sim Monte Carlo) — labeled as such in the UI.
//
// It exposes the identifiers ls-app.jsx consumes: TEAMS, MY_FID, POS_COLORS,
// CONF_ACCENT, MFL_PLAYER_LINK, LS_PAYLOAD, plus window.__loadLiveScoring
// (awaited by the boot wrapper) and window.__refreshLiveScoring (the poll).

// ── Static maps ───────────────────────────────────────────────────────────────
const CONF_ACCENT = { sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A' };
const CONF_ORDER  = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];
// MFL franchise division code -> conference id.
const DIV_TO_CONF = { '00': 'acc', '01': 'b1g', '02': 'big12', '03': 'pac', '04': 'sec', '05': 'aac' };
const POS_COLORS = { QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547', DB: '#6E86A8', K: '#5C7A6A' };
// Normalize MFL positions into the buckets we color by.
const POS_MAP = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', PK: 'K', K: 'K',
  DB: 'DB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB', DE: 'DB', DL: 'DB', DT: 'DB', LB: 'DB', ILB: 'DB', OLB: 'DB',
};
const normPos = (pos) => POS_MAP[(pos || '').toUpperCase()] || 'WR';

// ── Live state (populated during load; ls-app reads these at render) ──────────
let SEASON = 2026;
let WEEK = 1;
let SLATE = '';
let MY_FID = '';          // signed-in franchise id ('' or '0000' = commissioner)
let TEAMS = {};           // fid -> { name, abbr, conf, fg, pill, pill2, fid }
let MFL_CTX = { origin: '', host: '', year: '2026', league: '12011' };

let PLAYERS_BY_ID = {};   // pid -> { name, pos, team, playerId }
let PROJ_BY_ID = {};      // pid -> projected fantasy points (number)
let PREV_PTS = {};        // pid -> last-seen live points (for delta/flash diffing)
let LS_PAYLOAD = null;    // last built payload { week, slate, matchups, flashes, ts }

// MFL league *pages* (/player, etc.) are bound to the league's numbered server
// (www46). Player links must target the resolved numbered host, not a custom
// domain / balancer (which 403s). Export calls work on any host (MFL_CTX.origin).
const MFL_PLAYER_LINK = (pid) => `${MFL_CTX.host || MFL_CTX.origin}/${MFL_CTX.year}/player?L=${MFL_CTX.league}&P=${pid}`;
// MFL player headshot (same path the Roster Board / Player Ledger use). Missing
// photos error out → the initials placeholder shows through.
const PLAYER_PHOTO = (pid) => `https://www46.myfantasyleague.com/player_photos_2014/${pid}_thumb.jpg`;

const initialsOf = (name) => {
  // MFL names are "Last, First" — show First-Last initials.
  const clean = name.indexOf(',') >= 0 ? name.split(',').reverse().join(' ') : name;
  return clean.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
};
const displayName = (name) => (name.indexOf(',') >= 0 ? name.split(',').map((s) => s.trim()).reverse().join(' ') : name);

// ── MFL context + franchise directory ────────────────────────────────────────
const MFL_HOST_RE = /^https?:\/\/www\d+\.myfantasyleague\.com/i;
function resolveMflHost(origin) {
  try {
    const om = String(origin).match(MFL_HOST_RE);
    if (om) return om[0];
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      const nodes = document.querySelectorAll('script[src],link[href],img[src],a[href]');
      for (let i = 0; i < nodes.length; i++) {
        const m = String(nodes[i].src || nodes[i].href || '').match(MFL_HOST_RE);
        if (m) return m[0];
      }
    }
  } catch (e) { /* ignore */ }
  return origin;
}
function resolveCtx() {
  const origin = location.origin;
  const host = resolveMflHost(origin);
  const yr = (String(location.pathname).match(/\/(20\d{2})\//) || [])[1]
    || (String(location.href).match(/\/(20\d{2})\//) || [])[1]
    || String(SEASON);
  const league = String(window.league_id || (String(location.href).match(/[?&]L=(\d+)/) || [])[1] || '12011');
  MFL_CTX = { origin, host, year: yr, league };
  SEASON = parseInt(yr, 10) || SEASON;
  if (host !== origin) console.log('[CFFB Live Scoring] player links use MFL host ' + host + ' (page origin ' + origin + ')');
}

// MFL franchise ICON URLs are often imgur "gallery" links (imgur.com/{id}.png),
// which render unreliably as <img> sources; rewrite them to the direct CDN.
function imgurDirect(u) {
  const m = String(u || '').match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)(?:\.[A-Za-z0-9]+)?$/i);
  return m ? 'https://i.imgur.com/' + m[1] + '.png' : (u || '');
}
function buildTeams() {
  const db = window.franchiseDatabase || {};
  const teams = {};
  Object.keys(db).forEach((key) => {
    const f = db[key];
    if (!f || !f.id || f.id === '0000') return;              // skip commissioner pseudo-franchise
    const abbr = (f.abbrev || f.id).toUpperCase();
    const conf = DIV_TO_CONF[f.division] || 'acc';
    teams[f.id] = {
      name: f.name || abbr,
      abbr,
      conf,
      fg: '#E8E7E4',
      pill: imgurDirect(f.icon),    // franchise ICON (small pill) — shown first
      pill2: imgurDirect(f.logo),   // franchise LOGO — fallback if the icon fails to load
      fid: f.id,
    };
  });
  TEAMS = teams;
  MY_FID = String(window.franchise_id || '');
  console.log('[CFFB Live Scoring] ' + Object.keys(teams).length + ' franchises; signed-in franchise_id='
    + (MY_FID || '(none)') + (teams[MY_FID] ? ' (' + teams[MY_FID].abbr + ')' : ' (commissioner/unknown)'));
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchJSON(type, extra) {
  const url = `${MFL_CTX.origin}/${MFL_CTX.year}/export?TYPE=${type}&L=${MFL_CTX.league}&JSON=1${extra || ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + type);
  return res.json();
}
const asArray = (x) => (Array.isArray(x) ? x : x != null ? [x] : []);

// Best-effort current NFL week from the browser clock (fallback when the page
// exposes no week global). Week 1 ~ the first Tuesday of September of the season.
function guessNflWeek(y) {
  try {
    const now = new Date();
    const sep1 = new Date(y, 8, 1);
    const firstTue = new Date(y, 8, 1 + ((2 - sep1.getDay() + 7) % 7));
    const wk = Math.floor((now - firstTue) / (7 * 864e5)) + 1;
    return Math.min(Math.max(wk, 1), 18);
  } catch (e) { return 1; }
}

// ── Per-player game state (confirmed vs MFL's mfl_common.js) ──────────────────
// gameSecondsRemaining: < 3600 = currently playing, 3600/unset = yet to play, 0 = final.
function gameStateOf(gsr) {
  const s = parseFloat(gsr);
  if (!isFinite(s) || s >= 3600) return 'PRE';
  if (s <= 0) return 'FINAL';
  return 'LIVE';
}

// ── Win probability — normal-distribution ESTIMATE ────────────────────────────
// Standard-normal CDF via the Abramowitz-Stegun 26.2.17 approximation.
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
// Home win % from the projected-final margin. sigma shrinks toward ~0 as starters
// finish, so once every game is FINAL the leader reads ~99%.
function winProb(home, away) {
  const margin = home.proj - away.proj;
  const totalStart = home.starters.length + away.starters.length;
  const openStart = home.playing + home.left + away.playing + away.left; // still-in-play starters
  const sigma = Math.max(1, 26 * Math.sqrt(openStart / Math.max(1, totalStart)));
  return Math.round(Math.max(1, Math.min(99, normCdf(margin / sigma) * 100)));
}

// ── Build model from feeds ────────────────────────────────────────────────────
function buildSide(frNode) {
  const fid = String(frNode.id || '');
  const t = TEAMS[fid] || { name: fid, abbr: fid, conf: 'acc', fg: '#E8E7E4', pill: '', pill2: '', fid };
  const players = asArray(frNode.players && frNode.players.player).map((pl) => {
    const pid = String(pl.id);
    const idn = PLAYERS_BY_ID[pid] || { name: pid, pos: 'WR', team: '', playerId: pid };
    const st = gameStateOf(pl.gameSecondsRemaining);
    const proj = (pid in PROJ_BY_ID) ? PROJ_BY_ID[pid] : null;
    return {
      pid,
      bench: String(pl.status || '').toLowerCase() === 'nonstarter',
      pos: normPos(idn.pos),
      name: displayName(idn.name),
      initials: initialsOf(idn.name),
      photo: idn.playerId ? PLAYER_PHOTO(idn.playerId) : null,
      playerId: idn.playerId,
      team: idn.team || '',
      pts: parseFloat(pl.score) || 0,
      proj,
      st,
      gameDetail: st === 'FINAL' ? 'Final' : st === 'PRE' ? 'To play' : 'Live',
      isLive: st === 'LIVE',
    };
  });
  const starters = players.filter((p) => !p.bench);
  const bench = players.filter((p) => p.bench);
  const n = (st) => starters.filter((p) => p.st === st).length;
  // Team total: MFL's franchise-level score is authoritative; fall back to summed starters.
  const teamPts = (frNode.score != null && frNode.score !== '') ? parseFloat(frNode.score) : starters.reduce((a, p) => a + p.pts, 0);
  // Projected final: finished players lock at pts; others take max(pts, proj).
  const teamProj = starters.reduce((a, p) => a + (p.st === 'FINAL' ? p.pts : Math.max(p.pts, p.proj != null ? p.proj : p.pts)), 0);
  return {
    fid, key: fid, name: t.name, abbr: t.abbr, conf: t.conf,
    color: CONF_ACCENT[t.conf] || '#5A5A5A', txt: t.fg, pill: t.pill, pill2: t.pill2,
    pts: teamPts, proj: teamProj,
    starters, bench,
    playing: n('LIVE'), left: n('PRE'), done: n('FINAL'),
  };
}

// Pair matchups from liveScoring. Franchise order within a matchup is not a true
// home/away — index 0 renders left ("away"), index 1 right ("home"). Presentational
// only; no scoring impact.
function buildMatchups(ld) {
  const ls = ld && ld.liveScoring;
  const rawMatchups = asArray(ls && ls.matchup);
  return rawMatchups.map((mt) => {
    const fs = asArray(mt.franchise);
    const away = buildSide(fs[0] || {});
    const home = buildSide(fs[1] || {});
    return { away, home, homeProb: winProb(home, away) };
  }).filter((m) => m.away.fid && m.home.fid);
}

// Diff live points vs the previous poll → flash/delta badges on real changes.
function computeDeltas(matchups) {
  const flashes = {};
  matchups.forEach((m) => [m.away, m.home].forEach((s) => {
    [...s.starters, ...s.bench].forEach((p) => {
      const prev = PREV_PTS[p.pid];
      if (prev != null && Math.abs(p.pts - prev) >= 0.05 && p.st !== 'PRE') {
        const d = +(p.pts - prev).toFixed(1);
        if (d !== 0) flashes[s.key + '|' + p.pid] = { dir: d >= 0 ? 'up' : 'dn', delta: (d > 0 ? '+' : '') + d.toFixed(1) };
      }
      PREV_PTS[p.pid] = p.pts;
    });
  }));
  return flashes;
}

// Short "slate" summary from live/final counts across all games.
function slateSummary(matchups) {
  let live = 0, final = 0, pre = 0;
  matchups.forEach((m) => [m.away, m.home].forEach((s) => { live += s.playing; final += s.done; pre += s.left; }));
  const parts = [];
  if (live) parts.push(live + ' playing');
  if (pre) parts.push(pre + ' to play');
  if (final) parts.push(final + ' final');
  return parts.join(' · ') || 'No games in progress';
}

// ── Static feeds (cacheable) ──────────────────────────────────────────────────
const LS_CACHE_KEY = 'cffb_live_scoring_static_v1';
const LS_CACHE_MS = 5 * 60 * 1000; // projections drift slowly; identity even slower
function readStaticCache() {
  try {
    const rec = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || 'null');
    if (!rec || typeof rec.ts !== 'number') return null;
    if (rec.week !== WEEK || rec.year !== MFL_CTX.year) return null;
    if (Date.now() - rec.ts > LS_CACHE_MS) return null;
    return rec.payload;
  } catch (e) { return null; }
}
function writeStaticCache(payload) {
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ ts: Date.now(), week: WEEK, year: MFL_CTX.year, payload })); }
  catch (e) { /* ignore */ }
}
async function fetchStatic() {
  const cached = readStaticCache();
  if (cached) { PLAYERS_BY_ID = cached.players || {}; PROJ_BY_ID = cached.proj || {}; return; }
  const [playersD, projD] = await Promise.all([
    fetchJSON('players', '&DETAILS=1'),
    fetchJSON('projectedScores', '&W=' + WEEK).catch((e) => { console.warn('[CFFB Live Scoring] projectedScores failed:', e && e.message); return null; }),
  ]);
  const players = {};
  asArray(playersD && playersD.players && playersD.players.player).forEach((p) => {
    players[String(p.id)] = { name: p.name || String(p.id), pos: p.position || 'WR', team: (p.team || '').toUpperCase(), playerId: String(p.id) };
  });
  const proj = {};
  asArray(projD && projD.projectedScores && projD.projectedScores.playerScore).forEach((s) => {
    const v = parseFloat(s.score);
    if (isFinite(v)) proj[String(s.id)] = v;
  });
  PLAYERS_BY_ID = players;
  PROJ_BY_ID = proj;
  console.log('[CFFB Live Scoring] identity ' + Object.keys(players).length + ' players, projections ' + Object.keys(proj).length);
  writeStaticCache({ players, proj });
}

// ── Public API ────────────────────────────────────────────────────────────────
// Fresh liveScoring fetch → matchups → deltas → payload. Never cached.
async function refreshLiveScoring() {
  const ld = await fetchJSON('liveScoring', '&W=' + WEEK);
  const matchups = buildMatchups(ld);
  const flashes = computeDeltas(matchups);
  SLATE = slateSummary(matchups);
  LS_PAYLOAD = { week: WEEK, slate: SLATE, matchups, flashes, myFid: MY_FID, ts: Date.now() };
  return LS_PAYLOAD;
}

// Awaited by the boot wrapper before first mount.
async function loadLiveScoring() {
  resolveCtx();
  buildTeams();
  WEEK = parseInt(window.currentWeek, 10) || parseInt(window.liveScoringWeek, 10) || guessNflWeek(SEASON);
  console.log('[CFFB Live Scoring] context', MFL_CTX, 'week', WEEK);
  await fetchStatic();
  await refreshLiveScoring();   // seeds PREV_PTS; no flashes on first paint
}

window.__loadLiveScoring = loadLiveScoring;
window.__refreshLiveScoring = refreshLiveScoring;

// The build concatenates this file and ls-app.jsx into one function scope, so
// ls-app reads TEAMS / MY_FID / POS_COLORS / CONF_ACCENT / MFL_PLAYER_LINK /
// LS_PAYLOAD lexically. Only the loader needs to be reachable by name.
