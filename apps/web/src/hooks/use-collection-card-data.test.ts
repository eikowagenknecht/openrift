import type {
  ArtVariant,
  CardFilters,
  CardType,
  Domain,
  Finish,
  Rarity,
  SearchField,
  SuperType,
} from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
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
    filters: {
      search: "",
      searchScope: [] as SearchField[],
      sets: [] as string[],
      languages: [] as string[],
      domains: [] as Domain[],
      types: [] as CardType[],
      superTypes: [] as SuperType[],
      rarities: [] as Rarity[],
      artVariants: [] as ArtVariant[],
      finishes: [] as Finish[],
      isSigned: null,
      hasAnyMarker: null,
      markerSlugs: [] as string[],
      distributionChannelSlugs: [] as string[],
      isBanned: null,
      hasErrata: null,
      energy: { min: null, max: null },
      might: { min: null, max: null },
      power: { min: null, max: null },
      price: { min: null, max: null },
    } satisfies CardFilters,
    sortBy: "name" as const,
    sortDir: "asc" as const,
    view: "printings" as const,
    sets: SETS,
    favoriteMarketplace: "tcgplayer" as const,
    prices: EMPTY_PRICE_LOOKUP,
  };
}

describe("useCollectionCardData", () => {
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
});
