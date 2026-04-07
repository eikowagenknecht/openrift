import type { Printing } from "@openrift/shared";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useDeferredValue, useRef, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  CollapsibleFilterPanel,
  FilterToggleButton,
} from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

/**
 * Standalone catalog browser for the /cards route.
 * Provides filters, search, and a card detail pane — no collection or add-mode features.
 * @returns The catalog browser view.
 */
export function CardBrowser() {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

  const {
    filters,
    sortBy,
    sortDir,
    view: rawView,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  const { setSearch } = useFilterActions();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);

  // "copies" is a collection-only view — clamp to "printings" in the catalog browser
  const view = rawView === "copies" ? "printings" : rawView;

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    languageFilter: useDisplayStore((s) => s.languages),
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting,
    favoriteMarketplace: marketplaceOrder[0] ?? "tcgplayer",
  });

  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  const findBy = view === "cards" ? "card" : ("printing" as const);

  // Deep-link: open a specific printing when navigating from e.g. activity page
  const [linkedPrintingId, setLinkedPrintingId] = useQueryState("printingId", parseAsString);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (!linkedPrintingId || deepLinkHandled.current) {
      return;
    }
    const printing = allPrintings.find((p) => p.id === linkedPrintingId);
    if (printing) {
      deepLinkHandled.current = true;
      useSelectionStore.getState().selectCard(printing, items, "printing");
      void setLinkedPrintingId(null);
    }
  }, [linkedPrintingId, allPrintings, items, setLinkedPrintingId]);

  const handleGridCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    setTopPrintingOverrides((prev) => new Map(prev).set(printing.card.id, printing.id));
  };

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.card.id;
    const siblings = printingsByCardId.get(cardId);

    const overrideId = topPrintingOverrides.get(cardId);
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    return (
      <CardThumbnail
        printing={displayPrinting}
        onClick={handleGridCardClick}
        onSiblingClick={handleSiblingClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        siblings={view === "cards" ? siblings : undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
      />
    );
  };

  const toolbar = (
    <>
      <div className="mb-1.5 flex items-start gap-3 sm:mb-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <MobileOptionsDrawer
          doneLabel={
            hasActiveFilters
              ? `Show ${sortedCards.length} ${view === "cards" ? "cards" : "printings"}`
              : undefined
          }
          className="sm:hidden"
        >
          <MobileOptionsContent />
          <MobileFilterContent
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </MobileOptionsDrawer>
      </div>
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        setDisplayLabel={setDisplayLabel}
      />
    </>
  );

  const leftPane = (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      </div>
    </Pane>
  );

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
    />
  );

  return (
    <BrowserCardViewer
      items={items}
      totalItems={allPrintings.length}
      renderCard={renderCard}
      setOrder={sets}
      groupBy={groupBy}
      groupDir={groupDir}
      deferredSortedCards={deferredSortedCards}
      printingsByCardId={printingsByCardId}
      view={view}
      onItemClick={handleGridCardClick}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      rightPane={rightPane}
    >
      {isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={searchAndClose}
        />
      )}
    </BrowserCardViewer>
  );
}
