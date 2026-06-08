import type { Marketplace, Printing } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CheckIcon,
  CheckSquareIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  LibraryBigIcon,
  ListPlusIcon,
  PackageIcon,
  PencilIcon,
  Share2Icon,
  SquarePlusIcon,
  Trash2Icon,
  XIcon,
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
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CollectionTableActions } from "@/components/cards/collection-table-actions";
import { CollectionGridCell } from "@/components/collection/collection-grid-cell";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { buildOnDecrement } from "@/components/collection/route-decrement";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { AddToListDialog } from "@/components/list/add-to-list-dialog";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
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
import {
  useCollections,
  useCollectionsMap,
  useDeleteCollection,
  useSetCollectionDeckbuilding,
} from "@/hooks/use-collections";
import { useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-session";
import { collectionTableActionsColumn } from "@/lib/collection-table";
import { formatterForMarketplace } from "@/lib/format";
import { maxOwnedCount } from "@/lib/owned-bucket";
import { isStackSelected, resolveContextActionTarget } from "@/lib/stack-selection";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { CollectionContextAction } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDisplayStore } from "@/stores/display-store";
import { useDragPreviewStore } from "@/stores/drag-preview-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

import { computeDragSelectionSummary, dragSelectionNoun } from "./collection-drag";
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

function printingsArrayEqual(a: readonly Printing[], b: readonly Printing[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let idx = 0; idx < a.length; idx++) {
    if (a[idx] !== b[idx]) {
      return false;
    }
  }
  return true;
}

interface CollectionActionsCellProps {
  printing?: Printing;
  collectionId?: string;
  dataView: "cards" | "printings" | "copies";
  catalogPrintingsByCardId: Map<string, Printing[]>;
}

function CollectionActionsCell({
  printing,
  collectionId,
  dataView,
  catalogPrintingsByCardId,
}: CollectionActionsCellProps) {
  if (!printing) {
    return null;
  }
  return (
    <CollectionTableActions
      printing={printing}
      collectionId={collectionId}
      siblingIds={
        dataView === "cards"
          ? catalogPrintingsByCardId.get(printing.cardId)?.map((sibling) => sibling.id)
          : undefined
      }
    />
  );
}

interface CollectionRowWrapperProps {
  printing?: Printing;
  itemId?: string;
  children?: React.ReactNode;
  collectionId: string | undefined;
  stackByItemId: Map<string, StackedEntry>;
  allCopyIdsByCardId: Map<string, string[]>;
  mode: "browse" | "select";
  stacked: boolean;
  selected: Set<string>;
}

function CollectionRowWrapper({
  printing,
  itemId,
  children,
  collectionId,
  stackByItemId,
  allCopyIdsByCardId,
  mode,
  stacked,
  selected,
}: CollectionRowWrapperProps) {
  // Drag preview is shared from the parent's selection-driven store so all
  // rows agree on the same fanned set of cards during a select-mode drag.
  const dragPreviewPrintings = useDragPreviewStore((s) => s.preview);
  if (!printing || !itemId) {
    return children;
  }
  const stack = stackByItemId.get(itemId);
  if (!stack) {
    return children;
  }
  const cardCopyIds = allCopyIdsByCardId.get(printing.cardId);
  const effectiveCopyIds = cardCopyIds ?? stack.copyIds;
  const isItemSelected =
    mode === "select" && isStackSelected(stacked, itemId, effectiveCopyIds, selected);
  const isFromSelection = mode === "select" && isItemSelected && selected.size > 0;
  const copyIds = isFromSelection ? [...selected] : stacked ? effectiveCopyIds : [itemId];
  const isStackDrag = !isFromSelection && stacked && effectiveCopyIds.length > 1;
  const previewPrintings = dragPreviewPrintings.length > 0 ? dragPreviewPrintings : [printing];
  return (
    <DraggableCard
      id={itemId}
      copyIds={copyIds}
      fromSelection={isFromSelection}
      isStackDrag={isStackDrag}
      printing={printing}
      previewPrintings={previewPrintings}
      sourceCollectionId={collectionId}
    >
      {children}
    </DraggableCard>
  );
}

