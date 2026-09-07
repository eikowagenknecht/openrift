import type { CatalogResponse } from "@openrift/shared/types/api/catalog";
import type { DeckCatalogSubset } from "@openrift/shared/types/api/deck";
import type { InitResponse } from "@openrift/shared/types/api/init";
import type { Printing } from "@openrift/shared/types/catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { CatalogSubsetProvider } from "@/features/cards/components/catalog-subset-provider";
import { useCards, useFullCatalog } from "@/features/cards/hooks/use-cards";
import { enrichCatalogSubset } from "@/features/cards/lib/catalog-query";
import { useDeckItems } from "@/features/decks/hooks/use-deck-items";
import { initQueryOptions } from "@/hooks/use-init";
import { queryKeys } from "@/lib/query-keys";
import { stubDeckBuilderCard, stubPrinting } from "@/test/factories";

const SET_ID = "00000000-0000-0000-0000-00000000set1";

const SET = {
  id: SET_ID,
  slug: "rb1",
  name: "Set One",
  releases: { EN: { releasedAt: "2025-01-01", precision: "day" } },
  setType: "main",
};

function toWirePrinting(printing: Printing) {
  const { setSlug: _slug, setReleased: _released, card: _card, ...value } = printing;
  return { ...value, setId: SET_ID };
}

function toSubset(printings: Printing[]): DeckCatalogSubset {
  return {
    sets: [SET],
    cards: Object.fromEntries(printings.map((p) => [p.cardId, { ...p.card, id: p.cardId }])),
    printings: printings.map((printing) => toWirePrinting(printing)),
  } as unknown as DeckCatalogSubset;
}

function toCatalog(printings: Printing[]): CatalogResponse {
  return {
    sets: [SET],
    cards: Object.fromEntries(printings.map((p) => [p.cardId, p.card])),
    printings: Object.fromEntries(
      printings.map((p) => {
        const { id: _id, ...value } = toWirePrinting(p);
        return [p.id, value];
      }),
    ),
    totalCopies: 0,
    customTagAssignments: {},
  } as unknown as CatalogResponse;
}

const DECK_PRINTING = stubPrinting({
  id: "p-deck",
  cardId: "card-deck",
  setId: SET_ID,
  card: { name: "Kennen, Stormcaller" },
});
const OFF_DECK_PRINTING = stubPrinting({
  id: "p-off",
  cardId: "card-off",
  setId: SET_ID,
  card: { name: "Yasuo, Windrider" },
});

function setup(hook: () => ReturnType<typeof useCards>, options?: { seedCatalog?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options?.seedCatalog) {
    client.setQueryData(queryKeys.catalog.all, toCatalog([DECK_PRINTING, OFF_DECK_PRINTING]));
  }
  function wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <CatalogSubsetProvider catalog={toSubset([DECK_PRINTING])}>
          {children}
        </CatalogSubsetProvider>
      </QueryClientProvider>
    );
  }
  const { result } = renderHook(hook, { wrapper });
  return { client, result };
}

describe("CatalogSubsetProvider", () => {
  it("serves useCards from the subset without ever creating the catalogue query", () => {
    const { client, result } = setup(useCards);

    expect(result.current.printingsByCardId.get("card-deck")?.[0]?.id).toBe("p-deck");
    expect(result.current.printingsById["p-deck"]?.card.name).toBe("Kennen, Stormcaller");
    expect(result.current.cardsById["card-deck"]?.name).toBe("Kennen, Stormcaller");
    expect(result.current.sets.map((set) => set.slug)).toEqual(["rb1"]);
    expect(result.current.printingsByCardId.has("card-off")).toBe(false);
    expect(client.getQueryState(queryKeys.catalog.all)).toBeUndefined();
  });

  it("leaves useFullCatalog on the whole catalogue inside the same tree", () => {
    const { result } = setup(useFullCatalog, { seedCatalog: true });

    expect(result.current.printingsByCardId.has("card-off")).toBe(true);
    expect(result.current.printingsById["p-off"]?.card.name).toBe("Yasuo, Windrider");
  });

  it("reads the catalogue query with no provider above", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.catalog.all, toCatalog([DECK_PRINTING, OFF_DECK_PRINTING]));
    const { result } = renderHook(() => useCards(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(result.current.printingsByCardId.has("card-off")).toBe(true);
  });
});

describe("the deck detail pane's inputs", () => {
  it("resolves the deck's printings from the subset", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // `useDeckTokens` reads the language order off /init; required for the hook to run.
    client.setQueryData(initQueryOptions.queryKey, {
      enums: { languages: [] },
    } as unknown as InitResponse);
    const cards = [stubDeckBuilderCard({ cardId: "card-deck", zone: "main", quantity: 3 })];
    const { result } = renderHook(() => useDeckItems(cards), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
          <CatalogSubsetProvider catalog={toSubset([DECK_PRINTING])}>
            {children}
          </CatalogSubsetProvider>
        </QueryClientProvider>
      ),
    });

    expect(result.current.items.map((item) => item.printing.id)).toEqual(["p-deck"]);
    expect(client.getQueryState(queryKeys.catalog.all)).toBeUndefined();
  });
});

describe("enrichCatalogSubset", () => {
  it("derives the same maps the whole catalogue derives from the same rows", () => {
    const printings = [DECK_PRINTING, OFF_DECK_PRINTING];
    const fromSubset = enrichCatalogSubset(toSubset(printings));
    const { result } = renderHook(() => useCards(), {
      wrapper: ({ children }: PropsWithChildren) => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(queryKeys.catalog.all, toCatalog(printings));
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      },
    });

    const joined = (source: typeof fromSubset) =>
      source.allPrintings
        .map((printing) => ({
          id: printing.id,
          setSlug: printing.setSlug,
          setReleased: printing.setReleased,
          cardName: printing.card.name,
        }))
        .toSorted((a, b) => a.id.localeCompare(b.id));

    expect(joined(fromSubset)).toEqual(joined(result.current));
    expect(joined(fromSubset)[0]).toMatchObject({ setSlug: "rb1", setReleased: true });
    expect([...fromSubset.printingsByCardId.keys()].toSorted()).toEqual(
      [...result.current.printingsByCardId.keys()].toSorted(),
    );
  });
});
