// CFFB · Auction Board — mock data
// Conferences are divisions of fantasy manager teams (each branded as a
// college program). Players (recruits) are auctioned in "copies" — a single
// player can be rostered by multiple teams, so each lot names which copy it is.

// ----------------------------------------------------------------------------
// Conferences (filter set). logo = relative path to processed conference mark.
// ----------------------------------------------------------------------------
const CONFERENCES = [
  { id: 'sec',   name: 'SEC',     logo: '../assets/conferences/sec.png'   },
  { id: 'b1g',   name: 'Big Ten', logo: '../assets/conferences/b1g.png'   },
  { id: 'acc',   name: 'ACC',     logo: '../assets/conferences/acc.png'   },
  { id: 'big12', name: 'Big 12',  logo: '../assets/conferences/big12.png' },
  { id: 'aac',   name: 'AAC',     logo: '../assets/conferences/aac.png'   },
  { id: 'pac',   name: 'Pac-12',  logo: '../assets/conferences/pac12.png' },
];

// ----------------------------------------------------------------------------
// Teams — fantasy manager teams, grouped by conference.
// budget = season cap, spent = committed so far. remaining derived.
// ----------------------------------------------------------------------------
const TEAMS = {
  // --- SEC ---
  UGA:  { name: 'Georgia',        abbr: 'UGA',  owner: '@tyler',  conf: 'sec',   bg: '#990000', fg: '#FEC10C', budget: 700, spent: 487, pill: '../assets/teams/georgia.png' },
  TEX:  { name: 'Texas',          abbr: 'TEX',  owner: '@marcus', conf: 'sec',   bg: '#BF5700', fg: '#FFFFFF', budget: 700, spent: 552 },
  BAMA: { name: 'Alabama',        abbr: 'BAMA', owner: '@cole',   conf: 'sec',   bg: '#C8102E', fg: '#FFFFFF', budget: 700, spent: 418 },
  LSU:  { name: 'LSU',            abbr: 'LSU',  owner: '@dré',    conf: 'sec',   bg: '#461D7C', fg: '#FDD023', budget: 700, spent: 631 },
  UF:   { name: 'Florida',        abbr: 'UF',   conf: 'sec',      owner: '@sam', bg: '#0021A5', fg: '#FA4616', budget: 700, spent: 344 },

  // --- Big Ten ---
  OSU:  { name: 'Ohio State',     abbr: 'OSU',  owner: '@danni',  conf: 'b1g',   bg: '#BB0000', fg: '#FFFFFF', budget: 700, spent: 596 },
  MICH: { name: 'Michigan',       abbr: 'MICH', owner: '@kel',    conf: 'b1g',   bg: '#00274C', fg: '#FFCB05', budget: 700, spent: 472 },
  ORE:  { name: 'Oregon',         abbr: 'ORE',  owner: '@morgan', conf: 'b1g',   bg: '#154733', fg: '#FEE123', budget: 700, spent: 538 },
  PSU:  { name: 'Penn State',     abbr: 'PSU',  owner: '@bren',   conf: 'b1g',   bg: '#041E42', fg: '#FFFFFF', budget: 700, spent: 401 },
  USC:  { name: 'USC',            abbr: 'USC',  owner: '@ash',    conf: 'b1g',   bg: '#841617', fg: '#F2A900', budget: 700, spent: 645 },

  // --- ACC ---
  UNC:  { name: 'North Carolina', abbr: 'UNC',  owner: '@jordan', conf: 'acc',   bg: '#7BAFD4', fg: '#13294B', budget: 700, spent: 423, pill: '../assets/teams/north-carolina.png' },
  MIA:  { name: 'Miami',          abbr: 'MIA',  owner: '@nate',   conf: 'acc',   bg: '#F47321', fg: '#005030', budget: 700, spent: 512 },
  CLEM: { name: 'Clemson',        abbr: 'CLEM', owner: '@parm',   conf: 'acc',   bg: '#F56600', fg: '#522D80', budget: 700, spent: 588 },
  FSU:  { name: 'Florida State',  abbr: 'FSU',  owner: '@dee',    conf: 'acc',   bg: '#782F40', fg: '#CEB888', budget: 700, spent: 366 },
  LOU:  { name: 'Louisville',     abbr: 'LOU',  owner: '@reese',  conf: 'acc',   bg: '#AD0000', fg: '#FFFFFF', budget: 700, spent: 294 },

  // --- Big 12 ---
  KU:   { name: 'Kansas',         abbr: 'KU',   owner: '@gabe',   conf: 'big12', bg: '#0051BA', fg: '#E8000D', budget: 700, spent: 478 },
  TCU:  { name: 'TCU',            abbr: 'TCU',  owner: '@blake',  conf: 'big12', bg: '#4D1979', fg: '#FFFFFF', budget: 700, spent: 542 },
  BYU:  { name: 'BYU',            abbr: 'BYU',  owner: '@lane',   conf: 'big12', bg: '#002E5D', fg: '#FFFFFF', budget: 700, spent: 387 },
  UTAH: { name: 'Utah',           abbr: 'UTAH', owner: '@quinn',  conf: 'big12', bg: '#CC0000', fg: '#FFFFFF', budget: 700, spent: 611 },
  ISU:  { name: 'Iowa State',     abbr: 'ISU',  owner: '@theo',   conf: 'big12', bg: '#C8102E', fg: '#F1BE48', budget: 700, spent: 333 },

  // --- AAC ---
  ARMY: { name: 'Army',           abbr: 'ARMY', owner: '@hank',   conf: 'aac',   bg: '#2C2A29', fg: '#D4BF91', budget: 700, spent: 402, pill: '../assets/teams/army.png' },
  NAVY: { name: 'Navy',           abbr: 'NAVY', owner: '@river',  conf: 'aac',   bg: '#00205B', fg: '#C5B783', budget: 700, spent: 519 },
  MEM:  { name: 'Memphis',        abbr: 'MEM',  owner: '@otis',   conf: 'aac',   bg: '#003087', fg: '#898D8D', budget: 700, spent: 356 },
  FRES: { name: 'Fresno State',   abbr: 'FRES', owner: '@wes',    conf: 'aac',   bg: '#DB0032', fg: '#002E6D', budget: 700, spent: 588, pill: '../assets/teams/fresno-state.png' },
  TUL:  { name: 'Tulane',         abbr: 'TUL',  owner: '@iris',   conf: 'aac',   bg: '#006747', fg: '#418FDE', budget: 700, spent: 277 },

  // --- Pac-12 ---
  ORST: { name: 'Oregon State',   abbr: 'ORST', owner: '@beck',   conf: 'pac',   bg: '#DC4405', fg: '#000000', budget: 700, spent: 431 },
  WSU:  { name: 'Washington St',  abbr: 'WSU',  owner: '@vance',  conf: 'pac',   bg: '#981E32', fg: '#5E6A71', budget: 700, spent: 502 },
};

