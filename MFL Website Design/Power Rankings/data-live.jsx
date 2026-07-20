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

async function loadPowerRankings() {
  const res = await fetch(CFFB_WEBAPP_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching rankings');
  const d = await res.json();
  if (d.error) throw new Error(d.error);

  // Bare-bones globals from payload
  window.WEEKS_PLAYED = d.weeksPlayed;
  window.WEEKS_TOTAL  = d.weeksTotal;
  window.CONFERENCES  = d.conferences;
  window.CONF_NAME    = Object.fromEntries(
    d.conferences.filter((c) => c.id !== 'all').map((c) => [c.id, c.name])
  );
  window.CONF_ACCENT  = CONF_ACCENT_MAP;

  // Derive a broadcast-friendly CFFB Score (60–98 band) from raw rankingScore,
  // so the score-bar visual matches the demo's scale. Rank ordering is
  // preserved from the sheet — this only affects the displayed score number.
  const scores = d.teams.map((t) => t.rankingScore).filter((v) => v != null);
  const minS = scores.length ? Math.min.apply(null, scores) : 0;
  const maxS = scores.length ? Math.max.apply(null, scores) : 1;
  const spread = (maxS - minS) || 1;

  const enriched = d.teams.map((t) => {
    const raw = t.rankingScore == null ? minS : t.rankingScore;
    const cffb = Math.round((60 + ((raw - minS) / spread) * 38) * 10) / 10;
    const prev = t.prevRank == null ? t.rank : t.prevRank;
    return Object.assign({}, t, {
      cffb: cffb,
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
