// CFFB · Standings — data layer
// Reads a published Google Sheet GAME LOG (one row per team per week) and
// derives (a) current standings and (b) each team's season schedule.
//
// ── CONFIGURE ───────────────────────────────────────────────────────────────
// Paste your published Google Sheet URL below. Any of these forms work:
//   • normal edit URL:  https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
//   • the /pub?output=csv "publish to web" URL
//   • leave blank ('') to render with built-in sample data
// If your game log lives on a specific tab, set SHEET_TAB to its exact name.
const SHEET_URL = '';
const SHEET_TAB = ''; // e.g. 'GameLog'  (leave '' for the first/default tab)
// ─────────────────────────────────────────────────────────────────────────────

// Expected columns (header row, order-independent — matched by name):
//   Year Week FranchiseID TeamName Conference TeamScore OpponentID OpponentName
//   OpponentScore GameResult IsConferenceGame IsRivalryGame WeeklyAllPlayWins …
//   SeasonWins SeasonLosses SeasonTies SeasonPointsFor SeasonConfWins
//   SeasonConfLosses SeasonAllPlayWins SeasonAllPlayLosses SeasonAllPlayTies
//   SeasonAllPlayPct SeasonRank RankingScore OpponentRank IsRivalryGame
//   IsCollegeGameday IsGameOfTheWeek …

// ── CSV parsing ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, idx) => { o[h] = (r[idx] !== undefined ? r[idx] : '').trim(); });
    return o;
  });
}

const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const truthy = (v) => /^(true|1|yes|y)$/i.test(String(v).trim());

