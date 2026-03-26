import { describe, expect, it } from "bun:test";

import type { ArtVariant, Finish, Rarity } from "./types/index";
import {
  boundsOf,
  buildPrintingId,
  centsToDollars,
  comparePrintings,
  emptyToNull,
  formatDateUTC,
  normalizeNameForMatching,
  toCents,
  unique,
} from "./utils";

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

describe("buildPrintingId", () => {
  it("builds a basic non-promo slug", () => {
    expect(buildPrintingId("OGN-001", null, "normal")).toBe("OGN-001:normal:");
  });

  it("includes promo type slug when provided", () => {
    expect(buildPrintingId("OGN-001", "promo", "foil")).toBe("OGN-001:foil:promo");
  });

  it("includes specific promo type slug", () => {
    expect(buildPrintingId("OGN-001", "nexus-night", "foil")).toBe("OGN-001:foil:nexus-night");
  });

  it("preserves finish value", () => {
    expect(buildPrintingId("OGN-105", null, "normal")).toBe("OGN-105:normal:");
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
    collectorNumber: 1,
    artVariant: "normal" as ArtVariant,
    rarity: "Common" as Rarity,
    finish: "normal" as Finish,
    isSigned: false,
  };

  it("returns 0 for identical printings", () => {
    expect(comparePrintings(base, { ...base })).toBe(0);
  });

  it("sorts by setId first", () => {
    const a = { ...base, setId: "AAA" };
    const b = { ...base, setId: "ZZZ" };
    expect(comparePrintings(a, b)).toBeLessThan(0);
    expect(comparePrintings(b, a)).toBeGreaterThan(0);
  });

  it("sorts by setOrder when provided, ignoring setId", () => {
    const a = { ...base, setId: "ZZZ", setOrder: 0 };
    const b = { ...base, setId: "AAA", setOrder: 1 };
    expect(comparePrintings(a, b)).toBeLessThan(0);
    expect(comparePrintings(b, a)).toBeGreaterThan(0);
  });

  it("falls back to setId when setOrder is not provided", () => {
    const a = { ...base, setId: "AAA" };
    const b = { ...base, setId: "ZZZ", setOrder: 0 };
    // Only b has setOrder, so falls back to setId string comparison
    expect(comparePrintings(a, b)).toBeLessThan(0);
  });

  it("sorts by collectorNumber when setId is equal", () => {
    const a = { ...base, collectorNumber: 5 };
    const b = { ...base, collectorNumber: 10 };
    expect(comparePrintings(a, b)).toBeLessThan(0);
    expect(comparePrintings(b, a)).toBeGreaterThan(0);
  });

  it("sorts by artVariant order (null treated as normal)", () => {
    const a = { ...base, artVariant: null };
    const normalExplicit = { ...base, artVariant: "normal" as ArtVariant };
    // null and "normal" should be equivalent
    expect(comparePrintings(a, normalExplicit)).toBe(0);

    const altart = { ...base, artVariant: "altart" as ArtVariant };
    expect(comparePrintings(a, altart)).toBeLessThan(0);
    expect(comparePrintings(altart, a)).toBeGreaterThan(0);
  });

  it("sorts by rarity order", () => {
    const common = { ...base, rarity: "Common" as Rarity };
    const epic = { ...base, rarity: "Epic" as Rarity };
    expect(comparePrintings(common, epic)).toBeLessThan(0);
    expect(comparePrintings(epic, common)).toBeGreaterThan(0);
  });

  it("sorts by finish order (normal before foil)", () => {
    const normal = { ...base, finish: "normal" as Finish };
    const foil = { ...base, finish: "foil" as Finish };
    expect(comparePrintings(normal, foil)).toBeLessThan(0);
    expect(comparePrintings(foil, normal)).toBeGreaterThan(0);
  });

  it("sorts unsigned before signed", () => {
    const unsigned = { ...base, isSigned: false };
    const signed = { ...base, isSigned: true };
    expect(comparePrintings(unsigned, signed)).toBeLessThan(0);
    expect(comparePrintings(signed, unsigned)).toBeGreaterThan(0);
  });

  it("sorts non-promo before promo", () => {
    const normal = { ...base, promoTypeSlug: null };
    const promo = { ...base, promoTypeSlug: "promo" };
    expect(comparePrintings(normal, promo)).toBeLessThan(0);
    expect(comparePrintings(promo, normal)).toBeGreaterThan(0);
  });

  it("treats missing promoTypeSlug as non-promo", () => {
    const noPromo = { ...base };
    const promo = { ...base, promoTypeSlug: "promo" };
    expect(comparePrintings(noPromo, promo)).toBeLessThan(0);
  });

  it("sorts promo types alphabetically", () => {
    const a = { ...base, promoTypeSlug: "alpha" };
    const b = { ...base, promoTypeSlug: "beta" };
    expect(comparePrintings(a, b)).toBeLessThan(0);
    expect(comparePrintings(b, a)).toBeGreaterThan(0);
  });

  it("handles null setId by treating it as empty string", () => {
    const nullSet = { ...base, setId: null };
    const emptySet = { ...base, setId: "" };
    expect(comparePrintings(nullSet, emptySet)).toBe(0);
  });

  it("handles undefined setId by treating it as empty string", () => {
    const undefinedSet = { ...base, setId: undefined };
    const emptySet = { ...base, setId: "" };
    expect(comparePrintings(undefinedSet, emptySet)).toBe(0);
  });

  it("applies tiebreakers in correct priority order", () => {
    // Same set and collector number, but different art variant and rarity
    const a = { ...base, artVariant: "normal" as ArtVariant, rarity: "Epic" as Rarity };
    const b = { ...base, artVariant: "altart" as ArtVariant, rarity: "Common" as Rarity };
    // artVariant should decide before rarity: normal(0) < altart(1)
    expect(comparePrintings(a, b)).toBeLessThan(0);
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
