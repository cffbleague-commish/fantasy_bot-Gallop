import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCopy, parsePlayerLine } from "./mfl-player-parser.js";

// OWNER is now the 4-digit MFL franchise id (e.g. "0044") or "FA".

// ---------------------------------------------------------------------------
// parseCopy
// ---------------------------------------------------------------------------
describe("parseCopy", () => {
  it("parses a free-agent junior with traditional redshirt", () => {
    const result = parseCopy("FA_JR_r23");
    assert.deepStrictEqual(result, {
      owner: "FA",
      isFreeAgent: true,
      eligibility: "JR",
      isEarlyDeclare: false,
      redshirt: { type: "traditional", year: 23 },
      medicalRedshirt: null,
      awards: { national: 0, allConference: 0 },
    });
  });

  it("parses a franchise-owned senior with early declare and concatenated awards", () => {
    const result = parseCopy("0044_SR_EN1A3");
    assert.deepStrictEqual(result, {
      owner: "0044",
      isFreeAgent: false,
      eligibility: "SR",
      isEarlyDeclare: true,
      redshirt: null,
      medicalRedshirt: null,
      awards: { national: 1, allConference: 3 },
    });
  });

  it("parses a franchise-owned junior with redshirt and all-conference award", () => {
    const result = parseCopy("0033_JR_r23_A2");
    assert.deepStrictEqual(result, {
      owner: "0033",
      isFreeAgent: false,
      eligibility: "JR",
      isEarlyDeclare: false,
      redshirt: { type: "traditional", year: 23 },
      medicalRedshirt: null,
      awards: { national: 0, allConference: 2 },
    });
  });

  it("parses a graduated player", () => {
    const result = parseCopy("0067_GR");
    assert.deepStrictEqual(result, {
      owner: "0067",
      isFreeAgent: false,
      eligibility: "GR",
      isEarlyDeclare: false,
      redshirt: null,
      medicalRedshirt: null,
      awards: { national: 0, allConference: 0 },
    });
  });

  it("parses a player with both traditional and medical redshirts in different years", () => {
    const result = parseCopy("0033_SO_r22_m23");
    assert.deepStrictEqual(result, {
      owner: "0033",
      isFreeAgent: false,
      eligibility: "SO",
      isEarlyDeclare: false,
      redshirt: { type: "traditional", year: 22 },
      medicalRedshirt: { year: 23 },
      awards: { national: 0, allConference: 0 },
    });
  });

  it("parses a plain free agent with no modifiers", () => {
    const result = parseCopy("FA_FR");
    assert.deepStrictEqual(result, {
      owner: "FA",
      isFreeAgent: true,
      eligibility: "FR",
      isEarlyDeclare: false,
      redshirt: null,
      medicalRedshirt: null,
      awards: { national: 0, allConference: 0 },
    });
  });

  // -- Award count edge cases --

  it("N alone → national: 1", () => {
    const result = parseCopy("FA_SR_N");
    assert.equal(result.awards.national, 1);
    assert.equal(result.awards.allConference, 0);
  });

  it("N1 → national: 1", () => {
    const result = parseCopy("FA_SR_N1");
    assert.equal(result.awards.national, 1);
  });

  it("N5 → national: 5", () => {
    const result = parseCopy("FA_SR_N5");
    assert.equal(result.awards.national, 5);
  });

  it("A alone → allConference: 1", () => {
    const result = parseCopy("FA_SR_A");
    assert.equal(result.awards.allConference, 1);
  });

  it("concatenated modifiers in one segment: r22m23EN2A1", () => {
    const result = parseCopy("0033_JR_r22m23EN2A1");
    assert.deepStrictEqual(result, {
      owner: "0033",
      isFreeAgent: false,
      eligibility: "JR",
      isEarlyDeclare: true,
      redshirt: { type: "traditional", year: 22 },
      medicalRedshirt: { year: 23 },
      awards: { national: 2, allConference: 1 },
    });
  });

  // -- Malformed inputs --

  it("returns error for empty string", () => {
    const result = parseCopy("");
    assert.ok(result.error);
    assert.strictEqual(result.raw, "");
  });

  it("returns error for non-string input", () => {
    const result = parseCopy(null);
    assert.ok(result.error);
  });

  it("returns error for missing eligibility (single segment)", () => {
    const result = parseCopy("FA");
    assert.ok(result.error);
    assert.strictEqual(result.raw, "FA");
  });

  it("returns error for invalid eligibility", () => {
    const result = parseCopy("0033_XX");
    assert.ok(result.error);
    assert.match(result.error, /eligibility/i);
  });

  it("returns error for a letter owner code (abbrev no longer valid)", () => {
    const result = parseCopy("BC_JR");
    assert.ok(result.error);
    assert.match(result.error, /owner/i);
  });

  it("returns error for a 3-digit owner (must be 4)", () => {
    const result = parseCopy("032_JR");
    assert.ok(result.error);
    assert.match(result.error, /owner/i);
  });

  it("returns error for a 5-digit owner (must be 4)", () => {
    const result = parseCopy("00321_JR");
    assert.ok(result.error);
    assert.match(result.error, /owner/i);
  });

  it("returns error for unknown modifier character", () => {
    const result = parseCopy("FA_JR_Z");
    assert.ok(result.error);
    assert.match(result.error, /unexpected/i);
  });

  it("returns error for redshirt missing year digits", () => {
    const result = parseCopy("FA_JR_r");
    assert.ok(result.error);
    assert.match(result.error, /year/i);
  });

  it("returns error for redshirt with one digit", () => {
    const result = parseCopy("FA_JR_r2");
    assert.ok(result.error);
  });

  it("returns error for traditional and medical redshirt in same year", () => {
    const result = parseCopy("0033_SO_r23_m23");
    assert.ok(result.error);
    assert.match(result.error, /same year/i);
  });

  it("returns error for duplicate traditional redshirt", () => {
    const result = parseCopy("0033_SO_r22_r23");
    assert.ok(result.error);
    assert.match(result.error, /duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// parsePlayerLine
// ---------------------------------------------------------------------------
describe("parsePlayerLine", () => {
  it("parses Abanikanda example (both copies identical)", () => {
    const result = parsePlayerLine(
      "Abanikanda, Israel;FA_JR_r23;FA_JR_r23"
    );
    assert.deepStrictEqual(result.name, { last: "Abanikanda", first: "Israel" });
    assert.deepStrictEqual(result.copy1, result.copy2);
    assert.strictEqual(result.copy1.isFreeAgent, true);
    assert.strictEqual(result.copy1.eligibility, "JR");
    assert.deepStrictEqual(result.copy1.redshirt, { type: "traditional", year: 23 });
  });

  it("parses Gibbs example (different copies)", () => {
    const result = parsePlayerLine(
      "Gibbs, Jahmyr;0044_SR_EN1A3;0033_JR_r23_A2"
    );
    assert.deepStrictEqual(result.name, { last: "Gibbs", first: "Jahmyr" });

    // copy 1
    assert.strictEqual(result.copy1.owner, "0044");
    assert.strictEqual(result.copy1.eligibility, "SR");
    assert.strictEqual(result.copy1.isEarlyDeclare, true);
    assert.deepStrictEqual(result.copy1.awards, { national: 1, allConference: 3 });

    // copy 2
    assert.strictEqual(result.copy2.owner, "0033");
    assert.strictEqual(result.copy2.eligibility, "JR");
    assert.deepStrictEqual(result.copy2.redshirt, { type: "traditional", year: 23 });
    assert.deepStrictEqual(result.copy2.awards, { national: 0, allConference: 2 });
  });

  it("parses a graduated player line", () => {
    const result = parsePlayerLine("Smith, John;0067_GR;0067_GR");
    assert.strictEqual(result.copy1.eligibility, "GR");
    assert.strictEqual(result.copy2.eligibility, "GR");
  });

  it("returns error for empty string", () => {
    const result = parsePlayerLine("");
    assert.ok(result.error);
  });

  it("returns error for missing semicolons", () => {
    const result = parsePlayerLine("Smith, John");
    assert.ok(result.error);
    assert.match(result.error, /segment/i);
  });

  it("returns error for missing comma in name", () => {
    const result = parsePlayerLine("Smith John;FA_JR;FA_JR");
    assert.ok(result.error);
    assert.match(result.error, /comma/i);
  });

  it("returns error for incomplete name (missing first)", () => {
    const result = parsePlayerLine("Smith, ;FA_JR;FA_JR");
    assert.ok(result.error);
    assert.match(result.error, /name/i);
  });

  it("propagates copy-level parse errors without throwing", () => {
    const result = parsePlayerLine("Smith, John;BADOWNER_JR;FA_JR");
    // parsePlayerLine itself succeeds (returns name + copies)
    // but copy1 should be an error object (letters are not a valid owner)
    assert.ok(result.copy1.error);
    assert.strictEqual(result.copy2.owner, "FA");
  });

  it("returns error for too many segments", () => {
    const result = parsePlayerLine("Smith, John;FA_JR;FA_JR;FA_SR");
    assert.ok(result.error);
  });
});
