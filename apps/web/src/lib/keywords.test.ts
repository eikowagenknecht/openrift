import type { KeywordsResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildTranslationReverseMap, getKeywordStyle } from "./keywords";

const MOCK_STYLES: KeywordsResponse["items"] = {
  Accelerate: { color: "#24705f", darkText: false, costKeyword: false },
  Shield: { color: "#cd346f", darkText: false, costKeyword: false },
  Deathknell: { color: "#95b229", darkText: true, costKeyword: false },
  Deflect: { color: "#95b229", darkText: true, costKeyword: false },
  Ganking: { color: "#95b229", darkText: true, costKeyword: false },
  Temporary: { color: "#95b229", darkText: true, costKeyword: false },
};

// Same keywords with translations attached: a CJK label and a French one whose
// apostrophe and accent both have to survive folding.
const TRANSLATED_STYLES: KeywordsResponse["items"] = {
  Accelerate: { ...MOCK_STYLES.Accelerate, translations: { fr: "Coup d’éclat" } },
  Shield: { ...MOCK_STYLES.Shield, translations: { sc: "护盾" } },
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

  it("resolves a translated label through the reverse map", () => {
    const reverseMap = buildTranslationReverseMap(TRANSLATED_STYLES);
    expect(getKeywordStyle("护盾", TRANSLATED_STYLES, reverseMap).bg).toBe("#cd346f");
  });

  it("resolves a translated label typed with a straight apostrophe", () => {
    const reverseMap = buildTranslationReverseMap(TRANSLATED_STYLES);
    expect(getKeywordStyle("Coup d'éclat", TRANSLATED_STYLES, reverseMap).bg).toBe("#24705f");
  });
});

describe("buildTranslationReverseMap", () => {
  it("keys entries by their folded label, not merely lowercased", () => {
    // The keyword search in filters.ts looks up a folded term, so the keys have
    // to be folded the same way or an accented label never resolves.
    const map = buildTranslationReverseMap(TRANSLATED_STYLES);
    expect(map.get("coup declat")).toBe("Accelerate");
    expect(map.get("护盾")).toBe("Shield");
  });

  it("keeps CJK labels intact rather than emptying them", () => {
    const map = buildTranslationReverseMap(TRANSLATED_STYLES);
    expect([...map.keys()]).toContain("护盾");
  });

  it("returns an empty map when no keyword has translations", () => {
    expect(buildTranslationReverseMap(MOCK_STYLES).size).toBe(0);
  });
});
