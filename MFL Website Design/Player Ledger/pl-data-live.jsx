// CFFB · Player Ledger — LIVE data loader
// ---------------------------------------------------------------------------
// Replaces the demo's pl-data.jsx (hardcoded RAW_COPIES / PLAYER_AUG) AND the
// ../Auction Board/data.jsx dependency (TEAMS / CONFERENCES / POS_COLORS / …)
// at build time. Fetches JSON from the shared Apps Script Web App:
//
//   {EXEC}?feed=ledger                → index (search list + branding)
//   {EXEC}?feed=ledger&player={MFLID} → one player's copies + event ledger
//
// The per-copy transaction reconstruction (auction / redshirt / drop + award
// injection + eligibility clock) is done by the SAME deriveElig()/makeCopy()
// the demo used — the server hands back the compact event tuples those expect,
// so the rendered shape is byte-for-byte the demo's.
//
// The build script substitutes the real /exec URL for __WEBAPP_URL__.
const CFFB_LEDGER_URL = '__WEBAPP_URL__';
const ledgerUrl = (params) => CFFB_LEDGER_URL + (CFFB_LEDGER_URL.indexOf('?') < 0 ? '?' : '&') + params;

// ---------------------------------------------------------------------------
// Design-system constants (were in ../Auction Board/data.jsx). Static — safe to
// inline; keeps the fragment self-contained with zero extra requests.
// ---------------------------------------------------------------------------
const POS_COLORS = {
  QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547',
  OL: '#8A8A8A', DL: '#8B6F1F', LB: '#B84545', DB: '#6E86A8', ATH: '#9A9A9A',
};
const CONF_ACCENT = {
  sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A',
};
const CONF_ORDER = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];

const STATUS_META = {
  rostered:    { label: 'Rostered',     color: '#2D7A4E' },
  redshirting: { label: 'Redshirting',  color: '#C9A227' },
  declared:    { label: 'Declared',     color: '#B8902F' },
  graduated:   { label: 'Graduated',    color: '#8B6F1F' },
  fa:          { label: 'Free Agent',   color: '#5A5A5A' },
};
const TXN_META = {
  won:      { color: '#C9A227' },
  rs:       { color: '#C9A227' },
  'rs-med': { color: '#D17575' },
  award:    { color: '#E8C547' },
  drop:     { color: '#B84545' },
  graduate: { color: '#8B6F1F' },
};

// MFL "no photo" fallback (confirmed from the live player page's onerror handler).
const NO_PHOTO = 'https://www46.myfantasyleague.com/player_photos_2010/no_photo_available.jpg';

// The league's data season (getLeagueYear on the server) — NOT the calendar year.
// Drives the eligibility clock + "redshirting now" detection; the index feed's
// `season` overwrites this on load so the math matches the ledger's event years.
let CURRENT_SEASON = new Date().getFullYear();
const CLASS_SEQ = ['FR', 'SO', 'JR', 'SR', 'GR'];

// ---------------------------------------------------------------------------
// Stable containers the components read by identifier. Populated in place (never
// reassigned) so React re-renders pick up the live data.
// ---------------------------------------------------------------------------
const TEAMS = {};       // franchise id -> { name, abbr, owner, conf, bg, fg, pill }
const CONFERENCES = []; // [{ id, name, logo }]
const CONF_NAME = {};
const CONF_LOGO = {};
const LEDGER = {};      // pid -> { confs, copies, roll }
const ROSTER = [];      // index rows (search list)
const PLAYER_AUG = {};  // pid -> bio augmentation (college, awards, draft, …)

// ===========================================================================
// deriveElig + makeCopy — ported verbatim from pl-data.jsx (they depend only on
// TEAMS, CURRENT_SEASON, CLASS_SEQ). See pl-data.jsx for the full commentary.
// ===========================================================================
const deriveElig = (ledger, entered, realRS) => {
  const real = new Set(realRS || []);
  const copyRS = {};
  ledger.forEach((e) => { if (e.type === 'redshirt') copyRS[e.season] = (e.rsType === 'med' ? 'rs-med' : 'rs'); });

  const first = entered != null ? entered : CURRENT_SEASON;
  const dots = [];
  let usedPast = 0, rsCount = 0;
  for (let y = first; y <= CURRENT_SEASON; y++) {
    let state;
    if (copyRS[y]) state = copyRS[y];
    else if (real.has(y)) state = 'rs';
    else state = 'used';
    dots.push(state);
    if (state === 'used' && y < CURRENT_SEASON) usedPast += 1;
    if (state !== 'used') rsCount += 1;
  }
  const allowed = 4 + (rsCount > 0 ? 1 : 0);
  const remaining = allowed - usedPast;

  const playSoFar = dots.filter((d) => d === 'used').length;
  const cls = CLASS_SEQ[Math.min(Math.max(playSoFar - 1, 0), 4)];

  const futureOpen = Math.max(0, remaining - 1);
  const dotsOut = dots.concat(Array.from({ length: futureOpen }, () => 'open')).slice(0, 6);

  const remain = remaining <= 0 ? 'No eligibility'
    : remaining === 1 ? 'Final year'
    : remaining + ' left';
  const rsYears = [...Object.keys(copyRS).map(Number), ...(realRS || [])].sort((a, b) => a - b);
  const hasRS = rsCount > 0;
  const rsType = Object.values(copyRS).some((v) => v === 'rs-med') ? 'med' : 'trad';
  const rsYear = rsYears.length ? rsYears[rsYears.length - 1] : null;
  return { cls, dots: dotsOut, remain, remaining, hasRS, rsType, rsYear };
};

