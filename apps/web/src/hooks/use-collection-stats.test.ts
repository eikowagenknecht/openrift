import type { Card, Domain, Printing, SetListEntry } from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { afterEach, describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { resetIdCounter, stubPriceLookup, stubPrinting } from "@/test/factories";

import {
  MAX_EXPENSIVE_PRINTINGS,
  computeCollectionStats,
  computeCompletion,
  excludeUnreleasedSets,
  filterByScope,
  filterStacksByScope,
  matchesScope,
} from "./use-collection-stats";

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

  it("ranks the priciest printings descending and caps the list", () => {
    const stacks = Array.from({ length: MAX_EXPENSIVE_PRINTINGS + 3 }, (_, index) =>
      stubStack({ card: { slug: `card-${index}` } }),
    );
    const prices = stubPriceLookup(
      Object.fromEntries(
        stacks.map((stack, index) => [stack.printingId, { tcgplayer: index + 1 }]),
      ),
    );

    const stats = computeCollectionStats({
      stacks,
      totalCopies: stacks.length,
      sets: [],
      prices,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.mostExpensivePrintings).toHaveLength(MAX_EXPENSIVE_PRINTINGS);
    expect(stats.mostExpensivePrintings[0]?.price).toBe(stacks.length);
    expect(stats.mostExpensivePrintings.at(-1)?.price).toBe(
      stacks.length - MAX_EXPENSIVE_PRINTINGS + 1,
    );
  });

  it("omits unpriced and zero-priced printings from the expensive list", () => {
    const priced = stubStack({ card: { slug: "fireball" } });
    const free = stubStack({ card: { slug: "icebolt" } });
    const unpriced = stubStack({ card: { slug: "shockbolt" } });

    const prices = stubPriceLookup({
      [priced.printingId]: { tcgplayer: 4 },
      [free.printingId]: { tcgplayer: 0 },
    });

    const stats = computeCollectionStats({
      stacks: [priced, free, unpriced],
      totalCopies: 3,
      sets: [],
      prices,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.mostExpensivePrintings).toHaveLength(1);
    expect(stats.mostExpensivePrintings[0]?.cardSlug).toBe("fireball");
    expect(stats.unpricedCount).toBe(1);
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

  it("treats [Unique] non-legend cards as a 1-copy playset in copies mode", () => {
    // Regression: the local copies-target ignored the [Unique] keyword, so a
    // Unique card counted as a playset of 3 in stats while the deck builder
    // (getPlaysetSize) treats it as 1. Both now route through getPlaysetSize.
    const uniqueRelic = stubStack({
      copyCount: 1,
      card: { slug: "relic", type: "unit", keywords: ["Unique"] },
      setId: "set-1",
    });

    const entries = computeCompletion({
      stacks: [uniqueRelic],
      scopedPrintings: [uniqueRelic.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "type",
      countMode: "copies",
      orders: ORDERS,
    });

    const unitEntry = entries.find((entry) => entry.key === "unit");
    expect(unitEntry?.total).toBe(1); // [Unique] → playset of 1, not 3
    expect(unitEntry?.owned).toBe(1);
  });

  it("leaves runes and Other out of copies mode", () => {
    // Runes are a shared basic supply and "Other" never enters a deck, so
    // neither has a playset to chase. Counting them charged a target of 3 each
    // and sank the completion percentage against a goal nobody plays towards.
    const rune = stubStack({ copyCount: 1, card: { slug: "fury-rune", type: "rune" } });
    const other = stubStack({ copyCount: 1, card: { slug: "oddity", type: "other" } });
    const unit = stubStack({ copyCount: 2, card: { slug: "soldier", type: "unit" } });
    const input = {
      stacks: [rune, other, unit],
      scopedPrintings: [rune.printing, other.printing, unit.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "type" as const,
      orders: ORDERS,
    };

    const copies = computeCompletion({ ...input, countMode: "copies" });
    expect(copies.find((entry) => entry.key === "rune")).toBeUndefined();
    expect(copies.find((entry) => entry.key === "other")).toBeUndefined();
    expect(copies.find((entry) => entry.key === "unit")?.total).toBe(3);

    // Only the playset mode drops them — cards mode still counts every card.
    const cards = computeCompletion({ ...input, countMode: "cards" });
    expect(cards.find((entry) => entry.key === "rune")?.total).toBe(1);
    expect(cards.find((entry) => entry.key === "other")?.total).toBe(1);
  });

  it("keeps runes out of a mixed group's copies totals", () => {
    // Grouped by set, the rune shares a row with the unit, so it has to drop
    // out of the sum rather than the whole row.
    const rune = stubStack({
      copyCount: 3,
      card: { slug: "fury-rune", type: "rune" },
      setId: "s1",
    });
    const unit = stubStack({ copyCount: 1, card: { slug: "soldier", type: "unit" }, setId: "s1" });

    const entries = computeCompletion({
      stacks: [rune, unit],
      scopedPrintings: [rune.printing, unit.printing],
      scope: {},
      sets: [stubSet({ id: "s1" })],
      groupBy: "set",
      countMode: "copies",
      orders: ORDERS,
    });

    expect(entries[0].total).toBe(3); // the unit's playset alone
    expect(entries[0].owned).toBe(1); // the rune's 3 copies don't count
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

  it("renders display labels (not slugs) for domain/rarity/type group rows", () => {
    const stack = stubStack({
      card: { slug: "a", domains: ["fury"] as Domain[], type: "unit" },
      rarity: "common",
      setId: "set-1",
    });
    const labels = {
      domains: { fury: "Fury", calm: "Calm" },
      rarities: { common: "Common", rare: "Rare" },
      cardTypes: { unit: "Unit", spell: "Spell" },
    };

    const byDomain = computeCompletion({
      stacks: [stack],
      scopedPrintings: [stack.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "domain",
      countMode: "cards",
      orders: ORDERS,
      labels,
    });
    expect(byDomain.find((entry) => entry.key === "fury")?.label).toBe("Fury");

    const byRarity = computeCompletion({
      stacks: [stack],
      scopedPrintings: [stack.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "rarity",
      countMode: "cards",
      orders: ORDERS,
      labels,
    });
    expect(byRarity.find((entry) => entry.key === "common")?.label).toBe("Common");

    const byType = computeCompletion({
      stacks: [stack],
      scopedPrintings: [stack.printing],
      scope: {},
      sets: [stubSet({ id: "set-1" })],
      groupBy: "type",
      countMode: "cards",
      orders: ORDERS,
      labels,
    });
    expect(byType.find((entry) => entry.key === "unit")?.label).toBe("Unit");
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

  it("applies an exclude-only scope", () => {
    // Regression: `scopeHasFilters` looked at the include arrays alone, so an
    // exclude-only scope short-circuited to "no filters" and returned the
    // input untouched.
    const en = stubPrinting({ language: "EN" });
    const ja = stubPrinting({ language: "JA" });
    const result = filterByScope([en, ja], { languagesExclude: ["JA"] });
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("EN");
  });

  it("resolves custom tags through the assignment map", () => {
    const staple = stubPrinting({ cardId: "card-staple" });
    const other = stubPrinting({ cardId: "card-other" });
    const assignments = { "card-staple": ["staple"] };
    const result = filterByScope([staple, other], { customTags: ["staple"] }, assignments);
    expect(result).toEqual([staple]);
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

describe("filterStacksByScope", () => {
  it("returns all stacks when scope is empty", () => {
    const stacks = [stubStack({ language: "EN" }), stubStack({ language: "JA" })];
    expect(filterStacksByScope(stacks, {})).toHaveLength(2);
  });

  it("keeps only stacks whose printing matches", () => {
    const en = stubStack({ language: "EN" });
    const ja = stubStack({ language: "JA" });
    const result = filterStacksByScope([en, ja], { languages: ["EN"] });
    expect(result).toEqual([en]);
  });

  it("combines multiple scope filters", () => {
    const enNormal = stubStack({ language: "EN", finish: "normal" });
    const enFoil = stubStack({ language: "EN", finish: "foil" });
    const jaNormal = stubStack({ language: "JA", finish: "normal" });
    const result = filterStacksByScope([enNormal, enFoil, jaNormal], {
      languages: ["EN"],
      finishes: ["normal"],
    });
    expect(result).toEqual([enNormal]);
  });

  it("narrows estimated value to the scope, matching the value chart", () => {
    // The chart on the stats page applies the page's scope server-side. The
    // hero stats have to run their totals over the same subset or the two
    // figures disagree with nothing on screen explaining why.
    const en = stubStack({ language: "EN", copyCount: 2 });
    const ja = stubStack({ language: "JA", copyCount: 3 });
    const prices = stubPriceLookup({
      [en.printingId]: { tcgplayer: 5 },
      [ja.printingId]: { tcgplayer: 100 },
    });

    const scoped = filterStacksByScope([en, ja], { languages: ["EN"] });
    const stats = computeCollectionStats({
      stacks: scoped,
      totalCopies: scoped.reduce((sum, stack) => sum + stack.copyIds.length, 0),
      sets: [],
      prices,
      marketplace: "tcgplayer",
      orders: ORDERS,
    });

    expect(stats.estimatedValue).toBe(10);
    expect(stats.totalCopies).toBe(2);
    expect(stats.uniquePrintings).toBe(1);
  });
});

describe("excludeUnreleasedSets", () => {
  it("returns sets and printings unchanged when everything is released", () => {
    const sets = [stubSet({ id: "set-1" }), stubSet({ id: "set-2", slug: "second" })];
    const printings = [stubPrinting({ setId: "set-1" }), stubPrinting({ setId: "set-2" })];
    const result = excludeUnreleasedSets({ sets, printings, stacks: [] });
    expect(result.sets).toBe(sets);
    expect(result.printings).toBe(printings);
  });

  it("hides unreleased sets and their printings", () => {
    const sets = [
      stubSet({ id: "set-1" }),
      stubSet({ id: "set-2", slug: "preview", released: false, releasedAt: null }),
    ];
    const released = stubPrinting({ setId: "set-1" });
    const preview = stubPrinting({ setId: "set-2" });
    const result = excludeUnreleasedSets({ sets, printings: [released, preview], stacks: [] });
    expect(result.sets.map((set) => set.id)).toEqual(["set-1"]);
    expect(result.printings).toEqual([released]);
  });

  it("keeps an unreleased set when the user owns cards from it", () => {
    const sets = [
      stubSet({ id: "set-1" }),
      stubSet({ id: "set-2", slug: "preview", released: false, releasedAt: null }),
    ];
    const printings = [stubPrinting({ setId: "set-1" }), stubPrinting({ setId: "set-2" })];
    const ownedStack = stubStack({ setId: "set-2" });
    const result = excludeUnreleasedSets({ sets, printings, stacks: [ownedStack] });
    expect(result.sets.map((set) => set.id)).toEqual(["set-1", "set-2"]);
    expect(result.printings).toHaveLength(2);
  });
});

describe("matchesScope", () => {
  it("matches every printing when the scope is empty", () => {
    expect(matchesScope(stubPrinting(), {})).toBe(true);
  });

  it("filters by set, language, rarity, finish, and art variant", () => {
    const printing = stubPrinting({
      setSlug: "RB1",
      language: "EN",
      rarity: "common",
      finish: "normal",
      artVariant: "normal",
    });
    expect(matchesScope(printing, { sets: ["RB1"] })).toBe(true);
    expect(matchesScope(printing, { sets: ["RB2"] })).toBe(false);
    expect(matchesScope(printing, { languages: ["DE"] })).toBe(false);
    expect(matchesScope(printing, { rarities: ["rare"] })).toBe(false);
    expect(matchesScope(printing, { finishes: ["foil"] })).toBe(false);
    expect(matchesScope(printing, { artVariants: ["showcase"] })).toBe(false);
  });

  it("matches a multi-domain card when any of its domains is in scope", () => {
    const printing = stubPrinting({ card: { domains: ["fury", "calm"] as Domain[] } });
    expect(matchesScope(printing, { domains: ["calm"] })).toBe(true);
    expect(matchesScope(printing, { domains: ["mind"] })).toBe(false);
  });

  it("filters by card type", () => {
    const printing = stubPrinting({ card: { type: "unit" } });
    expect(matchesScope(printing, { types: ["unit"] })).toBe(true);
    expect(matchesScope(printing, { types: ["spell"] })).toBe(false);
  });

  it("filters promos by marker presence", () => {
    const noMarkers = stubPrinting({ markers: [] });
    expect(matchesScope(noMarkers, { promos: "exclude" })).toBe(true);
    expect(matchesScope(noMarkers, { promos: "only" })).toBe(false);
  });

  it("filters by signed, banned, and errata flags", () => {
    const plain = stubPrinting({ isSigned: false, card: { bans: [], errata: null } });
    expect(matchesScope(plain, { signed: true })).toBe(false);
    expect(matchesScope(plain, { signed: false })).toBe(true);
    expect(matchesScope(plain, { banned: true })).toBe(false);
    expect(matchesScope(plain, { banned: false })).toBe(true);
    expect(matchesScope(plain, { errata: true })).toBe(false);
    expect(matchesScope(plain, { errata: false })).toBe(true);
  });

  it("requires every active filter to pass (AND semantics)", () => {
    const printing = stubPrinting({ setSlug: "RB1", rarity: "common" });
    expect(matchesScope(printing, { sets: ["RB1"], rarities: ["common"] })).toBe(true);
    expect(matchesScope(printing, { sets: ["RB1"], rarities: ["rare"] })).toBe(false);
  });

  it("rejects a printing on any single-valued exclude axis", () => {
    // Regression: the scope carried no exclude arrays at all, so a filter chip
    // cycled into exclude-mode left every stats figure untouched.
    const printing = stubPrinting({
      setSlug: "RB1",
      language: "EN",
      rarity: "common",
      finish: "normal",
      artVariant: "normal",
    });
    expect(matchesScope(printing, { setsExclude: ["RB1"] })).toBe(false);
    expect(matchesScope(printing, { setsExclude: ["RB2"] })).toBe(true);
    expect(matchesScope(printing, { languagesExclude: ["EN"] })).toBe(false);
    expect(matchesScope(printing, { raritiesExclude: ["common"] })).toBe(false);
    expect(matchesScope(printing, { finishesExclude: ["normal"] })).toBe(false);
    expect(matchesScope(printing, { artVariantsExclude: ["normal"] })).toBe(false);
  });

  it("rejects a card when any of its domains or types is excluded", () => {
    const printing = stubPrinting({
      card: { domains: ["fury", "calm"] as Domain[], type: "unit" },
    });
    expect(matchesScope(printing, { domainsExclude: ["calm"] })).toBe(false);
    expect(matchesScope(printing, { domainsExclude: ["mind"] })).toBe(true);
    expect(matchesScope(printing, { typesExclude: ["unit"] })).toBe(false);
    expect(matchesScope(printing, { typesExclude: ["spell"] })).toBe(true);
  });

  it("filters by keywords, tags, custom tags and size", () => {
    // Regression: these chips render on the stats page but the scope ignored
    // them, so setting one narrowed nothing.
    const printing = stubPrinting({
      size: "standard",
      card: { keywords: ["Unique"], tags: ["champion-spell"] },
    });
    expect(matchesScope(printing, { keywords: ["Unique"] })).toBe(true);
    expect(matchesScope(printing, { keywords: ["Deflect"] })).toBe(false);
    expect(matchesScope(printing, { keywordsExclude: ["Unique"] })).toBe(false);
    expect(matchesScope(printing, { tags: ["champion-spell"] })).toBe(true);
    expect(matchesScope(printing, { tagsExclude: ["champion-spell"] })).toBe(false);
    expect(matchesScope(printing, { cardSizes: ["standard"] })).toBe(true);
    expect(matchesScope(printing, { cardSizes: ["oversized"] })).toBe(false);
    // Custom tags come from the assignment map, not the printing.
    expect(matchesScope(printing, { customTags: ["staple"] }, ["staple"])).toBe(true);
    expect(matchesScope(printing, { customTags: ["staple"] }, ["budget"])).toBe(false);
    expect(matchesScope(printing, { customTags: ["staple"] })).toBe(false);
    expect(matchesScope(printing, { customTagsExclude: ["staple"] }, ["staple"])).toBe(false);
  });

  it("applies presence constraints per dimension", () => {
    const withKeywords = stubPrinting({ card: { keywords: ["Unique"], tags: [] } });
    expect(matchesScope(withKeywords, { keywordsPresence: "any" })).toBe(true);
    expect(matchesScope(withKeywords, { keywordsPresence: "none" })).toBe(false);
    expect(matchesScope(withKeywords, { tagsPresence: "any" })).toBe(false);
    expect(matchesScope(withKeywords, { tagsPresence: "none" })).toBe(true);
    expect(matchesScope(withKeywords, { customTagsPresence: "any" }, ["staple"])).toBe(true);
    expect(matchesScope(withKeywords, { customTagsPresence: "any" })).toBe(false);
    expect(matchesScope(withKeywords, { customTagsPresence: "none" })).toBe(true);
  });

  it("filters by the standard-printing flag", () => {
    const plain = stubPrinting({
      artVariant: "normal",
      isSigned: false,
      markers: [],
      finish: "normal",
      rarity: "common",
    });
    const foilCommon = stubPrinting({
      artVariant: "normal",
      isSigned: false,
      markers: [],
      finish: "foil",
      rarity: "common",
    });
    expect(matchesScope(plain, { standard: true })).toBe(true);
    expect(matchesScope(plain, { standard: false })).toBe(false);
    // A foil common is premium, not the plain version of its card.
    expect(matchesScope(foilCommon, { standard: true })).toBe(false);
    expect(matchesScope(foilCommon, { standard: false })).toBe(true);
  });

  it("combines an include and an exclude across axes", () => {
    const printing = stubPrinting({ setSlug: "RB1", rarity: "common" });
    expect(matchesScope(printing, { sets: ["RB1"], raritiesExclude: ["rare"] })).toBe(true);
    expect(matchesScope(printing, { sets: ["RB1"], raritiesExclude: ["common"] })).toBe(false);
  });
});
