import type { Printing } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PackageIcon, PackagePlusIcon } from "lucide-react";
import { useEffect, useDeferredValue, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { BrowserCardCell } from "@/components/cards/browser-card-cell";
import {
  BrowserActiveFilters,
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CatalogTableActions } from "@/components/cards/catalog-table-actions";
import { DisposePickerPopover } from "@/components/collection/dispose-picker-popover";
import { QuickAddPalette } from "@/components/collection/quick-add-palette";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useCardData, useCatalogFilterMeta } from "@/hooks/use-card-data";
import { useCardDeepLink } from "@/hooks/use-card-deep-link";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession, useUserId } from "@/lib/auth-session";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

// Custom tags are a deck-builder concept (format constraints, freeform
// self-narrowing). They aren't useful when browsing the catalogue at large,
// so hide the section regardless of auth state.
const CARD_BROWSER_HIDDEN_LOGGED_IN: ReadonlySet<string> = new Set(["customTags"]);
// Owned is only meaningful for logged-in users (counts would otherwise read 0).
const CARD_BROWSER_HIDDEN_LOGGED_OUT: ReadonlySet<string> = new Set(["owned", "customTags"]);

/**
 * Standalone catalog browser for the /cards route.
 * Provides filters, search, and a card detail pane — no collection or add-mode features.
 * @returns The catalog browser view.
 */
