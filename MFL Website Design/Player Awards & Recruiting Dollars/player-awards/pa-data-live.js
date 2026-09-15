/* CFFB — Player Awards & Recruiting Dollars: LIVE data adapter.
 *
 * Fetches the Apps Script `?feed=awards` JSON (same /exec deployment as Power
 * Rankings / Standings / Player Ledger) and reshapes it into the two globals the
 * DesignSync component polls for: window.CFFB_AWARDS and window.CFFB_RECRUITING.
 *
 * The component's componentDidMount already waits for both globals and
 * re-renders once they appear, so this adapter only has to set them. It exposes
 * window.__loadPlayerAwards() (returns a Promise) for optional error surfacing,
 * and kicks the load off immediately on execute.
 *
 * __WEBAPP_URL__ is substituted with the live /exec URL at build time.
 */
(function () {
  var FEED_URL = "__WEBAPP_URL__" + (("__WEBAPP_URL__").indexOf("?") >= 0 ? "&" : "?") + "feed=awards";

  // MFL player headshot — same live path the Roster Board / Player Ledger use.
  // Missing photos 404, so a background-image layer just falls back to the
  // silhouette placeholder underneath (no broken-image icon).
  function photoUrl(pid) {
    return pid ? "https://www46.myfantasyleague.com/player_photos_2014/" + pid + "_thumb.jpg" : "";
  }
  // Normalize imgur page URLs to a direct image (matches rb-data-live imgurDirect).
  function imgurDirect(u) {
    var m = String(u || "").match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)(?:\.[A-Za-z0-9]+)?$/i);
    return m ? "https://i.imgur.com/" + m[1] + ".png" : (u || "");
  }
  function cleanTeam(t) {
    if (!t) return t;
    return {
      abbr: t.abbr, name: t.name, color: t.color, txt: t.txt, conf: t.conf,
      owner: t.owner || "", logo: imgurDirect(t.logo)
    };
  }

  // Static presentation constants (colors/labels) — mirror the sample
  // awards-data.js so the component's tabs/accents look identical.
  var CONFS = {
    sec:   { key: "sec",   label: "SEC",     accent: "#C9A227", tint: "rgba(201,162,39,0.14)" },
    b1g:   { key: "b1g",   label: "Big Ten", accent: "#7DA0CC", tint: "rgba(74,111,165,0.16)" },
    acc:   { key: "acc",   label: "ACC",     accent: "#C58DA0", tint: "rgba(139,74,92,0.18)" },
    big12: { key: "big12", label: "Big 12",  accent: "#D88787", tint: "rgba(184,69,69,0.16)" },
    aac:   { key: "aac",   label: "AAC",     accent: "#A799C0", tint: "rgba(107,92,139,0.18)" },
    pac:   { key: "pac",   label: "Pac-12",  accent: "#9CB8A8", tint: "rgba(92,122,106,0.18)" }
  };

  // Trophy display metadata (labels only — finalists come from the feed).
  var NATIONAL_META = {
    heisman:     { name: "Heisman Trophy",  honors: "Most Outstanding Player", pos: "ANY" },
    obrien:      { name: "National QB",      honors: "Best Quarterback",        pos: "QB" },
    walker:      { name: "National RB",      honors: "Best Running Back",       pos: "RB" },
    biletnikoff: { name: "National WR / TE", honors: "Best Receiver",           pos: "WR/TE" },
    coach:       { name: "Coach of the Year", honors: "Top Head Coach",         pos: "HC", isCoach: true }
  };

  function reshape(feed) {
    var confOrder = feed.confOrder && feed.confOrder.length
      ? feed.confOrder
      : ["sec", "b1g", "acc", "big12", "aac", "pac"];
    var nationalOrder = feed.nationalOrder || ["heisman", "obrien", "walker", "biletnikoff", "coach"];

    // Conferences map (only those present in the data).
    var conferences = {};
    confOrder.forEach(function (id) { if (CONFS[id]) conferences[id] = CONFS[id]; });

    // National awards: attach display metadata to the feed's finalists.
    var national = {};
    nationalOrder.forEach(function (key) {
      var meta = NATIONAL_META[key] || { name: key, honors: "", pos: "ANY" };
      var finalists = ((feed.national && feed.national[key] && feed.national[key].finalists) || []).map(function (f) {
        return {
          rank: f.rank, name: f.name, pos: f.pos,
          cls: f.team ? (f.team.owner || "") : "",   // repurposed slot: owning manager
          playerId: f.playerId || "", photo: photoUrl(f.playerId),
          posRank: f.posRank,
          pts: f.pts, pctTeam: f.pctTeam, confPts: f.confPts || 0,
          teamWins: f.teamWins, awardScore: f.awardScore,
          team: cleanTeam(f.team)
        };
      });
      national[key] = {
        key: key, name: meta.name, honors: meta.honors, pos: meta.pos,
        isCoach: !!meta.isCoach, finalists: finalists
      };
    });

    // Conference tiers: pass through, repurposing cls -> owning manager.
    var confTiers = {};
    Object.keys(feed.confTiers || {}).forEach(function (cid) {
      var t = feed.confTiers[cid];
      var mapTier = function (arr) {
        return (arr || []).map(function (p) {
          return {
            pos: p.pos, name: p.name,
            cls: p.team ? (p.team.owner || "") : "",
            playerId: p.playerId || "", photo: photoUrl(p.playerId),
            posRank: p.posRank, pts: p.pts, pctTeam: p.pctTeam, confPts: p.confPts,
            awardScore: p.awardScore, team: cleanTeam(p.team)
          };
        });
      };
      confTiers[cid] = { first: mapTier(t.first), second: mapTier(t.second), third: mapTier(t.third) };
    });

    window.CFFB_AWARDS = {
      season: String(feed.season),
      week: feed.weeksPlayed || "",
      conferences: conferences,
      national: national,
      nationalOrder: nationalOrder,
      confOrder: confOrder,
      confTiers: confTiers
    };

    var rec = feed.recruiting || { teams: {} };
    var recTeams = rec.teams || {};
    Object.keys(recTeams).forEach(function (fid) {
      if (recTeams[fid]) recTeams[fid].logo = imgurDirect(recTeams[fid].logo);
    });
    window.CFFB_RECRUITING = {
      season: Number(feed.season),
      week: rec.weeksPlayed || feed.weeksPlayed || "",
      totalWeeks: 14,
      status: rec.status || feed.status || "PROJECTED",
      teams: recTeams
    };
  }

  window.__loadPlayerAwards = function () {
    return fetch(FEED_URL, { credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (feed) {
        if (feed && feed.error) throw new Error(feed.error);
        reshape(feed);
        return feed;
      })
      .catch(function (e) {
        console.error("[CFFB Player Awards] feed load failed:", e && e.message ? e.message : e);
        throw e;
      });
  };

  // Kick off immediately; the component picks the globals up when they land.
  window.__loadPlayerAwards();
})();
