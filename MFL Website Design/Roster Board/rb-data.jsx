// CFFB · Roster Board — data layer
// ---------------------------------------------------------------------------
// SAMPLE DATA for now. To wire up live MFL data, replace PLAYERS/ROSTERS with
// fetches against the MFL export API (all support &JSON=1):
//   rosters       export?TYPE=rosters&L=<LEAGUE_ID>
//   player names  export?TYPE=players&DETAILS=1&L=<LEAGUE_ID>
//   injuries      export?TYPE=injuries&W=<week>
//   season points export?TYPE=playerScores&L=<LEAGUE_ID>&YEAR=2026&W=YTD
// Redshirt / eligibility / awards live in MFL contract fields per player:
//   contractYear   → year the player entered college (drives the elig clock)
//   contractStatus → redshirt code: "" | "T2025" (traditional) | "M2025" (medical)
//   contractInfo   → comma list of awards: H2025 (Heisman), OB (O'Brien),
//                    DW (Doak Walker), BK (Biletnikoff), AA2025sec (All-Conf)
// MY_TEAM: on an MFL home page the viewing franchise id is available server-side
// via the {FRANCHISE_ID} home-message substitution — inject it there.
const SEASON = 2026;
const THRU_WEEK = 1;
const MY_TEAM = 'UNC';

const TEAMS = {
  UNC:  { name: 'North Carolina', abbr: 'UNC',  owner: '@jordan', conf: 'acc',   bg: '#7BAFD4', fg: '#13294B', rec: '1-0', pill: '../assets/teams/north-carolina.png' },
  UGA:  { name: 'Georgia',        abbr: 'UGA',  owner: '@tyler',  conf: 'sec',   bg: '#990000', fg: '#FEC10C', rec: '0-1', pill: '../assets/teams/georgia.png' },
  TEX:  { name: 'Texas',          abbr: 'TEX',  owner: '@marcus', conf: 'sec',   bg: '#BF5700', fg: '#FFFFFF', rec: '1-0' },
  OSU:  { name: 'Ohio State',     abbr: 'OSU',  owner: '@danni',  conf: 'b1g',   bg: '#BB0000', fg: '#FFFFFF', rec: '1-0' },
  MICH: { name: 'Michigan',       abbr: 'MICH', owner: '@kel',    conf: 'b1g',   bg: '#00274C', fg: '#FFCB05', rec: '0-1' },
  UTAH: { name: 'Utah',           abbr: 'UTAH', owner: '@quinn',  conf: 'big12', bg: '#CC0000', fg: '#FFFFFF', rec: '1-0' },
  ARMY: { name: 'Army',           abbr: 'ARMY', owner: '@hank',   conf: 'aac',   bg: '#2C2A29', fg: '#D4BF91', rec: '0-1', pill: '../assets/teams/army.png' },
  ORST: { name: 'Oregon State',   abbr: 'ORST', owner: '@beck',   conf: 'pac',   bg: '#DC4405', fg: '#000000', rec: '0-1' },
};
const TEAM_ORDER = ['UNC', 'UGA', 'TEX', 'OSU', 'MICH', 'UTAH', 'ARMY', 'ORST'];