// ----------------------------------------------------------------------------
// Conference accent colors (desaturated signature) — used for pill conf edge.
// ----------------------------------------------------------------------------
const CONF_ACCENT = {
  sec: '#C9A227', b1g: '#4A6FA5', acc: '#8B4A5C', big12: '#B84545', aac: '#6B5C8B', pac: '#5C7A6A',
};

// ----------------------------------------------------------------------------
// Position accent colors (from DS POS_COLORS).
// ----------------------------------------------------------------------------
const POS_COLORS = {
  QB: '#C9A227', RB: '#3B82C4', WR: '#7BA4C9', TE: '#E8C547',
  OL: '#8A8A8A', DL: '#8B6F1F', LB: '#B84545', DB: '#6E86A8', ATH: '#9A9A9A',
};

// ----------------------------------------------------------------------------
// Player pool (recruits being auctioned).
// ----------------------------------------------------------------------------
const PLAYERS = {
  arch:   { name: 'Arch Manning',     pos: 'QB', cls: 'Jr', stars: 5, posRank: 1,  score: 98.4 },
  smith:  { name: 'Jeremiah Smith',   pos: 'WR', cls: 'So', stars: 5, posRank: 1,  score: 97.6 },
  love:   { name: 'Jeremiyah Love',   pos: 'RB', cls: 'So', stars: 4, posRank: 3,  score: 91.2 },
  downs:  { name: 'Caleb Downs',      pos: 'DB', cls: 'So', stars: 5, posRank: 1,  score: 96.8 },
  uw:     { name: 'Bryce Underwood',  pos: 'QB', cls: 'Fr', stars: 5, posRank: 4,  score: 95.1 },
  will:   { name: 'Ryan Williams',    pos: 'WR', cls: 'So', stars: 5, posRank: 2,  score: 96.0 },
  nuss:   { name: 'Garrett Nussmeier', pos: 'QB', cls: 'Sr', stars: 4, posRank: 6, score: 88.5 },
  moore:  { name: 'Dante Moore',      pos: 'QB', cls: 'So', stars: 4, posRank: 9,  score: 85.7 },
  skatt:  { name: 'Cam Skattebo',     pos: 'RB', cls: 'Sr', stars: 3, posRank: 11, score: 79.3 },
  beck:   { name: 'Carson Beck',      pos: 'QB', cls: 'Sr', stars: 4, posRank: 7,  score: 87.9 },
  allar:  { name: 'Drew Allar',       pos: 'QB', cls: 'Sr', stars: 4, posRank: 8,  score: 86.4 },
  golden: { name: 'Tetairoa McMillan', pos: 'WR', cls: 'Jr', stars: 5, posRank: 3, score: 94.2 },
  carter: { name: "Dillon Gabriel",   pos: 'QB', cls: 'Sr', stars: 4, posRank: 10, score: 84.0 },
  egbuka: { name: 'Emeka Egbuka',     pos: 'WR', cls: 'Sr', stars: 4, posRank: 5,  score: 90.6 },
  hamp:   { name: 'Nic Anderson',     pos: 'WR', cls: 'Jr', stars: 4, posRank: 8,  score: 83.1 },
  tuten:  { name: 'Bhayshul Tuten',   pos: 'RB', cls: 'Sr', stars: 3, posRank: 14, score: 76.8 },
  hunter: { name: 'Travis Hunter',    pos: 'ATH', cls: 'Sr', stars: 5, posRank: 1, score: 97.0 },
  loveland: { name: 'Colston Loveland', pos: 'TE', cls: 'Jr', stars: 4, posRank: 2, score: 89.3 },
  jackson: { name: 'Jordyn Tyson',    pos: 'WR', cls: 'Jr', stars: 4, posRank: 7,  score: 85.0 },
  cross:  { name: 'Kadyn Proctor',    pos: 'OL', cls: 'Jr', stars: 4, posRank: 3,  score: 82.5 },
};

