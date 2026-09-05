/**
 * PLAYER LEDGER WEB APP
 * JSON feed for the MFL "Player Ledger" home-page message.
 *
 * Reuses the SAME Apps Script web-app deployment as Power Rankings — there can be
 * only one doGet() per project, so PowerRankingsWebApp.doGet() routes here when
 * called with `?feed=ledger`:
 *   {EXEC}?feed=ledger                → buildLedgerIndex()  (search list)
 *   {EXEC}?feed=ledger&player={MFLID} → buildPlayerLedger() (one player's ledger)
 *
 * Data sources (all keyed by MFL_Player_ID):
 *   RookieLedger  — the player universe (name / position / NFL team / rookie year)
 *   PlayerCopies  — every copy: conference, current owner, eligibility, redshirts, award counts
 *   TransactionLog— per-copy chronological events (auction / redshirt / drop) + bid $
 *   Awards        — per-copy awards (Heisman / National_* / AllConf_*)
 *   DevyDraftHistory (separate DEVY_SHEET_ID spreadsheet) — devy draft round/pick/team
 *   FranchiseLookup — franchise-as-college-program branding (reused from PowerRankingsWebApp)
 *
 * Shared helpers reused from PowerRankingsWebApp.gs (same project, global scope):
 *   readFranchiseLookup(), normalizeId(), headerIndexMap(), cellStr(),
 *   confPrettyName(), CONFERENCE_LOGOS, jsonResponse(), numOrZero()
 *
 * Redeploy the web app (Manage deployments → new version) after editing this file.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const PL_HOST = "https://www46.myfantasyleague.com";
// Player headshot thumbnail. Confirmed live path is /player_photos_2014/{id}_thumb.jpg
// (80×107 jpg); MFL serves a "no photo" placeholder for ids it has no shot for.
function plPhotoUrl(playerId, year) {
  return PL_HOST + "/player_photos_2014/" + playerId + "_thumb.jpg";
}
const PL_NO_PHOTO = PL_HOST + "/player_photos_2010/no_photo_available.jpg";
function plProfileUrl(playerId, year, leagueId) {
  return PL_HOST + "/" + year + "/player?L=" + leagueId + "&P=" + playerId;
}

const PL_INDEX_CACHE_KEY = "player_ledger_index_v1";
const PL_PLAYER_CACHE_PREFIX = "player_ledger_p_";
const PL_CACHE_TTL_SECONDS = 600; // 10 minutes

// Map the sheets' conference ids (SEC / B10 / B12 / P12 / AAC / ACC) onto the
// client design-system slugs (sec / b1g / big12 / pac / aac / acc). Applied to
// every copy + franchise so grouping and CONF_ACCENT/CONF_ORDER line up.
function plNormConf(raw) {
  const k = String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {
    sec: "sec",
    b10: "b1g", b1g: "b1g", bigten: "b1g", bten: "b1g",
    acc: "acc",
    b12: "big12", big12: "big12", bigtwelve: "big12",
    p12: "pac", pac: "pac", pac12: "pac",
    aac: "aac"
  };
  return map[k] || k || "";
}
const PL_CONF_ORDER = ["sec", "b1g", "acc", "big12", "pac", "aac"];

// ============================================================================
// ROUTING ENTRY POINTS (called from PowerRankingsWebApp.doGet)
// ============================================================================

/**
 * Router for the ledger feed. Returns a ContentService JSON response.
 * @param {Object} e the doGet event (e.parameter.player selects detail mode)
 */
function serveLedgerFeed(e) {
  const cache = CacheService.getScriptCache();
  const playerId = e && e.parameter && e.parameter.player
    ? String(e.parameter.player).trim() : "";
  const nocache = e && e.parameter && e.parameter.nocache;

  if (playerId) {
    const key = PL_PLAYER_CACHE_PREFIX + playerId;
    const hit = cache.get(key);
    if (hit && !nocache) return jsonResponse(hit);
    const body = JSON.stringify(buildPlayerLedger(playerId));
    if (body.length < 90000) cache.put(key, body, PL_CACHE_TTL_SECONDS);
    return jsonResponse(body);
  }

  const hit = cache.get(PL_INDEX_CACHE_KEY);
  if (hit && !nocache) return jsonResponse(hit);
  const body = JSON.stringify(buildLedgerIndex());
  if (body.length < 90000) cache.put(PL_INDEX_CACHE_KEY, body, PL_CACHE_TTL_SECONDS);
  return jsonResponse(body);
}

