import { describe, expect, it } from "vitest";

import {
  cardmarketConditionId,
  cardmarketLanguageName,
  conditionSlugForCardmarket,
  printingLanguageForCardmarket,
} from "./cardmarket-stock.js";

describe("cardmarketLanguageName", () => {
  it("names every Cardmarket language", () => {
    const named = Array.from({ length: 17 }, (_, i) => cardmarketLanguageName(i + 1));
    expect(named.filter((name) => name !== undefined)).toHaveLength(17);
  });

  it("names the ones the printing map relies on", () => {
    expect(cardmarketLanguageName(1)).toBe("English");
    expect(cardmarketLanguageName(6)).toBe("Simplified Chinese");
    expect(cardmarketLanguageName(10)).toBe("Korean");
  });

  it("returns undefined outside the vocabulary", () => {
    expect(cardmarketLanguageName(0)).toBeUndefined();
    expect(cardmarketLanguageName(18)).toBeUndefined();
  });
});

describe("printingLanguageForCardmarket", () => {
  it("maps the four printed languages", () => {
    expect(printingLanguageForCardmarket(1)).toBe("EN");
    expect(printingLanguageForCardmarket(2)).toBe("FR");
    expect(printingLanguageForCardmarket(6)).toBe("SC");
    expect(printingLanguageForCardmarket(10)).toBe("KR");
  });

  it("returns undefined for languages Riftbound is not printed in", () => {
    for (const idLanguage of [3, 4, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17]) {
      expect(printingLanguageForCardmarket(idLanguage)).toBeUndefined();
    }
  });
});

describe("conditionSlugForCardmarket", () => {
  it("maps the seven tiers in Cardmarket's order", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((id) => conditionSlugForCardmarket(id))).toEqual([
      "mint",
      "near-mint",
      "excellent",
      "good",
      "light-played",
      "played",
      "poor",
    ]);
  });

  it("returns undefined outside the vocabulary", () => {
    expect(conditionSlugForCardmarket(0)).toBeUndefined();
    expect(conditionSlugForCardmarket(8)).toBeUndefined();
  });

  it("round-trips through cardmarketConditionId", () => {
    for (const idCondition of [1, 2, 3, 4, 5, 6, 7]) {
      const slug = conditionSlugForCardmarket(idCondition);
      expect(slug).toBeDefined();
      expect(cardmarketConditionId(slug ?? "")).toBe(idCondition);
    }
  });

  it("has no id for an unknown slug", () => {
    expect(cardmarketConditionId("graded")).toBeUndefined();
  });
});
