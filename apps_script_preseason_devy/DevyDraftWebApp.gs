/**
 * DevyDraftWebApp.gs — Public web endpoint for the Devy Draft MFL Home Page
 * Message widget AND the single writer for all pick/retention actions.
 *
 * Lives in the SAME Apps Script project as DevyDraft.gs (bound to the Devy
 * spreadsheet), so it calls the in-project engine functions directly:
 *   getCurrentDevyPick, makeDevyPick, makeDevyMakeupPick, skipDevyCurrentPick,
 *   autoPickExpiredDevySkips, retainDevyPlayer, releaseRetainedPlayer,
 *   startDevyDraft, getAvailableDevyPlayers, getOwedDevySlots, getDevyCyclePhase …
 *
 * SINGLE WRITER (Part 5.1): the widget and the Discord bot both POST here. Every
 * write is serialized with LockService and re-validated server-side, so two
 * simultaneous actions (two tabs, widget + bot, or the watcher's auto-skip) can
 * never both commit. Reads (?feed=devy) are cached briefly.
 *
 * Deploy:
 *   Apps Script editor -> Deploy -> New deployment
 *   Type: Web app | Execute as: Me | Who has access: Anyone
 *   Copy the /exec URL into the widget's WEBAPP_URL (or build-devy-draft.js).
 *   Redeploy after every edit (deployments are frozen at deploy time). This is a
 *   SEPARATE deployment from the league web app — it is bound to the Devy sheet.
 */

var DEVY_FEED_CACHE_TTL = 20;      // seconds; the draft is live, keep it short
var DEVY_PAST_YEARS      = 3;      // prior seasons included in the Past tab
var DEVY_LOCK_WAIT_MS    = 10000;  // how long a write waits for the lock

// Presentation labels for conference codes (colors/logos stay in the widget).
var DEVY_CONF_LABELS = {
  SEC: "SEC", B1G: "Big Ten", B10: "Big Ten", ACC: "ACC",
  B12: "Big 12", BIG12: "Big 12", P12: "Pac-12", PAC: "Pac-12", AAC: "AAC"
};

