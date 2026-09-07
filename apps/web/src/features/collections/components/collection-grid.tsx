import { copyHasMetadata } from "@openrift/shared/copy-metadata";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { legendDisplayName } from "@openrift/shared/utils";
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

import { EmptyState } from "@/components/empty-state";
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Toggle } from "@/components/ui/toggle";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { BrowserCardViewer } from "@/features/cards/components/browser-card-viewer";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/features/cards/components/card-browser-filter-scaffold";
import { defaultGroupByOptions } from "@/features/cards/components/options-bar";
import { PrintingCountActions } from "@/features/cards/components/printing-count-actions";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardSelection } from "@/features/cards/hooks/use-card-selection";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { tileSiblings } from "@/features/cards/lib/card-tiles";
import { isCopiesOnlyGrouping } from "@/features/cards/lib/group-by-collection";
import { GROUP_BY_LABELS } from "@/features/cards/lib/group-by-field";
import type { CollectionContextAction } from "@/features/cards/stores/card-row-actions-store";
import { useLibraryToggle } from "@/features/cards/stores/library-toggle-store";
import { useSiblingOverrideStore } from "@/features/cards/stores/sibling-override-store";
import { CollectionGridCell } from "@/features/collections/components/collection-grid-cell";
import { CollectionGridOverlays } from "@/features/collections/components/collection-grid-overlays";
import { CollectionIntroBanner } from "@/features/collections/components/collection-intro-banner";
import {
  CollectionActionsCell,
  CollectionRowWrapper,
} from "@/features/collections/components/collection-table-wiring";
import { CollectionTopBar } from "@/features/collections/components/collection-top-bar";
import { FloatingActionBar } from "@/features/collections/components/floating-action-bar";
import { VariantLocationsPopoverHost } from "@/features/collections/components/variant-locations-popover-host";
import { useCollectionGridData } from "@/features/collections/hooks/use-collection-grid-data";
import { useCollectionGridSelection } from "@/features/collections/hooks/use-collection-grid-selection";
import {
  useClearCollection,
  useCollections,
  useDeleteCollection,
  useSetCollectionDeckbuilding,
} from "@/features/collections/hooks/use-collections";
import {
  useCopyListMemberships,
  useDisposeCopies,
  useMoveCopies,
} from "@/features/collections/hooks/use-copies";
import { useQuickAddActions } from "@/features/collections/hooks/use-quick-add-actions";
import { collectionTableActionsColumn } from "@/features/collections/lib/collection-table";
import { aggregatePersonalCollectionValue } from "@/features/collections/lib/collection-value";
import { useCopiesCollection } from "@/features/collections/lib/copies-collection";
import type { StackedEntry } from "@/features/collections/lib/stacked-entry";
import { isTempCopyId } from "@/features/collections/lib/temp-copy-id";
import { useAddModeStore } from "@/features/collections/stores/add-mode-store";
import {
  useCloseCollectionOverlaysOnUnmount,
  useCollectionOverlayStore,
} from "@/features/collections/stores/collection-overlay-store";
import { LendCardDialog } from "@/features/groups/components/lend-card-dialog";
import { useWishEntries } from "@/features/groups/hooks/use-wish-entries";
import { AddToListDialog } from "@/features/lists/components/add-to-list-dialog";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { formatterForMarketplace } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-config";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { DisposeDialog } from "./dispose-dialog";
import { MoveDialog } from "./move-dialog";

// Custom tags are a deck-builder concept; hiding them keeps this grid scoped
// to physical attributes of owned copies. Markers/channels self-hide instead.
const COLLECTION_GRID_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["customTags"]);

interface CollectionGridProps {
  collectionId?: string;
  title: string;
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
  const display = useCardThumbnailDisplay();
  const favoriteMarketplace = display.favoriteMarketplace;

  const [showLibrary, setShowLibrary] = useLibraryToggle("collection");

