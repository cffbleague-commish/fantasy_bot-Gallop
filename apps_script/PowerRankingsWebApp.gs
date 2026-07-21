/**
 * POWER RANKINGS WEB APP
 * Public HTTPS endpoint that returns the current league standings as JSON.
 * Consumed by the MFL home page message (Power Rankings React shell).
 *
 * Deploy:
 *   Apps Script editor -> Deploy -> New deployment
 *   Type: Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *   Copy the /exec URL and paste it into MFL Website Design/build-power-rankings.js
 *
 * Redeploy after editing this file (deployments are frozen at deploy time).
 */

// ============================================================================
// PUBLIC ENDPOINT
// ============================================================================

function doGet(e) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(PR_CACHE_KEY);
    if (cached && !(e && e.parameter && e.parameter.nocache)) {
      return jsonResponse(cached);
    }

    const payload = buildPowerRankingsPayload();
    const body = JSON.stringify(payload);

    // Cache up to ~100 KB (CacheService limit). Only cache smaller payloads.
    if (body.length < 90000) {
      cache.put(PR_CACHE_KEY, body, PR_CACHE_TTL_SECONDS);
    }

    return jsonResponse(body);
  } catch (err) {
    const errBody = JSON.stringify({ error: String(err && err.message || err) });
    return jsonResponse(errBody);
  }
}

/**
 * Manual cache bust — call from a menu / trigger after Rankings.gs finishes.
 */
function clearPowerRankingsCache() {
  CacheService.getScriptCache().remove(PR_CACHE_KEY);
  Logger.log("Power Rankings cache cleared.");
}

const PR_CACHE_KEY = "power_rankings_payload_v1";
const PR_CACHE_TTL_SECONDS = 600; // 10 minutes

// Conference logo URLs (Imgur i. host — direct image, not gallery page).
// Keyed by the id normalizeConfId() produces from the sheet's Conference
// column. Alternate spellings for the same conference are all included so
// whatever the sheet uses matches.
const CONFERENCE_LOGOS = {
  sec:   "https://i.imgur.com/xHc56XP.png",
  acc:   "https://i.imgur.com/mbCFRof.png",
  aac:   "https://i.imgur.com/Ct4aTaU.png",
  b10:   "https://i.imgur.com/c6aoyYl.png",
  b1g:   "https://i.imgur.com/c6aoyYl.png",
  bten:  "https://i.imgur.com/c6aoyYl.png",
  bigten:"https://i.imgur.com/c6aoyYl.png",
  b12:   "https://i.imgur.com/fWrSLJu.png",
  big12: "https://i.imgur.com/fWrSLJu.png",
  p12:   "https://i.imgur.com/1E0TJhR.png",
  pac:   "https://i.imgur.com/1E0TJhR.png",
  pac12: "https://i.imgur.com/1E0TJhR.png"
};

// ============================================================================
// PAYLOAD BUILDER
// ============================================================================

