// CFFB · Roster Board — LIVE data layer
// ---------------------------------------------------------------------------
// Replaces the sample rb-data.jsx at build time (build-roster-board.js swaps it
// in). It reads the MFL page globals and the MFL export API — the widget runs
// ON an MFL page, so every export call is SAME-ORIGIN (no CORS):
//   window.franchiseDatabase  fid_XXXX -> Franchise(id,name,division,icon,logo,abbrev)
//   window.franchise_id       the signed-in franchise ('0000' = commissioner)
//   window.league_id          the league id (e.g. '12011')
// Eligibility / redshirt / awards come from the league's encoded per-copy
// "contract" strings — the same format as players.txt and the roster page's
// player-link title ("BC_FR_r25"): OWNER_CLASS[_MODS], MODS = r|m + 2-digit year
// (traditional / medical redshirt), N|A + count (national / all-conference
// award), E (early declare). We locate that string field-agnostically (scan
// every string value of the export player object for the pattern) so it keeps
// working regardless of which MFL field the league stores it in.
//
// It exposes the SAME identifiers rb-app.jsx consumes: SEASON, THRU_WEEK,
// MY_TEAM, TEAMS, TEAM_ORDER, CONF_ACCENT, CONF_ORDER, CONF_META, POS_COLORS,
// buildRoster, plus MFL_PLAYER_LINK (used by the app for player-profile links)
// and window.__loadRosterBoard (awaited by the boot wrapper before mount).

// ── Static maps (from the design) ────────────────────────────────────────────
const CONF_ACCENT = { sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A' };
const CONF_ORDER  = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];
// Conference logos are inlined as base64 data URIs at build time (so the widget
// stays self-contained on MFL); ConfTabs falls back to the text label when a
// logo is absent (e.g. the standalone demo, where __CONF_LOGOS__ isn't injected).
const CONF_META = {
  sec:   { label: 'SEC' },
  b1g:   { label: 'B1G' },
  acc:   { label: 'ACC' },
  big12: { label: 'BIG 12' },
  pac:   { label: 'PAC' },
  aac:   { label: 'AAC' },
};
// The build assigns window.__CFFB_CONF_LOGOS once (a single copy of the base64
// blob); referenced here exactly once so it is never duplicated into the bundle.
const CONF_LOGOS = (typeof window !== 'undefined' && window.__CFFB_CONF_LOGOS) || {};
Object.keys(CONF_LOGOS).forEach((c) => { if (CONF_META[c]) CONF_META[c].logo = CONF_LOGOS[c]; });
// MFL franchise division code -> conference id.
const DIV_TO_CONF = { '00': 'acc', '01': 'b1g', '02': 'big12', '03': 'pac', '04': 'sec', '05': 'aac' };
const POS_COLORS = { QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547', DB: '#6E86A8', K: '#5C7A6A' };
const POS_ORDER  = ['QB', 'RB', 'WR', 'TE', 'DB', 'K'];
const CLASS_SEQ  = ['FR', 'SO', 'JR', 'SR', 'GR'];
// Normalize MFL positions into the six the board groups by.
const POS_MAP = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', PK: 'K', K: 'K',
  DB: 'DB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB', DE: 'DB', DL: 'DB', DT: 'DB', LB: 'DB', ILB: 'DB', OLB: 'DB',
};
const normPos = (pos) => POS_MAP[(pos || '').toUpperCase()] || 'WR';

// ── Live state (populated during load; rb-app reads these at render) ──────────
let SEASON = 2026;
let THRU_WEEK = 1;
let MY_TEAM = null;
let MY_FID = '';          // signed-in franchise id ('' or '0000' = commissioner → no writes)
let FID_TO_ABBR = {};     // retained so reloads after a roster move can rebuild
let TEAMS = {};
let TEAM_ORDER = [];
let MFL_CTX = { origin: '', host: '', year: '2026', league: '12011' };
// Per-player identity + per-team membership, built once from the export feeds.
let PLAYERS_BY_ID = {};   // pid -> { name, pos, pts, injury, initials, playerId }
let ROSTER_MEMBERS = {};  // teamAbbr -> [ { pid, status, enc } ]
let MEMBERSHIP = {};      // pid -> [teamAbbr, ...]
let BYE_BY_TEAM = {};     // NFL team abbr -> bye week (fallback when a player lacks bye_week)

