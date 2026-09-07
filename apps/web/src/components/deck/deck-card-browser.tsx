import { copyLimitFor } from "@openrift/shared/deck-rules";
import { imageUrl } from "@openrift/shared/image-url";
import type { DeckResponse } from "@openrift/shared/types/api/deck";
import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";
import { Suspense, useDeferredValue, useEffect, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { useGridKeyboardNav } from "@/components/cards/use-grid-keyboard-nav";
import { DeckAddStrip } from "@/components/deck/deck-add-strip";
import { DeckCardDetailMenu } from "@/components/deck/deck-card-detail-menu";
import { DeckOverview } from "@/components/deck/deck-overview";
import { DeckPlanEditor } from "@/components/deck/deck-plan-editor";
import { DeckTableActions } from "@/components/deck/deck-table-actions";
import { FormatTagPickBanner, needsFormatTagPick } from "@/components/deck/format-tag-pick-banner";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import { useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import { useDeckItems } from "@/hooks/use-deck-items";
import { useDeckDetail, useUpdateDeck } from "@/hooks/use-decks";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useRowActionHandlers } from "@/hooks/use-row-action-handlers";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession } from "@/lib/auth-session";
import { ADD_STRIP_HEIGHT } from "@/lib/card-grid-constants";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import { splitsCardIntoTiles } from "@/lib/card-tiles";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  buildDeckQuantityByCell,
  canAddRune,
  catalogCardToDeckBuilderCard,
  cellPreferredPrintingId,
  RUNE_TARGET,
} from "@/lib/deck-builder-card";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import { buildRunesByDomain } from "@/lib/deck-runes-by-domain";
import { getFormatTagConfig } from "@/lib/format-tag-config";
import { isLocalDeckId } from "@/lib/local-deck";
import { maxOwnedCount } from "@/lib/owned-bucket";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

function copyRemainderFor(
  card: { maxCopiesOverride: number | null },
  total: number,
): number | undefined {
  const limit = copyLimitFor(card);
  return Number.isFinite(limit) ? limit - total : undefined;
}

interface DeckActionsCellProps {
  printing?: Printing;
  view: "cards" | "printings";
  deckQuantityByCard: Map<string, number>;
  deckQuantityByCell: Map<string, number>;
  isSingleCardZone: boolean;
  singleCardZoneOccupied: boolean;
  deckCards: { cardId: string; zone: DeckZone }[];
  activeZone: DeckZone;
  isMaxReached: (item: CardViewerItem) => boolean;
  shiftHeld: boolean;
  runeTotal: number;
  copyLimitTotalByCard: Map<string, number>;
  handleQuickAdd: (printing: Printing, event: { shiftKey?: boolean }) => void;
  handleRemove: (printing: Printing, event: { shiftKey?: boolean }) => void;
}

function DeckActionsCell({
  printing,
  view,
  deckQuantityByCard,
  deckQuantityByCell,
  isSingleCardZone,
  singleCardZoneOccupied,
  deckCards,
  activeZone,
  isMaxReached,
  shiftHeld,
  runeTotal,
  copyLimitTotalByCard,
  handleQuickAdd,
  handleRemove,
}: DeckActionsCellProps) {
  if (!printing) {
    return null;
  }
  const cardId = printing.cardId;
  const deckQty =
    view === "printings"
      ? (deckQuantityByCell.get(printing.id) ?? 0)
      : (deckQuantityByCard.get(cardId) ?? 0);
  const isInActiveSingleZone =
    isSingleCardZone &&
    deckCards.some((card) => card.cardId === cardId && card.zone === activeZone);
  return (
    <DeckTableActions
      printing={printing}
      deckQuantity={deckQty}
      maxReached={isMaxReached({ id: printing.id, printing })}
      addLabel={
        isSingleCardZone
          ? singleCardZoneOccupied && !isInActiveSingleZone
            ? "Switch"
            : "Choose"
          : undefined
      }
      removeLabel={isInActiveSingleZone ? "Remove" : undefined}
      shiftHeld={shiftHeld}
      remainingCount={
        activeZone === WellKnown.deckZone.RUNES
          ? Math.max(0, RUNE_TARGET - runeTotal)
          : copyRemainderFor(printing.card, copyLimitTotalByCard.get(cardId) ?? 0)
      }
      onQuickAdd={handleQuickAdd}
      onRemove={handleRemove}
    />
  );
}

