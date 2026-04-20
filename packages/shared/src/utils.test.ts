import { describe, expect, it } from "bun:test";

import type { Printing } from "./types/index";
import {
  boundsOf,
  compareWithLanguagePreference,
  deduplicateByCard,
  formatPrintingLabel,
  centsToDollars,
  comparePrintings,
  emptyToNull,
  formatDateUTC,
  formatShortCodes,
  getOrientation,
  mostCommonValue,
  normalizeNameForMatching,
  preferredPrinting,
  toCents,
  unique,
} from "./utils";

const TEST_FINISH_ORDER = ["normal", "foil", "metal", "metal-deluxe"] as const;

function makePrinting(overrides: Partial<Printing> & { language: string }): Printing {
  return {
    id: "p1",
    cardId: "card1",
    shortCode: "SET-001",
    setId: "SET-A",
    setSlug: "set-a",
    rarity: "common",
    artVariant: "standard",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [],
    artist: "Artist",
    publicCode: "001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    canonicalRank: 0,
    card: {
      slug: "card-1",
      name: "Card 1",
      type: "Unit",
      superTypes: [],
      domains: [],
      might: null,
      energy: null,
      power: null,
      keywords: [],
      tags: [],
      mightBonus: null,
      errata: null,
      bans: [],
    },
    ...overrides,
  };
}

describe("unique", () => {
  it("returns empty array for empty input", () => {
    expect(unique([])).toEqual([]);
  });

  it("preserves insertion order of first occurrences", () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it("returns same elements when no duplicates", () => {
    expect(unique(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates strings", () => {
    expect(unique(["foo", "bar", "foo", "baz", "bar"])).toEqual(["foo", "bar", "baz"]);
  });

  it("handles single-element array", () => {
    expect(unique([42])).toEqual([42]);
  });
});

describe("formatPrintingLabel", () => {
  it("builds a basic unmarked slug", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal")).toBe("OGN-001:normal:");
  });

  it("includes a single marker slug", () => {
    expect(formatPrintingLabel("OGN-001", ["promo"], "foil")).toBe("OGN-001:foil:promo");
  });

  it("joins multiple marker slugs with +", () => {
    expect(formatPrintingLabel("OGN-001", ["promo", "top-8"], "foil")).toBe(
      "OGN-001:foil:promo+top-8",
    );
  });

  it("preserves finish value", () => {
    expect(formatPrintingLabel("OGN-105", [], "normal")).toBe("OGN-105:normal:");
  });

  it("omits language suffix for EN (default)", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", "EN")).toBe("OGN-001:normal:");
  });

  it("omits language suffix when language is null", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", null)).toBe("OGN-001:normal:");
  });

  it("omits language suffix when language is undefined", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", undefined)).toBe("OGN-001:normal:");
  });

  it("appends language suffix for non-EN languages", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", "FR")).toBe("OGN-001:normal::FR");
  });

  it("appends language suffix with marker", () => {
    expect(formatPrintingLabel("OGN-001", ["promo"], "foil", "ZH")).toBe("OGN-001:foil:promo:ZH");
  });
});

describe("boundsOf", () => {
  it("returns { min: 0, max: 0 } for empty array", () => {
    expect(boundsOf([])).toEqual({ min: 0, max: 0 });
  });

  it("returns same value for single integer element", () => {
    expect(boundsOf([5])).toEqual({ min: 5, max: 5 });
  });

  it("finds min and max across multiple values", () => {
    expect(boundsOf([3, 1, 7, 2])).toEqual({ min: 1, max: 7 });
  });

  it("floors min and ceils max for fractional values", () => {
    expect(boundsOf([2.3, 5.7])).toEqual({ min: 2, max: 6 });
  });

  it("handles negative values", () => {
    expect(boundsOf([-3.5, 2.1])).toEqual({ min: -4, max: 3 });
  });

  it("handles all-equal values", () => {
    expect(boundsOf([4, 4, 4])).toEqual({ min: 4, max: 4 });
  });

  it("floors and ceils a single fractional value", () => {
    expect(boundsOf([3.5])).toEqual({ min: 3, max: 4 });
  });
});

