import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useState } from "react";

import { Toggle } from "@/components/ui/toggle";
import { BrowserCardCell } from "@/features/cards/components/browser-card-cell";
import { BrowserCardViewer } from "@/features/cards/components/browser-card-viewer";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/features/cards/components/card-browser-filter-scaffold";
import { CatalogTableActions } from "@/features/cards/components/catalog-table-actions";
import { PrintingCountActions } from "@/features/cards/components/printing-count-actions";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { WishlistButton } from "@/features/cards/components/wishlist-heart";
import { useCardData, useCatalogFilterMeta } from "@/features/cards/hooks/use-card-data";
import { useCardDeepLink } from "@/features/cards/hooks/use-card-deep-link";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { useFilterCountsVisible } from "@/features/cards/hooks/use-filter-counts-visible";
import { ADD_STRIP_HEIGHT } from "@/features/cards/lib/card-grid-constants";
import { splitsCardIntoTiles, tileSiblings } from "@/features/cards/lib/card-tiles";
import { filterPrintingsByLanguages } from "@/features/cards/lib/filter-printings-by-languages";
import { useSiblingOverrideStore } from "@/features/cards/stores/sibling-override-store";
import { AnnotatedDisposeDialog } from "@/features/collections/components/annotated-dispose-dialog";
import { QuickAddPalette } from "@/features/collections/components/quick-add-palette";
import { VariantLocationsPopoverHost } from "@/features/collections/components/variant-locations-popover-host";
import { collectionsQueryOptions } from "@/features/collections/hooks/use-collections";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import { useQuickAddActions } from "@/features/collections/hooks/use-quick-add-actions";
import { useRowActionHandlers } from "@/features/collections/hooks/use-row-action-handlers";
import { maxOwnedCount } from "@/features/collections/lib/owned-bucket";
import type { VariantPopoverIntent } from "@/features/collections/stores/add-mode-store";
import { useWishEntries } from "@/features/groups/hooks/use-wish-entries";
import { WishlistPickerHost } from "@/features/lists/components/wishlist-picker-host";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession, useUserId } from "@/lib/auth-session";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

const CARD_BROWSER_HIDDEN_LOGGED_IN: ReadonlySet<string> = new Set(["customTags"]);
const CARD_BROWSER_HIDDEN_LOGGED_OUT: ReadonlySet<string> = new Set(["owned", "customTags"]);

interface CatalogActionsCellProps {
  printing?: Printing;
  view: "cards" | "printings";
  printingsByCardId: Map<string, Printing[]>;
}

function CatalogActionsCell({ printing, view, printingsByCardId }: CatalogActionsCellProps) {
  if (!printing) {
    return null;
  }
  return (
    <CatalogTableActions
      printing={printing}
      siblingIds={
        view === "cards"
          ? printingsByCardId.get(printing.cardId)?.map((sibling) => sibling.id)
          : undefined
      }
    />
  );
}

