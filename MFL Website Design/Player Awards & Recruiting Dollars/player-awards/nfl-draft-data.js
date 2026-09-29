/* CFFB — Theoretical NFL Draft sample data (DEV PREVIEW ONLY).
 *
 * This mirrors the shape the LIVE adapter (pa-data-live.js) builds into
 * window.CFFB_NFLDRAFT from the Apps Script `?feed=awards` theoreticalDraft
 * block. The MFL build (build-player-awards.js) STRIPS this loader and feeds
 * live data instead — this file only exists so the standalone component and the
 * "Player Awards Mobile Preview.html" harness can render the NFL Draft board
 * offline.
 *
 * owners are TEAM KEYS into window.CFFB_RECRUITING.teams. The sample recruiting
 * data (recruiting-data.js) keys teams by ABBR, so the sample owners below are
 * abbrs (UGA, OSU, …). LIVE data keys recruiting teams by franchise id, so the
 * live adapter emits franchise-id owners — the board resolves either.
 *
 * pk.nfl is the repurposed status chip (Theoretical Draft has no NFL team):
 *   GRAD = graduating, EARLY = early declare, CUT = releasing, MAYBE = could declare.
 */
(function () {
  var REASON = {
    GRAD:  { color: '#C9A227', txt: '#0A0A0A' },
    EARLY: { color: '#3B82C4', txt: '#F5F5F5' },
    CUT:   { color: '#B84545', txt: '#F5F5F5' },
    MAYBE: { color: '#6A6A6A', txt: '#F5F5F5' }
  };
  // [player, pos, round, bonus, reason, owners]
  var RAW = [
    ['Marcus Ellison',  'QB', 1, 5, 'GRAD',  ['UGA', 'TEX']],
    ['Deshawn Carter',  'RB', 1, 5, 'EARLY', ['OSU']],
    ['Julian Reyes',    'WR', 1, 5, 'EARLY', ['ALA', 'ORE']],
    ['Tyrone Battle',   'WR', 2, 4, 'GRAD',  ['MICH']],
    ['Kai Nakamura',    'TE', 2, 4, 'MAYBE', ['MIA']],
    ['Andre Whitfield', 'QB', 2, 4, 'GRAD',  ['CLEM']],
    ['Bo Sandoval',     'RB', 3, 3, 'EARLY', ['SMU', 'ASU']],
    ['Preston Vance',   'WR', 3, 3, 'GRAD',  ['BYU']],
    ['Malik Osei',      'WR', 4, 2, 'CUT',   ['TTU']],
    ['Grant Halloran',  'TE', 4, 2, 'GRAD',  ['ARMY']],
    ['Ezra Lindqvist',  'RB', 5, 1, 'MAYBE', ['BSU']],
    ['Cole Ferraro',    'WR', 5, 1, 'CUT',   ['WSU']]
  ];

  var picks = RAW.map(function (r, i) {
    var meta = REASON[r[4]] || REASON.GRAD;
    return {
      player: r[0], pos: r[1], round: r[2], bonus: r[3], order: i + 1,
      playerId: '', photo: '',
      owners: r[5],
      nfl: r[4], nflColor: meta.color, nflTxt: meta.txt
    };
  });

  window.CFFB_NFLDRAFT = {
    year: 2026,
    rounds: 5,
    logo: '',   // falls back to ./nfl-draft-placeholder.svg
    bonusScale: [['1st Round', 5], ['2nd Round', 4], ['3rd Round', 3], ['4th Round', 2], ['5th Round', 1]],
    picks: picks
  };
})();