// ----------------------------------------------------------------------------
// LIVE lots — players currently up. conf scopes which auction room.
// copy = { n, of }. bidder = team id. endsAt = ms-from-now baseline (seconds).
// ----------------------------------------------------------------------------
const LIVE_LOTS = [
  // SEC
  { id: 'l1', conf: 'sec',   player: 'arch',  copy: { n: 2, of: 4 }, highBid: 118, bidder: 'TEX',  secs: 14 },
  { id: 'l2', conf: 'sec',   player: 'will',  copy: { n: 1, of: 3 }, highBid: 67,  bidder: 'BAMA', secs: 41 },
  { id: 'l3', conf: 'sec',   player: 'beck',  copy: { n: 3, of: 3 }, highBid: 54,  bidder: 'UGA',  secs: 8  },
  { id: 'l4', conf: 'sec',   player: 'nuss',  copy: { n: 1, of: 2 }, highBid: 39,  bidder: 'LSU',  secs: 27 },
  // Big Ten
  { id: 'l5', conf: 'b1g',   player: 'smith', copy: { n: 1, of: 4 }, highBid: 96,  bidder: 'OSU',  secs: 19 },
  { id: 'l6', conf: 'b1g',   player: 'uw',    copy: { n: 2, of: 3 }, highBid: 44,  bidder: 'MICH', secs: 6  },
  { id: 'l7', conf: 'b1g',   player: 'moore', copy: { n: 1, of: 2 }, highBid: 35,  bidder: 'ORE',  secs: 33 },
  { id: 'l8', conf: 'b1g',   player: 'egbuka',copy: { n: 2, of: 2 }, highBid: 58,  bidder: 'USC',  secs: 11 },
  // ACC
  { id: 'l9', conf: 'acc',   player: 'hunter',copy: { n: 1, of: 3 }, highBid: 102, bidder: 'MIA',  secs: 22 },
  { id: 'l10',conf: 'acc',   player: 'jackson',copy:{ n: 2, of: 3 }, highBid: 47,  bidder: 'CLEM', secs: 15 },
  { id: 'l11',conf: 'acc',   player: 'tuten', copy: { n: 1, of: 2 }, highBid: 24,  bidder: 'UNC',  secs: 38 },
  // Big 12
  { id: 'l12',conf: 'big12', player: 'golden',copy: { n: 1, of: 3 }, highBid: 71,  bidder: 'UTAH', secs: 17 },
  { id: 'l13',conf: 'big12', player: 'carter',copy: { n: 2, of: 2 }, highBid: 33,  bidder: 'TCU',  secs: 9  },
  { id: 'l14',conf: 'big12', player: 'cross', copy: { n: 1, of: 2 }, highBid: 41,  bidder: 'KU',   secs: 44 },
  // AAC
  { id: 'l15',conf: 'aac',   player: 'skatt', copy: { n: 1, of: 2 }, highBid: 28,  bidder: 'FRES', secs: 13 },
  { id: 'l16',conf: 'aac',   player: 'hamp',  copy: { n: 2, of: 3 }, highBid: 36,  bidder: 'NAVY', secs: 25 },
  { id: 'l17',conf: 'aac',   player: 'loveland',copy:{ n: 1, of: 2 },highBid: 31,  bidder: 'MEM',  secs: 7  },
  // Pac-12
  { id: 'l18',conf: 'pac',   player: 'allar', copy: { n: 1, of: 2 }, highBid: 37,  bidder: 'ORST', secs: 20 },
  { id: 'l19',conf: 'pac',   player: 'downs', copy: { n: 2, of: 2 }, highBid: 49,  bidder: 'WSU',  secs: 12 },
];