// MFL's export *API* answers on any host, but league *pages* (/player, etc.) are
// bound to the league's numbered server (e.g. www46). Building the link from a
// custom domain or the generic balancer yields a 403 "Forbidden" page, so target
// the resolved numbered host (MFL_CTX.host), falling back to origin.
const MFL_PLAYER_LINK = (pid) => `${MFL_CTX.host || MFL_CTX.origin}/${MFL_CTX.year}/player?L=${MFL_CTX.league}&P=${pid}`;
// MFL player headshot (confirmed live path, same as the Player Ledger):
// /player_photos_2014/{id}_thumb.jpg. Missing photos error out → initials show.
const PLAYER_PHOTO = (pid) => `https://www46.myfantasyleague.com/player_photos_2014/${pid}_thumb.jpg`;

// ── Encoded contract-string parser (mirrors mfl-player-parser.js) ─────────────
// A single copy string: OWNER_CLASS[_MODS]. OWNER is the 4-digit MFL franchise id
// (e.g. "0032") or "FA" for a free-agent copy. Returns { owner, cls, redshirt, awards }.
const ENC_RE = /^(?:FA|\d{4})_(?:FR|SO|JR|SR|GR)(?:_[A-Za-z0-9]+)*$/;
function parseEncoded(str) {
  if (!str || !ENC_RE.test(str)) return null;
  const parts = str.split('_');
  const out = { owner: parts[0], cls: parts[1], redshirt: null, awards: [] };
  for (let i = 2; i < parts.length; i++) {
    const seg = parts[i];
    let j = 0;
    while (j < seg.length) {
      const ch = seg[j];
      if (ch === 'E') { j++; }
      else if (ch === 'r' || ch === 'm') {
        const yy = seg.slice(j + 1, j + 3);
        if (/^\d{2}$/.test(yy)) out.redshirt = { type: ch === 'm' ? 'med' : 'trad', year: 2000 + parseInt(yy, 10) };
        j += 3;
      } else if (ch === 'N' || ch === 'A') {
        const m = seg.slice(j + 1).match(/^(\d+)/);
        const count = m ? parseInt(m[1], 10) : 1;
        out.awards.push({ type: ch === 'N' ? 'national' : 'allconf', count });
        j += m ? 1 + m[1].length : 1;
      } else { j++; } // tolerate unknown modifier characters
    }
  }
  return out;
}

// Award objects in the shape the Awards component wants (kind -> GLYPHS key).
const encAwardToDisplay = (a) => ({
  kind: a.type === 'national' ? 'heisman' : 'allamerican',
  name: a.type === 'national' ? 'National' : 'All-Conf',
  count: a.count || 1,
  year: '',
  conf: null,
});

// Resolve the encoded contract string for THIS franchise's copy of a player.
// A player exists as two copies (e.g. "0032_FR_r25" and "0015_FR_r25"); the
// export row exposes them in contractStatus (Copy 1) and contractInfo (Copy 2).
// The owner segment is now the 4-digit MFL franchise id, so we match it exactly
// against fid (fr.id) — no abbreviation aliasing. Returns { parsed, matched }:
//  - matched=true  → a copy whose OWNER id equals this franchise (the correct copy),
//  - matched=false → tokens exist but none belong to this franchise (a free-agent
//                    copy or awaiting an import) → we show NOTHING (never another
//                    team's copy) and flag it.
// Returns null only when the row has no encoded contract token at all.
function encodedForFranchise(pl, fid) {
  if (!pl) return null;
  const tokens = [];
  for (const k in pl) {
    const v = pl[k];
    if (typeof v !== 'string') continue;
    v.split(/[;,]/).forEach((s) => { s = s.trim(); if (ENC_RE.test(s)) tokens.push(s); });
  }
  if (!tokens.length) return null;
  const mine = tokens.find((t) => t.split('_')[0] === fid);
  if (mine) return { parsed: parseEncoded(mine), matched: true };
  return { parsed: null, matched: false };
}

