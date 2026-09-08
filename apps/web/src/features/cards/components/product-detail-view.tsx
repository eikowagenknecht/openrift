import type { ProductDetailResponse } from "@openrift/shared/contracts/products";
import type { Printing } from "@openrift/shared/types/catalog";
import { Suspense, useState } from "react";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarHeightContext,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { MarkdownText } from "@/components/markdown-text";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/features/cards/components/card-browser-filter-scaffold";
import { CardCell } from "@/features/cards/components/card-cell";
import { CardCountStrip } from "@/features/cards/components/card-count-strip";
import { CardViewer } from "@/features/cards/components/card-viewer";
import { ProductAddDialog } from "@/features/cards/components/product-add-dialog";
import { ProductContentsPreview } from "@/features/cards/components/product-contents-preview";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { StaticCountTableActions } from "@/features/cards/components/static-count-table-actions";
import { useCardData } from "@/features/cards/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { usePrices } from "@/features/cards/hooks/use-prices";
import type { EnrichedProductDetail } from "@/features/cards/hooks/use-products";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { filterPrintingsByLanguages } from "@/features/cards/lib/filter-printings-by-languages";
import { formatProductCounts } from "@/features/cards/lib/product-counts";
import type { FilterSearch } from "@/features/cards/lib/search-schemas";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import { maxOwnedCount } from "@/features/collections/lib/owned-bucket";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useSession } from "@/lib/auth-session";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

function ProductQuantityCell({
  printing,
  quantityByPrintingId,
}: {
  printing?: Printing;
  itemId?: string;
  quantityByPrintingId: Record<string, number>;
}) {
  if (!printing) {
    return null;
  }
  return <StaticCountTableActions count={quantityByPrintingId[printing.id] ?? 0} />;
}

// Products are curated fixed sets: distribution/marker/tag filters add noise.
// "owned" stays for logged-in viewers, hidden for anonymous ones.
const PRODUCT_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "markers",
  "channels",
  "customTags",
]);
const PRODUCT_HIDDEN_FILTER_SECTIONS_AUTHED: ReadonlySet<string> = new Set([
  "markers",
  "channels",
  "customTags",
]);

interface ProductDetailViewProps {
  data: EnrichedProductDetail;
  search: FilterSearch;
}

// Read-only card-browser surface over the product's fixed printing set. No
// add strips; the top-bar "Add to collection" action is the one write path.
export function ProductDetailView({ data, search }: ProductDetailViewProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const hydrated = useHydrated();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { product } = data;

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
            <PageTopBar>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
                <PageTopBarBack to="/products" aria-label="Back to products" />
                <PageTopBarTitle>{product.name}</PageTopBarTitle>
                <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                  {formatProductCounts(product.cardTotal, product.printingCount)}
                  {hydrated && (
                    <Suspense fallback={null}>
                      <ProductValue contents={data.contents} />
                    </Suspense>
                  )}
                </span>
              </div>
              {isLoggedIn && (
                <PageTopBarActions>
                  <PageTopBarPrimaryButton onClick={() => setAddOpen(true)}>
                    Add to collection
                  </PageTopBarPrimaryButton>
                </PageTopBarActions>
              )}
            </PageTopBar>
          </div>
          <ProductAddDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            productSlug={product.slug}
            productName={product.name}
          />
          <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
            {product.description ? (
              <MarkdownText text={product.description} className="text-muted-foreground py-3" />
            ) : null}
            <ProductDetailBody data={data} />
          </div>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

// Printings without a price are counted separately; they do not count as free.
function ProductValue({ contents }: { contents: ProductDetailResponse["contents"] }) {
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0];
  const prices = usePrices();

  let total = 0;
  let unpriced = 0;
  for (const content of contents) {
    const price = prices.get(content.printingId, marketplace);
    if (price === undefined) {
      unpriced += content.quantity;
    } else {
      total += price * content.quantity;
    }
  }
  if (total === 0) {
    return null;
  }
  const formatValue = formatterForMarketplace(marketplace);
  return (
    <>
      {" · "}
      {formatValue(total)}
      {unpriced > 0 && <span className="text-muted-foreground/60 ml-1">({unpriced} unpriced)</span>}
    </>
  );
}

function uniqueByCard(printings: readonly Printing[]): Printing[] {
  const seen = new Set<string>();
  const unique: Printing[] = [];
  for (const printing of printings) {
    if (seen.has(printing.cardId)) {
      continue;
    }
    seen.add(printing.cardId);
    unique.push(printing);
  }
  return unique;
}

function ProductDetailBody({ data }: { data: EnrichedProductDetail }) {
  const hydrated = useHydrated();
  const quantityByPrintingId: Record<string, number> = {};
  for (const content of data.contents) {
    quantityByPrintingId[content.printingId] = content.quantity;
  }
  // Doubles as the Suspense fallback: the page never drops back to a spinner
  // once the contents have painted.
  const preview = (
    <ProductContentsPreview
      printings={uniqueByCard(data.printings)}
      quantityByPrintingId={quantityByPrintingId}
    />
  );
  if (!hydrated) {
    return preview;
  }
  return (
    <Suspense fallback={preview}>
      <ProductDetailGrid data={data} />
    </Suspense>
  );
}

function ProductDetailGrid({ data }: { data: EnrichedProductDetail }) {
  const { printingsById, sets } = data;
  // The detail pane lists every printing of the clicked card from the global
  // catalog, not just the ones in this product.
  const { printingsByCardId: catalogAllPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: viewerOwnedByPrinting } = useOwnedCount(isLoggedIn);

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // Pinned: a cards view would collapse variants and lose per-printing quantity.
  const view = "printings" as const;

  const quantityByPrintingId: Record<string, number> = {};
  const productPrintings: Printing[] = [];
  for (const content of data.contents) {
    quantityByPrintingId[content.printingId] = content.quantity;
    const printing = printingsById[content.printingId];
    if (printing) {
      productPrintings.push(printing);
    }
  }

  // Feed the owned map into useCardData only when an owned filter is active.
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;
  const ownedCountForCardData = ownedFilterActive ? viewerOwnedByPrinting : undefined;

  const {
    sortedCards,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings: productPrintings,
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

  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );

  const ownedCountBound = maxOwnedCount(productPrintings, viewerOwnedByPrinting ?? {}, "printing");
  const hiddenSections = isLoggedIn
    ? PRODUCT_HIDDEN_FILTER_SECTIONS_AUTHED
    : PRODUCT_HIDDEN_FILTER_SECTIONS;

  const items: CardViewerItem[] = sortedCards.map((printing) => ({ id: printing.id, printing }));

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, "printing");
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  // Grid stays ownership-neutral (no owned dimming); the viewer's collection
  // shows up only in the detail pane and the Owned filter.
  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <CardCell
      printing={item.printing}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view="printings"
      onClick={handleCardClick}
      strip={<CardCountStrip count={quantityByPrintingId[item.printing.id] ?? 0} />}
    />
  );

  const toolbar = (
    <BrowserToolbar
      totalCards={totalUniqueCards}
      filteredCount={filteredCount}
      mobileDoneLabel={hasActiveFilters ? `Show ${filteredCount} printings` : undefined}
      hideViewToggle
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

  if (productPrintings.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This product is empty.</p>;
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
        totalItems={productPrintings.length}
        renderCard={renderCard}
        toolbar={toolbar}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          actionsColumn: "narrow",
          actionsLabel: "Quantity",
          actionsCell: <ProductQuantityCell quantityByPrintingId={quantityByPrintingId} />,
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