// ----------------------------------------------------------------------------
// COMPLETED lots — sold. winner = team id. price = final hammer.
// ----------------------------------------------------------------------------
const COMPLETED = [
  // SEC
  { id: 'c1', conf: 'sec',  player: 'smith',  copy: { n: 3, of: 4 }, price: 94, winner: 'UGA'  },
  { id: 'c2', conf: 'sec',  player: 'downs',  copy: { n: 1, of: 2 }, price: 47, winner: 'TEX'  },
  { id: 'c3', conf: 'sec',  player: 'love',   copy: { n: 2, of: 3 }, price: 52, winner: 'LSU'  },
  { id: 'c4', conf: 'sec',  player: 'will',   copy: { n: 3, of: 3 }, price: 61, winner: 'BAMA' },
  { id: 'c5', conf: 'sec',  player: 'arch',   copy: { n: 1, of: 4 }, price: 132, winner: 'UF'  },
  { id: 'c6', conf: 'sec',  player: 'egbuka', copy: { n: 1, of: 2 }, price: 44, winner: 'UGA'  },
  // Big Ten
  { id: 'c7', conf: 'b1g',  player: 'smith',  copy: { n: 2, of: 4 }, price: 88, winner: 'MICH' },
  { id: 'c8', conf: 'b1g',  player: 'downs',  copy: { n: 2, of: 2 }, price: 41, winner: 'OSU'  },
  { id: 'c9', conf: 'b1g',  player: 'moore',  copy: { n: 2, of: 2 }, price: 30, winner: 'PSU'  },
  { id: 'c10',conf: 'b1g',  player: 'uw',     copy: { n: 1, of: 3 }, price: 38, winner: 'ORE'  },
  { id: 'c11',conf: 'b1g',  player: 'loveland',copy:{ n: 2, of: 2 }, price: 34, winner: 'USC'  },
  // ACC
  { id: 'c12',conf: 'acc',  player: 'hunter', copy: { n: 2, of: 3 }, price: 97, winner: 'CLEM' },
  { id: 'c13',conf: 'acc',  player: 'jackson',copy: { n: 1, of: 3 }, price: 51, winner: 'MIA'  },
  { id: 'c14',conf: 'acc',  player: 'tuten',  copy: { n: 2, of: 2 }, price: 22, winner: 'FSU'  },
  { id: 'c15',conf: 'acc',  player: 'golden', copy: { n: 3, of: 3 }, price: 69, winner: 'LOU'  },
  // Big 12
  { id: 'c16',conf: 'big12',player: 'golden', copy: { n: 2, of: 3 }, price: 66, winner: 'BYU'  },
  { id: 'c17',conf: 'big12',player: 'carter', copy: { n: 1, of: 2 }, price: 35, winner: 'ISU'  },
  { id: 'c18',conf: 'big12',player: 'cross',  copy: { n: 2, of: 2 }, price: 29, winner: 'UTAH' },
  // AAC
  { id: 'c19',conf: 'aac',  player: 'skatt',  copy: { n: 2, of: 2 }, price: 24, winner: 'ARMY' },
  { id: 'c20',conf: 'aac',  player: 'hamp',   copy: { n: 1, of: 3 }, price: 33, winner: 'TUL'  },
  { id: 'c21',conf: 'aac',  player: 'hamp',   copy: { n: 3, of: 3 }, price: 39, winner: 'FRES' },
  // Pac-12
  { id: 'c22',conf: 'pac',  player: 'allar',  copy: { n: 2, of: 2 }, price: 31, winner: 'WSU'  },
];

Object.assign(window, { CONFERENCES, TEAMS, POS_COLORS, CONF_ACCENT, PLAYERS, LIVE_LOTS, COMPLETED });
