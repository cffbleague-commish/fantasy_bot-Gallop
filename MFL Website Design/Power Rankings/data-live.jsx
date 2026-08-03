// CFFB · Power Rankings — LIVE data loader
// Replaces the demo's PRNG-generated data.jsx at build time.
// Fetches JSON from the Apps Script Web App and populates the same
// `window.*` globals that components.jsx / charts.jsx / app.jsx consume.

// The build script substitutes the real /exec URL for __WEBAPP_URL__.
const CFFB_WEBAPP_URL = '__WEBAPP_URL__';

// Conference accent colors — displayed as the strip on the team pill and
// tab tint. Keyed by the lowercase conf id emitted by the web app.
const CONF_ACCENT_MAP = {
  sec: '#C9A227',
  b1g: '#4A6FA5', bten: '#4A6FA5', bigten: '#4A6FA5',
  acc: '#8B4A5C',
  big12: '#B84545', b12: '#B84545',
  aac: '#6B5C8B',
  pac: '#5C7A6A', pac12: '#5C7A6A', p12: '#5C7A6A'
};

// ── Per-browser cache (stale-while-revalidate) ───────────────────────────────
// The web-app payload only changes ~weekly, so a recent copy from localStorage
// is safe to render instantly instead of blocking on a live fetch every load.
// Shared with the Standings widget via the SAME key — both fetch the identical
// JSON from the same endpoint, so one cache serves both. Every storage/JSON op
// is wrapped in try/catch: any failure falls through to a normal live fetch, so
// the worst case is exactly today's behavior.
const CFFB_CACHE_KEY = 'cffb_webapp_payload_v1';
const CFFB_FRESH_MS  = 6 * 60 * 60 * 1000;       // serve cache without refetch
const CFFB_MAX_MS    = 7 * 24 * 60 * 60 * 1000;  // hard cap; older = ignore

function cffbReadCache() {
  try {
    const raw = localStorage.getItem(CFFB_CACHE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.ts !== 'number' || rec.payload == null) return null;
    const age = Date.now() - rec.ts;
    if (age < 0 || age > CFFB_MAX_MS) return null;
    return { payload: rec.payload, age };
  } catch (e) { return null; }
}

function cffbWriteCache(payload) {
  try {
    localStorage.setItem(CFFB_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
  } catch (e) { /* quota / disabled / private mode — ignore; live fetch still works */ }
}

async function cffbFetchPayload() {
  const res = await fetch(CFFB_WEBAPP_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching rankings');
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d;
}

async function loadPowerRankings() {
  const cached = cffbReadCache();
  if (cached) {
    applyPowerRankings(cached.payload);
    // Past the fresh window → refresh in the background so the NEXT load is
    // current, without blocking this render.
    if (cached.age > CFFB_FRESH_MS) {
      cffbFetchPayload()
        .then((d) => cffbWriteCache(d))
        .catch(() => { /* keep serving the cached copy */ });
    }
    return;
  }
  const d = await cffbFetchPayload();
  applyPowerRankings(d);
  cffbWriteCache(d);
}

// Populate the window.* globals that components.jsx / charts.jsx / app.jsx read.
function applyPowerRankings(d) {
  // Bare-bones globals from payload
  window.WEEKS_PLAYED = d.weeksPlayed;
  window.WEEKS_TOTAL  = d.weeksTotal;
  window.CONFERENCES  = d.conferences;
  window.CONF_NAME    = Object.fromEntries(
    d.conferences.filter((c) => c.id !== 'all').map((c) => [c.id, c.name])
  );
  window.CONF_ACCENT  = CONF_ACCENT_MAP;

  // CFFB Score is the raw RankingScore from the PowerRankings sheet
  // (formula: ((RS_Wins + 1) × (AllPlayPct + OppAllPlayPct)) + PostseasonWins).
  // Rank ordering also comes straight from the sheet's Rank column.
  const enriched = d.teams.map((t) => {
    const prev = t.prevRank == null ? t.rank : t.prevRank;
    return Object.assign({}, t, {
      cffb: t.rankingScore == null ? 0 : t.rankingScore,
      move: prev - t.rank
    });
  });

  window.TEAMS      = Object.fromEntries(enriched.map((t) => [t.id, t]));
  window.IDS        = enriched.map((t) => t.id);
  window.STANDINGS  = enriched.slice().sort((a, b) => a.rank - b.rank);
  window.CONF_COUNTS = enriched.reduce(
    (m, t) => (m[t.conf] = (m[t.conf] || 0) + 1, m),
    { all: enriched.length }
  );

  const played = enriched.filter((t) => t.ppg > 0);
  window.LEAGUE_PPG = played.length
    ? Math.round((played.reduce((s, t) => s + t.ppg, 0) / played.length) * 10) / 10
    : 0;

  // These globals are declared for symmetry with the demo; charts.jsx and
  // components.jsx don't read them, so an empty stub is fine.
  window.LEAGUE_WEEK_AVG = [];
  window.WEEK_PTS = Object.fromEntries(
    enriched.map((t) => [t.id, t.games.map((g) => g.bye ? null : g.my)])
  );

  window.CFFB_UPDATED_AT = d.updatedAt;
  window.CFFB_SEASON     = d.season;
}

window.__loadPowerRankings = loadPowerRankings;
