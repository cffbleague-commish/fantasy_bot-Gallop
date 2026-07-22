// CFFB · Standings — LIVE data loader
// Replaces the demo's st-data.jsx (sample CSV + PRNG) at build time.
// Fetches JSON from the same Apps Script Web App that powers Power Rankings,
// reshapes teams[] into the model st-app.jsx consumes, and derives the
// conference ranks / tiebreakers / league-leader flags client-side (the same
// logic st-data.jsx's buildModel uses).
//
// The build script substitutes the real /exec URL for __WEBAPP_URL__.
const CFFB_WEBAPP_URL = '__WEBAPP_URL__';

// ── helpers (ported from st-data.jsx) ────────────────────────────────────────
const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

// Conference slug for cffb-conf-- classes. Falls back to a hashed neutral.
const CONF_SLUGS = { sec: 'sec', bigten: 'b1g', b1g: 'b1g', 'big ten': 'b1g', acc: 'acc', big12: 'big12', 'big 12': 'big12', pac: 'pac', 'pac-12': 'pac', 'pac12': 'pac', aac: 'aac', mw: 'mw', 'mtn west': 'mw', 'mountain west': 'mw', ind: 'ind', independent: 'ind' };
function confSlug(name) {
  const k = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return CONF_SLUGS[k] || CONF_SLUGS[k.replace(/\s/g, '')] || 'ind';
}

// ── Derivation: conference ranks + tiebreakers + leaders ─────────────────────
// Operates on an already-constructed teams array (each team carries the season
// fields + a games[] list). Mirrors st-data.jsx buildModel lines 127-192.
function deriveRanks(teams) {
  // National rank: prefer the sheet's rank; if absent/zero, derive from rankScore.
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
    const groups = {};
    list.forEach((t) => { const k = confPct(t).toFixed(6); (groups[k] = groups[k] || []).push(t); });
    const keys = Object.keys(groups).sort((a, b) => parseFloat(b) - parseFloat(a));
    let rank = 1;
    keys.forEach((k) => {
      const grp = groups[k];
      if (grp.length > 1) {
        const ids = new Set(grp.map((t) => t.id));
        grp.forEach((t) => {
          let w = 0, l = 0;
          t.games.forEach((g) => { if (g.result && g.week <= 12 && ids.has(g.oppId)) { if (g.result === 'W') w++; else if (g.result === 'L') l++; } });
          t._h2hW = w; t._h2hL = l; t._h2hPct = (w + l) ? w / (w + l) : 0;
        });
        grp.sort((a, b) =>
          b._h2hPct - a._h2hPct ||
          b.allPlayPct - a.allPlayPct ||
          b.pointsFor - a.pointsFor ||
          a.natRank - b.natRank
        );
        let decidedBy = 'National ranking';
        if (distinct(grp.map((t) => t._h2hPct))) decidedBy = 'Head-to-head';
        else if (distinct(grp.map((t) => t.allPlayPct))) decidedBy = 'All-play %';
        else if (distinct(grp.map((t) => t.pointsFor))) decidedBy = 'Total points';
        grp.forEach((t) => {
          t.tiebreak = {
            confRec: t.confWins + '–' + t.confLosses,
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
}

// ── Loader: fetch the web app JSON and build the standings model ─────────────
async function loadStandings() {
  const res = await fetch(CFFB_WEBAPP_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching standings');
  const d = await res.json();
  if (d.error) throw new Error(d.error);

  // Conference id -> { name, logo } (drop the synthetic 'all' entry).
  const confMap = {};
  (d.conferences || []).forEach((c) => { if (c.id !== 'all') confMap[c.id] = c; });

  // Per-franchise lookups used to resolve opponents inside each schedule.
  const idName = {}, idConf = {}, idPill = {}, idBg = {}, idFg = {};
  (d.teams || []).forEach((t) => {
    idName[t.id] = t.name;
    idConf[t.id] = (confMap[t.conf] && confMap[t.conf].name) || t.conf;
    idPill[t.id] = t.pill || null;
    idBg[t.id] = t.bg || null;
    idFg[t.id] = t.fg || null;
  });

  const confLogos = {};

  const teams = (d.teams || []).map((t) => {
    const confName = (confMap[t.conf] && confMap[t.conf].name) || t.conf || '—';
    confLogos[confName] = (confMap[t.conf] && confMap[t.conf].logo) || null;

    const mkGame = (g, played) => {
      const oppId = String(g.opp != null ? g.opp : '');
      const wk = num(g.week);
      // Conference games only count in the regular season (weeks 1-12).
      // Week 13 = conference championship; weeks 14+ = bowls / playoffs — none
      // of those feed the conference record or the CONF tag.
      const rawConf = (g.conf != null)
        ? !!g.conf
        : (oppId && idConf[oppId] ? idConf[oppId] === confName : false);
      const isConf = rawConf && wk <= 12;
      const result = played
        ? String(g.result || (g.win ? 'W' : 'L')).toUpperCase()
        : '';
      return {
        week: wk,
        oppId,
        oppName: idName[oppId] || '—',
        oppRank: num(g.oppRank),
        oppPill: idPill[oppId] || null,
        oppBg: idBg[oppId] || null,
        oppFg: idFg[oppId] || null,
        teamScore: played ? num(g.my) : null,
        oppScore: played ? num(g.ov) : null,
        result,
        isConf,
        isRivalry: !!g.rivalry,
        isGotw: false,
        isGameday: !!g.gameday,
      };
    };

    const games = (t.games || [])
      .filter((g) => !g.bye && g.opp != null)
      .map((g) => mkGame(g, true))
      .concat((t.upcoming || [])
        .filter((g) => g.opp != null)
        .map((g) => mkGame(g, false)));

    // Conference record is derived from regular-season conference games only
    // (mkGame already limits isConf to weeks 1-12), NOT the payload's cW/cL,
    // which would otherwise fold in week-13 conference-championship results.
    let confWins = 0, confLosses = 0;
    games.forEach((g) => {
      if (!g.isConf) return;
      if (g.result === 'W') confWins++;
      else if (g.result === 'L') confLosses++;
    });

    return {
      id: String(t.id),
      name: t.name || String(t.id),
      conf: confName,
      confSlug: confSlug(confName),
      pill: t.pill || null,
      bg: t.bg || null,
      fg: t.fg || null,
      wins: num(t.W),
      losses: num(t.L),
      ties: 0,
      confWins,
      confLosses,
      pointsFor: num(t.pf),
      // payload allPlayPct is 0-100 (normalizePct); st-app fmtPct multiplies by 100.
      allPlayPct: num(t.allPlayPct) / 100,
      rankScore: num(t.rankingScore),
      natRankRaw: num(t.rank),
      games,
    };
  });

  deriveRanks(teams);

  const conferences = [...new Set(teams.map((t) => t.conf))].sort((a, b) => a.localeCompare(b));

  return {
    teams,
    conferences,
    confLogos,
    weeksPlayed: num(d.weeksPlayed),
    year: d.season != null ? String(d.season) : '',
    source: 'live',
  };
}

Object.assign(window, { loadStandings, confSlug });
