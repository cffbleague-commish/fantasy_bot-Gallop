// Mock data for the UI kit. Fake players, league teams, bid history.
const PLAYERS = [
  { id: 'p1',  name: 'Arch Manning',   pos: 'QB',  team: 'TEX',  cls: 'Jr',  ht: `6'4"`, wt: 215, num: 16, stars: 5, bid: 112, proj: 126, posRank: 3, conf: 'sec' },
  { id: 'p2',  name: 'Jeremiyah Love', pos: 'RB',  team: 'ND',   cls: 'So',  ht: `6'0"`, wt: 206, num: 4,  stars: 4, bid: 48,  proj: 42,  posRank: 7, conf: 'ind' },
  { id: 'p3',  name: 'Jeremiah Smith', pos: 'WR',  team: 'OSU',  cls: 'So',  ht: `6'3"`, wt: 215, num: 4,  stars: 5, bid: 94,  proj: 86,  posRank: 1, conf: 'b1g' },
  { id: 'p4',  name: 'Carson Beck',    pos: 'QB',  team: 'UGA',  cls: 'Sr',  ht: `6'4"`, wt: 220, num: 15, stars: 4, bid: 62,  proj: 68,  posRank: 9, conf: 'sec' },
  { id: 'p5',  name: 'Quinn Ewers',    pos: 'QB',  team: 'TEX',  cls: 'Sr',  ht: `6'2"`, wt: 195, num: 3,  stars: 5, bid: 78,  proj: 71,  posRank: 6, conf: 'sec' },
  { id: 'p6',  name: 'Bryce Underwood',pos: 'QB',  team: 'MICH', cls: 'Fr',  ht: `6'3"`, wt: 205, num: 19, stars: 5, bid: 38,  proj: 52,  posRank: 12,conf: 'b1g' },
  { id: 'p7',  name: 'Ryan Williams',  pos: 'WR',  team: 'BAMA', cls: 'So',  ht: `6'0"`, wt: 175, num: 2,  stars: 5, bid: 64,  proj: 58,  posRank: 4, conf: 'sec' },
  { id: 'p8',  name: 'Caleb Downs',    pos: 'DB',  team: 'OSU',  cls: 'So',  ht: `6'0"`, wt: 205, num: 2,  stars: 5, bid: 41,  proj: 44,  posRank: 1, conf: 'b1g' },
  { id: 'p9',  name: 'Cam Skattebo',   pos: 'RB',  team: 'USC',  cls: 'Sr',  ht: `5'10"`,wt: 210, num: 4,  stars: 3, bid: 22,  proj: 28,  posRank: 18,conf: 'b1g' },
  { id: 'p10', name: 'Dante Moore',    pos: 'QB',  team: 'ORE',  cls: 'So',  ht: `6'3"`, wt: 205, num: 5,  stars: 4, bid: 34,  proj: 30,  posRank: 14,conf: 'b1g' },
  { id: 'p11', name: 'Garrett Nussmeier', pos: 'QB', team: 'LSU', cls: 'Sr', ht: `6'2"`, wt: 200, num: 13, stars: 4, bid: 44, proj: 41, posRank: 8, conf: 'sec' },
  { id: 'p12', name: 'Drew Allar',     pos: 'QB',  team: 'PSU',  cls: 'Sr',  ht: `6'5"`, wt: 235, num: 15, stars: 4, bid: 38,  proj: 35,  posRank: 11,conf: 'b1g' },
];

const LEAGUE_TEAMS = [
  { rank: 1, name: 'Burnt Orange Cartel',  owner: '@tyler',     grade: 'A+', spend: 487, value: 72, cap: 13, commits: { 5: 3, 4: 7, 3: 8, 2: 4 } },
  { rank: 2, name: 'Death Valley',         owner: '@jamie',     grade: 'A',  spend: 466, value: 54, cap: 34, commits: { 5: 2, 4: 8, 3: 9, 2: 3 } },
  { rank: 3, name: 'Bo Knows',             owner: '@ash',       grade: 'A',  spend: 478, value: 41, cap: 22, commits: { 5: 2, 4: 7, 3: 10, 2: 3 } },
  { rank: 4, name: 'Touchdown Jesus',      owner: '@bren',      grade: 'A−', spend: 462, value: 28, cap: 38, commits: { 5: 1, 4: 8, 3: 8, 2: 5 } },
  { rank: 5, name: 'Roll Damn Tide',       owner: '@cole',      grade: 'B+', spend: 458, value: 12, cap: 42, commits: { 5: 1, 4: 7, 3: 11, 2: 3 } },
  { rank: 6, name: 'Quack Attack',         owner: '@morgan',    grade: 'B',  spend: 471, value: 4,  cap: 29, commits: { 5: 1, 4: 6, 3: 10, 2: 5 } },
  { rank: 7, name: 'Game of Inches',       owner: '@nate',      grade: 'B',  spend: 446, value: -8, cap: 54, commits: { 5: 0, 4: 7, 3: 11, 2: 4 } },
  { rank: 8, name: 'The Horseshoe',        owner: '@danni',     grade: 'B−', spend: 482, value: -14, cap: 18, commits: { 5: 1, 4: 5, 3: 12, 2: 4 } },
  { rank: 9, name: 'Block M',              owner: '@kel',       grade: 'C+', spend: 459, value: -26, cap: 41, commits: { 5: 0, 4: 6, 3: 11, 2: 5 } },
  { rank: 10, name: 'Cocky',               owner: '@san',       grade: 'C',  spend: 441, value: -38, cap: 59, commits: { 5: 0, 4: 5, 3: 13, 2: 4 } },
  { rank: 11, name: 'Hokie Stone',         owner: '@dee',       grade: 'D+', spend: 437, value: -52, cap: 63, commits: { 5: 0, 4: 4, 3: 11, 2: 7 } },
  { rank: 12, name: 'Sad Trombone',        owner: '@parm',      grade: 'D',  spend: 432, value: -68, cap: 68, commits: { 5: 0, 4: 3, 3: 12, 2: 7 } },
];

const ACTIVITY = [
  { t: '0:08', who: 'Tyler',  what: 'bid on Arch Manning',   bid: 112 },
  { t: '0:14', who: 'Jamie',  what: 'passed on Arch Manning' },
  { t: '0:22', who: 'Ash',    what: 'bid on Arch Manning',   bid: 108 },
  { t: '0:31', who: 'Tyler',  what: 'opened bid',            bid: 100 },
  { t: '0:47', who: 'Ash',    what: 'nominated Arch Manning' },
  { t: '1:12', who: 'Morgan', what: 'won Caleb Downs',       bid: 41 },
  { t: '1:38', who: 'Bren',   what: 'won Ryan Williams',     bid: 64 },
  { t: '2:05', who: 'Cole',   what: 'won Jeremiah Smith',    bid: 94 },
];

window.PLAYERS = PLAYERS;
window.LEAGUE_TEAMS = LEAGUE_TEAMS;
window.ACTIVITY = ACTIVITY;
