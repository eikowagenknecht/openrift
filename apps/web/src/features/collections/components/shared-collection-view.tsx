import type { PublicCollectionDetailResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { TopBarBreadcrumbSeparator } from "@/components/layout/top-bar-breadcrumb";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/features/cards/components/card-browser-filter-scaffold";
import { CardCell } from "@/features/cards/components/card-cell";
import { CardCountStrip } from "@/features/cards/components/card-count-strip";
import { CardViewer } from "@/features/cards/components/card-viewer";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { StaticCountTableActions } from "@/features/cards/components/static-count-table-actions";
import { useCardData } from "@/features/cards/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { filterPrintingsByLanguages } from "@/features/cards/lib/filter-printings-by-languages";
import type { FilterSearch } from "@/features/cards/lib/search-schemas";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import { maxOwnedCount } from "@/features/collections/lib/owned-bucket";
import { OnLoanChip } from "@/features/groups/components/on-loan-chip";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useSession } from "@/lib/auth-session";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

function SharedCollectionCountCell({
  printing,
  countByPrintingId,
}: {
  printing?: Printing;
  itemId?: string;
  countByPrintingId: Record<string, number>;
}) {
  if (!printing) {
    return null;
  }
  return <StaticCountTableActions count={countByPrintingId[printing.id] ?? 0} />;
}

// "owned" means the viewer's own personal collections, not this shared one,
// so it's hidden entirely for logged-out viewers who have no inventory.
const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);
const SHARED_HIDDEN_FILTER_SECTIONS_AUTHED: ReadonlySet<string> = new Set(["customTags"]);

interface SharedCollectionViewProps {
  data: PublicCollectionDetailResponse;
  search: FilterSearch;
  topBarTrailing?: ReactNode;
  notice?: ReactNode;
}

/**
 * Read-only collection browser used by both the anonymous
 * `/collections/share/$token` route and the authenticated group-scoped
 * `/groups/$slug/collections/$id` route.
 */
export function SharedCollectionView({
  data,
  search,
  topBarTrailing,
  notice,
}: SharedCollectionViewProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0];
  const formatValue = formatterForMarketplace(marketplace);

  const { collection, owner } = data;
  const valueLabel =
    collection.totalValueCents === null ? null : formatValue(collection.totalValueCents / 100);

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
            <PageTopBar>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
                {topBarTrailing}
                {topBarTrailing ? <TopBarBreadcrumbSeparator className="hidden sm:inline" /> : null}
                <PageTopBarTitle>{collection.name}</PageTopBarTitle>
                <span className="text-muted-foreground hidden shrink-0 items-baseline gap-x-1.5 text-xs sm:flex">
                  <span>Shared by {owner.displayName}</span>
                  {valueLabel !== null && (
                    <span>
                      · {valueLabel}
                      {collection.unpricedCopyCount ? (
                        <span className="text-muted-foreground/60 ml-1">
                          ({collection.unpricedCopyCount} unpriced)
                        </span>
                      ) : null}
                    </span>
                  )}
                </span>
              </div>
            </PageTopBar>
          </div>
          <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
            {notice}
            {collection.description ? (
              <p className="text-muted-foreground py-3 text-sm">{collection.description}</p>
            ) : null}
            <SharedCollectionBody data={data} />
          </div>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

function SharedCollectionBody({ data }: { data: PublicCollectionDetailResponse }) {
  const hydrated = useHydrated();
  // The grid relies on client-only catalog and filter state, so defer the mount.
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground py-3 text-sm">Loading cards…</p>}>
      <SharedCollectionGrid data={data} />
    </Suspense>
  );
}

function SharedCollectionGrid({ data }: { data: PublicCollectionDetailResponse }) {
  const { items: copies } = data;
  const { printingsById, sets, printingsByCardId: catalogAllPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: viewerOwnedByPrinting } = useOwnedCount(isLoggedIn);

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const view = rawView === "copies" ? "printings" : rawView;

  const countByPrintingId: Record<string, number> = {};
  // The anonymous public share never carries the onLoan flag, so this map
  // stays empty there and no badges render.
  const onLoanByPrintingId: Record<string, number> = {};
  for (const copy of copies as { printingId: string; onLoan?: boolean }[]) {
    countByPrintingId[copy.printingId] = (countByPrintingId[copy.printingId] ?? 0) + 1;
    if (copy.onLoan) {
      onLoanByPrintingId[copy.printingId] = (onLoanByPrintingId[copy.printingId] ?? 0) + 1;
    }
  }
  const collectionPrintings: Printing[] = [];
  for (const printingId of Object.keys(countByPrintingId)) {
    const printing = printingsById[printingId];
    if (printing) {
      collectionPrintings.push(printing);
    }
  }

  // Only feed the owned map into useCardData when an owned/copies filter is
  // active, so the ref stays stable and the grid doesn't churn on inventory updates.
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;
  const ownedCountForCardData = ownedFilterActive ? viewerOwnedByPrinting : undefined;

  const {
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings: collectionPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    sortBy,
    sortDir,
    view,
    groupBy,
    ownedCountByPrinting: ownedCountForCardData,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  // Lists every printing of the clicked card from the global catalog, not just
  // the ones present in this shared collection.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );

  // Uses the always-on owned map, not the gated one above, so this bound stays stable.
  const ownedCountBound = maxOwnedCount(
    collectionPrintings,
    viewerOwnedByPrinting ?? {},
    view === "printings" ? "printing" : "card",
  );
  const hiddenSections = isLoggedIn
    ? SHARED_HIDDEN_FILTER_SECTIONS_AUTHED
    : SHARED_HIDDEN_FILTER_SECTIONS;

  const items: CardViewerItem[] = sortedCards.map((printing) => ({ id: printing.id, printing }));
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
    const onLoan = onLoanByPrintingId[item.printing.id] ?? 0;
    return (
      <CardCell
        printing={item.printing}
        ctx={ctx}
        display={display}
        showImages={showImages}
        view={view}
        onClick={handleCardClick}
        siblings={view === "cards" ? printingsByCardId.get(cardId) : undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        strip={
          <CardCountStrip
            count={countByPrintingId[item.printing.id] ?? 0}
            extras={onLoan > 0 ? <OnLoanChip count={onLoan} /> : undefined}
          />
        }
      />
    );
  };

  const toolbar = (
    <BrowserToolbar
      totalCards={totalUniqueCards}
      filteredCount={filteredCount}
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredCount} ${view === "cards" ? "cards" : "printings"}`
          : undefined
      }
    />
  );
  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (collectionPrintings.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This collection is empty.</p>;
  }

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      filterCounts={filterCounts}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={hiddenSections}
      ownedCountMax={ownedCountBound}
    >
      <CardViewer
        items={items}
        totalItems={collectionPrintings.length}
        renderCard={renderCard}
        toolbar={toolbar}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          actionsColumn: "narrow",
          actionsLabel: "Copies",
          actionsCell: <SharedCollectionCountCell countByPrintingId={countByPrintingId} />,
        }}
      >
        <SelectionDetailOverlays
          items={items}
          printingsByCardId={detailPanePrintingsByCardId}
          showImages={showImages}
          onSearchAndClose={handleSearchAndClose}
        />
      </CardViewer>
    </CardBrowserFilterProvider>
  );
}