interface DeckCardBrowserProps {
  deckId: string;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  onZoneClick: (zone: DeckZone) => void;
  onViewMissing: () => void;
  onHoverCard?: HoverHandler;
  onOverviewCardClick: (card: CardOpenTarget) => void;
  onEditDescription?: () => void;
  variantRailSlot?: React.ReactNode;
}

export function DeckCardBrowser({
  deckId,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
  onOverviewCardClick,
  onEditDescription,
  variantRailSlot,
}: DeckCardBrowserProps) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const { filters } = useFilterValues();
  // Must stay here, not the inner browser: mounting per-zone would re-seed
  // and undo a user who cleared the language filter.
  useSeedLanguagesFromPrefs(filters.languages);

  if (needsFormatTagPick(deckDetail.deck)) {
    // pt-3 matches deck-overview's root so the banner isn't flush against the sticky bar.
    return (
      <div className="pt-3">
        <FormatTagPickBanner deck={deckDetail.deck} />
      </div>
    );
  }

  if (!activeZone) {
    return (
      <DeckOverviewForEditor
        deck={deckDetail.deck}
        ownershipData={ownershipData}
        marketplace={marketplace}
        onZoneClick={onZoneClick}
        onViewMissing={onViewMissing}
        onHoverCard={onHoverCard}
        onCardClick={onOverviewCardClick}
        onEditDescription={onEditDescription}
        variantRailSlot={variantRailSlot}
      />
    );
  }

  return <DeckCardBrowserInner deckId={deckId} />;
}

const EMPTY_SIBLINGS: Printing[] = [];

function DeckOverviewForEditor({
  deck,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
  onCardClick,
  onEditDescription,
  variantRailSlot,
}: Omit<DeckCardBrowserProps, "deckId" | "onOverviewCardClick"> & {
  deck: DeckResponse;
  onCardClick: (card: CardOpenTarget) => void;
}) {
  const cards = useDeckCards(deck.id);
  const customTagAssignments = useCustomTagAssignments();
  const { getPreferredFrontImage } = usePreferredPrinting();
  const updateDeck = useUpdateDeck();
  const isLocal = isLocalDeckId(deck.id);

  // Mirrors the parent editor's deckItems so arrow-key nav and the detail
  // pane's prev/next walk the same dedup'd visual-order list on both paths.
  const { items, printingsByCardId } = useDeckItems(cards);
  const selectedCard = useSelectionStore((state) => state.selectedCard);
  const siblingPrintings = selectedCard
    ? (printingsByCardId.get(selectedCard.cardId) ?? EMPTY_SIBLINGS)
    : EMPTY_SIBLINGS;
  useGridKeyboardNav({ items, siblingPrintings });

  return (
    <div className="flex flex-col">
      <DeckOverview
        deck={{
          id: deck.id,
          name: deck.name,
          format: deck.format,
          formatConfig: deck.formatConfig,
          coverCardId: deck.coverCardId,
          coverPrintingId: deck.coverPrintingId,
          coverPosition: deck.coverPosition,
          links: deck.links,
          collectionId: deck.collectionId,
        }}
        cards={cards}
        customTagAssignments={customTagAssignments}
        ownershipData={ownershipData}
        marketplace={marketplace}
        getThumbnail={(cardId, preferredPrintingId) => {
          const id = getPreferredFrontImage(cardId, preferredPrintingId)?.imageId;
          return id ? imageUrl(id, "400w") : undefined;
        }}
        onZoneClick={onZoneClick}
        onViewMissing={onViewMissing}
        onHoverCard={onHoverCard}
        onCardClick={onCardClick}
        description={deck.description ?? undefined}
        onEditDescription={onEditDescription}
        variantRailSlot={variantRailSlot}
        oddsConfig={isLocal ? undefined : (deck.oddsConfig ?? null)}
        onSaveOddsConfig={
          isLocal
            ? undefined
            : (config) => updateDeck.mutate({ deckId: deck.id, oddsConfig: config })
        }
        planSlot={
          isLocal ? undefined : (
            <Suspense fallback={<div className="text-muted-foreground p-4">Loading plan…</div>}>
              <DeckPlanEditor
                deckId={deck.id}
                deckCards={cards}
                format={deck.format}
                onHoverCard={onHoverCard}
              />
            </Suspense>
          )
        }
      />
    </div>
  );
}

