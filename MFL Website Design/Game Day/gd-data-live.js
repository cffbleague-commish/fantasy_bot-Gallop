// CFFB · GameDay — LIVE data loader
// ---------------------------------------------------------------------------
// Builds the GameDay message's GD model from the shared Apps Script web-app
// payload — the SAME JSON that powers Standings / Power Rankings / Live Scoring,
// cached under localStorage key `cffb_webapp_payload_v1`. It picks the CURRENT
// week's matchups flagged `gameday:true` in the league sheet and reshapes them
// into the { week, logo, teams, games[] } structure the design's gdRender()
// consumes (see "Gameday MFL Message.html").
//
// No MFL page globals are required: everything comes from the web-app payload,
// so this renders correctly on any MFL page (the message is same-origin to the
// page but the payload fetch is a plain CORS GET to the Apps Script /exec URL).
//
// The build script (build-gameday.js) substitutes the real /exec URL for the
// __WEBAPP_URL__ placeholder below.
(function () {
  'use strict';

  var CFFB_WEBAPP_URL = '__WEBAPP_URL__';
  var CFFB_CACHE_KEY  = 'cffb_webapp_payload_v1';        // shared with the other CFFB widgets
  var FRESH_MS = 6 * 60 * 60 * 1000;                     // serve cache without refetch
  var MAX_MS   = 7 * 24 * 60 * 60 * 1000;                // hard cap; older cache = ignore
  var GAMEDAY_LOGO = 'https://i.imgur.com/9Kvqh5Y.png';  // the established College GameDay badge

  var num = function (v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

  // ── School / mascot split ───────────────────────────────────────────────────
  // Team names arrive as "School Nickname" ("Ohio State Buckeyes"). The design
  // shows the school big and the nickname on a second line, so we split on the
  // trailing nickname. Most nicknames are one word; the two-word ones present in
  // this league are enumerated so they don't get chopped. Purely cosmetic — a new
  // team with an unlisted two-word nickname just shows the last word on line two.
  var MULTI = [
    'crimson tide', 'sun devils', 'red wolves', 'black knights', 'golden bears',
    'blue devils', 'fighting illini', 'golden flashes', 'thundering herd',
    'golden gophers', 'nittany lions', 'scarlet knights', 'horned frogs',
    'red raiders', 'green wave', 'golden hurricanes', 'golden hurricane',
    'fighting irish', 'yellow jackets', 'demon deacons', 'wolf pack'
  ];
  function splitName(full) {
    var n = String(full || '').trim();
    if (!n) return { school: '', mascot: '' };
    var low = n.toLowerCase();
    for (var i = 0; i < MULTI.length; i++) {
      var tail = ' ' + MULTI[i];
      if (low.length > tail.length && low.slice(-tail.length) === tail) {
        return { school: n.slice(0, n.length - tail.length).trim(), mascot: n.slice(n.length - MULTI[i].length) };
      }
    }
    var sp = n.lastIndexOf(' ');
    return sp < 0 ? { school: n, mascot: '' } : { school: n.slice(0, sp), mascot: n.slice(sp + 1) };
  }

  // ── Build the GD model from a raw web-app payload ────────────────────────────
  function buildGD(d) {
    var teams = (d && d.teams) || [];
    var byId = {};
    teams.forEach(function (t) { byId[String(t.id)] = t; });

    // Current week = the highest week appearing in any team's games[] (the week
    // that has been rolled into the standings — i.e. live/just-finished). Future
    // weeks live in upcoming[]. Fall back to weeksPlayed if games[] is empty.
    var week = 0;
    teams.forEach(function (t) {
      (t.games || []).forEach(function (g) { var w = num(g.week); if (w > week) week = w; });
    });
    if (!week) week = num(d && d.weeksPlayed) || 1;

    var rankOf = function (id) { var r = num(byId[id] && byId[id].rank); return r > 0 ? r : null; };

    // Gather de-duped matchup pairs for `week` matching a predicate, scanning both
    // played (games[]) and scheduled (upcoming[]) entries.
    function gather(pred) {
      var seen = {}, out = [];
      teams.forEach(function (t) {
        var all = (t.games || []).concat(t.upcoming || []);
        all.forEach(function (g) {
          if (num(g.week) !== week || !pred(g)) return;
          var aId = String(t.id), bId = String(g.opp == null ? '' : g.opp);
          if (!bId || !byId[bId]) return;
          var key = [aId, bId].sort().join('-');
          if (seen[key]) return;
          seen[key] = 1;
          out.push({ a: aId, b: bId, rivalry: !!g.rivalry });
        });
      });
      return out;
    }

    var pairs = gather(function (g) { return !!g.gameday; });
    var fallback = false;
    if (!pairs.length) {
      // The sheet flagged nothing this week — surface the marquee matchups so the
      // message never renders empty. (Take the best few by combined ranking.)
      fallback = true;
      pairs = gather(function () { return true; });
    }

    // Order best-first: rivalry games lead, then lowest combined rank, then the
    // lowest single rank. The first pair becomes the featured "MAIN EVENT".
    var rk = function (id) { var r = rankOf(id); return r == null ? 999 : r; };
    pairs.forEach(function (p) { p.sum = rk(p.a) + rk(p.b); p.top = Math.min(rk(p.a), rk(p.b)); });
    pairs.sort(function (a, b) { return (b.rivalry - a.rivalry) || (a.sum - b.sum) || (a.top - b.top); });
    if (fallback) pairs = pairs.slice(0, 4);

    function teamObj(id) {
      var t = byId[id] || {};
      var s = splitName(t.name);
      return {
        name: s.school || t.name || String(id),
        mascot: s.mascot || '',
        abbr: t.abbr || String(id),
        color: t.bg || '#5A5A5A',
        txt: t.fg || '#F5F5F5',
        logo: t.pill || ''
      };
    }
    // [wins, losses, pointsScored, allPlay%, oppAllPlay%] — the exact five the
    // design's "Tale of the Tape" and slate rows expect.
    function statsOf(id) {
      var t = byId[id] || {};
      return [num(t.W), num(t.L), num(t.pf), num(t.allPlayPct), num(t.oppAllPlayPct)];
    }

    var teamsMap = {};
    pairs.forEach(function (p) { teamsMap[p.a] = teamObj(p.a); teamsMap[p.b] = teamObj(p.b); });

    var games = pairs.map(function (p, i) {
      var g = {
        a: p.a, b: p.b,
        featured: i === 0,
        ra: rankOf(p.a) || undefined,
        rb: rankOf(p.b) || undefined,
        sa: statsOf(p.a), sb: statsOf(p.b)
      };
      // The sheet carries only a rivalry boolean (no trophy name / badge), so
      // generate a truthful matchup title. A badge/est can be added later without
      // touching the design (gdRender renders badge only when present).
      if (p.rivalry && !fallback) {
        g.rivalry = { name: teamsMap[p.a].name + ' – ' + teamsMap[p.b].name, est: '' };
      }
      return g;
    });

    return {
      week: week,
      logo: GAMEDAY_LOGO,
      teams: teamsMap,
      games: games,
      updatedAt: (d && d.updatedAt) || null   // sheet-generation time, for the "as of" note
    };
  }

  // ── Shared stale-while-revalidate cache (same key the other widgets use) ──────
  function readCache() {
    try {
      var rec = JSON.parse(localStorage.getItem(CFFB_CACHE_KEY));
      if (!rec || typeof rec.ts !== 'number' || rec.payload == null) return null;
      var age = Date.now() - rec.ts;
      if (age < 0 || age > MAX_MS) return null;
      return { payload: rec.payload, age: age };
    } catch (e) { return null; }
  }
  function writeCache(payload) {
    try { localStorage.setItem(CFFB_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: payload })); }
    catch (e) { /* quota / disabled / private mode — ignore; live fetch still works */ }
  }
  function fetchPayload() {
    return fetch(CFFB_WEBAPP_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching gameday'); return r.json(); })
      .then(function (d) { if (d && d.error) throw new Error(d.error); return d; });
  }

  function load() {
    var cached = readCache();
    if (cached) {
      if (cached.age > FRESH_MS) { fetchPayload().then(writeCache).catch(function () { /* keep cache */ }); }
      return Promise.resolve(buildGD(cached.payload));
    }
    return fetchPayload().then(function (d) { writeCache(d); return buildGD(d); });
  }

  // The design script reads this Promise (or falls back to its preview sample).
  window.__cffbGamedayData = load();
})();