  const {
    filters,
    sortBy,
    sortDir,
    view,
    groupBy: rawGroupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  // The "Collection" grouping axis only applies to copies view of the "All
  // cards" aggregate; elsewhere a leftover value normalizes back to "set".
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

  useSeedLanguagesFromPrefs(filters.languages);

  const preferredLanguages = useDisplayStore((state) => state.languages);

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

  // Library mode always treats the grid as stacked: unowned cards have no
  // copies to expand.
  const stacked = showLibrary || view !== "copies";
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [lendTarget, setLendTarget] = useState<{ printing: Printing; maxQuantity: number } | null>(
    null,
  );
  // Copy IDs the Move / Add-to-list / Dispose dialogs operate on, decoupled
  // from `selected` so a browse-mode right-click can target one card without
  // entering select mode.
  const [actionCopyIds, setActionCopyIds] = useState<string[]>([]);
  const [actionSingleCard, setActionSingleCard] = useState(false);
  const [disposeQuantity, setDisposeQuantity] = useState(0);
  const [actionAnnotatedIds, setActionAnnotatedIds] = useState<ReadonlySet<string>>(new Set());
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const copiesStore = useCopiesCollection();
  const disposeCopyIds = actionCopyIds.slice(0, disposeQuantity);
  const disposeListMemberships = useCopyListMemberships(disposeCopyIds, disposeOpen);
  const disposeAnnotatedCount = disposeCopyIds.filter((copyId) =>
    actionAnnotatedIds.has(copyId),
  ).length;
  const deleteCollection = useDeleteCollection();
  const clearCollection = useClearCollection();
  const setDeckbuilding = useSetCollectionDeckbuilding();
  const navigate = useNavigate();

  const inbox = collections.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  const inboxName = inbox?.name;
  // Group-collection copies are shared, not personally owned, so they can't
  // go on a trade/wish list; the server enforces this too.
  const sourceCollectionIsGroup = isGroupCollection;
  const addTarget = collectionId ?? inboxId;
  const quickAddCollectionName = currentCollection?.name ?? "Collection";
  useRegisterQuickAdd({
    key: addTarget ? `collection:${addTarget}` : null,
    label: `Add to ${quickAddCollectionName}`,
    moveLabel: (collections?.length ?? 0) >= 2 ? `Move to ${quickAddCollectionName}` : null,
  });

  // Render-phase (not effect) so an empty collection never paints before
  // flipping into library mode, and one-shot per collection so a later
  // manual toggle sticks.
  const [autoLibraryApplied, setAutoLibraryApplied] = useState(false);
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
  const showIntroBanner = !introDismissed;

  // Group-owned collections are a communal "bulk box": any member can take a
  // copy into their own inbox, distinct from the 1:1 trade matcher.
  const canTake = isGroupCollection && Boolean(inboxId);
  const wish = useWishEntries(isGroupCollection);

  // The popover's open/close state lives in VariantLocationsPopoverHost, not
  // here, so opening it doesn't re-render the whole virtualized grid.
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

  // Switching collections drops any in-progress selection (it wouldn't be
  // visible in the new grid) and sibling overrides. The library toggle is
  // deliberately NOT reset here.
  useScopeEffect(collectionId, () => {
    resetSelection();
    useSiblingOverrideStore.getState().clearScope("collection");
    useAddModeStore.getState().reset();
    useCollectionOverlayStore.getState().reset();
  });

  useCloseCollectionOverlaysOnUnmount();

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

  const openAction = (action: CollectionContextAction, copyIds: string[]) => {
    setActionCopyIds(copyIds);
    setActionSingleCard(copyIdsShareOneCard(copyIds));
    if (action === "move") {
      setMoveOpen(true);
    } else if (action === "addToList") {
      setAddToListOpen(true);
    } else {
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

  const canAdminCollection = Boolean(currentCollection?.viewerCanAdmin);
  const canDeleteCollection = Boolean(
    currentCollection && !currentCollection.isInbox && canAdminCollection,
  );
  const canClearInbox = Boolean(currentCollection?.isInbox && canAdminCollection);

  let items: CardViewerItem[];
  const stackByItemId = new Map<string, StackedEntry>();

  if (showLibrary) {
    items = renderedCards.map((printing) => {
      const stack = stackByPrintingId.get(printing.id);
      if (stack) {
        stackByItemId.set(printing.id, stack);
      }
      return { id: printing.id, printing };
    });
  } else {
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
              return {
                id: copyId,
                printing: entry.printing,
                collectionId: collectionIdByCopyId.get(copyId),
              };
            }),
          );
  }

  // Reuses the move pipeline (member -> inbox); no trade record since a free
  // pile has no reciprocation.
  const handleTake = (itemId: string, count: number) => {
    const stack = stackByItemId.get(itemId);
    if (!stack || !inboxId) {
      return;
    }
    const availableCopyIds = stacked ? stack.copyIds : [itemId];
    if (availableCopyIds.length === 0) {
      return;
    }
    const initialQuantity = Math.min(Math.max(1, count), availableCopyIds.length);
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing: stack.printing, availableCopyIds, initialQuantity });
  };

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

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    // `undefined` (not an empty array) for cards the viewer doesn't want, so
    // the cell's memo holds across renders.
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

  const formatValue = formatterForMarketplace(favoriteMarketplace as Marketplace);
  // Excludes shared group collections: their copies are communal, not the
  // viewer's own.
  const aggregate = aggregatePersonalCollectionValue(collections);
  const valueCents = currentCollection ? currentCollection.totalValueCents : aggregate.valueCents;
  const unpricedCount = currentCollection
    ? currentCollection.unpricedCopyCount
    : aggregate.unpricedCount;

  // Excludes optimistic temp copies, mirroring what `toggleSelectAll` can
  // actually select.
  const selectableRealCount = selectableCopyIds.filter((id) => !isTempCopyId(id)).length;

  const isEmpty = !showLibrary && copiesReady && stacks.length === 0;

  const collectionShareUrl =
    currentCollection?.isPublic && currentCollection.shareToken
      ? `${getSiteUrl()}/collections/share/${currentCollection.shareToken}`
      : undefined;

  const collectionTopBar = (
    <CollectionTopBar
      title={title}
      homeDecks={currentCollection?.homeDecks ?? []}
      onToggleSidebar={toggleSidebar}
      mode={mode}
      valueCents={valueCents}
      unpricedCount={unpricedCount}
      formatValue={formatValue}
      addTarget={addTarget}
      addActionsInBar={!currentCollection || currentCollection.isInbox}
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

  const wantedButton =
    isGroupCollection && onWantedOnlyChange ? (
      <Toggle
        variant="outline"
        pressed={wantedOnly}
        onPressedChange={onWantedOnlyChange}
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

  // In cards+set / cards+rarity, a card splits into one tile per section, so
  // sortedCards over-counts; count distinct cardIds instead.
  const filteredCardCount =
    dataView === "cards"
      ? new Set(sortedCards.map((card) => card.cardId)).size
      : sortedCards.length;

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
      groupByValue={groupBy}
    />
  );

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

  // Rendered as a trailing sibling of the empty/populated branch so an open
  // QuickAddPalette keeps its state across the empty <-> populated transition.
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
              actionsColumn: collectionTableActionsColumn({
                stacked,
                mode,
                hasQuickAdd: Boolean(handleQuickAdd),
              }),
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
