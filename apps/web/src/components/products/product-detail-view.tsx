import type { Marketplace, Printing } from "@openrift/shared";
import type { ProductDetailResponse } from "@openrift/shared/contracts/products";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
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
import { ProductAddDialog } from "@/components/products/product-add-dialog";
import { ProductContentsPreview } from "@/components/products/product-contents-preview";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePrices } from "@/hooks/use-prices";
import type { EnrichedProductDetail } from "@/hooks/use-products";
import { useSession } from "@/lib/auth-session";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { formatterForMarketplace } from "@/lib/format";
import { maxOwnedCount } from "@/lib/owned-bucket";
import { formatProductCounts } from "@/lib/product-counts";
import type { FilterSearch } from "@/lib/search-schemas";
import { FilterSearchProvider } from "@/lib/search-schemas";
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

// Products are curated snapshots: distribution/marker/tag filters add noise on
// a fixed set. "owned" stays for logged-in viewers ("which kit cards am I
// missing?") and is hidden for anonymous ones (no inventory to filter on).
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

/**
 * Public product page (ADR-015): a read-only card-browser surface over the
 * product's fixed printing set. No add strips — browsing a product never
 * touches collections. The one deliberate write path is the top-bar
 * "Add to collection" action, which bulk-adds the product's contents via
 * an explicit confirm dialog.
 *
 * @returns The product page node.
 */
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
                  {/* Prices are a client-only suspense query — mount after hydration. */}
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

/**
 * Total worth of the product's contents (quantity × price at the viewer's
 * favorite marketplace), like the collection headers show. Printings without
 * a price are counted separately instead of silently reading as free.
 *
 * @returns The value fragment for the top-bar stats line, or null while
 * nothing is priced.
 */
function ProductValue({ contents }: { contents: ProductDetailResponse["contents"] }) {
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = (marketplaceOrder[0] ?? "cardtrader") as Marketplace;
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

/**
 * Deduplicates the product's printings by card, keeping the payload's
 * canonical order. The preview shows one cell per card, like the grid's
 * "cards" view, so reprints inside a kit don't render twice.
 *
 * @returns One printing per distinct card.
 */
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
  // The live grid is virtualized and renders nothing server-side, so the
  // served HTML gets a plain non-virtualized pass over the same cards. It
  // doubles as the Suspense fallback: the page never drops back to a spinner
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
  // catalog, not just the ones in this product, so it still reads the client
  // catalog. It only opens post-hydration, where that fetch is already warm.
  const { printingsByCardId: catalogAllPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  // The viewer's owned counts drive the Owned/Copies filters — "owned" means
  // "in my collections", not anything about this product.
  const { data: viewerOwnedByPrinting } = useOwnedCount(isLoggedIn);

  const { filters, sortBy, sortDir, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // Contents are printings with per-printing quantities; a cards view would
  // collapse variants and show one representative's quantity. Pin the view.
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

  // Only feed the owned map into useCardData when an owned filter is active so
  // the grid doesn't churn as the viewer's inventory updates elsewhere.
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

  // The detail-pane picker lists every printing of the clicked card from the
  // global catalog, not just the ones in this product.
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

  // The pill shows the kit quantity (what the product ships). The grid stays
  // ownership-neutral — no owned dimming; the viewer's collection shows up
  // only in the detail pane and through the Owned filter section.
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
