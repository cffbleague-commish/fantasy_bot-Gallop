// CFFB · Price Prediction Board — prospect pool + prediction model
// ---------------------------------------------------------------------------
// This board predicts what each recruit's auction COPY will hammer for.
// Each prospect carries a base prediction (proj + asymmetric spread). The
// model is intentionally a pure function of (proj, sigLo, sigHi) so a LIVE
// feed can recompute it: see applyLive() — that's the hook the live-auction
// tab will drive. Right now `live` is a static nudge for demonstration.
// ---------------------------------------------------------------------------

// Position accent colors (from DS POS_COLORS).
const POS_COLORS = {
  QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547',
  OL: '#8A8A8A', DL: '#8B6F1F', LB: '#B84545', DB: '#6E86A8', ATH: '#9A9A9A',
};

// ESPN team-logo CDN. id is the ESPN NCAA franchise id.
const espnLogo = (id) => id ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png` : null;

// Committed programs — ESPN logo id + brand colors for the chip backdrop.
const SCHOOLS = {
  TEX:  { name: 'Texas',         abbr: 'TEX',  espn: 251,  bg: '#BF5700', fg: '#FFFFFF' },
  OSU:  { name: 'Ohio State',    abbr: 'OSU',  espn: 194,  bg: '#BB0000', fg: '#FFFFFF' },
  COLO: { name: 'Colorado',      abbr: 'COLO', espn: 38,   bg: '#000000', fg: '#CFB87C' },
  BAMA: { name: 'Alabama',       abbr: 'BAMA', espn: 333,  bg: '#9E1B32', fg: '#FFFFFF' },
  MICH: { name: 'Michigan',      abbr: 'MICH', espn: 130,  bg: '#00274C', fg: '#FFCB05' },
  ARIZ: { name: 'Arizona',       abbr: 'ARIZ', espn: 12,   bg: '#0C234B', fg: '#CC0033' },
  ND:   { name: 'Notre Dame',    abbr: 'ND',   espn: 87,   bg: '#0C2340', fg: '#C99700' },
  LSU:  { name: 'LSU',           abbr: 'LSU',  espn: 99,   bg: '#461D7C', fg: '#FDD023' },
  UGA:  { name: 'Georgia',       abbr: 'UGA',  espn: 61,   bg: '#BA0C2F', fg: '#FFFFFF' },
  PSU:  { name: 'Penn State',    abbr: 'PSU',  espn: 213,  bg: '#041E42', fg: '#FFFFFF' },
  ORE:  { name: 'Oregon',        abbr: 'ORE',  espn: 2483, bg: '#154733', fg: '#FEE123' },
  TENN: { name: 'Tennessee',     abbr: 'TENN', espn: 2633, bg: '#FF8200', fg: '#FFFFFF' },
  USC:  { name: 'USC',           abbr: 'USC',  espn: 30,   bg: '#841617', fg: '#F2A900' },
  OU:   { name: 'Oklahoma',      abbr: 'OU',   espn: 201,  bg: '#841617', fg: '#FFFFFF' },
  CLEM: { name: 'Clemson',       abbr: 'CLEM', espn: 228,  bg: '#F56600', fg: '#522D80' },
  FSU:  { name: 'Florida State', abbr: 'FSU',  espn: 52,   bg: '#782F40', fg: '#CEB888' },
  MIA:  { name: 'Miami',         abbr: 'MIA',  espn: 2390, bg: '#005030', fg: '#F47321' },
  ND2:  { name: 'Undecided',     abbr: '—',    espn: null, bg: '#1C1C1C', fg: '#7A7A7A' },
};

// Draft classes available in the year selector.
const YEARS = [
  { id: 2026, label: '2026', tag: 'Signed class · firm comps' },
  { id: 2027, label: '2027', tag: 'Early board · wider bands' },
  { id: 2028, label: '2028', tag: 'Speculative · thin data' },
];

// ---------------------------------------------------------------------------
// Prospect pool. proj = projected hammer ($). sigLo / sigHi = asymmetric
// spread (auctions spike high, so sigHi >= sigLo). score = composite (0–100).
// ---------------------------------------------------------------------------
const RAW = [
  // ============ 2026 — deepest, firmest board ============
  { id: 'arch',   y: 2026, name: 'Arch Manning',     pos: 'QB',  school: 'TEX',  stars: 5, posRank: 1,  score: 98.4, ht: "6'4\"", wt: 219, jersey: 16, stRank: '#1 TX', copies: 4, proj: 118, sigLo: 16, sigHi: 27, live: { delta: 6,  note: '2 SEC copies hammered hot' } },
  { id: 'smith',  y: 2026, name: 'Jeremiah Smith',   pos: 'WR',  school: 'OSU',  stars: 5, posRank: 1,  score: 97.6, ht: "6'3\"", wt: 215, jersey: 4,  stRank: '#1 FL', copies: 4, proj: 104, sigLo: 14, sigHi: 24, live: { delta: 4,  note: '1 B1G copy at $96' } },
  { id: 'will',   y: 2026, name: 'Ryan Williams',    pos: 'WR',  school: 'BAMA', stars: 5, posRank: 2,  score: 96.0, ht: "6'0\"", wt: 177, jersey: 2,  stRank: '#2 AL', copies: 3, proj: 88,  sigLo: 14, sigHi: 22, live: { delta: 3,  note: 'SEC copy bid to $67' } },
  { id: 'judkins',y: 2026, name: 'Quinshon Judkins',  pos: 'RB',  school: 'OSU',  stars: 5, posRank: 1,  score: 94.6, ht: "6'0\"", wt: 219, jersey: 1,  stRank: '#1 AL', copies: 3, proj: 82,  sigLo: 13, sigHi: 20, live: { delta: 4,  note: 'B1G copy live at $84' } },
  { id: 'uw',     y: 2026, name: 'Bryce Underwood',  pos: 'QB',  school: 'MICH', stars: 5, posRank: 2,  score: 95.1, ht: "6'4\"", wt: 208, jersey: 19, stRank: '#1 MI', copies: 3, proj: 74,  sigLo: 17, sigHi: 26, live: { delta: 0,  note: 'no live copies yet' } },
  { id: 'tmac',   y: 2026, name: 'Tetairoa McMillan',pos: 'WR',  school: 'ARIZ', stars: 5, posRank: 3,  score: 94.2, ht: "6'5\"", wt: 212, jersey: 4,  stRank: '#2 CA', copies: 3, proj: 70,  sigLo: 12, sigHi: 19, live: { delta: 2,  note: 'Big 12 copy at $71' } },
  { id: 'love',   y: 2026, name: 'Jeremiyah Love',   pos: 'RB',  school: 'ND',   stars: 4, posRank: 2,  score: 91.2, ht: "6'0\"", wt: 206, jersey: 4,  stRank: '#3 MO', copies: 3, proj: 64,  sigLo: 12, sigHi: 17, live: { delta: 1,  note: 'IND copy at $52' } },
  { id: 'egbuka', y: 2026, name: 'Emeka Egbuka',     pos: 'WR',  school: 'OSU',  stars: 4, posRank: 4,  score: 90.6, ht: "6'1\"", wt: 206, jersey: 2,  stRank: '#1 WA', copies: 2, proj: 52,  sigLo: 10, sigHi: 14, live: { delta: 2,  note: 'B1G copy live $58' } },
  { id: 'love2',  y: 2026, name: 'Colston Loveland', pos: 'TE',  school: 'MICH', stars: 4, posRank: 1,  score: 89.3, ht: "6'5\"", wt: 245, jersey: 18, stRank: '#1 ID', copies: 2, proj: 44,  sigLo: 9,  sigHi: 13, live: { delta: 0,  note: 'flat vs. open' } },
  { id: 'nuss',   y: 2026, name: 'Garrett Nussmeier', pos: 'QB', school: 'LSU',  stars: 4, posRank: 3,  score: 88.5, ht: "6'2\"", wt: 200, jersey: 13, stRank: '#4 TX', copies: 2, proj: 48,  sigLo: 11, sigHi: 16, live: { delta: -1, note: 'SEC copy at $39' } },
  { id: 'fannin', y: 2026, name: 'Harold Fannin Jr.', pos: 'TE', school: 'OU',   stars: 4, posRank: 2,  score: 87.6, ht: "6'3\"", wt: 230, jersey: 0,  stRank: '#1 OH', copies: 2, proj: 45,  sigLo: 10, sigHi: 15, live: { delta: 2,  note: 'Big 12 copy bid $49' } },
  { id: 'beck',   y: 2026, name: 'Carson Beck',      pos: 'QB',  school: 'UGA',  stars: 4, posRank: 4,  score: 87.9, ht: "6'4\"", wt: 220, jersey: 15, stRank: '#6 FL', copies: 3, proj: 42,  sigLo: 10, sigHi: 15, live: { delta: 3,  note: 'SEC copy bid $54' } },
  { id: 'allar',  y: 2026, name: 'Drew Allar',       pos: 'QB',  school: 'PSU',  stars: 4, posRank: 5,  score: 86.4, ht: "6'5\"", wt: 238, jersey: 15, stRank: '#3 OH', copies: 2, proj: 38,  sigLo: 9,  sigHi: 13, live: { delta: 0,  note: 'Pac copy live $37' } },
  { id: 'moore',  y: 2026, name: 'Dante Moore',      pos: 'QB',  school: 'ORE',  stars: 4, posRank: 6,  score: 85.7, ht: "6'3\"", wt: 206, jersey: 5,  stRank: '#2 MI', copies: 2, proj: 34,  sigLo: 9,  sigHi: 14, live: { delta: 1,  note: 'B1G copy at $35' } },

  // ============ 2027 — early board, wider bands ============
  { id: 'curtis', y: 2027, name: 'Jared Curtis',     pos: 'QB',  school: 'UGA',  stars: 5, posRank: 1,  score: 93.0, ht: "6'3\"", wt: 215, jersey: 7,  stRank: '#1 TN', copies: 3, proj: 62,  sigLo: 16, sigHi: 26, live: { delta: 0,  note: 'no live copies yet' } },
  { id: 'dako',   y: 2027, name: 'Dakorien Moore',   pos: 'WR',  school: 'LSU',  stars: 5, posRank: 1,  score: 91.5, ht: "6'0\"", wt: 180, jersey: 1,  stRank: '#1 TX', copies: 3, proj: 54,  sigLo: 16, sigHi: 24, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'jlewis', y: 2027, name: 'Julian Lewis',     pos: 'QB',  school: 'USC',  stars: 5, posRank: 2,  score: 90.0, ht: "6'1\"", wt: 185, jersey: 10, stRank: '#1 GA', copies: 2, proj: 50,  sigLo: 15, sigHi: 24, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'russell',y: 2027, name: 'Calvin Russell',   pos: 'WR',  school: 'MIA',  stars: 5, posRank: 2,  score: 86.0, ht: "6'3\"", wt: 190, jersey: 3,  stRank: '#1 FL', copies: 2, proj: 38,  sigLo: 13, sigHi: 21, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'bell',   y: 2027, name: 'Dia Bell',         pos: 'QB',  school: 'TEX',  stars: 4, posRank: 3,  score: 85.0, ht: "6'2\"", wt: 180, jersey: 9,  stRank: '#3 FL', copies: 2, proj: 36,  sigLo: 12, sigHi: 20, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'hiter',  y: 2027, name: 'Savion Hiter',     pos: 'RB',  school: 'TENN', stars: 5, posRank: 1,  score: 84.0, ht: "5'11\"",wt: 200, jersey: 2,  stRank: '#1 VA', copies: 2, proj: 32,  sigLo: 11, sigHi: 18, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'rouse',  y: 2027, name: 'Brayden Rouse',    pos: 'TE',  school: 'CLEM', stars: 4, posRank: 1,  score: 81.5, ht: "6'5\"", wt: 235, jersey: 87, stRank: '#2 GA', copies: 1, proj: 26,  sigLo: 9,  sigHi: 15, live: { delta: 0,  note: 'awaiting nominations' } },
  { id: 'antwi',  y: 2027, name: 'Joojo Antwi',      pos: 'RB',  school: 'USC',  stars: 4, posRank: 2,  score: 79.0, ht: "6'1\"", wt: 205, jersey: 0,  stRank: '#5 TX', copies: 1, proj: 20,  sigLo: 8,  sigHi: 12, live: { delta: 0,  note: 'awaiting nominations' } },

  // ============ 2028 — speculative, thin data ============
  { id: 'kease',  y: 2028, name: 'Keisean Henderson',pos: 'QB',  school: 'USC',  stars: 5, posRank: 1,  score: 88.0, ht: "6'3\"", wt: 195, jersey: 3,  stRank: '#1 TX', copies: 2, proj: 40,  sigLo: 16, sigHi: 28, live: { delta: 0,  note: 'class not yet on the block' } },
  { id: 'keys',   y: 2028, name: 'Tristen Keys',     pos: 'WR',  school: 'TENN', stars: 5, posRank: 1,  score: 86.0, ht: "6'3\"", wt: 190, jersey: 8,  stRank: '#1 MS', copies: 2, proj: 34,  sigLo: 14, sigHi: 24, live: { delta: 0,  note: 'class not yet on the block' } },
  { id: 'spec4',  y: 2028, name: 'Jceon Stewart',    pos: 'WR',  school: 'ND2',  stars: 4, posRank: 2,  score: 81.0, ht: "6'2\"", wt: 185, jersey: 0,  stRank: '#4 SC', copies: 1, proj: 20,  sigLo: 10, sigHi: 18, live: { delta: 0,  note: 'uncommitted · thin comps' } },
  { id: 'sutter', y: 2028, name: 'Mack Sutter',      pos: 'TE',  school: 'ND2',  stars: 4, posRank: 1,  score: 80.5, ht: "6'5\"", wt: 225, jersey: 0,  stRank: '#1 IL', copies: 1, proj: 19,  sigLo: 9,  sigHi: 16, live: { delta: 0,  note: 'uncommitted · thin comps' } },
  { id: 'spec5',  y: 2028, name: 'Maxwell Roy',      pos: 'RB',  school: 'ND2',  stars: 4, posRank: 1,  score: 79.5, ht: "5'11\"",wt: 200, jersey: 0,  stRank: '#3 FL', copies: 1, proj: 16,  sigLo: 8,  sigHi: 14, live: { delta: 0,  note: 'uncommitted · thin comps' } },
];

// --- Prediction model ------------------------------------------------------
const Z80 = 1.2816;   // 80% central interval half-width in sigmas
const ZRANGE = 1.65;  // floor/ceiling band (~90%)

// Effective projection = base proj + live nudge (the live-auction hook).
const effProj = (p) => p.proj + (p.live ? p.live.delta : 0);

const predict = (p) => {
  const proj = effProj(p);
  return {
    proj,
    floor: Math.max(1, Math.round(proj - ZRANGE * p.sigLo)),
    ceil: Math.round(proj + ZRANGE * p.sigHi),
    p80lo: Math.max(1, Math.round(proj - Z80 * p.sigLo)),
    p80hi: Math.round(proj + Z80 * p.sigHi),
  };
};

// Split-normal probability density (peak 1 at proj). Used by the curve chart.
const densityAt = (x, p) => {
  const proj = effProj(p);
  const s = x <= proj ? p.sigLo : p.sigHi;
  return Math.exp(-0.5 * Math.pow((x - proj) / s, 2));
};

// --- Pricing scenarios: multiple probability distributions per prospect -----
// Each scenario is its own split-normal; the chart overlays all three.
// The headline "auction predicted price" is the live-adjusted projection.
const scenariosFor = (p) => {
  const base = p.proj;
  const live = effProj(p);
  // market runs hotter for higher-pedigree / more-contested prospects
  const marketBias = Math.round((p.stars - 4) * 4 + (p.copies - 2) * 2.5);
  return [
    { key: 'market', label: 'Market consensus', color: '#7BA4C9', proj: base + marketBias, sigLo: p.sigLo * 1.18, sigHi: p.sigHi * 1.22 },
    { key: 'model',  label: 'Model baseline',   color: '#C9A227', proj: base,               sigLo: p.sigLo,        sigHi: p.sigHi },
    { key: 'live',   label: 'Live-adjusted',    color: '#5B9D6B', proj: live,               sigLo: p.sigLo * 0.82, sigHi: p.sigHi * 0.82, primary: true },
  ];
};

// --- ESPN-style scouting + draft stats (derived, per draft class) ----------
const _byYear = {};
RAW.forEach((p) => { (_byYear[p.y] = _byYear[p.y] || []).push(p); });
const STATS = {};
Object.values(_byYear).forEach((list) => {
  [...list].sort((a, b) => b.score - a.score).forEach((p, i) => {
    const rank = i + 1;
    const round = Math.ceil(rank / 12);
    const inRound = ((rank - 1) % 12) + 1;
    const jitter = (((p.id.charCodeAt(0) + p.id.length) % 7) - 3) * 0.2;
    STATS[p.id] = {
      espnGrade: Math.min(98, Math.round(79 + (p.score - 79) * 0.82)),
      espnRank: rank,
      recruitScore: p.score,
      draftPick: `${round}.${String(inRound).padStart(2, '0')}`,
      adp: Math.max(1, rank + jitter).toFixed(1),
    };
  });
});

// Attach derived prediction + scenarios + stats to every prospect once.
const PROSPECTS = RAW.map((p) => ({ ...p, pred: predict(p), scenarios: scenariosFor(p), stats: STATS[p.id] }));

const posLabel = (p) => `${p.pos}${p.posRank}`;       // e.g. "QB1"
const fmt$ = (n) => '$' + Math.round(n).toLocaleString();

Object.assign(window, {
  POS_COLORS, SCHOOLS, YEARS, PROSPECTS, espnLogo,
  predict, densityAt, scenariosFor, effProj, posLabel, fmt$,
});
