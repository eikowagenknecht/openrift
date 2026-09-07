import type { DeckCatalogSubset } from "@openrift/shared/types/api/deck";
import type { Printing } from "@openrift/shared/types/catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogSubsetProvider } from "@/features/cards/components/catalog-subset-provider";
import { DeckTokensSection } from "@/features/decks/components/deck-tokens-section";
import { useDeckBuilderUiStore } from "@/features/decks/stores/deck-builder-ui-store";
import { initQueryOptions } from "@/hooks/use-init";
import { queryKeys } from "@/lib/query-keys";
import { stubDeckBuilderCard, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const SET_ID = "00000000-0000-0000-0000-00000000set1";
const SOURCE_CARD_ID = "card-source";
const TOKEN_CARD_ID = "card-token";

const resetUiStore = createStoreResetter(useDeckBuilderUiStore);

beforeEach(resetUiStore);
afterEach(resetUiStore);

function enumRow(slug: string, sortOrder: number) {
  return { slug, label: slug, sortOrder, color: null, description: null };
}

const INIT = {
  enums: {
    cardTypes: [enumRow("unit", 0)],
    rarities: [enumRow("rare", 0)],
    domains: [enumRow("fury", 0)],
    superTypes: [],
    finishes: [enumRow("non-foil", 0)],
    artVariants: [enumRow("standard", 0)],
    cardSizes: [enumRow("standard", 0)],
    deckFormats: [enumRow("constructed", 0)],
    deckZones: [enumRow("main", 0)],
    conditions: [],
    graders: [],
    languages: [enumRow("EN", 0)],
    markers: [],
  },
  keywords: {},
  distributionChannels: [],
  customTags: [],
  championIdentifierTags: [],
  tagCategories: [],
  tagCategoryMap: {},
};

const SOURCE_PRINTING = stubPrinting({
  id: "p-source",
  cardId: SOURCE_CARD_ID,
  setId: SET_ID,
  images: [{ face: "front", imageId: "img-source" }],
  card: { name: "Kennen Stormcaller", tokenCardIds: [TOKEN_CARD_ID] },
});
const TOKEN_PRINTING = stubPrinting({
  id: "p-token",
  cardId: TOKEN_CARD_ID,
  setId: SET_ID,
  images: [{ face: "front", imageId: "img-token" }],
  card: { name: "Sand Soldier", superTypes: ["token"] },
});

function toWirePrinting(printing: Printing) {
  const { setSlug: _slug, setReleased: _released, card: _card, ...value } = printing;
  return { ...value, setId: SET_ID };
}

const CATALOG = {
  sets: [
    {
      id: SET_ID,
      slug: "rb1",
      name: "Set One",
      releases: { EN: { releasedAt: "2025-01-01", precision: "day" } },
      setType: "main",
    },
  ],
  cards: {
    [SOURCE_CARD_ID]: { ...SOURCE_PRINTING.card, id: SOURCE_CARD_ID },
    [TOKEN_CARD_ID]: { ...TOKEN_PRINTING.card, id: TOKEN_CARD_ID },
  },
  printings: [toWirePrinting(SOURCE_PRINTING), toWirePrinting(TOKEN_PRINTING)],
} as unknown as DeckCatalogSubset;

const DECK_CARDS = [
  stubDeckBuilderCard({
    cardId: SOURCE_CARD_ID,
    cardName: "Kennen Stormcaller",
    zone: "main",
    quantity: 3,
  }),
];

function renderSection(variant: "grid" | "list" = "list") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initQueryOptions.queryKey, INIT);
  const catalogFetch = vi.fn();
  client.setQueryDefaults(queryKeys.catalog.all, { queryFn: catalogFetch });
  render(
    <QueryClientProvider client={client}>
      <CatalogSubsetProvider catalog={CATALOG}>
        <DeckTokensSection cards={DECK_CARDS} variant={variant} />
      </CatalogSubsetProvider>
    </QueryClientProvider>,
  );
  return { client, catalogFetch };
}

describe("DeckTokensSection on a page serving its own catalogue subset", () => {
  it("names the tokens the deck creates", () => {
    renderSection();

    expect(screen.getByText("Sand Soldier")).toBeInTheDocument();
  });

  it("shows the token's art from the subset", () => {
    renderSection("grid");

    const sources = screen.getAllByRole("img").map((img) => img.getAttribute("src") ?? "");
    expect(sources.join(" ")).toContain("img-token");
  });

  it("never reaches for the whole catalogue", () => {
    const { client, catalogFetch } = renderSection();

    expect(catalogFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.catalog.all)).toBeUndefined();
  });
});