const makeCopy = (pid, conf, n, events, awards, entered, realRS) => {
  let holder = null;
  let acquired = null;
  let redshirtingNow = false;

  const ledger = events.map((ev) => {
    const [type, season] = ev;
    if (type === 'auction') {
      const [, , team, price, note] = ev;
      holder = team;
      acquired = { team, price, season };
      return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
        price, note: note || null, label: 'WON', tag: 'won' };
    }
    if (type === 'redshirt') {
      const [, , team, rsType, note] = ev;
      if (season === CURRENT_SEASON && holder === team) redshirtingNow = true;
      return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
        rsType, note: note || null,
        label: rsType === 'med' ? 'MEDICAL RS' : 'REDSHIRT',
        tag: rsType === 'med' ? 'rs-med' : 'rs' };
    }
    const [, , team, note] = ev;
    holder = null;
    acquired = null;
    redshirtingNow = false;
    return { type, season, team, owner: (TEAMS[team] || {}).owner || '@—',
      note: note || null, label: 'RELEASED', tag: 'drop' };
  });

  const intervals = [];
  { let o = null, s = null;
    events.forEach((ev) => {
      const [type, season] = ev;
      if (type === 'auction') { if (o != null) intervals.push({ team: o, start: s, end: season - 1 }); o = ev[2]; s = season; }
      else if (type === 'drop') { intervals.push({ team: o, start: s, end: season - 1 }); o = null; s = null; }
    });
    if (o != null) intervals.push({ team: o, start: s, end: CURRENT_SEASON });
  }
  (awards || []).forEach((a) => {
    const iv = intervals.find((v) => a.year >= v.start && a.year <= v.end);
    if (!iv) return;
    const tm = TEAMS[iv.team] || {};
    ledger.push({ type: 'award', season: a.year, team: iv.team, owner: tm.owner || '@—',
      award: a, label: 'HONOR', tag: 'award',
      note: `${a.name} ${a.year} — earned while rostered by ${tm.name || iv.team} (${tm.owner || '@—'}).` });
  });
  const ORDER = { auction: 0, redshirt: 1, award: 2, drop: 3 };
  ledger.sort((x, y) => (x.season - y.season) || (ORDER[x.type] - ORDER[y.type]));

  const elig = deriveElig(ledger, entered, realRS);
  const honors = ledger.filter((e) => e.type === 'award').length;
  const DECLARE_AT = 2;
  const base = holder == null ? 'fa' : (redshirtingNow ? 'redshirting' : 'rostered');
  const status = elig.remaining <= 0 ? 'graduated'
    : (honors >= DECLARE_AT ? 'declared' : base);
  const terminal = status === 'graduated' || status === 'declared';
  return {
    id: `${pid}-${conf}-${n}`, n, conf, owner: holder, status, acquired,
    graduated: terminal,
    declared: status === 'declared',
    honors, elig,
    seasonsHeld: acquired ? (CURRENT_SEASON - acquired.season + 1) : 0,
    ledger,
  };
};

// Assemble one player's LEDGER entry from the server's copies[] (mirrors the
// per-player roll-up in pl-data.jsx lines 399-423).
const buildLedgerEntry = (pid, serverCopies, entered) => {
  const byConf = {};
  serverCopies.forEach((c) => { (byConf[c.conf] = byConf[c.conf] || []).push(c); });
  const confs = CONF_ORDER.filter((c) => byConf[c])
    .concat(Object.keys(byConf).filter((c) => CONF_ORDER.indexOf(c) < 0))
    .map((conf) => ({
      conf,
      copies: byConf[conf].map((c) => makeCopy(pid, conf, c.n, c.events || [], c.awards, entered, [])),
    }));
  const copies = confs.flatMap((c) => c.copies);

  let rostered = 0, redshirting = 0, fa = 0, graduated = 0, declared = 0, txns = 0;
  const heldPrices = [];
  copies.forEach((c) => {
    txns += c.ledger.length;
    if (c.status === 'graduated') graduated += 1;
    else if (c.status === 'declared') declared += 1;
    else if (c.status === 'fa') fa += 1;
    else if (c.status === 'redshirting') redshirting += 1;
    else rostered += 1;
    if (c.acquired && c.status !== 'fa') heldPrices.push(c.acquired.price);
  });
  const avg = heldPrices.length ? Math.round(heldPrices.reduce((a, b) => a + b, 0) / heldPrices.length) : null;
  const high = heldPrices.length ? Math.max(...heldPrices) : null;
  return {
    confs, copies,
    roll: { total: copies.length, confs: confs.length, rostered, redshirting, fa, graduated, declared, txns, avg, high },
  };
};

