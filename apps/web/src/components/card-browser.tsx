import type { Printing } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageIcon, PackagePlusIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { useEffect, useDeferredValue, useRef, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { QuickAddPalette } from "@/components/collection/quick-add-palette";
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
import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
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
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();
  const queryClient = useQueryClient();

  const adjustOwnedCount = (printingId: string, delta: number) => {
    queryClient.setQueryData<{ items: Record<string, number> }>(queryKeys.ownedCount.all, (old) => {
      if (!old) {
        return old;
      }
      const prev = old.items[printingId] ?? 0;
      return {
        ...old,
        items: { ...old.items, [printingId]: Math.max(0, prev + delta) },
      };
    });
  };

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
  const isAddMode = isLoggedIn && catalogMode === "add" && Boolean(inboxId);

  const handleQuickAdd =
    isAddMode && inboxId
      ? async (printing: Printing) => {
          adjustOwnedCount(printing.id, 1);
          useAddModeStore.getState().incrementPending(printing);
          try {
            const result = await batchedAdd.add(printing.id, inboxId);
            useAddModeStore.getState().recordAdd(printing, result.id);
          } catch {
            adjustOwnedCount(printing.id, -1);
          } finally {
            useAddModeStore.getState().decrementPending(printing.id);
          }
        }
      : undefined;

  const handleUndoAdd = isAddMode
    ? async (printing: Printing) => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        if (!entry || entry.copyIds.length === 0) {
          return;
        }
        const copyIdToRemove = entry.copyIds.at(-1);
        if (!copyIdToRemove) {
          return;
        }
        adjustOwnedCount(printing.id, -1);
        useAddModeStore.getState().recordUndo(printing.id);
        try {
          await disposeCopies.mutateAsync({ copyIds: [copyIdToRemove] });
        } catch {
          adjustOwnedCount(printing.id, 1);
          useAddModeStore.getState().recordAdd(printing, copyIdToRemove);
        }
      }
    : undefined;

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
          ? (siblings?.reduce((sum, p) => sum + (ownedCountByPrinting?.[p.id] ?? 0), 0) ?? 0)
          : (ownedCountByPrinting?.[displayPrinting.id] ?? 0);

      aboveCard = handleQuickAdd ? (
        <CollectionAddStrip
          printing={displayPrinting}
          ownedCount={count}
          hasVariants={false}
          onQuickAdd={handleQuickAdd}
          onUndoAdd={handleUndoAdd}
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
    </BrowserCardViewer>
  );
}
