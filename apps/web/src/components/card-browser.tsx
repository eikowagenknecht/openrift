import type { Printing } from "@openrift/shared";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useEffect, useDeferredValue, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
import type { AddedEntry } from "@/components/collection/added-cards-list";
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
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
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

  // Adding mode state — props override URL params when CardBrowser is used inline
  const [addingParam] = useQueryState("adding", parseAsBoolean.withDefault(false));
  const [addingToParam] = useQueryState("addingTo", parseAsString.withDefault(""));
  const adding = collectionIdProp ? true : addingParam;
  const addingTo = collectionIdProp ?? addingToParam;
  const addFlowRef = useRef<AddToCollectionFlowHandle>(null);
  const [addedItems, setAddedItems] = useState<Map<string, AddedEntry>>(new Map());
  const [showAddedList, setShowAddedList] = useState(false);
  const addCopies = useAddCopies();
  const disposeCopies = useDisposeCopies();

  // Which printing is shown on top when a fan-card sibling is clicked (cards view only)
  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

  // Variant popover state
  const [variantPopover, setVariantPopover] = useState<{
    cardId: string;
    pos: { top: number; left: number };
  } | null>(null);
  const variantPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!variantPopover) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (variantPopoverRef.current && !variantPopoverRef.current.contains(event.target as Node)) {
        setVariantPopover(null);
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
  const addMode = adding && Boolean(addingTo);

  const handleGridCardClick = (printing: Printing) => {
    setShowAddedList(false);
    setVariantPopover(null);
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
  const handleQuickAdd = addMode
    ? (printing: Printing) => {
        const sourceId = addFlowRef.current?.getAcquisitionSourceId();
        addCopies.mutate(
          {
            copies: [
              { printingId: printing.id, collectionId: addingTo, acquisitionSourceId: sourceId },
            ],
          },
          {
            onSuccess: (data) => {
              const copyId = (data as { id: string }[])[0].id;
              setAddedItems((prev) => {
                const next = new Map(prev);
                const existing = prev.get(printing.id);
                next.delete(printing.id);
                next.set(printing.id, {
                  printing,
                  quantity: (existing?.quantity ?? 0) + 1,
                  copyIds: [...(existing?.copyIds ?? []), copyId],
                });
                return next;
              });
            },
          },
        );
      }
    : undefined;

  const handleUndoAdd = addMode
    ? (printing: Printing) => {
        const entry = addedItems.get(printing.id);
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
              setAddedItems((prev) => {
                const next = new Map(prev);
                const existing = prev.get(printing.id);
                if (!existing) {
                  return next;
                }
                const newCopyIds = existing.copyIds.slice(0, -1);
                if (newCopyIds.length === 0) {
                  next.delete(printing.id);
                } else {
                  next.delete(printing.id);
                  next.set(printing.id, {
                    ...existing,
                    quantity: existing.quantity - 1,
                    copyIds: newCopyIds,
                  });
                }
                return next;
              });
            },
          },
        );
      }
    : undefined;

  const handleOpenVariants = addMode
    ? (printing: Printing, anchorEl: HTMLElement) => {
        const rect = anchorEl.getBoundingClientRect();
        setVariantPopover({
          cardId: printing.card.id,
          pos: {
            top: rect.bottom + 4,
            left: Math.max(
              8,
              Math.min(rect.left + rect.width / 2 - 112, globalThis.innerWidth - 232),
            ),
          },
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
        sessionAddedCount={addedItems.get(displayPrinting.id)?.quantity}
        onQuickAdd={handleQuickAdd}
        onUndoAdd={handleUndoAdd}
        onOpenVariants={handleOpenVariants}
      />
    );
  };

  const toolbar = (
    <>
      {/* Collection add bar */}
      {addMode && (
        <AddToCollectionFlow
          ref={addFlowRef}
          collectionId={addingTo}
          addedItems={addedItems}
          showingAddedList={showAddedList}
          onToggleAddedList={() => setShowAddedList((prev) => !prev)}
          onDone={onDone}
        />
      )}
      {/* Search bar */}
      <div className="mb-3 flex items-start gap-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
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
            items={addedItems}
            onCardClick={handleGridCardClick}
            onClose={() => setShowAddedList(false)}
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
              items={addedItems}
              onCardClick={handleGridCardClick}
              onClose={() => setShowAddedList(false)}
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
              addedItems={addedItems}
              onQuickAdd={handleQuickAdd}
              onUndoAdd={handleUndoAdd}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
