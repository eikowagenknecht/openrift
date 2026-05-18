import type {
  ListEntryDetailResponse,
  ListKind,
  Printing,
  PublicListDetailResponse,
} from "@openrift/shared";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserActiveFilters,
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { ListValueLabel } from "@/components/list/list-value-label";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { usePublicList } from "@/hooks/use-lists";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createLazyFileRoute("/_app/lists_/share/$token")({
  component: SharedListPage,
});

// Public visitor has no owned-count context; lists also don't carry catalog-
// wide channels / markers / custom-tag assignments. Match the public
// collection share's hidden set.
const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "markers",
  "channels",
  "customTags",
]);

function SharedListPage() {
  const { token } = Route.useParams();
  const { data } = usePublicList(token);
  const search = Route.useSearch();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const hydrated = useHydrated();

  const { list, owner, entries } = data;
  const kindNoun =
    list.kind === "copy" ? "copies" : list.kind === "printing" ? "printings" : "cards";

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
            <PageTopBar>
              <PageTopBarTitle>{list.name}</PageTopBarTitle>
              <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
                <span>Shared by {owner.displayName}</span>
                <span>
                  · {list.intent} list of {kindNoun}
                </span>
              </span>
              {hydrated && entries.length > 0 && (
                <ListValueLabel kind={list.kind} entries={entries} />
              )}
            </PageTopBar>
          </div>
          <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
            <SharedListBody data={data} />
          </div>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

function SharedListBody({ data }: { data: PublicListDetailResponse }) {
  const hydrated = useHydrated();
  // The top bar renders before hydration (so crawlers see the name + owner).
  // The grid depends on the global catalog (useCards) plus client-only
  // display + filter state, so defer that subtree.
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground py-3 text-sm">Loading cards…</p>}>
      <SharedListGrid data={data} />
    </Suspense>
  );
}

function SharedListGrid({ data }: { data: PublicListDetailResponse }) {
  const { entries, list } = data;
  const { printingsById, printingsByCardId, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // Public share mirrors the authenticated list page: the view is locked to
  // the list's kind, and the view-mode toggle is hidden in the toolbar.
  const view: "cards" | "printings" | "copies" = kindToView(list.kind);
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  // Card-kind fan: scope the catalog map to the user's preferred languages
  // so a public viewer sees the printings they care about, not every
  // language reprint. Empty prefs means show all.
  const userLanguages = useDisplayStore((state) => state.languages);
  const userScopedPrintingsByCardId = filterPrintingsByLanguages(printingsByCardId, userLanguages);

  const {
    sortedCards,
    printingsByCardId: filteredPrintingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings: listPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const items: CardViewerItem[] =
    view === "copies"
      ? sortedCards.flatMap((printing) =>
          (entriesByPrintingId.get(printing.id) ?? []).map((entry) => ({
            id: entry.id,
            printing,
          })),
        )
      : sortedCards.map((printing) => ({ id: printing.id, printing }));

  const findBy: "card" | "printing" = view === "cards" && groupBy !== "set" ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    // Card-kind lists fan every printing of the card behind the tile,
    // scoped to the user's preferred languages. Other kinds stay scoped to
    // printings actually on the list.
    const siblings =
      view === "cards"
        ? (list.kind === "card" ? userScopedPrintingsByCardId : filteredPrintingsByCardId).get(
            cardId,
          )
        : undefined;
    return (
      <CardCell
        printing={item.printing}
        ctx={ctx}
        display={display}
        showImages={showImages}
        view={dataView}
        onClick={handleCardClick}
        siblings={siblings}
        priceRange={priceRangeByCardId?.get(cardId)}
      />
    );
  };

  const totalDisplay = view === "copies" ? items.length : totalUniqueCards;
  const filteredDisplay = view === "copies" ? items.length : filteredCount;

  const toolbar = (
    <BrowserToolbar
      totalCards={totalDisplay}
      filteredCount={filteredDisplay}
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredDisplay} ${view === "cards" ? "cards" : view === "copies" ? "copies" : "printings"}`
          : undefined
      }
      hideViewToggle
    />
  );

  const leftPane = <BrowserLeftPane />;
  const aboveGrid = <BrowserActiveFilters />;

  // Card-kind lists fan out every printing of the clicked card in the detail
  // pane (the entry doesn't pin a specific printing), scoped to the user's
  // preferred languages. Other kinds stay scoped to what's on the list.
  const detailPanePrintingsByCardId =
    list.kind === "card" ? userScopedPrintingsByCardId : filteredPrintingsByCardId;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (listPrintings.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This list is empty.</p>;
  }

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      filterCounts={filterCounts}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
    >
      <CardViewer
        items={items}
        totalItems={view === "copies" ? entries.length : listPrintings.length}
        renderCard={renderCard}
        toolbar={toolbar}
        leftPane={leftPane}
        aboveGrid={aboveGrid}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          actionsColumn: "none",
        }}
      >
        {isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
          />
        )}
      </CardViewer>
    </CardBrowserFilterProvider>
  );
}

/** @returns The view mode that matches a list's kind. */
function kindToView(kind: ListKind): "cards" | "printings" | "copies" {
  if (kind === "card") {
    return "cards";
  }
  if (kind === "printing") {
    return "printings";
  }
  return "copies";
}

/**
 * Restricts a catalog `printingsByCardId` map to the user's preferred
 * languages. Empty prefs means show all.
 * @returns A filtered map; cards with no printing in any preferred language
 * are dropped.
 */
function filterPrintingsByLanguages(
  source: ReadonlyMap<string, Printing[]>,
  userLanguages: readonly string[],
): Map<string, Printing[]> {
  if (userLanguages.length === 0) {
    return new Map(source);
  }
  const allowed = new Set(userLanguages);
  const result = new Map<string, Printing[]>();
  for (const [cardId, printings] of source) {
    const filtered = printings.filter((printing) => allowed.has(printing.language));
    if (filtered.length > 0) {
      result.set(cardId, filtered);
    }
  }
  return result;
}

/**
 * Resolves list entries to a deduped array of Printings + a per-printing
 * entries map. Copies view expands one tile per entry; cards/printings views
 * collapse to one tile per printing.
 * @returns The deduped Printing[] and entries-by-printing-id map.
 */
function collectListPrintings(
  entries: readonly ListEntryDetailResponse[],
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): {
  listPrintings: Printing[];
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>;
} {
  const listPrintings: Printing[] = [];
  const entriesByPrintingId = new Map<string, ListEntryDetailResponse[]>();
  for (const entry of entries) {
    const printing = resolveEntryPrinting(entry, printingsById, printingsByCardId);
    if (!printing) {
      continue;
    }
    const existing = entriesByPrintingId.get(printing.id);
    if (existing) {
      existing.push(entry);
      continue;
    }
    listPrintings.push(printing);
    entriesByPrintingId.set(printing.id, [entry]);
  }
  return { listPrintings, entriesByPrintingId };
}

/**
 * Picks the printing to render for an entry. Mirrors the authenticated
 * list-page resolver.
 * @returns The Printing or undefined when nothing resolves.
 */
function resolveEntryPrinting(
  entry: ListEntryDetailResponse,
  printingsById: Record<string, Printing>,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): Printing | undefined {
  switch (entry.kind) {
    case "printing":
    case "copy": {
      return printingsById[entry.printingId];
    }
    case "card": {
      return printingsByCardId.get(entry.cardId)?.[0];
    }
  }
}
