import type { CardType, DeckZone, Printing, SuperType } from "@openrift/shared";
import { useDeferredValue } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { DeckAddStrip } from "@/components/deck/deck-add-strip";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  FilterBadgeSections,
  FilterPanelContent,
  FilterRangeSections,
} from "@/components/filters/filter-panel-content";
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
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { catalogCardToDeckBuilderCard, useDeckBuilderStore } from "@/stores/deck-builder-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

// Card types that live in dedicated zones and should never appear in main/sideboard/overflow
const DEDICATED_ZONE_TYPES = new Set<CardType>(["Legend", "Rune", "Battlefield"]);

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

  const { filters: urlFilters, sortBy, sortDir, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const addCard = useDeckBuilderStore((state) => state.addCard);
  const removeCard = useDeckBuilderStore((state) => state.removeCard);
  const setLegend = useDeckBuilderStore((state) => state.setLegend);
  const activeZone = useDeckBuilderStore((state) => state.activeZone);
  const addLabel =
    activeZone === "legend" || activeZone === "champion" || activeZone === "battlefield"
      ? "Choose"
      : undefined;
  const zoneConfig = ZONE_FILTER_CONFIG[activeZone];
  const hiddenSections = zoneConfig?.hiddenSections;

  // Merge zone-forced filters into URL filters
  const filters = {
    ...urlFilters,
    ...(zoneConfig?.types ? { types: zoneConfig.types } : {}),
    ...(zoneConfig?.superTypes ? { superTypes: zoneConfig.superTypes } : {}),
  };

  const deckCards = useDeckBuilderStore((state) => state.cards);

  // Build a map of cardId → total quantity across all zones
  const deckQuantityByCard = new Map<string, number>();
  for (const card of deckCards) {
    deckQuantityByCard.set(card.cardId, (deckQuantityByCard.get(card.cardId) ?? 0) + card.quantity);
  }

  // Always use "cards" view in deckbuilder — printings/copies modes don't apply
  const view = "cards" as const;

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
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting,
    favoriteMarketplace: marketplaceOrder[0] ?? "tcgplayer",
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

  const handleQuickAdd = (printing: Printing) => {
    const builderCard = catalogCardToDeckBuilderCard(printing.card);

    if (activeZone === "legend") {
      // Build runes-by-domain map from catalog for auto-populate
      const runesByDomain = new Map<string, DeckBuilderCard[]>();
      for (const entry of allPrintings) {
        if (entry.card.type !== "Rune") {
          continue;
        }
        // Deduplicate by card ID (only need one printing per card)
        for (const domain of entry.card.domains) {
          const list = runesByDomain.get(domain);
          const runeCard = catalogCardToDeckBuilderCard(entry.card);
          if (list) {
            if (!list.some((existing) => existing.cardId === runeCard.cardId)) {
              list.push(runeCard);
            }
          } else {
            runesByDomain.set(domain, [runeCard]);
          }
        }
      }
      setLegend(builderCard, runesByDomain);
    } else {
      addCard(builderCard, activeZone);
    }
  };

  const handleRemove = (printing: Printing) => {
    // Remove from the active zone first, then try other zones
    const cardId = printing.card.id;
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
      return deckCards.some((card) => card.zone === activeZone);
    }
    if (activeZone === "battlefield") {
      return deckCards.some((card) => card.cardId === cardId && card.zone === "battlefield");
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
            addLabel={addLabel}
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
      <div className="@wide:hidden hidden space-y-3 sm:block">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <FilterBadgeSections
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={hiddenSections}
          />
        </div>
        <div className="grid grid-cols-4 gap-x-6 gap-y-3">
          <FilterRangeSections availableFilters={availableFilters} />
        </div>
      </div>
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
