import type { CardFilters } from "@openrift/shared";
import { EMPTY_CARD_FILTERS, EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupInfo } from "@/lib/card-group-types";
import type { StackedEntry } from "@/lib/stacked-entry";
import { resetIdCounter, stubPrinting } from "@/test/factories";

const TEST_ORDERS = {
  rarities: ["common", "uncommon", "rare", "epic"],
  finishes: ["normal", "foil"],
  domains: ["fury"],
  cardTypes: ["unit"],
  superTypes: [] as string[],
  artVariants: ["normal", "altart"],
  distributionChannels: [] as string[],
  languages: ["EN", "SC"],
};

const mockStacks = vi.fn<() => { stacks: StackedEntry[]; totalCopies: number; isReady: boolean }>();

vi.mock("@/hooks/use-stacked-copies", () => ({
  // The per-copy collection lookup is only read by the grid's "Collection"
  // grouping, so cases here set stacks alone and get an empty map.
  useStackedCopies: () => ({ collectionIdByCopyId: new Map<string, string>(), ...mockStacks() }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: TEST_ORDERS, labels: {} }),
}));

vi.mock("@/hooks/use-effective-language-order", () => ({
  useEffectiveLanguageOrder: () => ["EN", "SC"],
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

const SETS: GroupInfo[] = [
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
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(sc)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    expect([...result.current.availableLanguages].toSorted()).toEqual(["EN", "SC"]);
  });

  it("includes filtered languages the collection doesn't stock in availableLanguages", () => {
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(sc)],
      totalCopies: 1,
      isReady: true,
    });

    const params = baseParams();
    params.filters.languages = ["EN"];

    const { result } = renderHook(() => useCollectionCardData(params));

    expect(result.current.sortedCards).toHaveLength(0);
    expect([...result.current.availableLanguages].toSorted()).toEqual(["EN", "SC"]);
  });

  it("includes excluded languages the collection doesn't stock in availableLanguages", () => {
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(sc)],
      totalCopies: 1,
      isReady: true,
    });

    const params = baseParams();
    params.filters.languagesExclude = ["EN"];

    const { result } = renderHook(() => useCollectionCardData(params));

    expect([...result.current.availableLanguages].toSorted()).toEqual(["EN", "SC"]);
  });

  it("lists owned languages before filter-only ones and never duplicates", () => {
    const sc = stubPrinting({ language: "SC" });
    const en = stubPrinting({ language: "EN" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(sc), makeStack(en)],
      totalCopies: 2,
      isReady: true,
    });

    const params = baseParams();
    params.filters.languages = ["EN", "JP"];

    const { result } = renderHook(() => useCollectionCardData(params));

    expect(result.current.availableLanguages).toEqual(["SC", "EN", "JP"]);
  });

  it("returns printings in all owned languages when filters.languages is empty", () => {
    const en = stubPrinting({ language: "EN" });
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(sc)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    const languages = result.current.sortedCards.map((printing) => printing.language);
    expect(languages.toSorted()).toEqual(["EN", "SC"]);
  });

  it("narrows results when filters.languages is set explicitly", () => {
    const en = stubPrinting({ language: "EN" });
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [makeStack(en), makeStack(sc)],
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
    const partial = stubPrinting({ card: { slug: "partial-card" } });
    const full = stubPrinting({ card: { slug: "full-card" } });
    const extra = stubPrinting({ card: { slug: "extra-card" } });
    mockStacks.mockReturnValue({
      stacks: [
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
    const cardId = "card-ballista";
    const normal = stubPrinting({ cardId, card: { slug: "ballista" } });
    mockStacks.mockReturnValue({
      stacks: [{ printingId: normal.id, printing: normal, copyIds: ["box-1", "box-2", "box-3"] }],
      totalCopies: 3,
      isReady: true,
    });

    const partial = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["partial"],
        ownedCardTotalOverride: { [cardId]: 3 },
      }),
    );
    expect(partial.result.current.sortedCards).toHaveLength(0);

    const full = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["full"],
        ownedCardTotalOverride: { [cardId]: 3 },
      }),
    );
    expect(full.result.current.sortedCards.map((p) => p.id)).toEqual([normal.id]);
    expect(full.result.current.ownedCountMax).toBe(3);

    const shortfall = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        ownedFilter: ["partial"],
        ownedCardTotalOverride: { [cardId]: 1 },
      }),
    );
    expect(shortfall.result.current.sortedCards.map((p) => p.id)).toEqual([normal.id]);

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
    const en = stubPrinting({ language: "EN" });
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: sc.id, printing: sc, copyIds: ["c-sc-1"] },
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
    const sc = stubPrinting({ language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: sc.id, printing: sc, copyIds: ["c-sc-1"] },
      ],
      totalCopies: 3,
      isReady: true,
    });

    const { result } = renderHook(() => useCollectionCardData(baseParams()));

    expect(result.current.selectableCopyIds.toSorted()).toEqual(["c-en-1", "c-en-2", "c-sc-1"]);
  });

  it("includes every printing's copies in selectableCopyIds for a stacked tile in cards view", () => {
    const cardId = "card-multi-printing";
    const en = stubPrinting({ cardId, language: "EN" });
    const sc = stubPrinting({ cardId, language: "SC" });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: en.id, printing: en, copyIds: ["c-en-1", "c-en-2"] },
        { printingId: sc.id, printing: sc, copyIds: ["c-sc-1"] },
      ],
      totalCopies: 3,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({ ...baseParams(), view: "cards", groupBy: "none" }),
    );

    expect(result.current.sortedCards).toHaveLength(1);
    expect(result.current.selectableCopyIds.toSorted()).toEqual(["c-en-1", "c-en-2", "c-sc-1"]);
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
    const partialLow = stubPrinting({ card: { slug: "partial-low" } });
    const partialHigh = stubPrinting({ card: { slug: "partial-high" } });
    const extra = stubPrinting({ card: { slug: "extra-card" } });
    mockStacks.mockReturnValue({
      stacks: [
        { printingId: partialLow.id, printing: partialLow, copyIds: ["c-pl1"] },
        { printingId: partialHigh.id, printing: partialHigh, copyIds: ["c-ph1", "c-ph2"] },
        { printingId: extra.id, printing: extra, copyIds: ["c-e1", "c-e2", "c-e3", "c-e4"] },
      ],
      totalCopies: 7,
      isReady: true,
    });

    const unfiltered = renderHook(() => useCollectionCardData(baseParams()));
    expect(unfiltered.result.current.ownedCountMax).toBe(4);

    const partial = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedFilter: ["partial"] }),
    );
    expect(partial.result.current.ownedCountMax).toBe(2);
  });

  it("keeps the slider bound on the personal override with no owned filter active", () => {
    const cardId = "card-ballista";
    const normal = stubPrinting({ cardId, card: { slug: "ballista" } });
    mockStacks.mockReturnValue({
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
    expect(result.current.ownedCountMax).toBe(2);
  });

  it("narrows filterCounts for other dimensions by the copies-owned range", () => {
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

    const unfiltered = renderHook(() => useCollectionCardData(baseParams()));
    expect(unfiltered.result.current.filterCounts.rarities.get("common")).toBe(1);
    expect(unfiltered.result.current.filterCounts.rarities.get("rare")).toBe(1);

    const highCopies = renderHook(() =>
      useCollectionCardData({ ...baseParams(), ownedCountMin: 5, ownedCountMax: null }),
    );
    expect(highCopies.result.current.filterCounts.rarities.get("rare")).toBe(1);
    expect(highCopies.result.current.filterCounts.rarities.get("common")).toBeUndefined();
  });

  it("skips the counts pass when countsEnabled is false but keeps the grid data live", () => {
    const common = stubPrinting({ rarity: "common", card: { slug: "common-card" } });
    const rare = stubPrinting({ rarity: "rare", card: { slug: "rare-card" } });
    mockStacks.mockReturnValue({
      stacks: [makeStack(common), makeStack(rare)],
      totalCopies: 2,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useCollectionCardData({
        ...baseParams(),
        filters: { ...EMPTY_CARD_FILTERS, rarities: ["rare"] },
        countsEnabled: false,
      }),
    );
    expect(result.current.filterCounts.rarities.size).toBe(0);
    expect(result.current.sortedCards).toHaveLength(1);
    expect(result.current.sortedCards[0]!.rarity).toBe("rare");
    expect(result.current.availableFilters.rarities.length).toBeGreaterThan(0);
  });
});
