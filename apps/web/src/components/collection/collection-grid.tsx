import type { Marketplace, Printing } from "@openrift/shared";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  CheckIcon,
  CheckSquareIcon,
  EllipsisVerticalIcon,
  LibraryBigIcon,
  PackageIcon,
  PackagePlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollectionCardData } from "@/hooks/use-collection-card-data";
import { useCollections, useCollectionsMap, useDeleteCollection } from "@/hooks/use-collections";
import { useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePrices } from "@/hooks/use-prices";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-session";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { DeleteCollectionDialog } from "./delete-collection-dialog";
import { DisposeDialog } from "./dispose-dialog";
import { DisposePickerPopover } from "./dispose-picker-popover";
import { DraggableCard } from "./draggable-card";
import { EditCollectionDialog } from "./edit-collection-dialog";
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
    const cardId = stack.printing.cardId;
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
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";

  // ── Mode state ──────────────────────────────────────────────────────
  const { browsing: browsingParam } = useSearch({ strict: false });
  const browsing = browsingParam ?? false;
  const [selectMode, setSelectMode] = useState(false);
  const mode = browsing ? "add" : selectMode ? "select" : "browse";

  // ── Filter state (active in all modes) ──────────────────────────────
  const { filters, sortBy, sortDir, view, groupBy, groupDir, hasActiveFilters } = useFilterValues();
  const { setSearch, clearAllFilters } = useFilterActions();
  const { allPrintings, sets } = useCards();
  const prices = usePrices();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Collection shows everything the user owns. Language preference is not
  // auto-applied as a filter (unlike the /cards catalog) — otherwise owned
  // non-preferred-language cards would vanish silently. Users who want to
  // narrow by language use the Language section in the filter panel.
  const languageFilter = filters.languages;

  // "copies" is a collection-only UI concept — at the data level it behaves like "printings"
  const dataView = view === "copies" ? "printings" : view;
  const keywordReverseMap = useKeywordReverseMap();

  // ── Collection data (browse/select modes) ───────────────────────────
  const {
    availableFilters: collectionAvailableFilters,
    availableLanguages: collectionAvailableLanguages,
    sortedCards: collectionSortedCards,
    printingsByCardId: collectionPrintingsByCardId,
    stacks,
    totalCopies,
    stackByPrintingId,
    totalUniqueCards: collectionTotalUniqueCards,
    setDisplayLabel: collectionSetDisplayLabel,
    isReady: copiesReady,
  } = useCollectionCardData({
    collectionId,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    sets,
    favoriteMarketplace,
    prices,
    keywordReverseMap,
    languageOrder: languageFilter,
  });

  // ── Catalog data (used by add mode grid + quick-add palette in all modes) ──
  const isAddMode = mode === "add";
  const {
    availableFilters: catalogAvailableFilters,
    availableLanguages: catalogAvailableLanguages,
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
    prices,
    keywordReverseMap,
  });

  // ── Pick active data set based on mode ──────────────────────────────
  const availableFilters = isAddMode ? catalogAvailableFilters : collectionAvailableFilters;
  const availableLanguages = isAddMode ? catalogAvailableLanguages : collectionAvailableLanguages;
  const sortedCards = isAddMode ? catalogSortedCards : collectionSortedCards;
  const printingsByCardId = isAddMode ? catalogPrintingsByCardId : collectionPrintingsByCardId;
  const totalUniqueCards = isAddMode ? catalogTotalUniqueCards : collectionTotalUniqueCards;
  const setDisplayLabel = isAddMode ? catalogSetDisplayLabel : collectionSetDisplayLabel;

  // Defer the card grid re-render so filter UI responds immediately
  const deferredSortedCards = useDeferredValue(sortedCards);
  // Only surface the dimmed "stale" state if the deferred render is genuinely
  // slow. Adding or removing a single copy re-derives sortedCards but the
  // deferred value catches up within a frame; without this debounce the
  // grid briefly flashes grayed out on every +/- click.
  const stalePending = deferredSortedCards !== sortedCards;
  const [isGridStale, setIsGridStale] = useState(false);
  useEffect(() => {
    if (!stalePending) {
      setIsGridStale(false);
      return;
    }
    const timer = globalThis.setTimeout(() => setIsGridStale(true), 150);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [stalePending]);

  // ── Selection state (select mode) ───────────────────────────────────
  const {
    selected,
    toggleSelect,
    toggleStack,
    toggleSelectAll,
    clearSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
  } = useCardSelection();
  // In "cards" view, sum copy counts across all printings of the same card
  const copyCountByCardId = buildCopyCountByCardId(stacks);

  // In "cards" view, collect all copy IDs and printing IDs per card for selection/popover
  const allCopyIdsByCardId = new Map<string, string[]>();
  const allPrintingIdsByCardId = new Map<string, string[]>();
  if (dataView === "cards") {
    for (const stack of stacks) {
      const cardId = stack.printing.cardId;
      const copyIds = allCopyIdsByCardId.get(cardId);
      if (copyIds) {
        copyIds.push(...stack.copyIds);
      } else {
        allCopyIdsByCardId.set(cardId, [...stack.copyIds]);
      }
      const printingIds = allPrintingIdsByCardId.get(cardId);
      if (printingIds) {
        printingIds.push(stack.printingId);
      } else {
        allPrintingIdsByCardId.set(cardId, [stack.printingId]);
      }
    }
  }

  // "copies" view expands individual copies; "cards"/"printings" stay stacked
  const stacked = view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const deleteCollection = useDeleteCollection();
  const navigate = useNavigate();

  // ── Navigation helpers ──────────────────────────────────────────────
  const inbox = collections.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  const inboxName = inbox?.name;
  const currentCollection = collectionId ? collectionsMap.get(collectionId) : undefined;
  const addTarget = collectionId ?? inboxId;

  // ── Add mode state ──────────────────────────────────────────────────
  const addedItems = useAddModeStore((s) => s.addedItems);
  const showAddedList = useAddModeStore((s) => s.showAddedList);
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const disposePicker = useAddModeStore((s) => s.disposePicker);
  const closeDisposePicker = useAddModeStore((s) => s.closeDisposePicker);
  const {
    handleQuickAdd,
    handleUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    adjustedCount,
  } = useQuickAddActions(addTarget, collectionId);

  // Fan-card sibling overrides (cards view, add mode)
  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());
  const variantPopoverRef = useRef<HTMLDivElement>(null);
  const disposePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!variantPopover) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (variantPopoverRef.current && !variantPopoverRef.current.contains(event.target as Node)) {
        closeVariants();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [variantPopover, closeVariants]);

  useEffect(() => {
    if (!disposePicker) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (disposePickerRef.current && !disposePickerRef.current.contains(event.target as Node)) {
        closeDisposePicker();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [disposePicker, closeDisposePicker]);

  const startBrowsing = () => {
    if (selectMode) {
      setSelectMode(false);
      clearSelection();
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, browsing: true }),
      replace: true,
    });
  };

  const handleCloseBrowsing = () => {
    clearAllFilters();
    void navigate({
      to: ".",
      search: ({ browsing: _, ...rest }) => rest,
      replace: true,
    });
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

  // Switching collections drops any in-progress selection — a selected
  // copy from the previous collection wouldn't be visible in the new grid,
  // and the floating action bar would operate on invisible rows. Session
  // add-mode state is also per-collection (the "N new" counts and copyIds
  // reference the previous collection), so clear it too.
  useEffect(() => {
    setSelectMode(false);
    clearSelection();
    useAddModeStore.getState().reset();
  }, [collectionId, clearSelection]);

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

  const handleDeleteCollection = () => {
    if (!collectionId) {
      return;
    }
    deleteCollection.mutate(collectionId, {
      onSuccess: () => {
        setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const canDeleteCollection = Boolean(currentCollection && !currentCollection.isInbox);

  // ── Grid click handlers ─────────────────────────────────────────────
  const findBy = dataView === "cards" ? "card" : ("printing" as const);

  const handleGridCardClick = (printing: Printing) => {
    useAddModeStore.getState().closeAddedList();
    useAddModeStore.getState().closeVariants();
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    setTopPrintingOverrides((prev) => new Map(prev).set(printing.cardId, printing.id));
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

    // In "cards" view, operate on all copies across all printings of the same card
    const cardCopyIds = allCopyIdsByCardId.get(item.printing.cardId);
    const effectiveCopyIds = cardCopyIds ?? stack.copyIds;

    const isItemSelected =
      mode === "select"
        ? stacked
          ? effectiveCopyIds.every((id) => selected.has(id))
          : selected.has(item.id)
        : false;

    const handleToggle = () => {
      if (stacked) {
        toggleStack(effectiveCopyIds);
      } else {
        toggleSelect(item.id);
      }
      setLastSelectedItemId(item.id);
    };

    const handleShiftSelect = () => {
      const lastId = getLastSelectedItemId();
      if (lastId === null) {
        handleToggle();
        return;
      }
      const startIdx = items.findIndex((i) => i.id === lastId);
      const endIdx = items.findIndex((i) => i.id === item.id);
      if (startIdx === -1 || endIdx === -1) {
        handleToggle();
        return;
      }
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const rangeIds: string[] = [];
      for (let idx = lo; idx <= hi; idx++) {
        const rangeItem = items[idx];
        if (stacked) {
          const rangeCardCopyIds = allCopyIdsByCardId.get(rangeItem.printing.cardId);
          if (rangeCardCopyIds) {
            rangeIds.push(...rangeCardCopyIds);
          } else {
            const rangeStack = stackByItemId.get(rangeItem.id);
            if (rangeStack) {
              rangeIds.push(...rangeStack.copyIds);
            }
          }
        } else {
          rangeIds.push(rangeItem.id);
        }
      }
      addToSelection(rangeIds);
      setLastSelectedItemId(item.id);
    };

    const handleClick = (printing: Printing, event?: { shiftKey: boolean; ctrlKey: boolean }) => {
      // Ctrl+click auto-enters select mode
      if (mode === "browse" && event?.ctrlKey) {
        setSelectMode(true);
        handleToggle();
        return;
      }
      if (mode === "select") {
        if (event?.shiftKey) {
          handleShiftSelect();
        } else {
          handleToggle();
        }
      } else {
        handleGridCardClick(printing);
      }
    };

    const ownedCount = stacked
      ? ((dataView === "cards"
          ? copyCountByCardId.get(item.printing.cardId)
          : stack.copyIds.length) ?? 0)
      : 1;

    // Resolve which copy IDs this card represents for drag-and-drop
    const isFromSelection = mode === "select" && isItemSelected && selected.size > 0;
    const dragCopyIds = isFromSelection ? [...selected] : stacked ? effectiveCopyIds : [item.id];
    // Only stack drags get trimmed to 1 on default (non-shift) drop. Explicit
    // select-mode selections always move every selected copy.
    const isStackDrag = !isFromSelection && stacked && effectiveCopyIds.length > 1;

    // In browse mode, show the +/- add strip (matches add mode). Select mode
    // keeps the read-only count + collection-breakdown popover.
    const catalogSiblings = catalogPrintingsByCardId.get(item.printing.cardId);
    const ownedVariantIds = allPrintingIdsByCardId.get(item.printing.cardId);
    // In "cards" view the shown count aggregates across owned variants; a blind
    // minus would only touch the representative printing, so route ambiguous
    // removals through the variant popover to let the user pick.
    const hasAmbiguousRemoval = dataView === "cards" && (ownedVariantIds?.length ?? 0) > 1;
    const onUndoAdd =
      hasAmbiguousRemoval && handleOpenVariants ? handleOpenVariants : handleUndoAdd;
    const showAddStrip = mode === "browse" && handleQuickAdd;
    const aboveCard = showAddStrip ? (
      <CollectionAddStrip
        printing={item.printing}
        ownedCount={ownedCount}
        hasVariants={dataView === "cards" && (catalogSiblings?.length ?? 0) > 1}
        onQuickAdd={handleQuickAdd}
        onUndoAdd={onUndoAdd}
        onOpenVariants={handleOpenVariants}
      />
    ) : (
      <OwnedCountStrip
        count={ownedCount}
        printingId={item.printing.id}
        cardName={item.printing.card.name}
        shortCode={item.printing.shortCode}
        allPrintingIds={allPrintingIdsByCardId.get(item.printing.cardId)}
      />
    );

    return (
      <DraggableCard
        id={item.id}
        copyIds={dragCopyIds}
        isStackDrag={isStackDrag}
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
            onClick={(printing, event) => handleClick(printing, event)}
            showImages={showImages}
            view="printings"
            cardWidth={ctx.cardWidth}
            priority={ctx.priority}
            isSelected={ctx.isSelected}
            isFlashing={ctx.isFlashing}
            aboveCard={aboveCard}
          />
        </div>
      </DraggableCard>
    );
  };

  const renderAddModeCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const siblings = catalogPrintingsByCardId.get(cardId);

    const overrideId = topPrintingOverrides.get(cardId);
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    // Counts are scoped to the viewing collection so they match what browse
    // mode shows on the same card — switching modes shouldn't change the number.
    const hasMultipleVariants = dataView === "cards" && (siblings?.length ?? 0) > 1;
    const totalOwned = hasMultipleVariants
      ? siblings?.reduce(
          (sum, printing) =>
            sum +
            adjustedCount(printing.id, stackByPrintingId.get(printing.id)?.copyIds.length ?? 0),
          0,
        )
      : undefined;

    const ownedCount = adjustedCount(
      displayPrinting.id,
      stackByPrintingId.get(displayPrinting.id)?.copyIds.length ?? 0,
    );

    // When the card has owned copies spread across multiple printings, minus
    // would silently remove only the displayed variant — route through the
    // variant popover so the user picks which printing to remove from.
    const ownedVariantIds = allPrintingIdsByCardId.get(cardId);
    const hasAmbiguousRemoval = dataView === "cards" && (ownedVariantIds?.length ?? 0) > 1;
    const onUndoAdd =
      hasAmbiguousRemoval && handleOpenVariants ? handleOpenVariants : handleUndoAdd;

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
              onUndoAdd={onUndoAdd}
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
      valueCents={valueCents}
      unpricedCount={unpricedCount}
      formatValue={formatValue}
      addTarget={addTarget}
      addTargetLabel={isAddMode && !currentCollection ? inboxName : undefined}
      onQuickAdd={() => setQuickAddOpen(true)}
      onSelectAll={() => toggleSelectAll(stacks.flatMap((stack) => stack.copyIds))}
      onEnterSelect={enterSelectMode}
      onExitSelect={exitSelectMode}
      hasCards={stacks.length > 0}
      isAllSelected={selected.size === totalCopies}
      view={view}
      canEdit={Boolean(currentCollection)}
      canDelete={canDeleteCollection}
      onEdit={() => setEditOpen(true)}
      onDelete={() => setDeleteOpen(true)}
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
        <DesktopOptionsBar className="hidden sm:flex" showCopies={mode !== "add"} />
        {addTarget && (
          <Button
            variant={isAddMode ? "default" : "outline"}
            size="icon"
            onClick={isAddMode ? handleCloseBrowsing : startBrowsing}
            title={isAddMode ? "Stop adding" : "Browse catalog to add cards"}
            aria-label={isAddMode ? "Stop adding" : "Browse catalog to add cards"}
          >
            {isAddMode ? (
              <PackagePlusIcon className="size-4" />
            ) : (
              <PackageIcon className="size-4" />
            )}
          </Button>
        )}
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
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
            availableLanguages={availableLanguages}
            setDisplayLabel={setDisplayLabel}
          />
        </MobileOptionsDrawer>
      </div>
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
      />
    </>
  );

  // ── Panes ───────────────────────────────────────────────────────────
  const leftPane = (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          setDisplayLabel={setDisplayLabel}
        />
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
  // Checks the unfiltered stack count, so an empty collection shows this
  // prompt even when filters (including auto-seeded language prefs) are active.
  // Gated on `copiesReady` so the empty state doesn't flash while the first
  // copies fetch is still in flight.
  if (!isAddMode && copiesReady && stacks.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4">
        {topBarPortal}
        <PackageIcon className="size-16 opacity-50" />
        <p>No cards yet</p>
        <p className="text-center">
          Browse the card catalog and add cards to{" "}
          {currentCollection?.name
            ? `"${currentCollection.name}"`
            : inboxName
              ? `"${inboxName}"`
              : "your collection"}
          .
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
              <ZapIcon className="mr-1 size-3.5" />
              Quick add
            </Button>
            <Button onClick={startBrowsing}>
              <LibraryBigIcon className="mr-1 size-3.5" />
              Browse & add
            </Button>
          </div>
        )}
        <p className="text-center">
          Coming from another tool?{" "}
          <Link
            to="/collections/import"
            className="text-muted-foreground hover:text-foreground underline"
          >
            Import your cards
          </Link>
          .
        </p>
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
        {currentCollection && !currentCollection.isInbox && (
          <DeleteCollectionDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            collectionName={currentCollection.name}
            copyCount={currentCollection.copyCount}
            onConfirm={handleDeleteCollection}
            isPending={deleteCollection.isPending}
          />
        )}
        {currentCollection && (
          <EditCollectionDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            collectionId={currentCollection.id}
            currentName={currentCollection.name}
            currentAvailableForDeckbuilding={currentCollection.availableForDeckbuilding}
            isInbox={currentCollection.isInbox}
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

        {/* Floating action bar (add mode) */}
        {isAddMode && addedItems.size > 0 && (
          <div className="border-border bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 shadow-lg">
            <AddedPill count={totalAdded} active={showAddedList} size="desktop" />
            <Button onClick={handleCloseBrowsing}>Done</Button>
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

        {currentCollection && !currentCollection.isInbox && (
          <DeleteCollectionDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            collectionName={currentCollection.name}
            copyCount={currentCollection.copyCount}
            onConfirm={handleDeleteCollection}
            isPending={deleteCollection.isPending}
          />
        )}
        {currentCollection && (
          <EditCollectionDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            collectionId={currentCollection.id}
            currentName={currentCollection.name}
            currentAvailableForDeckbuilding={currentCollection.availableForDeckbuilding}
            isInbox={currentCollection.isInbox}
          />
        )}
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
              ownedCounts={Object.fromEntries(
                variantPrintings.map((p) => [
                  p.id,
                  adjustedCount(p.id, stackByPrintingId.get(p.id)?.copyIds.length ?? 0),
                ]),
              )}
              onQuickAdd={handleQuickAdd}
              onUndoAdd={handleUndoAdd}
            />
          </div>,
          document.body,
        )}

      {/* Dispose picker popover (All Cards view, multi-collection minus) */}
      {disposePicker &&
        createPortal(
          <div
            ref={disposePickerRef}
            className="fixed z-[100]"
            style={{ top: disposePicker.pos.top, left: disposePicker.pos.left }}
          >
            <DisposePickerPopover
              printing={disposePicker.printing}
              onPick={handleDisposeFromCollection}
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
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
  addTarget?: string;
  addTargetLabel?: string;
  onQuickAdd: () => void;
  onSelectAll: () => void;
  onEnterSelect: () => void;
  onExitSelect: () => void;
  hasCards: boolean;
  isAllSelected: boolean;
  view: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CollectionTopBar({
  title,
  onToggleSidebar,
  mode,
  valueCents,
  unpricedCount,
  formatValue,
  addTarget,
  addTargetLabel,
  onQuickAdd,
  onSelectAll,
  onEnterSelect,
  onExitSelect,
  hasCards,
  isAllSelected,
  view,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: CollectionTopBarProps) {
  return (
    <PageTopBar>
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

      {addTargetLabel && (
        <span className="text-muted-foreground shrink-0 text-xs">→ {addTargetLabel}</span>
      )}

      {/* Browse/select: card count + value */}
      {mode !== "add" && (
        <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
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
        {mode !== "add" && (
          <div className="flex items-center gap-2">
            {addTarget && hasCards && (
              <>
                <Button variant="ghost" size="icon" onClick={onQuickAdd} className="sm:hidden">
                  <ZapIcon className="size-4" />
                </Button>
                <Button variant="ghost" onClick={onQuickAdd} className="hidden sm:flex">
                  <ZapIcon className="size-4" />
                  Quick add
                </Button>
              </>
            )}
            {mode === "select" ? (
              <>
                <Button variant="ghost" size="icon" onClick={onSelectAll} className="sm:hidden">
                  <CheckIcon className="size-4" />
                </Button>
                <Button variant="ghost" onClick={onSelectAll} className="hidden sm:flex">
                  <CheckIcon className="size-4" />
                  {isAllSelected ? "Deselect all" : "Select all"}
                </Button>
                <Button variant="ghost" size="icon" onClick={onExitSelect} className="sm:hidden">
                  <XIcon className="size-4" />
                </Button>
                <Button variant="default" onClick={onExitSelect} className="hidden sm:flex">
                  Done
                </Button>
              </>
            ) : (
              hasCards && (
                <>
                  <Button variant="ghost" size="icon" onClick={onEnterSelect} className="sm:hidden">
                    <CheckSquareIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" onClick={onEnterSelect} className="hidden sm:flex">
                    <CheckSquareIcon className="size-4" />
                    Manage {view}
                  </Button>
                </>
              )
            )}
            {(canEdit || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                  <EllipsisVerticalIcon className="size-4" />
                  <span className="sr-only">Collection actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <PencilIcon className="size-4" />
                      Edit collection
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onDelete}
                    >
                      <Trash2Icon className="size-4" />
                      Delete collection
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </PageTopBarActions>
    </PageTopBar>
  );
}