const CONF_ACCENT = { sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A' };
const CONF_ORDER = ['sec', 'b1g', 'acc', 'big12', 'pac', 'aac'];
const CONF_META = {
  sec:   { label: 'SEC',    logo: '../assets/conferences/sec.png' },
  b1g:   { label: 'B1G',    logo: '../assets/conferences/b1g.png' },
  acc:   { label: 'ACC',    logo: '../assets/conferences/acc.png' },
  big12: { label: 'BIG 12', logo: '../assets/conferences/big12.png' },
  pac:   { label: 'PAC-12', logo: '../assets/conferences/pac12.png' },
  aac:   { label: 'AAC',    logo: '../assets/conferences/aac.png' },
};
const POS_COLORS = { QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547', DB: '#6E86A8', K: '#5C7A6A' };
const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'DB', 'K'];

// PLAYERS — shared identity: name, pos, year entered college, injury, points,
// career awards. A player may exist as TWO copies on different teams; identity
// data (awards, injury, points) is the same for both, redshirts are per-copy.
// injury: null | [code, detail]  codes: P probable · Q questionable · O out
// awards: 'h:2025' Heisman · 'ob' O'Brien · 'dw' Doak Walker · 'bk' Biletnikoff
//         · 'aa:2025:sec' Conference All-American
const P = (name, pos, entered, pts, awards, injury) => ({ name, pos, entered, pts, awards: awards || [], injury: injury || null });
const PLAYERS = {
  // Marquee, two-copy players
  arch:  P('Arch Manning',      'QB', 2023, 31.4, ['ob:2025']),
  uw:    P('Bryce Underwood',   'QB', 2025, 12.8),
  nuss:  P('Garrett Nussmeier', 'QB', 2023, 22.1),
  love:  P('Jeremiyah Love',    'RB', 2023, 18.2, ['dw:2025', 'aa:2025:acc'], ['Q', 'Ankle — limited Wed/Thu, game-time call']),
  smith: P('Jeremiah Smith',    'WR', 2024, 26.7, ['h:2025', 'bk:2025', 'aa:2024:b1g']),
  will:  P('Ryan Williams',     'WR', 2024, 0.0,  ['aa:2025:sec'], ['O', 'Hamstring — no return timetable']),
  downs: P('Caleb Downs',       'DB', 2023, 14.5, ['aa:2024:b1g', 'aa:2025:b1g']),
  // UNC depth
  reid:  P('Marcus Reid',       'RB', 2025, 0.0),
  callo: P('Tre Calloway',      'WR', 2025, 9.4),
  drob:  P('Deuce Robinson',    'TE', 2024, 7.6),
  fazz:  P('Dom Fazzini',       'K',  2024, 11.0),
  // TEX
  baxt:  P('CJ Baxter',         'RB', 2023, 16.9),
  gibs:  P('Jerrick Gibson',    'RB', 2024, 8.8),
  wingo: P('Ryan Wingo',        'WR', 2024, 15.2, ['aa:2025:sec']),
  dmoor: P('DeAndre Moore',     'WR', 2023, 10.1),
  livin: P('Parker Livingstone','WR', 2025, 0.0),
  jwash: P('Jordan Washington', 'TE', 2024, 5.5),
  taaf:  P('Michael Taaffe',    'DB', 2022, 9.8),
  aubn:  P('Bert Auburn',       'K',  2023, 12.0),
  // UGA
  stock: P('Gunner Stockton',   'QB', 2022, 19.4),
  fraz:  P('Nate Frazier',      'RB', 2024, 14.7),
  bwalk: P('Bo Walker',         'RB', 2025, 0.0),
  brnch: P('Zachariah Branch',  'WR', 2023, 13.6),
  bell:  P('Dillon Bell',       'WR', 2023, 7.3),
  delp:  P('Oscar Delp',        'TE', 2023, 8.4),
  bold:  P('KJ Bolden',         'DB', 2024, 10.2, ['aa:2025:sec']),
  woodr: P('Peyton Woodring',   'K',  2023, 9.0),
  // OSU
  sayin: P('Julian Sayin',      'QB', 2024, 27.9),
  kien:  P('Lincoln Kienholz',  'QB', 2023, 2.1),
  peop:  P('James Peoples',     'RB', 2024, 12.3),
  tate:  P('Carnell Tate',      'WR', 2023, 17.8, ['aa:2025:b1g'], ['P', 'Shoulder — full go Friday']),
  grah:  P('Mylan Graham',      'WR', 2024, 0.0),
  klare: P('Max Klare',         'TE', 2023, 9.7),
  igbo:  P('Davison Igbinosun', 'DB', 2023, 6.9),
  field: P('Jayden Fielding',   'K',  2023, 8.2),
  // MICH
  jdav:  P('Jadyn Davis',       'QB', 2024, 0.0),
  hayn:  P('Justice Haynes',    'RB', 2023, 21.5),
  marsh: P('Jordan Marshall',   'RB', 2024, 11.4),
  smorg: P('Semaj Morgan',      'WR', 2023, 8.7),
  fmoor: P('Fred Moore',        'WR', 2023, 6.3),
  amarsh:P('Andrew Marsh',      'WR', 2025, 10.9),
  klein: P('Marlin Klein',      'TE', 2022, 5.1),
  berry: P('Zeke Berry',        'DB', 2023, 7.4),
  zvada: P('Dominic Zvada',     'K',  2023, 13.1),
  // UTAH
  damp:  P('Devon Dampier',     'QB', 2023, 24.2),
  iwil:  P('Isaac Wilson',      'QB', 2024, 0.0),
  park:  P('Wayshawn Parker',   'RB', 2024, 13.8),
  roger: P('NaQuari Rogers',    'RB', 2023, 5.9),
  rdav:  P('Ryan Davis',        'WR', 2024, 9.1),
  zwill: P('Zacharyus Williams','WR', 2023, 8.0),
  tia:   P('Otto Tia',          'WR', 2022, 6.6),
  bent:  P('Dallen Bentley',    'TE', 2023, 4.8),
  beck:  P('Cole Becker',       'K',  2023, 10.4),
  // ARMY
  cole:  P('Dewayne Coleman',   'QB', 2024, 16.7),
  hell:  P('Cale Hellums',      'QB', 2023, 3.2),
  hreed: P('Hayden Reed',       'RB', 2023, 12.5),
  short: P('Noah Short',        'RB', 2023, 10.8),
  reyn:  P('Casey Reynolds',    'WR', 2024, 7.7),
  alst:  P('Isaiah Alston',     'WR', 2022, 5.4),
  mayes: P('Jaden Mayes',       'WR', 2025, 0.0),
  pear:  P('Josh Pearcy',       'TE', 2023, 3.8),
  platt: P('Donavon Platt',     'DB', 2023, 6.1),
  gron:  P('Trey Gronotte',     'K',  2023, 7.9),
  // ORST
  murph: P('Maalik Murphy',     'QB', 2022, 18.9, [], ['Q', 'Ribs — did not finish Week 1']),
  gjohn: P('Gabarri Johnson',   'QB', 2024, 2.6),
  allah: P('Salahadin Allah',   'RB', 2024, 9.6),
  hatch: P('Cornell Hatcher',   'RB', 2024, 7.2),
  twalk: P('Trent Walker',      'WR', 2023, 11.7),
  clem:  P('Darrius Clemons',   'WR', 2022, 0.0, [], ['O', 'Knee — placed on IR Week 1']),
  redd:  P('Taz Reddicks',      'WR', 2024, 0.0),
  milb:  P('Gabe Milbourn',     'TE', 2023, 2.9),
  sthom: P('Skyler Thomas',     'DB', 2023, 8.5),
  hens:  P('Kade Hensley',      'K',  2023, 9.3),
};

// ROSTERS — each entry is [playerId] or [playerId, 'trad'|'med', rsYear].
// The redshirt belongs to THIS COPY (copies of the same player diverge).
// TAXI / IR — same entry format; MFL roster status TAXI_SQUAD / INJURED_RESERVE.
const ROSTERS = {
  UNC:  [['arch', 'trad', 2023], ['uw'], ['love'], ['smith'], ['callo'], ['drob', 'med', 2025], ['downs'], ['fazz']],
  UGA:  [['stock', 'trad', 2022], ['nuss'], ['fraz'], ['brnch'], ['bell'], ['delp'], ['bold'], ['woodr']],
  TEX:  [['arch'], ['nuss'], ['baxt'], ['gibs'], ['wingo'], ['dmoor'], ['jwash'], ['taaf', 'trad', 2022], ['aubn']],
  OSU:  [['sayin'], ['kien', 'trad', 2024], ['peop'], ['love', 'trad', 2024], ['smith'], ['tate'], ['klare'], ['igbo'], ['field']],
  MICH: [['uw'], ['hayn'], ['marsh'], ['smorg'], ['fmoor'], ['amarsh'], ['klein', 'med', 2023], ['berry'], ['zvada']],
  UTAH: [['damp'], ['park'], ['roger'], ['rdav'], ['zwill'], ['tia', 'med', 2024], ['bent'], ['downs'], ['beck']],
  ARMY: [['cole'], ['hell'], ['hreed'], ['short'], ['reyn'], ['alst', 'trad', 2022], ['pear'], ['platt'], ['gron']],
  ORST: [['murph', 'trad', 2022], ['gjohn'], ['allah'], ['hatch'], ['twalk'], ['milb'], ['sthom'], ['hens']],
};
const TAXI = {
  UNC:  [['reid', 'trad', 2026]],
  UGA:  [['bwalk', 'trad', 2026]],
  TEX:  [['livin', 'trad', 2026]],
  OSU:  [['grah', 'trad', 2026]],
  MICH: [['jdav', 'trad', 2026]],
  UTAH: [['iwil', 'trad', 2026]],
  ARMY: [['mayes', 'trad', 2026]],
  ORST: [['redd', 'trad', 2026]],
};
const IR = {
  UNC:  [['will']],
  UGA:  [['will']],
  ORST: [['clem', 'med', 2023]],
  TEX: [], OSU: [], MICH: [], UTAH: [], ARMY: [],
};

// ── Derivations ──────────────────────────────────────────────────────────────
const CLASS_SEQ = ['FR', 'SO', 'JR', 'SR', 'GR'];

// Eligibility clock for one COPY (same rules as the Player Ledger):
// each enrolled season is 'used' (played) or 'rs'/'rs-med'; play-seasons
// allowed = 4, +1 if the copy ever redshirted; remaining counts the current
// season as still in hand.
const deriveElig = (entered, rs) => {
  const rsYear = rs ? rs[2] : null;
  const rsKind = rs ? (rs[1] === 'med' ? 'rs-med' : 'rs') : null;
  const dots = [];
  let played = 0;
  for (let y = entered; y <= SEASON; y++) {
    if (y === rsYear) dots.push(rsKind);
    else { dots.push('used'); played++; }
  }
  const hasRS = rsYear != null;
  const allowed = 4 + (hasRS ? 1 : 0);
  const redshirtingNow = rsYear === SEASON;
  const usedBefore = redshirtingNow ? played : Math.max(played - 1, 0);
  const remaining = allowed - usedBefore;
  while (dots.length < Math.min(allowed + (hasRS ? 1 : 0), 6)) dots.push('open');
  const cls = CLASS_SEQ[Math.min(Math.max(played - 1, 0), 4)];
  const remainLabel = remaining <= 0 ? 'No eligibility' : remaining === 1 ? 'Final year' : remaining + ' left';
  return { cls: (hasRS ? 'R-' : '') + cls, dots, remaining, remainLabel, redshirtingNow };
};

const AWARD_META = {
  h:  { kind: 'heisman',      name: 'Heisman' },
  ob: { kind: 'obrien',       name: "O'Brien" },
  dw: { kind: 'walker',       name: 'Walker' },
  bk: { kind: 'biletnikoff',  name: 'Biletnikoff' },
  aa: { kind: 'allamerican',  name: 'All-Conf' },
};
const parseAward = (code) => {
  const [k, year, conf] = code.split(':');
  const m = AWARD_META[k];
  const confLabel = conf ? ({ sec: 'SEC', b1g: 'B1G', acc: 'ACC', big12: 'B12', aac: 'AAC', pac: 'PAC' }[conf] || conf.toUpperCase()) : null;
  return { kind: m.kind, name: k === 'aa' ? 'All-' + confLabel : m.name, year: year || '', conf: conf || null };
};

// Who owns the OTHER copy of a player (relative to `teamId`)? → team id or null (FA).
const otherCopyOf = (pid, teamId) => {
  for (const t of TEAM_ORDER) {
    if (t === teamId) continue;
    if (ROSTERS[t].concat(TAXI[t], IR[t]).some((r) => r[0] === pid)) return t;
  }
  return null;
};

// Fully-derived roster for one team: position groups + taxi + IR.
const enrich = (teamId) => (r) => {
  const [pid] = r;
  const p = PLAYERS[pid];
  const rs = r.length > 1 ? r : null;
  const elig = deriveElig(p.entered, rs);
  return {
    pid, ...p,
    awards: p.awards.map(parseAward),
    rs: rs ? { type: rs[1], year: rs[2] } : null,
    elig,
    other: otherCopyOf(pid, teamId),
    initials: p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''),
  };
};
const buildRoster = (teamId) => {
  const e = enrich(teamId);
  const rows = ROSTERS[teamId].map(e);
  const taxi = TAXI[teamId].map(e);
  const ir = IR[teamId].map(e);
  const groups = POS_ORDER.map((pos) => {
    const players = rows.filter((r) => r.pos === pos).sort((a, b) => b.pts - a.pts);
    return { pos, players, pts: players.reduce((s, r) => s + r.pts, 0) };
  }).filter((g) => g.players.length);
  const all = rows.concat(taxi, ir);
  const totalPts = all.reduce((s, r) => s + r.pts, 0);
  const rsCount = all.filter((r) => r.rs && r.rs.year === SEASON).length;
  const outCount = all.filter((r) => r.injury && r.injury[0] === 'O').length;
  return { groups, taxi, ir, totalPts, rsCount, outCount, count: all.length };
};

Object.assign(window, { SEASON, THRU_WEEK, MY_TEAM, TEAMS, TEAM_ORDER, CONF_ACCENT, CONF_ORDER, CONF_META, POS_COLORS, buildRoster });
