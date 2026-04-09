import type { CardType, DeckZone, Printing, SuperType } from "@openrift/shared";
import { useDeferredValue, useEffect, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { DeckAddStrip } from "@/components/deck/deck-add-strip";
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
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { catalogCardToDeckBuilderCard, useDeckBuilderStore } from "@/stores/deck-builder-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

// Card types that live in dedicated zones and should never appear in main/sideboard/overflow
const DEDICATED_ZONE_TYPES = new Set<CardType>(["Legend", "Rune", "Battlefield"]);

/**
 * Build a map of domain → rune DeckBuilderCards from the full catalog.
 * @returns A map keyed by domain name, each value an array of rune cards in that domain.
 */
function buildRunesByDomain(allPrintings: Printing[]): Map<string, DeckBuilderCard[]> {
  const runesByDomain = new Map<string, DeckBuilderCard[]>();
  for (const entry of allPrintings) {
    if (entry.card.type !== "Rune") {
      continue;
    }
    const runeCard = catalogCardToDeckBuilderCard(entry.card);
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

// Per-zone forced filter overrides and which filter sections to hide from the UI
const ZONE_FILTER_CONFIG: Partial<
  Record<
    DeckZone,
    { types?: CardType[]; superTypes?: SuperType[]; hiddenSections: ReadonlySet<string> }
  >
> = {
  legend: { types: ["Legend"], hiddenSections: new Set(["types", "superTypes"]) },
  champion: { superTypes: ["Champion"], hiddenSections: new Set(["types", "superTypes"]) },
  runes: { types: ["Rune"], hiddenSections: new Set(["types", "superTypes"]) },
  battlefield: { types: ["Battlefield"], hiddenSections: new Set(["types", "superTypes"]) },
};

/**
 * Full card browser for the deck editor — reuses the same filter UI, search bar,
 * and card grid as the catalog browser. Clicking + on a card adds it to the active zone.
 * @returns The deck card browser view.
 */
export function DeckCardBrowser() {
  const showImages = useDisplayStore((state) => state.showImages);
  const { allPrintings, sets } = useCards();
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
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const addCard = useDeckBuilderStore((state) => state.addCard);
  const removeCard = useDeckBuilderStore((state) => state.removeCard);
  const setLegend = useDeckBuilderStore((state) => state.setLegend);
  const setRunesByDomain = useDeckBuilderStore((state) => state.setRunesByDomain);
  const activeZone = useDeckBuilderStore((state) => state.activeZone);
  const isSingleCardZone = activeZone === "legend" || activeZone === "champion";
  const zoneConfig = ZONE_FILTER_CONFIG[activeZone];
  const hiddenSections = zoneConfig?.hiddenSections;

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

  // Build runes-by-domain catalog map so rebalancing works even for loaded decks
  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    const map = buildRunesByDomain(allPrintings);
    setRunesByDomain(map);
  }, [allPrintings, setRunesByDomain]);

  // Merge zone-forced filters into URL filters
  const filters = {
    ...urlFilters,
    ...(zoneConfig?.types ? { types: zoneConfig.types } : {}),
    ...(zoneConfig?.superTypes ? { superTypes: zoneConfig.superTypes } : {}),
  };

  const deckCards = useDeckBuilderStore((state) => state.cards);
  const singleCardZoneOccupied =
    isSingleCardZone && deckCards.some((card) => card.zone === activeZone);

  // Build a map of cardId → total quantity across all zones
  const deckQuantityByCard = new Map<string, number>();
  for (const card of deckCards) {
    deckQuantityByCard.set(card.cardId, (deckQuantityByCard.get(card.cardId) ?? 0) + card.quantity);
  }

  // Always use "cards" view in deckbuilder — printings/copies modes don't apply
  const view = "cards" as const;
  const keywordReverseMap = useKeywordReverseMap();

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    languageFilter: useDisplayStore((s) => s.languages),
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting,
    favoriteMarketplace: marketplaceOrder[0] ?? "tcgplayer",
    keywordReverseMap,
  });

  // Client-side filtering for zones where the URL filter can't express the constraint:
  // 1. main/sideboard: all card domains must be within legend's domains (+ Colorless)
  // 2. main/sideboard/overflow: exclude types that belong in dedicated zones
  const legend = deckCards.find((card) => card.zone === "legend");
  const isOpenZone =
    activeZone === "main" || activeZone === "sideboard" || activeZone === "overflow";
  const allowedDomains = legend ? new Set([...legend.domains, "Colorless"]) : null;
  const strictDomainFilter =
    isOpenZone && (activeZone === "main" || activeZone === "sideboard") && allowedDomains;

  const filteredCards = sortedCards.filter((printing) => {
    if (
      strictDomainFilter &&
      !printing.card.domains.every((domain) => allowedDomains.has(domain))
    ) {
      return false;
    }
    if (isOpenZone && DEDICATED_ZONE_TYPES.has(printing.card.type)) {
      return false;
    }
    return true;
  });

  const deferredSortedCards = useDeferredValue(filteredCards);
  const isGridStale = deferredSortedCards !== filteredCards;

  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  const findBy = view === "cards" ? "card" : ("printing" as const);

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleQuickAdd = (printing: Printing, event?: React.MouseEvent) => {
    const builderCard = catalogCardToDeckBuilderCard(printing.card);

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

  const setQuantity = useDeckBuilderStore((state) => state.setQuantity);

  const handleRemove = (printing: Printing, event?: React.MouseEvent) => {
    const cardId = printing.card.id;

    // Shift+click removes all copies across all zones
    if (event?.shiftKey) {
      for (const card of deckCards) {
        if (card.cardId === cardId) {
          setQuantity(cardId, card.zone, 0);
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

  const isMaxReached = (cardId: string): boolean => {
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
      return runeTotal >= 12;
    }
    return (copyLimitTotalByCard.get(cardId) ?? 0) >= 3;
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.card.id;
    const ownedCount = ownedCounts?.get(item.printing.id) ?? 0;

    const deckQty = deckQuantityByCard.get(cardId) ?? 0;

    return (
      <CardThumbnail
        printing={item.printing}
        onClick={handleCardClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        highlighted={deckQty > 0}
        siblings={undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        dimmed={ownedCount === 0 && deckQty === 0}
        dragData={{ type: "browser-card", card: catalogCardToDeckBuilderCard(item.printing.card) }}
        dragId={`browser-card-${item.printing.id}`}
        showBanOverlay
        topSlot={
          <DeckAddStrip
            printing={item.printing}
            ownedCount={ownedCount}
            deckQuantity={deckQty}
            maxReached={isMaxReached(cardId)}
            addLabel={
              isSingleCardZone
                ? singleCardZoneOccupied && deckQty === 0
                  ? "Switch"
                  : "Choose"
                : undefined
            }
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
            setDisplayLabel={setDisplayLabel}
            hiddenSections={hiddenSections}
          />
        </MobileOptionsDrawer>
      </div>
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={hiddenSections}
      />
    </>
  );

  const leftPane = (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenSections}
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
      onItemClick={handleCardClick}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters
          availableFilters={availableFilters}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenSections}
        />
      }
      rightPane={rightPane}
      addStripHeight={ADD_STRIP_HEIGHT}
    />
  );
}
