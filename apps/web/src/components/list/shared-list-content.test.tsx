import type { Printing, PublicListDetailResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

// Two catalog printings of the same card, only the first of which is on the
// list. Lets the detail-pane test tell the full catalog fan (2 printings)
// apart from the list-scoped map (1 printing).
const printingOnList = stubPrinting({ id: "printing-1", cardId: "card-1" });
const printingOffList = stubPrinting({ id: "printing-2", cardId: "card-1" });

function mutationStub() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
}

vi.mock("@/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [printingOnList, printingOffList],
    printingsById: {
      [printingOnList.id]: printingOnList,
      [printingOffList.id]: printingOffList,
    },
    printingsByCardId: new Map([["card-1", [printingOnList, printingOffList]]]),
    sets: [],
  }),
}));

vi.mock("@/hooks/use-card-data", () => ({
  useCardData: () => ({
    sortedCards: [printingOnList],
    // List-scoped map: only the printing actually on the list survives.
    printingsByCardId: new Map([["card-1", [printingOnList]]]),
    priceRangeByCardId: undefined,
    availableFilters: {},
    availableLanguages: [],
    filterCounts: {},
    setDisplayLabel: () => "",
    totalUniqueCards: 1,
    filteredCount: 1,
  }),
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: () => ({
    filters: { ownedFilter: [] },
    sortBy: "name",
    sortDir: "asc",
    groupBy: "none",
    groupDir: "asc",
    hasActiveFilters: false,
  }),
  useFilterActions: () => ({ setSearch: vi.fn() }),
}));

vi.mock("@/hooks/use-card-trades", () => ({
  useUserTrades: () => ({ data: undefined }),
  useSetTradeQuantity: () => mutationStub(),
  useCancelTrade: () => mutationStub(),
}));

vi.mock("@/hooks/use-copies", () => ({
  useCopies: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useChannelRegistry: () => new Map(),
}));

vi.mock("@/hooks/use-keyword-reverse-map", () => ({
  useKeywordReverseMap: () => new Map(),
}));

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCountsForPrintings: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-wish-entries", () => ({
  useWishEntries: () => ({ entriesForPrinting: () => [] }),
}));

vi.mock("@/components/cards/card-thumbnail", async (importOriginal) => ({
  ...(await importOriginal()),
  useCardThumbnailDisplay: () => ({ favoriteMarketplace: null, prices: undefined }),
}));

vi.mock("@/components/cards/card-browser-filter-scaffold", () => ({
  CardBrowserFilterProvider: ({ children }: { children?: unknown }) => children as never,
  BrowserToolbar: () => null,
  BrowserActiveFilters: () => null,
}));

// Stands in for the virtualised grid: renders the detail pane (hosted via the
// viewer's `rightPane` prop) plus, per item, the grid cell and the table's
// actions cell with the per-row props the real table injects via cloneElement.
vi.mock("@/components/card-viewer", async () => {
  const { cloneElement } = await import("react");
  return {
    CardViewer: ({
      items,
      renderCard,
      rightPane,
      table,
    }: {
      items: { id: string; printing: Printing }[];
      renderCard: (item: { id: string; printing: Printing }, ctx: unknown) => React.ReactNode;
      rightPane?: unknown;
      table?: { actionsCell?: React.ReactElement<{ printing?: Printing; itemId?: string }> };
    }) => (
      <div>
        {rightPane as never}
        {items.map((item) => (
          <div key={item.id}>
            {renderCard(item, {
              isSelected: false,
              isFlashing: false,
              cardWidth: 200,
              priority: false,
            })}
            {table?.actionsCell
              ? cloneElement(table.actionsCell, { printing: item.printing, itemId: item.id })
              : null}
          </div>
        ))}
      </div>
    ),
  };
});

// The tile art is irrelevant here; only the strip above it carries status.
vi.mock("@/components/cards/card-cell", () => ({
  CardCell: ({ strip }: { strip?: unknown }) => <div>{strip as never}</div>,
}));

// The real pane renders nothing without a selection; this stub surfaces the
// printing fan SharedListContent hands it, which is what the test asserts.
vi.mock("@/components/selection-detail-pane", () => ({
  SelectionDetailPane: ({ printingsByCardId }: { printingsByCardId: Map<string, unknown[]> }) => (
    <div>Detail pane printings: {printingsByCardId.get("card-1")?.length ?? 0}</div>
  ),
}));

vi.mock("@/components/selection-detail-overlays", () => ({
  SelectionDetailOverlays: () => null,
}));

vi.mock("@/components/list/list-header", () => ({
  ListHeader: () => null,
}));