describe("normalizeNameForMatching", () => {
  it("lowercases and strips non-alphanumeric characters", () => {
    expect(normalizeNameForMatching("Kai'Sa, Survivor")).toBe("kaisasurvivor");
  });

  it("removes hyphens", () => {
    expect(normalizeNameForMatching("Mega-Mech")).toBe("megamech");
  });

  it("removes spaces", () => {
    expect(normalizeNameForMatching("KaiSa Survivor")).toBe("kaisasurvivor");
  });

  it("returns empty string for all-special-character input", () => {
    expect(normalizeNameForMatching("!@#$%^&*()")).toBe("");
  });

  it("handles already-clean lowercase input", () => {
    expect(normalizeNameForMatching("fireball")).toBe("fireball");
  });

  it("handles mixed case with numbers", () => {
    expect(normalizeNameForMatching("Unit-42X")).toBe("unit42x");
  });
});

describe("comparePrintings", () => {
  const base = {
    setId: "SET-A",
    shortCode: "SET-A-001",
  };

  it("returns 0 for identical printings", () => {
    expect(comparePrintings(base, { ...base }, TEST_FINISH_ORDER)).toBe(0);
  });

  it("sorts by setId first", () => {
    const a = { ...base, setId: "AAA" };
    const b = { ...base, setId: "ZZZ" };
    expect(comparePrintings(a, b, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(b, a, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("sorts by setOrder when provided, ignoring setId", () => {
    const a = { ...base, setId: "ZZZ", setOrder: 0 };
    const b = { ...base, setId: "AAA", setOrder: 1 };
    expect(comparePrintings(a, b, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(b, a, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("falls back to setId when setOrder is not provided", () => {
    const a = { ...base, setId: "AAA" };
    const b = { ...base, setId: "ZZZ", setOrder: 0 };
    // Only b has setOrder, so falls back to setId string comparison
    expect(comparePrintings(a, b, TEST_FINISH_ORDER)).toBeLessThan(0);
  });

  it("sorts by shortCode when setId is equal", () => {
    const a = { ...base, shortCode: "SET-A-005" };
    const b = { ...base, shortCode: "SET-A-010" };
    expect(comparePrintings(a, b, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(b, a, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("sorts base variant before alt-art by short code", () => {
    const normal = { ...base, shortCode: "OGN-240" };
    const altart = { ...base, shortCode: "OGN-240a" };
    expect(comparePrintings(normal, altart, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(altart, normal, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("sorts unmarked before marked", () => {
    const normal = { ...base, markerSlugs: [] as string[] };
    const promo = { ...base, markerSlugs: ["promo"] };
    expect(comparePrintings(normal, promo, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(promo, normal, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("treats missing markerSlugs as unmarked", () => {
    const noPromo = { ...base };
    const promo = { ...base, markerSlugs: ["promo"] };
    expect(comparePrintings(noPromo, promo, TEST_FINISH_ORDER)).toBeLessThan(0);
  });

  it("sorts normal finish before foil", () => {
    const normal = { ...base, finish: "normal" };
    const foil = { ...base, finish: "foil" };
    expect(comparePrintings(normal, foil, TEST_FINISH_ORDER)).toBeLessThan(0);
    expect(comparePrintings(foil, normal, TEST_FINISH_ORDER)).toBeGreaterThan(0);
  });

  it("handles null setId by treating it as empty string", () => {
    const nullSet = { ...base, setId: null };
    const emptySet = { ...base, setId: "" };
    expect(comparePrintings(nullSet, emptySet, TEST_FINISH_ORDER)).toBe(0);
  });

  it("handles undefined setId by treating it as empty string", () => {
    const undefinedSet = { ...base, setId: undefined };
    const emptySet = { ...base, setId: "" };
    expect(comparePrintings(undefinedSet, emptySet, TEST_FINISH_ORDER)).toBe(0);
  });

  it("applies tiebreakers in correct priority order", () => {
    // Same set and shortCode — promo status decides before finish
    const a = { ...base, markerSlugs: [] as string[], finish: "foil" };
    const b = { ...base, markerSlugs: ["promo"], finish: "normal" };
    expect(comparePrintings(a, b, TEST_FINISH_ORDER)).toBeLessThan(0);
  });
});

describe("toCents", () => {
  it("returns null for null input", () => {
    expect(toCents(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toCents(undefined)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(toCents(0)).toBeNull();
  });

  it("converts dollar amounts to cents", () => {
    expect(toCents(1.5)).toBe(150);
    expect(toCents(9.99)).toBe(999);
    expect(toCents(0.01)).toBe(1);
  });

  it("rounds fractional cents using Math.round", () => {
    // 1.005 * 100 = 100.49999... in IEEE 754, so Math.round gives 100
    expect(toCents(1.005)).toBe(100);
    // 0.1 + 0.2 = 0.30000000000000004, * 100 = 30.000000000000004, rounds to 30
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("handles negative amounts", () => {
    expect(toCents(-5.25)).toBe(-525);
  });
});

describe("centsToDollars", () => {
  it("returns null for null input", () => {
    expect(centsToDollars(null)).toBeNull();
  });

  it("converts cents to dollars", () => {
    expect(centsToDollars(150)).toBe(1.5);
    expect(centsToDollars(999)).toBe(9.99);
    expect(centsToDollars(1)).toBe(0.01);
  });

  it("converts zero cents to zero dollars", () => {
    expect(centsToDollars(0)).toBe(0);
  });

  it("handles negative cent values", () => {
    expect(centsToDollars(-525)).toBe(-5.25);
  });
});

describe("formatDateUTC", () => {
  it("formats a Date object to YYYY-MM-DD", () => {
    const date = new Date("2024-06-15T10:30:00Z");
    expect(formatDateUTC(date)).toBe("2024-06-15");
  });

  it("formats an ISO string to YYYY-MM-DD", () => {
    expect(formatDateUTC("2024-01-01T00:00:00.000Z")).toBe("2024-01-01");
  });

  it("handles date-only string input", () => {
    expect(formatDateUTC("2023-12-25")).toBe("2023-12-25");
  });

  it("uses UTC so timezone does not shift the date", () => {
    // A date near midnight UTC - toISOString always returns UTC
    const date = new Date("2024-03-01T23:59:59Z");
    expect(formatDateUTC(date)).toBe("2024-03-01");
  });
});

describe("emptyToNull", () => {
  it("returns null for empty string", () => {
    expect(emptyToNull("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(emptyToNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(emptyToNull(undefined)).toBeNull();
  });

  it("returns the string for non-empty input", () => {
    expect(emptyToNull("hello")).toBe("hello");
  });

  it("returns the string for whitespace-only input", () => {
    // Whitespace is truthy, so it passes through
    expect(emptyToNull("  ")).toBe("  ");
  });
});

describe("getOrientation", () => {
  it("returns landscape for Battlefield type", () => {
    expect(getOrientation("Battlefield")).toBe("landscape");
  });

  it("returns portrait for Unit type", () => {
    expect(getOrientation("Unit")).toBe("portrait");
  });

  it("returns portrait for Spell type", () => {
    expect(getOrientation("Spell")).toBe("portrait");
  });

  it("returns portrait for Legend type", () => {
    expect(getOrientation("Legend")).toBe("portrait");
  });

  it("returns portrait for Rune type", () => {
    expect(getOrientation("Rune")).toBe("portrait");
  });

  it("returns portrait for Gear type", () => {
    expect(getOrientation("Gear")).toBe("portrait");
  });
});

describe("mostCommonValue", () => {
  it("returns empty string for empty array", () => {
    expect(mostCommonValue([])).toBe("");
  });

  it("returns the single element for single-element array", () => {
    expect(mostCommonValue(["hello"])).toBe("hello");
  });

  it("returns the most frequent value", () => {
    expect(mostCommonValue(["a", "b", "a", "c", "a"])).toBe("a");
  });

  it("returns the first most-frequent value when tied", () => {
    expect(mostCommonValue(["a", "b", "b", "a"])).toBe("a");
  });

  it("handles all-same values", () => {
    expect(mostCommonValue(["x", "x", "x"])).toBe("x");
  });

  it("handles all-unique values (returns first)", () => {
    expect(mostCommonValue(["a", "b", "c"])).toBe("a");
  });
});

describe("formatShortCodes", () => {
  it("returns empty string for empty array", () => {
    expect(formatShortCodes([])).toBe("");
  });

  it("returns a single code without count", () => {
    expect(formatShortCodes(["OGN-027"])).toBe("OGN-027");
  });

  it("returns multiple unique codes preserving input order", () => {
    expect(formatShortCodes(["OGN-027", "OGN-001"])).toBe("OGN-027, OGN-001");
  });

  it("adds count for duplicates", () => {
    expect(formatShortCodes(["OGN-027", "OGN-027"])).toBe("OGN-027 ×2");
  });

  it("mixes single and duplicate codes preserving first-occurrence order", () => {
    expect(formatShortCodes(["OGN-027", "OGN-001", "OGN-027"])).toBe("OGN-027 ×2, OGN-001");
  });

  it("preserves input order", () => {
    expect(formatShortCodes(["ZZZ-001", "AAA-001", "MMM-001"])).toBe("ZZZ-001, AAA-001, MMM-001");
  });

  it("handles triple duplicates", () => {
    expect(formatShortCodes(["OGN-027", "OGN-027", "OGN-027"])).toBe("OGN-027 ×3");
  });

  it("handles codes with variant suffixes", () => {
    expect(formatShortCodes(["OGN-027a", "OGN-027", "OGN-027a"])).toBe("OGN-027a ×2, OGN-027");
  });
});

describe("compareWithLanguagePreference", () => {
  const enPrinting = makePrinting({ id: "en", language: "EN" });
  const zhPrinting = makePrinting({ id: "zh", language: "ZH" });

  it("prefers EN over ZH with single-language preference ['EN']", () => {
    expect(compareWithLanguagePreference(enPrinting, zhPrinting, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(zhPrinting, enPrinting, ["EN"])).toBeGreaterThan(0);
  });

  it("prefers ZH over EN with single-language preference ['ZH']", () => {
    expect(compareWithLanguagePreference(zhPrinting, enPrinting, ["ZH"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(enPrinting, zhPrinting, ["ZH"])).toBeGreaterThan(0);
  });

  it("prefers EN over ZH with multi-language preference ['EN', 'ZH']", () => {
    expect(compareWithLanguagePreference(enPrinting, zhPrinting, ["EN", "ZH"])).toBeLessThan(0);
  });

  it("returns 0 for same language with equal canonicalRank", () => {
    expect(compareWithLanguagePreference(enPrinting, enPrinting, ["EN"])).toBe(0);
  });

  it("sorts unlisted languages alphabetically after listed ones", () => {
    const dePrinting = makePrinting({ id: "de", language: "DE" });
    const frPrinting = makePrinting({ id: "fr", language: "FR" });
    // Preference is EN only — DE and FR are both unlisted, should sort alphabetically
    expect(compareWithLanguagePreference(dePrinting, frPrinting, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(frPrinting, dePrinting, ["EN"])).toBeGreaterThan(0);
  });

  it("uses canonicalRank as the tiebreaker when languages are equal", () => {
    const low = makePrinting({ id: "low", language: "EN", canonicalRank: 1 });
    const high = makePrinting({ id: "high", language: "EN", canonicalRank: 2 });
    expect(compareWithLanguagePreference(low, high, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(high, low, ["EN"])).toBeGreaterThan(0);
  });
});

describe("deduplicateByCard", () => {
  it("picks EN printing when language preference is ['EN']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const zhPrinting = makePrinting({ id: "zh", language: "ZH" });
    // ZH first in array to prove deduplication respects preference, not insertion order
    const result = deduplicateByCard([zhPrinting, enPrinting], ["EN"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("en");
  });

  it("picks ZH printing when language preference is ['ZH']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const zhPrinting = makePrinting({ id: "zh", language: "ZH" });
    const result = deduplicateByCard([enPrinting, zhPrinting], ["ZH"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("zh");
  });
});

describe("preferredPrinting", () => {
  it("returns EN printing with single-language preference ['EN']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const zhPrinting = makePrinting({ id: "zh", language: "ZH" });
    const result = preferredPrinting([zhPrinting, enPrinting], ["EN"]);
    expect(result?.id).toBe("en");
  });

  it("returns undefined for empty array", () => {
    expect(preferredPrinting([], ["EN"])).toBeUndefined();
  });
});