function clearPlayerLedgerCache() {
  CacheService.getScriptCache().remove(PL_INDEX_CACHE_KEY);
  Logger.log("Player Ledger index cache cleared.");
}

// ============================================================================
// INDEX  (search list)
// ============================================================================

function buildLedgerIndex() {
  const year = Number(getLeagueYear());
  const leagueId = getConfig().mfl.leagueId;

  const copiesByPlayer = plReadCopiesGrouped(); // id -> [copy rows] (authoritative universe + name)
  const rookies = plReadRookieLedger();       // id -> { name, pos, nflTeam, rookieYear } (enrichment)
  const positions = plReadPositions();        // id -> position (Awards fallback)
  const franchises = plBuildFranchises();     // fid -> branding (conf normalized)

  // Universe = players that actually have copies (RookieLedger name cells are
  // often blank, so we key off PlayerCopies and read the name from there).
  const players = Object.keys(copiesByPlayer).map(function (id) {
    const copies = copiesByPlayer[id];
    const r = rookies[id] || {};
    let held = 0, awards = 0;
    copies.forEach(function (c) {
      if (c.currentFid) held += 1;
      awards += c.nationalAwards + c.allConfAwards;
    });
    return {
      id: id,
      name: plToFirstLast(plCopiesName(copies) || r.name || id),
      pos: r.pos || positions[id] || "",
      nflTeam: r.nflTeam || "",
      rookieYear: r.rookieYear || null,
      photo: plPhotoUrl(id, year),
      copies: copies.length,
      held: held,
      fa: copies.length - held,
      awards: awards
    };
  }).sort(function (a, b) {
    // Award winners first, then most copies held, then name.
    return (b.awards - a.awards) || (b.held - a.held) || a.name.localeCompare(b.name);
  });

  const confSet = {};
  Object.keys(copiesByPlayer).forEach(function (id) {
    copiesByPlayer[id].forEach(function (c) { if (c.conf) confSet[c.conf] = true; });
  });
  const conferences = plBuildConferences(confSet);

  return {
    updatedAt: new Date().toISOString(),
    season: year,
    players: players,
    franchises: franchises,
    conferences: conferences
  };
}

// ============================================================================
// DETAIL  (one player's full ledger)
// ============================================================================

function buildPlayerLedger(playerId) {
  const id = String(playerId).trim();
  const year = Number(getLeagueYear());
  const leagueId = getConfig().mfl.leagueId;

  const rookies = plReadRookieLedger();
  const bio = rookies[id] || { name: "", pos: "", nflTeam: "", rookieYear: null };

  const copyRows = (plReadCopiesGrouped()[id] || []);
  const txnsByCopy = plReadTransactionsGrouped(id);     // copyId -> [events sorted]
  const awardsByCopy = plReadAwardsGrouped(id);         // copyId -> [award objs]
  const retsByCopy = plReadRetentionsGrouped(id);       // copyId -> [retention objs]

  // Name comes from PlayerCopies (RookieLedger name is often blank); position
  // falls back to the Awards tab if RookieLedger has none.
  const rawName = plCopiesName(copyRows) || bio.name || id;
  const position = bio.pos || plReadPositions()[id] || "";

  // Assemble each copy: compact events (auction/redshirt/drop) + its own awards.
  const copies = copyRows.map(function (c) {
    const events = (txnsByCopy[c.copyId] || []).map(function (ev) { return ev.tuple; });
    return {
      conf: c.conf, n: c.n, events: events, awards: awardsByCopy[c.copyId] || [],
      declaredEarly: !!c.declaredEarly, declarationYear: c.declarationYear || null,
      retentions: retsByCopy[c.copyId] || []
    };
  }).sort(function (a, b) {
    const ci = PL_CONF_ORDER.indexOf(a.conf) - PL_CONF_ORDER.indexOf(b.conf);
    return ci !== 0 ? ci : (a.n - b.n);
  });

  // Player-level award roll-up for the hero (dedup by kind+name+year).
  const seen = {};
  const playerAwards = [];
  copies.forEach(function (c) {
    c.awards.forEach(function (a) {
      const k = a.kind + "|" + a.name + "|" + a.year;
      if (!seen[k]) { seen[k] = true; playerAwards.push(a); }
    });
  });
  playerAwards.sort(function (a, b) { return (b.year || 0) - (a.year || 0); });

  return {
    id: id,
    name: plToFirstLast(rawName),
    pos: position,
    nflTeam: bio.nflTeam || "",
    entered: bio.rookieYear || year,
    photo: plPhotoUrl(id, year),
    profileUrl: plProfileUrl(id, year, leagueId),
    awards: playerAwards,
    draft: plReadDevyDraft(id, bio.name),
    copies: copies
  };
}

