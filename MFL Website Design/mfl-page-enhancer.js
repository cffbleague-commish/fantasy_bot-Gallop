/**
 * mfl-page-enhancer.js — CFFB MFL Page Enhancer
 *
 * Detects MFL page type, parses encoded eligibility/contract strings,
 * and replaces raw text with styled .player-card components.
 *
 * Ownership reconciliation:
 *   MFL's live roster data is the source of truth for who currently
 *   owns a player.  The encoded string's owner is used for rendering
 *   only when MFL ownership can't be determined from the page context.
 *   Drift indicators (commissioner-only) flag stale encoded strings.
 *
 * Parser logic (parseCopy / parseModifierSegment) is inlined from
 * mfl-player-parser.js so the script is fully self-contained.
 * If the parser changes, update both files.
 *
 * Loaded via an MFL home page message <script> tag.
 * Requires mfl-custom.css for visual styles.
 */
(function () {
  "use strict";

  // Guard: never run twice
  if (window.__CFFB_ENHANCER_LOADED) return;
  window.__CFFB_ENHANCER_LOADED = true;

  var LOG_PREFIX = "[CFFB]";

  // ==================================================================
  //  UNICODE CHARACTERS (safe in any source encoding)
  // ==================================================================

  var CHR_SHIELD = "\uD83D\uDEE1"; // shield emoji
  var CHR_ARROW  = "\u2197";        // north-east arrow
  var CHR_STAR   = "\u2605";        // filled star
  var CHR_TIMES  = "\u00D7";        // multiplication sign
  var CHR_RSQUO  = "\u2019";        // right single quote

  // ==================================================================
  //  PARSER — inlined from mfl-player-parser.js
  // ==================================================================

  var VALID_ELIGIBILITY = new Set(["FR", "SO", "JR", "SR", "GR"]);
  var OWNER_RE = /^(?:FA|[A-Z]{2,4})$/;

  function parseModifierSegment(segment, result) {
    var i = 0;
    while (i < segment.length) {
      var ch = segment[i];

      if (ch === "E") {
        if (result.isEarlyDeclare) {
          return 'duplicate early-declare flag in "' + segment + '"';
        }
        result.isEarlyDeclare = true;
        i++;
      } else if (ch === "r" || ch === "m") {
        var yearStr = segment.slice(i + 1, i + 3);
        if (!/^\d{2}$/.test(yearStr)) {
          return "expected two-digit year after '" + ch + "' in \"" + segment + '"';
        }
        var year = parseInt(yearStr, 10);
        if (ch === "r") {
          if (result.redshirt) {
            return 'duplicate traditional redshirt in "' + segment + '"';
          }
          result.redshirt = { type: "traditional", year: year };
        } else {
          if (result.medicalRedshirt) {
            return 'duplicate medical redshirt in "' + segment + '"';
          }
          result.medicalRedshirt = { year: year };
        }
        if (
          result.redshirt &&
          result.medicalRedshirt &&
          result.redshirt.year === result.medicalRedshirt.year
        ) {
          return "traditional and medical redshirt cannot share the same year (" + year + ")";
        }
        i += 3;
      } else if (ch === "N" || ch === "A") {
        var rest = segment.slice(i + 1);
        var numMatch = rest.match(/^(\d+)/);
        var count;
        if (numMatch) {
          count = parseInt(numMatch[1], 10);
          if (count <= 0) {
            return "award count must be positive, got " + count + ' in "' + segment + '"';
          }
          i += 1 + numMatch[1].length;
        } else {
          count = 1;
          i += 1;
        }
        if (ch === "N") {
          if (result.awards.national > 0) {
            return 'duplicate national award in "' + segment + '"';
          }
          result.awards.national = count;
        } else {
          if (result.awards.allConference > 0) {
            return 'duplicate all-conference award in "' + segment + '"';
          }
          result.awards.allConference = count;
        }
      } else {
        return "unexpected character '" + ch + "' in modifier segment \"" + segment + '"';
      }
    }
    return null;
  }

  function parseCopy(copyString) {
    if (typeof copyString !== "string" || copyString.trim() === "") {
      return { error: "copy string is empty or not a string", raw: copyString };
    }
    var raw = copyString.trim();
    var parts = raw.split("_");
    if (parts.length < 2) {
      return { error: "expected at least OWNER_ELIGIBILITY", raw: raw };
    }
    var ownerRaw = parts[0];
    var eligRaw = parts[1];
    if (!OWNER_RE.test(ownerRaw)) {
      return { error: 'invalid owner code "' + ownerRaw + '"', raw: raw };
    }
    if (!VALID_ELIGIBILITY.has(eligRaw)) {
      return { error: 'invalid eligibility "' + eligRaw + '"', raw: raw };
    }
    var result = {
      owner: ownerRaw,
      isFreeAgent: ownerRaw === "FA",
      eligibility: eligRaw,
      isEarlyDeclare: false,
      redshirt: null,
      medicalRedshirt: null,
      awards: { national: 0, allConference: 0 },
    };
    for (var idx = 2; idx < parts.length; idx++) {
      var segment = parts[idx];
      if (segment === "") {
        return { error: "empty modifier segment (double underscore?)", raw: raw };
      }
      var err = parseModifierSegment(segment, result);
      if (err) {
        return { error: err, raw: raw };
      }
    }
    return result;
  }

  // ==================================================================
  //  TEAM COLORS — college primary/secondary for tag backgrounds
  // ==================================================================

  var TEAM_COLORS = {
    BC:   { bg: "#8C2332", fg: "#F5F5F5", border: "#8C2332", name: "Boston College Eagles" },
    CLEM: { bg: "#F56600", fg: "#FFFFFF", border: "#522D80", name: "Clemson Tigers" },
    CONN: { bg: "#000E2F", fg: "#F5F5F5", border: "#000E2F", name: "UConn Huskies" },
    DUKE: { bg: "#003087", fg: "#FFFFFF", border: "#003087", name: "Duke Blue Devils" },
    FSU:  { bg: "#782F40", fg: "#CEB888", border: "#782F40", name: "Florida State Seminoles" },
    GT:   { bg: "#B3A369", fg: "#003057", border: "#003057", name: "Georgia Tech Yellow Jackets" },
    IU:   { bg: "#990000", fg: "#F5F5F5", border: "#990000", name: "Indiana Hoosiers" },
    KSU:  { bg: "#231F20", fg: "#FDBB30", border: "#FDBB30", name: "Kennesaw State Owls" },
    LOU:  { bg: "#AD0000", fg: "#F5F5F5", border: "#AD0000", name: "Louisville Cardinals" },
    MIA:  { bg: "#F47321", fg: "#FFFFFF", border: "#005030", name: "Miami Hurricanes" },
    MICH: { bg: "#00274C", fg: "#FFCB05", border: "#00274C", name: "Michigan Wolverines" },
    MINN: { bg: "#7A0019", fg: "#FFCC33", border: "#7A0019", name: "Minnesota Golden Gophers" },
    NCSU: { bg: "#CC0000", fg: "#FFFFFF", border: "#CC0000", name: "NC State Wolfpack" },
    OSU:  { bg: "#BB0000", fg: "#F5F5F5", border: "#666666", name: "Ohio State Buckeyes" },
    PITT: { bg: "#003594", fg: "#FFB81C", border: "#003594", name: "Pittsburgh Panthers" },
    PUR:  { bg: "#000000", fg: "#CEB888", border: "#CEB888", name: "Purdue Boilermakers" },
    SYR:  { bg: "#F76900", fg: "#FFFFFF", border: "#F76900", name: "Syracuse Orange" },
    UCF:  { bg: "#000000", fg: "#FFC904", border: "#FFC904", name: "UCF Knights" },
    UVA:  { bg: "#232D4B", fg: "#F84C1E", border: "#232D4B", name: "Virginia Cavaliers" },
    VT:   { bg: "#630031", fg: "#FF6600", border: "#630031", name: "Virginia Tech Hokies" },
    WF:   { bg: "#9E7E38", fg: "#000000", border: "#000000", name: "Wake Forest Demon Deacons" },
  };

  // Reverse lookup: franchise display name → team code
  var FRANCHISE_NAME_TO_CODE = {};
  (function () {
    for (var code in TEAM_COLORS) {
      if (TEAM_COLORS.hasOwnProperty(code)) {
        FRANCHISE_NAME_TO_CODE[TEAM_COLORS[code].name] = code;
      }
    }
  })();

  // ==================================================================
  //  NATIONAL AWARD MAPPING
  // ==================================================================

  function resolveNationalAward(position) {
    if (!position) return "National Award";
    switch (position.toLowerCase()) {
      case "qb": return "Davey O" + CHR_RSQUO + "Brien Award";
      case "rb": return "Doak Walker Award";
      case "wr":
      case "te": return "Biletnikoff Award";
      default:   return "National Award";
    }
  }

  // ==================================================================
  //  ELIGIBILITY LABELS
  // ==================================================================

  var ELIG_LABELS = {
    FR: "Freshman",
    SO: "Sophomore",
    JR: "Junior",
    SR: "Senior",
    GR: "Graduate",
  };

  // ==================================================================
  //  COMMISSIONER DETECTION
  //  Checks multiple signals; any one is sufficient.
  // ==================================================================

  var _isCommishCached = null;

  function isCommissioner() {
    if (_isCommishCached !== null) return _isCommishCached;
    try {
      // Signal 1: franchise_id global set to '0000' (commissioner pseudo-franchise)
      if (window.franchise_id === "0000") {
        _isCommishCached = true;
        return true;
      }
      // Signal 2: commissioner_setup link in navigation
      if (document.querySelector('a[href*="commissioner_setup"]')) {
        _isCommishCached = true;
        return true;
      }
      // Signal 3: welcome text contains "Commissioner"
      var welcome = document.querySelector("td.welcome b");
      if (welcome && /Commissioner/i.test(welcome.textContent)) {
        _isCommishCached = true;
        return true;
      }
    } catch (e) {
      // Defensive — if DOM query fails, assume not commissioner
    }
    _isCommishCached = false;
    return false;
  }

  // ==================================================================
  //  FRANCHISE CODE RESOLUTION
  //  Converts franchise identifiers from the DOM into team codes.
  // ==================================================================

  /**
   * Look up a franchise code from the MFL franchiseDatabase global.
   * @param {string} franchiseId - 4-digit MFL franchise ID (e.g. "0001")
   * @returns {string|null} Team code like "BC", or null
   */
  function getFranchiseCodeFromDb(franchiseId) {
    try {
      if (!window.franchiseDatabase) return null;
      var entry = window.franchiseDatabase["fid_" + franchiseId];
      if (!entry) return null;
      // MFL Franchise constructor stores short code as .abbrev
      return entry.abbrev || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Determine the franchise team code from a roster table element.
   * Tries: franchise database (via table class), then caption name lookup.
   */
  function getFranchiseCodeFromTable(table) {
    // Try 1: Extract franchise ID from table class → look up in DB
    var classMatch = (table.className || "").match(/franchise_(\d+)/);
    if (classMatch) {
      var dbCode = getFranchiseCodeFromDb(classMatch[1]);
      if (dbCode) return dbCode;
    }

    // Try 2: Read franchise name from caption → reverse-map
    var captionLink = table.querySelector("caption a");
    if (captionLink) {
      var name = captionLink.textContent.trim();
      var code = FRANCHISE_NAME_TO_CODE[name];
      if (code) return code;
    }

    return null;
  }

  // ==================================================================
  //  POSITION EXTRACTION
  // ==================================================================

  function extractPosition(linkEl) {
    if (!linkEl) return null;
    var m = (linkEl.className || "").match(/position_(\w+)/);
    return m ? m[1] : null;
  }

  function extractPositionFromProfile() {
    var title = document.title || "";
    var m = title.match(/\b(QB|RB|WR|TE|PK|K|DEF|DL|LB|DB|S|CB)\s*$/i);
    return m ? m[1].toLowerCase() : null;
  }

  // ==================================================================
  //  OWNERSHIP DRIFT COMPUTATION (pure logic, no DOM)
  //
  //  Compares a single copy's encoded owner against MFL's page-level
  //  ownership signal.  Uses the other copy's encoded owner as
  //  context on roster pages (to distinguish "other conference copy"
  //  from genuine drift).
  //
  //  Returns: { type, encodedOwner, mflOwner, reason }
  //    type: null (no drift), "dropped", "picked-up", "traded", "fallback"
  // ==================================================================

  function computeCopyDrift(encodedOwner, otherCopyEncodedOwner, mflOwner) {
    // No MFL signal → can't compare → fallback
    if (!mflOwner) {
      return { type: "fallback", encodedOwner: encodedOwner, mflOwner: null,
               reason: "MFL ownership could not be determined from this page" };
    }

    // --- FA page: MFL says player is free agent ---
    if (mflOwner === "FA") {
      if (!encodedOwner || encodedOwner === "FA") return { type: null };
      // Encoded says rostered, MFL says FA → dropped
      return { type: "dropped", encodedOwner: encodedOwner, mflOwner: "FA" };
    }

    // --- Roster page: MFL says player is on franchise mflOwner ---
    if (encodedOwner === mflOwner) return { type: null }; // match

    // This copy doesn't match the roster franchise.
    // If the OTHER copy matches, this is the "other conference copy" —
    // we can't verify its ownership from this page.
    if (otherCopyEncodedOwner === mflOwner) {
      return { type: "fallback", encodedOwner: encodedOwner, mflOwner: mflOwner,
               reason: "Other conference copy; ownership not verifiable from this page" };
    }

    // NEITHER copy matches the roster franchise → both are stale.
    if (!encodedOwner || encodedOwner === "FA") {
      return { type: "picked-up", encodedOwner: encodedOwner || "FA", mflOwner: mflOwner };
    }
    return { type: "traded", encodedOwner: encodedOwner, mflOwner: mflOwner };
  }

  /**
   * Given drift info, determine the rendering owner.
   * MFL owner takes precedence when drift is detected; encoded owner
   * is used when there's no drift or when we're in fallback.
   */
  function resolveRenderingOwner(encodedOwner, drift) {
    if (!drift || !drift.type) return encodedOwner; // no drift, use encoded
    if (drift.type === "fallback") return encodedOwner; // can't determine, use encoded
    // For dropped/picked-up/traded, MFL is the source of truth
    return drift.mflOwner || encodedOwner;
  }

  // ==================================================================
  //  RENDERER — builds a .player-card element
  //
  //  @param parsed    - output of parseCopy()
  //  @param position  - player position string (e.g. "qb")
  //  @param ownerOverride - if set, use this instead of parsed.owner
  //                         for the team tag (ownership reconciliation)
  // ==================================================================

  function renderPlayerCard(parsed, position, ownerOverride) {
    var effectiveOwner = (ownerOverride != null) ? ownerOverride : parsed.owner;
    var effectiveFA    = effectiveOwner === "FA";

    var card = document.createElement("span");
    card.className = "player-card";
    if (effectiveFA) card.classList.add("player-card--unowned");
    if (parsed.eligibility === "GR") card.classList.add("player-card--graduated");

    // ---- Team tag ----
    var tag = document.createElement("span");
    tag.className = "team-tag";
    tag.textContent = effectiveOwner;
    if (effectiveFA) {
      tag.classList.add("team-tag--free-agent");
      tag.title = "Free Agent";
    } else {
      var tc = TEAM_COLORS[effectiveOwner];
      if (tc) {
        tag.style.setProperty("--team-bg", tc.bg);
        tag.style.setProperty("--team-fg", tc.fg);
        tag.style.setProperty("--team-border", tc.border);
        tag.title = tc.name;
      } else {
        tag.title = effectiveOwner;
      }
    }
    card.appendChild(tag);

    // ---- Eligibility chip ----
    var chip = document.createElement("span");
    var eligLower = parsed.eligibility.toLowerCase();
    chip.className = "eligibility-chip eligibility-chip--" + eligLower;
    chip.textContent = parsed.eligibility;
    chip.title = ELIG_LABELS[parsed.eligibility] || parsed.eligibility;
    card.appendChild(chip);

    // ---- Traditional redshirt ----
    if (parsed.redshirt) {
      var yr = String(parsed.redshirt.year).padStart(2, "0");
      var rs = document.createElement("span");
      rs.className = "redshirt-badge redshirt-badge--traditional";
      rs.title = "Traditional redshirt taken in 20" + yr;
      rs.innerHTML =
        '<span class="redshirt-badge__icon" aria-hidden="true">' + CHR_SHIELD + "</span>" +
        '<span class="redshirt-badge__label">RS</span>' +
        '<span class="redshirt-badge__year">' + CHR_RSQUO + yr + "</span>";
      card.appendChild(rs);
    }

    // ---- Medical redshirt ----
    if (parsed.medicalRedshirt) {
      var myr = String(parsed.medicalRedshirt.year).padStart(2, "0");
      var mrs = document.createElement("span");
      mrs.className = "redshirt-badge redshirt-badge--medical";
      mrs.title = "Medical redshirt taken in 20" + myr;
      mrs.innerHTML =
        '<span class="redshirt-badge__icon" aria-hidden="true">' + CHR_SHIELD + "</span>" +
        '<span class="redshirt-badge__label">MRS</span>' +
        '<span class="redshirt-badge__year">' + CHR_RSQUO + myr + "</span>";
      card.appendChild(mrs);
    }

    // ---- Early declare ----
    if (parsed.isEarlyDeclare) {
      var ed = document.createElement("span");
      ed.className = "early-declare-badge";
      ed.title = "Declared early for the draft";
      ed.innerHTML =
        '<span class="early-declare-badge__icon" aria-hidden="true">' + CHR_ARROW + "</span>" +
        '<span class="early-declare-badge__label">EARLY</span>';
      card.appendChild(ed);
    }

    // ---- National award ----
    if (parsed.awards.national > 0) {
      var na = document.createElement("span");
      na.className = "award-badge award-badge--national";
      var awardName = resolveNationalAward(position);
      na.title = awardName + (parsed.awards.national > 1 ? " " + CHR_TIMES + parsed.awards.national : "");
      na.innerHTML =
        '<span class="award-badge__icon" aria-hidden="true">' + CHR_STAR + "</span>" +
        (parsed.awards.national > 1
          ? '<span class="award-badge__count">' + CHR_TIMES + parsed.awards.national + "</span>"
          : "");
      card.appendChild(na);
    }

    // ---- All-conference award ----
    if (parsed.awards.allConference > 0) {
      var ac = document.createElement("span");
      ac.className = "award-badge award-badge--all-conference";
      ac.title =
        "All-Conference" +
        (parsed.awards.allConference > 1 ? " " + CHR_TIMES + parsed.awards.allConference : "");
      ac.innerHTML =
        '<span class="award-badge__icon" aria-hidden="true">' + CHR_STAR + "</span>" +
        (parsed.awards.allConference > 1
          ? '<span class="award-badge__count">' + CHR_TIMES + parsed.awards.allConference + "</span>"
          : "");
      card.appendChild(ac);
    }

    // ---- Graduated label ----
    if (parsed.eligibility === "GR") {
      var gl = document.createElement("span");
      gl.className = "graduated-label";
      gl.textContent = "GRADUATED";
      card.appendChild(gl);
    }

    return card;
  }

  // ==================================================================
  //  DRIFT INDICATOR — small colored dot appended to player-card
  //  Only added when viewer is commissioner.
  // ==================================================================

  function createDriftIndicator(drift) {
    if (!drift || !drift.type) return null;

    var dot = document.createElement("span");

    if (drift.type === "fallback") {
      dot.className = "ownership-fallback";
      dot.title = drift.reason || "MFL ownership could not be determined";
    } else {
      dot.className = "ownership-drift ownership-drift--" + drift.type;
      var encLabel = drift.encodedOwner || "unknown";
      var mflLabel = drift.mflOwner || "unknown";
      var teamName = function (code) {
        var tc = TEAM_COLORS[code];
        return tc ? tc.name : code;
      };

      if (drift.type === "dropped") {
        dot.title = "Drift: string says " + teamName(encLabel) +
                    " (" + encLabel + "); MFL says Free Agent \u2014 update at next import";
      } else if (drift.type === "picked-up") {
        dot.title = "Drift: string says Free Agent; MFL roster says " +
                    teamName(mflLabel) + " (" + mflLabel + ") \u2014 update at next import";
      } else if (drift.type === "traded") {
        dot.title = "Drift: string says " + teamName(encLabel) + " (" + encLabel +
                    "); MFL roster says " + teamName(mflLabel) + " (" + mflLabel +
                    ") \u2014 update at next import";
      }
    }

    return dot;
  }

  // ==================================================================
  //  CELL ENHANCEMENT — parse, reconcile, render, replace
  // ==================================================================

  /**
   * Enhance a single cell, with ownership context from the page.
   *
   * @param td            - the <td> element
   * @param parsed        - pre-parsed copy data (or null to parse from cell text)
   * @param position      - player position string
   * @param drift         - drift info from computeCopyDrift (or null)
   * @param showDrift     - whether to render drift indicators (commissioner)
   * @param ownerOverride - rendering owner override (from reconciliation)
   */
  function enhanceCellFull(td, parsed, position, drift, showDrift, ownerOverride) {
    if (td.getAttribute("data-cffb-enhanced")) return;

    // Parse if not pre-parsed
    if (!parsed) {
      var raw = td.textContent.trim();
      if (!raw) {
        td.setAttribute("data-cffb-enhanced", "1");
        return;
      }
      try {
        parsed = parseCopy(raw);
      } catch (e) {
        td.setAttribute("data-parse-error", e.message);
        td.setAttribute("data-cffb-enhanced", "1");
        console.warn(LOG_PREFIX, "Parse exception:", e);
        return;
      }
    }

    if (parsed.error) {
      td.setAttribute("data-parse-error", parsed.error);
      td.setAttribute("data-cffb-enhanced", "1");
      console.warn(LOG_PREFIX, "Parse error:", parsed.error, "| raw:", parsed.raw);
      return;
    }

    try {
      var card = renderPlayerCard(parsed, position, ownerOverride);

      // Append drift indicator after team tag (commissioner only)
      if (showDrift && drift && drift.type) {
        var dot = createDriftIndicator(drift);
        if (dot) {
          var teamTag = card.querySelector(".team-tag");
          if (teamTag && teamTag.nextSibling) {
            card.insertBefore(dot, teamTag.nextSibling);
          } else {
            card.appendChild(dot);
          }
        }
      }

      td.textContent = "";
      td.appendChild(card);
      td.setAttribute("data-cffb-enhanced", "1");

      // Store drift type for auditing
      if (drift && drift.type) {
        td.setAttribute("data-cffb-drift", drift.type);
      }
    } catch (err) {
      td.setAttribute("data-parse-error", err.message);
      td.setAttribute("data-cffb-enhanced", "1");
      console.warn(LOG_PREFIX, "Render error:", err);
    }
  }

  /**
   * Simple cell enhancement with no ownership context.
   * Used for pages where MFL ownership is undeterminable (auction, profile).
   */
  function enhanceCellSimple(td, position, showDrift) {
    if (td.getAttribute("data-cffb-enhanced")) return;

    var raw = td.textContent.trim();
    if (!raw) {
      td.setAttribute("data-cffb-enhanced", "1");
      return;
    }

    var parsed = null;
    try {
      parsed = parseCopy(raw);
    } catch (e) {
      td.setAttribute("data-parse-error", e.message);
      td.setAttribute("data-cffb-enhanced", "1");
      console.warn(LOG_PREFIX, "Parse exception:", e);
      return;
    }

    // Fallback drift — MFL ownership unknown
    var drift = { type: "fallback", encodedOwner: parsed.error ? null : parsed.owner,
                  mflOwner: null, reason: "MFL ownership not available on this page type" };

    enhanceCellFull(td, parsed, position, drift, showDrift, null);
  }

  // ==================================================================
  //  PAGE DETECTION
  // ==================================================================

  function getPageType() {
    var search = window.location.search;
    var path   = window.location.pathname;

    if (/[?&]O=07\b/.test(search))                                  return "roster";
    if (/[?&]O=43\b/.test(search) || path.indexOf("/auction") >= 0) return "auction";
    if (path.indexOf("/player") >= 0 && /[?&]P=/.test(search))      return "profile";
    if (/[?&]R=FULLFA\b/i.test(search))                             return "freeagent";

    return null;
  }

  // ==================================================================
  //  ROSTER PAGE ENHANCER
  //
  //  Each franchise table provides ownership context:
  //    table.report.franchise_XXXX → all players are on that franchise.
  //  Processes both copies per row together so drift detection can
  //  use the other copy's encoded owner as context.
  // ==================================================================

  function enhanceRosterPage(commish) {
    // Find franchise-specific roster tables
    var tables = document.querySelectorAll("table.report[class*='franchise_']");
    if (!tables.length) {
      // Fallback: try any report table with contractstatus cells
      tables = document.querySelectorAll("table.report");
    }

    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var franchiseCode = getFranchiseCodeFromTable(table);
      // franchiseCode may be null if we can't determine it

      var rows = table.querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains("total_salary_row")) continue;

        var c1 = row.querySelector("td.contractstatus");
        var c2 = row.querySelector("td.contractinfo");
        if (!c1 && !c2) continue;

        // Skip if both already enhanced
        var c1Done = !c1 || c1.getAttribute("data-cffb-enhanced");
        var c2Done = !c2 || c2.getAttribute("data-cffb-enhanced");
        if (c1Done && c2Done) continue;

        var playerLink = row.querySelector("td.player a[class*='position_']");
        var position   = extractPosition(playerLink);

        // Parse both copies first (needed for drift heuristic)
        var raw1 = c1 && !c1Done ? c1.textContent.trim() : "";
        var raw2 = c2 && !c2Done ? c2.textContent.trim() : "";
        var parsed1 = raw1 ? parseCopy(raw1) : null;
        var parsed2 = raw2 ? parseCopy(raw2) : null;
        var enc1 = (parsed1 && !parsed1.error) ? parsed1.owner : null;
        var enc2 = (parsed2 && !parsed2.error) ? parsed2.owner : null;

        // Compute drift for each copy
        var drift1 = computeCopyDrift(enc1, enc2, franchiseCode);
        var drift2 = computeCopyDrift(enc2, enc1, franchiseCode);

        // Determine rendering owners
        var render1 = enc1 ? resolveRenderingOwner(enc1, drift1) : null;
        var render2 = enc2 ? resolveRenderingOwner(enc2, drift2) : null;

        // Enhance cells
        if (c1 && !c1Done) {
          enhanceCellFull(c1, parsed1, position, drift1, commish, render1 !== enc1 ? render1 : null);
        }
        if (c2 && !c2Done) {
          enhanceCellFull(c2, parsed2, position, drift2, commish, render2 !== enc2 ? render2 : null);
        }
      }
    }
  }

  // ==================================================================
  //  AUCTION PAGE ENHANCER
  //
  //  Auction tables have no dedicated contract cells.  Encoded strings
  //  live in the player link's title attribute.  MFL ownership is
  //  undeterminable from this page, so we fall back to encoded owners.
  // ==================================================================

  function enhanceAuctionPage(commish) {
    var tables = document.querySelectorAll("table.report");
    for (var t = 0; t < tables.length; t++) {
      var rows = tables[t].querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row     = rows[i];
        var firstTd = row.querySelector("td:first-child");
        if (!firstTd || firstTd.getAttribute("data-cffb-enhanced")) continue;

        var playerLink = firstTd.querySelector("a[class*='position_']");
        if (!playerLink) continue;

        var position = extractPosition(playerLink);
        var title    = playerLink.getAttribute("title") || "";

        var c1Match = title.match(/Copy 1 Info:\s*([^,\n]+)/);
        var c2Match = title.match(/Copy 2 Info:\s*([^,\n]+)/);
        if (!c1Match && !c2Match) continue;

        var wrapper  = document.createElement("span");
        wrapper.className = "cffb-auction-copies";
        wrapper.style.cssText = "margin-left:6px;display:inline-flex;gap:8px;vertical-align:middle;";

        var hasCards = false;

        if (c1Match) {
          try {
            var p1 = parseCopy(c1Match[1].trim());
            if (!p1.error) {
              var drift1 = { type: "fallback", encodedOwner: p1.owner, mflOwner: null,
                             reason: "MFL ownership not available on auction page" };
              var card1 = renderPlayerCard(p1, position, null);
              if (commish) {
                var dot1 = createDriftIndicator(drift1);
                if (dot1) {
                  var tt1 = card1.querySelector(".team-tag");
                  if (tt1 && tt1.nextSibling) card1.insertBefore(dot1, tt1.nextSibling);
                  else card1.appendChild(dot1);
                }
              }
              wrapper.appendChild(card1);
              hasCards = true;
            }
          } catch (e) {
            console.warn(LOG_PREFIX, "Auction copy1 error:", e);
          }
        }

        if (c2Match) {
          try {
            var p2 = parseCopy(c2Match[1].trim());
            if (!p2.error) {
              var drift2 = { type: "fallback", encodedOwner: p2.owner, mflOwner: null,
                             reason: "MFL ownership not available on auction page" };
              var card2 = renderPlayerCard(p2, position, null);
              if (commish) {
                var dot2 = createDriftIndicator(drift2);
                if (dot2) {
                  var tt2 = card2.querySelector(".team-tag");
                  if (tt2 && tt2.nextSibling) card2.insertBefore(dot2, tt2.nextSibling);
                  else card2.appendChild(dot2);
                }
              }
              wrapper.appendChild(card2);
              hasCards = true;
            }
          } catch (e) {
            console.warn(LOG_PREFIX, "Auction copy2 error:", e);
          }
        }

        if (hasCards) firstTd.appendChild(wrapper);
        firstTd.setAttribute("data-cffb-enhanced", "1");
      }
    }
  }

  // ==================================================================
  //  PLAYER PROFILE ENHANCER
  //
  //  Profile pages show a biography table with th/td pairs.
  //  MFL ownership is unreliable from the "League Status" field,
  //  so we fall back to encoded string owners.
  // ==================================================================

  function enhancePlayerProfilePage(commish) {
    var position = extractPositionFromProfile();

    var c1 = document.querySelector("td.contractstatus");
    var c2 = document.querySelector("td.contractinfo");

    if (c1) enhanceCellSimple(c1, position, commish);
    if (c2) enhanceCellSimple(c2, position, commish);
  }

  // ==================================================================
  //  FREE AGENT REPORT ENHANCER
  //
  //  All players on this page are currently free agents in MFL.
  //  MFL owner = "FA" for every row.  If the encoded string claims
  //  a rostered owner, that's drift (dropped).
  // ==================================================================

  function enhanceFreeAgentPage(commish) {
    var tables = document.querySelectorAll("table.report");
    for (var t = 0; t < tables.length; t++) {
      var table     = tables[t];
      var headerRow = table.querySelector("tr");
      if (!headerRow) continue;

      var headers = headerRow.querySelectorAll("th");
      var c1Idx = -1;
      var c2Idx = -1;
      for (var h = 0; h < headers.length; h++) {
        var hText = headers[h].textContent || "";
        if (hText.indexOf("Copy 1") !== -1) c1Idx = h;
        if (hText.indexOf("Copy 2") !== -1) c2Idx = h;
      }
      if (c1Idx === -1 && c2Idx === -1) continue;

      var rows = table.querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row   = rows[i];
        var cells = row.querySelectorAll("td");

        var playerLink = row.querySelector("td.player a[class*='position_']");
        var position   = extractPosition(playerLink);

        // Parse both copies for drift context
        var c1Td = (c1Idx >= 0 && c1Idx < cells.length) ? cells[c1Idx] : null;
        var c2Td = (c2Idx >= 0 && c2Idx < cells.length) ? cells[c2Idx] : null;

        var c1Done = !c1Td || c1Td.getAttribute("data-cffb-enhanced");
        var c2Done = !c2Td || c2Td.getAttribute("data-cffb-enhanced");
        if (c1Done && c2Done) continue;

        var raw1 = c1Td && !c1Done ? c1Td.textContent.trim() : "";
        var raw2 = c2Td && !c2Done ? c2Td.textContent.trim() : "";
        var parsed1 = raw1 ? parseCopy(raw1) : null;
        var parsed2 = raw2 ? parseCopy(raw2) : null;
        var enc1 = (parsed1 && !parsed1.error) ? parsed1.owner : null;
        var enc2 = (parsed2 && !parsed2.error) ? parsed2.owner : null;

        // MFL says FA for all players on this page
        var mflOwner = "FA";
        var drift1 = computeCopyDrift(enc1, enc2, mflOwner);
        var drift2 = computeCopyDrift(enc2, enc1, mflOwner);

        var render1 = enc1 ? resolveRenderingOwner(enc1, drift1) : null;
        var render2 = enc2 ? resolveRenderingOwner(enc2, drift2) : null;

        if (c1Td && !c1Done) {
          enhanceCellFull(c1Td, parsed1, position, drift1, commish, render1 !== enc1 ? render1 : null);
        }
        if (c2Td && !c2Done) {
          enhanceCellFull(c2Td, parsed2, position, drift2, commish, render2 !== enc2 ? render2 : null);
        }
      }
    }
  }

  // ==================================================================
  //  AUDIT FUNCTION — window.cfbAudit()
  //
  //  Scans the current page on demand and returns a structured report
  //  of all ownership drift.  Works regardless of viewer role.
  //  Reports drift per-copy, not per-player.
  // ==================================================================

  window.cfbAudit = function () {
    var report = {
      dropped:  [],
      pickedUp: [],
      traded:   [],
      fallback: [],
      summary:  { totalPlayers: 0, totalDrift: 0, lastChecked: new Date().toISOString() },
    };

    var pageType = getPageType();
    if (!pageType) {
      console.warn(LOG_PREFIX, "cfbAudit: unrecognized page type");
      return report;
    }

    try {
      if (pageType === "roster") {
        auditRosterPage(report);
      } else if (pageType === "freeagent") {
        auditFreeAgentPage(report);
      } else if (pageType === "auction") {
        auditAuctionPage(report);
      } else if (pageType === "profile") {
        auditProfilePage(report);
      }
    } catch (err) {
      console.warn(LOG_PREFIX, "cfbAudit error:", err);
    }

    report.summary.totalDrift =
      report.dropped.length + report.pickedUp.length + report.traded.length;

    return report;
  };

  function addAuditEntry(report, playerName, copyNum, drift, encodedOwner, mflOwner) {
    var entry = {
      player: playerName,
      copy: copyNum,
      encodedOwner: encodedOwner || "unknown",
      mflOwner: mflOwner || "unknown",
    };

    switch (drift.type) {
      case "dropped":
        entry.mflOwner = "FA";
        report.dropped.push(entry);
        break;
      case "picked-up":
        entry.encodedOwner = "FA";
        report.pickedUp.push(entry);
        break;
      case "traded":
        report.traded.push(entry);
        break;
      case "fallback":
        entry.reason = drift.reason;
        report.fallback.push(entry);
        break;
    }
  }

  function getPlayerName(row) {
    var link = row.querySelector("td.player a, td:first-child a[class*='position_']");
    return link ? link.textContent.trim() : "Unknown";
  }

  function auditRosterPage(report) {
    var tables = document.querySelectorAll("table.report[class*='franchise_']");
    if (!tables.length) tables = document.querySelectorAll("table.report");

    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var franchiseCode = getFranchiseCodeFromTable(table);

      var rows = table.querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains("total_salary_row")) continue;

        var c1 = row.querySelector("td.contractstatus");
        var c2 = row.querySelector("td.contractinfo");
        if (!c1 && !c2) continue;

        report.summary.totalPlayers++;
        var name = getPlayerName(row);

        var raw1 = c1 ? c1.textContent.trim() : "";
        var raw2 = c2 ? c2.textContent.trim() : "";

        // If already enhanced, read from data attribute or re-parse original
        // The original text might be gone; check for data-cffb-drift
        var parsed1 = null, parsed2 = null;
        if (raw1 && !c1.getAttribute("data-cffb-enhanced")) {
          parsed1 = parseCopy(raw1);
        } else if (c1 && c1.getAttribute("data-cffb-enhanced")) {
          // Cell was already enhanced — try to read drift from data attr
          var driftAttr1 = c1.getAttribute("data-cffb-drift");
          if (driftAttr1) {
            addAuditEntry(report, name, 1,
              { type: driftAttr1 },
              c1.getAttribute("data-cffb-enc-owner") || "?",
              franchiseCode);
          }
          parsed1 = null; // skip further processing
        }

        if (raw2 && !c2.getAttribute("data-cffb-enhanced")) {
          parsed2 = parseCopy(raw2);
        } else if (c2 && c2.getAttribute("data-cffb-enhanced")) {
          var driftAttr2 = c2.getAttribute("data-cffb-drift");
          if (driftAttr2) {
            addAuditEntry(report, name, 2,
              { type: driftAttr2 },
              c2.getAttribute("data-cffb-enc-owner") || "?",
              franchiseCode);
          }
          parsed2 = null;
        }

        var enc1 = (parsed1 && !parsed1.error) ? parsed1.owner : null;
        var enc2 = (parsed2 && !parsed2.error) ? parsed2.owner : null;

        if (enc1 !== null) {
          var drift1 = computeCopyDrift(enc1, enc2, franchiseCode);
          if (drift1.type) addAuditEntry(report, name, 1, drift1, enc1, franchiseCode);
        }
        if (enc2 !== null) {
          var drift2 = computeCopyDrift(enc2, enc1, franchiseCode);
          if (drift2.type) addAuditEntry(report, name, 2, drift2, enc2, franchiseCode);
        }
      }
    }
  }

  function auditFreeAgentPage(report) {
    var tables = document.querySelectorAll("table.report");
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var headerRow = table.querySelector("tr");
      if (!headerRow) continue;

      var headers = headerRow.querySelectorAll("th");
      var c1Idx = -1, c2Idx = -1;
      for (var h = 0; h < headers.length; h++) {
        var hText = headers[h].textContent || "";
        if (hText.indexOf("Copy 1") !== -1) c1Idx = h;
        if (hText.indexOf("Copy 2") !== -1) c2Idx = h;
      }
      if (c1Idx === -1 && c2Idx === -1) continue;

      var rows = table.querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        report.summary.totalPlayers++;
        var name = getPlayerName(row);
        var cells = row.querySelectorAll("td");

        var raw1 = (c1Idx >= 0 && c1Idx < cells.length) ? cells[c1Idx].textContent.trim() : "";
        var raw2 = (c2Idx >= 0 && c2Idx < cells.length) ? cells[c2Idx].textContent.trim() : "";

        var parsed1 = raw1 ? parseCopy(raw1) : null;
        var parsed2 = raw2 ? parseCopy(raw2) : null;
        var enc1 = (parsed1 && !parsed1.error) ? parsed1.owner : null;
        var enc2 = (parsed2 && !parsed2.error) ? parsed2.owner : null;

        if (enc1 !== null) {
          var drift1 = computeCopyDrift(enc1, enc2, "FA");
          if (drift1.type) addAuditEntry(report, name, 1, drift1, enc1, "FA");
        }
        if (enc2 !== null) {
          var drift2 = computeCopyDrift(enc2, enc1, "FA");
          if (drift2.type) addAuditEntry(report, name, 2, drift2, enc2, "FA");
        }
      }
    }
  }

  function auditAuctionPage(report) {
    var tables = document.querySelectorAll("table.report");
    for (var t = 0; t < tables.length; t++) {
      var rows = tables[t].querySelectorAll("tr.oddtablerow, tr.eventablerow");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var link = row.querySelector("a[class*='position_']");
        if (!link) continue;

        report.summary.totalPlayers++;
        var name = link.textContent.trim();
        var title = link.getAttribute("title") || "";

        var c1Match = title.match(/Copy 1 Info:\s*([^,\n]+)/);
        var c2Match = title.match(/Copy 2 Info:\s*([^,\n]+)/);

        if (c1Match) {
          var p1 = parseCopy(c1Match[1].trim());
          if (!p1.error) {
            addAuditEntry(report, name, 1,
              { type: "fallback", reason: "Auction page — MFL ownership unavailable" },
              p1.owner, null);
          }
        }
        if (c2Match) {
          var p2 = parseCopy(c2Match[1].trim());
          if (!p2.error) {
            addAuditEntry(report, name, 2,
              { type: "fallback", reason: "Auction page — MFL ownership unavailable" },
              p2.owner, null);
          }
        }
      }
    }
  }

  function auditProfilePage(report) {
    var c1 = document.querySelector("td.contractstatus");
    var c2 = document.querySelector("td.contractinfo");
    var name = (document.title || "").replace(/^Fantasy Football:\s*CFFB\s*/i, "").trim() || "Unknown";

    report.summary.totalPlayers = (c1 || c2) ? 1 : 0;

    if (c1) {
      var raw1 = c1.textContent.trim();
      if (raw1) {
        var p1 = parseCopy(raw1);
        if (!p1.error) {
          addAuditEntry(report, name, 1,
            { type: "fallback", reason: "Profile page — MFL ownership unreliable" },
            p1.owner, null);
        }
      }
    }
    if (c2) {
      var raw2 = c2.textContent.trim();
      if (raw2) {
        var p2 = parseCopy(raw2);
        if (!p2.error) {
          addAuditEntry(report, name, 2,
            { type: "fallback", reason: "Profile page — MFL ownership unreliable" },
            p2.owner, null);
        }
      }
    }
  }

  // ==================================================================
  //  MAIN RUNNER
  // ==================================================================

  function runEnhancer() {
    try {
      var pageType = getPageType();
      if (!pageType) return;

      var commish = isCommissioner();

      switch (pageType) {
        case "roster":    enhanceRosterPage(commish);        break;
        case "auction":   enhanceAuctionPage(commish);       break;
        case "profile":   enhancePlayerProfilePage(commish); break;
        case "freeagent": enhanceFreeAgentPage(commish);     break;
      }
    } catch (err) {
      console.warn(LOG_PREFIX, "Page enhancer error:", err);
    }
  }

  // ==================================================================
  //  MUTATION OBSERVER — handles AJAX-driven page updates
  // ==================================================================

  function setupObserver() {
    if (typeof MutationObserver === "undefined") return;

    var timer = null;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          clearTimeout(timer);
          timer = setTimeout(runEnhancer, 200);
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ==================================================================
  //  INIT
  // ==================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      runEnhancer();
      setupObserver();
    });
  } else {
    runEnhancer();
    setupObserver();
  }

})();
