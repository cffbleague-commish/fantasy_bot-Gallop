// CFFB · Power Rankings — derived fantasy-season data
// Head-to-head fantasy league. 100 manager teams branded as college programs.
// Everything (records, points, all-play %, opponent all-play, CFFB Score, rank
// movement) is DERIVED from one source of truth: each team's weekly point
// totals + a round-robin schedule. Numbers are internally consistent.

const WEEKS_PLAYED = 11;   // games in the books
const WEEKS_TOTAL  = 14;   // regular season length (12–14 are upcoming)

// ----------------------------------------------------------------------------
// Conferences (filter set). 'all' is the default league-wide view.
// ----------------------------------------------------------------------------
const CONFERENCES = [
  { id: 'all',   name: 'All',     logo: null },
  { id: 'sec',   name: 'SEC',     logo: '../assets/conferences/sec.png'   },
  { id: 'b1g',   name: 'Big Ten', logo: '../assets/conferences/b1g.png'   },
  { id: 'acc',   name: 'ACC',     logo: '../assets/conferences/acc.png'   },
  { id: 'big12', name: 'Big 12',  logo: '../assets/conferences/big12.png' },
  { id: 'aac',   name: 'AAC',     logo: '../assets/conferences/aac.png'   },
  { id: 'pac',   name: 'Pac-12',  logo: '../assets/conferences/pac12.png' },
];

const CONF_ACCENT = {
  sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A',
};
const CONF_NAME = { sec: 'SEC', b1g: 'Big Ten', acc: 'ACC', big12: 'Big 12', aac: 'AAC', pac: 'Pac-12' };