// ============================================================================
// SHEET READERS
// ============================================================================

function plSheet(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

// Header-tolerant column ids (the live sheet's spellings vary from the writer's).
const PL_H_PLAYERID = ["MFL_Player_ID", "MFL Player ID", "MFLPlayerID", "PlayerID", "PlayerId", "Player ID", "MFL_ID"];
const PL_H_NAME     = ["PlayerName", "Player Name", "Name", "Player"];
const PL_H_POS      = ["Position", "Pos"];
const PL_H_TEAM     = ["NFLTeam", "NFL Team", "Team", "NFL_Team"];
const PL_H_YEAR     = ["RookieLeagueYear", "Rookie League Year", "RookieYear", "Year", "LeagueYear"];
const PL_H_COPYID   = ["PlayerCopyID", "Player Copy ID", "CopyId", "CopyID", "Copy ID"];
const PL_H_CONF     = ["Conference", "Conf"];
const PL_H_CURFID   = ["CurrentFranchiseID", "Current Franchise ID", "FranchiseID", "FranchiseId", "Franchise ID"];
const PL_H_NATL     = ["NationalAwards", "National Awards"];
const PL_H_ALLCONF  = ["AllConferenceAwards", "All Conference Awards", "AllConfAwards"];
const PL_H_DECLARED = ["DeclaredEarly", "Declared Early", "Declared"];
const PL_H_DECLYEAR = ["DeclarationYear", "Declaration Year", "DeclareYear"];
const PL_H_RETDEC   = ["Decision", "RetentionDecision", "Retention Decision"];
const PL_H_RETPATH  = ["RetentionPath", "Retention Path", "Path"];
const PL_H_RETCOST  = ["RetentionCost", "Retention Cost", "Cost"];

function plReadRookieLedger() {
  const sheet = plSheet(getConfig().sheets.rookieLedger);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));
  data.slice(1).forEach(function (row) {
    const id = cellStr(row, idx, PL_H_PLAYERID).trim();
    if (!id) return;
    out[id] = {
      id: id,
      name: cellStr(row, idx, PL_H_NAME).trim(),
      pos: cellStr(row, idx, PL_H_POS).trim(),
      nflTeam: cellStr(row, idx, PL_H_TEAM).trim(),
      rookieYear: Number(cellStr(row, idx, PL_H_YEAR)) || null
    };
  });
  return out;
}

