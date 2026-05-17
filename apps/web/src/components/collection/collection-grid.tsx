import type { Marketplace, Printing } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CheckSquareIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LibraryBigIcon,
  PackageIcon,
  PackagePlusIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { use, useEffect, useDeferredValue, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserActiveFilters,
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { buildOnDecrement } from "@/components/collection/route-decrement";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { AddToTradeListDialog } from "@/components/trade-list/add-to-trade-list-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollectionCardData } from "@/hooks/use-collection-card-data";
import { useCollections, useCollectionsMap, useDeleteCollection } from "@/hooks/use-collections";
import { useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-session";
import { formatterForMarketplace } from "@/lib/format";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { CollectionShareDialog } from "./collection-share-dialog";
import { DeleteCollectionDialog } from "./delete-collection-dialog";
import { DisposeDialog } from "./dispose-dialog";
import { DisposePickerPopover } from "./dispose-picker-popover";
import { DraggableCard } from "./draggable-card";
import { EditCollectionDialog } from "./edit-collection-dialog";
import { MoveDialog } from "./move-dialog";
import { QuickAddPalette } from "./quick-add-palette";

const COLLECTION_GRID_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "markers",
  "channels",
  // Custom tags are a deck-builder concept (format constraints, freeform
  // self-narrowing). Hiding them here keeps the collection grid focused on
  // physical attributes you actually own copies of.
  "customTags",
]);

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
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const favoriteMarketplace = display.favoriteMarketplace;

  // ── Mode state ──────────────────────────────────────────────────────
  // Shared with /cards via display-store, so the catalog mode persists across
  // pages. On /collections we only use the "off" ↔ "add" transition; "count"
  // (set on /cards) is treated as "not adding" here since the owned-only grid
  // already shows counts in browse mode.
  const catalogMode = useDisplayStore((state) => state.catalogMode);
  const [selectMode, setSelectMode] = useState(false);
  const mode = catalogMode === "add" ? "add" : selectMode ? "select" : "browse";

  // ── Filter state (active in all modes) ──────────────────────────────
  const { filters, sortBy, sortDir, view, groupBy, groupDir, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const { allPrintings, sets } = useCards();
  const channels = useChannelRegistry();
  const prices = display.prices;
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Collection shows everything the user owns. Language preference is not
  // auto-applied as a filter (unlike the /cards catalog) — otherwise owned
  // non-preferred-language cards would vanish silently. Users who want to
  // narrow by language use the Language section in the filter panel.
  const languageFilter = filters.languages;

  // Quick Add palette adds *new* cards, so it should only surface languages
  // the user has enabled in their profile prefs — unlike the collection grid
  // above, where we deliberately keep showing already-owned cards in any
  // language. Empty pref means "show all".
  const preferredLanguages = useDisplayStore((state) => state.languages);

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
    channels,
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
    // Intentionally not threading groupBy: collection's add-mode renderer
    // assumes one cell per cardId for sibling/variant logic. Skipping the
    // dedup here would require a parallel pass over those branches; the
    // /cards catalog browser is the only consumer wired up so far.
    ownedCountByPrinting,
    favoriteMarketplace,
    prices,
    keywordReverseMap,
    channels,
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
  const [tradeOpen, setTradeOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const tradeListsEnabled = useFeatureEnabled("trade-lists");
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
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const disposePicker = useAddModeStore((s) => s.disposePicker);
  const closeDisposePicker = useAddModeStore((s) => s.closeDisposePicker);
  const selectedCardId = useSelectionStore((s) => s.selectedCard?.id);
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

  const toggleAddMode = () => {
    if (!isAddMode && selectMode) {
      setSelectMode(false);
      clearSelection();
    }
    if (isAddMode) {
      setTopPrintingOverrides(new Map());
      globalThis.scrollTo(0, 0);
    }
    useDisplayStore.getState().toggleCatalogModeAdd();
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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

  // ── Grid click handlers ─────────────────────────────────────────────
  const findBy = dataView === "cards" ? "card" : ("printing" as const);

  const handleGridCardClick = (printing: Printing) => {
    useAddModeStore.getState().closeVariants();
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    setTopPrintingOverrides((prev) => new Map(prev).set(printing.cardId, printing.id));
  };

  // Register table-row action handlers in the no-subscribe store so the
  // virtualized CardTable can dispatch row clicks and +/- without taking
  // these unstable closures as props. Mirrors card-browser.tsx's wiring; see
  // card-row-actions-store.ts for the why. Re-register every render so rows
  // pick up the freshest implementation.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleGridCardClick,
      onSiblingClick: handleSiblingClick,
      onIncrement: handleQuickAdd,
      onDecrement: buildOnDecrement({
        dataView,
        ownedPrintingIdsByCardId: allPrintingIdsByCardId,
        handleOpenVariants,
        handleUndoAdd,
      }),
      onOpenVariants: handleOpenVariants,
    });
    return () => {
      useCardRowActionsStore.getState().setHandlers({});
    };
  });

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

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
    // Wider scope for the "(M)" hint next to the in-collection count: per-printing
    // globally in printings view; sum across catalog siblings (any owned variant
    // in any collection) in cards view.
    let totalCount: number | undefined;
    if (ownedCountByPrinting) {
      if (dataView === "cards") {
        let sum = 0;
        for (const sibling of catalogSiblings ?? []) {
          sum += ownedCountByPrinting[sibling.id] ?? 0;
        }
        totalCount = sum;
      } else {
        totalCount = ownedCountByPrinting[item.printing.id] ?? 0;
      }
    }
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
        siblings={dataView === "cards" ? printingsByCardId.get(item.printing.cardId) : undefined}
        totalCount={totalCount}
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
            view={dataView}
            siblings={
              dataView === "cards" ? printingsByCardId.get(item.printing.cardId) : undefined
            }
            cardWidth={ctx.cardWidth}
            priority={ctx.priority}
            display={display}
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
        display={display}
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
      canShare={Boolean(currentCollection)}
      onEdit={() => setEditOpen(true)}
      onDelete={() => setDeleteOpen(true)}
      onShare={() => setShareOpen(true)}
    />
  );

  const topBarPortal = topBarSlot && createPortal(collectionTopBar, topBarSlot);

  const addModeButton = addTarget ? (
    <Button
      variant={isAddMode ? "default" : "outline"}
      size="icon"
      onClick={toggleAddMode}
      title={isAddMode ? "Stop adding" : "Browse catalog to add cards"}
      aria-label={isAddMode ? "Stop adding" : "Browse catalog to add cards"}
    >
      {isAddMode ? <PackagePlusIcon className="size-4" /> : <PackageIcon className="size-4" />}
    </Button>
  ) : null;

  const toolbar = (
    <BrowserToolbar
      totalCards={view === "copies" ? totalCopies : totalUniqueCards}
      filteredCount={
        view === "copies"
          ? sortedCards.reduce(
              (sum, card) => sum + (stackByPrintingId.get(card.id)?.copyIds.length ?? 0),
              0,
            )
          : sortedCards.length
      }
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${sortedCards.length} ${dataView === "cards" ? "cards" : "printings"}`
          : undefined
      }
      extras={addModeButton}
      showCopies={mode !== "add"}
    />
  );

  // ── Panes ───────────────────────────────────────────────────────────
  const leftPane = <BrowserLeftPane />;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
    />
  );

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
      <Empty className="flex-1">
        {topBarPortal}
        <EmptyHeader>
          <EmptyMedia>
            <PackageIcon className="size-16 opacity-50" />
          </EmptyMedia>
          <EmptyTitle>No cards yet</EmptyTitle>
          <EmptyDescription>
            Browse the card catalog and add cards to{" "}
            {currentCollection?.name
              ? `"${currentCollection.name}"`
              : inboxName
                ? `"${inboxName}"`
                : "your collection"}
            .{" "}
            <Link to="/help/$slug" params={{ slug: "cards-printings-copies" }}>
              Learn about cards, printings &amp; copies
            </Link>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            {addTarget && (
              <>
                <Button variant="outline" onClick={() => setQuickAddOpen(true)}>
                  <ZapIcon className="mr-1 size-3.5" />
                  Quick add
                </Button>
                <Button onClick={toggleAddMode}>
                  <LibraryBigIcon className="mr-1 size-3.5" />
                  Browse & add
                </Button>
              </>
            )}
            <Link to="/collections/import" className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon className="mr-1 size-3.5" />
              Import from another tool
            </Link>
          </div>
        </EmptyContent>
        {addTarget && (
          <QuickAddPalette
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            collectionId={addTarget}
            collectionName={currentCollection?.name ?? "Collection"}
            printingsByCardId={catalogPrintingsByCardId}
            ownedCountByPrinting={ownedCountByPrinting}
            preferredLanguages={preferredLanguages}
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
        {currentCollection && (
          <CollectionShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            collectionId={currentCollection.id}
            isPublic={currentCollection.isPublic}
            shareToken={currentCollection.shareToken}
          />
        )}
      </Empty>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={COLLECTION_GRID_HIDDEN_FILTER_SECTIONS}
    >
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
        stale={isGridStale}
        toolbar={toolbar}
        leftPane={leftPane}
        aboveGrid={<BrowserActiveFilters />}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          showOwned: true,
          showAddControls: mode !== "select" && Boolean(handleQuickAdd),
          view: dataView,
          // The catalog map carries every sibling variant (owned or not). On a
          // collection page in cards view the table sums across siblings so the
          // "owned" column matches the grid's per-card aggregate.
          printingsByCardId: catalogPrintingsByCardId,
          // Scope owned counts to this collection; the global total appears as
          // `(M)` next to the in-collection count when the two differ.
          collectionId,
          // showAddControls is also true in browse mode here (the +/- buttons
          // stay visible); pass mode explicitly so the count derivation can
          // distinguish "show variant aggregate" (add mode) from "show global
          // across collections" (browse/select).
          inAddMode: isAddMode,
        }}
      >
        {/* Floating action bar (select mode) */}
        {mode === "select" && selected.size > 0 && (
          <FloatingActionBar
            selectedCount={selected.size}
            onMove={() => setMoveOpen(true)}
            onDispose={() => setDisposeOpen(true)}
            onTrade={tradeListsEnabled ? () => setTradeOpen(true) : undefined}
            onClear={clearSelection}
            isMovePending={moveCopies.isPending}
            isDisposePending={disposeCopies.isPending}
          />
        )}

        {isMobile && (
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

        {tradeListsEnabled && (
          <AddToTradeListDialog
            open={tradeOpen}
            onOpenChange={setTradeOpen}
            copyIds={[...selected]}
            onAdded={clearSelection}
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
        {currentCollection && (
          <CollectionShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            collectionId={currentCollection.id}
            isPublic={currentCollection.isPublic}
            shareToken={currentCollection.shareToken}
          />
        )}
      </BrowserCardViewer>

      {/* Variant add popover (add mode only) */}
      {variantPopover && variantPrintings && handleQuickAdd && handleUndoAdd && (
        <Popover
          open
          onOpenChange={(open, details) => {
            if (!open) {
              closeVariants(details.reason === "outside-press" ? details.event.target : undefined);
            }
          }}
        >
          <PopoverContent
            anchor={variantPopover.anchorEl}
            side="bottom"
            align="center"
            className="max-h-72 w-max max-w-[min(90vw,24rem)] min-w-56 gap-0 overflow-y-auto p-0"
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
              initialHighlightId={selectedCardId}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Dispose picker popover (All Cards view, multi-collection minus) */}
      {disposePicker && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) {
              closeDisposePicker();
            }
          }}
        >
          <PopoverContent
            anchor={disposePicker.anchorEl}
            side="bottom"
            align="center"
            className="w-max max-w-[min(90vw,24rem)] min-w-56 gap-0 p-0"
          >
            <DisposePickerPopover
              printing={disposePicker.printing}
              onPick={handleDisposeFromCollection}
            />
          </PopoverContent>
        </Popover>
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
          preferredLanguages={preferredLanguages}
        />
      )}
    </CardBrowserFilterProvider>
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
  canShare: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
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
  canShare,
  onEdit,
  onDelete,
  onShare,
}: CollectionTopBarProps) {
  return (
    <PageTopBar>
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

      {addTargetLabel && (
        <span className="text-muted-foreground shrink-0 text-xs">→ {addTargetLabel}</span>
      )}

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

      <PageTopBarActions>
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
            mode !== "add" &&
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
          {(canEdit || canDelete || canShare) && (
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
                {canShare && (
                  <DropdownMenuItem onClick={onShare}>
                    <Share2Icon className="size-4" />
                    Share collection
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
      </PageTopBarActions>
    </PageTopBar>
  );
}
