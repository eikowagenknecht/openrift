import type { CatalogResponse } from "@openrift/shared/types/api/catalog";
import type { DeckCatalogSubset } from "@openrift/shared/types/api/deck";
import type { Printing } from "@openrift/shared/types/catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogSubsetProvider } from "@/features/cards/components/catalog-subset-provider";
import { DeckDescription } from "@/features/decks/components/deck-description";
import { queryKeys } from "@/lib/query-keys";
import { stubPrinting } from "@/test/factories";

const SET_ID = "00000000-0000-0000-0000-00000000set1";

const SET = {
  id: SET_ID,
  slug: "rb1",
  name: "Set One",
  releases: { EN: { releasedAt: "2025-01-01", precision: "day" } },
  setType: "main",
};

const DECK_PRINTING = stubPrinting({
  id: "p-deck",
  cardId: "card-deck",
  setId: SET_ID,
  card: { name: "Kennen Stormcaller" },
});
const OFF_DECK_PRINTING = stubPrinting({
  id: "p-off",
  cardId: "card-off",
  setId: SET_ID,
  card: { name: "Yasuo Windrider" },
});

/** Strips the enriched fields back off a stub Printing to get the wire shape. */
function toWirePrinting(printing: Printing) {
  const { setSlug: _slug, setReleased: _released, card: _card, ...value } = printing;
  return { ...value, setId: SET_ID };
}

const SUBSET = {
  sets: [SET],
  cards: { "card-deck": { ...DECK_PRINTING.card, id: "card-deck" } },
  printings: [toWirePrinting(DECK_PRINTING)],
} as unknown as DeckCatalogSubset;

const FULL_CATALOG = {
  sets: [SET],
  cards: {
    "card-deck": DECK_PRINTING.card,
    "card-off": OFF_DECK_PRINTING.card,
  },
  printings: Object.fromEntries(
    [DECK_PRINTING, OFF_DECK_PRINTING].map((printing) => {
      const { id, ...value } = toWirePrinting(printing);
      return [id, value];
    }),
  ),
  totalCopies: 0,
  customTagAssignments: {},
} as unknown as CatalogResponse;

function renderDescription(text: string, options?: { seedCatalog?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const catalogFetch = vi.fn();
  client.setQueryDefaults(queryKeys.catalog.all, { queryFn: catalogFetch });
  if (options?.seedCatalog) {
    client.setQueryData(queryKeys.catalog.all, FULL_CATALOG);
  }
  const onCardClick = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CatalogSubsetProvider catalog={SUBSET}>
        <DeckDescription text={text} onCardClick={onCardClick} />
      </CatalogSubsetProvider>
    </QueryClientProvider>,
  );
  return { client, catalogFetch };
}

describe("DeckDescription on a page serving its own catalogue subset", () => {
  it("resolves a card the deck never holds, which only the whole catalogue knows", () => {
    renderDescription("Beats [[Yasuo Windrider]] on the play.", { seedCatalog: true });

    expect(screen.getByRole("button", { name: "Yasuo Windrider" })).toBeInTheDocument();
  });

  it("leaves the catalogue alone for a description with no card reference", () => {
    const { client, catalogFetch } = renderDescription("Just a plain note about the deck.");

    expect(screen.getByText("Just a plain note about the deck.")).toBeInTheDocument();
    expect(catalogFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.catalog.all)).toBeUndefined();
  });
});
