/**
 * mfl-page-enhancer.js — CFFB MFL Page Enhancer
 *
 * Detects MFL page type, parses encoded eligibility/contract strings,
 * and replaces raw text with styled .player-card components.
 *
 * Loaded via an MFL home page message <script> tag.
 * Requires mfl-custom.css to be loaded for visual styles.
 *
 * Parser logic (parseCopy / parseModifierSegment) is inlined from
 * mfl-player-parser.js so the script is fully self-contained.
 * If the parser changes, update both files.
 */
(function () {
  "use strict";

  // Guard: never run twice (idempotent at the script-load level)
  if (window.__CFFB_ENHANCER_LOADED) return;
  window.__CFFB_ENHANCER_LOADED = true;

  var LOG_PREFIX = "[CFFB]";

  // ==================================================================
  //  UNICODE CHARACTERS (safe in any source encoding)
  // ==================================================================

  var CHR_SHIELD = "\uD83D\uDEE1"; // 🛡
  var CHR_ARROW  = "\u2197";        // ↗
  var CHR_STAR   = "\u2605";        // ★
  var CHR_TIMES  = "\u00D7";        // ×
  var CHR_RSQUO  = "\u2019";        // '

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
  //  bg: tag fill, fg: text (chosen for contrast), border: accent
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

  // ==================================================================
  //  NATIONAL AWARD MAPPING
  //  Position-specific national awards.  Heisman can go to any
  //  position, so we default to the generic "National Award" when
  //  position is unknown or does not map to one specific award.
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
  //  ELIGIBILITY LABELS (for title attributes)
  // ==================================================================

  var ELIG_LABELS = {
    FR: "Freshman",
    SO: "Sophomore",
    JR: "Junior",
    SR: "Senior",
    GR: "Graduate",
  };

  // ==================================================================
  //  POSITION EXTRACTION
  // ==================================================================

  /** Extract position string from a player <a> element's CSS class. */
  function extractPosition(linkEl) {
    if (!linkEl) return null;
    var m = (linkEl.className || "").match(/position_(\w+)/);
    return m ? m[1] : null;
  }

  /** Extract position from a player-profile page title. */
  function extractPositionFromProfile() {
    var title = document.title || "";
    // Title format: "Fantasy Football: CFFB Pickens, George DAL WR"
    var m = title.match(/\b(QB|RB|WR|TE|PK|K|DEF|DL|LB|DB|S|CB)\s*$/i);
    return m ? m[1].toLowerCase() : null;
  }

  // ==================================================================
  //  RENDERER — builds a .player-card element from parsed data
  // ==================================================================

  function renderPlayerCard(parsed, position) {
    var card = document.createElement("span");
    card.className = "player-card";
    if (parsed.isFreeAgent) card.classList.add("player-card--unowned");
    if (parsed.eligibility === "GR") card.classList.add("player-card--graduated");

    // ---- Team tag ----
    var tag = document.createElement("span");
    tag.className = "team-tag";
    tag.textContent = parsed.owner;
    if (parsed.isFreeAgent) {
      tag.classList.add("team-tag--free-agent");
      tag.title = "Free Agent";
    } else {
      var tc = TEAM_COLORS[parsed.owner];
      if (tc) {
        tag.style.setProperty("--team-bg", tc.bg);
        tag.style.setProperty("--team-fg", tc.fg);
        tag.style.setProperty("--team-border", tc.border);
        tag.title = tc.name;
      } else {
        tag.title = parsed.owner;
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

    // ---- Graduated label (GR only, reinforces the muted chip) ----
    if (parsed.eligibility === "GR") {
      var gl = document.createElement("span");
      gl.className = "graduated-label";
      gl.textContent = "GRADUATED";
      card.appendChild(gl);
    }

    return card;
  }

  // ==================================================================
  //  CELL ENHANCER — core parse-and-replace logic
  // ==================================================================

  /**
   * Parse one contract cell's text and replace it with a rendered
   * .player-card.  Skips cells already enhanced.  On parse error,
   * leaves the raw text and sets data-parse-error for debugging.
   */
  function enhanceCell(td, position) {
    if (td.getAttribute("data-cffb-enhanced")) return;

    var raw = td.textContent.trim();
    if (!raw) {
      td.setAttribute("data-cffb-enhanced", "1");
      return;
    }

    try {
      var parsed = parseCopy(raw);
      if (parsed.error) {
        td.setAttribute("data-parse-error", parsed.error);
        td.setAttribute("data-cffb-enhanced", "1");
        console.warn(LOG_PREFIX, "Parse error:", parsed.error, "| raw:", raw);
        return;
      }
      var card = renderPlayerCard(parsed, position);
      td.textContent = "";
      td.appendChild(card);
      td.setAttribute("data-cffb-enhanced", "1");
    } catch (err) {
      td.setAttribute("data-parse-error", err.message);
      td.setAttribute("data-cffb-enhanced", "1");
      console.warn(LOG_PREFIX, "Render error:", err);
    }
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
  // ==================================================================

  function enhanceRosterPage() {
    var rows = document.querySelectorAll(
      "table.report tr.oddtablerow, table.report tr.eventablerow"
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];

      // Skip total/summary rows
      if (row.classList.contains("total_salary_row")) continue;

      var playerLink = row.querySelector("td.player a[class*='position_']");
      var position   = extractPosition(playerLink);

      var c1 = row.querySelector("td.contractstatus");
      var c2 = row.querySelector("td.contractinfo");
      if (c1) enhanceCell(c1, position);
      if (c2) enhanceCell(c2, position);
    }
  }

  // ==================================================================
  //  AUCTION PAGE ENHANCER
  //
  //  Auction tables have no dedicated contract cells.  The encoded
  //  strings live in the player link's title attribute:
  //    "Copy 1 Info: XXX, Copy 2 Info: YYY\n, Week 1: ..."
  //  We parse the title, inject .player-card elements inline after
  //  the player link, and clean the title to remove raw strings.
  // ==================================================================

  function enhanceAuctionPage() {
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

        // Build inline wrapper for the two player cards
        var wrapper  = document.createElement("span");
        wrapper.className = "cffb-auction-copies";
        wrapper.style.cssText = "margin-left:6px;display:inline-flex;gap:8px;vertical-align:middle;";

        var hasCards = false;

        if (c1Match) {
          try {
            var p1 = parseCopy(c1Match[1].trim());
            if (!p1.error) {
              wrapper.appendChild(renderPlayerCard(p1, position));
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
              wrapper.appendChild(renderPlayerCard(p2, position));
              hasCards = true;
            }
          } catch (e) {
            console.warn(LOG_PREFIX, "Auction copy2 error:", e);
          }
        }

        if (hasCards) {
          firstTd.appendChild(wrapper);
        }

        firstTd.setAttribute("data-cffb-enhanced", "1");
      }
    }
  }

  // ==================================================================
  //  PLAYER PROFILE ENHANCER
  //
  //  Profile pages have a biography table with th/td pairs:
  //    <th>Contract Status:</th><td class="contractstatus">...</td>
  //    <th>Contract Info:</th><td class="contractinfo">...</td>
  // ==================================================================

  function enhancePlayerProfilePage() {
    var position = extractPositionFromProfile();

    var c1 = document.querySelector("td.contractstatus");
    var c2 = document.querySelector("td.contractinfo");

    if (c1) enhanceCell(c1, position);
    if (c2) enhanceCell(c2, position);
  }

  // ==================================================================
  //  FREE AGENT REPORT ENHANCER
  //
  //  FA tables have no CSS class on the contract cells.  We identify
  //  the correct columns by scanning <th> headers for "Copy 1 Info"
  //  and "Copy 2 Info", then use those column indices.
  // ==================================================================

  function enhanceFreeAgentPage() {
    var tables = document.querySelectorAll("table.report");
    for (var t = 0; t < tables.length; t++) {
      var table     = tables[t];
      var headerRow = table.querySelector("tr");
      if (!headerRow) continue;

      // Determine column indices from header text
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

        if (c1Idx >= 0 && c1Idx < cells.length) enhanceCell(cells[c1Idx], position);
        if (c2Idx >= 0 && c2Idx < cells.length) enhanceCell(cells[c2Idx], position);
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

      switch (pageType) {
        case "roster":    enhanceRosterPage();        break;
        case "auction":   enhanceAuctionPage();       break;
        case "profile":   enhancePlayerProfilePage(); break;
        case "freeagent": enhanceFreeAgentPage();     break;
      }
    } catch (err) {
      console.warn(LOG_PREFIX, "Page enhancer error:", err);
    }
  }

  // ==================================================================
  //  MUTATION OBSERVER — handles AJAX-driven page updates
  //
  //  Watches for DOM additions (new rows loaded via AJAX, especially
  //  on auction pages).  Debounced to 200ms to avoid thrashing.
  //  Idempotent — cells with data-cffb-enhanced are skipped.
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
    // DOM already ready (script loaded at end of body or deferred)
    runEnhancer();
    setupObserver();
  }

})();