function buildPowerRankingsPayload(overrideYear) {
  // Prefer whatever year actually has data in the PowerRankings sheet, so the
  // web app "just works" without depending on the LEAGUE_YEAR script property
  // being kept up to date. Explicit overrides still win.
  const year = overrideYear != null
    ? Number(overrideYear)
    : detectLatestYearInPowerRankings() || Number(getLeagueYear());

  const franchises = readFranchiseLookup();          // id -> { name, conf, abbr, owner, bg, fg, logo }
  const rankingsByFranchise = readLatestPowerRankings(year); // id -> ranking row (latest week)
  const historyByFranchise  = readPowerRankingsHistory(year); // id -> { rankHist, moves }
  const scheduleByFranchise = readScheduleResultsForYear(year); // id -> [{ week, ... }]

  const latestWeek = detectLatestPlayedWeek(rankingsByFranchise, scheduleByFranchise);
  const weeksTotal = 14; // regular season + playoffs display window

  let unknownOppCount = 0;

  // Assemble team payload
  const teams = Object.keys(franchises).map(function (fid) {
    const meta = franchises[fid];
    const r = rankingsByFranchise[fid] || {};
    const rows = (scheduleByFranchise[fid] || []).slice().sort(function (a, b) { return a.week - b.week; });

    const games = [];
    const upcoming = [];
    rows.forEach(function (row) {
      const oppId = normalizeId(row.opponentId);
      const oppKnown = oppId && franchises[oppId];
      if (row.week <= latestWeek) {
        // Treat "BYE" or missing/unknown opponent as a bye. Rendering an
        // "opp" that isn't in FranchiseLookup would crash SchedRow.
        if (row.gameResult === "BYE" || !oppKnown) {
          if (!oppKnown && row.gameResult !== "BYE") unknownOppCount++;
          games.push({ week: row.week, bye: true });
        } else {
          games.push({
            week: row.week,
            opp: oppId,
            my: round1(row.teamScore),
            ov: round1(row.opponentScore),
            win: row.gameResult === "W",
            ap: allPlayPercent(row.weeklyAllPlayWins, row.weeklyAllPlayLosses, row.weeklyAllPlayTies),
            oppAp: allPlayPercent(row.weeklyOppAllPlayWins, row.weeklyOppAllPlayLosses, row.weeklyOppAllPlayTies),
            rivalry: row.isRivalry,
            gameday: row.isGameday
          });
        }
      } else {
        upcoming.push({
          week: row.week,
          opp: oppKnown ? oppId : null,
          rivalry: row.isRivalry,
          gameday: row.isGameday
        });
      }
    });

    // Overall record includes postseason play (Conference record does not).
    const W  = numOrZero(r.regularSeasonWins)   + numOrZero(r.postseasonWins);
    const L  = numOrZero(r.regularSeasonLosses) + numOrZero(r.postseasonLosses);
    const cW = numOrZero(r.conferenceWins);
    const cL = numOrZero(r.conferenceLosses);
    const gamesPlayed = games.filter(function (g) { return !g.bye; }).length;
    const pf = games.reduce(function (s, g) { return g.bye ? s : s + g.my; }, 0);
    const pa = games.reduce(function (s, g) { return g.bye ? s : s + g.ov; }, 0);
    const ppg  = gamesPlayed ? pf / gamesPlayed : 0;
    const papg = gamesPlayed ? pa / gamesPlayed : 0;

    return {
      id: fid,
      name: meta.name || r.teamName || fid,
      abbr: meta.abbr || fid,
      conf: normalizeConfId(meta.conf || r.conference || ""),
      owner: meta.owner || "",
      bg: meta.bg || "#2A2A2A",
      fg: meta.fg || "#FFFFFF",
      pill: meta.logo || null,

      rank: numOrNull(r.rank),
      prevRank: numOrNull(r.previousRank),
      rankingScore: numOrNull(r.rankingScore),

      W: W, L: L, cW: cW, cL: cL,
      pf: round1(pf), pa: round1(pa),
      ppg: round1(ppg), papg: round1(papg),

      allPlayPct: normalizePct(r.allPlayPct),
      oppAllPlayPct: normalizePct(r.oppAllPlayPct),

      streak: computeStreak(games),
      games: games,
      upcoming: upcoming,

      // Weekly rank timeline for the RankTrail chart. rankHist[i] is the
      // team's league rank AFTER week (i+1). moves[i] is the delta vs the
      // prior week (positive = climbed, negative = dropped).
      rankHist: (historyByFranchise[fid] && historyByFranchise[fid].rankHist) || [],
      moves:    (historyByFranchise[fid] && historyByFranchise[fid].moves)    || []
    };
  });

  // Sort by rank (nulls last); assign a fallback rank for teams missing one
  teams.sort(function (a, b) {
    if (a.rank == null && b.rank == null) return 0;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });
  teams.forEach(function (t, i) {
    if (t.rank == null) t.rank = i + 1;
  });

  // Build conferences list from actual team conf values, plus 'all'
  const confSet = {};
  teams.forEach(function (t) { if (t.conf) confSet[t.conf] = true; });
  const conferences = [{ id: "all", name: "All", logo: null }].concat(
    Object.keys(confSet).sort().map(function (id) {
      return { id: id, name: confPrettyName(id), logo: CONFERENCE_LOGOS[id] || null };
    })
  );

  if (unknownOppCount > 0) {
    Logger.log("PowerRankingsWebApp: " + unknownOppCount + " schedule rows had opponent IDs missing from FranchiseLookup (rendered as byes).");
  }

  return {
    updatedAt: new Date().toISOString(),
    season: year,
    weeksPlayed: latestWeek,
    weeksTotal: weeksTotal,
    conferences: conferences,
    teams: teams,
    unknownOppCount: unknownOppCount
  };
}

// ============================================================================
// SHEET READERS
// ============================================================================

