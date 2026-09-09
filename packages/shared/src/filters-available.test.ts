import { describe, expect, it } from "vitest";

import { getAvailableFilters as getAvailableFiltersRaw } from "./filters-available.js";
import { getTestPrice, makePrinting, TEST_ORDERS, withPrice } from "./filters-test-helpers.js";
import type { Printing } from "./types/catalog.js";

function getAvailableFilters(
  printings: Printing[],
  options: Partial<Parameters<typeof getAvailableFiltersRaw>[1]> = {},
) {
  return getAvailableFiltersRaw(printings, { orders: TEST_ORDERS, ...options });
}

describe("getAvailableFilters", () => {
  const printings = [
    makePrinting({
      rarity: "epic",
      setSlug: "Set Alpha",
      artVariant: "altart",
      finish: "normal",
      cardId: "1",
      card: {
        name: "Test",
        type: "spell",
        superTypes: ["basic"],
        domains: ["mind", "chaos"],
        energy: 2,
        might: 0,
        power: 0,
        keywords: [],
        tags: [],
        mightBonus: null,
        errata: null,
      },
    }),
    makePrinting({
      rarity: "common",
      setSlug: "Set Beta",
      artVariant: "normal",
      finish: "normal",
      cardId: "2",
      card: {
        name: "Test2",
        type: "unit",
        superTypes: ["champion"],
        domains: ["fury"],
        energy: 5,
        might: 4,
        power: 6,
        keywords: [],
        tags: [],
        mightBonus: null,
        errata: null,
      },
    }),
    makePrinting({
      rarity: "rare",
      setSlug: "Set Alpha",
      artVariant: "normal",
      finish: "foil",
      cardId: "3",
      card: {
        name: "Test3",
        type: "unit",
        superTypes: [],
        domains: ["colorless"],
        energy: 3,
        might: 2,
        power: 3,
        keywords: [],
        tags: [],
        mightBonus: null,
        errata: null,
      },
    }),
  ];

  it("collects unique sets preserving order of appearance", () => {
    const result = getAvailableFilters(printings);
    expect(result.sets).toEqual(["Set Alpha", "Set Beta"]);
  });

  it("sorts rarities by RARITY_ORDER", () => {
    const result = getAvailableFilters(printings);
    expect(result.rarities).toEqual(["common", "rare", "epic"]);
  });

  it("sorts types by cardTypes order", () => {
    const result = getAvailableFilters(printings);
    expect(result.types).toEqual(["unit", "spell"]);
  });

  it("excludes Basic from superTypes", () => {
    const result = getAvailableFilters(printings);
    expect(result.superTypes).not.toContain("basic");
    expect(result.superTypes).toContain("champion");
  });

  it("sorts Colorless last in domains", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains.at(-1)).toBe("colorless");
  });

  it("lists individual domains from multi-domain cards", () => {
    const result = getAvailableFilters(printings);
    expect(result.domains).toContain("mind");
    expect(result.domains).toContain("chaos");
  });

  it("sorts artVariants in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.artVariants).toEqual(["normal", "altart"]);
  });

  it("sorts finishes in canonical order", () => {
    const result = getAvailableFilters(printings);
    expect(result.finishes).toEqual(["normal", "foil"]);
  });

  it("surfaces card sizes in canonical order", () => {
    const result = getAvailableFilters([
      makePrinting({ id: "ovr", size: "oversized" }),
      makePrinting({ id: "std", size: "standard" }),
    ]);
    expect(result.cardSizes).toEqual(["standard", "oversized"]);
  });

  it("computes correct stat ranges", () => {
    const result = getAvailableFilters(printings);
    expect(result.energy).toEqual({ min: 2, max: 5 });
    expect(result.might).toEqual({ min: 0, max: 4 });
    expect(result.power).toEqual({ min: 0, max: 6 });
  });

  it("computes price range from printings with prices", () => {
    const withPrices = [withPrice(makePrinting(), 2.5), withPrice(makePrinting(), 25.3)];
    const result = getAvailableFilters(withPrices, { getPrice: getTestPrice });
    expect(result.price).toEqual({ min: 2, max: 26 }); // floor(2.5), ceil(25.3)
  });

  it("returns 0 price range when no getPrice resolver is supplied", () => {
    const withPrices = [withPrice(makePrinting(), 2.5), withPrice(makePrinting(), 25.3)];
    const result = getAvailableFilters(withPrices);
    expect(result.price).toEqual({ min: 0, max: 0 });
  });

  it("returns 0 price range when no printings have prices", () => {
    const result = getAvailableFilters([makePrinting()]);
    expect(result.price).toEqual({ min: 0, max: 0 });
  });

  it("computes hasSigned when signed printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({ isSigned: true }),
      makePrinting({ isSigned: false }),
    ]);
    expect(result.hasSigned).toBe(true);
  });

  it("computes hasSigned false when no signed printings", () => {
    const result = getAvailableFilters([makePrinting({ isSigned: false })]);
    expect(result.hasSigned).toBe(false);
  });

  it("computes hasOvernumbered when overnumbered printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({ isOvernumbered: true }),
      makePrinting({ isOvernumbered: false }),
    ]);
    expect(result.hasOvernumbered).toBe(true);
  });

  it("computes hasOvernumbered false when no overnumbered printings", () => {
    const result = getAvailableFilters([makePrinting({ isOvernumbered: false })]);
    expect(result.hasOvernumbered).toBe(false);
  });

  it("computes hasNoImage when a printing has no image", () => {
    const result = getAvailableFilters([makePrinting({ images: [] }), makePrinting({})]);
    expect(result.hasNoImage).toBe(true);
  });

  it("computes hasNoImage false when every printing has an image", () => {
    const result = getAvailableFilters([makePrinting({})]);
    expect(result.hasNoImage).toBe(false);
  });

  it("computes hasNonStandard true when a non-standard printing exists", () => {
    const result = getAvailableFilters([
      makePrinting({ rarity: "common", finish: "normal", card: { slug: "a" } }),
      makePrinting({ rarity: "common", finish: "foil", card: { slug: "b" } }),
    ]);
    expect(result.hasNonStandard).toBe(true);
  });

  it("computes hasNonStandard false when every printing is standard", () => {
    const result = getAvailableFilters([makePrinting({ rarity: "common", finish: "normal" })]);
    expect(result.hasNonStandard).toBe(false);
  });

  it("handles empty array", () => {
    const result = getAvailableFilters([]);
    expect(result.sets).toEqual([]);
    expect(result.rarities).toEqual([]);
    expect(result.types).toEqual([]);
    expect(result.superTypes).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.artVariants).toEqual([]);
    expect(result.finishes).toEqual([]);
    expect(result.energy).toEqual({ min: 0, max: 0 });
    expect(result.price).toEqual({ min: 0, max: 0 });
    expect(result.hasSigned).toBe(false);
  });

  it("lists markers when marked printings exist", () => {
    const result = getAvailableFilters([
      makePrinting({
        markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
      }),
      makePrinting({ markers: [] }),
    ]);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]!.slug).toBe("promo");
  });

  it("lists no markers when no marked printings", () => {
    const result = getAvailableFilters([makePrinting({ markers: [] })]);
    expect(result.markers).toHaveLength(0);
  });

  it("handles printings with null energy/might/power", () => {
    const result = getAvailableFilters([
      makePrinting({
        cardId: "null-stats",
        card: {
          name: "Null Stats",
          type: "spell",
          superTypes: [],
          domains: [],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ]);
    expect(result.energy).toEqual({ min: 0, max: 0 });
    expect(result.might).toEqual({ min: 0, max: 0 });
    expect(result.power).toEqual({ min: 0, max: 0 });
    expect(result.hasNullEnergy).toBe(true);
    expect(result.hasNullMight).toBe(true);
    expect(result.hasNullPower).toBe(true);
  });

  it("computes hasNull flags as false when all cards have stats", () => {
    const result = getAvailableFilters([
      makePrinting({ cardId: "1", card: { energy: 3, might: 2, power: 4 } }),
    ]);
    expect(result.hasNullEnergy).toBe(false);
    expect(result.hasNullMight).toBe(false);
    expect(result.hasNullPower).toBe(false);
  });

  it("handles null artVariant by treating it as normal", () => {
    const result = getAvailableFilters([makePrinting({ artVariant: null as unknown as "normal" })]);
    expect(result.artVariants).toContain("normal");
  });

  it("deduplicates domains from multiple printings", () => {
    const result = getAvailableFilters([
      makePrinting({
        cardId: "1",
        card: {
          name: "A",
          type: "unit",
          superTypes: [],
          domains: ["fury", "mind"],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
      makePrinting({
        cardId: "2",
        card: {
          name: "B",
          type: "unit",
          superTypes: [],
          domains: ["mind", "chaos"],
          energy: null,
          might: null,
          power: null,
          keywords: [],
          tags: [],
          mightBonus: null,
          errata: null,
        },
      }),
    ]);
    const mindCount = result.domains.filter((d) => d === "mind").length;
    expect(mindCount).toBe(1);
  });
});
