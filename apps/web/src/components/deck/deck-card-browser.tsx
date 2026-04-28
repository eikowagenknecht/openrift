import type { DeckZone, Marketplace, Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { useDeferredValue, useEffect, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { DeckAddStrip } from "@/components/deck/deck-add-strip";
import { DeckCardDetailMenu } from "@/components/deck/deck-card-detail-menu";
import { DeckOverview } from "@/components/deck/deck-overview";
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
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { canAddRune, useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { catalogCardToDeckBuilderCard } from "@/lib/deck-builder-card";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

/**
 * Build a map of domain → rune DeckBuilderCards from the full catalog.
 * @returns A map keyed by domain name, each value an array of rune cards in that domain.
 */
export function buildRunesByDomain(allPrintings: Printing[]): Map<string, DeckBuilderCard[]> {
  const runesByDomain = new Map<string, DeckBuilderCard[]>();
  for (const entry of allPrintings) {
    if (entry.card.type !== "Rune") {
      continue;
    }
    const runeCard = catalogCardToDeckBuilderCard(entry.cardId, entry.card);
    for (const domain of entry.card.domains) {
      const list = runesByDomain.get(domain);
      if (list) {
        if (!list.some((existing) => existing.cardId === runeCard.cardId)) {
          list.push(runeCard);
        }
      } else {
        runesByDomain.set(domain, [runeCard]);
      }
    }
  }
  return runesByDomain;
}

interface DeckCardBrowserProps {
  deckId: string;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  onZoneClick: (zone: DeckZone) => void;
  onViewMissing: () => void;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
}

/**
 * Full card browser for the deck editor — reuses the same filter UI, search bar,
 * and card grid as the catalog browser. Clicking + on a card adds it to the active zone.
 * Renders the deck overview dashboard when no zone is selected.
 * @returns The deck card browser view, or the deck overview if no zone is active.
 */
export function DeckCardBrowser({
  deckId,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
}: DeckCardBrowserProps) {
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);

  if (!activeZone) {
    return (
      <DeckOverviewForEditor
        deckId={deckId}
        ownershipData={ownershipData}
        marketplace={marketplace}
        onZoneClick={onZoneClick}
        onViewMissing={onViewMissing}
        onHoverCard={onHoverCard}
      />
    );
  }

  return <DeckCardBrowserInner deckId={deckId} />;
}

function DeckOverviewForEditor({
  deckId,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
}: DeckCardBrowserProps) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const cards = useDeckCards(deckId);
  const { getPreferredFrontImage } = usePreferredPrinting();
  return (
    <DeckOverview
      deck={{ id: deckId, name: deckDetail.deck.name, format: deckDetail.deck.format }}
      cards={cards}
      ownershipData={ownershipData}
      marketplace={marketplace}
      getThumbnail={(cardId, preferredPrintingId) => {
        const id = getPreferredFrontImage(cardId, preferredPrintingId)?.imageId;
        return id ? imageUrl(id, "400w") : undefined;
      }}
      onZoneClick={onZoneClick}
      onViewMissing={onViewMissing}
      onHoverCard={onHoverCard}
    />
  );
}

function DeckCardBrowserInner({ deckId }: { deckId: string }) {
  const showImages = useDisplayStore((state) => state.showImages);
  const isMobile = useIsMobile();
  const { allPrintings, sets } = useCards();
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const {
    filters: urlFilters,
    sortBy,
    sortDir,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  const { setSearch } = useFilterActions();
  const { addCard, removeCard, setLegend, setQuantity } = useDeckBuilderActions(deckId);
  // Wrapper only renders this component when activeZone is set
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone) as DeckZone;
  const isSingleCardZone = activeZone === "legend" || activeZone === "champion";

  // Track Shift key for "add max" visual hint
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(false);
      }
    };
    globalThis.addEventListener("keydown", down);
    globalThis.addEventListener("keyup", up);
    return () => {
      globalThis.removeEventListener("keydown", down);
      globalThis.removeEventListener("keyup", up);
    };
  }, []);

  const deckCards = useDeckCards(deckId);
  const singleCardZoneOccupied =
    isSingleCardZone && deckCards.some((card) => card.zone === activeZone);

  const filters = urlFilters;

  // Always use "cards" view in deckbuilder — printings/copies modes don't apply
  const view = "cards" as const;
  const keywordReverseMap = useKeywordReverseMap();

  // Deck builder can be toggled to show only owned cards — same reasoning as
  // the collection view: auto-seeding EN would silently hide owned cards in
  // other languages. Users who want to narrow by language use the Language
  // section in the filter panel.
  const {
    availableFilters,
    availableLanguages,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    sortBy,
    sortDir,
    view,
    groupBy,
    ownedCountByPrinting,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
  });

  const filteredCards = sortedCards;

  const deferredSortedCards = useDeferredValue(filteredCards);
  const isGridStale = deferredSortedCards !== filteredCards;

  // Build a map of cardId → total quantity across all zones
  const deckQuantityByCard = new Map<string, number>();
  for (const card of deckCards) {
    deckQuantityByCard.set(card.cardId, (deckQuantityByCard.get(card.cardId) ?? 0) + card.quantity);
  }

  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  // Match useCardData: in cards+set the grid renders one cell per printing,
  // so click selection navigates by printing too.
  const cellRepresentsCard = view === "cards" && groupBy !== "set";
  const findBy: "card" | "printing" = cellRepresentsCard ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleQuickAdd = (printing: Printing, event?: React.MouseEvent) => {
    const builderCard = catalogCardToDeckBuilderCard(printing.cardId, printing.card);

    if (activeZone === "legend") {
      setLegend(builderCard, buildRunesByDomain(allPrintings));
    } else {
      // Shift+click adds up to the zone maximum in one action
      const count = event?.shiftKey
        ? activeZone === "runes"
          ? Math.max(0, 12 - runeTotal)
          : 3
        : undefined;
      addCard(builderCard, activeZone, count);
    }
  };

  const handleRemove = (printing: Printing, event?: React.MouseEvent) => {
    const cardId = printing.cardId;

    // Shift+click removes all copies across all zones (every printing row)
    if (event?.shiftKey) {
      for (const card of deckCards) {
        if (card.cardId === cardId) {
          setQuantity(cardId, card.zone, 0, card.preferredPrintingId);
        }
      }
      return;
    }

    // Remove from the active zone first, then try other zones
    const inActiveZone = deckCards.find(
      (card) => card.cardId === cardId && card.zone === activeZone,
    );
    if (inActiveZone) {
      removeCard(cardId, activeZone);
    } else {
      // Find any zone this card is in and remove from there
      const anywhere = deckCards.find((card) => card.cardId === cardId);
      if (anywhere) {
        removeCard(cardId, anywhere.zone);
      }
    }
  };

  // Compute cross-zone totals for copy limit zones (main + sideboard + overflow)
  const copyLimitTotalByCard = new Map<string, number>();
  for (const card of deckCards) {
    if (card.zone === "main" || card.zone === "sideboard" || card.zone === "overflow") {
      copyLimitTotalByCard.set(
        card.cardId,
        (copyLimitTotalByCard.get(card.cardId) ?? 0) + card.quantity,
      );
    }
  }

  const runeTotal = deckCards
    .filter((card) => card.zone === "runes")
    .reduce((sum, card) => sum + card.quantity, 0);

  const isMaxReached = (item: CardViewerItem): boolean => {
    const cardId = item.printing.cardId;
    if (activeZone === "legend" || activeZone === "champion") {
      return deckCards.some((card) => card.cardId === cardId && card.zone === activeZone);
    }
    if (activeZone === "battlefield") {
      const alreadyInZone = deckCards.some(
        (card) => card.cardId === cardId && card.zone === "battlefield",
      );
      const zoneFull = deckCards.filter((card) => card.zone === "battlefield").length >= 3;
      return alreadyInZone || zoneFull;
    }
    if (activeZone === "runes") {
      return !canAddRune(catalogCardToDeckBuilderCard(cardId, item.printing.card), deckCards);
    }
    return (copyLimitTotalByCard.get(cardId) ?? 0) >= 3;
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const ownedCount = ownedCounts?.get(item.printing.id) ?? 0;

    const deckQty = deckQuantityByCard.get(cardId) ?? 0;

    // On mobile, a tap adds the card (no hover to reach the + button);
    // long-press (or desktop right-click) opens the detail view via the context menu.
    const thumbnail = (
      <CardThumbnail
        printing={item.printing}
        onClick={isMobile ? handleQuickAdd : handleCardClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        highlighted={deckQty > 0}
        siblings={undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        display={display}
        dimmed={ownedCount === 0 && deckQty === 0}
        dragData={{
          type: "browser-card",
          card: catalogCardToDeckBuilderCard(item.printing.cardId, item.printing.card),
        }}
        dragId={`browser-card-${item.printing.id}`}
        showBanOverlay
        topSlot={
          <DeckAddStrip
            printing={item.printing}
            ownedCount={ownedCount}
            deckQuantity={deckQty}
            maxReached={isMaxReached(item)}
            addLabel={
              isSingleCardZone
                ? singleCardZoneOccupied && deckQty === 0
                  ? "Switch"
                  : "Choose"
                : undefined
            }
            removeLabel={isSingleCardZone && deckQty > 0 ? "Remove" : undefined}
            shiftHeld={shiftHeld}
            remainingCount={
              activeZone === "runes"
                ? Math.max(0, 12 - runeTotal)
                : 3 - (copyLimitTotalByCard.get(cardId) ?? 0)
            }
            onQuickAdd={handleQuickAdd}
            onRemove={handleRemove}
          />
        }
      />
    );

    return (
      <DeckCardDetailMenu onViewDetail={() => handleCardClick(item.printing)}>
        {thumbnail}
      </DeckCardDetailMenu>
    );
  };

  const toolbar = (
    <>
      <div className="mb-3 flex items-start gap-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" hideViewToggle />
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <MobileOptionsDrawer
          doneLabel={hasActiveFilters ? `Show ${sortedCards.length} cards` : undefined}
          className="sm:hidden"
        >
          <MobileOptionsContent />
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

  const rightPane = (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={setSearch}
    />
  );

  return (
    <BrowserCardViewer
      items={items}
      totalItems={allPrintings.length}
      renderCard={renderCard}
      setOrder={sets}
      deferredSortedCards={deferredSortedCards}
      printingsByCardId={printingsByCardId}
      view={view}
      groupBy={groupBy}
      groupDir={groupDir}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      rightPane={rightPane}
      addStripHeight={ADD_STRIP_HEIGHT}
    >
      {isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={setSearch}
        />
      )}
    </BrowserCardViewer>
  );
}