// ── Eligibility clock from class + redshirt (approximation of deriveElig) ─────
function deriveElig(cls, rs) {
  const idx = Math.max(0, CLASS_SEQ.indexOf(cls));  // FR=0 … GR=4
  const played = idx + 1;                            // seasons enrolled incl. this one
  const rsYear = rs ? rs.year : null;
  const rsKind = rs ? (rs.type === 'med' ? 'rs-med' : 'rs') : null;
  const hasRS = rsYear != null;
  const dots = [];
  for (let i = 0; i < played; i++) dots.push('used');
  if (hasRS) dots.splice(Math.min(dots.length, 1), 0, rsKind);
  const allowed = 4 + (hasRS ? 1 : 0);
  const usedBefore = Math.max(played - 1, 0);
  const remaining = allowed - usedBefore;
  while (dots.length < Math.min(allowed + (hasRS ? 1 : 0), 6)) dots.push('open');
  const remainLabel = remaining <= 0 ? 'No eligibility' : remaining === 1 ? 'Final year' : remaining + ' left';
  return { cls: (hasRS ? 'R-' : '') + cls, dots, remaining, remainLabel, redshirtingNow: rsYear === SEASON };
}

const initialsOf = (name) => {
  // MFL names are "Last, First" — show First-Last initials.
  const clean = name.indexOf(',') >= 0 ? name.split(',').reverse().join(' ') : name;
  return clean.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
};
const displayName = (name) => (name.indexOf(',') >= 0 ? name.split(',').map((s) => s.trim()).reverse().join(' ') : name);

// Normalize an MFL injury status string to the board's P / Q / O codes.
function injuryCode(status) {
  const s = String(status || '').toUpperCase().trim();
  if (!s) return null;
  if (s === 'P' || s.indexOf('PROB') >= 0) return 'P';                       // probable
  if (s === 'Q' || s.indexOf('QUES') >= 0 || s.indexOf('GTD') >= 0
    || s.indexOf('GAME') >= 0 || s.indexOf('DAY') >= 0) return 'Q';          // questionable / day-to-day
  if (s === 'O' || s.indexOf('OUT') >= 0 || s === 'D' || s.indexOf('DOUBT') >= 0
    || s === 'IR' || s.indexOf('RESERVE') >= 0 || s.indexOf('PUP') >= 0
    || s.indexOf('SUSP') >= 0 || s.indexOf('NFI') >= 0) return 'O';          // out / doubtful / IR / PUP / suspended
  return 'Q'; // unrecognized but present → surface it as questionable rather than hide
}

// MEMBERSHIP is keyed by franchise id, so teamKey and the returned "other copy"
// are franchise ids (the app resolves them via TEAMS[id] for display).
const otherCopyOf = (pid, teamKey) => {
  const on = MEMBERSHIP[pid] || [];
  for (const t of on) if (t !== teamKey) return t;
  return null;
};

// ── buildRoster(teamKey): teamKey is a franchise id ───────────────────────────
const enrichRow = (teamKey) => (m) => {
  const p = PLAYERS_BY_ID[m.pid] || { name: m.pid, pos: 'WR', pts: 0, injury: null };
  const enc = m.enc;
  const rs = enc ? enc.redshirt : null;
  // No matching copy for this franchise → leave contract fields blank (never show
  // another team's copy); m.unverified drives the ⚠ "awaiting contract" flag.
  const elig = enc ? deriveElig(enc.cls, rs)
    : { cls: '', dots: [], remaining: null, remainLabel: 'No contract copy assigned to this team yet', redshirtingNow: false };
  return {
    pid: m.pid,
    playerId: p.playerId,
    photo: p.playerId ? PLAYER_PHOTO(p.playerId) : null,
    team: p.team || '',
    bye: p.bye || BYE_BY_TEAM[(p.team || '').toUpperCase()] || null,
    name: displayName(p.name),
    pos: normPos(p.pos),
    pts: p.pts || 0,
    injury: p.injury || null,
    initials: initialsOf(p.name),
    awards: enc ? enc.awards.map(encAwardToDisplay) : [],
    rs: rs ? { type: rs.type, year: rs.year } : null,
    elig,
    contractUnverified: !!m.unverified,
    other: otherCopyOf(m.pid, teamKey),
  };
};

