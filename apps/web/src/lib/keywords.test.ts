import type { KeywordsResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { getKeywordStyle } from "./keywords";

const MOCK_STYLES: KeywordsResponse["items"] = {
  Accelerate: { color: "#24705f", darkText: false },
  Shield: { color: "#cd346f", darkText: false },
  Deathknell: { color: "#95b229", darkText: true },
  Deflect: { color: "#95b229", darkText: true },
  Ganking: { color: "#95b229", darkText: true },
  Temporary: { color: "#95b229", darkText: true },
};

describe("getKeywordStyle", () => {
  it("returns correct color for a known keyword", () => {
    const style = getKeywordStyle("Shield", MOCK_STYLES);
    expect(style.bg).toBe("#cd346f");
    expect(style.dark).toBe(false);
  });

  it("strips trailing numbers (e.g. 'Shield 2' → 'Shield')", () => {
    const style = getKeywordStyle("Shield 2", MOCK_STYLES);
    expect(style.bg).toBe("#cd346f");
  });

  it("returns dark: true for keywords in the dark-text set", () => {
    expect(getKeywordStyle("Deathknell", MOCK_STYLES).dark).toBe(true);
    expect(getKeywordStyle("Deflect", MOCK_STYLES).dark).toBe(true);
    expect(getKeywordStyle("Ganking", MOCK_STYLES).dark).toBe(true);
    expect(getKeywordStyle("Temporary", MOCK_STYLES).dark).toBe(true);
  });

  it("returns dark: false for keywords not in the dark-text set", () => {
    expect(getKeywordStyle("Shield", MOCK_STYLES).dark).toBe(false);
    expect(getKeywordStyle("Accelerate", MOCK_STYLES).dark).toBe(false);
  });

  it("returns fallback gray for unknown keywords", () => {
    const style = getKeywordStyle("UnknownKeyword", MOCK_STYLES);
    expect(style.bg).toBe("#6a6a6a");
    expect(style.dark).toBe(false);
  });

  it("handles trailing number on dark-text keywords", () => {
    const style = getKeywordStyle("Temporary 3", MOCK_STYLES);
    expect(style.dark).toBe(true);
  });
});