// ----------------------------------------------------------------------------
// Base teams — 100 programs. `tal` = mean weekly fantasy points (talent).
// `pill` = ripped-PNG logo where one exists, else a colored abbr chip.
// ----------------------------------------------------------------------------
const TEAM_LIST = [
  // --- SEC ---
  { id: 'UGA',  name: 'Georgia',        abbr: 'UGA',  conf: 'sec',   bg: '#990000', fg: '#FEC10C', tal: 118, pill: '../assets/teams/georgia.png' },
  { id: 'TEX',  name: 'Texas',          abbr: 'TEX',  conf: 'sec',   bg: '#BF5700', fg: '#FFFFFF', tal: 116 },
  { id: 'BAMA', name: 'Alabama',        abbr: 'BAMA', conf: 'sec',   bg: '#9E1B32', fg: '#FFFFFF', tal: 114 },
  { id: 'LSU',  name: 'LSU',            abbr: 'LSU',  conf: 'sec',   bg: '#461D7C', fg: '#FDD023', tal: 112 },
  { id: 'OU',   name: 'Oklahoma',       abbr: 'OU',   conf: 'sec',   bg: '#841617', fg: '#FDF9F2', tal: 110 },
  { id: 'TENN', name: 'Tennessee',      abbr: 'TENN', conf: 'sec',   bg: '#FF8200', fg: '#FFFFFF', tal: 108 },
  { id: 'MISS', name: 'Ole Miss',       abbr: 'MISS', conf: 'sec',   bg: '#14213D', fg: '#CE1126', tal: 106 },
  { id: 'TAMU', name: 'Texas A&M',      abbr: 'TAMU', conf: 'sec',   bg: '#500000', fg: '#FFFFFF', tal: 104 },
  { id: 'AUB',  name: 'Auburn',         abbr: 'AUB',  conf: 'sec',   bg: '#0C2340', fg: '#E87722', tal: 103 },
  { id: 'UF',   name: 'Florida',        abbr: 'UF',   conf: 'sec',   bg: '#0021A5', fg: '#FA4616', tal: 101 },
  { id: 'MIZ',  name: 'Missouri',       abbr: 'MIZ',  conf: 'sec',   bg: '#000000', fg: '#F1B82D', tal: 99  },
  { id: 'SCAR', name: 'South Carolina', abbr: 'SCAR', conf: 'sec',   bg: '#73000A', fg: '#FFFFFF', tal: 97  },
  { id: 'ARK',  name: 'Arkansas',       abbr: 'ARK',  conf: 'sec',   bg: '#9D2235', fg: '#FFFFFF', tal: 96  },
  { id: 'UK',   name: 'Kentucky',       abbr: 'UK',   conf: 'sec',   bg: '#0033A0', fg: '#FFFFFF', tal: 95  },
  { id: 'MSST', name: 'Mississippi St', abbr: 'MSST', conf: 'sec',   bg: '#660000', fg: '#FFFFFF', tal: 93  },
  { id: 'VAN',  name: 'Vanderbilt',     abbr: 'VAN',  conf: 'sec',   bg: '#866D4B', fg: '#000000', tal: 91  },

  // --- Big Ten ---
  { id: 'OSU',  name: 'Ohio State',     abbr: 'OSU',  conf: 'b1g',   bg: '#BB0000', fg: '#FFFFFF', tal: 118 },
  { id: 'ORE',  name: 'Oregon',         abbr: 'ORE',  conf: 'b1g',   bg: '#154733', fg: '#FEE123', tal: 115 },
  { id: 'MICH', name: 'Michigan',       abbr: 'MICH', conf: 'b1g',   bg: '#00274C', fg: '#FFCB05', tal: 109 },
  { id: 'PSU',  name: 'Penn State',     abbr: 'PSU',  conf: 'b1g',   bg: '#041E42', fg: '#FFFFFF', tal: 107 },
  { id: 'USC',  name: 'USC',            abbr: 'USC',  conf: 'b1g',   bg: '#841617', fg: '#FFC72C', tal: 105 },
  { id: 'WASH', name: 'Washington',     abbr: 'WASH', conf: 'b1g',   bg: '#4B2E83', fg: '#E8E3D3', tal: 102 },
  { id: 'UCLA', name: 'UCLA',           abbr: 'UCLA', conf: 'b1g',   bg: '#2D68C4', fg: '#F2A900', tal: 101 },
  { id: 'WISC', name: 'Wisconsin',      abbr: 'WISC', conf: 'b1g',   bg: '#C5050C', fg: '#FFFFFF', tal: 100 },
  { id: 'INDU', name: 'Indiana',        abbr: 'IND',  conf: 'b1g',   bg: '#990000', fg: '#EEEDEB', tal: 99  },
  { id: 'IOWA', name: 'Iowa',           abbr: 'IOWA', conf: 'b1g',   bg: '#000000', fg: '#FFCD00', tal: 98  },
  { id: 'MSU',  name: 'Michigan St',    abbr: 'MSU',  conf: 'b1g',   bg: '#18453B', fg: '#FFFFFF', tal: 97  },
  { id: 'NEB',  name: 'Nebraska',       abbr: 'NEB',  conf: 'b1g',   bg: '#E41C38', fg: '#FFFFFF', tal: 96  },
  { id: 'NW',   name: 'Northwestern',   abbr: 'NW',   conf: 'b1g',   bg: '#4E2A84', fg: '#FFFFFF', tal: 95  },
  { id: 'MINN', name: 'Minnesota',      abbr: 'MINN', conf: 'b1g',   bg: '#7A0019', fg: '#FFCC33', tal: 94  },
  { id: 'ILL',  name: 'Illinois',       abbr: 'ILL',  conf: 'b1g',   bg: '#13294B', fg: '#E84A27', tal: 93  },
  { id: 'MD',   name: 'Maryland',       abbr: 'MD',   conf: 'b1g',   bg: '#E03A3E', fg: '#FFD520', tal: 92  },
  { id: 'PUR',  name: 'Purdue',         abbr: 'PUR',  conf: 'b1g',   bg: '#000000', fg: '#CEB888', tal: 91  },
  { id: 'RUT',  name: 'Rutgers',        abbr: 'RUT',  conf: 'b1g',   bg: '#CC0033', fg: '#FFFFFF', tal: 90  },

  // --- ACC ---
  { id: 'MIA',  name: 'Miami',          abbr: 'MIA',  conf: 'acc',   bg: '#F47321', fg: '#005030', tal: 111 },
  { id: 'CLEM', name: 'Clemson',        abbr: 'CLEM', conf: 'acc',   bg: '#F56600', fg: '#522D80', tal: 108 },
  { id: 'FSU',  name: 'Florida State',  abbr: 'FSU',  conf: 'acc',   bg: '#782F40', fg: '#CEB888', tal: 104 },
  { id: 'SMU',  name: 'SMU',            abbr: 'SMU',  conf: 'acc',   bg: '#354CA1', fg: '#CC0035', tal: 102 },
  { id: 'UNC',  name: 'North Carolina', abbr: 'UNC',  conf: 'acc',   bg: '#7BAFD4', fg: '#13294B', tal: 100, pill: '../assets/teams/north-carolina.png' },
  { id: 'VT',   name: 'Virginia Tech',  abbr: 'VT',   conf: 'acc',   bg: '#630031', fg: '#CF4420', tal: 99  },
  { id: 'LOU',  name: 'Louisville',     abbr: 'LOU',  conf: 'acc',   bg: '#AD0000', fg: '#FFFFFF', tal: 98  },
  { id: 'CUSE', name: 'Syracuse',       abbr: 'CUSE', conf: 'acc',   bg: '#F76900', fg: '#000E54', tal: 97  },
  { id: 'NCST', name: 'NC State',       abbr: 'NCST', conf: 'acc',   bg: '#CC0000', fg: '#000000', tal: 95  },
  { id: 'GT',   name: 'Georgia Tech',   abbr: 'GT',   conf: 'acc',   bg: '#B3A369', fg: '#003057', tal: 94  },
  { id: 'DUKE', name: 'Duke',           abbr: 'DUKE', conf: 'acc',   bg: '#003087', fg: '#FFFFFF', tal: 93  },
  { id: 'PITT', name: 'Pitt',           abbr: 'PITT', conf: 'acc',   bg: '#003594', fg: '#FFB81C', tal: 96  },
  { id: 'CAL',  name: 'California',      abbr: 'CAL',  conf: 'acc',   bg: '#003262', fg: '#FDB515', tal: 92  },
  { id: 'UVA',  name: 'Virginia',       abbr: 'UVA',  conf: 'acc',   bg: '#232D4B', fg: '#F84C1E', tal: 91  },
  { id: 'BC',   name: 'Boston College', abbr: 'BC',   conf: 'acc',   bg: '#98002E', fg: '#BC9B6A', tal: 90  },
  { id: 'STAN', name: 'Stanford',       abbr: 'STAN', conf: 'acc',   bg: '#8C1515', fg: '#FFFFFF', tal: 89  },
  { id: 'WAKE', name: 'Wake Forest',    abbr: 'WAKE', conf: 'acc',   bg: '#9E7E38', fg: '#000000', tal: 88  },

  // --- Big 12 ---
  { id: 'UTAH', name: 'Utah',           abbr: 'UTAH', conf: 'big12', bg: '#CC0000', fg: '#FFFFFF', tal: 110 },
  { id: 'TCU',  name: 'TCU',            abbr: 'TCU',  conf: 'big12', bg: '#4D1979', fg: '#FFFFFF', tal: 105 },
  { id: 'COLO', name: 'Colorado',       abbr: 'COLO', conf: 'big12', bg: '#CFB87D', fg: '#000000', tal: 104 },
  { id: 'OKST', name: 'Oklahoma St',    abbr: 'OKST', conf: 'big12', bg: '#FF7300', fg: '#000000', tal: 103 },
  { id: 'BAY',  name: 'Baylor',         abbr: 'BAY',  conf: 'big12', bg: '#154734', fg: '#FFB81C', tal: 102 },
  { id: 'ARIZ', name: 'Arizona',        abbr: 'ARIZ', conf: 'big12', bg: '#003366', fg: '#CC0033', tal: 101 },
  { id: 'KU',   name: 'Kansas',         abbr: 'KU',   conf: 'big12', bg: '#0051BA', fg: '#E8000D', tal: 100 },
  { id: 'ASU',  name: 'Arizona St',     abbr: 'ASU',  conf: 'big12', bg: '#8C1D40', fg: '#FFC627', tal: 99  },
  { id: 'BYU',  name: 'BYU',            abbr: 'BYU',  conf: 'big12', bg: '#002E5D', fg: '#FFFFFF', tal: 98  },
  { id: 'TTU',  name: 'Texas Tech',     abbr: 'TTU',  conf: 'big12', bg: '#CC0000', fg: '#000000', tal: 97  },
  { id: 'ISU',  name: 'Iowa State',     abbr: 'ISU',  conf: 'big12', bg: '#C8102E', fg: '#F1BE48', tal: 96  },
  { id: 'WVU',  name: 'West Virginia',  abbr: 'WVU',  conf: 'big12', bg: '#002855', fg: '#EAAA00', tal: 95  },
  { id: 'KSU',  name: 'Kansas St',      abbr: 'KSU',  conf: 'big12', bg: '#512888', fg: '#FFFFFF', tal: 94  },
  { id: 'HOU',  name: 'Houston',        abbr: 'HOU',  conf: 'big12', bg: '#C8102E', fg: '#FFFFFF', tal: 93  },
  { id: 'CIN',  name: 'Cincinnati',     abbr: 'CIN',  conf: 'big12', bg: '#E00122', fg: '#000000', tal: 92  },
  { id: 'UCF',  name: 'UCF',            abbr: 'UCF',  conf: 'big12', bg: '#000000', fg: '#BA9B37', tal: 91  },

  // --- AAC ---
  { id: 'ARMY', name: 'Army',           abbr: 'ARMY', conf: 'aac',   bg: '#2C2A29', fg: '#D4BF91', tal: 103, pill: '../assets/teams/army.png' },
  { id: 'FRES', name: 'Fresno State',   abbr: 'FRES', conf: 'aac',   bg: '#DB0032', fg: '#002E6D', tal: 101, pill: '../assets/teams/fresno-state.png' },
  { id: 'LIB',  name: 'Liberty',        abbr: 'LIB',  conf: 'aac',   bg: '#0A254E', fg: '#AC1E2D', tal: 99  },
  { id: 'UTSA', name: 'UTSA',           abbr: 'UTSA', conf: 'aac',   bg: '#0C2340', fg: '#F15A22', tal: 98  },
  { id: 'MEM',  name: 'Memphis',        abbr: 'MEM',  conf: 'aac',   bg: '#003087', fg: '#898D8D', tal: 97  },
  { id: 'UAB',  name: 'UAB',            abbr: 'UAB',  conf: 'aac',   bg: '#1E6B52', fg: '#D2B887', tal: 96  },
  { id: 'NAVY', name: 'Navy',           abbr: 'NAVY', conf: 'aac',   bg: '#00205B', fg: '#C5B783', tal: 95  },
  { id: 'ECU',  name: 'East Carolina',  abbr: 'ECU',  conf: 'aac',   bg: '#592A8A', fg: '#FDC82F', tal: 94  },
  { id: 'TULN', name: 'Tulane',         abbr: 'TULN', conf: 'aac',   bg: '#006747', fg: '#418FDE', tal: 93  },
  { id: 'FAU',  name: 'Florida Atl',    abbr: 'FAU',  conf: 'aac',   bg: '#003366', fg: '#CC0000', tal: 92  },
  { id: 'USF',  name: 'South Florida',  abbr: 'USF',  conf: 'aac',   bg: '#006747', fg: '#CFC493', tal: 92  },
  { id: 'UNT',  name: 'North Texas',    abbr: 'UNT',  conf: 'aac',   bg: '#00853E', fg: '#FFFFFF', tal: 91  },
  { id: 'TLSA', name: 'Tulsa',          abbr: 'TLSA', conf: 'aac',   bg: '#002D72', fg: '#C5B783', tal: 90  },
  { id: 'TEM',  name: 'Temple',         abbr: 'TEM',  conf: 'aac',   bg: '#9D2235', fg: '#FFFFFF', tal: 90  },
  { id: 'CHAR', name: 'Charlotte',      abbr: 'CHAR', conf: 'aac',   bg: '#046A38', fg: '#B3A369', tal: 89  },
  { id: 'RICE', name: 'Rice',           abbr: 'RICE', conf: 'aac',   bg: '#00205B', fg: '#C1C6C8', tal: 88  },
  { id: 'JVST', name: 'Jacksonville St',abbr: 'JVST', conf: 'aac',   bg: '#C20E1A', fg: '#000000', tal: 88  },

  // --- Pac-12 ---
  { id: 'BSU',  name: 'Boise State',    abbr: 'BSU',  conf: 'pac',   bg: '#0033A0', fg: '#D64309', tal: 106 },
  { id: 'WSU',  name: 'Washington St',  abbr: 'WSU',  conf: 'pac',   bg: '#981E32', fg: '#5E6A71', tal: 104 },
  { id: 'AF',   name: 'Air Force',      abbr: 'AF',   conf: 'pac',   bg: '#003087', fg: '#B1B3B3', tal: 100 },
  { id: 'ORST', name: 'Oregon State',   abbr: 'ORST', conf: 'pac',   bg: '#DC4405', fg: '#000000', tal: 99  },
  { id: 'SDSU', name: 'San Diego St',   abbr: 'SDSU', conf: 'pac',   bg: '#A6192E', fg: '#000000', tal: 98  },
  { id: 'UNLV', name: 'UNLV',           abbr: 'UNLV', conf: 'pac',   bg: '#CF0A2C', fg: '#666666', tal: 97  },
  { id: 'WYO',  name: 'Wyoming',        abbr: 'WYO',  conf: 'pac',   bg: '#492F24', fg: '#FFC425', tal: 96  },
  { id: 'CSU',  name: 'Colorado St',    abbr: 'CSU',  conf: 'pac',   bg: '#1E4D2B', fg: '#C8C372', tal: 95  },
  { id: 'HAW',  name: 'Hawaii',         abbr: 'HAW',  conf: 'pac',   bg: '#024731', fg: '#C8102E', tal: 94  },
  { id: 'NEV',  name: 'Nevada',         abbr: 'NEV',  conf: 'pac',   bg: '#003366', fg: '#807F84', tal: 93  },
  { id: 'SJSU', name: 'San Jose St',    abbr: 'SJSU', conf: 'pac',   bg: '#0055A2', fg: '#E5A823', tal: 92  },
  { id: 'USU',  name: 'Utah State',     abbr: 'USU',  conf: 'pac',   bg: '#0F2439', fg: '#A7A9AC', tal: 91  },
  { id: 'UNM',  name: 'New Mexico',     abbr: 'UNM',  conf: 'pac',   bg: '#BA0C2F', fg: '#A7A9AC', tal: 90  },
  { id: 'MONT', name: 'Montana',        abbr: 'MONT', conf: 'pac',   bg: '#9B1B30', fg: '#FFFFFF', tal: 89  },
  { id: 'NMSU', name: 'New Mexico St',  abbr: 'NMSU', conf: 'pac',   bg: '#8C0B42', fg: '#000000', tal: 88  },
  { id: 'IDHO', name: 'Idaho',          abbr: 'IDHO', conf: 'pac',   bg: '#B3A369', fg: '#000000', tal: 88  },
];