function buildRoster(teamKey) {
  const members = ROSTER_MEMBERS[teamKey] || [];
  const e = enrichRow(teamKey);
  const active = [], taxi = [], ir = [];
  members.forEach((m) => {
    const row = e(m);
    if (m.status === 'TAXI_SQUAD') taxi.push(row);
    else if (m.status === 'INJURED_RESERVE') ir.push(row);
    else active.push(row);
  });
  const groups = POS_ORDER.map((pos) => {
    const players = active.filter((r) => r.pos === pos).sort((a, b) => b.pts - a.pts);
    return { pos, players, pts: players.reduce((s, r) => s + r.pts, 0) };
  }).filter((g) => g.players.length);
  const all = active.concat(taxi, ir);
  const totalPts = all.reduce((s, r) => s + r.pts, 0);
  const rsCount  = all.filter((r) => r.rs && r.rs.year === SEASON).length;
  const outCount = all.filter((r) => r.injury && r.injury[0] === 'O').length;
  return { groups, taxi, ir, totalPts, rsCount, outCount, count: all.length };
}

// ── MFL context + franchise directory ────────────────────────────────────────
// MFL league pages must be requested on the league's numbered server. Prefer
// location.origin when it already is one (https://wwwNN.myfantasyleague.com);
// otherwise sniff the numbered host from any MFL asset the page has loaded
// (its own script/link/img/anchor URLs); finally fall back to origin.
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
  if (host !== origin) console.log('[CFFB Roster Board] player links use MFL host ' + host + ' (page origin ' + origin + ')');
}

