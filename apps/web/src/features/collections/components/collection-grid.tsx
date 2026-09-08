import { use, useState } from "react";
import { createPortal } from "react-dom";

import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { useSidebar } from "@/components/ui/sidebar";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { BrowserCardViewer } from "@/features/cards/components/browser-card-viewer";
import { CardBrowserFilterProvider } from "@/features/cards/components/card-browser-filter-scaffold";
import { useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardSelection } from "@/features/cards/hooks/use-card-selection";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { tileSiblings } from "@/features/cards/lib/card-tiles";
import { isCopiesOnlyGrouping } from "@/features/cards/lib/group-by-collection";
import { useLibraryToggle } from "@/features/cards/stores/library-toggle-store";
import { useSiblingOverrideStore } from "@/features/cards/stores/sibling-override-store";
import {
  CollectionDetailOverlays,
  CollectionDetailPane,
} from "@/features/collections/components/collection-detail-panes";
import { CollectionGridActionDialogs } from "@/features/collections/components/collection-grid-action-dialogs";
import { CollectionGridCell } from "@/features/collections/components/collection-grid-cell";
import { CollectionGridEmpty } from "@/features/collections/components/collection-grid-empty";
import { CollectionGridOverlays } from "@/features/collections/components/collection-grid-overlays";
import { CollectionGridToolbar } from "@/features/collections/components/collection-grid-toolbar";
import { CollectionGridTopBar } from "@/features/collections/components/collection-grid-top-bar";
import { CollectionIntroBanner } from "@/features/collections/components/collection-intro-banner";
import { CollectionSelectionBar } from "@/features/collections/components/collection-selection-bar";
import {
  CollectionActionsCell,
  CollectionRowWrapper,
} from "@/features/collections/components/collection-table-wiring";
import { VariantLocationsPopoverHost } from "@/features/collections/components/variant-locations-popover-host";
import { useCollectionAdminActions } from "@/features/collections/hooks/use-collection-admin-actions";
import { useCollectionGridActions } from "@/features/collections/hooks/use-collection-grid-actions";
import { useCollectionGridData } from "@/features/collections/hooks/use-collection-grid-data";
import { useCollectionGridSelection } from "@/features/collections/hooks/use-collection-grid-selection";
import { useCollections } from "@/features/collections/hooks/use-collections";
import { useQuickAddActions } from "@/features/collections/hooks/use-quick-add-actions";
import { buildCollectionGridItems } from "@/features/collections/lib/collection-grid-items";
import { collectionTableActionsColumn } from "@/features/collections/lib/collection-table";
import { useAddModeStore } from "@/features/collections/stores/add-mode-store";
import {
  useCloseCollectionOverlaysOnUnmount,
  useCollectionOverlayStore,
} from "@/features/collections/stores/collection-overlay-store";
import { useWishEntries } from "@/features/groups/hooks/use-wish-entries";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { useDisplayStore } from "@/stores/display-store";

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
  const quickAdd = useQuickAddActions(addTarget, collectionId);
  const handleQuickAdd = quickAdd.handleQuickAdd;
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

  const admin = useCollectionAdminActions(collectionId);

  const { items, stackByItemId } = buildCollectionGridItems(
    renderedCards,
    stackByPrintingId,
    collectionIdByCopyId,
    showLibrary,
    stacked,
  );

  const actions = useCollectionGridActions({
    stacks,
    stackByItemId,
    stacked,
    inboxId,
    wish,
    clearSelection,
  });

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
    tryUndoAdd: quickAdd.tryUndoAdd,
    handleOpenVariants: quickAdd.handleOpenVariants,
    handleTake: actions.handleTake,
    setLendTarget: actions.setLendTarget,
    openAction: actions.openAction,
  });

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

  const isEmpty = !showLibrary && copiesReady && stacks.length === 0;

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <CollectionGridTopBar
        title={title}
        collections={collections}
        currentCollection={currentCollection}
        mode={mode}
        view={view}
        favoriteMarketplace={favoriteMarketplace}
        addTarget={addTarget}
        isEmpty={isEmpty}
        hasCards={stacks.length > 0}
        selectableCopyIds={selectableCopyIds}
        selectedCount={selected.size}
        onToggleSidebar={toggleSidebar}
        onSelectAll={() => toggleSelectAll(selectableCopyIds)}
        onEnterSelect={enterSelectMode}
        onExitSelect={exitSelectMode}
      />,
      topBarSlot,
    );

  const collectionOrder = collections.map((collection) => ({
    id: collection.id,
    slug: "",
    name: collection.name,
  }));

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
      onDeleteCollection={admin.handleDeleteCollection}
      deleteIsPending={admin.deleteIsPending}
      pendingAnnotatedDispose={quickAdd.pendingAnnotatedDispose}
      confirmAnnotatedDispose={quickAdd.confirmAnnotatedDispose}
      cancelAnnotatedDispose={quickAdd.cancelAnnotatedDispose}
      disposeIsPending={quickAdd.disposeIsPending}
      performTake={actions.performTake}
      moveIsPending={actions.moveIsPending}
    />
  );

  return (
    <>
      {isEmpty ? (
        <>
          {topBarPortal}
          <CollectionGridEmpty
            collectionName={currentCollection?.name}
            inboxName={inboxName}
            addTarget={addTarget}
            onBrowseLibrary={toggleShowLibrary}
          />
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
            toolbar={
              <CollectionGridToolbar
                sortedCards={sortedCards}
                stackByPrintingId={stackByPrintingId}
                view={view}
                dataView={dataView}
                hasActiveFilters={hasActiveFilters}
                totalCopies={totalCopies}
                totalUniqueCards={totalUniqueCards}
                showLibrary={showLibrary}
                collectionGroupingAvailable={collectionGroupingAvailable}
                groupBy={groupBy}
                isGroupCollection={isGroupCollection}
                wantedOnly={wantedOnly}
                onWantedOnlyChange={onWantedOnlyChange}
                addTarget={addTarget}
                onToggleLibrary={toggleShowLibrary}
              />
            }
            banner={
              showIntroBanner ? (
                <CollectionIntroBanner showLibrary={showLibrary} onDismiss={dismissIntro} />
              ) : undefined
            }
            rightPane={
              <CollectionDetailPane
                items={items}
                printingsByCardId={detailPanePrintingsByCardId}
                showImages={showImages}
                collectionId={collectionId}
                mode={mode}
              />
            }
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
            <CollectionSelectionBar
              mode={mode}
              selected={selected}
              moveIsPending={actions.moveIsPending}
              disposeIsPending={actions.disposeIsPending}
              openAction={actions.openAction}
              onClear={clearSelection}
            />

            <CollectionDetailOverlays
              items={items}
              printingsByCardId={detailPanePrintingsByCardId}
              showImages={showImages}
              collectionId={collectionId}
              mode={mode}
            />

            <CollectionGridActionDialogs
              actions={actions}
              collections={collections}
              collectionId={collectionId}
              sourceCollectionIsGroup={sourceCollectionIsGroup}
              cardsById={cardsById}
              onAdded={clearSelection}
            />
          </BrowserCardViewer>

          <VariantLocationsPopoverHost
            catalogPrintingsByCardId={catalogPrintingsByCardId}
            languageScopedPrintingsByCardId={detailPanePrintingsByCardId}
            onQuickAdd={handleQuickAdd && ((printing) => void handleQuickAdd(printing))}
            defaultTargetCollectionId={addTarget}
            onAddToCollection={(target, targetCollectionId) =>
              void quickAdd.handleAddToCollection(target, targetCollectionId)
            }
            onRemoveFromCollection={(target, targetCollectionId) =>
              void quickAdd.handleDisposeFromCollection(target, targetCollectionId)
            }
            closeVariants={quickAdd.closeVariants}
            viewCollectionId={collectionId}
          />
        </CardBrowserFilterProvider>
      )}
      {collectionOverlays}
    </>
  );
}