// Owner handles assigned deterministically (unique across the field).
const FIRST = ['tyler','marcus','dré','cole','sam','danni','morgan','kel','bren','ash',
  'nate','parm','jordan','reese','dee','quinn','blake','gabe','lane','theo',
  'hank','wes','river','vance','beck','iris','otis','jules','remy','sage',
  'nico','wynn','cruz','dash','flynn','gray','heath','ivo','jonah','knox',
  'lux','milo','onyx','pax','rhys','silas','tate','umi','vero','zane'];
const ownerFor = (i) => { const b = FIRST[i % FIRST.length]; const n = Math.floor(i / FIRST.length); return '@' + b + (n ? String(n + 1) : ''); };

const TEAMS = {};
TEAM_LIST.forEach((t, i) => { TEAMS[t.id] = { ...t, owner: t.owner || ownerFor(i), seed: i + 1 }; });
const IDS = TEAM_LIST.map((t) => t.id);

// ----------------------------------------------------------------------------
// Designated rivalries — each pair plays for a named trophy/bragging rights.
// A game between two paired teams is flagged as a rivalry (crossed-swords icon).
// ----------------------------------------------------------------------------
const RIVAL_PAIRS = [
  ['TEX', 'OU'], ['BAMA', 'AUB'], ['UGA', 'UF'], ['LSU', 'ARK'],
  ['TENN', 'VAN'], ['MISS', 'MSST'], ['OSU', 'MICH'], ['ORE', 'WASH'],
  ['USC', 'UCLA'], ['PSU', 'MSU'], ['WISC', 'MINN'], ['IOWA', 'NEB'],
  ['ILL', 'NW'], ['MIA', 'FSU'], ['CLEM', 'SCAR'], ['UNC', 'NCST'],
];
const RIVALS = {};
RIVAL_PAIRS.forEach(([a, b]) => { RIVALS[a] = b; RIVALS[b] = a; });