// MFL franchise ICON URLs are often imgur "gallery" links (imgur.com/{id}.png),
// which render unreliably as <img> sources; rewrite them to the direct CDN
// (i.imgur.com/{id}.png) so the small-pill icon actually loads.
function imgurDirect(u) {
  const m = String(u || '').match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)(?:\.[A-Za-z0-9]+)?$/i);
  return m ? 'https://i.imgur.com/' + m[1] + '.png' : (u || '');
}
function buildTeams() {
  const db = window.franchiseDatabase || {};
  const fidToAbbr = {};
  const teams = {};
  Object.keys(db).forEach((key) => {
    const f = db[key];
    if (!f || !f.id || f.id === '0000') return;              // skip commissioner pseudo-franchise
    const abbr = (f.abbrev || f.id).toUpperCase();
    const conf = DIV_TO_CONF[f.division] || 'acc';
    fidToAbbr[f.id] = abbr;
    // TEAMS is keyed by the 4-digit franchise id (the same key the contract
    // tokens now use and the rosters export groups by). abbr/name stay as
    // display fields — the id is never shown to the user.
    teams[f.id] = {
      name: f.name || abbr,
      abbr,
      owner: '',
      conf,
      bg: '#1B1B1E',
      fg: '#E8E7E4',
      rec: '',
      pill: imgurDirect(f.icon),    // franchise ICON (small pill) — TeamChip shows this first
      pill2: imgurDirect(f.logo),   // franchise LOGO (larger) — fallback if the icon fails to load
      fid: f.id,
    };
  });
  const order = Object.keys(teams).sort((a, b) => {
    const ca = CONF_ORDER.indexOf(teams[a].conf), cb = CONF_ORDER.indexOf(teams[b].conf);
    return ca !== cb ? ca - cb : teams[a].name.localeCompare(teams[b].name);
  });
  TEAMS = teams;
  TEAM_ORDER = order;   // list of franchise ids, sorted by conference then name
  // Signed-in franchise → default team (its id).
  const myFid = String(window.franchise_id || '');
  MY_FID = myFid;
  FID_TO_ABBR = fidToAbbr;
  MY_TEAM = teams[myFid] ? myFid : (TEAM_ORDER[0] || null);
  console.log('[CFFB Roster Board] signed-in franchise_id=' + (myFid || '(none)') + ' → default team '
    + MY_TEAM + (MY_TEAM && TEAMS[MY_TEAM] ? ' (' + TEAMS[MY_TEAM].abbr + ')' : '')
    + (teams[myFid] ? '' : ' (fell back — commissioner/unknown franchise)'));
  if (MY_TEAM && TEAMS[MY_TEAM]) console.log('[CFFB Roster Board] franchise images — icon(shown first): '
    + (TEAMS[MY_TEAM].pill || '(none)') + ' | logo(fallback): ' + (TEAMS[MY_TEAM].pill2 || '(none)'));
  return fidToAbbr;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchJSON(type, extra) {
  const url = `${MFL_CTX.origin}/${MFL_CTX.year}/export?TYPE=${type}&L=${MFL_CTX.league}&JSON=1${extra || ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + type);
  return res.json();
}
const asArray = (x) => (Array.isArray(x) ? x : x != null ? [x] : []);
// MFL injuries payload -> array, tolerant of shape ({injuries:{injury:[]}},
// {injuries:[]}, or a bare array).
function injuryListOf(d) {
  const root = d && (d.injuries || d.nflInjuries || d);
  return asArray(root && (root.injury || (Array.isArray(root) ? root : null)));
}

// Best-effort current NFL week from the browser clock (MFL's injuries export is
// week-specific and the page exposes no reliable week global). Week 1 ~ the
// first Tuesday of September of the given season.
function guessNflWeek(y) {
  try {
    const now = new Date();
    const sep1 = new Date(y, 8, 1);
    const firstTue = new Date(y, 8, 1 + ((2 - sep1.getDay() + 7) % 7));
    const wk = Math.floor((now - firstTue) / (7 * 864e5)) + 1;
    return Math.min(Math.max(wk, 1), 18);
  } catch (e) { return 0; }
}

// Injuries and byes are GLOBAL NFL state, not league data — MFL merges the
// *current* season's status into pages regardless of the league's year. A
// rolled-back test league (e.g. /2025/) still shows injury/bye badges, but the
// 2025 injury/bye export is archived/empty. So sweep the league's URL year AND
// the real current year, using whichever returns data. (No &L= — global feed.)
function nflYears() {
  const ys = [];
  const push = (y) => { y = parseInt(y, 10); if (y && ys.indexOf(y) < 0) ys.push(y); };
  push(MFL_CTX.year);
  try { push(new Date().getFullYear()); } catch (e) { /* ignore */ }
  return ys;
}
async function fetchExport(year, type, extra) {
  const url = `${MFL_CTX.origin}/${year}/export?TYPE=${type}&JSON=1${extra || ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + type + ' ' + year);
  return res.json();
}
// Returns the raw injuries payload from the first (year, week) that has data.
async function loadInjuriesRaw() {
  for (const y of nflYears()) {
    for (const wk of [0, guessNflWeek(y)]) {
      try {
        const d = await fetchExport(y, 'injuries', wk ? '&W=' + wk : '');
        if (injuryListOf(d).length) {
          console.log('[CFFB Roster Board] injuries from year ' + y + ' week ' + (wk || 'default'));
          return d;
        }
      } catch (e) { /* try next */ }
    }
  }
  console.log('[CFFB Roster Board] injuries: none found across years ' + nflYears().join(', '));
  return null;
}
// Returns team->bye map from the first year that has data.
async function loadByeMap() {
  for (const y of nflYears()) {
    try {
      const m = parseByeWeeks(await fetchExport(y, 'nflByeWeeks'));
      if (Object.keys(m).length) {
        console.log('[CFFB Roster Board] byes from year ' + y + ' (' + Object.keys(m).length + ' teams)');
        return m;
      }
    } catch (e) { /* try next */ }
  }
  console.log('[CFFB Roster Board] byes: none found across years ' + nflYears().join(', '));
  return {};
}
// Map NFL team -> bye week from whatever shape MFL uses. Handles both
// team-keyed rows ({id/team, bye_week/week}) and week-keyed rows that nest a
// team array ({week, team:[{id},...]}).
function parseByeWeeks(d) {
  const map = {};
  const root = d && (d.nflByeWeeks || d.byeWeeks || d);
  if (!root || typeof root !== 'object') return map;
  const visit = (arr, inheritedWk) => {
    asArray(arr).forEach((it) => {
      if (it == null) return;
      if (typeof it === 'string') { if (inheritedWk) map[it.toUpperCase()] = String(inheritedWk); return; }
      if (typeof it !== 'object') return;
      const wk = it.bye_week || it.week || it.bye || it.bye_wk || inheritedWk;
      if (Array.isArray(it.team)) { visit(it.team, wk); return; }   // week-keyed → recurse into its teams
      const team = String(it.id || it.team_id || (typeof it.team === 'string' ? it.team : '')).toUpperCase();
      if (team && wk) map[team] = String(wk);
    });
  };
  for (const k in root) if (Array.isArray(root[k])) visit(root[k]);
  return map;
}

// ── localStorage stale-while-revalidate cache (widget-unique key) ─────────────
const RB_CACHE_KEY = 'cffb_roster_board_v9';   // v9: franchise-id keying + id-based contract match
const RB_FRESH_MS  = 30 * 60 * 1000;             // serve without refetch
const RB_MAX_MS    = 24 * 60 * 60 * 1000;        // hard cap
function rbReadCache() {
  try {
    const rec = JSON.parse(localStorage.getItem(RB_CACHE_KEY) || 'null');
    if (!rec || typeof rec.ts !== 'number' || !rec.payload) return null;
    const age = Date.now() - rec.ts;
    if (age < 0 || age > RB_MAX_MS) return null;
    return { payload: rec.payload, age };
  } catch (e) { return null; }
}
function rbWriteCache(payload) {
  try { localStorage.setItem(RB_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload })); } catch (e) { /* ignore */ }
}