export function CardBrowser() {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const catalogMode = useDisplayStore((s) => s.catalogMode);
  const cycleCatalogMode = useDisplayStore((s) => s.cycleCatalogMode);
  const { allPrintings, printingsById, sets } = useCards();
  const channels = useChannelRegistry();
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const userId = useUserId();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: isLoggedIn,
  });
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const isAddMode = isLoggedIn && catalogMode === "add" && Boolean(inboxId);
  const {
    handleQuickAdd,
    handleUndoAdd,
    tryUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    adjustedCount,
  } = useQuickAddActions(isAddMode ? inboxId : undefined);
  const [variantDisposeTarget, setVariantDisposeTarget] = useState<Printing | null>(null);

  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const disposePicker = useAddModeStore((s) => s.disposePicker);
  const closeDisposePicker = useAddModeStore((s) => s.closeDisposePicker);
  const selectedCardId = useSelectionStore((s) => s.selectedCard?.id);

  // Clear the in-popover dispose page whenever the variants popover closes or
  // switches to a different card — otherwise the next time it opens, it would
  // still be showing the stale "Remove from" sub-page.
  useEffect(() => {
    setVariantDisposeTarget(null);
  }, [variantPopover?.cardId]);

  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

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

  // When no owned buckets are selected, useCardData's output doesn't depend
  // on the live owned-count map. Passing undefined keeps the hook's return
  // ref stable across +/- clicks so sortedCards → items → groups → virtualRows
  // don't churn. The filter meta below uses the same gating.
  const ownedCountForCardData = filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined;

  const { sortedCards, printingsByCardId, priceRangeByCardId, totalUniqueCards, filteredCount } =
    useCardData({
      allPrintings,
      sets,
      filters,
      ownedFilter: filters.ownedFilter,
      sortBy,
      sortDir,
      view,
      groupBy,
      ownedCountByPrinting: ownedCountForCardData,
      favoriteMarketplace: display.favoriteMarketplace,
      prices: display.prices,
      keywordReverseMap,
      channels,
    });

  const hiddenFilterSections = isLoggedIn
    ? CARD_BROWSER_HIDDEN_LOGGED_IN
    : CARD_BROWSER_HIDDEN_LOGGED_OUT;

  // Compute filter meta separately from useCardData so the meta hook's
  // outputs aren't entangled with the rest of useCardData's. The owned-count
  // gating below keeps the returned ref stable across +/- clicks when no
  // owned buckets are selected — without it, every click busts downstream
  // memoization in the filter chrome.
  const ownedCountForMeta = filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined;
  const filterMeta = useCatalogFilterMeta({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    view,
    ownedCountByPrinting: ownedCountForMeta,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
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
  const inCardsView = view === "cards";
  const scopeVariantsToSet = inCardsView && groupBy === "set";
  const findBy: "card" | "printing" = inCardsView && groupBy !== "set" ? "card" : "printing";

  // Tag the variant popover with the cell's setId in cards+set mode so the
  // popover can filter to in-set variants only.
  const handleOpenVariantsScoped = handleOpenVariants
    ? (printing: Printing, anchorEl: HTMLElement) =>
        handleOpenVariants(printing, anchorEl, scopeVariantsToSet)
    : undefined;

  // Deep-link: open a specific printing when navigating from e.g. activity page
  const { printingId: linkedPrintingId } = useSearch({ from: "/_app/cards" });
  useCardDeepLink({ linkedPrintingId, printingsById, items });

  // Cmd+K / Ctrl+K shortcut to open quick-add palette
  useEffect(() => {
    if (!inboxId) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [inboxId]);

  const handleGridCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    setTopPrintingOverrides((prev) => new Map(prev).set(printing.cardId, printing.id));
  };

  // Register row-action handlers in a no-subscribe store so virtualized rows
  // (table + grid) can dispatch via getState() without taking these unstable
  // closures as props. See card-row-actions-store.ts for the why. Re-register
  // on every render — the handlers close over per-render state (items,
  // findBy, mutation results) and we want rows to dispatch the freshest
  // implementation. Listing them as deps would just trigger re-runs anyway
  // since none are reference-stable.
  // In cards view, route minus to the variants popover when copies span
  // multiple owned variants — mouse-click does this in browser-card-cell.tsx;
  // mirroring it here keeps the keyboard `-` shortcut consistent.
  const handleSmartDecrement = handleUndoAdd
    ? (printing: Printing, anchorEl?: HTMLElement) => {
        if (inCardsView) {
          const allCardSiblings = printingsByCardId.get(printing.cardId);
          const ownedVariantCount =
            allCardSiblings?.filter((p) => (ownedCountByPrinting?.[p.id] ?? 0) > 0).length ?? 0;
          if (ownedVariantCount > 1 && handleOpenVariantsScoped && anchorEl) {
            handleOpenVariantsScoped(printing, anchorEl);
            return;
          }
        }
        void handleUndoAdd(printing, anchorEl);
      }
    : undefined;

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleGridCardClick,
      onSiblingClick: handleSiblingClick,
      onIncrement: handleQuickAdd,
      onDecrement: handleSmartDecrement,
      onOpenVariants: handleOpenVariantsScoped,
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

  const showStrip = isLoggedIn && catalogMode !== "off";

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const allCardSiblings = printingsByCardId.get(cardId);
    // Filter to in-set siblings when grouping by set so the variant chevron
    // and the override-by-cardId fallback don't cross set boundaries.
    const siblings =
      inCardsView && groupBy === "set"
        ? allCardSiblings?.filter((sibling) => sibling.setId === item.printing.setId)
        : allCardSiblings;

    const overrideId = inCardsView ? topPrintingOverrides.get(cardId) : undefined;
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    return (
      <BrowserCardCell
        printing={displayPrinting}
        siblings={inCardsView ? siblings : undefined}
        ctx={ctx}
        showImages={showImages}
        view={view}
        display={display}
        priceRange={priceRangeByCardId?.get(cardId)}
        showStrip={showStrip}
        showAddControls={isAddMode}
        inCardsView={inCardsView}
      />
    );
  };

  const catalogModeButton = isLoggedIn ? (
    <Button
      variant={catalogMode === "off" ? "outline" : "default"}
      size="icon"
      onClick={cycleCatalogMode}
      title={
        catalogMode === "off"
          ? "Show owned count"
          : catalogMode === "count"
            ? "Switch to add mode"
            : "Turn off"
      }
    >
      {catalogMode === "add" ? (
        <PackagePlusIcon className="size-4" />
      ) : (
        <PackageIcon className="size-4" />
      )}
    </Button>
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
      extras={catalogModeButton}
    />
  );

  const leftPane = <BrowserLeftPane />;

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
    />
  );

  return (
    <CardBrowserFilterProvider
      availableFilters={filterMeta.availableFilters}
      availableLanguages={filterMeta.availableLanguages}
      filterCounts={filterMeta.filterCounts}
      setDisplayLabel={filterMeta.setDisplayLabel}
      hiddenSections={hiddenFilterSections}
    >
      <BrowserCardViewer
        items={items}
        totalItems={allPrintings.length}
        renderCard={renderCard}
        setOrder={sets}
        groupBy={groupBy}
        groupDir={groupDir}
        deferredSortedCards={deferredSortedCards}
        printingsByCardId={printingsByCardId}
        view={view}
        stale={isGridStale}
        toolbar={toolbar}
        leftPane={leftPane}
        aboveGrid={<BrowserActiveFilters />}
        rightPane={rightPane}
        addStripHeight={showStrip ? ADD_STRIP_HEIGHT : undefined}
        table={{
          actionsColumn: showStrip ? (isAddMode ? "wide" : "narrow") : "none",
          renderActions: showStrip
            ? (printing) => (
                <CatalogTableActions
                  printing={printing}
                  isAddMode={isAddMode}
                  siblingIds={
                    isAddMode && view === "cards"
                      ? printingsByCardId.get(printing.cardId)?.map((sibling) => sibling.id)
                      : undefined
                  }
                />
              )
            : undefined,
        }}
      >
        {isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={searchAndClose}
          />
        )}
        {inboxId && (
          <QuickAddPalette
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            collectionId={inboxId}
            collectionName="Inbox"
            printingsByCardId={printingsByCardId}
            ownedCountByPrinting={ownedCountByPrinting}
          />
        )}
        {variantPopover &&
          handleQuickAdd &&
          handleUndoAdd &&
          tryUndoAdd &&
          (() => {
            const allCardPrintings = printingsByCardId.get(variantPopover.cardId);
            const variantPrintings = variantPopover.setId
              ? allCardPrintings?.filter((p) => p.setId === variantPopover.setId)
              : allCardPrintings;
            if (!variantPrintings) {
              return null;
            }
            return (
              <Popover
                open
                onOpenChange={(open, details) => {
                  if (open) {
                    return;
                  }
                  // ESC inside the dispose sub-page goes back to the variants
                  // list, mirroring how cmdk "pages" work. The popover stays
                  // mounted because `open` is hard-coded true; clearing
                  // variantDisposeTarget swaps the content back.
                  if (details.reason === "escape-key" && variantDisposeTarget) {
                    setVariantDisposeTarget(null);
                    return;
                  }
                  setVariantDisposeTarget(null);
                  closeVariants(
                    details.reason === "outside-press" ? details.event.target : undefined,
                  );
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
                        adjustedCount(p.id, ownedCountByPrinting?.[p.id] ?? 0),
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
                    disposeTarget={variantDisposeTarget}
                    onDisposePick={async (printing, collectionId) => {
                      await handleDisposeFromCollection(printing, collectionId);
                      setVariantDisposeTarget(null);
                    }}
                  />
                </PopoverContent>
              </Popover>
            );
          })()}
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
      </BrowserCardViewer>
    </CardBrowserFilterProvider>
  );
}
