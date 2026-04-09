import type { Printing } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon, PackagePlusIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { useEffect, useDeferredValue, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { QuickAddPalette } from "@/components/collection/quick-add-palette";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
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
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useSession } from "@/lib/auth-session";
import { useAddModeStore } from "@/stores/add-mode-store";
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
  const catalogMode = useDisplayStore((s) => s.catalogMode);
  const cycleCatalogMode = useDisplayStore((s) => s.cycleCatalogMode);
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);
  const { data: collections } = useQuery({
    ...collectionsQueryOptions,
    enabled: isLoggedIn,
  });
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const isAddMode = isLoggedIn && catalogMode === "add" && Boolean(inboxId);
  const { handleQuickAdd, handleUndoAdd, handleOpenVariants, adjustedCount } = useQuickAddActions(
    isAddMode ? inboxId : undefined,
  );

  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const variantPopoverRef = useRef<HTMLDivElement>(null);

  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

  // Close variant popover on click outside
  useEffect(() => {
    if (!variantPopover) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (variantPopoverRef.current && !variantPopoverRef.current.contains(event.target as Node)) {
        useAddModeStore.getState().closeVariants();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [variantPopover]);

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
  const keywordReverseMap = useKeywordReverseMap();

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
    keywordReverseMap,
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

  // Cmd+K / Ctrl+K shortcut to open quick-add palette
  useEffect(() => {
    if (!inboxId) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [inboxId]);

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

  const showStrip = isLoggedIn && catalogMode !== "off";

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.card.id;
    const siblings = printingsByCardId.get(cardId);

    const overrideId = topPrintingOverrides.get(cardId);
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    let aboveCard: ReactNode | undefined;
    if (showStrip) {
      const count =
        view === "cards"
          ? (siblings?.reduce(
              (sum, p) => sum + adjustedCount(p.id, ownedCountByPrinting?.[p.id] ?? 0),
              0,
            ) ?? 0)
          : adjustedCount(displayPrinting.id, ownedCountByPrinting?.[displayPrinting.id] ?? 0);

      aboveCard = handleQuickAdd ? (
        <CollectionAddStrip
          printing={displayPrinting}
          ownedCount={count}
          hasVariants={view === "cards" && (siblings?.length ?? 0) > 1}
          onQuickAdd={handleQuickAdd}
          onUndoAdd={handleUndoAdd}
          onOpenVariants={handleOpenVariants}
        />
      ) : (
        <OwnedCountStrip
          count={count}
          printingId={displayPrinting.id}
          cardName={displayPrinting.card.name}
          shortCode={displayPrinting.shortCode}
        />
      );
    }

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
        aboveCard={aboveCard}
      />
    );
  };

  const toolbar = (
    <>
      <div className="mb-1.5 flex items-start gap-3 sm:mb-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
        {isLoggedIn && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={catalogMode === "off" ? "outline" : "default"}
                  size="icon"
                  className="hidden sm:flex"
                  onClick={cycleCatalogMode}
                />
              }
            >
              {catalogMode === "add" ? (
                <PackagePlusIcon className="size-4" />
              ) : (
                <PackageIcon className="size-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {catalogMode === "off" && "Show owned count"}
              {catalogMode === "count" && "Switch to add mode"}
              {catalogMode === "add" && "Turn off"}
            </TooltipContent>
          </Tooltip>
        )}
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
          {isLoggedIn && (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm font-medium">Collection mode</span>
              <Button
                variant={catalogMode === "off" ? "outline" : "default"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={cycleCatalogMode}
              >
                {catalogMode === "add" ? <PackagePlusIcon /> : <PackageIcon />}
                {catalogMode === "off" && "Off"}
                {catalogMode === "count" && "Count"}
                {catalogMode === "add" && "Add"}
              </Button>
            </div>
          )}
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
      addStripHeight={showStrip ? ADD_STRIP_HEIGHT : undefined}
    >
      {isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={searchAndClose}
        />
      )}
      {inboxId && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={inboxId}
          collectionName="Inbox"
          printingsByCardId={printingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
        />
      )}
      {variantPopover &&
        handleQuickAdd &&
        handleUndoAdd &&
        (() => {
          const variantPrintings = printingsByCardId.get(variantPopover.cardId);
          if (!variantPrintings) {
            return null;
          }
          return createPortal(
            <div
              ref={variantPopoverRef}
              className="fixed z-[100]"
              style={{ top: variantPopover.pos.top, left: variantPopover.pos.left }}
            >
              <VariantAddPopover
                printings={variantPrintings}
                ownedCounts={Object.fromEntries(
                  variantPrintings.map((p) => [
                    p.id,
                    adjustedCount(p.id, ownedCountByPrinting?.[p.id] ?? 0),
                  ]),
                )}
                onQuickAdd={handleQuickAdd}
                onUndoAdd={handleUndoAdd}
              />
            </div>,
            document.body,
          );
        })()}
    </BrowserCardViewer>
  );
}
