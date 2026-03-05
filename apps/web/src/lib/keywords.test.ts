import { describe, expect, it } from "vitest";

import { getKeywordStyle } from "./keywords";

describe("getKeywordStyle", () => {
  it("returns correct color for a known keyword", () => {
    const style = getKeywordStyle("Shield");
    expect(style.bg).toBe("#cd346f");
    expect(style.dark).toBe(false);
  });

  it("strips trailing numbers (e.g. 'Shield 2' → 'Shield')", () => {
    const style = getKeywordStyle("Shield 2");
    expect(style.bg).toBe("#cd346f");
  });

  it("returns dark: true for keywords in the dark-text set", () => {
    expect(getKeywordStyle("Deathknell").dark).toBe(true);
    expect(getKeywordStyle("Deflect").dark).toBe(true);
    expect(getKeywordStyle("Ganking").dark).toBe(true);
    expect(getKeywordStyle("Temporary").dark).toBe(true);
  });

  it("returns dark: false for keywords not in the dark-text set", () => {
    expect(getKeywordStyle("Shield").dark).toBe(false);
    expect(getKeywordStyle("Accelerate").dark).toBe(false);
  });

  it("returns fallback gray for unknown keywords", () => {
    const style = getKeywordStyle("UnknownKeyword");
    expect(style.bg).toBe("#6a6a6a");
    expect(style.dark).toBe(false);
  });

  it("handles trailing number on dark-text keywords", () => {
    const style = getKeywordStyle("Temporary 3");
    expect(style.dark).toBe(true);
  });
});