// ── Assemble the live payload from the export feeds ───────────────────────────
async function rbFetchPayload(fidToAbbr) {
  const [rostersD, playersD, scoresD, injuriesD, byeMap] = await Promise.all([
    fetchJSON('rosters'),
    fetchJSON('players', '&DETAILS=1'),
    fetchJSON('playerScores', '&W=YTD&YEAR=' + MFL_CTX.year).catch(() => null),
    loadInjuriesRaw().catch((e) => { console.warn('[CFFB Roster Board] injuries fetch failed:', e && e.message); return null; }),
    loadByeMap().catch(() => ({})),
  ]);

  // Player identity: id -> name/pos/team/bye.
  const playersById = {};
  const playerList = asArray(playersD && playersD.players && playersD.players.player);
  if (playerList.length) console.log('[CFFB Roster Board] sample player fields:', Object.keys(playerList[0]));
  playerList.forEach((p) => {
    const team = (p.team || '').toUpperCase();
    playersById[p.id] = {
      name: p.name || p.id, pos: p.position || 'WR', pts: 0, injury: null, playerId: p.id,
      team, bye: p.bye_week || p.bye || p.byeweek || p.bye_wk || byeMap[team] || null,
    };
  });

  // Season points.
  asArray(scoresD && scoresD.playerScores && scoresD.playerScores.playerScore).forEach((s) => {
    if (playersById[s.id]) playersById[s.id].pts = parseFloat(s.score) || 0;
  });

  // Injuries: MFL's TYPE=injuries report (these are real NFL players, so it
  // matches by id). Normalize the status to P / Q / O — MFL sends full words
  // ("Questionable"), short codes ("Q"), or variants ("IR", "PUP", "Doubtful"),
  // so map broadly and treat any other non-empty designation as questionable
  // rather than dropping it.
  const injList = injuryListOf(injuriesD);
  let injMatched = 0;
  injList.forEach((inj) => {
    const code = injuryCode(inj.status);
    if (code && playersById[inj.id]) { playersById[inj.id].injury = [code, inj.details || inj.status || '']; injMatched++; }
  });
  console.log('[CFFB Roster Board] injuries: ' + injList.length + ' report entries, ' + injMatched + ' matched to rostered players');

  // Membership + this franchise's encoded contract copy (matched by franchise id).
  // Keyed by the 4-digit franchise id (fr.id) — the same key TEAMS uses and the
  // token owner now carries — so no abbreviation aliasing.
  const rosterMembers = {};   // fid -> [{pid,status,enc,verified,unverified}]
  const membership = {};      // pid -> [fid]
  let encMatched = 0, encUnverified = 0, encNone = 0;
  asArray(rostersD && rostersD.rosters && rostersD.rosters.franchise).forEach((fr) => {
    if (!TEAMS[fr.id]) return;   // skip franchises not in the directory (commissioner/unknown)
    rosterMembers[fr.id] = rosterMembers[fr.id] || [];
    asArray(fr.player).forEach((pl) => {
      const res = encodedForFranchise(pl, fr.id);
      if (res && res.matched) encMatched++; else if (res) encUnverified++; else encNone++;
      rosterMembers[fr.id].push({
        pid: pl.id, status: pl.status || 'ROSTER',
        enc: res ? res.parsed : null,
        verified: !!(res && res.matched),
        unverified: !!(res && !res.matched),   // tokens present but none owned by this franchise
      });
      (membership[pl.id] = membership[pl.id] || []).push(fr.id);
    });
  });
  console.log('[CFFB Roster Board] contract copies: ' + encMatched + ' matched by id, '
    + encUnverified + ' no copy for this franchise (flagged), ' + encNone + ' no contract token');

  return { season: SEASON, thruWeek: THRU_WEEK, playersById, rosterMembers, membership, byeMap };
}

