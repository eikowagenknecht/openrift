import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { BrowserCardCell } from "@/components/cards/browser-card-cell";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CatalogTableActions } from "@/components/cards/catalog-table-actions";
import { PrintingCountActions } from "@/components/cards/printing-count-actions";
import { WishlistButton } from "@/components/cards/wishlist-heart";
import { AnnotatedDisposeDialog } from "@/components/collection/annotated-dispose-dialog";
import { QuickAddPalette } from "@/components/collection/quick-add-palette";
import { VariantLocationsPopoverHost } from "@/components/collection/variant-locations-popover-host";
import { WishlistPickerHost } from "@/components/list/wishlist-picker-host";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { Toggle } from "@/components/ui/toggle";
import { useCardData, useCatalogFilterMeta } from "@/hooks/use-card-data";
import { useCardDeepLink } from "@/hooks/use-card-deep-link";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useFilterCountsVisible } from "@/hooks/use-filter-counts-visible";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useRowActionHandlers } from "@/hooks/use-row-action-handlers";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { useSession, useUserId } from "@/lib/auth-session";
import { splitsCardIntoTiles, tileSiblings } from "@/lib/card-tiles";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { maxOwnedCount } from "@/lib/owned-bucket";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

// Custom tags are a deck-builder concept (format constraints, freeform
// self-narrowing). They aren't useful when browsing the catalogue at large,
// so hide the section regardless of auth state.
const CARD_BROWSER_HIDDEN_LOGGED_IN: ReadonlySet<string> = new Set(["customTags"]);
// Owned is only meaningful for logged-in users (counts would otherwise read 0).
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

