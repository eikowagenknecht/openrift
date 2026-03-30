import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckSquare,
  LibraryBig,
  Minus,
  Package,
  PackagePlus,
  Trash2,
  X,
} from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { use, useEffect, useDeferredValue, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { AddedCardsList } from "@/components/collection/added-cards-list";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollectionCardData } from "@/hooks/use-collection-card-data";
import { useCollections } from "@/hooks/use-collections";
import { useAddCopies, useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-client";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddModeSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { DisposeDialog } from "./dispose-dialog";
import { DraggableCard } from "./draggable-card";
import { MoveDialog } from "./move-dialog";
import { QuickAddPalette } from "./quick-add-palette";

interface CollectionGridProps {
  collectionId?: string;
}

export function CollectionGrid({ collectionId }: CollectionGridProps) {
  const isMobile = useIsMobile();
  const { data: collections } = useCollections();
  const showImages = useDisplayStore((state) => state.showImages);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "tcgplayer";

  // ── Mode state ──────────────────────────────────────────────────────
  const [browsing, setBrowsing] = useQueryState("browsing", parseAsBoolean.withDefault(false));
  const [selectMode, setSelectMode] = useState(false);
  const mode = browsing ? "add" : selectMode ? "select" : "browse";

  // ── Filter state (active in all modes) ──────────────────────────────
  const { filters, sortBy, sortDir, view, hasActiveFilters } = useFilterValues();
  const { setSearch, clearAllFilters } = useFilterActions();
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // "copies" is a collection-only UI concept — at the data level it behaves like "printings"
  const dataView = view === "copies" ? "printings" : view;

  // ── Collection data (browse/select modes) ───────────────────────────
  const {
    availableFilters: collectionAvailableFilters,
    sortedCards: collectionSortedCards,
    printingsByCardId: collectionPrintingsByCardId,
    stacks,
    totalCopies,
    stackByPrintingId,
    totalUniqueCards: collectionTotalUniqueCards,
    setDisplayLabel: collectionSetDisplayLabel,
  } = useCollectionCardData({
    collectionId,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    sets,
    favoriteMarketplace,
  });

  // ── Catalog data (add mode) ─────────────────────────────────────────
  const {
    availableFilters: catalogAvailableFilters,
    sortedCards: catalogSortedCards,
    printingsByCardId: catalogPrintingsByCardId,
    priceRangeByCardId: catalogPriceRangeByCardId,
    totalUniqueCards: catalogTotalUniqueCards,
    setDisplayLabel: catalogSetDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    ownedCountByPrinting,
    favoriteMarketplace,
  });

  // ── Pick active data set based on mode ──────────────────────────────
  const isAddMode = mode === "add";
  const availableFilters = isAddMode ? catalogAvailableFilters : collectionAvailableFilters;
  const sortedCards = isAddMode ? catalogSortedCards : collectionSortedCards;
  const printingsByCardId = isAddMode ? catalogPrintingsByCardId : collectionPrintingsByCardId;
  const totalUniqueCards = isAddMode ? catalogTotalUniqueCards : collectionTotalUniqueCards;
  const setDisplayLabel = isAddMode ? catalogSetDisplayLabel : collectionSetDisplayLabel;

  // Defer the card grid re-render so filter UI responds immediately
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  // ── Selection state (select mode) ───────────────────────────────────
  const { selected, toggleSelect, toggleStack, toggleSelectAll, clearSelection } =
    useCardSelection();
  // "copies" view expands individual copies; "cards"/"printings" stay stacked
  const stacked = view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const navigate = useNavigate();

  // ── Add mode state ──────────────────────────────────────────────────
  const addModeSlot = use(AddModeSlotContext);
  const addedItems = useAddModeStore((s) => s.addedItems);
  const showAddedList = useAddModeStore((s) => s.showAddedList);
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const addCopies = useAddCopies();
  const addModeDisposeCopies = useDisposeCopies();

  // Fan-card sibling overrides (cards view, add mode)
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

  // ── Navigation helpers ──────────────────────────────────────────────
  const inboxId = collections.find((collection) => collection.isInbox)?.id;
  const currentCollection = collections.find((collection) => collection.id === collectionId);
  const addTarget = collectionId ?? inboxId;

  const startBrowsing = () => {
    if (selectMode) {
      setSelectMode(false);
      clearSelection();
    }
    if (collectionId) {
      void setBrowsing(true);
    } else if (inboxId) {
      void navigate({
        to: "/collections/$collectionId",
        params: { collectionId: inboxId },
        search: { browsing: true },
      });
    }
  };

  const handleCloseBrowsing = () => {
    clearAllFilters();
    void setBrowsing(null);
    useSelectionStore.getState().closeDetail();
    useAddModeStore.getState().reset();
    setTopPrintingOverrides(new Map());
    globalThis.scrollTo(0, 0);
  };

  const enterSelectMode = () => setSelectMode(true);
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  // Cmd+K / Ctrl+K shortcut (skip in add mode — it has its own search)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (mode === "add") {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode]);

  // ── Mutation handlers ───────────────────────────────────────────────
  const handleMove = (toCollectionId: string) => {
    moveCopies.mutate(
      { copyIds: [...selected], toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${selected.size} card${selected.size > 1 ? "s" : ""}`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleDispose = () => {
    disposeCopies.mutate(
      { copyIds: [...selected] },
      {
        onSuccess: () => {
          toast.success(`Removed ${selected.size} card${selected.size > 1 ? "s" : ""}`);
          clearSelection();
          setDisposeOpen(false);
        },
      },
    );
  };

  const handleQuickAdd = addTarget
    ? async (printing: Printing) => {
        useAddModeStore.getState().incrementPending(printing);
        try {
          const data = await addCopies.mutateAsync({
            copies: [{ printingId: printing.id, collectionId: addTarget }],
          });
          const copyId = (data as { id: string }[])[0].id;
          useAddModeStore.getState().recordAdd(printing, copyId);
        } catch {
          // Server-side add failed — pending count is the only thing to clean up
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
        // Optimistic: remove from store immediately so rapid clicks read distinct IDs
        useAddModeStore.getState().recordUndo(printing.id);
        try {
          await addModeDisposeCopies.mutateAsync({ copyIds: [copyIdToRemove] });
        } catch {
          // Rollback on failure
          useAddModeStore.getState().recordAdd(printing, copyIdToRemove);
        }
      }
    : undefined;

  const handleOpenVariants = isAddMode
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

  // ── Grid click handlers ─────────────────────────────────────────────
  const findBy = dataView === "cards" ? "card" : ("printing" as const);

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

  // ── Build items list ────────────────────────────────────────────────
  let items: CardViewerItem[];
  const stackByItemId = new Map<string, StackedEntry>();

  if (isAddMode) {
    items = deferredSortedCards.map((printing) => ({
      id: printing.id,
      printing,
    }));
  } else {
    // Browse/select: use stacked collection data
    const filteredStacks = deferredSortedCards.map((printing) => ({
      printing,
      stack: stackByPrintingId.get(printing.id),
    }));

    items = stacked
      ? filteredStacks
          .filter(
            (entry): entry is { printing: Printing; stack: StackedEntry } =>
              entry.stack !== undefined,
          )
          .map((entry) => {
            stackByItemId.set(entry.stack.printingId, entry.stack);
            return { id: entry.stack.printingId, printing: entry.printing };
          })
      : filteredStacks
          .filter(
            (entry): entry is { printing: Printing; stack: StackedEntry } =>
              entry.stack !== undefined,
          )
          .flatMap((entry) =>
            entry.stack.copyIds.map((copyId) => {
              stackByItemId.set(copyId, entry.stack);
              return { id: copyId, printing: entry.printing };
            }),
          );
  }

  const allCopyIds = stacks.flatMap((stack) => stack.copyIds);

  // ── Drag preview printings (up to 3 unique printings from selection) ─
  const dragPreviewPrintings: Printing[] = [];
  if (mode === "select" && selected.size > 0) {
    const seen = new Set<string>();
    for (const item of items) {
      if (dragPreviewPrintings.length >= 3) {
        break;
      }
      const stack = stackByItemId.get(item.id);
      if (!stack) {
        continue;
      }
      const hasSelectedCopy = stacked
        ? stack.copyIds.some((id) => selected.has(id))
        : selected.has(item.id);
      if (hasSelectedCopy && !seen.has(item.printing.id)) {
        seen.add(item.printing.id);
        dragPreviewPrintings.push(item.printing);
      }
    }
  }

  // ── Render card ─────────────────────────────────────────────────────
  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    if (isAddMode) {
      return renderAddModeCard(item, ctx);
    }
    return renderCollectionCard(item, ctx);
  };

  const renderCollectionCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const stack = stackByItemId.get(item.id);
    if (!stack) {
      return null;
    }

    const isItemSelected =
      mode === "select"
        ? stacked
          ? stack.copyIds.every((id) => selected.has(id))
          : selected.has(item.id)
        : false;

    const handleToggle = () => {
      if (stacked) {
        toggleStack(stack.copyIds);
      } else {
        toggleSelect(item.id);
      }
    };

    const handleClick = (printing: Printing, event?: MouseEvent) => {
      // Ctrl+click auto-enters select mode
      if (mode === "browse" && event?.ctrlKey) {
        setSelectMode(true);
        handleToggle();
        return;
      }
      if (mode === "select") {
        handleToggle();
      } else {
        handleGridCardClick(printing);
      }
    };

    const ownedCount = stacked ? stack.copyIds.length : 1;

    // Resolve which copy IDs this card represents for drag-and-drop
    const dragCopyIds =
      mode === "select" && isItemSelected && selected.size > 0
        ? [...selected]
        : stacked
          ? stack.copyIds
          : [item.id];

    return (
      <DraggableCard
        id={item.id}
        copyIds={dragCopyIds}
        printing={item.printing}
        previewPrintings={dragPreviewPrintings.length > 0 ? dragPreviewPrintings : [item.printing]}
        sourceCollectionId={collectionId}
      >
        <div className="relative">
          {mode === "select" && (
            <SelectionCheckbox isSelected={isItemSelected} onToggle={handleToggle} />
          )}
          {isItemSelected && (
            <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
          )}
          <CardThumbnail
            printing={item.printing}
            onClick={(printing) => handleClick(printing)}
            showImages={showImages}
            view="printings"
            cardWidth={ctx.cardWidth}
            priority={ctx.priority}
            isSelected={ctx.isSelected}
            isFlashing={ctx.isFlashing}
            aboveCard={<OwnedCountStrip count={ownedCount} printingId={item.printing.id} />}
          />
        </div>
      </DraggableCard>
    );
  };

  const renderAddModeCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.card.id;
    const siblings = catalogPrintingsByCardId.get(cardId);

    const overrideId = topPrintingOverrides.get(cardId);
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    const hasMultipleVariants = dataView === "cards" && (siblings?.length ?? 0) > 1;
    const totalOwned = hasMultipleVariants
      ? siblings?.reduce((sum, printing) => sum + (ownedCountByPrinting?.[printing.id] ?? 0), 0)
      : undefined;

    const ownedCount = ownedCountByPrinting?.[displayPrinting.id] ?? 0;

    return (
      <CardThumbnail
        printing={displayPrinting}
        onClick={handleGridCardClick}
        onSiblingClick={handleSiblingClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        siblings={dataView === "cards" ? siblings : undefined}
        priceRange={catalogPriceRangeByCardId?.get(cardId)}
        view={dataView}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        ownedCount={ownedCount}
        totalOwnedCount={totalOwned}
        onQuickAdd={handleQuickAdd}
        onUndoAdd={handleUndoAdd}
        onOpenVariants={handleOpenVariants}
        dimmed={ownedCount === 0}
      />
    );
  };

  // ── Toolbar ─────────────────────────────────────────────────────────
  const totalAdded = [...addedItems.values()].reduce(
    (sum, entry) => sum + entry.quantity + entry.pendingCount,
    0,
  );

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
        <DesktopOptionsBar className="hidden sm:flex" showCopies={mode !== "add"} />
        {mode === "add" && (
          <div className="hidden items-center gap-3 md:flex">
            {addedPillDesktop}
            <Button className="h-8" size="sm" onClick={handleCloseBrowsing}>
              Done
            </Button>
          </div>
        )}
        {mode !== "add" && (
          <div className="hidden items-center gap-3 sm:flex">
            {addTarget && (
              <ButtonGroup aria-label="Collection actions">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuickAddOpen(true)}
                  title={`Quick add (${navigator.platform.startsWith("Mac") ? "⌘K" : "Ctrl+K"})`}
                >
                  <PackagePlus className="size-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={startBrowsing} title="Browse & add">
                  <LibraryBig className="size-4" />
                </Button>
              </ButtonGroup>
            )}
            {mode === "select" ? (
              <ButtonGroup aria-label="Selection actions">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleSelectAll(allCopyIds)}
                  title={selected.size === totalCopies ? "Deselect all" : "Select all"}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={exitSelectMode}
                  title="Done selecting"
                >
                  <X className="size-4" />
                </Button>
              </ButtonGroup>
            ) : (
              <ButtonGroup aria-label="Selection actions">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={enterSelectMode}
                  title={`Select ${view}`}
                >
                  <CheckSquare className="size-4" />
                </Button>
              </ButtonGroup>
            )}
          </div>
        )}
        <MobileOptionsDrawer
          doneLabel={
            hasActiveFilters
              ? `Show ${sortedCards.length} ${dataView === "cards" ? "cards" : "printings"}`
              : undefined
          }
          className="sm:hidden"
        >
          <MobileOptionsContent showCopies={mode !== "add"} />
          <MobileFilterContent
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </MobileOptionsDrawer>
      </div>
      {/* Inline filter panel (visible when left pane is hidden) */}
      <div className="@wide:hidden hidden space-y-3 sm:block">
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
      {/* Info strip with card count, collection value, and mobile actions */}
      {mode !== "add" &&
        (() => {
          const formatValue = formatterForMarketplace(favoriteMarketplace);
          const valueCents = currentCollection
            ? currentCollection.totalValueCents
            : collections.reduce((sum, col) => sum + (col.totalValueCents ?? 0), 0);
          const unpricedCount = currentCollection
            ? currentCollection.unpricedCopyCount
            : collections.reduce((sum, col) => sum + (col.unpricedCopyCount ?? 0), 0);
          return (
            <div className="bg-muted/50 text-muted-foreground mt-3 mb-3 flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
              <span className="shrink-0">
                {totalCopies} card{totalCopies === 1 ? "" : "s"}
                {stacks.length !== totalCopies && ` (${stacks.length} unique)`}
              </span>
              {mode === "select" && selected.size > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3" />
                  {selected.size}
                </Badge>
              )}
              <div className="flex-1" />
              {valueCents !== null && valueCents !== undefined && (
                <span className="shrink-0">
                  {formatValue(valueCents / 100)}
                  {unpricedCount ? (
                    <span className="text-muted-foreground/60 ml-1">
                      ({unpricedCount} unpriced)
                    </span>
                  ) : null}
                </span>
              )}
              {/* Mobile-only action buttons */}
              <div className="flex items-center gap-1 sm:hidden">
                {addTarget && (
                  <ButtonGroup aria-label="Collection actions">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuickAddOpen(true)}
                      title="Quick add"
                    >
                      <PackagePlus className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={startBrowsing}
                      title="Browse & add"
                    >
                      <LibraryBig className="size-4" />
                    </Button>
                  </ButtonGroup>
                )}
                {mode === "select" ? (
                  <ButtonGroup aria-label="Selection actions">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => toggleSelectAll(allCopyIds)}
                      title={selected.size === totalCopies ? "Deselect all" : "Select all"}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={exitSelectMode}
                      title="Done selecting"
                    >
                      <X className="size-4" />
                    </Button>
                  </ButtonGroup>
                ) : (
                  <ButtonGroup aria-label="Selection actions">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={enterSelectMode}
                      title={`Select ${view}`}
                    >
                      <CheckSquare className="size-4" />
                    </Button>
                  </ButtonGroup>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );

  // ── Panes ───────────────────────────────────────────────────────────
  const leftPane = (
    <Pane className="@wide:block px-3">
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
    if (isAddMode && showAddedList && addedItems.size > 0) {
      return (
        <Pane className="@md:block">
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
    ? catalogPrintingsByCardId.get(variantPopover.cardId)
    : undefined;

  // ── Empty state ─────────────────────────────────────────────────────
  if (!isAddMode && stacks.length === 0 && !hasActiveFilters) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-20">
        <Package className="size-10 opacity-50" />
        <p>No cards yet</p>
        <p className="text-xs">
          Browse the card catalog and add cards to{" "}
          {currentCollection ? `"${currentCollection.name}"` : "your collection"}.
        </p>
        {addTarget && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setQuickAddOpen(true)}>
              <PackagePlus className="mr-1 size-3.5" />
              Quick add
            </Button>
            <Button size="sm" onClick={startBrowsing}>
              <LibraryBig className="mr-1 size-3.5" />
              Browse & add
            </Button>
          </div>
        )}
        {addTarget && (
          <QuickAddPalette
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            collectionId={addTarget}
            collectionName={currentCollection?.name ?? "Collection"}
            printingsByCardId={catalogPrintingsByCardId}
            ownedCountByPrinting={ownedCountByPrinting}
          />
        )}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <>
      <BrowserCardViewer
        items={items}
        totalItems={isAddMode ? allPrintings.length : totalCopies}
        renderCard={renderCard}
        setOrder={sets}
        deferredSortedCards={deferredSortedCards}
        printingsByCardId={printingsByCardId}
        view={dataView}
        onItemClick={handleGridCardClick}
        stale={isGridStale}
        toolbar={toolbar}
        leftPane={leftPane}
        aboveGrid={
          <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
        }
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
      >
        {/* Floating action bar (select mode) */}
        {mode === "select" && selected.size > 0 && (
          <div className="border-border bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 shadow-lg">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMoveOpen(true)}
              disabled={moveCopies.isPending}
            >
              <Minus className="mr-1 size-3.5" />
              Move
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDisposeOpen(true)}
              disabled={disposeCopies.isPending}
            >
              <Trash2 className="mr-1 size-3.5" />
              Dispose
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} aria-label="Clear selection">
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Mobile overlays */}
        {isAddMode && showAddedList && addedItems.size > 0 && isMobile && (
          <MobileDetailOverlay>
            <AddedCardsList
              onCardClick={handleGridCardClick}
              onClose={() => useAddModeStore.getState().closeAddedList()}
            />
          </MobileDetailOverlay>
        )}
        {!(isAddMode && showAddedList) && isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={searchAndClose}
          />
        )}

        <MoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          collections={collections.filter((collection) => collection.id !== collectionId)}
          onMove={handleMove}
          isPending={moveCopies.isPending}
        />

        <DisposeDialog
          open={disposeOpen}
          onOpenChange={setDisposeOpen}
          count={selected.size}
          onConfirm={handleDispose}
          isPending={disposeCopies.isPending}
        />
      </BrowserCardViewer>

      {/* Variant add popover (portal, add mode only) */}
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
      {isAddMode &&
        isMobile &&
        addModeSlot &&
        createPortal(
          <>
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            <div className="flex-1" />
            {addedPillMobile}
            <Button size="sm" onClick={handleCloseBrowsing}>
              Done
            </Button>
          </>,
          addModeSlot,
        )}

      {/* Quick-add palette (browse/select modes) */}
      {!isAddMode && addTarget && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={addTarget}
          collectionName={currentCollection?.name ?? "Collection"}
          printingsByCardId={catalogPrintingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
        />
      )}
    </>
  );
}
