import type { Marketplace, Printing } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CheckSquareIcon,
  LibraryBigIcon,
  PackageIcon,
  PackagePlusIcon,
  XIcon,
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
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
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
import { MobileDetailOverlay } from "@/components/layout/mobile-detail-overlay";
import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollectionCardData } from "@/hooks/use-collection-card-data";
import { useCollections, useCollectionsMap } from "@/hooks/use-collections";
import { useAddCopies, useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-client";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { DisposeDialog } from "./dispose-dialog";
import { DraggableCard } from "./draggable-card";
import { MoveDialog } from "./move-dialog";
import { QuickAddPalette } from "./quick-add-palette";

function AddedPill({
  count,
  active,
  size,
}: {
  count: number;
  active: boolean;
  size: "desktop" | "mobile";
}) {
  return (
    <button
      type="button"
      onClick={() => useAddModeStore.getState().toggleAddedList()}
      className={cn(
        "rounded-lg font-medium whitespace-nowrap transition-colors",
        size === "desktop" ? "h-8 px-3 text-sm" : "h-8 px-2 text-sm",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {count} {count === 1 ? "card" : "cards"} added
    </button>
  );
}

interface CollectionGridProps {
  collectionId?: string;
  title: string;
}

function buildCopyCountByCardId(stacks: StackedEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const stack of stacks) {
    const cardId = stack.printing.card.id;
    map.set(cardId, (map.get(cardId) ?? 0) + stack.copyIds.length);
  }
  return map;
}

export function CollectionGrid({ collectionId, title }: CollectionGridProps) {
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data: collections } = useCollections();
  const collectionsMap = useCollectionsMap();
  const showImages = useDisplayStore((state) => state.showImages);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "tcgplayer";

  // ── Mode state ──────────────────────────────────────────────────────
  const [browsing, setBrowsing] = useQueryState("browsing", parseAsBoolean.withDefault(false));
  const [selectMode, setSelectMode] = useState(false);
  const mode = browsing ? "add" : selectMode ? "select" : "browse";

  // ── Filter state (active in all modes) ──────────────────────────────
  const { filters, sortBy, sortDir, view, groupBy, groupDir, hasActiveFilters } = useFilterValues();
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

  // ── Catalog data (add mode — skip expensive computation in browse/select) ──
  const isAddMode = mode === "add";
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
    languageFilter: useDisplayStore((s) => s.languages),
    filters,
    sortBy,
    sortDir,
    view: dataView,
    ownedCountByPrinting,
    favoriteMarketplace,
    enabled: isAddMode,
  });

  // ── Pick active data set based on mode ──────────────────────────────
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
  // In "cards" view, sum copy counts across all printings of the same card
  const copyCountByCardId = buildCopyCountByCardId(stacks);

  // "copies" view expands individual copies; "cards"/"printings" stay stacked
  const stacked = view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const navigate = useNavigate();

  // ── Add mode state ──────────────────────────────────────────────────
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
  const currentCollection = collectionId ? collectionsMap.get(collectionId) : undefined;
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

    const ownedCount = stacked
      ? ((dataView === "cards"
          ? copyCountByCardId.get(item.printing.card.id)
          : stack.copyIds.length) ?? 0)
      : 1;

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
            aboveCard={
              <OwnedCountStrip
                count={ownedCount}
                printingId={item.printing.id}
                cardName={item.printing.card.name}
                shortCode={item.printing.shortCode}
              />
            }
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
        dimmed={ownedCount === 0}
        topSlot={
          handleQuickAdd && (
            <CollectionAddStrip
              printing={displayPrinting}
              ownedCount={ownedCount}
              totalOwnedCount={totalOwned}
              hasVariants={dataView === "cards" && (siblings?.length ?? 0) > 1}
              onQuickAdd={handleQuickAdd}
              onUndoAdd={handleUndoAdd}
              onOpenVariants={handleOpenVariants}
            />
          )
        }
      />
    );
  };

  // ── Toolbar ─────────────────────────────────────────────────────────
  const totalAdded = [...addedItems.values()].reduce(
    (sum, entry) => sum + entry.quantity + entry.pendingCount,
    0,
  );

  const addedPillDesktop = addedItems.size > 0 && (
    <AddedPill count={totalAdded} active={showAddedList} size="desktop" />
  );

  const addedPillMobile = addedItems.size > 0 && (
    <AddedPill count={totalAdded} active={showAddedList} size="mobile" />
  );

  const formatValue = formatterForMarketplace(favoriteMarketplace as Marketplace);
  const valueCents = currentCollection
    ? currentCollection.totalValueCents
    : collections.reduce((sum, col) => sum + (col.totalValueCents ?? 0), 0);
  const unpricedCount = currentCollection
    ? currentCollection.unpricedCopyCount
    : collections.reduce((sum, col) => sum + (col.unpricedCopyCount ?? 0), 0);

  const collectionTopBar = (
    <CollectionTopBar
      title={title}
      onToggleSidebar={toggleSidebar}
      mode={mode}
      selectedCount={selected.size}
      valueCents={valueCents}
      unpricedCount={unpricedCount}
      formatValue={formatValue}
      addTarget={addTarget}
      addedPillMobile={addedPillMobile}
      onQuickAdd={() => setQuickAddOpen(true)}
      onBrowse={startBrowsing}
      onCloseBrowsing={handleCloseBrowsing}
      onSelectAll={() => toggleSelectAll(stacks.flatMap((stack) => stack.copyIds))}
      onEnterSelect={enterSelectMode}
      onExitSelect={exitSelectMode}
      isAllSelected={selected.size === totalCopies}
      view={view}
    />
  );

  const topBarPortal = topBarSlot && createPortal(collectionTopBar, topBarSlot);

  const toolbar = (
    <>
      {/* Search bar */}
      <div className="mb-3 flex items-start gap-3">
        <SearchBar
          totalCards={view === "copies" ? totalCopies : totalUniqueCards}
          filteredCount={
            view === "copies"
              ? sortedCards.reduce(
                  (sum, card) => sum + (stackByPrintingId.get(card.id)?.copyIds.length ?? 0),
                  0,
                )
              : sortedCards.length
          }
        />
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <DesktopOptionsBar className="hidden sm:flex" showCopies={mode !== "add"} />
        {mode === "add" && (
          <div className="hidden items-center gap-3 md:flex">
            {addedPillDesktop}
            <Button onClick={handleCloseBrowsing}>Done</Button>
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
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        setDisplayLabel={setDisplayLabel}
      />
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
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4">
        {topBarPortal}
        <PackageIcon className="size-16 opacity-50" />
        <p>No cards yet</p>
        <p>
          Browse the card catalog and add cards to{" "}
          {currentCollection ? `"${currentCollection.name}"` : "your collection"}.
        </p>
        <Link
          to="/help/$slug"
          params={{ slug: "cards-printings-copies" }}
          className="text-muted-foreground hover:text-foreground underline"
        >
          Learn about cards, printings &amp; copies
        </Link>
        {addTarget && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setQuickAddOpen(true)}>
              <PackagePlusIcon className="mr-1 size-3.5" />
              Quick add
            </Button>
            <Button onClick={startBrowsing}>
              <LibraryBigIcon className="mr-1 size-3.5" />
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
      {topBarPortal}
      <BrowserCardViewer
        items={items}
        totalItems={isAddMode ? allPrintings.length : totalCopies}
        renderCard={renderCard}
        setOrder={sets}
        groupBy={groupBy}
        groupDir={groupDir}
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
          <FloatingActionBar
            selectedCount={selected.size}
            onMove={() => setMoveOpen(true)}
            onDispose={() => setDisposeOpen(true)}
            onClear={clearSelection}
            isMovePending={moveCopies.isPending}
            isDisposePending={disposeCopies.isPending}
          />
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

interface CollectionTopBarProps {
  title: string;
  onToggleSidebar: () => void;
  mode: "browse" | "select" | "add";
  selectedCount: number;
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
  addTarget?: string;
  addedPillMobile: React.ReactNode;
  onQuickAdd: () => void;
  onBrowse: () => void;
  onCloseBrowsing: () => void;
  onSelectAll: () => void;
  onEnterSelect: () => void;
  onExitSelect: () => void;
  isAllSelected: boolean;
  view: string;
}

function CollectionTopBar({
  title,
  onToggleSidebar,
  mode,
  selectedCount,
  valueCents,
  unpricedCount,
  formatValue,
  addTarget,
  addedPillMobile,
  onQuickAdd,
  onBrowse,
  onCloseBrowsing,
  onSelectAll,
  onEnterSelect,
  onExitSelect,
  isAllSelected,
  view,
}: CollectionTopBarProps) {
  return (
    <PageTopBar>
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

      {/* Browse/select: card count + value */}
      {mode !== "add" && (
        <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
          {mode === "select" && selectedCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <CheckIcon className="size-3" />
              {selectedCount}
            </Badge>
          )}
          {valueCents !== null && valueCents !== undefined && (
            <span>
              {formatValue(valueCents / 100)}
              {unpricedCount ? (
                <span className="text-muted-foreground/60 ml-1">({unpricedCount} unpriced)</span>
              ) : null}
            </span>
          )}
        </span>
      )}

      {/* Add mode: pulsing dot (mobile indicator) */}
      {mode === "add" && (
        <span className="size-2 animate-pulse rounded-full bg-red-500 sm:hidden" />
      )}

      <PageTopBarActions>
        {mode === "add" ? (
          <div className="flex items-center gap-2 sm:hidden">
            {addedPillMobile}
            <Button onClick={onCloseBrowsing}>Done</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {addTarget && (
              <>
                <Button variant="ghost" size="icon" onClick={onQuickAdd} className="sm:hidden">
                  <PackagePlusIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onQuickAdd} className="hidden sm:flex">
                  <PackagePlusIcon className="size-4" />
                  Quick add
                </Button>
                <Button variant="ghost" size="icon" onClick={onBrowse} className="sm:hidden">
                  <LibraryBigIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onBrowse} className="hidden sm:flex">
                  <LibraryBigIcon className="size-4" />
                  Browse & add
                </Button>
              </>
            )}
            {mode === "select" ? (
              <>
                <Button variant="ghost" size="icon" onClick={onSelectAll} className="sm:hidden">
                  <CheckIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onSelectAll} className="hidden sm:flex">
                  <CheckIcon className="size-4" />
                  {isAllSelected ? "Deselect all" : "Select all"}
                </Button>
                <Button variant="ghost" size="icon" onClick={onExitSelect} className="sm:hidden">
                  <XIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onExitSelect} className="hidden sm:flex">
                  <XIcon className="size-4" />
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon" onClick={onEnterSelect} className="sm:hidden">
                  <CheckSquareIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEnterSelect}
                  className="hidden sm:flex"
                >
                  <CheckSquareIcon className="size-4" />
                  Select {view}
                </Button>
              </>
            )}
          </div>
        )}
      </PageTopBarActions>
    </PageTopBar>
  );
}