/**
 * Standalone catalog browser for the /cards route.
 * Provides filters, search, a card detail pane, and — for a signed-in viewer
 * with the owned-count toggle on — the +/- that record a copy where they found
 * it. Adds land in the Inbox; the count pill's variant×collection popover is
 * how a copy reaches any other collection.
 * @returns The catalog browser view.
 */
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
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const userId = useUserId();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);
  // One membership feed for the whole grid: per-cell subscriptions would fetch
  // every wishlist's detail once per visible cell.
  const wish = useWishEntries(isLoggedIn);
  const [wishTarget, setWishTarget] = useState<Printing | null>(null);

  // Both add paths here — the per-cell +/- and the quick-add palette — target
  // the user's Inbox. Use the login-gated query (not useCollections, which
  // subscribes to the live copies collection and requires a user) so
  // logged-out visitors don't trip it.
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: isLoggedIn,
  });
  const inbox = collections?.find((collection) => collection.isInbox);
  const inboxId = inbox?.id;
  // No viewCollectionId: the catalog is not scoped to a collection, so a `-`
  // looks across all of them and escalates to the popover when the copies span
  // more than one (the same shape /collections uses on All Cards).
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
  // Ctrl+K stays the global palette here: this page is already a card search,
  // so the chord is better spent on what it cannot do. Quick add is the
  // palette's first row instead.
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

  // "copies" is a collection-only view — clamp to "printings" in the catalog browser
  const view = rawView === "copies" ? "printings" : rawView;
  const keywordReverseMap = useKeywordReverseMap();

  // On first mount, seed the URL from user prefs if no languages are set.
  // After seeding, `filters.languages` is the single source of truth — empty
  // means "show all" (the user cleared every language within this session).
  useSeedLanguagesFromPrefs(filters.languages);

  // The grid renders straight from the live filter state — no `useDeferredValue`
  // in between. Deferring it split each toggle into two commits: one that only
  // flipped the clicked chip, then a second ~140ms later carrying the cards. On
  // a throttled mid-range phone the new cards landed at ~210ms instead of the
  // ~110ms a single commit takes, and the grid dimmed to 60% in between, so the
  // deferral cost about as much as it was meant to hide.
  //
  // Nothing needs it either: the chip's pressed state is Base UI's own optimistic
  // update, which paints within ~55ms whatever React does, and the search box
  // keeps local state behind a 200ms debounce (see useSearchUrlSync), so typing
  // is never blocked by the filter pipeline. The faceted counts still lag by a
  // frame — that deferral lives in useCatalogFilterMeta, where the badges are
  // the only thing waiting.

  // When no owned filter is active, useCardData's output doesn't depend on the
  // live owned-count map. Passing undefined keeps the hook's return ref stable
  // across +/- clicks so sortedCards → items → groups → virtualRows don't
  // churn. Both the buckets dropdown and the copies-owned range count as
  // "active". The filter meta below uses the same gating.
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;
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
      // Meta (availableFilters + faceted counts) comes from the direct
      // useCatalogFilterMeta call below — computing it here too would run
      // the whole computeFilterCounts pass twice per filter change.
      metaEnabled: false,
      keywordReverseMap,
      channels,
    });

  // The detail-pane picker lists every printing of the clicked card, not just
  // the ones that survived the grid's content filters (set, search, rarity…).
  // Scope it only by the active language filter so browsing in one language
  // doesn't surface foreign-language variants that never appear in the grid.
  // Deferred with the grid so the pane's printing list can't disagree with the
  // cells it was opened from.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );

  const hiddenFilterSections = isLoggedIn
    ? CARD_BROWSER_HIDDEN_LOGGED_IN
    : CARD_BROWSER_HIDDEN_LOGGED_OUT;

  // The copies slider's upper bound is the most copies the user owns of any one
  // card (card-aggregated in cards view, per-printing otherwise). Computed from
  // the always-on owned map — independent of the gating above, which only
  // governs what flows into useCardData. Feeds only the filter chrome, so it
  // doesn't reintroduce grid churn on +/- clicks.
  const ownedCountBound = maxOwnedCount(
    allPrintings,
    ownedCountByPrinting ?? {},
    view === "printings" ? "printing" : "card",
  );

  // Compute filter meta separately from useCardData so the meta hook's
  // outputs aren't entangled with the rest of useCardData's. The owned-count
  // gating below keeps the returned ref stable across +/- clicks when no
  // owned filter is active — without it, every click busts downstream
  // memoization in the filter chrome.
  const ownedCountForMeta = ownedFilterActive ? ownedCountByPrinting : undefined;
  // On phones the counts only show inside the options drawer; skip the whole
  // counts pass (the most expensive part of a filter change) while it's closed.
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

  // Cards+set renders one tile per (card, set), so multiple cells share a
  // cardId and click selection has to navigate by printing — otherwise
  // clicking the SFD reprint would jump back to the OGN tile that shares its
  // cardId. The variant chevron, override mechanism, and per-tile owned count
  // still treat the cell as a card; siblings are filtered to same-set so the
  // chevron only offers in-set variants and the override-by-cardId fallback
  // works correctly across the duplicated cells.
  // Read off the deferred axes: these describe the cells currently on screen.
  const inCardsView = view === "cards";
  const findBy: "card" | "printing" =
    inCardsView && !splitsCardIntoTiles(groupBy) ? "card" : "printing";

  // Deep-link: open a specific printing when navigating from e.g. activity page
  const { printingId: linkedPrintingId } = useSearch({ from: "/_app/cards" });
  useCardDeepLink({ linkedPrintingId, printingsById, items });

  const handleGridCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    useSiblingOverrideStore.getState().setOverride("cards", printing.cardId, printing.id);
  };

  // The owned-count toggle governs what the tiles show, not whether a viewer
  // can record a card: the right-click menu and the grid's +/- keys keep
  // working with counts hidden, and say so through the add toast.
  const showStrip = isLoggedIn && cardsShowCounts;
  const hasAddTarget = handleQuickAdd !== undefined;
  const canAdd = showStrip && hasAddTarget;

  // The popover scopes to the tile the click came from: by set when the
  // grouping splits a card per set, to the one printing outside cards view.
  const openVariantsForTile = handleOpenVariants
    ? (printing: Printing, anchorEl: HTMLElement, intent: VariantPopoverIntent) =>
        handleOpenVariants(printing, anchorEl, intent, groupBy === "set", !inCardsView)
    : undefined;

  // A `-` removes silently when there is exactly one place the copy could come
  // from, and otherwise opens the popover so the viewer picks the row. The two
  // ambiguities are several owned variants behind one tile (resolved here) and
  // one variant whose copies span collections (reported by tryUndoAdd). The
  // owned variants are counted on click rather than pre-bucketed into a map:
  // that map would rebuild on every +/- and bust the grid's memoization for a
  // lookup only a click ever reads.
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
    // Scope siblings to the tile when grouping splits a card (set/rarity) so the
    // variant chevron, per-tile owned count, and the override-by-cardId fallback
    // don't cross the tile's boundary.
    const siblings = inCardsView
      ? tileSiblings(item.printing, allCardSiblings, groupBy)
      : allCardSiblings;

    // Wish entries are looked up against the tile's representative printing,
    // not the cell's overridden one: a card-kind wish matches any printing, and
    // scoping the heart to the tile keeps it steady while the viewer cycles
    // variants. Undefined rather than [] when nothing matches, so an unwished
    // cell's props stay reference-stable.
    const cardWishEntries = isLoggedIn
      ? wish.entriesForPrinting(cardId, item.printing.id)
      : undefined;

    // The cell resolves its own override against the sibling-override store
    // (see useSiblingOverrideStore). The renderCard closure stays stable
    // across sibling clicks — only the cell whose override moved re-renders.
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
      // Persistent primary fill for the active state, matching the prior variant="default" look.
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

  // The overlay covers the tile it was opened from, so it carries the same
  // controls. Its wish lookup uses the printing on screen rather than the
  // tile's representative: the overlay names one variant, and its printing
  // picker is how the reader changes which. Siblings for the owned total come
  // from the pane's own printing list (language-scoped only), so the total
  // agrees with that picker.
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
