// CFFB · Scenario Builder — LIVE data loader
// Feeds the Scenario Builder engine real league data instead of the in-file
// sample generator. Fetches the SAME Apps Script Web App payload that powers
// Standings / Power Rankings (shared localStorage cache key), and reshapes it
// into the structures sbApplyData() consumes:
//   { confs, teams, games, weeksPlayed, regWeeks, season, updatedAt, ccgResults }
//
// The engine calls window.CFFB_SB_LOAD() on boot; if it is absent or throws,
// the engine falls back to sbSampleData() so the offline preview still works.
//
// The build script substitutes the real /exec URL for __WEBAPP_URL__.
(function () {
  'use strict';
  var CFFB_WEBAPP_URL = '__WEBAPP_URL__';

  // Shared with Standings / Power Rankings — same endpoint, same JSON, so one
  // cache serves all three. Stale-while-revalidate: a recent copy renders
  // instantly; a background refresh keeps the next load current.
  var CACHE_KEY = 'cffb_webapp_payload_v1';
  var FRESH_MS  = 6 * 60 * 60 * 1000;
  var MAX_MS    = 7 * 24 * 60 * 60 * 1000;

  // Conference accent colors (payload has no accent field). Keyed by the
  // normalized conference id the Apps Script web app emits.
  var CONF_ACCENTS = { SEC: '#C9A227', B10: '#4A6FA5', ACC: '#8B4A5C', B12: '#B84545', AAC: '#6B5C8B', P12: '#5C7A6A' };
  // Power conferences whose champion gets an automatic playoff bid (bylaws).
  // The AAC is deliberately absent — its champion must earn an at-large bid.
  var AUTO_CONF_IDS = { ACC: 1, B10: 1, B12: 1, P12: 1, SEC: 1 };

  var num = function (v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || typeof rec.ts !== 'number' || rec.payload == null) return null;
      var age = Date.now() - rec.ts;
      if (age < 0 || age > MAX_MS) return null;
      return { payload: rec.payload, age: age };
    } catch (e) { return null; }
  }
  function writeCache(payload) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: payload })); } catch (e) {}
  }
  function fetchPayload() {
    return fetch(CFFB_WEBAPP_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching scenario data');
      return res.json();
    }).then(function (d) { if (d && d.error) throw new Error(d.error); return d; });
  }

  // Reshape a raw web-app payload into the engine's data model.
  function buildModel(d) {
    var season = d.season != null ? Number(d.season) : 0;
    // Regular season is 12 weeks from 2024 on (13 in 2021-2023). Week 13 = CCG.
    var regWeeks = season && season <= 2023 ? 13 : 12;
    var ccgWeek = regWeeks + 1;

    // Conferences (drop the synthetic 'all'), in payload order.
    var confs = (d.conferences || [])
      .filter(function (c) { return c.id !== 'all'; })
      .map(function (c) {
        return {
          id: c.id,
          name: c.name || c.id,
          accent: CONF_ACCENTS[c.id] || '#6A6A6A',
          logo: c.logo || null,
          autoBid: !!AUTO_CONF_IDS[c.id]
        };
      });
    var confIndex = {};
    confs.forEach(function (c, i) { confIndex[c.id] = i; });

    // Teams. Keep only teams whose conference is in the list above.
    var rawTeams = (d.teams || []).filter(function (t) { return confIndex[t.conf] != null; });
    var idToIdx = {};
    var teams = rawTeams.map(function (t, i) {
      idToIdx[String(t.id)] = i;
      return {
        id: String(t.id),
        abbr: t.abbr || String(t.id),
        name: t.name || String(t.id),
        bg: t.bg || '#2A2A2A',
        fg: t.fg || '#FFFFFF',
        conf: confIndex[t.conf],
        pill: t.pill || null,
        // Authoritative current national rank + all-play components (0-1).
        rank: t.rank != null ? num(t.rank) : null,
        ap: t.allPlayPct != null ? num(t.allPlayPct) / 100 : null,
        oppAp: t.oppAllPlayPct != null ? num(t.oppAllPlayPct) / 100 : null
      };
    });

    // Canonical game log, deduped (each matchup is listed by both teams).
    // Key by week + the two franchise ids so the mirror from the other side
    // is skipped. Played: sa=my, sb=ov. Upcoming: sa=sb=null. Weeks > regWeeks
    // are handled separately (CCG is synthesized / locked), so skip them here.
    var byKey = {};
    var games = [];
    var ccgResults = confs.map(function () { return null; });

    function addPlayed(teamId, g) {
      var oppId = g.opp != null ? String(g.opp) : '';
      if (!oppId || idToIdx[oppId] == null) return;        // bye / unknown opp
      var wk = num(g.week);
      var ai = idToIdx[String(teamId)], bi = idToIdx[oppId];
      if (ai == null || bi == null) return;
      // Capture Week-(regWeeks+1) conference-championship RESULTS as locked picks.
      if (wk === ccgWeek && g.conf) {
        var win = (g.result === 'W') || (g.win === true) || (num(g.my) > num(g.ov));
        var c = teams[ai].conf;
        if (ccgResults[c] == null) ccgResults[c] = win ? ai : bi;
        return;
      }
      if (wk > regWeeks) return;
      var lo = ai < bi ? ai : bi, hi = ai < bi ? bi : ai;
      var key = wk + ':' + lo + ':' + hi;
      if (byKey[key]) return;
      byKey[key] = 1;
      games.push({ id: 'w' + wk + '-' + lo + '-' + hi, week: wk, a: ai, b: bi, conf: !!g.conf, sa: num(g.my), sb: num(g.ov) });
    }
    function addUpcoming(teamId, g) {
      var oppId = g.opp != null ? String(g.opp) : '';
      if (!oppId || idToIdx[oppId] == null) return;
      var wk = num(g.week);
      if (wk > regWeeks) return;                            // CCG handled separately
      var ai = idToIdx[String(teamId)], bi = idToIdx[oppId];
      if (ai == null || bi == null) return;
      var lo = ai < bi ? ai : bi, hi = ai < bi ? bi : ai;
      var key = wk + ':' + lo + ':' + hi;
      if (byKey[key]) return;
      byKey[key] = 1;
      games.push({ id: 'w' + wk + '-' + lo + '-' + hi, week: wk, a: ai, b: bi, conf: !!g.conf, sa: null, sb: null });
    }

    rawTeams.forEach(function (t) {
      (t.games || []).forEach(function (g) { if (!g.bye) addPlayed(t.id, g); });
      (t.upcoming || []).forEach(function (g) { addUpcoming(t.id, g); });
    });

    games.sort(function (g, h) { return g.week - h.week; });

    // weeksPlayed = last FINAL week, clamped into the regular season so the
    // "as-of" week drives open-game detection (0 open games = championship week).
    var weeksPlayed = Math.min(num(d.weeksPlayed), regWeeks);

    return {
      confs: confs,
      teams: teams,
      games: games,
      weeksPlayed: weeksPlayed,
      regWeeks: regWeeks,
      season: season,
      updatedAt: d.updatedAt || null,
      ccgResults: ccgResults
    };
  }

  // Public entry: resolve a data model (cache-first, background refresh).
  function loadScenario() {
    var cached = readCache();
    if (cached) {
      if (cached.age > FRESH_MS) {
        fetchPayload().then(writeCache).catch(function () {});
      }
      return Promise.resolve(buildModel(cached.payload));
    }
    return fetchPayload().then(function (d) { writeCache(d); return buildModel(d); });
  }

  window.CFFB_SB_LOAD = loadScenario;
})();