export function CardBrowser() {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const cardsShowCounts = useDisplayStore((s) => s.cardsShowCounts);
  const toggleCardsShowCounts = useDisplayStore((s) => s.toggleCardsShowCounts);
  const {
    allPrintings,
    printingsById,
    sets,
    printingsByCardId: catalogAllPrintingsByCardId,
  } = useCards();
  const channels = useChannelRegistry();
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const userId = useUserId();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);
  // One membership feed for the whole grid: per-cell subscriptions would
  // refetch every wishlist's detail once per visible cell.
  const wish = useWishEntries(isLoggedIn);
  const [wishTarget, setWishTarget] = useState<Printing | null>(null);

  // Login-gated query, not useCollections (which requires a user), so
  // logged-out visitors adding to the Inbox don't trip a subscription.
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: isLoggedIn,
  });
  const inbox = collections?.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  // No viewCollectionId: the catalog isn't scoped to one collection, so `-`
  // looks across all of them and escalates to the popover on ambiguity.
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
  } = useQuickAddActions(inboxId);
  const quickAddOpen = useCommandPaletteStore((state) => state.quickAddOpen);
  const setQuickAddOpen = useCommandPaletteStore((state) => state.setQuickAddOpen);
  // claimsShortcut: false — Ctrl+K stays the global palette here since this
  // page is already a card search; quick add is its first row instead.
  useRegisterQuickAdd({
    key: inboxId ? `catalog:${inboxId}` : null,
    label: "Add to Inbox",
    claimsShortcut: false,
  });

  const {
    filters,
    sortBy,
    sortDir,
    view: rawView,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  const { setSearch } = useFilterActions();

  const view = rawView === "copies" ? "printings" : rawView;
  const keywordReverseMap = useKeywordReverseMap();

  useSeedLanguagesFromPrefs(filters.languages);

  // No useDeferredValue on the filter state: deferring split each toggle into
  // two commits and measured slower on a throttled phone than one commit does.
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;
  // undefined (not the live map) when inactive, so useCardData's return ref
  // stays stable across +/- clicks and sortedCards → items → groups don't churn.
  const ownedCountForCardData = ownedFilterActive ? ownedCountByPrinting : undefined;

  const { sortedCards, printingsByCardId, priceRangeByCardId, totalUniqueCards, filteredCount } =
    useCardData({
      allPrintings,
      sets,
      filters,
      ownedFilter: filters.ownedFilter,
      ownedCountMin: filters.ownedCountMin,
      ownedCountMax: filters.ownedCountMax,
      sortBy,
      sortDir,
      view,
      groupBy,
      ownedCountByPrinting: ownedCountForCardData,
      favoriteMarketplace: display.favoriteMarketplace,
      prices: display.prices,
      // Meta comes from the useCatalogFilterMeta call below; enabling it here
      // too would run computeFilterCounts twice per filter change.
      metaEnabled: false,
      keywordReverseMap,
      channels,
    });

  // Scoped only by the language filter, not the grid's other content filters,
  // so the detail-pane picker still lists every printing of the clicked card.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );

  const hiddenFilterSections = isLoggedIn
    ? CARD_BROWSER_HIDDEN_LOGGED_IN
    : CARD_BROWSER_HIDDEN_LOGGED_OUT;

  // Computed from the always-on owned map, not the gated one above, since it
  // feeds only the filter chrome and can't reintroduce grid churn on +/- clicks.
  const ownedCountBound = maxOwnedCount(
    allPrintings,
    ownedCountByPrinting ?? {},
    view === "printings" ? "printing" : "card",
  );

  const ownedCountForMeta = ownedFilterActive ? ownedCountByPrinting : undefined;
  // Skip the counts pass, the most expensive part of a filter change, while
  // the options drawer (the only place phones show counts) is closed.
  const countsVisible = useFilterCountsVisible();
  const filterMeta = useCatalogFilterMeta({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    view,
    ownedCountByPrinting: ownedCountForMeta,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    countsEnabled: countsVisible,
    keywordReverseMap,
    channels,
  });

  const items: CardViewerItem[] = sortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  // Cards+set shares a cardId across multiple tiles, so selection must
  // navigate by printing or clicking a reprint jumps back to the wrong tile.
  const inCardsView = view === "cards";
  const findBy: "card" | "printing" =
    inCardsView && !splitsCardIntoTiles(groupBy) ? "card" : "printing";

  const { printingId: linkedPrintingId } = useSearch({ from: "/_app/cards" });
  useCardDeepLink({ linkedPrintingId, printingsById, items });

  const handleGridCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    useSiblingOverrideStore.getState().setOverride("cards", printing.cardId, printing.id);
  };

  // Hiding counts only affects the tile display: the right-click menu and
  // the grid's +/- keys keep recording copies while counts are hidden.
  const showStrip = isLoggedIn && cardsShowCounts;
  const hasAddTarget = handleQuickAdd !== undefined;
  const canAdd = showStrip && hasAddTarget;

  const openVariantsForTile = handleOpenVariants
    ? (printing: Printing, anchorEl: HTMLElement, intent: VariantPopoverIntent) =>
        handleOpenVariants(printing, anchorEl, intent, groupBy === "set", !inCardsView)
    : undefined;

  // Owned variants are counted on click, not pre-bucketed into a map, since
  // that map would rebuild on every +/- and bust the grid's memoization.
  const handleDecrement = (printing: Printing, anchorEl?: HTMLElement) => {
    const tile = inCardsView
      ? tileSiblings(printing, printingsByCardId.get(printing.cardId), groupBy)
      : undefined;
    const ownedVariantCount =
      tile?.filter((sibling) => (ownedCountByPrinting?.[sibling.id] ?? 0) > 0).length ?? 0;
    if (ownedVariantCount > 1 && openVariantsForTile && anchorEl) {
      openVariantsForTile(printing, anchorEl, "remove");
      return;
    }
    void (async () => {
      const result = await tryUndoAdd?.(printing);
      if (result === "ambiguous" && openVariantsForTile && anchorEl) {
        openVariantsForTile(printing, anchorEl, "remove");
      }
    })();
  };

  useRowActionHandlers("catalog", {
    onRowClick: handleGridCardClick,
    onSiblingClick: handleSiblingClick,
    onIncrement:
      handleQuickAdd &&
      ((printing, modifiers, quantity) => void handleQuickAdd(printing, modifiers, quantity)),
    onDecrement: hasAddTarget ? handleDecrement : undefined,
    onOpenVariants: openVariantsForTile,
    onAddToWishlist: isLoggedIn ? setWishTarget : undefined,
  });

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const allCardSiblings = printingsByCardId.get(cardId);
    const siblings = inCardsView
      ? tileSiblings(item.printing, allCardSiblings, groupBy)
      : allCardSiblings;

    // Looked up against the tile's representative printing, not the cell's
    // overridden one, so the heart stays steady while variants are cycled.
    const cardWishEntries = isLoggedIn
      ? wish.entriesForPrinting(cardId, item.printing.id)
      : undefined;

    return (
      <BrowserCardCell
        printing={item.printing}
        itemId={item.id}
        siblings={inCardsView ? siblings : undefined}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        showImages={showImages}
        view={view}
        display={display}
        priceRange={priceRangeByCardId?.get(cardId)}
        showStrip={showStrip}
        canAdd={canAdd}
        canMenuAdd={hasAddTarget}
        canWish={isLoggedIn}
        addTargetName={inbox?.name ?? "Inbox"}
        wishEntries={cardWishEntries?.length ? cardWishEntries : undefined}
        inCardsView={inCardsView}
      />
    );
  };

  const showCountsButton = isLoggedIn ? (
    <Toggle
      variant="outline"
      pressed={cardsShowCounts}
      onPressedChange={toggleCardsShowCounts}
      className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground"
      title={cardsShowCounts ? "Hide owned count" : "Show owned count"}
      aria-label={cardsShowCounts ? "Hide owned count" : "Show owned count"}
    >
      <PackageIcon className="size-4" />
    </Toggle>
  ) : null;

  const toolbar = (
    <BrowserToolbar
      totalCards={totalUniqueCards}
      filteredCount={filteredCount}
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredCount} ${view === "cards" ? "cards" : "printings"}`
          : undefined
      }
      extras={showCountsButton}
    />
  );

  const detailActions = isLoggedIn
    ? (printing: Printing) => (
        <div className="flex items-center gap-2">
          {canAdd && (
            <div className="w-28">
              <PrintingCountActions
                printing={printing}
                siblingIds={detailPanePrintingsByCardId
                  .get(printing.cardId)
                  ?.map((sibling) => sibling.id)}
              />
            </div>
          )}
          <WishlistButton
            entries={wish.entriesForPrinting(printing.cardId, printing.id)}
            cardName={legendDisplayName(printing.card)}
            onAdd={() => setWishTarget(printing)}
          />
        </div>
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

  return (
    <>
      <CardBrowserFilterProvider
        availableFilters={filterMeta.availableFilters}
        availableLanguages={filterMeta.availableLanguages}
        filterCounts={filterMeta.filterCounts}
        setDisplayLabel={filterMeta.setDisplayLabel}
        hiddenSections={hiddenFilterSections}
        ownedCountMax={ownedCountBound}
      >
        <BrowserCardViewer
          items={items}
          totalItems={allPrintings.length}
          renderCard={renderCard}
          setOrder={sets}
          groupBy={groupBy}
          groupDir={groupDir}
          renderedCards={sortedCards}
          printingsByCardId={printingsByCardId}
          view={view}
          toolbar={toolbar}
          rightPane={rightPane}
          addStripHeight={showStrip ? ADD_STRIP_HEIGHT : undefined}
          table={{
            actionsColumn: showStrip ? (canAdd ? "stepper" : "narrow") : "none",
            actionsCell: showStrip ? (
              <CatalogActionsCell view={view} printingsByCardId={printingsByCardId} />
            ) : undefined,
          }}
        >
          <SelectionDetailOverlays
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={searchAndClose}
            actions={detailActions}
          />
        </BrowserCardViewer>

        {/* Variant×collection popover. Self-subscribes to the add-mode store so
          opening it never re-renders this grid. */}
        <VariantLocationsPopoverHost
          catalogPrintingsByCardId={printingsByCardId}
          languageScopedPrintingsByCardId={detailPanePrintingsByCardId}
          onQuickAdd={handleQuickAdd && ((printing) => void handleQuickAdd(printing))}
          defaultTargetCollectionId={inboxId}
          onAddToCollection={(printing, collectionId) =>
            void handleAddToCollection(printing, collectionId)
          }
          onRemoveFromCollection={(printing, collectionId) =>
            void handleDisposeFromCollection(printing, collectionId)
          }
          closeVariants={closeVariants}
        />
      </CardBrowserFilterProvider>
      <WishlistPickerHost target={wishTarget} onClose={() => setWishTarget(null)} />
      <AnnotatedDisposeDialog
        pending={pendingAnnotatedDispose}
        onConfirm={() => void confirmAnnotatedDispose()}
        onCancel={cancelAnnotatedDispose}
        isPending={disposeIsPending}
      />
      {inboxId && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={inboxId}
          collectionName="Inbox"
          printingsByCardId={catalogAllPrintingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
          collections={collections}
        />
      )}
    </>
  );
}
