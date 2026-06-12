import { describe, expect, it } from "vitest";

import { validateRiotId } from "./riot-id.js";

describe("validateRiotId", () => {
  it("accepts a standard gameName#tagLine", () => {
    expect(validateRiotId("SummonerName#EUW")).toEqual({ ok: true, value: "SummonerName#EUW" });
    expect(validateRiotId("Hide on bush#KR1")).toEqual({ ok: true, value: "Hide on bush#KR1" });
    expect(validateRiotId("abc#123")).toEqual({ ok: true, value: "abc#123" });
  });

  it("accepts boundary lengths (3-16 name, 3-5 tag)", () => {
    expect(validateRiotId("abc#abc").ok).toBe(true);
    expect(validateRiotId(`${"a".repeat(16)}#abcde`).ok).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(validateRiotId("  SummonerName#EUW  ")).toEqual({
      ok: true,
      value: "SummonerName#EUW",
    });
  });

  it("normalizes empty, null, and undefined to a null value (clears the field)", () => {
    expect(validateRiotId("")).toEqual({ ok: true, value: null });
    expect(validateRiotId("   ")).toEqual({ ok: true, value: null });
    expect(validateRiotId(null)).toEqual({ ok: true, value: null });
    expect(validateRiotId(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects a missing tag", () => {
    expect(validateRiotId("SummonerName").ok).toBe(false);
    expect(validateRiotId("SummonerName#").ok).toBe(false);
  });

  it("rejects out-of-range lengths", () => {
    expect(validateRiotId("ab#abc").ok).toBe(false);
    expect(validateRiotId(`${"a".repeat(17)}#abc`).ok).toBe(false);
    expect(validateRiotId("abc#ab").ok).toBe(false);
    expect(validateRiotId("abc#abcdef").ok).toBe(false);
  });

  it("rejects multiple hashes and whitespace in the tag", () => {
    expect(validateRiotId("abc#de#f").ok).toBe(false);
    expect(validateRiotId("abc#a c").ok).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(validateRiotId(42).ok).toBe(false);
    expect(validateRiotId({}).ok).toBe(false);
  });

  it("returns a user-facing reason on rejection", () => {
    const result = validateRiotId("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("gameName#tagLine");
    }
  });
});