// ===========================================================================
// Per-browser cache (stale-while-revalidate) — same shape as st-data-live.jsx,
// separate keys so it never collides with the Standings/Power Rankings payload.
// ===========================================================================
const PL_FRESH_MS = 6 * 60 * 60 * 1000;
const PL_MAX_MS   = 7 * 24 * 60 * 60 * 1000;

function plCacheRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.ts !== 'number' || rec.payload == null) return null;
    const age = Date.now() - rec.ts;
    if (age < 0 || age > PL_MAX_MS) return null;
    return { payload: rec.payload, age };
  } catch (e) { return null; }
}
function plCacheWrite(key, payload) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload })); }
  catch (e) { /* quota / private mode — live fetch still works */ }
}
async function plFetch(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const d = await res.json();
  if (d && d.error) throw new Error(d.error);
  return d;
}
// SWR: serve cache instantly (refresh in background when stale); else fetch live.
async function plLoad(key, url) {
  const cached = plCacheRead(key);
  if (cached) {
    if (cached.age > PL_FRESH_MS) plFetch(url).then((d) => plCacheWrite(key, d)).catch(() => {});
    return cached.payload;
  }
  const d = await plFetch(url);
  plCacheWrite(key, d);
  return d;
}

// ===========================================================================
// Public loaders (called from pl-app.jsx)
// ===========================================================================
const PL_INDEX_KEY = 'cffb_ledger_index_v1';
const PL_PLAYER_KEY = (id) => 'cffb_ledger_p_' + id;

// Load the index → populate TEAMS/CONFERENCES/ROSTER. Returns the ROSTER array.
async function loadLedgerIndex() {
  const d = await plLoad(PL_INDEX_KEY, ledgerUrl('feed=ledger'));

  if (d.season) CURRENT_SEASON = Number(d.season);

  Object.keys(d.franchises || {}).forEach((fid) => { TEAMS[fid] = d.franchises[fid]; });

  CONFERENCES.length = 0;
  (d.conferences || []).forEach((c) => {
    CONFERENCES.push(c); CONF_NAME[c.id] = c.name; CONF_LOGO[c.id] = c.logo;
  });

  ROSTER.length = 0;
  (d.players || []).forEach((p) => {
    ROSTER.push({
      id: p.id, name: p.name, pos: p.pos, college: p.nflTeam || 'FA', nflTeam: p.nflTeam || '',
      photo: p.photo, awardsCount: p.awards || 0,
      roll: {
        total: p.copies, rostered: p.held, redshirting: 0, fa: p.fa,
        graduated: 0, declared: 0, txns: 0, avg: null, high: null,
      },
    });
  });
  return ROSTER;
}

// Load one player's full ledger → populate LEDGER[pid] and enrich the ROSTER row
// with bio/awards/draft. Returns LEDGER[pid].
async function loadPlayerLedger(pid) {
  if (LEDGER[pid]) return LEDGER[pid];
  const d = await plLoad(PL_PLAYER_KEY(pid), ledgerUrl('feed=ledger&player=' + encodeURIComponent(pid)));

  const entry = buildLedgerEntry(pid, d.copies || [], d.entered);
  LEDGER[pid] = entry;

  PLAYER_AUG[pid] = {
    college: d.nflTeam || 'FA', nflTeam: d.nflTeam || '', entered: d.entered,
    awards: d.awards || [], draft: d.draft || [], profileUrl: d.profileUrl, photo: d.photo,
  };
  // Merge bio + recomputed roll onto the in-place ROSTER row so the hero updates.
  const row = ROSTER.find((r) => r.id === pid);
  if (row) { Object.assign(row, PLAYER_AUG[pid], { roll: entry.roll, name: d.name, pos: d.pos }); }
  return entry;
}

// ===========================================================================
// Tweaks shims — the MFL build omits tweaks-panel.jsx (authoring scaffolding),
// so provide no-op stand-ins that keep the fixed default config. pl-app.jsx uses
// these identifiers; when the real panel is bundled (demo), it wins by shadowing.
// ===========================================================================
const useTweaks = (defaults) => [defaults, () => {}];
const TweaksPanel = () => null;
const TweakSection = () => null;
const TweakRadio = () => null;
const TweakToggle = () => null;

Object.assign(window, {
  CURRENT_SEASON, LEDGER, ROSTER, PLAYER_AUG, STATUS_META, TXN_META,
  TEAMS, CONFERENCES, CONF_NAME, CONF_LOGO, CONF_ORDER, POS_COLORS, CONF_ACCENT, NO_PHOTO,
  deriveElig, makeCopy, loadLedgerIndex, loadPlayerLedger,
  useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle,
});
