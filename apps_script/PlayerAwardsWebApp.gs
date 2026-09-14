/**
 * PLAYER AWARDS & RECRUITING DOLLARS WEB APP
 * Public HTTPS endpoint that returns the current season's player awards and
 * recruiting bonus dollars as JSON. Consumed by the MFL home page message
 * ("Player Awards & Recruiting Dollars" DesignSync dashboard).
 *
 * This feed is served through the SAME deployment as Power Rankings — only one
 * doGet() is allowed per Apps Script project, so PowerRankingsWebApp.gs::doGet
 * routes `?feed=awards` here (exactly like it routes `?feed=ledger` to the
 * Player Ledger). It therefore reuses that file's helpers:
 *   readFranchiseLookup, normalizeId, normalizeConfId, headerIndexMap,
 *   numOrZero, jsonResponse, CONFERENCE_LOGOS, detectLatestYearInPowerRankings.
 *
 * Data sources (all tabs in the league workbook):
 *   - Awards            (Awards.gs)            — national + all-conference winners
 *   - RecruitingDollars (RecruitingDollars.gs) — per-team bonus-dollar totals
 *   - FranchiseLookup                          — team identity / colors / owner
 *
 * Redeploy after editing this file (deployments are frozen at deploy time).
 */

const AW_CACHE_KEY = "awards_payload_v1";
const AW_CACHE_TTL_SECONDS = 600; // 10 minutes

// ============================================================================
// PUBLIC ENDPOINT (invoked from PowerRankingsWebApp.gs::doGet on ?feed=awards)
// ============================================================================

function serveAwardsFeed(e) {
  try {
    const cache = CacheService.getScriptCache();
    const nocache = e && e.parameter && e.parameter.nocache;
    const cached = nocache ? null : cache.get(AW_CACHE_KEY);
    if (cached) return jsonResponse(cached);

    const overrideYear = e && e.parameter && e.parameter.year ? Number(e.parameter.year) : undefined;
    const payload = buildAwardsPayload(overrideYear);
    const body = JSON.stringify(payload);

    if (body.length < 90000) {
      cache.put(AW_CACHE_KEY, body, AW_CACHE_TTL_SECONDS);
    }
    return jsonResponse(body);
  } catch (err) {
    return jsonResponse(JSON.stringify({ error: String((err && err.message) || err) }));
  }
}

/** Manual cache bust — call after Awards.gs / RecruitingDollars.gs finish. */
function clearAwardsCache() {
  CacheService.getScriptCache().remove(AW_CACHE_KEY);
  Logger.log("Awards cache cleared.");
}

// ============================================================================
// PAYLOAD BUILDER
// ============================================================================

function buildAwardsPayload(overrideYear) {
  const year = overrideYear != null
    ? Number(overrideYear)
    : (detectLatestYearInSheet("Awards", "Year")
        || detectLatestYearInSheet("RecruitingDollars", "Year")
        || Number(getLeagueYear()));

  const franchises = readFranchiseLookup(); // fid -> { name, abbr, conf, owner, bg, fg, logo }

  const teamOf = function (fid) {
    const id = normalizeId(fid);
    const m = franchises[id] || {};
    return {
      abbr: m.abbr || id,
      name: m.name || id,
      color: m.bg || "#2A2A2A",
      txt: m.fg || "#FFFFFF",
      conf: awardsConfId(m.conf || ""),
      owner: m.owner || ""
    };
  };

  const awards = readAwardsForYear(year);          // { national:{...}, conf:{...raw rows} }
  const national = buildNational(awards, teamOf);
  const confTiers = buildConfTiers(awards, teamOf);
  const recruiting = buildRecruiting(year, teamOf);

  // Conferences present in the data, in the canonical league order.
  const order = ["sec", "b1g", "acc", "big12", "aac", "pac"];
  const present = {};
  Object.keys(confTiers).forEach(function (c) { present[c] = true; });
  Object.keys(recruiting.teams).forEach(function (fid) { present[recruiting.teams[fid].conf] = true; });
  const conferences = order.filter(function (c) { return present[c]; }).map(function (id) {
    return { id: id, name: awardsConfName(id), logo: CONFERENCE_LOGOS[confLogoKey(id)] || null };
  });

  return {
    updatedAt: new Date().toISOString(),
    season: year,
    weeksPlayed: awards.weeksPlayed || recruiting.weeksPlayed || null,
    status: recruiting.status || "PROJECTED",
    conferences: conferences,
    nationalOrder: ["heisman", "obrien", "walker", "biletnikoff", "coach"],
    confOrder: order.filter(function (c) { return present[c]; }),
    national: national,
    confTiers: confTiers,
    recruiting: recruiting
  };
}