vi.mock("@/components/friend-groups/request-from-tradelist-dialog", () => ({
  RequestFromTradelistDialog: () => null,
}));

vi.mock("@/components/friend-groups/offer-to-wishlist-dialog", () => ({
  OfferToWishlistDialog: () => null,
}));

const { SharedListContent } = await import("./shared-list-content");
const { FilterSearchProvider } = await import("@/lib/search-schemas");
const { useSelectionStore } = await import("@/stores/selection-store");

const resetSelectionStore = createStoreResetter(useSelectionStore);

// A printing-kind list pinning one specific printing. Regression: printing-
// and copy-kind lists used to feed the detail pane the list-scoped printing
// map, so the pane's picker hid every variant not on the list.
const printingKindList: PublicListDetailResponse = {
  list: {
    id: "list-1",
    name: "Shared tradelist",
    kind: "printing",
    intent: "trade",
    tradeDefaults: EMPTY_TRADE_PREFERENCE,
    currency: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  entries: [
    {
      id: "entry-1",
      listId: "list-1",
      kind: "printing",
      printingId: printingOnList.id,
      quantity: 1,
      ruleQuantity: 0,
      tradeOverride: EMPTY_TRADE_PREFERENCE,
      source: "manual",
      cardName: printingOnList.card.name,
      setId: printingOnList.setId,
      rarity: printingOnList.rarity,
      finish: printingOnList.finish,
      shortCode: printingOnList.shortCode,
      language: printingOnList.language,
      imageId: null,
    },
  ],
  owner: { displayName: "Some Member", gravatarHash: null },
};

// A member's tradelist as a fellow group member sees it: one copy, already
// pinned to a live trade someone else is party to.
const reservedCopyTradelist: PublicListDetailResponse = {
  list: {
    ...printingKindList.list,
    kind: "copy",
    name: "Poppy's tradelist",
  },
  entries: [
    {
      id: "entry-1",
      listId: "list-1",
      kind: "copy",
      copyId: "copy-1",
      printingId: printingOnList.id,
      quantity: 1,
      ruleQuantity: 0,
      tradeOverride: EMPTY_TRADE_PREFERENCE,
      source: "manual",
      cardName: printingOnList.card.name,
      setId: printingOnList.setId,
      rarity: printingOnList.rarity,
      finish: printingOnList.finish,
      shortCode: printingOnList.shortCode,
      language: printingOnList.language,
      imageId: null,
      reserved: true,
      onLoan: false,
    },
  ],
  owner: { displayName: "Poppy", gravatarHash: null },
};

const REQUEST_EXCHANGE = {
  mode: "request",
  groupSlug: "summoner-skirmish",
  groupName: "Summoner Skirmish",
  counterpartyUserId: "user-poppy",
  counterpartyName: "Poppy",
} as const;

describe("SharedListContent", () => {
  afterEach(() => {
    resetSelectionStore();
    document.body.innerHTML = "";
  });

  it("feeds the detail pane every catalog printing of a card on a printing-kind list", () => {
    render(
      <FilterSearchProvider value={{}}>
        <SharedListContent data={printingKindList} />
      </FilterSearchProvider>,
    );

    // Both catalog printings, not just the one pinned by the list entry.
    expect(screen.getByText("Detail pane printings: 2")).toBeInTheDocument();
  });

  // This surface is reachable through a share token, so it uses the shared
  // chip: one word, no annotation, nothing that could name a counterparty.
  it("marks a reserved copy with the shared trade chip in both the grid and the table", () => {
    render(
      <FilterSearchProvider value={{}}>
        <SharedListContent data={reservedCopyTradelist} exchange={REQUEST_EXCHANGE} />
      </FilterSearchProvider>,
    );

    // One in the tile's strip, one in the table's actions column.
    const chips = screen.getAllByLabelText("Reserved");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip).toHaveTextContent(/^Reserved$/u);
    }
  });

  it("keeps the counterparty out of a shared list's trade markers", () => {
    render(
      <FilterSearchProvider value={{}}>
        <SharedListContent data={reservedCopyTradelist} exchange={REQUEST_EXCHANGE} />
      </FilterSearchProvider>,
    );

    // The owner's name is in the payload and in the exchange context, so it is
    // available to leak. The chip takes no prop that could carry it.
    expect(screen.queryByText(/Poppy/u)).not.toBeInTheDocument();
    // Nor does the reserved copy expose the claim controls.
    expect(screen.queryByRole("button", { name: /request/iu })).not.toBeInTheDocument();
  });
});