function DeckCardBrowserInner({ deckId }: { deckId: string }) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const showImages = useDisplayStore((state) => state.showImages);
  const isMobile = useIsMobile();
  const { allPrintings, sets } = useCards();
  const channels = useChannelRegistry();
  const customTagAssignments = useCustomTagAssignments();
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  // The grid's "owned" badge reflects deck-available copies only: copies in
  // collections excluded from deck building don't feed the deck, except the
  // deck's own home collection.
  const { data: deckCounts } = useDeckBuildingCounts(
    Boolean(session?.user),
    deckDetail.deck.collectionId,
  );
  const ownedCountByPrinting = deckCounts?.available;

  const {
    filters: urlFilters,
    sortBy,
    sortDir,
    view: rawView,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  const { setSearch } = useFilterActions();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { addCard, removeCard, setLegend, setQuantity } = useDeckBuilderActions(deckId);
  const isFreeform = deckDetail.deck.format === WellKnown.deckFormat.FREEFORM;
  const isCustomRegion = deckDetail.deck.format === WellKnown.deckFormat.CUSTOM_REGION;
  const formatTagConfig = getFormatTagConfig(deckDetail.deck.format);
  const visibleCustomTagCategories: ReadonlySet<string> | undefined = formatTagConfig
    ? new Set([formatTagConfig.category])
    : undefined;
  // The wrapper only renders this component when activeZone is set.
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone) as DeckZone;
  const isSingleCardZone =
    !isFreeform &&
    (activeZone === WellKnown.deckZone.LEGEND || activeZone === WellKnown.deckZone.CHAMPION);

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

  // "copies" is a collection-only view; clamp to "printings" in the deck builder.
  const view = rawView === "copies" ? "printings" : rawView;
  const keywordReverseMap = useKeywordReverseMap();

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
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    sortBy,
    sortDir,
    view,
    groupBy,
    ownedCountByPrinting,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
    customTagAssignments,
  });

  const ownedCountBound = maxOwnedCount(
    allPrintings,
    ownedCountByPrinting ?? {},
    view === "printings" ? "printing" : "card",
  );

  const filteredCards = sortedCards;

  const deferredCards = useDeferredValue(filteredCards);
  const isGridStale = deferredCards !== filteredCards;

  const deckQuantityByCard = new Map<string, number>();
  for (const card of deckCards) {
    deckQuantityByCard.set(card.cardId, (deckQuantityByCard.get(card.cardId) ?? 0) + card.quantity);
  }

  const deckQuantityByCell = buildDeckQuantityByCell(
    deckCards,
    (cardId) => getPreferredPrinting(cardId)?.id,
  );
  const deckQtyForCell = (printing: Printing): number =>
    view === "printings"
      ? (deckQuantityByCell.get(printing.id) ?? 0)
      : (deckQuantityByCard.get(printing.cardId) ?? 0);

  const items: CardViewerItem[] = deferredCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  // Must match useCardData's tile-splitting: when it renders one cell per
  // printing, click selection has to navigate by printing too.
  const cellRepresentsCard = view === "cards" && !splitsCardIntoTiles(groupBy);
  const findBy: "card" | "printing" = cellRepresentsCard ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  // `event` is a structural `{ shiftKey?: boolean }` so the table path can
  // synthesize the bit it cares about without faking a full React.MouseEvent.
  const handleQuickAdd = (printing: Printing, event?: { shiftKey?: boolean }) => {
    const builderCard: DeckBuilderCard = {
      ...catalogCardToDeckBuilderCard(printing.cardId, printing.card),
      preferredPrintingId: cellPreferredPrintingId(
        view,
        printing.id,
        getPreferredPrinting(printing.cardId)?.id,
      ),
    };

    if (activeZone === WellKnown.deckZone.LEGEND && !isFreeform) {
      setLegend(builderCard, buildRunesByDomain(allPrintings));
    } else {
      const count = event?.shiftKey
        ? isFreeform
          ? 3
          : activeZone === WellKnown.deckZone.RUNES
            ? Math.max(0, RUNE_TARGET - runeTotal)
            : 3
        : undefined;
      addCard(builderCard, activeZone, count);
    }
  };

  const handleRemove = (printing: Printing, event?: { shiftKey?: boolean }) => {
    const cardId = printing.cardId;
    const cellPrintingId =
      view === "printings"
        ? cellPreferredPrintingId(view, printing.id, getPreferredPrinting(cardId)?.id)
        : undefined;
    const matchesCell = (card: DeckBuilderCard): boolean =>
      card.cardId === cardId &&
      (cellPrintingId === undefined || card.preferredPrintingId === cellPrintingId);

    if (event?.shiftKey) {
      for (const card of deckCards) {
        if (matchesCell(card)) {
          setQuantity(card.cardId, card.zone, 0, card.preferredPrintingId);
        }
      }
      return;
    }

    const inActiveZone = deckCards.find((card) => matchesCell(card) && card.zone === activeZone);
    if (inActiveZone) {
      removeCard(cardId, activeZone, cellPrintingId);
    } else {
      const anywhere = deckCards.find((card) => matchesCell(card));
      if (anywhere) {
        removeCard(cardId, anywhere.zone, cellPrintingId);
      }
    }
  };

  // Overflow is excluded: it's a free parking zone, so its copies don't count
  // toward the 3-copy cap that disables the browser's add button.
  const copyLimitTotalByCard = new Map<string, number>();
  for (const card of deckCards) {
    if (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.SIDEBOARD) {
      copyLimitTotalByCard.set(
        card.cardId,
        (copyLimitTotalByCard.get(card.cardId) ?? 0) + card.quantity,
      );
    }
  }

  const runeTotal = deckCards
    .filter((card) => card.zone === WellKnown.deckZone.RUNES)
    .reduce((sum, card) => sum + card.quantity, 0);

  useRowActionHandlers("deck", {
    onRowClick: handleCardClick,
  });

  const isMaxReached = (item: CardViewerItem): boolean => {
    if (isFreeform) {
      return false;
    }
    const cardId = item.printing.cardId;
    if (activeZone === WellKnown.deckZone.LEGEND || activeZone === WellKnown.deckZone.CHAMPION) {
      return deckCards.some((card) => card.cardId === cardId && card.zone === activeZone);
    }
    if (activeZone === WellKnown.deckZone.BATTLEFIELD) {
      const alreadyInZone = deckCards.some(
        (card) => card.cardId === cardId && card.zone === WellKnown.deckZone.BATTLEFIELD,
      );
      const battlefieldCap = isCustomRegion ? 1 : 3;
      const zoneFull =
        deckCards.filter((card) => card.zone === WellKnown.deckZone.BATTLEFIELD).length >=
        battlefieldCap;
      return alreadyInZone || zoneFull;
    }
    if (activeZone === WellKnown.deckZone.RUNES) {
      return !canAddRune(catalogCardToDeckBuilderCard(cardId, item.printing.card), deckCards);
    }
    if (activeZone === WellKnown.deckZone.OVERFLOW) {
      // Free parking zone — never capped.
      return false;
    }
    return (copyLimitTotalByCard.get(cardId) ?? 0) >= copyLimitFor(item.printing.card);
  };

  // Extracted so the detail overlay can show the same add controls for the
  // card it covers.
  const deckStripFor = (printing: Printing) => {
    const cardId = printing.cardId;
    const deckQty = deckQtyForCell(printing);
    // Keys off "in the active zone", not "anywhere in the deck": a champion
    // unit can sit in main as regular copies without being the chosen champion.
    const isInActiveSingleZone =
      isSingleCardZone &&
      deckCards.some((card) => card.cardId === cardId && card.zone === activeZone);

    return (
      <DeckAddStrip
        printing={printing}
        ownedCount={ownedCounts?.get(printing.id) ?? 0}
        deckQuantity={deckQty}
        maxReached={isMaxReached({ id: printing.id, printing })}
        addLabel={
          isSingleCardZone
            ? singleCardZoneOccupied && !isInActiveSingleZone
              ? "Switch"
              : "Choose"
            : undefined
        }
        removeLabel={isInActiveSingleZone ? "Remove" : undefined}
        shiftHeld={shiftHeld}
        remainingCount={
          isFreeform
            ? undefined
            : activeZone === WellKnown.deckZone.RUNES
              ? Math.max(0, RUNE_TARGET - runeTotal)
              : copyRemainderFor(printing.card, copyLimitTotalByCard.get(cardId) ?? 0)
        }
        onQuickAdd={handleQuickAdd}
        onRemove={handleRemove}
      />
    );
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const ownedCount = ownedCounts?.get(item.printing.id) ?? 0;
    const deckQty = deckQtyForCell(item.printing);

    return (
      <CardCell
        printing={item.printing}
        ctx={ctx}
        display={display}
        showImages={showImages}
        view={view}
        onClick={isMobile ? handleQuickAdd : handleCardClick}
        priceRange={priceRangeByCardId?.get(cardId)}
        dimmed={ownedCount === 0 && deckQty === 0}
        highlighted={deckQty > 0}
        showBanOverlay
        hideBanIndicators={isCustomRegion}
        dragData={{
          type: "browser-card",
          card: {
            ...catalogCardToDeckBuilderCard(item.printing.cardId, item.printing.card),
            preferredPrintingId: cellPreferredPrintingId(
              view,
              item.printing.id,
              getPreferredPrinting(cardId)?.id,
            ),
          },
        }}
        dragId={`browser-card-${item.printing.id}`}
        strip={deckStripFor(item.printing)}
        contextMenu={<DeckCardDetailMenu onViewDetail={() => handleCardClick(item.printing)} />}
      />
    );
  };

  const toolbar = (
    <BrowserToolbar
      totalCards={totalUniqueCards}
      filteredCount={sortedCards.length}
      mobileDoneLabel={hasActiveFilters ? `Show ${sortedCards.length} cards` : undefined}
    />
  );

  const rightPane = (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={setSearch}
      actions={deckStripFor}
    />
  );

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      setDisplayLabel={setDisplayLabel}
      visibleCustomTagCategories={visibleCustomTagCategories}
      ownedCountMax={ownedCountBound}
    >
      <BrowserCardViewer
        items={items}
        totalItems={allPrintings.length}
        renderCard={renderCard}
        setOrder={sets}
        renderedCards={deferredCards}
        printingsByCardId={printingsByCardId}
        view={view}
        groupBy={groupBy}
        groupDir={groupDir}
        stale={isGridStale}
        toolbar={toolbar}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          actionsColumn: "wide",
          actionsLabel: "Deck",
          actionsCell: (
            <DeckActionsCell
              view={view}
              deckQuantityByCard={deckQuantityByCard}
              deckQuantityByCell={deckQuantityByCell}
              isSingleCardZone={isSingleCardZone}
              singleCardZoneOccupied={singleCardZoneOccupied}
              deckCards={deckCards}
              activeZone={activeZone}
              isMaxReached={isMaxReached}
              shiftHeld={shiftHeld}
              runeTotal={runeTotal}
              copyLimitTotalByCard={copyLimitTotalByCard}
              handleQuickAdd={handleQuickAdd}
              handleRemove={handleRemove}
            />
          ),
        }}
      >
        <SelectionDetailOverlays
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={setSearch}
          actions={deckStripFor}
        />
      </BrowserCardViewer>
    </CardBrowserFilterProvider>
  );
}
