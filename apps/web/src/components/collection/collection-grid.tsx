import type { Marketplace, Printing } from "@openrift/shared";
import { copyHasMetadata, legendDisplayName } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CameraIcon,
  DownloadIcon,
  HeartIcon,
  LibraryBigIcon,
  ListPlusIcon,
  PackageIcon,
  SquarePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { PrintingCountActions } from "@/components/cards/printing-count-actions";
import { CollectionGridCell } from "@/components/collection/collection-grid-cell";
import { CollectionGridOverlays } from "@/components/collection/collection-grid-overlays";
import { CollectionIntroBanner } from "@/components/collection/collection-intro-banner";
import {
  CollectionActionsCell,
  CollectionRowWrapper,
} from "@/components/collection/collection-table-wiring";
import { CollectionTopBar } from "@/components/collection/collection-top-bar";
import { FloatingActionBar } from "@/components/collection/floating-action-bar";
import { VariantLocationsPopoverHost } from "@/components/collection/variant-locations-popover-host";
import { EmptyState } from "@/components/empty-state";
import { defaultGroupByOptions } from "@/components/filters/options-bar";
import { AddToListDialog } from "@/components/list/add-to-list-dialog";
import { LendCardDialog } from "@/components/loans/lend-card-dialog";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Toggle } from "@/components/ui/toggle";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollectionGridData } from "@/hooks/use-collection-grid-data";
import { useCollectionGridSelection } from "@/hooks/use-collection-grid-selection";
import {
  useClearCollection,
  useCollections,
  useDeleteCollection,
  useSetCollectionDeckbuilding,
} from "@/hooks/use-collections";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useCopyListMemberships, useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { tileSiblings } from "@/lib/card-tiles";
import { collectionTableActionsColumn } from "@/lib/collection-table";
import { aggregatePersonalCollectionValue } from "@/lib/collection-value";
import { useCopiesCollection } from "@/lib/copies-collection";
import { formatterForMarketplace } from "@/lib/format";
import { isCopiesOnlyGrouping } from "@/lib/group-by-collection";
import { GROUP_BY_LABELS } from "@/lib/group-by-field";
import { getSiteUrl } from "@/lib/site-config";
import { isTempCopyId } from "@/lib/temp-copy-id";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";
import { useAddModeStore } from "@/stores/add-mode-store";
import type { CollectionContextAction } from "@/stores/card-row-actions-store";
import {
  useCloseCollectionOverlaysOnUnmount,
  useCollectionOverlayStore,
} from "@/stores/collection-overlay-store";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";
import { useLibraryToggle } from "@/stores/library-toggle-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

import { DisposeDialog } from "./dispose-dialog";
import { MoveDialog } from "./move-dialog";

// Custom tags are a deck-builder concept (format constraints, freeform
// self-narrowing). Hiding them here keeps the collection grid focused on
// physical attributes you actually own copies of. Markers and channels stay
// visible: collections can hold promo printings, and both sections self-hide
// when no owned printing carries one.
const COLLECTION_GRID_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["customTags"]);

interface CollectionGridProps {
  collectionId?: string;
  title: string;
  /**
   * Whether the group-box "Wanted" filter is on. Owned by the route as a search
   * param, so a link can open a box straight into the filtered view. Only the
   * single-collection route passes these two — the "All cards" aggregate has no
   * one box to filter.
   */
  wantedOnly?: boolean;
  onWantedOnlyChange?: (next: boolean) => void;
}