// ============================================================================
// HTTP ENTRY POINTS
// ============================================================================

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.feed && p.feed !== "devy") {
      return devyJsonOut({ error: "Unknown feed: " + p.feed });
    }
    var fid4 = p.fid ? devyPad4(p.fid) : "";
    var cache = CacheService.getScriptCache();
    var key = "devy_feed_" + (fid4 || "anon");
    if (!p.nocache) {
      var hit = cache.get(key);
      if (hit) return devyJsonOut(JSON.parse(hit));
    }
    var payload = buildDevyFeed(fid4);
    var body = JSON.stringify(payload);
    if (body.length < 90000) cache.put(key, body, DEVY_FEED_CACHE_TTL);
    return devyJsonOut(payload);
  } catch (err) {
    return devyJsonOut({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(DEVY_LOCK_WAIT_MS);
  } catch (lockErr) {
    return devyJsonOut({ success: false, message: "Another action is in progress — please retry." });
  }
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
    catch (parseErr) { return devyJsonOut({ success: false, message: "Bad request body." }); }

    var action = body.action;
    var conf = body.conference ? String(body.conference).toUpperCase() : null;
    var fid3 = body.franchiseId != null && body.franchiseId !== "" ? devyPad3(body.franchiseId) : null;
    var result;

    switch (action) {
      case "pick":     result = devyWebPick(conf, fid3, body.playerId); break;
      case "retain":   result = devyWebRetain(conf, fid3, body.playerId); break;
      case "release":  result = devyWebRelease(conf, fid3, body.playerId); break;
      // Internal actions the bot watcher calls (also serialized under the lock).
      case "skip":     result = skipDevyCurrentPick(conf); break;
      case "autopick": result = autoPickExpiredDevySkips(conf); break;
      case "start":    result = startDevyDraft(conf); break;
      default:         result = { success: false, message: "Unknown action: " + action };
    }

    // Bust this viewer's cached feed so the widget's next GET is fresh.
    if (result && result.success && fid3) {
      try { CacheService.getScriptCache().remove("devy_feed_" + devyPad4(fid3)); } catch (ignore) {}
    }
    return devyJsonOut(result);
  } catch (err) {
    return devyJsonOut({ success: false, message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// WRITE HANDLERS (single writer — always inside the doPost lock)
// ============================================================================

/**
 * Pick: normal on-the-clock pick, or a make-up pick for an owed slot. The engine
 * functions re-validate turn / availability / ownership immediately before write.
 */
function devyWebPick(conference, fid3, playerId) {
  if (!conference || !fid3 || !playerId) {
    return { success: false, message: "Missing conference, franchiseId, or playerId." };
  }
  var current = getCurrentDevyPick(conference);
  if (current.success && current.franchiseId === fid3) {
    return makeDevyPick(conference, fid3, playerId); // validates turn + advances
  }
  // Not on the clock — only allowed if they own an owed (SKIPPED) make-up slot.
  return makeDevyMakeupPick(conference, fid3, playerId);
}

/** Retain: only while the retention window is open, only your own player. */
function devyWebRetain(conference, fid3, playerId) {
  if (!fid3 || !playerId) return { success: false, message: "Missing franchiseId or playerId." };
  if (getDevyCyclePhase() !== "RETENTION_OPEN") {
    return { success: false, message: "Retention window is closed." };
  }
  var owner = devyOwnerOf(playerId);
  if (owner !== fid3) return { success: false, message: "That player is not on your roster." };
  var year = Number(getDevyDraftSetting("DraftYear"));
  return retainDevyPlayer(playerId, fid3, year);
}

/** Release: only while the retention window is open, only your own player. */
function devyWebRelease(conference, fid3, playerId) {
  if (!fid3 || !playerId) return { success: false, message: "Missing franchiseId or playerId." };
  if (getDevyCyclePhase() !== "RETENTION_OPEN") {
    return { success: false, message: "Retention window is closed." };
  }
  var owner = devyOwnerOf(playerId);
  if (owner !== fid3) return { success: false, message: "That player is not on your roster." };
  var year = Number(getDevyDraftSetting("DraftYear"));
  return releaseRetainedPlayer(playerId, year);
}

/** Current 3-digit owner (Retained or Drafted) of a pool player, or null. */
function devyOwnerOf(playerId) {
  var sheet = getDevyPlayerPoolSheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  for (var i = 1; i < data.length; i++) {
    if (data[i][c["PlayerID"]] === playerId) {
      var status = data[i][c["Status"]];
      var raw = status === "Retained" ? data[i][c["RetainedBy"]] : data[i][c["DraftedBy"]];
      return raw ? devyPad3(raw) : null;
    }
  }
  return null;
}

// ============================================================================
// FEED BUILDER (?feed=devy)
// ============================================================================

function buildDevyFeed(fid4) {
  var settings = getAllDevyDraftSettings();
  var draftYear = Number(settings["DraftYear"]) || (new Date().getFullYear());
  var fid3 = fid4 ? devyPad3(fid4) : null;

  var teams = devyReadTeams();
  var confCodes = getAllConferences();
  var retainedMap = devyRetainedMap(draftYear); // playerId -> consecutiveYear (RETAIN rows)

  var conferences = confCodes.map(function (code) {
    var current = getCurrentDevyPick(code);
    return {
      id: code,
      label: DEVY_CONF_LABELS[code] || code,
      status: getDevyConfStatus(code),
      order: devyReadOrder(code, draftYear),
      current: current && current.success ? {
        round: current.round, pick: current.pick, overallPick: current.overallPick,
        franchiseId: devyPad4(current.franchiseId), teamName: current.teamName,
        pickDeadline: current.pickDeadline
      } : null,
      picks: devyReadPicks(code, draftYear, retainedMap),
      owed: getOwedDevySlots(code, draftYear).map(function (s) {
        return {
          round: s.round, pick: s.pick, overallPick: s.overallPick,
          franchiseId: devyPad4(s.franchiseId), teamName: s.teamName, skippedAt: s.skippedAt
        };
      }),
      pool: devyReadPool(code)
    };
  });

  var viewer = null;
  if (fid3) {
    var vConf = teams[fid4] ? teams[fid4].conference : null;
    var onClock = false;
    var owedSlots = [];
    if (vConf) {
      var cur = getCurrentDevyPick(vConf);
      onClock = !!(cur && cur.success && cur.franchiseId === fid3);
      owedSlots = getOwedDevySlots(vConf, draftYear)
        .filter(function (s) { return s.franchiseId === fid3; })
        .map(function (s) { return { round: s.round, pick: s.pick, overallPick: s.overallPick }; });
    }
    viewer = {
      franchiseId: fid4,
      conference: vConf,
      onClock: onClock,
      owedSlots: owedSlots,
      roster: devyViewerRoster(fid3),
      retentionWorklist: devyRetentionWorklist(fid3, draftYear)
    };
  }

  return {
    season: draftYear,
    settings: {
      draftYear: draftYear,
      cyclePhase: settings["CyclePhase"] || "not_started",
      cyclePhaseLabel: settings["CyclePhaseLabel"] || "Not started",
      cyclePhaseUpdated: settings["CyclePhaseUpdated"] || "",
      clockHours: Number(settings["PickDeadlineHours"]) || 24,
      skipGraceHours: Number(settings["SkipGraceHours"]) || 24,
      totalRounds: Number(settings["TotalRounds"]) || 2,
      maxRetained: 2,
      baseRebate: 20,
      rebateStep: 5,
      slotOrder: [2, 1] // 1st retention spends Round 2, 2nd spends Round 1
    },
    teams: teams,
    conferences: conferences,
    viewer: viewer,
    past: devyReadPast(draftYear)
  };
}

// ============================================================================
// FEED READERS
// ============================================================================

function devyReadTeams() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Teams");
  var teams = {};
  if (!sheet) return teams;
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[String(h).trim()] = i; });
  function col(row, names) {
    for (var i = 0; i < names.length; i++) if (c[names[i]] !== undefined) return row[c[names[i]]];
    return "";
  }
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var idRaw = col(row, ["Franchise ID", "FranchiseID", "Franchise Id"]);
    if (idRaw === "" || idRaw == null) continue;
    var fid4 = devyPad4(idRaw);
    var name = col(row, ["Team Name", "TeamName", "Name"]) || "";
    teams[fid4] = {
      franchiseId: fid4,
      name: name,
      abbr: col(row, ["Abbreviation", "Abbr", "TeamAbbr"]) || devyDeriveAbbr(name),
      conference: String(col(row, ["Conference"]) || "").toUpperCase(),
      owner: col(row, ["Coach Name", "Owner", "Manager"]) || "",
      ownerDiscordId: String(col(row, ["Owner Discord ID", "Owner Discord Id", "DiscordID"]) || ""),
      emoji: col(row, ["Emoji"]) || "",
      color: col(row, ["Primary Color", "PrimaryColor", "Color", "BG"]) || "",
      txt: col(row, ["Secondary Color", "TextColor", "FG"]) || "",
      logo: col(row, ["Logo", "Logo URL", "LogoURL", "Franchise Logo"]) || ""
    };
  }
  return teams;
}