// ----------------------------------------------------------------------------
// Deterministic PRNG → weekly point totals. Same inputs ⇒ same numbers.
// ----------------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function weekScore(team, w) {
  const r1 = rng(team.seed * 131 + w * 977 + 7);
  const r2 = rng(team.seed * 977 + w * 131 + 13);
  const noise = ((r1 + r2) - 1) * 26; // ~ ±13, bell-ish
  return Math.round((team.tal + noise) * 10) / 10;
}

// Round-robin schedule (circle method) for WEEKS_TOTAL weeks.
function buildSchedule(ids) {
  const arr = ids.slice();
  if (arr.length % 2) arr.push(null); // bye marker (not needed at 100, kept safe)
  const m = arr.length;
  let list = arr.slice();
  const rounds = [];
  for (let w = 0; w < WEEKS_TOTAL; w++) {
    const pairs = {};
    for (let i = 0; i < m / 2; i++) {
      const a = list[i], b = list[m - 1 - i];
      if (a !== null && b !== null) { pairs[a] = b; pairs[b] = a; }
    }
    rounds.push(pairs);
    list = [list[0], list[m - 1], ...list.slice(1, m - 1)]; // rotate, fix first
  }
  return rounds;
}
const SCHEDULE = buildSchedule(IDS);

// Guarantee the designated rivals actually meet during the season. For each
// pair we pick a week and rewire that week's matching with a consistent 2-swap
// (a↔b and their former opponents x↔y), which keeps the week a valid slate.
// Rivalries are spread across played weeks so most show as completed results.
RIVAL_PAIRS.forEach(([a, b], i) => {
  const w = i % WEEKS_PLAYED;
  const wk = SCHEDULE[w];
  if (wk[a] === b) return;                 // already paired
  const x = wk[a], y = wk[b];
  if (!x || !y || x === b || y === a) return;
  wk[a] = b; wk[b] = a; wk[x] = y; wk[y] = x;
});

