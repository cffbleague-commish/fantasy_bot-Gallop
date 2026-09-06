/* CFFB — Live Scoring sample data (MFL home-page module).
   All names, scores and stats are fictional sample data. */
(function () {
  // Fantasy franchises
  const F = {
    TYL: { abbr: 'UGA', name: 'Georgia', manager: 'Tyler Boudreaux', rec: '1-0', color: '#BA0C2F', txt: '#F5F5F5', pill: 'georgia' },
    MAR: { abbr: 'MICH', name: 'Michigan', manager: 'Marcus Hale', rec: '0-1', color: '#2C5CA8', txt: '#F5F5F5' },
    DEV: { abbr: 'ORE', name: 'Oregon', manager: 'Devin Okafor', rec: '1-0', color: '#1F5C46', txt: '#F5F5F5' },
    JOR: { abbr: 'CLEM', name: 'Clemson', manager: 'Jordan Vasquez', rec: '1-0', color: '#C4552B', txt: '#0A0A0A' },
    SAM: { abbr: 'MISS', name: 'Ole Miss', manager: 'Sam Whitfield', rec: '0-1', color: '#1F3A6E', txt: '#F5F5F5' },
    NIC: { abbr: 'UNC', name: 'North Carolina', manager: 'Nico Brandt', rec: '1-0', color: '#4B9CD3', txt: '#0A0A0A', pill: 'north-carolina' },
    PRI: { abbr: 'MIA', name: 'Miami', manager: 'Priya Raman', rec: '0-1', color: '#14746A', txt: '#F5F5F5' },
    AAR: { abbr: 'TAMU', name: 'Texas A&M', manager: 'Aaron Delgado', rec: '0-1', color: '#6E2639', txt: '#F5F5F5' },
    KEN: { abbr: 'TENN', name: 'Tennessee', manager: 'Kendra Doyle', rec: '1-0', color: '#C87A2A', txt: '#0A0A0A' },
    OMA: { abbr: 'ARMY', name: 'Army', manager: 'Omar Haddad', rec: '0-1', color: '#0A0A0A', txt: '#D4BF91', pill: 'army' },
  };
  // College teams the drafted players play for. 3rd entry = ripped-pill art slug in assets/teams/.
  const CT = {
    UGA:['#BA0C2F','#fff','georgia'], UNC:['#4B9CD3','#0A0A0A','north-carolina'],
    ARMY:['#0A0A0A','#D4BF91','army'], FRES:['#DB0032','#003594','fresno-state'], CLEM:['#F56600','#522D80'], MICH:['#00274C','#FFCB05'], TEX:['#BF5700','#fff'],
    ALA:['#9E1B32','#fff'], TENN:['#FF8200','#0A0A0A'], ORE:['#154733','#FEE123'], OSU:['#BB0000','#fff'],
    FSU:['#782F40','#CEB888'], LSU:['#461D7C','#FDD023'], ND:['#0C2340','#C99700'], PSU:['#041E42','#fff'],
    FLA:['#0021A5','#fff'], MIA:['#F47321','#005030'], KU:['#0051BA','#E8000D'], OU:['#841617','#fff'],
    NEB:['#E41C38','#fff'], USC:['#990000','#FFC72C'], ISU:['#C8102E','#F1BE48'], COLO:['#000000','#CFB87C'],
    SC:['#73000A','#fff'], IOWA:['#FFCD00','#0A0A0A'], BAY:['#003015','#FFB81C'], UW:['#4B2E83','#B7A57A'],
  };
  // Real-world game slate. st: LIVE | FINAL | PRE
  const G = {
    uga:  { label: 'CLEM @ UGA',  st: 'LIVE',  detail: 'Q3 4:12',   score: 'CLEM 20 · UGA 17' },
    tex:  { label: 'MICH @ TEX',  st: 'LIVE',  detail: 'Q2 0:48',   score: 'MICH 10 · TEX 14' },
    ten:  { label: 'ALA @ TENN',  st: 'LIVE',  detail: 'Q3 11:05',  score: 'ALA 24 · TENN 21' },
    ou:   { label: 'KU @ OU',     st: 'LIVE',  detail: 'Q4 8:33',   score: 'KU 17 · OU 34' },
    osu:  { label: 'ORE @ OSU',   st: 'FINAL', detail: 'Final',     score: 'ORE 28 · OSU 31' },
    lsu:  { label: 'FSU @ LSU',   st: 'FINAL', detail: 'Final',     score: 'FSU 13 · LSU 27' },
    isu:  { label: 'ISU @ COLO',  st: 'FINAL', detail: 'Final',     score: 'ISU 24 · COLO 20' },
    psu:  { label: 'ND @ PSU',    st: 'PRE',   detail: '7:30 PM ET', score: '' },
    mia:  { label: 'FLA @ MIA',   st: 'PRE',   detail: '4:15 PM ET', score: '' },
    usc:  { label: 'NEB @ USC',   st: 'PRE',   detail: '10:30 PM ET', score: '' },
    unc:  { label: 'ARMY @ UNC',  st: 'LIVE',  detail: 'Q2 6:41',   score: 'ARMY 13 · UNC 10' },
    fre:  { label: 'FRES @ USU',  st: 'FINAL', detail: 'Final',     score: 'FRES 31 · USU 24' },
  };
  // "SLOT|POS|Name|CT|gameKey|stat|pts|proj"  — B- prefix = bench
  const R = {
    JOR: [
      'QB|QB|Kip Lorentzen|UGA|uga|18/24 · 232 YD · 2 TD|21.4|30.2',
      'RB|RB|Ike Fontenette|LSU|lsu|22 CAR · 141 YD · 2 TD|24.7|19.5',
      'RB|RB|Amari Delacroix|TEX|tex|9 CAR · 52 YD|8.2|15.8',
      'WR|WR|Deion Cassar|UNC|unc|5 REC · 84 YD · TD|14.9|18.5',
      'WR|WR|Tavien Rhoads|TENN|ten|4 REC · 73 YD|11.3|16.5',
      'TE|TE|Marcell Vanterpool|ND|psu|—|0.0|11.2',
      'FLX|WR|Quincy Aldana|OU|ou|5 REC · 66 YD · TD|13.6|17.9',
      'B-QB|QB|Rowan Tessier|PSU|psu|—|0.0|16.4',
      'B-RB|RB|Kadeem Ostrander|MIA|mia|—|0.0|12.1',
      'B-WR|WR|Sonny Malbrough|COLO|isu|3 REC · 41 YD|6.4|10.8',
      'B-TE|TE|Gib Rantoul|ISU|isu|2 REC · 22 YD|4.2|8.5',
    ],
    TYL: [
      'QB|QB|Marek Sulligan|ALA|ten|16/23 · 198 YD · 2 TD · INT|17.8|26.4',
      'RB|RB|Booker Lafitte|OSU|osu|14 CAR · 68 YD · TD|12.4|16.0',
      'RB|RB|Junior Okwuosa|OU|ou|17 CAR · 94 YD · TD|15.1|19.4',
      'WR|WR|Ryland Vause|UGA|uga|4 REC · 58 YD|9.8|14.7',
      'WR|WR|Cortez Mabry|USC|usc|—|0.0|21.5',
      'TE|TE|Amos Trelayne|ALA|ten|5 REC · 62 YD · TD|14.2|18.6',
      'FLX|WR|Dontae Whitfield|FRES|fre|6 REC · 49 YD|10.9|12.5',
      'B-QB|QB|Cash Delhomme|MIA|mia|—|0.0|14.8',
      'B-RB|RB|Tre Vontae Simms|NEB|usc|—|0.0|13.5',
      'B-WR|WR|Pax Brumfield|ISU|isu|4 REC · 55 YD|8.8|9.5',
      'B-TE|TE|Ossie Ferrand|TEX|tex|1 REC · 11 YD|3.1|6.2',
    ],
    MAR: [
      'QB|QB|Dax Whitlow|MICH|tex|14/19 · 176 YD · TD|14.9|24.1',
      'RB|RB|Cyrus Ostergaard|ISU|isu|19 CAR · 102 YD · TD|17.2|14.5',
      'RB|RB|Deuce Manigault|FLA|mia|—|0.0|13.8',
      'WR|WR|Kellan Broadnax|UGA|uga|3 REC · 44 YD|7.4|13.2',
      'WR|WR|Ty Renfroe|OSU|osu|5 REC · 71 YD|12.1|11.0',
      'TE|TE|Hollis Beacham|PSU|psu|—|0.0|9.8',
      'FLX|RB|Marquez Odom|COLO|isu|11 CAR · 63 YD|9.3|8.0',
      'B-QB|QB|Bode Lindqvist|NEB|usc|—|0.0|15.2',
      'B-RB|RB|Zavier Culbreath|SC|lsu|8 CAR · 34 YD|4.4|7.5',
      'B-WR|WR|Denzel Marsalis|OU|ou|2 REC · 28 YD|4.8|8.2',
      'B-WR|WR|Finn Okonkwo|UW|usc|—|0.0|10.4',
    ],
    KEN: [
      'QB|QB|Tobias Renderos|OU|ou|20/26 · 271 YD · 3 TD|26.8|31.0',
      'RB|RB|Ronnie Peraza|TENN|ten|16 CAR · 88 YD · TD|14.6|21.2',
      'RB|RB|Judah Castellanos|OSU|osu|12 CAR · 55 YD|7.7|10.5',
      'WR|WR|Micah Vanlandingham|ALA|ten|6 REC · 91 YD · TD|15.3|18.9',
      'WR|WR|Cole Abernathy|ND|psu|—|0.0|14.6',
      'TE|TE|Dez Whitcomb|LSU|lsu|4 REC · 38 YD|7.0|8.5',
      'FLX|WR|Jaylen Okoro|TEX|tex|3 REC · 47 YD|7.9|12.4',
      'B-QB|QB|Miles Ferrucci|FSU|lsu|9/17 · 88 YD|4.9|11.0',
      'B-RB|RB|Bryce Delhomme|MIA|mia|—|0.0|11.8',
      'B-WR|WR|Ade Ogunleye|USC|usc|—|0.0|12.6',
      'B-TE|TE|Wes Portnoy|ARMY|unc|1 REC · 12 YD|2.2|6.4',
    ],
    DEV: [
      'QB|QB|Lucan Petrakis|OSU|osu|24/31 · 305 YD · 3 TD|28.9|22.5',
      'RB|RB|Silas Kettering|ORE|osu|21 CAR · 132 YD · 2 TD|23.1|18.0',
      'RB|RB|Rome Tuilagi|UGA|uga|13 CAR · 71 YD · TD|13.4|16.2',
      'WR|WR|Kwame Asante|TENN|ten|5 REC · 84 YD|12.9|15.5',
      'WR|WR|Beckett Marsh|PSU|psu|—|0.0|13.9',
      'TE|TE|Truman Vail|TEX|tex|2 REC · 26 YD|4.6|9.2',
      'FLX|WR|Idris Fontaine|OU|ou|4 REC · 59 YD · TD|13.4|15.0',
      'B-QB|QB|Sonny Alvarado|MIA|mia|—|0.0|13.7',
      'B-RB|RB|Everett Kohl|ISU|isu|10 CAR · 48 YD|5.8|9.0',
      'B-WR|WR|Malik Devereaux|NEB|usc|—|0.0|11.5',
      'B-TE|TE|Cutter Blaylock|FLA|mia|—|0.0|7.8',
    ],
    PRI: [
      'QB|QB|Enzo Marchetti|FSU|lsu|17/29 · 201 YD · TD · 2 INT|11.7|20.0',
      'RB|RB|Dorian Whitfield|ALA|ten|10 CAR · 41 YD|5.6|13.5',
      'RB|RB|Kingston Abara|USC|usc|—|0.0|15.8',
      'WR|WR|Théo Bardin|MIA|mia|—|0.0|17.2',
      'WR|WR|Rasheed Coble|UGA|uga|2 REC · 31 YD|4.1|11.0',
      'TE|TE|Judd Hollifield|OU|ou|3 REC · 34 YD · TD|9.4|10.5',
      'FLX|RB|Nico Santamaria|COLO|isu|14 CAR · 77 YD|9.7|8.5',
      'B-QB|QB|Ash Delacroix|ND|psu|—|0.0|14.1',
      'B-RB|RB|Omari Vann|LSU|lsu|6 CAR · 22 YD|2.9|6.5',
      'B-WR|WR|Case Ridenour|MICH|tex|1 REC · 18 YD|2.8|9.8',
      'B-WR|WR|Jalil Boudreaux|SC|lsu|3 REC · 36 YD|5.6|7.0',
    ],
    SAM: [
      'QB|QB|Brooks Calloway|ND|psu|—|0.0|22.8',
      'RB|RB|Terrell Ashford|FSU|lsu|12 CAR · 49 YD|6.1|12.0',
      'RB|RB|Duke Palmieri|TEX|tex|8 CAR · 39 YD|5.5|14.2',
      'WR|WR|Zion Marbury|TENN|ten|3 REC · 42 YD|6.7|13.0',
      'WR|WR|Holden Cress|ISU|isu|4 REC · 52 YD|8.4|9.0',
      'TE|TE|Roman Kavanagh|UGA|uga|1 REC · 9 YD|1.9|8.8',
      'FLX|WR|Darius Whitlock|COLO|isu|5 REC · 63 YD|10.5|9.5',
      'B-QB|QB|Gunnar Espinoza|BAY|ou|—|0.0|12.5',
      'B-RB|RB|Amos Rialto|MIA|mia|—|0.0|10.9',
      'B-WR|WR|Kelvin Osei|PSU|psu|—|0.0|11.2',
      'B-TE|TE|Boone Latimer|NEB|usc|—|0.0|6.8',
    ],
    NIC: [
      'QB|QB|Jett Corvalan|TEX|tex|12/16 · 154 YD · 2 TD|17.5|27.3',
      'RB|RB|Maceo Drummond|OU|ou|18 CAR · 101 YD · TD|16.9|18.5',
      'RB|RB|Trevon Ballentine|UGA|uga|11 CAR · 58 YD|7.6|13.4',
      'WR|WR|Bo Ashgrove|OSU|osu|8 REC · 124 YD · 2 TD|22.6|15.5',
      'WR|WR|Santino Reyes|LSU|lsu|5 REC · 67 YD · TD|12.9|11.5',
      'TE|TE|Foster McElhaney|ALA|ten|3 REC · 41 YD|6.8|9.6',
      'FLX|WR|Devan Okposo|PSU|psu|—|0.0|13.8',
      'B-QB|QB|Rio Talamantez|USC|usc|—|0.0|15.9',
      'B-RB|RB|Chandler Boyette|FLA|mia|—|0.0|12.2',
      'B-WR|WR|Isaiah Pemberton|ND|psu|—|0.0|10.6',
      'B-TE|TE|Grady Sutcliffe|COLO|isu|1 REC · 14 YD|2.4|5.5',
    ],
    AAR: [
      'QB|QB|Solomon Vickery|LSU|lsu|22/30 · 288 YD · 2 TD|22.7|18.5',
      'RB|RB|Jamarion Twombly|TENN|ten|13 CAR · 72 YD|9.2|14.8',
      'RB|RB|Rocco Delgadillo|PSU|psu|—|0.0|13.2',
      'WR|WR|Rell Coutinho|UGA|uga|6 REC · 97 YD · TD|17.7|16.0',
      'WR|WR|Kace Winslow|OU|ou|3 REC · 39 YD|6.9|10.2',
      'TE|TE|Emory Blackshear|MICH|tex|2 REC · 19 YD|3.9|8.4',
      'FLX|RB|Dante Okafor-Hill|OSU|osu|9 CAR · 44 YD · TD|10.4|9.0',
      'B-QB|QB|Beau Marchand|FLA|mia|—|0.0|13.9',
      'B-RB|RB|Zeke Pastorius|USC|usc|—|0.0|12.7',
      'B-WR|WR|Trey Bonaventure|ISU|isu|2 REC · 25 YD|4.5|8.8',
      'B-WR|WR|Lamont Cizek|NEB|usc|—|0.0|9.9',
    ],
    OMA: [
      'QB|QB|Race Holliday|USC|usc|—|0.0|24.6',
      'RB|RB|Tyree Mbeki|UGA|uga|15 CAR · 83 YD · TD|14.3|17.0',
      'RB|RB|Colt Ravenscroft|ISU|isu|16 CAR · 74 YD|9.4|10.5',
      'WR|WR|Marlon Estrella|TEX|tex|4 REC · 61 YD|10.1|14.9',
      'WR|WR|Judah Pinkney|ALA|ten|2 REC · 24 YD|4.4|12.3',
      'TE|TE|Silas Umberger|OSU|osu|4 REC · 47 YD · TD|10.7|8.2',
      'FLX|WR|Kyler Beauchamp|ND|psu|—|0.0|13.4',
      'B-QB|QB|Dominic Farrugia|OU|ou|11/15 · 132 YD · TD|11.3|9.5',
      'B-RB|RB|Anders Solberg|MIA|mia|—|0.0|11.6',
      'B-WR|WR|Cruz Betancourt|LSU|lsu|4 REC · 44 YD|8.4|9.2',
      'B-TE|TE|Percy Aldana|COLO|isu|—|1.1|4.8',
    ],
  };
  // [away, home, homeWinProb%]
  const M = [
    ['TYL', 'JOR', 66],
    ['MAR', 'KEN', 59],
    ['PRI', 'DEV', 74],
    ['SAM', 'NIC', 78],
    ['OMA', 'AAR', 51],
  ];
  const parse = (s) => {
    const [slot, pos, name, ct, gk, stat, pts, proj] = s.split('|');
    const g = G[gk], c = CT[ct] || ['#2A2A2A', '#fff'];
    return { bench: slot.startsWith('B-'), slot: slot.replace('B-', ''), pos, name,
      ctAbbr: ct, ctColor: c[0], ctTxt: c[1],
      pill: c[2] ? '../../assets/teams/' + c[2] + '.png' : '', stat, pts: +pts, proj: +proj,
      gameLabel: g.label, gameDetail: g.st === 'FINAL' ? 'Final' : g.detail,
      gameScore: g.score, st: g.st };
  };
  const side = (key) => {
    const all = R[key].map(parse);
    const starters = all.filter(p => !p.bench), bench = all.filter(p => p.bench);
    const pts = starters.reduce((a, p) => a + p.pts, 0);
    const proj = starters.reduce((a, p) => a + (p.st === 'FINAL' ? p.pts : Math.max(p.pts, p.proj)), 0);
    const n = (st) => starters.filter(p => p.st === st).length;
    const fr = F[key];
    return { key, ...fr, pill: fr.pill ? '../../assets/teams/' + fr.pill + '.png' : '', starters, bench, pts, proj,
      playing: n('LIVE'), left: n('PRE'), done: n('FINAL') };
  };
  window.CFFB_LIVE = {
    week: 2, slate: 'Saturday Slate · 3:42 PM ET',
    matchups: M.map(([a, h, prob]) => ({ away: side(a), home: side(h), homeProb: prob })),
  };
})();