function applyPayload(pd, fidToAbbr) {
  PLAYERS_BY_ID = pd.playersById || {};
  MEMBERSHIP = pd.membership || {};
  BYE_BY_TEAM = pd.byeMap || {};
  THRU_WEEK = pd.thruWeek || THRU_WEEK;
  // enc is already resolved to this franchise's copy at build time.
  ROSTER_MEMBERS = pd.rosterMembers || {};
}

// ── Public loader (awaited by the boot wrapper before mount) ──────────────────
async function loadRosterBoard() {
  resolveCtx();
  const fidToAbbr = buildTeams();
  THRU_WEEK = parseInt(window.currentWeek, 10) || THRU_WEEK;

  const cached = rbReadCache();
  if (cached && cached.payload.season === SEASON) {
    applyPayload(cached.payload, fidToAbbr);
    if (cached.age > RB_FRESH_MS) {
      rbFetchPayload(fidToAbbr).then((pd) => { applyPayload(pd, fidToAbbr); rbWriteCache(pd); }).catch(() => {});
    }
    return;
  }
  const pd = await rbFetchPayload(fidToAbbr);
  applyPayload(pd, fidToAbbr);
  rbWriteCache(pd);
}

// ── Roster actions (Taxi / IR) via MFL form-replay ────────────────────────────
// These drive MFL's OWN action forms rather than a hand-built API call, so:
//  • auth is the signed-in session cookie (same-origin, no APIKEY/token needed —
//    the captured forms carry no CSRF field),
//  • eligibility + locks are whatever MFL renders: a player is movable *iff* the
//    page emits a checkbox for them (ineligible players show "Cannot be demoted"
//    / "Can not be deactivated" and get no checkbox),
//  • we read the EXACT field name (demote/promote/deactivate/activate + fid) out
//    of the live HTML — never guessed — and POST a single-player delta, so one
//    action moves exactly one player and nothing else.
// Only the signed-in owner's own roster is actionable; MFL rejects anything else.
const RB_ACTION_PAGE = { taxi: 'O=98', ir: 'O=18' };   // options page that renders each form
const RB_ACTION_SUFFIX = { taxi: 'taxi_squad', ir: 'ir' }; // form action path suffix

