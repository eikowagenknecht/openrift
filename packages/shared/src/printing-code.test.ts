import { describe, expect, it } from "vitest";

import { formatPrintingCode, isTbaCode, TBA_CODE, tbaShortCode } from "./printing-code.js";

describe("isTbaCode", () => {
  it("matches the bare placeholder and the per-card short code", () => {
    expect(isTbaCode(TBA_CODE)).toBe(true);
    expect(isTbaCode("TBA-yasuo-the-wanderer")).toBe(true);
  });

  it("rejects a real code", () => {
    expect(isTbaCode("OGN-042")).toBe(false);
    expect(isTbaCode("")).toBe(false);
  });

  it("is case sensitive", () => {
    expect(isTbaCode("tba")).toBe(false);
    expect(isTbaCode("Tba-yasuo")).toBe(false);
  });

  it("does not match a code that merely contains TBA", () => {
    expect(isTbaCode("OGN-TBA")).toBe(false);
  });
});

describe("tbaShortCode", () => {
  it("suffixes the card slug", () => {
    expect(tbaShortCode("yasuo-the-wanderer")).toBe("TBA-yasuo-the-wanderer");
  });

  it("still produces a TBA code for an empty slug", () => {
    expect(tbaShortCode("")).toBe("TBA-");
    expect(isTbaCode(tbaShortCode(""))).toBe(true);
  });
});

describe("formatPrintingCode", () => {
  it("labels a placeholder code", () => {
    expect(formatPrintingCode(TBA_CODE)).toBe("Code TBA");
    expect(formatPrintingCode("TBA-yasuo-the-wanderer")).toBe("Code TBA");
  });

  it("returns a real code unchanged", () => {
    expect(formatPrintingCode("OGN-042")).toBe("OGN-042");
  });

  it("returns an empty code unchanged", () => {
    expect(formatPrintingCode("")).toBe("");
  });
});
