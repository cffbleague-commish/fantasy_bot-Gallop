// mfl-player-parser.js — pure ES module, no DOM, no MFL specifics.
// Parses semicolon-delimited player contract/eligibility strings into objects.

const VALID_ELIGIBILITY = new Set(["FR", "SO", "JR", "SR", "GR"]);
// OWNER is the 4-digit MFL franchise id (e.g. "0032") or "FA". (This pure parser
// returns the id as-is; id→abbrev translation for display happens in consumers
// that have the MFL franchiseDatabase available, e.g. the page-enhancer.)
const OWNER_RE = /^(?:FA|\d{4})$/;

/**
 * Parse the modifier characters from a single segment (between underscores).
 * Modifiers can be concatenated: e.g. "EN1A3" → E + N1 + A3.
 * Mutates the `result` object in place. Returns an error string or null.
 */
function parseModifierSegment(segment, result) {
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i];

    if (ch === "E") {
      if (result.isEarlyDeclare) {
        return `duplicate early-declare flag in "${segment}"`;
      }
      result.isEarlyDeclare = true;
      i++;
    } else if (ch === "r" || ch === "m") {
      // Redshirt: r or m followed by exactly two digits (year)
      const yearStr = segment.slice(i + 1, i + 3);
      if (!/^\d{2}$/.test(yearStr)) {
        return `expected two-digit year after '${ch}' in "${segment}"`;
      }
      const year = parseInt(yearStr, 10);

      if (ch === "r") {
        if (result.redshirt) {
          return `duplicate traditional redshirt in "${segment}"`;
        }
        result.redshirt = { type: "traditional", year };
      } else {
        if (result.medicalRedshirt) {
          return `duplicate medical redshirt in "${segment}"`;
        }
        result.medicalRedshirt = { year };
      }

      // Validate: traditional and medical must not share the same year
      if (
        result.redshirt &&
        result.medicalRedshirt &&
        result.redshirt.year === result.medicalRedshirt.year
      ) {
        return `traditional and medical redshirt cannot share the same year (${year})`;
      }

      i += 3;
    } else if (ch === "N" || ch === "A") {
      // Award: letter optionally followed by a positive integer
      const rest = segment.slice(i + 1);
      const numMatch = rest.match(/^(\d+)/);
      let count;
      if (numMatch) {
        count = parseInt(numMatch[1], 10);
        if (count <= 0) {
          return `award count must be positive, got ${count} in "${segment}"`;
        }
        i += 1 + numMatch[1].length;
      } else {
        // Letter alone → count of 1
        count = 1;
        i += 1;
      }

      if (ch === "N") {
        if (result.awards.national > 0) {
          return `duplicate national award in "${segment}"`;
        }
        result.awards.national = count;
      } else {
        if (result.awards.allConference > 0) {
          return `duplicate all-conference award in "${segment}"`;
        }
        result.awards.allConference = count;
      }
    } else {
      return `unexpected character '${ch}' in modifier segment "${segment}"`;
    }
  }
  return null;
}

/**
 * Parse a single copy string, e.g. "MRSH_SR_EN1A3".
 * Returns the parsed object or { error, raw } on failure.
 */
export function parseCopy(copyString) {
  if (typeof copyString !== "string" || copyString.trim() === "") {
    return { error: "copy string is empty or not a string", raw: copyString };
  }

  const raw = copyString.trim();
  const parts = raw.split("_");

  if (parts.length < 2) {
    return { error: "expected at least OWNER_ELIGIBILITY", raw };
  }

  const ownerRaw = parts[0];
  const eligRaw = parts[1];

  if (!OWNER_RE.test(ownerRaw)) {
    return { error: `invalid owner code "${ownerRaw}"`, raw };
  }

  if (!VALID_ELIGIBILITY.has(eligRaw)) {
    return { error: `invalid eligibility "${eligRaw}"`, raw };
  }

  const result = {
    owner: ownerRaw,
    isFreeAgent: ownerRaw === "FA",
    eligibility: eligRaw,
    isEarlyDeclare: false,
    redshirt: null,
    medicalRedshirt: null,
    awards: { national: 0, allConference: 0 },
  };

  // Parse modifier segments (parts[2..n])
  for (let idx = 2; idx < parts.length; idx++) {
    const segment = parts[idx];
    if (segment === "") {
      return { error: "empty modifier segment (double underscore?)", raw };
    }
    const err = parseModifierSegment(segment, result);
    if (err) {
      return { error: err, raw };
    }
  }

  return result;
}

/**
 * Parse a full player line: "LastName, FirstName;COPY1;COPY2".
 * Returns { name: { last, first }, copy1, copy2 } or { error, raw }.
 */
export function parsePlayerLine(line) {
  if (typeof line !== "string" || line.trim() === "") {
    return { error: "player line is empty or not a string", raw: line };
  }

  const raw = line.trim();
  const segments = raw.split(";");

  if (segments.length !== 3) {
    return {
      error: `expected 3 semicolon-delimited segments, got ${segments.length}`,
      raw,
    };
  }

  const namePart = segments[0].trim();
  const commaIdx = namePart.indexOf(",");
  if (commaIdx === -1) {
    return { error: `name segment missing comma: "${namePart}"`, raw };
  }

  const last = namePart.slice(0, commaIdx).trim();
  const first = namePart.slice(commaIdx + 1).trim();

  if (!last || !first) {
    return { error: `incomplete name: "${namePart}"`, raw };
  }

  const copy1 = parseCopy(segments[1]);
  const copy2 = parseCopy(segments[2]);

  return {
    name: { last, first },
    copy1,
    copy2,
  };
}
