/* CFFB — Recruiting bonus-dollar sample data.
   Programs accrue bonus recruiting $ for NEXT season from wins, rivalry
   wagers, draft results, and College GameDay visits. Sample data. */
(function () {
  // events: "week|src|amt|desc" — src: W wins, R rivalry wager, D draft, G College GameDay
  const T = (name, color, txt, conf, events) => ({ name, color, txt, conf, events: events.map((s) => { const [w, src, amt, desc] = s.split('|'); return { week: +w, src, amt: +amt, desc }; }) });

  const teams = {
    UGA: T('Georgia', '#BA0C2F', '#fff', 'sec', ['1|W|8|Win vs Clemson', '2|D|14|Draft: 2 first-rounders', '3|W|8|Win vs Kentucky', '4|R|12|Rivalry wager: beat Florida', '6|W|8|Win vs Auburn', '8|W|8|Win vs Texas', '5|G|10|GameDay on campus: vs Alabama', '9|R|10|Rivalry wager: beat Tennessee', '10|W|8|Win vs Ole Miss']),
    TEX: T('Texas', '#BF5700', '#fff', 'sec', ['1|W|8|Win vs Ohio State', '2|D|16|Draft: QB1 overall', '3|W|8|Win vs UTSA', '5|R|14|Rivalry wager: beat Oklahoma', '6|G|10|GameDay at Red River Shootout', '7|W|8|Win vs Vanderbilt', '9|W|8|Win vs Mississippi State']),
    ALA: T('Alabama', '#9E1B32', '#fff', 'sec', ['2|W|8|Win vs Wisconsin', '3|D|12|Draft: 3 top-50 picks', '4|W|8|Win vs Georgia', '6|R|10|Rivalry wager: beat Tennessee', '8|W|8|Win vs Missouri', '10|W|8|Win vs LSU']),
    OSU: T('Ohio State', '#BB0000', '#fff', 'b1g', ['1|D|15|Draft: WR1 + 2 more Rd 1', '2|W|8|Win vs Grambling', '4|W|8|Win vs Washington', '3|G|10|GameDay on campus: vs Texas', '5|R|13|Rivalry wager: beat Michigan', '7|W|8|Win vs Illinois', '9|W|8|Win vs Penn State', '10|W|8|Win vs Purdue']),
    ORE: T('Oregon', '#154733', '#FEE123', 'b1g', ['1|W|8|Win vs Montana State', '3|W|8|Win vs Northwestern', '4|D|11|Draft: 2 day-one picks', '6|R|9|Rivalry wager: beat Washington', '7|G|8|GameDay on campus: vs Ohio State', '8|W|8|Win vs Wisconsin', '10|W|8|Win vs Iowa']),
    MICH: T('Michigan', '#00274C', '#FFCB05', 'b1g', ['2|W|8|Win vs Oklahoma', '4|W|8|Win vs Nebraska', '5|D|10|Draft: 4 picks Rds 1-3', '7|R|8|Rivalry wager: beat Michigan State', '9|W|8|Win vs USC']),
    MIA: T('Miami', '#F47321', '#005030', 'acc', ['1|W|8|Win vs Notre Dame', '2|D|13|Draft: QB + edge Rd 1', '3|W|8|Win vs USF', '5|R|11|Rivalry wager: beat Florida State', '6|G|8|GameDay on campus: vs FSU', '7|W|8|Win vs Louisville', '9|W|8|Win vs SMU']),
    CLEM: T('Clemson', '#F56600', '#522D80', 'acc', ['2|W|8|Win vs Troy', '3|D|12|Draft: 2 first-rounders', '5|W|8|Win vs UNC', '7|R|10|Rivalry wager: beat South Carolina', '9|W|8|Win vs Duke']),
    SMU: T('SMU', '#354CA1', '#C8102E', 'acc', ['1|W|8|Win vs East Texas A&M', '3|W|8|Win vs TCU', '4|D|8|Draft: 2 day-two picks', '6|R|9|Rivalry wager: beat TCU', '8|W|8|Win vs Boston College', '10|W|8|Win vs Wake Forest']),
    ASU: T('Arizona State', '#8C1D40', '#FFC627', 'big12', ['1|W|8|Win vs NAU', '2|D|10|Draft: RB Rd 1', '4|W|8|Win vs Baylor', '6|R|10|Rivalry wager: beat Arizona', '8|W|8|Win vs Utah', '10|W|8|Win vs Iowa State']),
    BYU: T('BYU', '#002E5D', '#fff', 'big12', ['2|W|8|Win vs Stanford', '4|W|8|Win vs Colorado', '5|D|9|Draft: 3 mid-round picks', '7|R|11|Rivalry wager: beat Utah', '9|W|8|Win vs TCU']),
    TTU: T('Texas Tech', '#CC0000', '#fff', 'big12', ['1|W|8|Win vs Abilene Christian', '3|W|8|Win vs Oregon State', '4|D|9|Draft: OL Rd 2', '6|W|8|Win vs Kansas', '8|R|9|Rivalry wager: beat Baylor', '10|W|8|Win vs Kansas State']),
    ARMY: T('Army', '#0A0A0A', '#D4BF91', 'aac', ['2|W|8|Win vs Kansas State', '4|W|8|Win vs Temple', '6|R|12|Rivalry wager: beat Navy pool', '7|G|8|GameDay at Michie Stadium', '8|W|8|Win vs ECU', '9|D|6|Draft: LB Rd 4', '10|W|8|Win vs Tulsa']),
    TUL: T('Tulane', '#006747', '#418FDE', 'aac', ['1|W|8|Win vs Northwestern', '3|W|8|Win vs Duke', '5|D|7|Draft: 2 day-three picks', '7|R|8|Rivalry wager: beat Memphis', '9|W|8|Win vs UTSA']),
    MEM: T('Memphis', '#003087', '#898D8D', 'aac', ['2|W|8|Win vs Troy', '4|W|8|Win vs Arkansas', '6|D|6|Draft: WR Rd 3', '8|R|7|Rivalry wager: beat UAB', '10|W|8|Win vs USF']),
    BSU: T('Boise State', '#0033A0', '#D64309', 'pac', ['1|W|8|Win vs Georgia Southern', '3|W|8|Win vs Air Force', '4|D|12|Draft: RB top-10 pick', '6|R|9|Rivalry wager: beat Fresno State', '8|W|8|Win vs UNLV', '9|G|6|GameDay on the blue turf', '10|W|8|Win vs San Diego State']),
    WSU: T('Washington State', '#981E32', '#5E6A71', 'pac', ['2|W|8|Win vs Idaho', '4|W|8|Win vs Colorado State', '6|D|6|Draft: DB Rd 4', '8|R|8|Rivalry wager: beat Oregon State', '10|W|8|Win vs Utah State']),
    SDSU: T('San Diego State', '#A6192E', '#000', 'pac', ['1|W|8|Win vs Stony Brook', '3|W|8|Win vs Cal', '5|D|5|Draft: TE Rd 5', '7|R|7|Rivalry wager: beat Fresno State', '9|W|8|Win vs Hawaii']),
  };

  // remaining programs: "ABBR|Name|color|txt|conf" — events generated deterministically
  const REST = [
    'LSU|LSU|#461D7C|#FDD023|sec', 'TENN|Tennessee|#FF8200|#0A0A0A|sec', 'MISS|Ole Miss|#14213D|#CE1126|sec', 'TAMU|Texas A&M|#500000|#fff|sec', 'MIZ|Missouri|#F1B82D|#0A0A0A|sec', 'OU|Oklahoma|#841617|#fff|sec', 'SC|South Carolina|#73000A|#fff|sec', 'FLA|Florida|#0021A5|#fff|sec', 'AUB|Auburn|#0C2340|#E87722|sec', 'ARK|Arkansas|#9D2235|#fff|sec', 'UK|Kentucky|#0033A0|#fff|sec', 'MSST|Mississippi State|#660000|#fff|sec', 'VAN|Vanderbilt|#866D4B|#0A0A0A|sec',
    'PSU|Penn State|#041E42|#fff|b1g', 'IU|Indiana|#990000|#EEEDEB|b1g', 'ILL|Illinois|#13294B|#E84A27|b1g', 'NEB|Nebraska|#E41C38|#fff|b1g', 'USC|USC|#990000|#FFC72C|b1g', 'UW|Washington|#4B2E83|#B7A57A|b1g', 'IOWA|Iowa|#FFCD00|#0A0A0A|b1g', 'MINN|Minnesota|#7A0019|#FFCC33|b1g', 'WIS|Wisconsin|#C5050C|#fff|b1g', 'MSU|Michigan State|#18453B|#fff|b1g', 'UCLA|UCLA|#2D68C4|#F2A900|b1g', 'NW|Northwestern|#4E2A84|#fff|b1g', 'PUR|Purdue|#CEB888|#0A0A0A|b1g', 'RUT|Rutgers|#CC0033|#fff|b1g', 'MD|Maryland|#E03A3E|#FFD520|b1g',
    'FSU|Florida State|#782F40|#CEB888|acc', 'LOU|Louisville|#AD0000|#fff|acc', 'GT|Georgia Tech|#B3A369|#0A0A0A|acc', 'NCST|NC State|#CC0000|#fff|acc', 'VT|Virginia Tech|#630031|#CF4420|acc', 'DUKE|Duke|#003087|#fff|acc', 'UNC|North Carolina|#4B9CD3|#0A0A0A|acc', 'PITT|Pittsburgh|#003594|#FFB81C|acc', 'SYR|Syracuse|#D44500|#fff|acc', 'BC|Boston College|#98002E|#BC9B6A|acc', 'WAKE|Wake Forest|#9E7E38|#0A0A0A|acc', 'UVA|Virginia|#232D4B|#F84C1E|acc', 'CAL|California|#003262|#FDB515|acc', 'STAN|Stanford|#8C1515|#fff|acc',
    'ISU|Iowa State|#C8102E|#F1BE48|big12', 'KSU|Kansas State|#512888|#fff|big12', 'COLO|Colorado|#000000|#CFB87C|big12', 'BAY|Baylor|#003015|#FFB81C|big12', 'UTAH|Utah|#CC0000|#fff|big12', 'TCU|TCU|#4D1979|#fff|big12', 'CIN|Cincinnati|#E00122|#fff|big12', 'WVU|West Virginia|#002855|#EAAA00|big12', 'KU|Kansas|#0051BA|#E8000D|big12', 'OKST|Oklahoma State|#FF7300|#0A0A0A|big12', 'HOU|Houston|#C8102E|#fff|big12', 'UCF|UCF|#0A0A0A|#BA9B37|big12', 'ARIZ|Arizona|#CC0033|#003366|big12',
    'NAVY|Navy|#00205B|#C5B783|aac', 'UTSA|UTSA|#0C2340|#F15A22|aac', 'USF|USF|#006747|#CFC493|aac', 'ECU|East Carolina|#592A8A|#FDC82F|aac', 'UNT|North Texas|#00853E|#fff|aac', 'TEM|Temple|#9D2235|#fff|aac', 'CHAR|Charlotte|#046A38|#fff|aac', 'FAU|Florida Atlantic|#003366|#CC0000|aac', 'RICE|Rice|#00205B|#C1C6C8|aac', 'UAB|UAB|#1E6B52|#F4C300|aac', 'TLSA|Tulsa|#002D72|#C5B358|aac', 'USM|Southern Miss|#FFAB00|#0A0A0A|aac',
    'ORST|Oregon State|#DC4405|#0A0A0A|pac', 'CSU|Colorado State|#1E4D2B|#C8C372|pac', 'FRES|Fresno State|#DB0032|#003594|pac', 'USU|Utah State|#00263A|#8A8D8F|pac', 'TXST|Texas State|#501214|#B29E68|pac', 'NEV|Nevada|#003366|#807F84|pac', 'UNLV|UNLV|#B10202|#666666|pac', 'AFA|Air Force|#003087|#8A8D8F|pac', 'WYO|Wyoming|#492F24|#FFC425|pac', 'SJSU|San José State|#0055A2|#E5A823|pac', 'HAW|Hawaii|#024731|#C8C8C8|pac', 'UTEP|UTEP|#041E42|#FF8200|pac', 'NM|New Mexico|#BA0C2F|#63666A|pac', 'NMSU|New Mexico State|#8C0B42|#fff|pac', 'SAC|Sacramento State|#043927|#C4B581|pac',
  ];

  // deterministic pseudo-random event generation for the rest of the field
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const opp = ['a ranked opponent', 'a conference rival', 'a road favorite', 'a top-25 team', 'a division leader', 'an unbeaten opponent'];
  REST.forEach((row) => {
    const [abbr, name, color, txt, conf] = row.split('|');
    const events = [];
    const wins = 1 + Math.floor(rnd() * 7); // 1..7 wins
    for (let i = 0; i < wins; i++) events.push({ week: 1 + Math.floor(rnd() * 10), src: 'W', amt: 8, desc: 'Win vs ' + opp[Math.floor(rnd() * opp.length)] });
    if (rnd() > 0.35) events.push({ week: 1 + Math.floor(rnd() * 10), src: 'R', amt: 7 + Math.floor(rnd() * 7), desc: 'Rivalry wager cashed' });
    if (rnd() > 0.4) events.push({ week: 1 + Math.floor(rnd() * 4), src: 'D', amt: 5 + Math.floor(rnd() * 10), desc: 'Draft pick bonus' });
    if (rnd() > 0.8) events.push({ week: 1 + Math.floor(rnd() * 10), src: 'G', amt: 6 + Math.floor(rnd() * 4), desc: 'College GameDay on campus' });
    teams[abbr] = { name, color, txt, conf, events };
  });

  window.CFFB_RECRUITING = { season: 2026, week: 10, totalWeeks: 14, teams };
})();
