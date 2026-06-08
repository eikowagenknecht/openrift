import type { Printing } from "@openrift/shared";
import { useSearch } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useEffect, useDeferredValue } from "react";

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
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import { useCardData, useCatalogFilterMeta } from "@/hooks/use-card-data";
import { useCardDeepLink } from "@/hooks/use-card-deep-link";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession } from "@/lib/auth-session";
import { maxOwnedCount } from "@/lib/owned-bucket";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
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
 * Provides filters, search, and a card detail pane — no collection or add-mode features.
 * @returns The catalog browser view.
 */
export function CardBrowser() {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const cardsShowCounts = useDisplayStore((s) => s.cardsShowCounts);
  const toggleCardsShowCounts = useDisplayStore((s) => s.toggleCardsShowCounts);
  const { allPrintings, printingsById, sets } = useCards();
  const channels = useChannelRegistry();
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);

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
      keywordReverseMap,
      channels,
    });

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
  const findBy: "card" | "printing" = inCardsView && groupBy !== "set" ? "card" : "printing";

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

  // Register row-action handlers in a no-subscribe store so virtualized rows
  // (table + grid) can dispatch via getState() without taking these unstable
  // closures as props. See card-row-actions-store.ts for the why. Re-register
  // on every render — the handlers close over per-render state (items, findBy)
  // and we want rows to dispatch the freshest implementation.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleGridCardClick,
      onSiblingClick: handleSiblingClick,
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

  const showStrip = isLoggedIn && cardsShowCounts;

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const allCardSiblings = printingsByCardId.get(cardId);
    // Filter to in-set siblings when grouping by set so the variant chevron
    // and the override-by-cardId fallback don't cross set boundaries.
    const siblings =
      inCardsView && groupBy === "set"
        ? allCardSiblings?.filter((sibling) => sibling.setId === item.printing.setId)
        : allCardSiblings;

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
        inCardsView={inCardsView}
      />
    );
  };

  const showCountsButton = isLoggedIn ? (
    <Button
      variant={cardsShowCounts ? "default" : "outline"}
      size="icon"
      onClick={toggleCardsShowCounts}
      title={cardsShowCounts ? "Hide owned count" : "Show owned count"}
      aria-label={cardsShowCounts ? "Hide owned count" : "Show owned count"}
      aria-pressed={cardsShowCounts}
    >
      <PackageIcon className="size-4" />
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
      extras={showCountsButton}
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
      ownedCountMax={ownedCountBound}
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
          actionsColumn: showStrip ? "narrow" : "none",
          actionsCell: showStrip ? (
            <CatalogActionsCell view={view} printingsByCardId={printingsByCardId} />
          ) : undefined,
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
      </BrowserCardViewer>
    </CardBrowserFilterProvider>
  );
}