// ============================================================================
// AWARDS READERS
// ============================================================================

/**
 * Read the Awards sheet for a year and bucket rows by award family.
 * @returns {Object} { weeksPlayed, national:{heisman,National_QB,National_RB,
 *                     National_WR_TE,CoachOfYear:[rows]}, conf:{<confId>:[rows]} }
 */
function readAwardsForYear(year) {
  const config = getConfig();
  const sheet = SpreadsheetApp.getActive().getSheetByName(config.sheets.awards);
  const out = { weeksPlayed: null, national: {}, conf: {} };
  if (!sheet || sheet.getLastRow() < 2) return out;

  const data = sheet.getDataRange().getValues();
  const idx = headerIndexMap(data[0].map(String));

  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== Number(year)) return;
    const type = String(row[idx["AwardType"]] || "");
    const rec = {
      awardType: type,
      copyId: String(row[idx["PlayerCopyID"]] || ""),
      playerId: String(row[idx["MFL_Player_ID"]] || ""),
      name: String(row[idx["PlayerName"]] || ""),
      pos: String(row[idx["Position"]] || ""),
      confRaw: String(row[idx["Conference"]] || ""),
      franchiseId: normalizeId(row[idx["FranchiseID"]]),
      pts: numOrZero(row[idx["StarterPoints"]]),
      teamPF: numOrZero(row[idx["TeamPF"]]),
      teamWins: numOrZero(row[idx["TeamWins"]]),
      awardScore: numOrZero(row[idx["AwardScore"]]),
      rank: numOrZero(row[idx["Rank"]])
    };

    if (type === "Heisman" || type === "CoachOfYear" || type.indexOf("National_") === 0) {
      if (!out.national[type]) out.national[type] = [];
      out.national[type].push(rec);
    } else if (type.indexOf("AllConf_") === 0) {
      const cid = awardsConfId(rec.confRaw);
      if (!out.conf[cid]) out.conf[cid] = [];
      out.conf[cid].push(rec);
    }
  });

  return out;
}

/** Front-runner + finalists for each of the five national trophies. */
function buildNational(awards, teamOf) {
  // Position rank (within its national position award) keyed by copyId — used to
  // give Heisman finalists a meaningful "POS #n" badge.
  const posRankByCopy = {};
  ["National_QB", "National_RB", "National_WR_TE"].forEach(function (t) {
    (awards.national[t] || []).slice().sort(byRank).forEach(function (r, i) {
      posRankByCopy[r.copyId] = i + 1;
    });
  });

  const finalize = function (rows, opts) {
    return rows.slice().sort(byRank).map(function (r, i) {
      const team = teamOf(r.franchiseId);
      return {
        rank: i + 1,
        name: r.name,
        pos: opts && opts.coach ? "HC" : r.pos,
        posRank: opts && opts.usePosGroupRank
          ? (posRankByCopy[r.copyId] || i + 1)
          : (i + 1),
        pts: round2(r.pts),
        pctTeam: r.teamPF ? Math.round((r.pts / r.teamPF) * 100) : 0,
        teamWins: r.teamWins,
        awardScore: round2(r.awardScore),
        team: team
      };
    });
  };

  return {
    heisman:      { finalists: finalize((awards.national["Heisman"] || []).slice(0, 10), { usePosGroupRank: true }) },
    obrien:       { finalists: finalize(awards.national["National_QB"] || []) },
    walker:       { finalists: finalize(awards.national["National_RB"] || []) },
    biletnikoff:  { finalists: finalize(awards.national["National_WR_TE"] || []) },
    coach:        { finalists: finalize((awards.national["CoachOfYear"] || []).slice(0, 10), { coach: true }) }
  };
}