export function CollectionGrid({
  collectionId,
  title,
  wantedOnly = false,
  onWantedOnlyChange,
}: CollectionGridProps) {
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data: collections } = useCollections();
  const showImages = useDisplayStore((state) => state.showImages);
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const favoriteMarketplace = display.favoriteMarketplace;

  // ── Mode state ──────────────────────────────────────────────────────
  // `showLibrary` widens the grid from "cards in this collection" to "every
  // card in the catalog", with unowned cards rendered as a + affordance only.
  // Per-session state (see library-toggle-store): it survives collection
  // switches so browsing the library isn't interrupted, but a fresh page load
  // always starts in the collection-only view; the toggle never persists.
  const [showLibrary, setShowLibrary] = useLibraryToggle("collection");

  // ── Filter state (active in all modes) ──────────────────────────────
  const {
    filters,
    sortBy,
    sortDir,
    view,
    groupBy: rawGroupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  // The "Collection" axis buckets physical copies, so it needs copies view (one
  // item per copy, each carrying its holding collection) and the "All cards"
  // aggregate, the only scope with more than one collection in play. Everywhere
  // else the axis is absent from the dropdown, so a value left over from the
  // URL or the remembered pref normalizes back to the surface default instead
  // of driving a grouping the toolbar can't show.
  const collectionGroupingAvailable =
    collectionId === undefined && view === "copies" && !showLibrary;
  const groupBy =
    isCopiesOnlyGrouping(rawGroupBy) && !collectionGroupingAvailable ? "set" : rawGroupBy;
  const { setSearch } = useFilterActions();
  const {
    allPrintings,
    cardsById,
    sets,
    printingsByCardId: catalogAllPrintingsByCardId,
  } = useCards();
  const prices = display.prices;

  // On first mount, seed the URL `languages` filter from the user's preferred
  // languages if none are set — same behaviour as the /cards catalog. Owned
  // cards in non-preferred languages are hidden until the user clears the
  // (visible, clearable) Language filter; users who want to see every language
  // clear the Language section in the filter panel. After seeding,
  // `filters.languages` is the single source of truth (empty = show all).
  useSeedLanguagesFromPrefs(filters.languages);

  // Quick Add palette adds *new* cards, so it should only surface languages
  // the user has enabled in their profile prefs — unlike the collection grid
  // above, where we deliberately keep showing already-owned cards in any
  // language. Empty pref means "show all".
  const preferredLanguages = useDisplayStore((state) => state.languages);

  // ── Collection grid data pipeline (collection-scoped + catalog-scoped card
  //    data, show-library active-set selection, group-collection personal
  //    shortfall override, tile grouping axis, deferred/stale bookkeeping) ──
  const {
    dataView,
    currentCollection,
    isGroupCollection,
    wantedFilterActive,
    tileGroupBy,
    availableFilters,
    availableLanguages,
    filterCounts,
    sortedCards,
    printingsByCardId,
    detailPanePrintingsByCardId,
    totalUniqueCards,
    setDisplayLabel,
    ownedCountBound,
    selectableCopyIds,
    collectionIdByCopyId,
    stacks,
    totalCopies,
    stackByPrintingId,
    copiesReady,
    catalogPrintingsByCardId,
    catalogPriceRangeByCardId,
    deferredSortedCards: renderedCards,
    isGridStale,
    ownedCountByPrinting,
  } = useCollectionGridData({
    collectionId,
    filters,
    sortBy,
    sortDir,
    view,
    groupBy,
    showLibrary,
    wantedOnly,
    allPrintings,
    sets,
    catalogAllPrintingsByCardId,
    favoriteMarketplace,
    prices,
  });

  // ── Selection state (select mode) ───────────────────────────────────
  const {
    selected,
    selectMode,
    setSelectMode,
    toggleSelect,
    toggleStack,
    toggleSelectAll,
    clearSelection,
    resetSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
  } = useCardSelection();
  const mode = selectMode ? "select" : "browse";

  // "copies" view expands individual copies. When the library is shown the
  // toolbar hides the "copies" option, but if the user had it selected from
  // a previous visit we treat the grid as stacked anyway — unowned cards
  // have no copies to expand.
  const stacked = showLibrary || view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  // "Lend to a friend" (ADR-039): the clicked stack's printing + a stepper cap.
  const [lendTarget, setLendTarget] = useState<{ printing: Printing; maxQuantity: number } | null>(
    null,
  );
  // Copy IDs the Move / Add-to-list / Dispose dialogs operate on. The floating
  // action bar sets this to the whole selection; the right-click menu sets it
  // to the selection or to just the clicked card. Decoupled from `selected` so
  // a browse-mode right-click can act on one card without entering select mode.
  const [actionCopyIds, setActionCopyIds] = useState<string[]>([]);
  // True when `actionCopyIds` are all copies of a single card, so the Move,
  // Add-to-list and Dispose dialogs can offer a "how many copies" stepper
  // instead of always acting on every copy.
  const [actionSingleCard, setActionSingleCard] = useState(false);
  // How many copies the dispose dialog's stepper currently targets. Unlike the
  // other dialogs this one lives here: the membership check and the
  // recorded-details count below are computed over the chosen slice.
  const [disposeQuantity, setDisposeQuantity] = useState(0);
  // Which of `actionCopyIds` carry recorded details (ADR-038), snapshotted when
  // the dispose dialog opens so it can warn about deleting them.
  const [actionAnnotatedIds, setActionAnnotatedIds] = useState<ReadonlySet<string>>(new Set());
  // The dialogs below the grid (quick add, delete, clear inbox, edit, share,
  // per-copy details, and the two group "bulk box" take steps) keep their
  // open/close state in collection-overlay-store, and this component only ever
  // writes to it. Same reasoning as the variant popover below: subscribing here
  // would re-render the whole virtualized grid every time a dialog opened.
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  // Raw synced copy rows, for metadata-aware checks at action time (ADR-038).
  const copiesStore = useCopiesCollection();
  // The copies the dispose dialog would actually remove: the front of the
  // target stack, narrowed by its stepper. Every warning below is scoped to
  // exactly these, so lowering the count re-checks rather than overstating.
  const disposeCopyIds = actionCopyIds.slice(0, disposeQuantity);
  // Which of the viewer's lists reference the copies about to be disposed — only
  // checked while the dispose dialog is open so the warning can name them.
  const disposeListMemberships = useCopyListMemberships(disposeCopyIds, disposeOpen);
  const disposeAnnotatedCount = disposeCopyIds.filter((copyId) =>
    actionAnnotatedIds.has(copyId),
  ).length;
  const deleteCollection = useDeleteCollection();
  const clearCollection = useClearCollection();
  const setDeckbuilding = useSetCollectionDeckbuilding();
  const navigate = useNavigate();

  // ── Navigation helpers ──────────────────────────────────────────────
  const inbox = collections.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  const inboxName = inbox?.name;
  // In a group collection every copy is shared, not personally owned, so it
  // can't go on a trade/wish list. We gate the drag/add affordances on this.
  // (The "All cards" view has no single collection, so this is false there and
  // the server still enforces the rule.) `currentCollection` / `isGroupCollection`
  // are defined above (near the owned-filter wiring).
  const sourceCollectionIsGroup = isGroupCollection;
  const addTarget = collectionId ?? inboxId;
  const quickAddCollectionName = currentCollection?.name ?? "Collection";
  useRegisterQuickAdd({
    key: addTarget ? `collection:${addTarget}` : null,
    label: `Add to ${quickAddCollectionName}`,
    // Moving needs somewhere to move from, so it is offered only once the
    // viewer has a second collection.
    moveLabel: (collections?.length ?? 0) >= 2 ? `Move to ${quickAddCollectionName}` : null,
  });

  // A collection that loads empty opens straight in library mode, so a first
  // visit shows a page full of addable cards instead of an empty grid. This is
  // a render-phase state adjustment (not an effect) so the empty state never
  // paints first, and one-shot per collection so the library toggle and the
  // first adds stick afterwards instead of the view flipping back.
  const [autoLibraryApplied, setAutoLibraryApplied] = useState(false);
  // Switching collections re-arms the one-shot, so an empty target opens in
  // library mode again. The "All cards" aggregate has no id, hence a separate
  // tracker rather than comparing against the applied-for value.
  const [autoLibraryScope, setAutoLibraryScope] = useState(collectionId);
  if (autoLibraryScope !== collectionId) {
    setAutoLibraryScope(collectionId);
    setAutoLibraryApplied(false);
  }
  if (!autoLibraryApplied && copiesReady && addTarget) {
    setAutoLibraryApplied(true);
    if (stacks.length === 0) {
      setShowLibrary(true);
    }
  }

  const introDismissed = useOnboardingStore((state) => state.collectionIntroDismissed);
  const dismissIntro = useOnboardingStore((state) => state.dismissCollectionIntro);
  // Shown to everyone (established collections included) until explicitly
  // dismissed — the toolbar legend is worth one read for existing users too.
  const showIntroBanner = !introDismissed;

  // A group-owned collection is a communal "bulk box": any member can take a
  // copy into their own inbox (a free-pile claim, distinct from the 1:1 trade
  // matcher). Wishlist highlighting + the "Take a copy" action only apply here.
  // (`isGroupCollection` is defined above, near the owned-filter wiring.)
  const canTake = isGroupCollection && Boolean(inboxId);
  const wish = useWishEntries(isGroupCollection);

  // ── Variant×collection popover handlers (used by the count-pill, the tile
  //    minus, and keyboard +/- on table rows). The popover's own open/close
  //    state lives in VariantLocationsPopoverHost, NOT here: subscribing this
  //    component to `variantPopover` would re-render the whole virtualized grid
  //    on every open/close and reset the window scroll position. ─────────────
  const {
    handleQuickAdd,
    handleAddToCollection,
    tryUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    pendingAnnotatedDispose,
    confirmAnnotatedDispose,
    cancelAnnotatedDispose,
    disposeIsPending,
  } = useQuickAddActions(addTarget, collectionId);
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
  // and the floating action bar would operate on invisible rows. Sibling
  // overrides also reset because pinned variants are scoped to this view.
  // The library toggle deliberately does NOT reset: someone adding cards to
  // several collections in a row would otherwise have to turn it back on
  // after every switch.
  useScopeEffect(collectionId, () => {
    resetSelection();
    useSiblingOverrideStore.getState().clearScope("collection");
    useAddModeStore.getState().reset();
    // A dialog left open would otherwise still be pointing at the collection
    // the viewer just navigated away from. Leaving the grid entirely is handled
    // on the way out instead — see useCloseCollectionOverlaysOnUnmount.
    useCollectionOverlayStore.getState().reset();
  });

  useCloseCollectionOverlaysOnUnmount();

  // ── Mutation handlers ───────────────────────────────────────────────
  // All three bulk actions operate on `actionCopyIds` (set when the dialog is
  // opened), not on `selected` directly — a browse-mode right-click targets a
  // single card without a visible selection. clearSelection() on success is a
  // no-op in that case and clears the selection in the select-mode paths.
  //
  // A single-card target can act on part of the stack: the dialogs offer a
  // stepper and hand back how many copies to touch, taken off the front of
  // `actionCopyIds`.
  const handleMove = (toCollectionId: string, quantity: number) => {
    const copyIds = actionCopyIds.slice(0, quantity);
    moveCopies.mutate(
      { copyIds, toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${copyIds.length} card${copyIds.length > 1 ? "s" : ""}`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleDispose = () => {
    const copyIds = disposeCopyIds;
    disposeCopies.mutate(
      { copyIds },
      {
        onSuccess: () => {
          toast.success(`Removed ${copyIds.length} card${copyIds.length > 1 ? "s" : ""}`);
          clearSelection();
          setDisposeOpen(false);
        },
      },
    );
  };

  // Snapshot the action target, then open the matching dialog.
  const openAction = (action: CollectionContextAction, copyIds: string[]) => {
    setActionCopyIds(copyIds);
    setActionSingleCard(copyIdsShareOneCard(copyIds));
    if (action === "move") {
      setMoveOpen(true);
    } else if (action === "addToList") {
      setAddToListOpen(true);
    } else {
      // Note which targets have recorded details (ADR-038) so the dispose
      // dialog can warn that removing them deletes those details. Snapshotted
      // as ids, not a count, because the stepper can narrow the target set.
      const ids = new Set(copyIds);
      setActionAnnotatedIds(
        new Set(
          copiesStore
            ? copiesStore.toArray
                .filter((copy) => ids.has(copy.id) && copyHasMetadata(copy))
                .map((copy) => copy.id)
            : [],
        ),
      );
      setDisposeQuantity(copyIds.length);
      setDisposeOpen(true);
    }
  };

  // Whether every target copy belongs to the same card. The right-click menu on
  // a single card resolves to all its copies; the float bar can span several
  // cards. Only the single-card case gets the "how many copies" stepper.
  const copyIdsShareOneCard = (copyIds: string[]) => {
    if (copyIds.length <= 1) {
      return true;
    }
    const cardIdByCopyId = new Map<string, string>();
    for (const stack of stacks) {
      for (const copyId of stack.copyIds) {
        cardIdByCopyId.set(copyId, stack.printing.cardId);
      }
    }
    const cardIds = new Set(copyIds.map((copyId) => cardIdByCopyId.get(copyId)));
    return cardIds.size === 1;
  };

  const handleDeleteCollection = () => {
    if (!collectionId) {
      return;
    }
    deleteCollection.mutate(collectionId, {
      onSuccess: () => {
        useCollectionOverlayStore.getState().setDeleteOpen(false);
        void navigate({ to: "/collections" });
      },
    });
  };

  const handleClearInbox = () => {
    if (!currentCollection) {
      return;
    }
    clearCollection.mutate(currentCollection.id, {
      onSuccess: ({ removedCount, keptCopyIds }) => {
        useCollectionOverlayStore.getState().setClearInboxOpen(false);
        const keptCount = keptCopyIds.length;
        if (removedCount === 0 && keptCount === 0) {
          toast.info("Your Inbox is already empty");
        } else if (keptCount > 0) {
          toast.success(
            `Removed ${removedCount} card${removedCount === 1 ? "" : "s"}. ${keptCount} stayed because they're reserved in a trade or lent out.`,
          );
        } else {
          toast.success(
            `Removed ${removedCount} card${removedCount === 1 ? "" : "s"} from your Inbox`,
          );
        }
      },
    });
  };

  // Shared collections live in a friend group; rename/delete/share is gated on
  // group owner/admin (or always allowed for personal collections, where viewerCanAdmin
  // is true). The inbox is special-cased — it can never be deleted, so it gets
  // a "clear inbox" action instead.
  const canAdminCollection = Boolean(currentCollection?.viewerCanAdmin);
  const canDeleteCollection = Boolean(
    currentCollection && !currentCollection.isInbox && canAdminCollection,
  );
  const canClearInbox = Boolean(currentCollection?.isInbox && canAdminCollection);

  // ── Build items list ────────────────────────────────────────────────
  let items: CardViewerItem[];
  const stackByItemId = new Map<string, StackedEntry>();

  if (showLibrary) {
    // Library view: every catalog row gets a cell. Owned printings still
    // resolve to their stack so +/-/select/drag keep working on them; unowned
    // printings have no stack and the renderer drops the strip + overlays.
    items = renderedCards.map((printing) => {
      const stack = stackByPrintingId.get(printing.id);
      if (stack) {
        stackByItemId.set(printing.id, stack);
      }
      return { id: printing.id, printing };
    });
  } else {
    // Browse/select: use stacked collection data
    const filteredStacks = renderedCards.map((printing) => ({
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
              // One item per physical copy, so it can name its holding
              // collection — what the "Collection" grouping axis buckets on.
              return {
                id: copyId,
                printing: entry.printing,
                collectionId: collectionIdByCopyId.get(copyId),
              };
            }),
          );
  }

  // Take one copy of a card from the group "bulk box" into the viewer's inbox.
  // Reuses the move pipeline (member → inbox is a writable move); no trade
  // record, since a free pile has no reciprocation. If the card was on the
  // viewer's wishlist, offer to prune it afterwards — never silently.
  // Resolve which copies a take could claim and open the confirm dialog first,
  // so a stray click on the Take button can't silently move cards out of the
  // box. The dialog offers a 1..available quantity stepper before the move.
  const handleTake = (itemId: string, count: number) => {
    const stack = stackByItemId.get(itemId);
    if (!stack || !inboxId) {
      return;
    }
    // Copies view: the tile *is* one physical copy. Stacked views: every copy
    // of the printing currently in the box is takeable.
    const availableCopyIds = stacked ? stack.copyIds : [itemId];
    if (availableCopyIds.length === 0) {
      return;
    }
    const initialQuantity = Math.min(Math.max(1, count), availableCopyIds.length);
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing: stack.printing, availableCopyIds, initialQuantity });
  };

  // ── Grid click handlers, drag-preview effect, row-actions-store effect ──
  const { allCopyIdsByTile } = useCollectionGridSelection({
    items,
    stackByItemId,
    stackByPrintingId,
    stacks,
    tileGroupBy,
    dataView,
    view,
    stacked,
    mode,
    setSelectMode,
    selected,
    toggleSelect,
    toggleStack,
    clearSelection,
    getLastSelectedItemId,
    setLastSelectedItemId,
    addToSelection,
    handleQuickAdd,
    tryUndoAdd,
    handleOpenVariants,
    handleTake,
    setLendTarget,
    openAction,
  });

  // Run the take the viewer confirmed: move the chosen number of copies into
  // their inbox, then offer the wishlist cleanup when the card was one they
  // wanted.
  const performTake = (quantity: number) => {
    const takeConfirm = useCollectionOverlayStore.getState().takeConfirm;
    if (!takeConfirm || !inboxId) {
      return;
    }
    const { printing, availableCopyIds } = takeConfirm;
    const copyIds = availableCopyIds.slice(0, Math.max(1, quantity));
    const takenQuantity = copyIds.length;
    moveCopies.mutate(
      { copyIds, toCollectionId: inboxId },
      {
        onSuccess: () => {
          toast.success(
            takenQuantity === 1
              ? `Took ${legendDisplayName(printing.card)}`
              : `Took ${takenQuantity}× ${legendDisplayName(printing.card)}`,
          );
          useCollectionOverlayStore.getState().setTakeConfirm(null);
          const matches = wish.entriesForPrinting(printing.cardId, printing.id);
          if (matches.length > 0) {
            useCollectionOverlayStore
              .getState()
              .setTakeFollowUp({ printing, entries: matches, takenQuantity });
          }
        },
      },
    );
  };

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
  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    // Wish entries only on a group "bulk box". Pass `undefined` for cards the
    // viewer doesn't want so the cell's memo holds (a fresh empty array each
    // render would bust it); only genuinely-wished cells carry an array.
    const wishEntries = isGroupCollection
      ? wish.entriesForPrinting(item.printing.cardId, item.printing.id)
      : undefined;
    return (
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
          dataView === "cards"
            ? tileSiblings(
                item.printing,
                catalogPrintingsByCardId.get(item.printing.cardId),
                tileGroupBy,
              )
            : undefined
        }
        collectionId={collectionId}
        sourceCollectionIsGroup={sourceCollectionIsGroup}
        display={display}
        showImages={showImages}
        priceRange={catalogPriceRangeByCardId?.get(item.printing.cardId)}
        wishEntries={wishEntries}
        canTake={canTake}
      />
    );
  };

  // ── Toolbar ─────────────────────────────────────────────────────────
  const formatValue = formatterForMarketplace(favoriteMarketplace as Marketplace);
  // The "All Cards" aggregate (no collection selected) excludes shared group
  // collections — their copies are communal, not the viewer's own, so they must
  // not inflate the headline worth. A selected group collection still shows its
  // own value via `currentCollection`.
  const aggregate = aggregatePersonalCollectionValue(collections);
  const valueCents = currentCollection ? currentCollection.totalValueCents : aggregate.valueCents;
  const unpricedCount = currentCollection
    ? currentCollection.unpricedCopyCount
    : aggregate.unpricedCount;

  // Count of selectable copies in the filtered grid, mirroring the temp-id
  // filtering `toggleSelectAll` applies, so "all selected" lines up with what a
  // select-all click can actually select (optimistic temp copies never enter
  // the selection).
  const selectableRealCount = selectableCopyIds.filter((id) => !isTempCopyId(id)).length;

  // The empty check uses the unfiltered stack count, so an empty collection
  // shows the prompt even when filters (including auto-seeded language prefs)
  // are active. Gated on `copiesReady` so the empty state doesn't flash while
  // the first copies fetch is still in flight.
  const isEmpty = !showLibrary && copiesReady && stacks.length === 0;

  // Only a live public link can back a printed QR sheet, so the bar's binder
  // entry appears with the link and goes away again when sharing stops.
  const collectionShareUrl =
    currentCollection?.isPublic && currentCollection.shareToken
      ? `${getSiteUrl()}/collections/share/${currentCollection.shareToken}`
      : undefined;

  const collectionTopBar = (
    <CollectionTopBar
      title={title}
      // Only a single collection can be a deck's box; the "All cards" and list
      // aggregates have no one collection to speak for.
      homeDecks={currentCollection?.homeDecks ?? []}
      onToggleSidebar={toggleSidebar}
      mode={mode}
      valueCents={valueCents}
      unpricedCount={unpricedCount}
      formatValue={formatValue}
      addTarget={addTarget}
      // "All cards" and the inbox are where cards get put in, so Scan and Quick
      // add stay in reach there. A named collection is a place you organize into
      // from elsewhere, so they fold into the ⋮ menu and the bar keeps its room.
      addActionsInBar={!currentCollection || currentCollection.isInbox}
      // Only the empty state hides them, because that screen offers its own
      // Scan and Quick add. An empty collection that auto-opened into library
      // mode is not the empty state, and it still needs both.
      showAddActions={!isEmpty}
      onQuickAdd={() => useCommandPaletteStore.getState().openQuickAdd("add")}
      onSelectAll={() => toggleSelectAll(selectableCopyIds)}
      onEnterSelect={enterSelectMode}
      onExitSelect={exitSelectMode}
      hasCards={stacks.length > 0}
      isAllSelected={selectableRealCount > 0 && selected.size === selectableRealCount}
      view={view}
      canEdit={Boolean(currentCollection) && canAdminCollection}
      canDelete={canDeleteCollection}
      canClearInbox={canClearInbox}
      canShare={Boolean(currentCollection) && canAdminCollection}
      // Per-viewer preference: every member with access can toggle whether a
      // collection feeds *their own* deck inventory, not just group admins.
      canToggleDeckbuilding={Boolean(currentCollection)}
      deckbuildingAvailable={currentCollection?.availableForDeckbuilding ?? false}
      shareUrl={collectionShareUrl}
      collectionName={currentCollection?.name}
      onEdit={() => useCollectionOverlayStore.getState().setEditOpen(true)}
      onDelete={() => useCollectionOverlayStore.getState().setDeleteOpen(true)}
      onClearInbox={() => useCollectionOverlayStore.getState().setClearInboxOpen(true)}
      onShare={() => useCollectionOverlayStore.getState().setShareOpen(true)}
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

  // Only a group bulk box has cards to want off someone else, so the filter
  // shows there and nowhere else. Same heart the tiles use for a wished card.
  const wantedButton =
    isGroupCollection && onWantedOnlyChange ? (
      <Toggle
        variant="outline"
        pressed={wantedOnly}
        onPressedChange={onWantedOnlyChange}
        // Persistent primary fill for the active state, matching the neighbouring
        // library button's active look.
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground"
        title={wantedOnly ? "Show everything in the box" : "Show only cards you want"}
        aria-label={wantedOnly ? "Show everything in the box" : "Show only cards you want"}
      >
        <HeartIcon className="size-4" />
        <span className="hidden sm:inline">Wanted</span>
      </Toggle>
    ) : null;

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

  // In cards+set / cards+rarity a card splits into one tile per section, so
  // sortedCards over-counts cards. Count distinct cardIds to match totalCards.
  const filteredCardCount =
    dataView === "cards"
      ? new Set(sortedCards.map((card) => card.cardId)).size
      : sortedCards.length;

  // Section order for the "Collection" axis, and the names its headers show.
  // Sidebar order, so the sections read top to bottom the way the sidebar
  // lists them (inbox first, then the user's own arrangement).
  const collectionOrder = collections.map((collection) => ({
    id: collection.id,
    slug: "",
    name: collection.name,
  }));

  const toolbar = (
    <BrowserToolbar
      totalCards={view === "copies" ? totalCopies : totalUniqueCards}
      filteredCount={
        view === "copies"
          ? sortedCards.reduce(
              (sum, card) => sum + (stackByPrintingId.get(card.id)?.copyIds.length ?? 0),
              0,
            )
          : filteredCardCount
      }
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredCardCount} ${dataView === "cards" ? "cards" : "printings"}`
          : undefined
      }
      extras={
        <>
          {wantedButton}
          {showLibraryButton}
        </>
      }
      showCopies={!showLibrary}
      groupByOptions={
        collectionGroupingAvailable
          ? [...defaultGroupByOptions, { value: "collection", label: GROUP_BY_LABELS.collection }]
          : undefined
      }
      // `groupBy` here is the normalized value, so the dropdown never shows
      // "Collection" while the grid has fallen back to the set grouping.
      groupByValue={groupBy}
    />
  );

  // ── Panes ───────────────────────────────────────────────────────────

  // Only browse mode puts add controls on the tiles, so only browse mode puts
  // them in the detail overlay.
  const detailActions =
    mode === "browse"
      ? (printing: Printing) => (
          <PrintingCountActions printing={printing} collectionId={collectionId} />
        )
      : undefined;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
      actions={detailActions}
    />
  );

  // Rendered once below, as the trailing sibling of the empty/populated content
  // branch rather than inside either arm. That keeps a single, stable mount
  // point for these overlays across the empty↔populated transition, so an open
  // QuickAddPalette keeps its state (search input, expanded card) on the first
  // add instead of remounting when the empty-state subtree unmounts.
  const collectionOverlays = (
    <CollectionGridOverlays
      addTarget={addTarget}
      currentCollection={currentCollection}
      catalogAllPrintingsByCardId={catalogAllPrintingsByCardId}
      ownedCountByPrinting={ownedCountByPrinting}
      preferredLanguages={preferredLanguages}
      collections={collections}
      handleDeleteCollection={handleDeleteCollection}
      deleteIsPending={deleteCollection.isPending}
      handleClearInbox={handleClearInbox}
      clearInboxIsPending={clearCollection.isPending}
      pendingAnnotatedDispose={pendingAnnotatedDispose}
      confirmAnnotatedDispose={confirmAnnotatedDispose}
      cancelAnnotatedDispose={cancelAnnotatedDispose}
      disposeIsPending={disposeIsPending}
      performTake={performTake}
      moveIsPending={moveCopies.isPending}
    />
  );

  // ── Content branch ──────────────────────────────────────────────────
  return (
    <>
      {isEmpty ? (
        <>
          {topBarPortal}
          <EmptyState
            className="flex-1"
            icon={PackageIcon}
            title="No cards yet"
            description={
              <>
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
              </>
            }
          >
            <div className="flex flex-wrap justify-center gap-2">
              {addTarget && (
                <>
                  <Button onClick={toggleShowLibrary}>
                    <LibraryBigIcon />
                    Browse & add
                  </Button>
                  {/* An empty collection is exactly when a stack of physical
                      cards is waiting to be entered, so the scanner belongs
                      here even though the bar only carries it on the inbox. */}
                  <Link to="/scan" className={buttonVariants({ variant: "ghost" })}>
                    <CameraIcon />
                    Scan cards
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => useCommandPaletteStore.getState().openQuickAdd("add")}
                  >
                    <SquarePlusIcon />
                    Quick add
                  </Button>
                </>
              )}
              <Link to="/collections/import" className={buttonVariants({ variant: "ghost" })}>
                <DownloadIcon />
                Import from another tool
              </Link>
            </div>
          </EmptyState>
        </>
      ) : (
        <CardBrowserFilterProvider
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          filterCounts={filterCounts}
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
            collectionOrder={collectionGroupingAvailable ? collectionOrder : undefined}
            groupBy={groupBy}
            groupDir={groupDir}
            renderedCards={renderedCards}
            printingsByCardId={printingsByCardId}
            view={dataView}
            stale={isGridStale}
            noResultsDescription={
              wantedFilterActive
                ? "Nothing from your wishlists is in this box right now."
                : undefined
            }
            toolbar={toolbar}
            banner={
              showIntroBanner ? (
                <CollectionIntroBanner showLibrary={showLibrary} onDismiss={dismissIntro} />
              ) : undefined
            }
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
                  tileGroupBy={tileGroupBy}
                />
              ),
              rowWrapper: (
                <CollectionRowWrapper
                  collectionId={collectionId}
                  stackByItemId={stackByItemId}
                  allCopyIdsByTile={allCopyIdsByTile}
                  sourceCollectionIsGroup={sourceCollectionIsGroup}
                  tileGroupBy={tileGroupBy}
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

            <SelectionDetailOverlays
              items={items}
              printingsByCardId={detailPanePrintingsByCardId}
              showImages={showImages}
              onSearchAndClose={searchAndClose}
              actions={detailActions}
            />

            <MoveDialog
              open={moveOpen}
              onOpenChange={setMoveOpen}
              collections={collections.filter((collection) => collection.id !== collectionId)}
              count={actionCopyIds.length}
              singleCard={actionSingleCard}
              onMove={handleMove}
              isPending={moveCopies.isPending}
            />

            <DisposeDialog
              open={disposeOpen}
              onOpenChange={setDisposeOpen}
              count={actionCopyIds.length}
              quantity={disposeQuantity}
              onQuantityChange={setDisposeQuantity}
              singleCard={actionSingleCard}
              onConfirm={handleDispose}
              isPending={disposeCopies.isPending}
              memberships={disposeListMemberships.data}
              membershipsLoading={disposeListMemberships.isLoading}
              annotatedCount={disposeAnnotatedCount}
            />

            {/* Mounted only while open: it reads the user's lists with a
                suspense query, and a mounted-but-closed dialog suspends into
                whatever boundary the page sits behind (ADR-034). */}
            {addToListOpen && (
              <AddToListDialog
                open={addToListOpen}
                onOpenChange={setAddToListOpen}
                copyIds={actionCopyIds}
                groupOwnedOnly={sourceCollectionIsGroup}
                singleCard={actionSingleCard}
                onAdded={clearSelection}
              />
            )}

            {lendTarget ? (
              <LendCardDialog
                open
                onOpenChange={(open) => {
                  if (!open) {
                    setLendTarget(null);
                  }
                }}
                printing={lendTarget.printing}
                cardName={cardsById[lendTarget.printing.cardId]?.name ?? "this card"}
                maxQuantity={lendTarget.maxQuantity}
                contextCollectionId={collectionId}
              />
            ) : null}
          </BrowserCardViewer>

          {/* Variant×collection popover (browse add mode only). Self-subscribes to
            the add-mode store so opening it never re-renders this grid. */}
          <VariantLocationsPopoverHost
            catalogPrintingsByCardId={catalogPrintingsByCardId}
            languageScopedPrintingsByCardId={detailPanePrintingsByCardId}
            onQuickAdd={handleQuickAdd && ((printing) => void handleQuickAdd(printing))}
            defaultTargetCollectionId={addTarget}
            onAddToCollection={(target, targetCollectionId) =>
              void handleAddToCollection(target, targetCollectionId)
            }
            onRemoveFromCollection={(target, targetCollectionId) =>
              void handleDisposeFromCollection(target, targetCollectionId)
            }
            closeVariants={closeVariants}
            viewCollectionId={collectionId}
          />
        </CardBrowserFilterProvider>
      )}
      {collectionOverlays}
    </>
  );
}