// Pull the target form out of a fetched options page and read its hidden fields
// + per-player checkboxes. Scoped to the form so unrelated page inputs are ignored.
function rbParseMoveForm(html, suffix) {
  const open = new RegExp('<form[^>]*action="([^"]+\\/' + suffix + ')"[^>]*>', 'i').exec(html);
  if (!open) return null;
  const end = html.indexOf('</form>', open.index);
  const inner = html.slice(open.index, end < 0 ? html.length : end);
  const hidden = {};
  let m;
  const hidRe = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi;
  while ((m = hidRe.exec(inner))) hidden[m[1]] = m[2];
  const moves = {}; // pid -> { name, dir }  (dir 'out' = leaves active roster, 'in' = returns to it)
  const cbRe = /<input[^>]*type="checkbox"[^>]*name="(demote|promote|deactivate|activate)(\d{3,4})"[^>]*value="(\d+)"[^>]*>/gi;
  while ((m = cbRe.exec(inner))) {
    const prefix = m[1], fid = m[2], pid = m[3];
    moves[pid] = { name: prefix + fid, dir: (prefix === 'demote' || prefix === 'deactivate') ? 'out' : 'in' };
  }
  return { actionUrl: open[1], hidden, moves };
}

// forceFid appends &FRANCHISE_ID for the commissioner (franchise '0000'), who
// can act on any team — MFL scopes a regular owner's form to their own session,
// so the param is only added for the commish. The parsed form's own FRANCHISE_ID
// is stamped on the result so the caller can verify MFL returned the intended
// team and refuse to act on the wrong one.
async function rbFetchForm(kind, targetFid, forceFid) {
  const fidParam = (forceFid && targetFid) ? '&FRANCHISE_ID=' + targetFid : '';
  const url = `${MFL_CTX.host || MFL_CTX.origin}/${MFL_CTX.year}/options?L=${MFL_CTX.league}&${RB_ACTION_PAGE[kind]}${fidParam}`;
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const parsed = rbParseMoveForm(await res.text(), RB_ACTION_SUFFIX[kind]);
  if (parsed) parsed.fid = parsed.hidden.FRANCHISE_ID || parsed.hidden.FRANCHISE || null;
  return parsed;
}

// Load taxi + IR eligibility for the target franchise. Returns, per kind, the
// action URL, hidden fields, the franchise the form is scoped to (.fid), and a
// { pid -> {name,dir} } map of legal moves.
async function rbLoadActions(targetFid, forceFid) {
  const out = { taxi: null, ir: null };
  await Promise.all(['taxi', 'ir'].map(async (k) => {
    try { out[k] = await rbFetchForm(k, targetFid, forceFid); }
    catch (e) { console.warn('[CFFB Roster Board] ' + k + ' form load failed:', e && e.message); }
  }));
  return out;
}

// POST a single-player delta the way MFL's form would, then report raw result.
async function rbSubmitMove(actionUrl, hidden, fieldName, pid) {
  const fields = Object.assign({}, hidden);
  fields[fieldName] = pid;
  const body = Object.keys(fields).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
  const res = await fetch(actionUrl, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  return { ok: res.ok, status: res.status };
}

// Re-fetch rosters after a write so the board reflects MFL's new truth (the POST
// response HTML is not trusted — the export feed is the source of truth).
async function rbReloadRosters() {
  const pd = await rbFetchPayload(FID_TO_ABBR);
  applyPayload(pd, FID_TO_ABBR);
  rbWriteCache(pd);
}

// Current bucket of a pid on a team ('ROSTER' | 'TAXI_SQUAD' | 'INJURED_RESERVE').
function rbStatusOf(teamAbbr, pid) {
  const m = (ROSTER_MEMBERS[teamAbbr] || []).find((x) => x.pid === pid);
  return m ? m.status : null;
}

// The build concatenates this file and rb-app.jsx into one function scope, so
// rb-app reads SEASON / TEAMS / buildRoster / MFL_PLAYER_LINK etc. lexically.
// Only the loader needs to be reachable by name from the boot wrapper.
window.__loadRosterBoard = loadRosterBoard;