function devyReadOrder(conference, year) {
  var sheet = getDevyDraftOrderSheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  var order = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (Number(row[c["Year"]]) !== Number(year) || row[c["Conference"]] !== conference) continue;
    order.push({
      round: row[c["Round"]], pick: row[c["Pick"]], overallPick: row[c["OverallPick"]],
      franchiseId: devyPad4(row[c["FranchiseID"]]), teamName: row[c["TeamName"]],
      previousYearStanding: row[c["PreviousYearStanding"]]
    });
  }
  return order.sort(function (a, b) { return a.overallPick - b.overallPick; });
}

function devyReadPicks(conference, year, retainedMap) {
  retainedMap = retainedMap || {};
  var sheet = getDevyDraftHistorySheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  var picks = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (Number(row[c["Year"]]) !== Number(year) || row[c["Conference"]] !== conference) continue;
    var pid = row[c["PlayerID"]];
    var owed = pid === DEVY_SKIPPED_PLAYER_ID;
    picks.push({
      round: row[c["Round"]], pick: row[c["Pick"]], overallPick: row[c["OverallPick"]],
      franchiseId: devyPad4(row[c["FranchiseID"]]), teamName: row[c["TeamName"]],
      playerId: owed ? null : pid,
      player: owed ? null : ((row[c["PlayerFirstName"]] || "") + " " + (row[c["PlayerLastName"]] || "")).trim(),
      position: owed ? null : row[c["PlayerPosition"]],
      owed: owed,
      retention: owed ? 0 : (retainedMap[pid] || 0), // consecutive year if this was a retention pre-fill
      timestamp: row[c["Timestamp"]]
    });
  }
  return picks.sort(function (a, b) { return a.overallPick - b.overallPick; });
}

/** playerId -> consecutiveYear for RETAIN rows in the given year (for board tags). */
function devyRetainedMap(year) {
  var sheet = getDevyRetentionHistorySheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (Number(row[c["Year"]]) !== Number(year)) continue;
    if (String(row[c["Decision"]] || "RETAIN").toUpperCase() !== "RETAIN") continue;
    map[row[c["PlayerID"]]] = row[c["ConsecutiveYear"]] || 1;
  }
  return map;
}