/** First/second/third all-conference teams per conference (1 QB, 3 RB, 4 WR/TE). */
function buildConfTiers(awards, teamOf) {
  const tiers = {};
  const tierKey = { "1st": "first", "2nd": "second", "3rd": "third" };
  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };

  Object.keys(awards.conf).forEach(function (cid) {
    const rows = awards.conf[cid];

    // Conference-wide position rank by award score (QB #1, RB #1..n, …).
    const posRank = {};
    ["QB", "RB", "WR", "TE"].forEach(function (p) {
      const group = p === "WR" || p === "TE"
        ? rows.filter(function (r) { return r.pos === "WR" || r.pos === "TE"; })
        : rows.filter(function (r) { return r.pos === p; });
      group.slice().sort(function (a, b) { return b.awardScore - a.awardScore; })
        .forEach(function (r, i) { posRank[r.copyId] = i + 1; });
    });

    tiers[cid] = { first: [], second: [], third: [] };
    rows.forEach(function (r) {
      const suffix = r.awardType.split("_").pop(); // "1st" | "2nd" | "3rd"
      const tk = tierKey[suffix];
      if (!tk) return;
      const team = teamOf(r.franchiseId);
      tiers[cid][tk].push({
        pos: r.pos,
        name: r.name,
        posRank: posRank[r.copyId] || r.rank,
        pts: round2(r.pts),
        pctTeam: r.teamPF ? Math.round((r.pts / r.teamPF) * 100) : 0,
        confPts: round2(r.pts), // all-conference points ARE conference-game points
        awardScore: round2(r.awardScore),
        team: team
      });
    });

    // Order each tier QB → RB → WR/TE, then by award score within a position.
    Object.keys(tiers[cid]).forEach(function (tk) {
      tiers[cid][tk].sort(function (a, b) {
        const pa = posOrder[a.pos] == null ? 9 : posOrder[a.pos];
        const pb = posOrder[b.pos] == null ? 9 : posOrder[b.pos];
        return pa - pb || b.awardScore - a.awardScore;
      });
    });
  });

  return tiers;
}

// ============================================================================
// RECRUITING DOLLARS READER
// ============================================================================

/**
 * Read RecruitingDollars for a year and group the per-category columns into the
 * four buckets the dashboard shows: Wins, Awards, Rivalry, Draft−Retention.
 */
function buildRecruiting(year, teamOf) {
  const config = getConfig();
  const sheet = SpreadsheetApp.getActive().getSheetByName(config.sheets.recruitingDollars);
  const out = { season: year, weeksPlayed: readLatestPowerRankingsWeek(year), status: "PROJECTED", teams: {} };
  if (!sheet || sheet.getLastRow() < 2) return out;

  const data = sheet.getDataRange().getValues();
  const idx = headerIndexMap(data[0].map(String));
  const g = function (row, key) { return idx[key] != null ? numOrZero(row[idx[key]]) : 0; };

  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== Number(year)) return;
    const fid = normalizeId(row[idx["FranchiseID"]]);
    if (!fid || fid === "000") return;

    if (idx["Status"] != null && String(row[idx["Status"]]).trim()) {
      out.status = String(row[idx["Status"]]).trim();
    }

    const wins = g(row, "RegSeasonDollars") + g(row, "PostseasonDollars");
    const awardsD = g(row, "NationalPositionDollars") + g(row, "HeismanDollars") +
                    g(row, "CoachOfYearDollars") + g(row, "FirstTeamDollars") +
                    g(row, "SecondTeamDollars") + g(row, "ThirdTeamDollars");
    const rivalryNet = g(row, "WagerNet");
    const draftNet = g(row, "DraftBonusDollars") - g(row, "RetentionCostDollars");
    const total = idx["TotalBonusDollars"] != null
      ? g(row, "TotalBonusDollars")
      : wins + awardsD + rivalryNet + draftNet;

    const team = teamOf(fid);
    out.teams[fid] = {
      name: team.name, abbr: team.abbr, color: team.color, txt: team.txt,
      conf: team.conf, owner: team.owner,
      total: total, wins: wins, awards: awardsD, rivalryNet: rivalryNet, draftNet: draftNet,
      raw: {
        regSeason: g(row, "RegSeasonDollars"), postseason: g(row, "PostseasonDollars"),
        national: g(row, "NationalPositionDollars"), heisman: g(row, "HeismanDollars"),
        coty: g(row, "CoachOfYearDollars"),
        first: g(row, "FirstTeamDollars"), second: g(row, "SecondTeamDollars"), third: g(row, "ThirdTeamDollars"),
        wagerWon: g(row, "WagerWon"), wagerLost: g(row, "WagerLost"),
        draftBonus: g(row, "DraftBonusDollars"), retention: g(row, "RetentionCostDollars")
      }
    };
  });

  return out;
}