// id -> [ { copyId, conf(slug), n, currentFid, name, nationalAwards, allConfAwards } ]
// PlayerCopies is the authoritative source for player identity (name) — the
// RookieLedger name/team columns are often blank, but every copy row carries the
// player's name, so we read it here and treat RookieLedger as enrichment only.
function plReadCopiesGrouped() {
  const sheet = plSheet(getConfig().sheets.playerCopies);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));
  data.slice(1).forEach(function (row) {
    const pid = cellStr(row, idx, PL_H_PLAYERID).trim();
    const copyId = cellStr(row, idx, PL_H_COPYID).trim();
    if (!pid || !copyId) return;
    // Copy ordinal = trailing number of PC-{id}-{conf}-{n}
    const m = copyId.match(/-(\d+)$/);
    if (!out[pid]) out[pid] = [];
    out[pid].push({
      copyId: copyId,
      conf: plNormConf(cellStr(row, idx, PL_H_CONF)),
      n: m ? Number(m[1]) : (out[pid].length + 1),
      currentFid: normalizeId(cellStr(row, idx, PL_H_CURFID)) || "",
      name: cellStr(row, idx, PL_H_NAME).trim(),
      nationalAwards: Number(cellStr(row, idx, PL_H_NATL)) || 0,
      allConfAwards: Number(cellStr(row, idx, PL_H_ALLCONF)) || 0,
      declaredEarly: asBool(cellStr(row, idx, PL_H_DECLARED)),
      declarationYear: Number(cellStr(row, idx, PL_H_DECLYEAR)) || null
    });
  });
  return out;
}

// First non-empty PlayerName across a player's copies.
function plCopiesName(copies) {
  for (var i = 0; i < copies.length; i++) {
    if (copies[i].name) return copies[i].name;
  }
  return "";
}

// Best-effort position from the Awards tab (RookieLedger position may be blank).
// Returns { playerId -> position }.
function plReadPositions() {
  const sheet = plSheet(getConfig().sheets.awards);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));
  if (idx["MFL_Player_ID"] == null || idx["Position"] == null) return out;
  data.slice(1).forEach(function (row) {
    const pid = String(row[idx["MFL_Player_ID"]] || "").trim();
    const pos = String(row[idx["Position"]] || "").trim();
    if (pid && pos && !out[pid]) out[pid] = pos;
  });
  return out;
}

// copyId -> [ { ts, year, tuple } ] sorted chronologically. Only auction / drop /
// redshirt(trad|med) events survive — the ledger UI models exactly those.
function plReadTransactionsGrouped(playerId) {
  const sheet = plSheet("TransactionLog");
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));

  const rows = [];
  data.slice(1).forEach(function (row) {
    if (String(row[idx["PlayerID"]] || "").trim() !== playerId) return;
    const copyId = String(row[idx["CopyAssigned"]] || "").trim();
    if (!copyId) return; // can't attribute to a copy → skip
    const action = String(row[idx["Action"]] || "");
    const type = String(row[idx["Type"]] || "");
    const fid = normalizeId(row[idx["FranchiseID"]]);
    const year = numOrZero(row[idx["Year"]]);
    const bid = numOrZero(row[idx["BidAmount"]]);
    const tsRaw = row[idx["Timestamp"]];
    const ts = tsRaw instanceof Date ? tsRaw.getTime() : (Date.parse(tsRaw) || (year * 1e10));

    let tuple = null;
    if (/Assigned/i.test(action) || type === "AUCTION_WON") {
      tuple = ["auction", year, fid, bid];
    } else if (/Dropped/i.test(action) && !/not owned/i.test(action)) {
      tuple = ["drop", year, fid];
    } else if (/TAXI\s*-\s*Demoted/i.test(action)) {
      tuple = ["redshirt", year, fid, "trad"];
    } else if (/IR\s*-\s*Deactivated/i.test(action)) {
      tuple = ["redshirt", year, fid, "med"];
    }
    if (!tuple) return; // promotions / activations / no-ops don't hit the ledger

    rows.push({ copyId: copyId, ts: ts, year: year, tuple: tuple });
  });

  rows.sort(function (a, b) { return (a.ts - b.ts) || (a.year - b.year); });
  rows.forEach(function (r) {
    if (!out[r.copyId]) out[r.copyId] = [];
    out[r.copyId].push({ ts: r.ts, year: r.year, tuple: r.tuple });
  });
  return out;
}

