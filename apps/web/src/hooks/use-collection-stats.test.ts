import type { Card, Domain, Printing, SetListEntry } from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { afterEach, describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { resetIdCounter, stubPriceLookup, stubPrinting } from "@/test/factories";

import { computeCollectionStats, computeCompletion, filterByScope } from "./use-collection-stats";

const ORDERS = {
  domains: ["fury", "calm", "mind", "body", "chaos", "order", "colorless"] as const,
  rarities: ["common", "uncommon", "rare", "epic", "showcase"] as const,
  cardTypes: ["legend", "unit", "rune", "spell", "gear", "battlefield", "other"] as const,
};

function stubSet(overrides: Partial<SetListEntry> = {}): SetListEntry {
  return {
    id: overrides.id ?? "set-1",
    slug: overrides.slug ?? "origins",
    name: overrides.name ?? "Origins",
    releasedAt: overrides.releasedAt ?? "2025-01-01",
    released: overrides.released ?? true,
    setType: overrides.setType ?? "main",
    cardCount: overrides.cardCount ?? 100,
    printingCount: overrides.printingCount ?? 150,
    coverImageId: overrides.coverImageId ?? null,
  };
}

function stubStack(
  overrides: Omit<Partial<Printing>, "card"> & {
    copyCount?: number;
    card?: Partial<Card>;
  } = {},
): StackedEntry {
  const { copyCount = 1, ...printingOverrides } = overrides;
  const printing = stubPrinting(printingOverrides);
  return {
    printingId: printing.id,
    printing,
    copyIds: Array.from({ length: copyCount }, (_, index) => `copy-${printing.id}-${index}`),
  };
}

afterEach(() => {
  resetIdCounter();
});

describe("computeCollectionStats", () => {
  it("returns zeros for empty stacks", () => {
    const stats = computeCollectionStats({
      stacks: [],
      totalCopies: 0,
      sets: [stubSet()],
      prices: EMPTY_PRICE_LOOKUP,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.totalCopies).toBe(0);
    expect(stats.uniqueCards).toBe(0);
    expect(stats.uniquePrintings).toBe(0);
    expect(stats.completionPercent).toBe(0);
    expect(stats.domainDistribution).toEqual([]);
    expect(stats.energyCurve).toEqual([]);
    expect(stats.powerCurve).toEqual([]);
    expect(stats.typeBreakdown).toEqual([]);
  });

  it("computes hero stats for a single stack", () => {
    const stack = stubStack({
      copyCount: 3,
      card: { slug: "fireball", domains: ["fury"] as Domain[], energy: 2, power: 3 },
      setId: "set-1",
      rarity: "rare",
    });

    const stats = computeCollectionStats({
      stacks: [stack],
      totalCopies: 3,
      sets: [stubSet({ id: "set-1", cardCount: 50 })],
      prices: EMPTY_PRICE_LOOKUP,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.totalCopies).toBe(3);
    expect(stats.uniqueCards).toBe(1);
    expect(stats.uniquePrintings).toBe(1);
    expect(stats.completionPercent).toBeCloseTo((1 / 50) * 100);
    expect(stats.totalCardsInGame).toBe(50);
  });

  it("deduplicates unique cards by card slug", () => {
    const stack1 = stubStack({
      card: { slug: "fireball", domains: ["fury"] as Domain[] },
      setId: "set-1",
    });
    const stack2 = stubStack({
      card: { slug: "fireball", domains: ["fury"] as Domain[] },
      setId: "set-1",
    });
    const stack3 = stubStack({
      card: { slug: "icebolt", domains: ["calm"] as Domain[] },
      setId: "set-1",
    });

    const stats = computeCollectionStats({
      stacks: [stack1, stack2, stack3],
      totalCopies: 3,
      sets: [stubSet({ id: "set-1", cardCount: 100 })],
      prices: EMPTY_PRICE_LOOKUP,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.uniqueCards).toBe(2);
    expect(stats.uniquePrintings).toBe(3);
  });

  it("computes estimated value from prices", () => {
    const stack1 = stubStack({ copyCount: 2, card: { slug: "fireball" } });
    const stack2 = stubStack({ copyCount: 1, card: { slug: "icebolt" } });

    const prices = stubPriceLookup({
      [stack1.printingId]: { tcgplayer: 5.5 },
      [stack2.printingId]: { tcgplayer: 10 },
    });

    const stats = computeCollectionStats({
      stacks: [stack1, stack2],
      totalCopies: 3,
      sets: [],
      prices,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.estimatedValue).toBeCloseTo(21);
    expect(stats.unpricedCount).toBe(0);
  });

  it("counts multi-domain cards toward each domain", () => {
    const stack = stubStack({
      copyCount: 2,
      card: { slug: "firecalm", domains: ["fury", "calm"] as Domain[] },
    });

    const stats = computeCollectionStats({
      stacks: [stack],
      totalCopies: 2,
      sets: [],
      prices: EMPTY_PRICE_LOOKUP,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.domainDistribution).toEqual([
      { domain: "fury", count: 2 },
      { domain: "calm", count: 2 },
    ]);
  });

  it("handles zero total cards without NaN", () => {
    const stats = computeCollectionStats({
      stacks: [],
      totalCopies: 0,
      sets: [],
      prices: EMPTY_PRICE_LOOKUP,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.completionPercent).toBe(0);
    expect(Number.isNaN(stats.completionPercent)).toBe(false);
  });
});

describe("computeCompletion", () => {
  it("computes set completion by cards with deduplication", () => {
    const stack1 = stubStack({ card: { slug: "fireball" }, setId: "set-1" });
    const stack2 = stubStack({ card: { slug: "fireball" }, setId: "set-1" }); // same card, different printing
    const stack3 = stubStack({ card: { slug: "icebolt" }, setId: "set-1" });
    // Add unowned cards to the catalog so totals are higher than owned
    const unowned1 = stubPrinting({ card: { slug: "lightning" }, setId: "set-1" });
    const unowned2 = stubPrinting({ card: { slug: "heal" }, setId: "set-1" });
    const set = stubSet({ id: "set-1", cardCount: 10, printingCount: 15 });
    const allPrintings = [stack1.printing, stack2.printing, stack3.printing, unowned1, unowned2];

    const cards = computeCompletion({
      stacks: [stack1, stack2, stack3],
      scopedPrintings: allPrintings,
      scope: {},
      sets: [set],
      groupBy: "set",
      countMode: "cards",
      orders: ORDERS,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0].owned).toBe(2); // fireball + icebolt
    expect(cards[0].total).toBe(4); // fireball, icebolt, lightning, heal

    const printings = computeCompletion({
      stacks: [stack1, stack2, stack3],
      scopedPrintings: allPrintings,
      scope: {},
      sets: [set],
      groupBy: "set",
      countMode: "printings",
      orders: ORDERS,
    });

    expect(printings[0].owned).toBe(3); // 3 printing IDs owned
    expect(printings[0].total).toBe(5); // 5 printings in catalog
  });

  it("sorts set completion with main sets before supplemental", () => {
    const stack1 = stubStack({ card: { slug: "a" }, setId: "set-main" });
    const stack2 = stubStack({ card: { slug: "b" }, setId: "set-supp" });

    const entries = computeCompletion({
      stacks: [stack1, stack2],
      scopedPrintings: [stack1.printing, stack2.printing],
      scope: {},
      sets: [
        stubSet({
          id: "set-supp",
          slug: "supp",
          name: "Supp",
          setType: "supplemental",
          cardCount: 5,
        }),
        stubSet({ id: "set-main", slug: "main", name: "Main", setType: "main", cardCount: 50 }),
      ],
      groupBy: "set",
      countMode: "cards",
      orders: ORDERS,
    });

    expect(entries[0].setType).toBe("main");
    expect(entries[1].setType).toBe("supplemental");
  });

  it("computes rarity completion by cards and printings", () => {
    const printing1 = stubPrinting({ rarity: "common", card: { slug: "a" }, setId: "set-1" });
    const printing2 = stubPrinting({ rarity: "common", card: { slug: "b" }, setId: "set-1" });
    const printing3 = stubPrinting({ rarity: "rare", card: { slug: "c" }, setId: "set-1" });
    const catalogOnly = stubPrinting({ rarity: "common", card: { slug: "d" }, setId: "set-1" });

    const stacks: StackedEntry[] = [
      { printingId: printing1.id, printing: printing1, copyIds: ["c1", "c2", "c3"] },
      { printingId: printing2.id, printing: printing2, copyIds: ["c4", "c5"] },
      { printingId: printing3.id, printing: printing3, copyIds: ["c6"] },
    ];
    const allPrintings = [printing1, printing2, printing3, catalogOnly];

    const cards = computeCompletion({
      stacks,
      scopedPrintings: allPrintings,
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "rarity",
      countMode: "cards",
      orders: ORDERS,
    });

    const common = cards.find((entry) => entry.key === "common");
    expect(common?.owned).toBe(2);
    expect(common?.total).toBe(3);

    const printings = computeCompletion({
      stacks,
      scopedPrintings: allPrintings,
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "rarity",
      countMode: "printings",
      orders: ORDERS,
    });

    const commonP = printings.find((entry) => entry.key === "common");
    expect(commonP?.owned).toBe(2);
    expect(commonP?.total).toBe(3);
  });

  it("computes copies mode with type-based targets", () => {
    const legend = stubStack({
      copyCount: 1,
      card: { slug: "hero", type: "legend" },
      setId: "set-1",
    });
    const unit = stubStack({
      copyCount: 2,
      card: { slug: "soldier", type: "unit" },
      setId: "set-1",
    });

    const entries = computeCompletion({
      stacks: [legend, unit],
      scopedPrintings: [legend.printing, unit.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "type",
      countMode: "copies",
      orders: ORDERS,
    });

    const legendEntry = entries.find((entry) => entry.key === "legend");
    expect(legendEntry?.owned).toBe(1); // have 1, target is 1
    expect(legendEntry?.total).toBe(1);

    const unitEntry = entries.find((entry) => entry.key === "unit");
    expect(unitEntry?.owned).toBe(2); // have 2, target is 3
    expect(unitEntry?.total).toBe(3);
  });

  it("caps owned copies at target in copies mode", () => {
    const unit = stubStack({
      copyCount: 5,
      card: { slug: "soldier", type: "unit" },
      setId: "set-1",
    });

    const entries = computeCompletion({
      stacks: [unit],
      scopedPrintings: [unit.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "type",
      countMode: "copies",
      orders: ORDERS,
    });

    const unitEntry = entries.find((entry) => entry.key === "unit");
    expect(unitEntry?.owned).toBe(3); // capped at target of 3
    expect(unitEntry?.total).toBe(3);
  });

  it("computes domain completion from catalog totals", () => {
    const stack = stubStack({
      card: { slug: "a", domains: ["fury", "calm"] as Domain[] },
      setId: "set-1",
    });
    const catalogOnly = stubPrinting({
      card: { slug: "b", domains: ["fury"] as Domain[] },
      setId: "set-1",
    });

    const entries = computeCompletion({
      stacks: [stack],
      scopedPrintings: [stack.printing, catalogOnly],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "domain",
      countMode: "cards",
      orders: ORDERS,
    });

    const fury = entries.find((entry) => entry.key === "fury");
    const calm = entries.find((entry) => entry.key === "calm");
    expect(fury?.owned).toBe(1);
    expect(fury?.total).toBe(2);
    expect(calm?.owned).toBe(1);
    expect(calm?.total).toBe(1);
  });
});

describe("filterByScope", () => {
  it("returns all printings when scope is empty", () => {
    const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "JA" })];
    expect(filterByScope(printings, {})).toHaveLength(2);
  });

  it("filters by language", () => {
    const en = stubPrinting({ language: "EN" });
    const ja = stubPrinting({ language: "JA" });
    const result = filterByScope([en, ja], { languages: ["EN"] });
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("EN");
  });

  it("filters by finish", () => {
    const normal = stubPrinting({ finish: "normal" });
    const foil = stubPrinting({ finish: "foil" });
    const result = filterByScope([normal, foil], { finishes: ["normal"] });
    expect(result).toHaveLength(1);
    expect(result[0].finish).toBe("normal");
  });

  it("filters by art variant", () => {
    const normal = stubPrinting({ artVariant: "normal" });
    const alt = stubPrinting({ artVariant: "altart" });
    const result = filterByScope([normal, alt], { artVariants: ["normal"] });
    expect(result).toHaveLength(1);
    expect(result[0].artVariant).toBe("normal");
  });

  it("combines multiple scope filters", () => {
    const enNormal = stubPrinting({ language: "EN", finish: "normal" });
    const enFoil = stubPrinting({ language: "EN", finish: "foil" });
    const jaNormal = stubPrinting({ language: "JA", finish: "normal" });
    const result = filterByScope([enNormal, enFoil, jaNormal], {
      languages: ["EN"],
      finishes: ["normal"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(enNormal);
  });
});