// ============================================================================
// HELPERS
// ============================================================================

function byRank(a, b) { return (a.rank || 999) - (b.rank || 999); }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

/** Latest year present in a sheet's Year column (0 if none). */
function detectLatestYearInSheet(sheetName, yearHeader) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const data = sheet.getDataRange().getValues();
  const yi = data[0].map(String).indexOf(yearHeader);
  if (yi < 0) return 0;
  let latest = 0;
  for (let i = 1; i < data.length; i++) {
    const y = Number(data[i][yi]);
    if (y && y > latest) latest = y;
  }
  return latest;
}

/** Latest played week in PowerRankings for a year (null if unavailable). */
function readLatestPowerRankingsWeek(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("PowerRankings");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getDataRange().getValues();
  const idx = headerIndexMap(data[0].map(String));
  if (idx["Year"] == null || idx["Week"] == null) return null;
  let wk = 0;
  data.slice(1).forEach(function (row) {
    if (Number(row[idx["Year"]]) !== Number(year)) return;
    const w = Number(row[idx["Week"]]);
    if (w > wk) wk = w;
  });
  return wk || null;
}

/**
 * Map a FranchiseLookup Conference string to the dashboard's canonical id
 * (sec | b1g | acc | big12 | aac | pac). Handles common spellings/abbreviations.
 */
function awardsConfId(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return "";
  if (s === "sec") return "sec";
  if (s === "acc") return "acc";
  if (s === "aac") return "aac";
  if (s === "b1g" || s === "b10" || s === "bigten" || s === "bten" || s === "big10") return "b1g";
  if (s === "big12" || s === "b12" || s === "bigtwelve") return "big12";
  if (s === "pac" || s === "pac12" || s === "p12" || s === "pactwelve") return "pac";
  return s; // unknown — pass through normalized
}

function awardsConfName(id) {
  const m = { sec: "SEC", b1g: "Big Ten", acc: "ACC", big12: "Big 12", aac: "AAC", pac: "Pac-12" };
  return m[id] || id.toUpperCase();
}

/** Key into PowerRankingsWebApp's CONFERENCE_LOGOS map. */
function confLogoKey(id) {
  const m = { sec: "sec", b1g: "b1g", acc: "acc", big12: "big12", aac: "aac", pac: "pac12" };
  return m[id] || id;
}

// ============================================================================
// LOCAL TEST
// ============================================================================

/**
 * Run from the Apps Script editor to verify payload shape without deploying.
 * Prints season, counts, and payload size.
 */
function testBuildAwardsPayload(year) {
  const p = buildAwardsPayload(year);
  const body = JSON.stringify(p);
  Logger.log("Season: " + p.season + "  Status: " + p.status + "  Weeks: " + p.weeksPlayed);
  Logger.log("Conferences: " + p.conferences.map(function (c) { return c.id; }).join(", "));
  Object.keys(p.national).forEach(function (k) {
    Logger.log("  national." + k + ": " + p.national[k].finalists.length + " finalists" +
      (p.national[k].finalists[0] ? " (leader: " + p.national[k].finalists[0].name + ")" : ""));
  });
  Object.keys(p.confTiers).forEach(function (c) {
    const t = p.confTiers[c];
    Logger.log("  confTiers." + c + ": " + t.first.length + "/" + t.second.length + "/" + t.third.length);
  });
  Logger.log("Recruiting teams: " + Object.keys(p.recruiting.teams).length);
  Logger.log("Payload size: " + body.length + " bytes");
}

function testBuildAwardsPayload2025() { testBuildAwardsPayload(2025); }
function testBuildAwardsPayload2026() { testBuildAwardsPayload(2026); }
