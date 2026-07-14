import type { CardFilters } from "@openrift/shared";
import { EMPTY_CARD_FILTERS, EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SetInfo } from "@/components/cards/card-grid";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { resetIdCounter, stubPrinting } from "@/test/factories";

const TEST_ORDERS = {
  rarities: ["common", "uncommon", "rare", "epic"],
  finishes: ["normal", "foil"],
  domains: ["fury"],
  cardTypes: ["unit"],
  superTypes: [] as string[],
  artVariants: ["normal", "altart"],
  distributionChannels: [] as string[],
  languages: ["EN", "ZH"],
};

const mockStacks = vi.fn<() => { stacks: StackedEntry[]; totalCopies: number; isReady: boolean }>();

vi.mock("@/hooks/use-stacked-copies", () => ({
  useStackedCopies: () => mockStacks(),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: TEST_ORDERS, labels: {} }),
}));

vi.mock("@/hooks/use-effective-language-order", () => ({
  useEffectiveLanguageOrder: () => ["EN", "ZH"],
}));

const { useCollectionCardData } = await import("./use-collection-card-data");

function makeStack(printing: ReturnType<typeof stubPrinting>): StackedEntry {
  return {
    printingId: printing.id,
    printing,
    copyIds: [`copy-${printing.id}`],
  };
}

beforeEach(() => {
  resetIdCounter();
});

afterEach(() => {
  mockStacks.mockReset();
});

const SETS: SetInfo[] = [
  {
    id: "set-1",
    slug: "rb1",
    name: "RB1",
    setType: "main",
  },
];

function baseParams() {
  return {
    collectionId: "col-1",
    filters: { ...EMPTY_CARD_FILTERS } satisfies CardFilters,
    sortBy: "name" as const,
    sortDir: "asc" as const,
    view: "printings" as const,
    groupBy: "none" as const,
    sets: SETS,
    favoriteMarketplace: "tcgplayer" as const,
    prices: EMPTY_PRICE_LOOKUP,
  };
}