function readFranchiseLookup() {
  const config = getConfig();
  const sheet = SpreadsheetApp.getActive().getSheetByName(config.sheets.franchiseLookup);
  if (!sheet) throw new Error("FranchiseLookup sheet not found");

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const headers = data[0].map(String);
  const idx = headerIndexMap(headers);

  const map = {};
  data.slice(1).forEach(function (row) {
    const rawId = row[idx["Franchise ID"]];
    if (rawId === "" || rawId == null) return;
    const fid = normalizeId(rawId);

    map[fid] = {
      name:  cellStr(row, idx, ["Team Name", "TeamName", "Name"]),
      abbr:  cellStr(row, idx, ["Abbreviation", "Abbr"]),
      conf:  cellStr(row, idx, ["Conference"]),
      owner: cellStr(row, idx, ["Owner", "Manager", "OwnerHandle"]),
      bg:    cellStr(row, idx, ["Primary Color", "PrimaryColor", "BG"]),
      fg:    cellStr(row, idx, ["Secondary Color", "SecondaryColor", "FG"]),
      logo:  cellStr(row, idx, ["Franchise Logo", "Logo", "LogoURL", "Logo URL"])
    };
  });
  return map;
}

function readLatestPowerRankings(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("PowerRankings");
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const headers = data[0].map(String);
  const idx = headerIndexMap(headers);

  // Find latest week for this year
  let latestWeek = 0;
  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== year) return;
    const w = Number(row[idx["Week"]]);
    if (w > latestWeek) latestWeek = w;
  });
  if (!latestWeek) return {};

  const out = {};
  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== year) return;
    if (Number(row[idx["Week"]]) !== latestWeek) return;
    const fid = normalizeId(row[idx["FranchiseID"]]);
    out[fid] = {
      week: latestWeek,
      teamName: row[idx["TeamName"]],
      conference: row[idx["Conference"]],
      rank: row[idx["Rank"]],
      previousRank: row[idx["PreviousRank"]],
      movement: row[idx["Movement"]],
      rankingScore: row[idx["RankingScore"]],
      regularSeasonWins:   row[idx["RegularSeasonWins"]],
      regularSeasonLosses: row[idx["RegularSeasonLosses"]],
      regularSeasonTies:   row[idx["RegularSeasonTies"]],
      allPlayPct:    row[idx["AllPlayPct"]],
      oppAllPlayPct: row[idx["OppAllPlayPct"]],
      postseasonWins:   row[idx["PostseasonWins"]],
      postseasonLosses: row[idx["PostseasonLosses"]],
      conferenceWins:   row[idx["ConferenceWins"]],
      conferenceLosses: row[idx["ConferenceLosses"]],
      totalPointsScored: row[idx["TotalPointsScored"]]
    };
  });
  return out;
}

/**
 * Read PowerRankings for every played week of the year and return per-
 * franchise rank arrays sorted ascending by week. Backs the RankTrail chart.
 */
function readPowerRankingsHistory(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("PowerRankings");
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};
  const headers = data[0].map(String);
  const idx = headerIndexMap(headers);

  const byFid = {};
  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== year) return;
    const fid = normalizeId(row[idx["FranchiseID"]]);
    const week = Number(row[idx["Week"]]);
    const rank = Number(row[idx["Rank"]]);
    if (!fid || !week || isNaN(rank)) return;
    if (!byFid[fid]) byFid[fid] = [];
    byFid[fid].push({ week: week, rank: rank });
  });

  const out = {};
  Object.keys(byFid).forEach(function (fid) {
    const rows = byFid[fid].slice().sort(function (a, b) { return a.week - b.week; });
    const rankHist = rows.map(function (r) { return r.rank; });
    const moves = rankHist.map(function (rk, i) {
      if (i === 0) return 0;
      return rankHist[i - 1] - rk; // + = climbed, - = dropped
    });
    out[fid] = { rankHist: rankHist, moves: moves };
  });
  return out;
}

function readScheduleResultsForYear(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("ScheduleResults");
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const headers = data[0].map(String);
  const idx = headerIndexMap(headers);

  const out = {};
  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== year) return;
    const fid = normalizeId(row[idx["FranchiseID"]]);
    if (!out[fid]) out[fid] = [];
    out[fid].push({
      week: Number(row[idx["Week"]]),
      teamScore: Number(row[idx["TeamScore"]] || 0),
      opponentId: row[idx["OpponentID"]],
      opponentScore: Number(row[idx["OpponentScore"]] || 0),
      gameResult: row[idx["GameResult"]],
      weeklyAllPlayWins:   Number(row[idx["WeeklyAllPlayWins"]] || 0),
      weeklyAllPlayLosses: Number(row[idx["WeeklyAllPlayLosses"]] || 0),
      weeklyAllPlayTies:   Number(row[idx["WeeklyAllPlayTies"]] || 0),
      weeklyOppAllPlayWins:   Number(row[idx["WeeklyOppAllPlayWins"]] || 0),
      weeklyOppAllPlayLosses: Number(row[idx["WeeklyOppAllPlayLosses"]] || 0),
      weeklyOppAllPlayTies:   Number(row[idx["WeeklyOppAllPlayTies"]] || 0),
      isRivalry: asBool(idx["IsRivalryGame"] != null ? row[idx["IsRivalryGame"]] : false),
      isGameday: asBool(idx["IsGameOfTheWeek"] != null ? row[idx["IsGameOfTheWeek"]] : false)
    });
  });
  return out;
}