// copyId -> [ { kind, name, year, conf? } ]
function plReadAwardsGrouped(playerId) {
  const sheet = plSheet(getConfig().sheets.awards);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));
  const rankIdx = idx["Rank"];
  data.slice(1).forEach(function (row) {
    if (String(row[idx["MFL_Player_ID"]] || "").trim() !== playerId) return;
    const copyId = String(row[idx["PlayerCopyID"]] || "").trim();
    if (!copyId) return;
    const awardType = String(row[idx["AwardType"]] || "");
    // National awards (Heisman + National_*) are a shortlist in the sheet — only
    // Rank 1 actually WINS. Shortlisted (Rank > 1) copies must NOT be flagged.
    // All-Conference rows are real 1st/2nd/3rd-team selections, so keep them all.
    const isNational = /^Heisman$/i.test(awardType) || /^National_/i.test(awardType);
    if (isNational && rankIdx != null && (Number(row[rankIdx]) || 0) !== 1) return;
    const award = plMapAward(awardType, numOrZero(row[idx["Year"]]));
    if (!award) return;
    if (!out[copyId]) out[copyId] = [];
    out[copyId].push(award);
  });
  return out;
}

// copyId -> [ { year, decision, path, cost, fid } ] from RetentionHistory
// (the append-only source of truth for retain/release/auto-retain decisions).
function plReadRetentionsGrouped(playerId) {
  const sheet = plSheet(getConfig().sheets.retentionHistory);
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  const idx = headerIndexMap(data[0].map(String));
  const rows = [];
  data.slice(1).forEach(function (row) {
    if (cellStr(row, idx, PL_H_PLAYERID).trim() !== playerId) return;
    const copyId = cellStr(row, idx, PL_H_COPYID).trim();
    if (!copyId) return;
    rows.push({
      copyId: copyId,
      year: Number(cellStr(row, idx, PL_H_YEAR)) || 0,
      decision: cellStr(row, idx, PL_H_RETDEC).trim().toUpperCase(),
      path: cellStr(row, idx, PL_H_RETPATH).trim(),
      cost: Number(cellStr(row, idx, PL_H_RETCOST)) || 0,
      fid: normalizeId(cellStr(row, idx, PL_H_CURFID))
    });
  });
  rows.sort(function (a, b) { return a.year - b.year; });
  rows.forEach(function (r) {
    if (!out[r.copyId]) out[r.copyId] = [];
    out[r.copyId].push({ year: r.year, decision: r.decision, path: r.path, cost: r.cost, fid: r.fid });
  });
  return out;
}

// DevyDraftHistory lives in a separate spreadsheet (DEVY_SHEET_ID script property).
// Returns [] when that sheet isn't reachable — the draft block just won't render.
function plReadDevyDraft(playerId, lastFirstName) {
  let sheet = plSheet("DevyDraftHistory");
  if (!sheet) {
    const devyId = PropertiesService.getScriptProperties().getProperty("DEVY_SHEET_ID");
    if (devyId) {
      try { sheet = SpreadsheetApp.openById(devyId).getSheetByName("DevyDraftHistory"); }
      catch (err) { Logger.log("PlayerLedger: cannot open DEVY_SHEET_ID — " + err); return []; }
    }
  }
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const idx = headerIndexMap(data[0].map(String));
  const nameKey = String(lastFirstName || "").trim().toLowerCase();
  const out = [];
  data.slice(1).forEach(function (row) {
    const pid = String(row[idx["PlayerID"]] || "").trim();
    const rowName = String(row[idx["PlayerName"]] || "").trim().toLowerCase();
    if (pid !== playerId && (!nameKey || rowName !== nameKey)) return;
    out.push({
      year: numOrZero(row[idx["Year"]]),
      conf: plNormConf(row[idx["Conference"]]),
      round: numOrZero(row[idx["Round"]]),
      pick: numOrZero(row[idx["Pick"]]),
      overall: numOrZero(row[idx["OverallPick"]]),
      fid: normalizeId(row[idx["FranchiseID"]]),
      teamName: String(row[idx["TeamName"]] || "").trim()
    });
  });
  out.sort(function (a, b) { return (a.year - b.year) || (a.overall - b.overall); });
  return out;
}