describe("useCollectionCardData", () => {
  it("splits a card owned in two sets into one tile per set in cards+set view", () => {
    // Regression: cards view collapsed to one tile per cardId regardless of
    // grouping, so a card owned in both OGN and UNL showed up under a single
    // set instead of once under each (matching the catalog).
    const cardId = "card-reprinted";
    const ogn = stubPrinting({ cardId, setId: "set-ogn", language: "EN" });
    const unl = stubPrinting({ cardId, setId: "set-unl", language: "EN" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(ogn), makeStack(unl)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), view: "cards", groupBy: "set" }),
    );

    expect(result.current.sortedCards.map((printing) => printing.setId).toSorted()).toEqual([
      "set-ogn",
      "set-unl",
    ]);
  });

  it("collapses a card owned in two sets to one tile when not grouped by set", () => {
    const cardId = "card-reprinted";
    const ogn = stubPrinting({ cardId, setId: "set-ogn", language: "EN" });
    const unl = stubPrinting({ cardId, setId: "set-unl", language: "EN" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(ogn), makeStack(unl)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), view: "cards", groupBy: "none" }),
    );

    expect(result.current.sortedCards).toHaveLength(1);
  });

  it("exposes availableLanguages derived from owned printings", () => {
    const en = stubPrinting({ language: "EN" });
    const zh = stubPrinting({ language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(zh)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    expect([...result.current.availableLanguages].toSorted()).toEqual(["EN", "ZH"]);
  });

  it("returns printings in all owned languages when filters.languages is empty", () => {
    // Regression: the collection view previously auto-seeded the URL language
    // filter from the user's display-store preference, which silently hid
    // owned cards in non-preferred languages.
    const en = stubPrinting({ language: "EN" });
    const zh = stubPrinting({ language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(zh)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    const languages = result.current.sortedCards.map((printing) => printing.language);
    expect(languages.toSorted()).toEqual(["EN", "ZH"]);
  });

  it("narrows results when filters.languages is set explicitly", () => {
    const en = stubPrinting({ language: "EN" });
    const zh = stubPrinting({ language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(zh)],
      totalCopies: 2,
      isReady: true,
    });

    const params = baseParams();
    params.filters.languages = ["EN"];

    const { result } = renderHook(() => useCollectionCardData(params));

    const languages = result.current.sortedCards.map((printing) => printing.language);
    expect(languages).toEqual(["EN"]);
  });

  it("filters by ownedFilter using per-collection stack counts", () => {
    // Regression: `filters.owned` was wired into the collection filter UI but
    // the hook never applied it, so every bucket showed every owned card.
    const partial = stubPrinting({ card: { slug: "partial-card" } });
    const full = stubPrinting({ card: { slug: "full-card" } });
    const extra = stubPrinting({ card: { slug: "extra-card" } });
    mockStacks.mockReturnValue({
      stacks: [
        // Default playset for unit/no-keywords is 3.
        { printingId: partial.id, printing: partial, copyIds: ["c-p1"] },
        { printingId: full.id, printing: full, copyIds: ["c-f1", "c-f2", "c-f3"] },
        {
          printingId: extra.id,
          printing: extra,
          copyIds: ["c-e1", "c-e2", "c-e3", "c-e4"],
        },
      ],
      totalCopies: 8,
      isReady: true,
    });

    const partialResult = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["partial"] }),
    );
    expect(partialResult.result.current.sortedCards.map((p) => p.id)).toEqual([partial.id]);

    const fullResult = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["full"] }),
    );
    expect(fullResult.result.current.sortedCards.map((p) => p.id)).toEqual([full.id]);

    const extraResult = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["extra"] }),
    );
    expect(extraResult.result.current.sortedCards.map((p) => p.id)).toEqual([extra.id]);
  });

  it("buckets the owned filter by ownedCardTotalOverride (group bulk box personal playset)", () => {
    // Regression: browsing a group-owned "bulk box", the Owned/Copies filter
    // aggregated the viewer's personal counts only over the printings the box
    // stocks. A box holding just the normal printing of a card the viewer owns a
    // full playset of split across variants (2 normal + 1 foil) undercounted to
    // the box variant's 2 copies and bucketed it as "partial". The card-keyed
    // override now carries the viewer's PER-CARD total across every variant, so
    // a full playset correctly buckets as "full".
    const cardId = "card-ballista";
    const normal = stubPrinting({ cardId, card: { slug: "ballista" } }); // unit → playset 3
    mockStacks.mockReturnValue({
      // The box stocks only the normal printing (3 copies). The foil the viewer
      // owns lives in their personal collection, so it's absent from the box.
      stacks: [{ printingId: normal.id, printing: normal, copyIds: ["box-1", "box-2", "box-3"] }],
      totalCopies: 3,
      isReady: true,
    });

    // Viewer's personal playset across variants = 3 (2 normal + 1 foil) → "full".
    // "Partial Playset" must NOT keep it, even though the box only stocks normal.
    const partial = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["partial"],
        ownedCardTotalOverride: { [cardId]: 3 },
      }),
    );
    expect(partial.result.current.sortedCards).toHaveLength(0);

    // "Full" keeps it, and the slider bound follows the per-card override too.
    const full = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["full"],
        ownedCardTotalOverride: { [cardId]: 3 },
      }),
    );
    expect(full.result.current.sortedCards.map((p) => p.id)).toEqual([normal.id]);
    expect(full.result.current.ownedCountMax).toBe(3);

    // A genuine personal shortfall (only 1 owned across variants) stays "partial".
    const shortfall = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["partial"],
        ownedCardTotalOverride: { [cardId]: 1 },
      }),
    );
    expect(shortfall.result.current.sortedCards.map((p) => p.id)).toEqual([normal.id]);

    // Without the override, the box's own 3 copies bucket as "full".
    const scoped = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["full"] }),
    );
    expect(scoped.result.current.sortedCards.map((p) => p.id)).toEqual([normal.id]);
  });

  it("leaves results untouched when ownedFilter is empty", () => {
    const a = stubPrinting();
    const b = stubPrinting();
    mockStacks.mockReturnValue({
      stacks: [makeStack(a), makeStack(b)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: [] }),
    );
    expect(result.current.sortedCards).toHaveLength(2);
  });

  it("filters by a copies-owned range using per-collection stack counts", () => {
    const one = stubPrinting({ card: { slug: "one-card" } });
    const three = stubPrinting({ card: { slug: "three-card" } });
    const five = stubPrinting({ card: { slug: "five-card" } });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: one.id, printing: one, copyIds: ["c-1"] },
        { printingId: three.id, printing: three, copyIds: ["c-3a", "c-3b", "c-3c"] },
        { printingId: five.id, printing: five, copyIds: ["c-5a", "c-5b", "c-5c", "c-5d", "c-5e"] },
      ],
      totalCopies: 9,
      isReady: true,
    });

    const inRange = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedCountMin: 2, ownedCountMax: 4 }),
    );
    expect(inRange.result.current.sortedCards.map((p) => p.id)).toEqual([three.id]);

    const openEnded = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedCountMin: 5, ownedCountMax: null }),
    );
    expect(openEnded.result.current.sortedCards.map((p) => p.id)).toEqual([five.id]);
  });

  it("exposes selectableCopyIds for only the filtered printings", () => {
    // Regression: "select all" collected copy IDs from every stack, so it
    // selected cards the active filters had hidden. selectableCopyIds must
    // contain copies of the *filtered* printings only.
    const en = stubPrinting({ language: "EN" });
    const zh = stubPrinting({ language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: zh.id, printing: zh, copyIds: ["c-zh-1"] },
      ],
      totalCopies: 3,
      isReady: true,
    });

    const params = baseParams();
    params.filters.languages = ["EN"];

    const { result } = renderHook(() => useCollectionCardData(params));

    expect(result.current.selectableCopyIds.toSorted()).toEqual(["c-en-1", "c-en-2"]);
  });

  it("includes every owned copy in selectableCopyIds when no filter is active", () => {
    const en = stubPrinting({ language: "EN" });
    const zh = stubPrinting({ language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: zh.id, printing: zh, copyIds: ["c-zh-1"] },
      ],
      totalCopies: 3,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    expect(result.current.selectableCopyIds.toSorted()).toEqual(["c-en-1", "c-en-2", "c-zh-1"]);
  });

  it("includes every printing's copies in selectableCopyIds for a stacked tile in cards view", () => {
    // Regression: in cards view a card owned across several printings collapses
    // into one tile, but selectableCopyIds flattened the deduped list (one
    // representative printing per tile), so "select all" grabbed only the
    // representative printing's copies. Dispose then left the other printings'
    // copies behind as a leftover tile. selectableCopyIds must pool every
    // printing's copies for the tile, matching a manual single-tile selection.
    const cardId = "card-multi-printing";
    const en = stubPrinting({ cardId, language: "EN" });
    const zh = stubPrinting({ cardId, language: "ZH" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: zh.id, printing: zh, copyIds: ["c-zh-1"] },
      ],
      totalCopies: 3,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), view: "cards", groupBy: "none" }),
    );

    // The two printings collapse to a single tile...
    expect(result.current.sortedCards).toHaveLength(1);
    // ...but select-all must still cover every copy under it.
    expect(result.current.selectableCopyIds.toSorted()).toEqual(["c-en-1", "c-en-2", "c-zh-1"]);
  });

  it("reports ownedCountMax as the largest per-collection owned count", () => {
    const one = stubPrinting({ card: { slug: "one-card" } });
    const five = stubPrinting({ card: { slug: "five-card" } });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: one.id, printing: one, copyIds: ["c-1"] },
        { printingId: five.id, printing: five, copyIds: ["c-5a", "c-5b", "c-5c", "c-5d", "c-5e"] },
      ],
      totalCopies: 6,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));
    expect(result.current.ownedCountMax).toBe(5);
  });

  it("facets the copies-owned slider bound against the active owned bucket", () => {
    // Regression: the Copies slider max was measured over the whole collection,
    // so picking "Partial Playset" left the bound at the collection's full max
    // (the 4-copy "extra" card) instead of narrowing to the largest surviving
    // partial total.
    const partialLow = stubPrinting({ card: { slug: "partial-low" } }); // 1 copy → partial
    const partialHigh = stubPrinting({ card: { slug: "partial-high" } }); // 2 copies → partial
    const extra = stubPrinting({ card: { slug: "extra-card" } }); // 4 copies → extra
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: partialLow.id, printing: partialLow, copyIds: ["c-pl1"] },
        { printingId: partialHigh.id, printing: partialHigh, copyIds: ["c-ph1", "c-ph2"] },
        { printingId: extra.id, printing: extra, copyIds: ["c-e1", "c-e2", "c-e3", "c-e4"] },
      ],
      totalCopies: 7,
      isReady: true,
    });

    // No owned bucket → bound spans the whole collection (the 4-copy card).
    const unfiltered = renderHook(() => useCollectionCardData(baseParams()));
    expect(unfiltered.result.current.ownedCountMax).toBe(4);

    // Partial Playset → bound narrows to the largest surviving partial total (2).
    const partial = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["partial"] }),
    );
    expect(partial.result.current.ownedCountMax).toBe(2);
  });

  it("keeps the slider bound on the personal override with no owned filter active", () => {
    // Regression: on a group "bulk box" the Copies bound measured the box's own
    // stock until the first owned-filter interaction, then flipped to the
    // viewer's personal totals. Given the per-card personal override, the bound
    // must read personal from the start (no owned filter needed), so the basis
    // never changes under the user.
    const cardId = "card-ballista";
    const normal = stubPrinting({ cardId, card: { slug: "ballista" } });
    mockStacks.mockReturnValue({
      // The box stocks 5 copies, but the viewer personally owns only 2.
      stacks: [
        {
          printingId: normal.id,
          printing: normal,
          copyIds: ["box-1", "box-2", "box-3", "box-4", "box-5"],
        },
      ],
      totalCopies: 5,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedCardTotalOverride: { [cardId]: 2 } }),
    );
    // Personal basis (2), not the box's 5.
    expect(result.current.ownedCountMax).toBe(2);
  });

  it("narrows filterCounts for other dimensions by the copies-owned range", () => {
    // Regression: the collection grid passed no filterCounts, so the
    // copies-owned range narrowed the grid but left every other filter chip
    // showing its full count. computeFilterCounts must reflect the active range.
    const common = stubPrinting({ rarity: "common", card: { slug: "common-card" } });
    const rare = stubPrinting({ rarity: "rare", card: { slug: "rare-card" } });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: common.id, printing: common, copyIds: ["c-1"] },
        { printingId: rare.id, printing: rare, copyIds: ["c-5a", "c-5b", "c-5c", "c-5d", "c-5e"] },
      ],
      totalCopies: 6,
      isReady: true,
    });

    // Unfiltered: both rarities are represented in the facet counts.
    const unfiltered = renderHook(() => useCollectionCardData(baseParams()));
    expect(unfiltered.result.current.filterCounts.rarities.get("common")).toBe(1);
    expect(unfiltered.result.current.filterCounts.rarities.get("rare")).toBe(1);

    // Copies >= 5 keeps only the rare card, so common drops out of the counts.
    const highCopies = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedCountMin: 5, ownedCountMax: null }),
    );
    expect(highCopies.result.current.filterCounts.rarities.get("rare")).toBe(1);
    expect(highCopies.result.current.filterCounts.rarities.get("common")).toBeUndefined();
  });
});
