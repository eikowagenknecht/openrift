import type { Printing } from "@openrift/shared";
import { use, useEffect, useDeferredValue, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { AddedCardsList } from "@/components/collection/added-cards-list";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  FilterBadgeSections,
  FilterPanelContent,
  FilterRangeSections,
} from "@/components/filters/filter-panel-content";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { MobileDetailOverlay } from "@/components/layout/mobile-detail-overlay";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { AddModeSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface CardBrowserProps {
  collectionId?: string;
  onDone?: () => void;
}

export function CardBrowser({ collectionId: collectionIdProp, onDone }: CardBrowserProps = {}) {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const visibleFields = useDisplayStore((s) => s.visibleFields);
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const addMode = Boolean(collectionIdProp);
  const addModeSlot = use(AddModeSlotContext);
  const addedItems = useAddModeStore((s) => s.addedItems);
  const showAddedList = useAddModeStore((s) => s.showAddedList);
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const addCopies = useAddCopies();
  const disposeCopies = useDisposeCopies();

  // Which printing is shown on top when a fan-card sibling is clicked (cards view only)
  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

  const variantPopoverRef = useRef<HTMLDivElement>(null);

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

  const { filters, sortBy, sortDir, view, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting,
    favoriteMarketplace: marketplaceOrder[0] ?? "tcgplayer",
  });

  // Defer the expensive card grid re-render so the filter UI (badge highlight,
  // sheet close animation) responds immediately. The grid updates once React
  // has spare time after the urgent interactions are painted.
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  // Map Printing[] → CardViewerItem[]
  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  const findBy = view === "cards" ? "card" : ("printing" as const);

  const handleGridCardClick = (printing: Printing) => {
    useAddModeStore.getState().closeAddedList();
    useAddModeStore.getState().closeVariants();
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

  // ── Quick-add / undo ────────────────────────────────────────────────
  const handleQuickAdd = collectionIdProp
    ? (printing: Printing) => {
        addCopies.mutate(
          {
            copies: [
              {
                printingId: printing.id,
                collectionId: collectionIdProp,
              },
            ],
          },
          {
            onSuccess: (data) => {
              const copyId = (data as { id: string }[])[0].id;
              useAddModeStore.getState().recordAdd(printing, copyId);
            },
          },
        );
      }
    : undefined;

  const handleUndoAdd = addMode
    ? (printing: Printing) => {
        const entry = useAddModeStore.getState().addedItems.get(printing.id);
        if (!entry || entry.copyIds.length === 0) {
          return;
        }
        const copyIdToRemove = entry.copyIds.at(-1);
        if (!copyIdToRemove) {
          return;
        }
        disposeCopies.mutate(
          { copyIds: [copyIdToRemove] },
          {
            onSuccess: () => {
              useAddModeStore.getState().recordUndo(printing.id);
            },
          },
        );
      }
    : undefined;

  const handleOpenVariants = addMode
    ? (printing: Printing, anchorEl: HTMLElement) => {
        const rect = anchorEl.getBoundingClientRect();
        useAddModeStore.getState().openVariants(printing.card.id, {
          top: rect.bottom + 4,
          left: Math.max(
            8,
            Math.min(rect.left + rect.width / 2 - 112, globalThis.innerWidth - 232),
          ),
        });
      }
    : undefined;

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.card.id;
    const siblings = printingsByCardId.get(cardId);

    // If the user clicked a fan-card sibling, show that printing on top instead
    const overrideId = topPrintingOverrides.get(cardId);
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((s) => s.id === overrideId) ?? item.printing)
        : item.printing;

    const hasMultipleVariants = addMode && view === "cards" && (siblings?.length ?? 0) > 1;
    const totalOwned = hasMultipleVariants
      ? siblings?.reduce((sum, p) => sum + (ownedCountByPrinting?.[p.id] ?? 0), 0)
      : undefined;

    return (
      <CardThumbnail
        printing={displayPrinting}
        onClick={handleGridCardClick}
        onSiblingClick={handleSiblingClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        siblings={siblings}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        visibleFields={visibleFields}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        ownedCount={
          addMode
            ? (ownedCountByPrinting?.[displayPrinting.id] ?? 0)
            : ownedCounts?.get(displayPrinting.id)
        }
        totalOwnedCount={totalOwned}
        onQuickAdd={handleQuickAdd}
        onUndoAdd={handleUndoAdd}
        onOpenVariants={handleOpenVariants}
      />
    );
  };

  const totalAdded = [...addedItems.values()].reduce((sum, entry) => sum + entry.quantity, 0);

  const addedPillDesktop = addedItems.size > 0 && (
    <button
      type="button"
      onClick={() => useAddModeStore.getState().toggleAddedList()}
      className={cn(
        "h-8 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors",
        showAddedList
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {totalAdded} {totalAdded === 1 ? "card" : "cards"} added
    </button>
  );

  const addedPillMobile = addedItems.size > 0 && (
    <button
      type="button"
      onClick={() => useAddModeStore.getState().toggleAddedList()}
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
        showAddedList
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {totalAdded} {totalAdded === 1 ? "card" : "cards"} added
    </button>
  );

  const toolbar = (
    <>
      {/* Search bar */}
      <div className="mb-3 flex items-start gap-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
        {addMode && (
          <div className="hidden items-center gap-3 md:flex">
            {addedPillDesktop}
            <Button className="h-8" size="sm" onClick={() => onDone?.()}>
              Done
            </Button>
          </div>
        )}
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
      {/* Filter panel */}
      <div className="wide:hidden hidden space-y-3 sm:block">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <FilterBadgeSections
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </div>
        <div className="grid grid-cols-4 gap-x-6 gap-y-3">
          <FilterRangeSections availableFilters={availableFilters} />
        </div>
      </div>
    </>
  );

  const leftPane = (
    <Pane className="wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      </div>
    </Pane>
  );

  const rightPane = (() => {
    if (isMobile) {
      return;
    }

    if (showAddedList && addedItems.size > 0) {
      return (
        <Pane className="md:block">
          <AddedCardsList
            onCardClick={handleGridCardClick}
            onClose={() => useAddModeStore.getState().closeAddedList()}
          />
        </Pane>
      );
    }

    return (
      <SelectionDetailPane
        items={items}
        printingsByCardId={printingsByCardId}
        showImages={showImages}
        onSearchAndClose={searchAndClose}
      />
    );
  })();

  const variantPrintings = variantPopover
    ? printingsByCardId.get(variantPopover.cardId)
    : undefined;

  return (
    <>
      <BrowserCardViewer
        items={items}
        totalItems={allPrintings.length}
        renderCard={renderCard}
        setOrder={sets}
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
        addStripHeight={addMode ? ADD_STRIP_HEIGHT : 0}
      >
        {/* Mobile: fullscreen overlays */}
        {showAddedList && addedItems.size > 0 && isMobile && (
          <MobileDetailOverlay>
            <AddedCardsList
              onCardClick={handleGridCardClick}
              onClose={() => useAddModeStore.getState().closeAddedList()}
            />
          </MobileDetailOverlay>
        )}
        {!showAddedList && isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={searchAndClose}
          />
        )}
      </BrowserCardViewer>

      {/* Variant add popover (portal) */}
      {variantPopover &&
        variantPrintings &&
        handleQuickAdd &&
        handleUndoAdd &&
        createPortal(
          <div
            ref={variantPopoverRef}
            className="fixed z-[100]"
            style={{ top: variantPopover.pos.top, left: variantPopover.pos.left }}
          >
            <VariantAddPopover
              printings={variantPrintings}
              ownedCounts={ownedCountByPrinting}
              onQuickAdd={handleQuickAdd}
              onUndoAdd={handleUndoAdd}
            />
          </div>,
          document.body,
        )}

      {/* Mobile header: pulsing dot + pill + Done (portaled into layout header slot) */}
      {addMode &&
        isMobile &&
        addModeSlot &&
        createPortal(
          <>
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            <div className="flex-1" />
            {addedPillMobile}
            <Button size="sm" onClick={() => onDone?.()}>
              Done
            </Button>
          </>,
          addModeSlot,
        )}
    </>
  );
}