// ============================================================================
// FRANCHISE / CONFERENCE BRANDING
// ============================================================================

function plBuildFranchises() {
  const raw = readFranchiseLookup(); // fid -> { name, abbr, conf, owner, bg, fg, logo }
  const out = {};
  Object.keys(raw).forEach(function (fid) {
    const m = raw[fid];
    out[fid] = {
      name: m.name || fid,
      abbr: m.abbr || fid,
      owner: m.owner ? (m.owner.charAt(0) === "@" ? m.owner : "@" + m.owner) : "",
      conf: plNormConf(m.conf),
      bg: m.bg || "#2A2A2A",
      fg: m.fg || "#FFFFFF",
      pill: m.logo || null
    };
  });
  return out;
}

function plBuildConferences(confSet) {
  const ids = PL_CONF_ORDER.filter(function (c) { return confSet[c]; })
    .concat(Object.keys(confSet).filter(function (c) { return PL_CONF_ORDER.indexOf(c) < 0; }));
  return ids.map(function (id) {
    return { id: id, name: confPrettyName(id), logo: (CONFERENCE_LOGOS[id] || null) };
  });
}

// ============================================================================
// AWARD MAPPING
// ============================================================================

// AwardType → the client's award vocabulary { kind, name, year, conf? }.
//   Heisman            → heisman
//   National_QB|RB|... → allamerican (laurel glyph), name "National QB"
//   AllConf_SEC_1st    → allamerican, name "SEC 1st Team", conf slug
//   CoachOfYear        → null (a coach award, not a player award)
function plMapAward(awardType, year) {
  const t = String(awardType || "").trim();
  if (!t) return null;
  if (/^Heisman$/i.test(t)) return { kind: "heisman", name: "Heisman", year: year };
  if (/^National_/i.test(t)) {
    const grp = t.replace(/^National_/i, "").replace(/_/g, "/");
    return { kind: "allamerican", name: "National " + grp, year: year };
  }
  if (/^AllConf_/i.test(t)) {
    const parts = t.split("_"); // AllConf, {CONF}, {ordinal}
    const conf = plNormConf(parts[1] || "");
    const ord = (parts[2] || "").replace(/[^0-9a-z]/gi, "");
    return {
      kind: "allamerican",
      name: (confPrettyName(conf) || (parts[1] || "")) + " " + ord + " Team",
      year: year,
      conf: conf
    };
  }
  return null; // CoachOfYear and anything unrecognized
}

// ============================================================================
// NAME HELPERS
// ============================================================================

// RookieLedger stores "Last, First TEAM POS" — convert to "First Last".
function plToFirstLast(name) {
  const s = String(name || "").trim();
  const comma = s.indexOf(",");
  if (comma < 0) return s;
  const last = s.slice(0, comma).trim();
  // strip trailing " TEAM POS" from the first-name half
  const rest = s.slice(comma + 1).trim().split(/\s+/);
  const first = rest.length ? rest[0] : "";
  return (first + " " + last).trim();
}

// ============================================================================
// LOCAL TESTS (run from the editor)
// ============================================================================

function testBuildLedgerIndex() {
  const p = buildLedgerIndex();
  const body = JSON.stringify(p);
  Logger.log("Season: " + p.season + "  Players: " + p.players.length);
  Logger.log("Franchises: " + Object.keys(p.franchises).length +
    "  Conferences: " + p.conferences.length);
  Logger.log("Index payload size: " + body.length + " bytes");
  if (p.players[0]) Logger.log("Top player: " + JSON.stringify(p.players[0], null, 2));
}

function testBuildPlayerLedger(playerId) {
  const p = buildPlayerLedger(playerId || (buildLedgerIndex().players[0] || {}).id);
  Logger.log("Player: " + p.name + " (" + p.id + ")  copies: " + p.copies.length);
  Logger.log("Awards: " + p.awards.length + "  Draft rows: " + p.draft.length);
  Logger.log(JSON.stringify(p, null, 2));
}