function devyReadPool(conference) {
  // getAvailableDevyPlayers returns pool rows in sheet order, which the KTC
  // import writes in ranking order — so array index is the "best available" rank.
  // It also returns Retained (owned, pre-slotted) players; exclude those from the
  // draftable pool the widget shows.
  var players = getAvailableDevyPlayers(conference).filter(function (p) { return p.status === "Available"; });
  return players.map(function (p, i) {
    return {
      playerId: p.playerId, name: (p.firstName + " " + p.lastName).trim(),
      firstName: p.firstName, lastName: p.lastName, pos: p.position,
      year: p.year, rank: i + 1, status: p.status
    };
  });
}

function devyViewerRoster(fid3) {
  var sheet = getDevyPlayerPoolSheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  var roster = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = row[c["Status"]];
    var owner = null;
    if (status === "Retained") owner = row[c["RetainedBy"]];
    else if (status === "Drafted") owner = row[c["DraftedBy"]];
    if (!owner || devyPad3(owner) !== fid3) continue;
    roster.push({
      playerId: row[c["PlayerID"]],
      name: (row[c["FirstName"]] + " " + row[c["LastName"]]).trim(),
      pos: row[c["Position"]],
      conference: row[c["Conference"]],
      status: status,
      retained: status === "Retained",
      drafted: status === "Drafted",
      retentionYear: row[c["RetentionYear"]] || null
    });
  }
  return roster;
}

function devyRetentionWorklist(fid3, year) {
  var sheet = getDevyRetentionHistorySheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (Number(row[c["Year"]]) !== Number(year)) continue;
    if (devyPad3(row[c["FranchiseID"]]) !== fid3) continue;
    list.push({
      playerId: row[c["PlayerID"]],
      name: (row[c["PlayerFirstName"]] + " " + row[c["PlayerLastName"]]).trim(),
      pos: row[c["PlayerPosition"]],
      conference: row[c["Conference"]],
      decision: String(row[c["Decision"]] || "RETAIN").toUpperCase(),
      consecutiveYear: row[c["ConsecutiveYear"]],
      pickUsed: row[c["PickUsed"]],
      rebateRemaining: row[c["RebateRemaining"]]
    });
  }
  return list;
}

function devyReadPast(currentYear) {
  var sheet = getDevyDraftHistorySheet();
  var data = sheet.getDataRange().getValues();
  var c = {};
  data[0].forEach(function (h, i) { c[h] = i; });

  // Distinct prior years, newest first, capped.
  var yearsSet = {};
  for (var i = 1; i < data.length; i++) {
    var y = Number(data[i][c["Year"]]);
    if (y && y < currentYear) yearsSet[y] = true;
  }
  var years = Object.keys(yearsSet).map(Number).sort(function (a, b) { return b - a; }).slice(0, DEVY_PAST_YEARS);

  return years.map(function (y) {
    var byConf = {};
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (Number(row[c["Year"]]) !== y) continue;
      var conf = row[c["Conference"]];
      var pid = row[c["PlayerID"]];
      if (pid === DEVY_SKIPPED_PLAYER_ID) continue; // never surface unresolved skips
      (byConf[conf] = byConf[conf] || []).push({
        round: row[c["Round"]], pick: row[c["Pick"]], overallPick: row[c["OverallPick"]],
        franchiseId: devyPad4(row[c["FranchiseID"]]), teamName: row[c["TeamName"]],
        player: ((row[c["PlayerFirstName"]] || "") + " " + (row[c["PlayerLastName"]] || "")).trim(),
        position: row[c["PlayerPosition"]]
      });
    }
    var conferences = Object.keys(byConf).map(function (conf) {
      return {
        id: conf,
        label: DEVY_CONF_LABELS[conf] || conf,
        picks: byConf[conf].sort(function (a, b) { return a.overallPick - b.overallPick; })
      };
    });
    return { year: y, conferences: conferences };
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function devyJsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Sheet/engine ids are 3-digit; MFL's franchise_id global + the widget are
// 4-digit. Normalize at this boundary (Number() strips leading zeros first so
// "0005" and "005" and 5 all collapse correctly).
function devyPad3(x) { var n = Number(x); return isNaN(n) ? String(x) : String(n).padStart(3, "0"); }
function devyPad4(x) { var n = Number(x); return isNaN(n) ? String(x) : String(n).padStart(4, "0"); }

function devyDeriveAbbr(name) {
  name = String(name || "").trim();
  if (!name) return "";
  var words = name.split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 4).toUpperCase();
  return words.map(function (w) { return w[0]; }).join("").substring(0, 4).toUpperCase();
}