// ============================================================================
// HELPERS
// ============================================================================

function detectLatestYearInPowerRankings() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("PowerRankings");
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  const headers = data[0].map(String);
  const yearIdx = headers.indexOf("Year");
  if (yearIdx < 0) return 0;
  let latest = 0;
  for (let i = 1; i < data.length; i++) {
    const y = Number(data[i][yearIdx]);
    if (y && y > latest) latest = y;
  }
  return latest;
}

function detectLatestPlayedWeek(rankingsMap, scheduleMap) {
  let latest = 0;
  Object.keys(rankingsMap).forEach(function (fid) {
    const w = rankingsMap[fid].week || 0;
    if (w > latest) latest = w;
  });
  if (latest) return latest;
  // Fallback: scan schedule for weeks with non-empty scores
  Object.keys(scheduleMap).forEach(function (fid) {
    scheduleMap[fid].forEach(function (row) {
      if (row.gameResult && row.gameResult !== "" && row.week > latest) latest = row.week;
    });
  });
  return latest;
}

function computeStreak(games) {
  const played = games.filter(function (g) { return !g.bye; });
  if (!played.length) return "—";
  let dir = null;
  let n = 0;
  for (let i = played.length - 1; i >= 0; i--) {
    const win = played[i].win;
    if (dir === null) { dir = win; n = 1; }
    else if (win === dir) n++;
    else break;
  }
  return (dir ? "W" : "L") + n;
}

function allPlayPercent(w, l, t) {
  w = Number(w || 0); l = Number(l || 0); t = Number(t || 0);
  const total = w + l + t;
  if (!total) return 0;
  return round1(((w * 2 + t) / (total * 2)) * 100);
}

function normalizePct(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (isNaN(n)) return 0;
  // If stored as a fraction (0-1), scale to 0-100
  return round1(n <= 1.5 ? n * 100 : n);
}

function normalizeId(v) {
  if (v == null || v === "") return "";
  // Match Utilities.gs::normalizeFranchiseId (3-digit padding). A width
  // mismatch would silently break the join between FranchiseLookup,
  // PowerRankings, and ScheduleResults.
  return String(Number(v) || v).padStart(3, "0").slice(-3);
}

function normalizeConfId(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function confPrettyName(id) {
  const map = {
    sec: "SEC", acc: "ACC", b1g: "Big Ten", bten: "Big Ten", bigten: "Big Ten",
    big12: "Big 12", b12: "Big 12", pac: "Pac-12", pac12: "Pac-12", p12: "Pac-12",
    aac: "AAC"
  };
  return map[id] || id.toUpperCase();
}

function headerIndexMap(headers) {
  const idx = {};
  headers.forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}

function cellStr(row, idx, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (idx[key] != null && row[idx[key]] != null && String(row[idx[key]]).trim() !== "") {
      return String(row[idx[key]]).trim();
    }
  }
  return "";
}

function numOrZero(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function numOrNull(v) { if (v === "" || v == null) return null; const n = Number(v); return isNaN(n) ? null : n; }
function round1(n) { return Math.round(Number(n || 0) * 10) / 10; }
function asBool(v) {
  if (v === true) return true;
  if (v === false || v == null || v === "") return false;
  const s = String(v).trim().toUpperCase();
  return s === "TRUE" || s === "YES" || s === "1";
}

function jsonResponse(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// LOCAL TEST
// ============================================================================

/**
 * Run from the Apps Script editor to verify payload shape without deploying.
 * Prints size and a summary of the first team. Pass a year to override the
 * configured LEAGUE_YEAR (useful for testing off-season / prior seasons).
 */
function testBuildPowerRankingsPayload(year) {
  const p = buildPowerRankingsPayload(year);
  const body = JSON.stringify(p);
  Logger.log("Season: " + p.season + "  Weeks played: " + p.weeksPlayed);
  Logger.log("Teams: " + p.teams.length + "  Conferences: " + p.conferences.length);
  Logger.log("Payload size: " + body.length + " bytes");
  if (p.teams[0]) {
    Logger.log("Top team: " + JSON.stringify(p.teams[0], null, 2));
  }
}

/** Convenience wrapper — the Apps Script editor's Run button only calls
 *  no-arg functions, so having a fixed-year wrapper avoids needing to
 *  type into the debugger. */
function testBuildPowerRankingsPayload2025() {
  testBuildPowerRankingsPayload(2025);
}