// Build the gviz CSV endpoint from a pasted sheet URL.
function csvEndpoint(url, tab) {
  if (!url) return '';
  if (/output=csv/.test(url)) return url; // already a publish-to-web CSV url
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  if (!m) return '';
  const id = m[1];
  const gidM = url.match(/[#&?]gid=(\d+)/);
  let ep = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  if (tab) ep += `&sheet=${encodeURIComponent(tab)}`;
  else if (gidM) ep += `&gid=${gidM[1]}`;
  return ep;
}

// ── Derivation: game-log rows → standings + schedules ────────────────────────
// Conference slug for cffb-conf-- classes. Falls back to a hashed neutral.
const CONF_SLUGS = { sec: 'sec', bigten: 'b1g', b1g: 'b1g', 'big ten': 'b1g', acc: 'acc', big12: 'big12', 'big 12': 'big12', pac: 'pac', 'pac-12': 'pac', 'pac12': 'pac', aac: 'aac', mw: 'mw', 'mtn west': 'mw', 'mountain west': 'mw', ind: 'ind', independent: 'ind' };
function confSlug(name) {
  const k = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return CONF_SLUGS[k] || CONF_SLUGS[k.replace(/\s/g, '')] || 'ind';
}

function buildModel(objs) {
  // group rows by franchise
  const byTeam = new Map();
  objs.forEach((o) => {
    const id = String(o.FranchiseID || o.TeamName);
    if (!byTeam.has(id)) byTeam.set(id, []);
    byTeam.get(id).push(o);
  });

  const teams = [];
  byTeam.forEach((games, id) => {
    games.sort((a, b) => num(a.Week) - num(b.Week));
    const latest = games[games.length - 1];
    const conf = latest.Conference || '—';
    teams.push({
      id,
      name: latest.TeamName || id,
      conf,
      confSlug: confSlug(conf),
      wins: num(latest.SeasonWins),
      losses: num(latest.SeasonLosses),
      ties: num(latest.SeasonTies),
      confWins: num(latest.SeasonConfWins),
      confLosses: num(latest.SeasonConfLosses),
      pointsFor: num(latest.SeasonPointsFor),
      allPlayW: num(latest.SeasonAllPlayWins),
      allPlayL: num(latest.SeasonAllPlayLosses),
      allPlayT: num(latest.SeasonAllPlayTies),
      allPlayPct: num(latest.SeasonAllPlayPct),
      rankScore: num(latest.RankingScore),
      natRankRaw: num(latest.SeasonRank),
      games: games.map((g) => ({
        week: num(g.Week),
        oppId: String(g.OpponentID || ''),
        oppName: g.OpponentName || '—',
        oppRank: num(g.OpponentRank),
        teamScore: g.TeamScore === '' ? null : num(g.TeamScore),
        oppScore: g.OpponentScore === '' ? null : num(g.OpponentScore),
        result: (g.GameResult || '').toUpperCase(),
        isConf: truthy(g.IsConferenceGame),
        isRivalry: truthy(g.IsRivalryGame),
        isGotw: truthy(g.IsGameOfTheWeek),
        isGameday: truthy(g.IsCollegeGameday),
      })),
    });
  });

  // National rank: prefer the sheet's SeasonRank; if absent/zero, derive from RankingScore.
  const haveNat = teams.some((t) => t.natRankRaw > 0);
  if (haveNat) {
    teams.forEach((t) => { t.natRank = t.natRankRaw; });
  } else {
    [...teams].sort((a, b) => b.rankScore - a.rankScore).forEach((t, i) => { t.natRank = i + 1; });
  }

  // Conference rank: conf record → HEAD-TO-HEAD (among tied teams) → all-play% → points → national rank.
  const confPct = (t) => { const g = t.confWins + t.confLosses; return g ? t.confWins / g : 0; };
  const byConf = new Map();
  teams.forEach((t) => { if (!byConf.has(t.conf)) byConf.set(t.conf, []); byConf.get(t.conf).push(t); });
  const distinct = (vals) => new Set(vals.map((v) => Number(v).toFixed(4))).size > 1;
  byConf.forEach((list) => {
    // cluster teams by identical conference record (the primary key that can tie)
    const groups = {};
    list.forEach((t) => { const k = confPct(t).toFixed(6); (groups[k] = groups[k] || []).push(t); });
    const keys = Object.keys(groups).sort((a, b) => parseFloat(b) - parseFloat(a));
    let rank = 1;
    keys.forEach((k) => {
      const grp = groups[k];
      if (grp.length > 1) {
        // head-to-head record among the tied set
        const ids = new Set(grp.map((t) => t.id));
        grp.forEach((t) => {
          let w = 0, l = 0;
          t.games.forEach((g) => { if (g.result && ids.has(g.oppId)) { if (g.result === 'W') w++; else if (g.result === 'L') l++; } });
          t._h2hW = w; t._h2hL = l; t._h2hPct = (w + l) ? w / (w + l) : 0;
        });
        grp.sort((a, b) =>
          b._h2hPct - a._h2hPct ||
          b.allPlayPct - a.allPlayPct ||
          b.pointsFor - a.pointsFor ||
          a.natRank - b.natRank
        );
        // which criterion actually separated the cluster
        let decidedBy = 'National ranking';
        if (distinct(grp.map((t) => t._h2hPct))) decidedBy = 'Head-to-head';
        else if (distinct(grp.map((t) => t.allPlayPct))) decidedBy = 'All-play %';
        else if (distinct(grp.map((t) => t.pointsFor))) decidedBy = 'Total points';
        grp.forEach((t) => {
          t.tiebreak = {
            confRec: t.confWins + '\u2013' + t.confLosses,
            tiedWith: grp.filter((o) => o.id !== t.id).map((o) => o.name),
            h2hW: t._h2hW, h2hL: t._h2hL,
            h2hPlayed: (t._h2hW + t._h2hL) > 0,
            decidedBy,
          };
        });
      }
      grp.forEach((t) => { t.confRank = rank++; delete t._h2hPct; });
    });
  });

  // League leaders (flags)
  const ptsLeader = teams.reduce((m, t) => (t.pointsFor > (m ? m.pointsFor : -1) ? t : m), null);
  const apLeader = teams.reduce((m, t) => (t.allPlayPct > (m ? m.allPlayPct : -1) ? t : m), null);
  teams.forEach((t) => {
    t.isPtsLeader = ptsLeader && t.id === ptsLeader.id;
    t.isApLeader = apLeader && t.id === apLeader.id;
  });

  teams.sort((a, b) => a.natRank - b.natRank);
  const conferences = [...byConf.keys()].sort((a, b) => a.localeCompare(b));
  const weeksPlayed = Math.max(0, ...teams.map((t) => t.games.filter((g) => g.result).length));
  const year = objs.length ? (objs[0].Year || '') : '';
  return { teams, conferences, weeksPlayed, year };
}

// ── Loader: fetch live or fall back to sample ────────────────────────────────
async function loadStandings() {
  const ep = csvEndpoint(SHEET_URL, SHEET_TAB);
  if (ep) {
    try {
      const res = await fetch(ep, { credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const objs = rowsToObjects(parseCSV(await res.text()));
      if (objs.length) {
        const model = buildModel(objs);
        model.source = 'live';
        return model;
      }
      throw new Error('no rows');
    } catch (e) {
      console.warn('[CFFB Standings] live fetch failed, using sample data:', e.message);
    }
  }
  const model = buildModel(rowsToObjects(parseCSV(SAMPLE_CSV)));
  model.source = ep ? 'sample-fallback' : 'sample';
  return model;
}

// ── Sample game log (deterministic generator) ────────────────────────────────
// Produces a full-season game log in the exact sheet schema so the live path
// and the sample path exercise identical parsing + derivation.
const SAMPLE_CSV = (function buildSampleCSV() {
  const HEAD = ['Year','Week','FranchiseID','TeamName','Conference','TeamScore','OpponentID','OpponentName','OpponentScore','GameResult','IsConferenceGame','IsRivalryGame','SeasonWins','SeasonLosses','SeasonTies','SeasonPointsFor','SeasonConfWins','SeasonConfLosses','SeasonAllPlayWins','SeasonAllPlayLosses','SeasonAllPlayTies','SeasonAllPlayPct','SeasonRank','RankingScore','OpponentRank','IsCollegeGameday','IsGameOfTheWeek'];
  const FR = [
    ['Georgia Bulldogs','SEC'],['Texas Longhorns','SEC'],['Alabama Crimson Tide','SEC'],['LSU Tigers','SEC'],['Florida Gators','SEC'],['Tennessee Volunteers','SEC'],
    ['Ohio State Buckeyes','Big Ten'],['Michigan Wolverines','Big Ten'],['Oregon Ducks','Big Ten'],['Penn State Nittany Lions','Big Ten'],['USC Trojans','Big Ten'],['Washington Huskies','Big Ten'],
    ['Clemson Tigers','ACC'],['Miami Hurricanes','ACC'],['Florida State Seminoles','ACC'],['Louisville Cardinals','ACC'],['North Carolina Tar Heels','ACC'],['Virginia Tech Hokies','ACC'],
    ['Kansas Jayhawks','Big 12'],['Utah Utes','Big 12'],['TCU Horned Frogs','Big 12'],['Iowa State Cyclones','Big 12'],['Kansas State Wildcats','Big 12'],['Arizona Wildcats','Big 12'],
  ];
  const RIVALS = { 'Georgia Bulldogs':'Florida Gators', 'Florida Gators':'Georgia Bulldogs', 'Ohio State Buckeyes':'Michigan Wolverines', 'Michigan Wolverines':'Ohio State Buckeyes', 'Alabama Crimson Tide':'Tennessee Volunteers', 'Tennessee Volunteers':'Alabama Crimson Tide', 'Clemson Tigers':'Florida State Seminoles', 'Florida State Seminoles':'Clemson Tigers', 'Kansas Jayhawks':'Kansas State Wildcats', 'Kansas State Wildcats':'Kansas Jayhawks', 'USC Trojans':'Oregon Ducks', 'Oregon Ducks':'USC Trojans' };
  const N = FR.length, WEEKS = 13, PLAYED = 10;
  const ids = FR.map((_, i) => 100 + i);
  // seeded PRNG
  let seed = 20250917; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = (mu, sd) => mu + sd * (rnd() + rnd() + rnd() + rnd() - 2) / 2 * 2;
  // per-team "strength" gives realistic separation
  const strength = FR.map(() => gauss(0, 8));

  // schedule: rotating round-robin pairings per week
  const pairFor = (week) => {
    const arr = [...Array(N).keys()];
    const fixed = arr[0];
    const rot = arr.slice(1);
    for (let r = 0; r < (week % (N - 1)); r++) rot.unshift(rot.pop());
    const line = [fixed, ...rot];
    const pairs = [];
    for (let i = 0; i < N / 2; i++) pairs.push([line[i], line[N - 1 - i]]);
    return pairs;
  };

  // accumulate
  const acc = FR.map(() => ({ w:0,l:0,t:0,pf:0,cw:0,cl:0,apw:0,apl:0,apt:0 }));
  const rows = [];
  const weekScore = []; // [week][teamIdx] = score
  for (let wk = 1; wk <= WEEKS; wk++) {
    const played = wk <= PLAYED;
    const pairs = pairFor(wk);
    const scores = new Array(N).fill(null);
    if (played) for (let i = 0; i < N; i++) scores[i] = Math.max(38, gauss(92 + strength[i], 16));
    weekScore[wk] = scores;
    // all-play for the week
    if (played) {
      for (let i = 0; i < N; i++) {
        let apw=0, apl=0, apt=0;
        for (let j = 0; j < N; j++) { if (i===j) continue; if (scores[i]>scores[j]) apw++; else if (scores[i]<scores[j]) apl++; else apt++; }
        acc[i].apw += apw; acc[i].apl += apl; acc[i].apt += apt;
      }
    }
    // matchups
    pairs.forEach(([a, b]) => {
      [[a,b],[b,a]].forEach(([me, opp]) => {
        const sameConf = FR[me][1] === FR[opp][1];
        const riv = RIVALS[FR[me][0]] === FR[opp][0];
        let result = '';
        if (played) {
          acc[me].pf += scores[me];
          if (scores[me] > scores[opp]) { result='W'; acc[me].w++; if (sameConf) acc[me].cw++; }
          else if (scores[me] < scores[opp]) { result='L'; acc[me].l++; if (sameConf) acc[me].cl++; }
          else { result='T'; acc[me].t++; }
        }
        const apTot = acc[me].apw + acc[me].apl + acc[me].apt;
        const apPct = apTot ? (acc[me].apw / apTot) : 0;
        rows.push({
          me, wk, played, result, opp, sameConf, riv,
          teamScore: played ? scores[me].toFixed(2) : '',
          oppScore: played ? scores[opp].toFixed(2) : '',
          snap: { ...acc[me], apPct },
        });
      });
    });
  }
  // national ranking score from final played week: 0.55*allplay + 0.45*normPF
  const finalAcc = acc.map((a) => ({ ...a, apPct: (a.apw+a.apl+a.apt) ? a.apw/(a.apw+a.apl+a.apt) : 0 }));
  const maxPF = Math.max(...finalAcc.map((a) => a.pf));
  const rankScore = finalAcc.map((a) => 0.55 * a.apPct + 0.45 * (a.pf / maxPF));
  const order = [...Array(N).keys()].sort((i, j) => rankScore[j] - rankScore[i]);
  const natRank = new Array(N); order.forEach((teamIdx, pos) => { natRank[teamIdx] = pos + 1; });

  // emit CSV — SeasonRank/RankingScore reflect final standings on every row (fine for standings; schedule uses game fields)
  const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [HEAD.join(',')];
  rows.forEach((r) => {
    const s = r.snap;
    out.push([
      2025, r.wk, ids[r.me], FR[r.me][0], FR[r.me][1], r.teamScore, ids[r.opp], FR[r.opp][0], r.oppScore,
      r.result, r.sameConf ? 'TRUE':'FALSE', r.riv ? 'TRUE':'FALSE',
      s.w, s.l, s.t, s.pf.toFixed(2), s.cw, s.cl, s.apw, s.apl, s.apt, s.apPct.toFixed(4),
      natRank[r.me], rankScore[r.me].toFixed(4), natRank[r.opp], r.riv ? 'TRUE':'FALSE', r.wk % 4 === 0 ? 'TRUE':'FALSE',
    ].map(esc).join(','));
  });
  return out.join('\n');
})();

Object.assign(window, { loadStandings, confSlug });