// Precompute every team's full weekly point total.
const WEEK_PTS = {};
IDS.forEach((id) => {
  WEEK_PTS[id] = [];
  for (let w = 0; w < WEEKS_TOTAL; w++) WEEK_PTS[id].push(weekScore(TEAMS[id], w));
});
// League weekly averages (played weeks) — for chart reference line.
const LEAGUE_WEEK_AVG = [];
for (let w = 0; w < WEEKS_PLAYED; w++) {
  let s = 0; IDS.forEach((id) => { s += WEEK_PTS[id][w]; });
  LEAGUE_WEEK_AVG.push(Math.round((s / IDS.length) * 10) / 10);
}

// Per-team weekly all-play record (vs all other teams that week). Memoized.
const _apCache = {};
function weeklyAllPlay(id, w) {
  const key = id + ':' + w;
  if (_apCache[key]) return _apCache[key];
  const me = WEEK_PTS[id][w];
  let wins = 0, ties = 0;
  IDS.forEach((o) => {
    if (o === id) return;
    const ov = WEEK_PTS[o][w];
    if (me > ov) wins++; else if (me === ov) ties++;
  });
  const res = { wins, ties, games: IDS.length - 1 };
  _apCache[key] = res;
  return res;
}

// ----------------------------------------------------------------------------
// Standings through `upto` weeks — records, PF/PA, all-play %, opponent
// all-play %, CFFB Score, rank.
// ----------------------------------------------------------------------------
function computeStandings(upto) {
  const rows = IDS.map((id) => {
    const t = TEAMS[id];
    let W = 0, L = 0, cW = 0, cL = 0, pf = 0, pa = 0;
    let apW = 0, apG = 0;
    let oppApSum = 0, oppApN = 0; // opponent all-play (strength of schedule)
    const games = [];
    for (let w = 0; w < upto; w++) {
      const oppId = SCHEDULE[w][id];
      const my = WEEK_PTS[id][w];
      const ap = weeklyAllPlay(id, w);
      apW += ap.wins; apG += ap.games;
      if (!oppId) { games.push({ week: w + 1, bye: true }); continue; }
      const ov = WEEK_PTS[oppId][w];
      const win = my > ov;
      pf += my; pa += ov;
      if (win) W++; else L++;
      if (TEAMS[oppId].conf === t.conf) { if (win) cW++; else cL++; }
      const oap = weeklyAllPlay(oppId, w); // how the opponent fared vs the field that week
      const oapPct = (oap.wins / oap.games) * 100;
      oppApSum += oapPct; oppApN++;
      games.push({ week: w + 1, opp: oppId, my, ov, win,
        rivalry: RIVALS[id] === oppId,
        ap: Math.round((ap.wins / ap.games) * 1000) / 10,
        oppAp: Math.round(oapPct * 10) / 10 });
    }
    const played = W + L;
    const allPlay = apG ? apW / apG : 0;
    const oppAllPlay = oppApN ? oppApSum / oppApN : 0;
    const winPct = played ? W / played : 0;
    const ppg = played ? pf / played : 0;
    return { id, ...t, W, L, cW, cL, pf: Math.round(pf * 10) / 10, pa: Math.round(pa * 10) / 10,
      ppg: Math.round(ppg * 10) / 10, papg: Math.round((played ? pa / played : 0) * 10) / 10,
      allPlay, oppAllPlay, oppAllPlayPct: Math.round(oppAllPlay * 10) / 10, winPct, played, games };
  });

  // CFFB Score: composite of all-play (.55), win% (.30), scoring (.15),
  // normalized across the league to a broadcast-friendly 60–98 band.
  const minPF = Math.min(...rows.map((r) => r.ppg));
  const maxPF = Math.max(...rows.map((r) => r.ppg));
  rows.forEach((r) => {
    const pfNorm = maxPF > minPF ? (r.ppg - minPF) / (maxPF - minPF) : 0.5;
    r.raw = r.allPlay * 0.55 + r.winPct * 0.30 + pfNorm * 0.15;
  });
  const minR = Math.min(...rows.map((r) => r.raw));
  const maxR = Math.max(...rows.map((r) => r.raw));
  rows.forEach((r) => {
    r.cffb = Math.round((60 + (r.raw - minR) / (maxR - minR) * 38) * 10) / 10;
    r.allPlayPct = Math.round(r.allPlay * 1000) / 10;
  });
  rows.sort((a, b) => b.cffb - a.cffb || b.pf - a.pf);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

const STANDINGS = computeStandings(WEEKS_PLAYED);
const PREV = computeStandings(WEEKS_PLAYED - 1);
const prevRank = {}; PREV.forEach((r) => { prevRank[r.id] = r.rank; });

// Rank history — standings recomputed after each played week, so every team
// carries its full ladder trajectory + the discrete up/down move each week.
const RANK_HIST = {}; IDS.forEach((id) => { RANK_HIST[id] = []; });
for (let w = 1; w <= WEEKS_PLAYED; w++) {
  computeStandings(w).forEach((r) => { RANK_HIST[r.id].push(r.rank); });
}
STANDINGS.forEach((r) => {
  r.prevRank = prevRank[r.id];
  r.move = prevRank[r.id] - r.rank; // + = climbed
  r.rankHist = RANK_HIST[r.id];     // league rank after each played week
  // per-week discrete move (+ = climbed vs prior week; week 1 = 0, no baseline)
  r.moves = r.rankHist.map((rk, i) => (i === 0 ? 0 : r.rankHist[i - 1] - rk));
  r.upcoming = [];
  for (let w = WEEKS_PLAYED; w < WEEKS_TOTAL; w++) {
    const oppId = SCHEDULE[w][r.id];
    r.upcoming.push({ week: w + 1, opp: oppId || null, rivalry: !!oppId && RIVALS[r.id] === oppId });
  }
  let streak = 0, dir = null;
  for (let i = r.games.length - 1; i >= 0; i--) {
    const g = r.games[i]; if (g.bye) continue;
    if (dir === null) { dir = g.win; streak = 1; }
    else if (g.win === dir) streak++; else break;
  }
  r.streak = dir === null ? '—' : (dir ? 'W' : 'L') + streak;
});

// Conference counts for the filter badges.
const CONF_COUNTS = { all: IDS.length };
IDS.forEach((id) => { const c = TEAMS[id].conf; CONF_COUNTS[c] = (CONF_COUNTS[c] || 0) + 1; });

// League scoring reference.
const LEAGUE_PPG = Math.round((STANDINGS.reduce((s, r) => s + r.ppg, 0) / STANDINGS.length) * 10) / 10;

Object.assign(window, {
  WEEKS_PLAYED, WEEKS_TOTAL, CONFERENCES, CONF_ACCENT, CONF_NAME,
  TEAMS, IDS, STANDINGS, CONF_COUNTS, LEAGUE_WEEK_AVG, LEAGUE_PPG, WEEK_PTS, RANK_HIST,
});