interface CollectionGridProps {
  collectionId?: string;
  title: string;
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
  // `showLibrary` widens the grid from "cards in this collection" to "every
  // card in the catalog", with unowned cards rendered as a + affordance only.
  // Per-session local state so a fresh page load always starts in the
  // collection-only view; the toggle never persists.
  const [selectMode, setSelectMode] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const mode = selectMode ? "select" : "browse";

  // ── Filter state (active in all modes) ──────────────────────────────
  const { filters, sortBy, sortDir, view, groupBy, groupDir, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const { allPrintings, sets, printingsByCardId: catalogAllPrintingsByCardId } = useCards();
  const channels = useChannelRegistry();
  const prices = display.prices;
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // On first mount, seed the URL `languages` filter from the user's preferred
  // languages if none are set — same behaviour as the /cards catalog. Owned
  // cards in non-preferred languages are hidden until the user clears the
  // (visible, clearable) Language filter; users who want to see every language
  // clear the Language section in the filter panel. After seeding,
  // `filters.languages` is the single source of truth (empty = show all).
  useSeedLanguagesFromPrefs(filters.languages);
  const languageFilter = filters.languages;

  // Quick Add palette adds *new* cards, so it should only surface languages
  // the user has enabled in their profile prefs — unlike the collection grid
  // above, where we deliberately keep showing already-owned cards in any
  // language. Empty pref means "show all".
  const preferredLanguages = useDisplayStore((state) => state.languages);

  // "copies" is a collection-only UI concept — at the data level it behaves like "printings"
  const dataView = view === "copies" ? "printings" : view;
  const keywordReverseMap = useKeywordReverseMap();

  // An owned filter is "active" when either the buckets dropdown or the
  // copies-owned range is set — used to gate the global owned-count map into
  // the catalog/library hook (see its memo note below).
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;

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
    ownedCountMax: collectionOwnedCountMax,
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
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
  });

  // ── Catalog data (drives "show library" view + the quick-add palette in
  //    every mode). The bucket filter uses global counts here because
  //    "Full Playset" against the full library is a global notion. The
  //    collection hook applies the per-collection version separately.
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
    // Intentionally not threading groupBy: the cell renderer assumes one cell
    // per cardId for sibling/variant logic. Skipping the dedup here would
    // require a parallel pass over those branches; the /cards catalog browser
    // is the only consumer wired up so far.
    //
    // `ownedCountByPrinting` is only consumed by the owned filters (buckets +
    // copies range) — passing the map unconditionally would bust this hook's
    // memo on every +/- (the map is a fresh projection of the global copies set
    // on every copy mutation), which in turn rebuilds `printingsByCardId` /
    // `priceRangeByCardId` and forces every visible cell to re-render. Same
    // guard /cards uses.
    ownedCountByPrinting: ownedFilterActive ? ownedCountByPrinting : undefined,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    favoriteMarketplace,
    prices,
    keywordReverseMap,
    channels,
  });

  // ── Pick active data set based on whether the library is shown ──────
  const availableFilters = showLibrary ? catalogAvailableFilters : collectionAvailableFilters;
  const availableLanguages = showLibrary ? catalogAvailableLanguages : collectionAvailableLanguages;
  const sortedCards = showLibrary ? catalogSortedCards : collectionSortedCards;
  const printingsByCardId = showLibrary ? catalogPrintingsByCardId : collectionPrintingsByCardId;
  const totalUniqueCards = showLibrary ? catalogTotalUniqueCards : collectionTotalUniqueCards;
  const setDisplayLabel = showLibrary ? catalogSetDisplayLabel : collectionSetDisplayLabel;
  // Copies slider bound. In the library view the bound is global (most copies
  // owned of any card across all collections); in browse/select it's the
  // per-collection max the collection hook already computed.
  const ownedCountBound = showLibrary
    ? maxOwnedCount(
        allPrintings,
        ownedCountByPrinting ?? {},
        dataView === "printings" ? "printing" : "card",
      )
    : collectionOwnedCountMax;

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

  // "copies" view expands individual copies. When the library is shown the
  // toolbar hides the "copies" option, but if the user had it selected from
  // a previous visit we treat the grid as stacked anyway — unowned cards
  // have no copies to expand.
  const stacked = showLibrary || view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  // Copy IDs the Move / Add-to-list / Dispose dialogs operate on. The floating
  // action bar sets this to the whole selection; the right-click menu sets it
  // to the selection or to just the clicked card. Decoupled from `selected` so
  // a browse-mode right-click can act on one card without entering select mode.
  const [actionCopyIds, setActionCopyIds] = useState<string[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const deleteCollection = useDeleteCollection();
  const setDeckbuilding = useSetCollectionDeckbuilding();
  const navigate = useNavigate();

  // ── Navigation helpers ──────────────────────────────────────────────
  const inbox = collections.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  const inboxName = inbox?.name;
  const currentCollection = collectionId ? collectionsMap.get(collectionId) : undefined;
  const addTarget = collectionId ?? inboxId;

  // ── Variant-popover state (used by the count-pill, locations popover, and
  //    keyboard +/- on table rows) ─────────────────────────────────────
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const disposePicker = useAddModeStore((s) => s.disposePicker);
  const closeDisposePicker = useAddModeStore((s) => s.closeDisposePicker);
  const selectedCardId = useSelectionStore((s) => s.selectedCard?.id);
  const {
    handleQuickAdd,
    handleUndoAdd,
    tryUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
  } = useQuickAddActions(addTarget, collectionId);
  const [variantDisposeTarget, setVariantDisposeTarget] = useState<Printing | null>(null);
  // Clear the in-popover dispose page whenever the variants popover closes or
  // switches to a different card — otherwise the next time it opens, it would
  // still be showing the stale "Remove from" sub-page.
  useEffect(() => {
    setVariantDisposeTarget(null);
  }, [variantPopover?.cardId]);

  const toggleShowLibrary = () => {
    setShowLibrary((prev) => {
      const next = !prev;
      if (next && selectMode) {
        setSelectMode(false);
        clearSelection();
      }
      if (!next) {
        globalThis.scrollTo(0, 0);
      }
      return next;
    });
  };

  const enterSelectMode = () => setSelectMode(true);
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  // Switching collections drops any in-progress selection — a selected
  // copy from the previous collection wouldn't be visible in the new grid,
  // and the floating action bar would operate on invisible rows. The
  // library toggle is per-session by design, so it resets too. Sibling
  // overrides also reset because pinned variants are scoped to this view.
  useEffect(() => {
    setSelectMode(false);
    setShowLibrary(false);
    useSiblingOverrideStore.getState().clearScope("collection");
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
  // All three bulk actions operate on `actionCopyIds` (set when the dialog is
  // opened), not on `selected` directly — a browse-mode right-click targets a
  // single card without a visible selection. clearSelection() on success is a
  // no-op in that case and clears the selection in the select-mode paths.
  const handleMove = (toCollectionId: string) => {
    const count = actionCopyIds.length;
    moveCopies.mutate(
      { copyIds: actionCopyIds, toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${count} card${count > 1 ? "s" : ""}`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleDispose = () => {
    const count = actionCopyIds.length;
    disposeCopies.mutate(
      { copyIds: actionCopyIds },
      {
        onSuccess: () => {
          toast.success(`Removed ${count} card${count > 1 ? "s" : ""}`);
          clearSelection();
          setDisposeOpen(false);
        },
      },
    );
  };

  // Snapshot the action target, then open the matching dialog.
  const openAction = (action: CollectionContextAction, copyIds: string[]) => {
    setActionCopyIds(copyIds);
    if (action === "move") {
      setMoveOpen(true);
    } else if (action === "addToList") {
      setAddToListOpen(true);
    } else {
      setDisposeOpen(true);
    }
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

  // Shared collections live in a friend group; rename/delete/share is gated on
  // group owner/admin (or always allowed for personal collections, where viewerCanAdmin
  // is true). The inbox is special-cased — it can never be deleted.
  const canAdminCollection = Boolean(currentCollection?.viewerCanAdmin);
  const canDeleteCollection = Boolean(
    currentCollection && !currentCollection.isInbox && canAdminCollection,
  );

  // ── Build items list ────────────────────────────────────────────────
  let items: CardViewerItem[];
  const stackByItemId = new Map<string, StackedEntry>();

  if (showLibrary) {
    // Library view: every catalog row gets a cell. Owned printings still
    // resolve to their stack so +/-/select/drag keep working on them; unowned
    // printings have no stack and the renderer drops the strip + overlays.
    items = deferredSortedCards.map((printing) => {
      const stack = stackByPrintingId.get(printing.id);
      if (stack) {
        stackByItemId.set(printing.id, stack);
      }
      return { id: printing.id, printing };
    });
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

  // Drag-overlay summary: walk items + selection for the first three unique
  // printings whose copies are selected (the fan) plus the selected-tile count
  // (the overlay label, e.g. "3 printings"). Fed into useDragPreviewStore here
  // so cells can subscribe to the fan with a stable ref — a +/- click leaves
  // `selected` untouched, so the same printing refs come back from the walk
  // and we skip the store update via the shallow compare below. Without that
  // compare, cells would re-render on every +/- since the store would publish
  // a fresh array reference every render.
  const dragSummary = computeDragSelectionSummary({
    mode,
    selected,
    items,
    stackByItemId,
    stacked,
  });
  const dragNoun = dragSelectionNoun(view);
  useEffect(() => {
    const state = useDragPreviewStore.getState();
    if (
      !printingsArrayEqual(dragSummary.printings, state.preview) ||
      dragSummary.count !== state.selectionCount ||
      dragNoun !== state.selectionNoun
    ) {
      state.setPreview(dragSummary.printings, dragSummary.count, dragNoun);
    }
  });

  const handleGridCardClick = (printing: Printing) => {
    useAddModeStore.getState().closeVariants();
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    useSiblingOverrideStore.getState().setOverride("collection", printing.cardId, printing.id);
  };

  const toggleStackForItem = (itemId: string, stack: StackedEntry) => {
    if (stacked) {
      const cardCopyIds = allCopyIdsByCardId.get(stack.printing.cardId) ?? stack.copyIds;
      toggleStack(cardCopyIds);
    } else {
      toggleSelect(itemId);
    }
  };

  const shiftSelectRange = (itemId: string) => {
    const lastId = getLastSelectedItemId();
    if (lastId === null) {
      const stack = stackByItemId.get(itemId);
      if (stack) {
        toggleStackForItem(itemId, stack);
        setLastSelectedItemId(itemId);
      }
      return;
    }
    const startIdx = items.findIndex((i) => i.id === lastId);
    const endIdx = items.findIndex((i) => i.id === itemId);
    if (startIdx === -1 || endIdx === -1) {
      const stack = stackByItemId.get(itemId);
      if (stack) {
        toggleStackForItem(itemId, stack);
        setLastSelectedItemId(itemId);
      }
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
    setLastSelectedItemId(itemId);
  };

  // Right-click menu action on a card. See resolveContextActionTarget for the
  // browse-vs-select rules; here we apply any selection narrowing and open the
  // matching dialog on the resolved copy ids.
  const handleContextAction = (itemId: string, action: CollectionContextAction) => {
    const stack = stackByItemId.get(itemId);
    if (!stack) {
      return;
    }
    const cardCopyIds = stacked
      ? (allCopyIdsByCardId.get(stack.printing.cardId) ?? stack.copyIds)
      : [itemId];
    const { copyIds, narrowSelectionTo } = resolveContextActionTarget({
      mode,
      stacked,
      itemId,
      cardCopyIds,
      selected,
    });
    if (narrowSelectionTo) {
      clearSelection();
      addToSelection(narrowSelectionTo);
      setLastSelectedItemId(itemId);
    }
    openAction(action, copyIds);
  };

  // Register table-row action handlers in the no-subscribe store so the
  // virtualized CardTable + per-cell CollectionGridCell can dispatch row
  // clicks / +/- / select-mode actions without taking these unstable closures
  // as props. Mirrors card-browser.tsx's wiring; see card-row-actions-store.ts
  // for the why. Re-register every render so rows pick up the freshest
  // implementation.
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
      onItemClick: (itemId, printing, modifiers) => {
        const stack = stackByItemId.get(itemId);
        // Browse mode: ctrl-click on an owned card flips into select mode and
        // toggles. Plain click opens the detail pane.
        if (mode === "browse") {
          if (modifiers.ctrl && stack) {
            setSelectMode(true);
            toggleStackForItem(itemId, stack);
            setLastSelectedItemId(itemId);
            return;
          }
          handleGridCardClick(printing);
          return;
        }
        // Select mode: shift-click extends the range, regular click toggles.
        if (!stack) {
          return;
        }
        if (modifiers.shift) {
          shiftSelectRange(itemId);
        } else {
          toggleStackForItem(itemId, stack);
          setLastSelectedItemId(itemId);
        }
      },
      onItemToggle: (itemId) => {
        const stack = stackByItemId.get(itemId);
        if (!stack) {
          return;
        }
        toggleStackForItem(itemId, stack);
        setLastSelectedItemId(itemId);
      },
      onContextAction: handleContextAction,
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

  // ── Render card ─────────────────────────────────────────────────────
  // Thin wrapper around CollectionGridCell. The cell takes only stable
  // item-level props and self-subscribes to override / count / selection /
  // copy IDs so this closure doesn't bust the per-row memo when stacks change
  // on +/-.
  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <CollectionGridCell
      printing={item.printing}
      itemId={item.id}
      cardWidth={ctx.cardWidth}
      priority={ctx.priority}
      dataView={dataView}
      mode={mode}
      showLibrary={showLibrary}
      stacked={stacked}
      siblings={
        dataView === "cards" ? catalogPrintingsByCardId.get(item.printing.cardId) : undefined
      }
      collectionId={collectionId}
      display={display}
      showImages={showImages}
      priceRange={catalogPriceRangeByCardId?.get(item.printing.cardId)}
    />
  );

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
      onQuickAdd={() => setQuickAddOpen(true)}
      onSelectAll={() => toggleSelectAll(stacks.flatMap((stack) => stack.copyIds))}
      onEnterSelect={enterSelectMode}
      onExitSelect={exitSelectMode}
      hasCards={stacks.length > 0}
      isAllSelected={selected.size === totalCopies}
      view={view}
      canEdit={Boolean(currentCollection) && canAdminCollection}
      canDelete={canDeleteCollection}
      canShare={Boolean(currentCollection) && canAdminCollection}
      // Per-viewer preference: every member with access can toggle whether a
      // collection feeds *their own* deck inventory, not just group admins.
      canToggleDeckbuilding={Boolean(currentCollection)}
      deckbuildingAvailable={currentCollection?.availableForDeckbuilding ?? false}
      onEdit={() => setEditOpen(true)}
      onDelete={() => setDeleteOpen(true)}
      onShare={() => setShareOpen(true)}
      onToggleDeckbuilding={() => {
        if (currentCollection) {
          setDeckbuilding.mutate({
            id: currentCollection.id,
            available: !currentCollection.availableForDeckbuilding,
          });
        }
      }}
    />
  );

  const topBarPortal = topBarSlot && createPortal(collectionTopBar, topBarSlot);

  const showLibraryButton = addTarget ? (
    <Button
      variant={showLibrary ? "default" : "outline"}
      size="icon"
      onClick={toggleShowLibrary}
      title={showLibrary ? "Hide library" : "Show whole library"}
      aria-label={showLibrary ? "Hide library" : "Show whole library"}
      aria-pressed={showLibrary}
    >
      <LibraryBigIcon className="size-4" />
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
      extras={showLibraryButton}
      showCopies={!showLibrary}
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

  // Mounted once at a stable position so React preserves these instances
  // across the empty↔populated transition. Otherwise an open QuickAddPalette
  // would reset its internal state (input, expanded card) on the first add
  // when the empty-state subtree unmounts.
  const collectionOverlays = (
    <>
      {addTarget && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={addTarget}
          collectionName={currentCollection?.name ?? "Collection"}
          printingsByCardId={catalogAllPrintingsByCardId}
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
    </>
  );

  // ── Empty state ─────────────────────────────────────────────────────
  // Checks the unfiltered stack count, so an empty collection shows this
  // prompt even when filters (including auto-seeded language prefs) are active.
  // Gated on `copiesReady` so the empty state doesn't flash while the first
  // copies fetch is still in flight.
  if (!showLibrary && copiesReady && stacks.length === 0) {
    return (
      <>
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
                    <SquarePlusIcon className="mr-1 size-3.5" />
                    Quick add
                  </Button>
                  <Button onClick={toggleShowLibrary}>
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
        </Empty>
        {collectionOverlays}
      </>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────
  return (
    <>
      <CardBrowserFilterProvider
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={COLLECTION_GRID_HIDDEN_FILTER_SECTIONS}
        ownedCountMax={ownedCountBound}
      >
        {topBarPortal}
        <BrowserCardViewer
          items={items}
          totalItems={showLibrary ? allPrintings.length : totalCopies}
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
            // Copies view (`!stacked`) is one row per physical copy, so the
            // per-printing count + add controls don't apply — drop the column
            // entirely (mirrors the dropped grid strip). Otherwise browse shows
            // the +/- buttons; select mode shows a read-only count.
            actionsColumn: collectionTableActionsColumn({
              stacked,
              mode,
              hasQuickAdd: Boolean(handleQuickAdd),
            }),
            // The catalog map carries every sibling variant (owned or not).
            // In cards view the table sums across siblings so the count
            // matches the grid's per-card aggregate.
            actionsCell: (
              <CollectionActionsCell
                collectionId={collectionId}
                dataView={dataView}
                catalogPrintingsByCardId={catalogPrintingsByCardId}
              />
            ),
            rowWrapper: (
              <CollectionRowWrapper
                collectionId={collectionId}
                stackByItemId={stackByItemId}
                allCopyIdsByCardId={allCopyIdsByCardId}
                mode={mode}
                stacked={stacked}
                selected={selected}
              />
            ),
          }}
        >
          {/* Floating action bar (select mode) */}
          {mode === "select" && selected.size > 0 && (
            <FloatingActionBar
              selectedCount={selected.size}
              actions={[
                {
                  label: "Move",
                  icon: <BookOpenIcon />,
                  onClick: () => openAction("move", [...selected]),
                  disabled: moveCopies.isPending,
                },
                {
                  label: "Add to list",
                  icon: <ListPlusIcon />,
                  onClick: () => openAction("addToList", [...selected]),
                },
                {
                  label: "Dispose",
                  icon: <Trash2Icon />,
                  variant: "destructive",
                  onClick: () => openAction("dispose", [...selected]),
                  disabled: disposeCopies.isPending,
                },
              ]}
              onClear={clearSelection}
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
            count={actionCopyIds.length}
            onConfirm={handleDispose}
            isPending={disposeCopies.isPending}
          />

          <AddToListDialog
            open={addToListOpen}
            onOpenChange={setAddToListOpen}
            copyIds={actionCopyIds}
            onAdded={clearSelection}
          />
        </BrowserCardViewer>

        {/* Variant add popover (add mode only) */}
        {variantPopover && variantPrintings && handleQuickAdd && handleUndoAdd && tryUndoAdd && (
          <Popover
            open
            onOpenChange={(open, details) => {
              if (open) {
                return;
              }
              // ESC inside the dispose sub-page goes back to the variants list,
              // mirroring how cmdk "pages" work. The popover stays mounted
              // because `open` is hard-coded true; clearing variantDisposeTarget
              // swaps the content back.
              if (details.reason === "escape-key" && variantDisposeTarget) {
                setVariantDisposeTarget(null);
                return;
              }
              setVariantDisposeTarget(null);
              closeVariants(details.reason === "outside-press" ? details.event.target : undefined);
            }}
          >
            <PopoverContent
              anchor={variantPopover.anchor}
              side="bottom"
              align="center"
              className="max-h-72 w-max max-w-[min(90vw,24rem)] min-w-56 gap-0 overflow-y-auto p-0"
            >
              <VariantAddPopover
                printings={variantPrintings}
                ownedCounts={Object.fromEntries(
                  variantPrintings.map((p) => [
                    p.id,
                    stackByPrintingId.get(p.id)?.copyIds.length ?? 0,
                  ]),
                )}
                onQuickAdd={handleQuickAdd}
                onUndoAdd={async (printing) => {
                  const result = await tryUndoAdd(printing);
                  if (result === "ambiguous") {
                    setVariantDisposeTarget(printing);
                  }
                }}
                initialHighlightId={selectedCardId}
                intent={variantPopover.intent}
                disposeTarget={variantDisposeTarget}
                onDisposePick={async (printing, fromCollectionId) => {
                  await handleDisposeFromCollection(printing, fromCollectionId);
                  setVariantDisposeTarget(null);
                }}
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
              anchor={disposePicker.anchor}
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
      </CardBrowserFilterProvider>
      {collectionOverlays}
    </>
  );
}

interface CollectionTopBarProps {
  title: string;
  onToggleSidebar: () => void;
  mode: "browse" | "select";
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
  addTarget?: string;
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
  canToggleDeckbuilding: boolean;
  deckbuildingAvailable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onToggleDeckbuilding: () => void;
}

function CollectionTopBar({
  title,
  onToggleSidebar,
  mode,
  valueCents,
  unpricedCount,
  formatValue,
  addTarget,
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
  canToggleDeckbuilding,
  deckbuildingAvailable,
  onEdit,
  onDelete,
  onShare,
  onToggleDeckbuilding,
}: CollectionTopBarProps) {
  return (
    <PageTopBar>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <PageTopBarTitle onToggleSidebar={onToggleSidebar}>{title}</PageTopBarTitle>

        {valueCents !== null && valueCents !== undefined && (
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {formatValue(valueCents / 100)}
            {unpricedCount ? (
              <span className="text-muted-foreground/60 ml-1">({unpricedCount} unpriced)</span>
            ) : null}
          </span>
        )}
      </div>

      <PageTopBarActions>
        <div className="flex items-center gap-2">
          {addTarget && hasCards && (
            <>
              <Button variant="ghost" size="icon" onClick={onQuickAdd} className="sm:hidden">
                <SquarePlusIcon className="size-4" />
              </Button>
              <Button variant="ghost" onClick={onQuickAdd} className="hidden sm:flex">
                <SquarePlusIcon className="size-4" />
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
          {(canEdit || canDelete || canShare || canToggleDeckbuilding) && (
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
                {canToggleDeckbuilding && (
                  <DropdownMenuItem onClick={onToggleDeckbuilding}>
                    <LayersIcon className="size-4" />
                    {deckbuildingAvailable
                      ? "Exclude from my deck building"
                      : "Include in my deck building"}
                  </DropdownMenuItem>
                )}
                {canShare && (
                  <DropdownMenuItem onClick={onShare}>
                    <Share2Icon className="size-4" />
                    Share
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
