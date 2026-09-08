// CFFB · Shared rank feed
// ---------------------------------------------------------------------------
// Surfaces the sheet-driven team POWER RANK — the exact `rank` the Power
// Rankings widget shows — to OTHER widgets, keyed by MFL franchise id.
//
// It reuses the SAME Apps Script payload (and the SAME localStorage cache key,
// `cffb_webapp_payload_v1`) that Power Rankings / Standings / Live Scoring
// already populate, so there is no new data pipeline:
//   1. read the shared cache synchronously → the rank map is ready before first
//      paint whenever any sibling widget or a prior visit warmed the cache;
//   2. refresh in the background (non-blocking) so the cache stays current for
//      every widget and the next load is fresh.
//
// PURELY ADDITIVE. If the feed is down, the cache is cold, or a team has no
// rank in the sheet, `rankOf()` returns null and the caller renders no badge —
// the host widget is never blocked and never breaks. The whole thing is wrapped
// so a malformed payload or disabled storage degrades to "no rank", never an
// error.
//
// The build substitutes the Apps Script /exec URL for __WEBAPP_URL__. In a
// standalone/preview build (URL not substituted) it simply stays empty and no
// network call is made.
//
// Exposes window.__cffbRankFeed = { rankOf(fid) -> number|null, all() -> {fid:rank} }.
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__cffbRankFeed) return;                 // define once per page (shared across widgets)

  var WEBAPP_URL = '__WEBAPP_URL__';
  var CACHE_KEY  = 'cffb_webapp_payload_v1';          // shared with PR / Standings / Live Scoring
  var MAX_MS     = 7 * 24 * 60 * 60 * 1000;           // ignore cache older than 7 days
  var byFid      = {};                                // fid (string) -> rank (number)

  // Pull every team's rank out of a web-app payload. A team with no positive
  // rank (new franchise, commissioner pseudo-franchise, id mismatch) is skipped
  // so callers get no entry rather than a 0/wrong badge.
  function absorb(payload) {
    try {
      var teams = payload && payload.teams;
      if (!teams || !teams.length) return;
      for (var i = 0; i < teams.length; i++) {
        var t = teams[i];
        if (t && t.id != null && t.rank != null && +t.rank > 0) byFid[String(t.id)] = +t.rank;
      }
    } catch (e) { /* malformed payload → keep whatever we had */ }
  }

  // Instant: populate from the shared cache before first paint.
  function readCache() {
    try {
      var rec = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!rec || typeof rec.ts !== 'number' || rec.payload == null) return;
      if (Date.now() - rec.ts > MAX_MS) return;       // too old — ignore
      absorb(rec.payload);
    } catch (e) { /* disabled / private mode / bad JSON → no rank this load */ }
  }

  // Non-blocking: refresh the map + the shared cache so the next load is current.
  function refresh() {
    if (!WEBAPP_URL || WEBAPP_URL.indexOf('__') === 0) return;   // not substituted (preview build)
    try {
      fetch(WEBAPP_URL, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.teams) return;
          absorb(d);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: d })); } catch (e) { /* ignore */ }
        })
        .catch(function () { /* offline / blocked → keep cache + logo fallback */ });
    } catch (e) { /* fetch unavailable → cache-only */ }
  }

  readCache();
  refresh();

  window.__cffbRankFeed = {
    rankOf: function (fid) { var r = byFid[String(fid)]; return r || null; },
    all: function () { return byFid; }
  };
})();
