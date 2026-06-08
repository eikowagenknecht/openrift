import type { DeckResponse, DeckZone, Marketplace, Printing } from "@openrift/shared";
import { imageUrl, WellKnown } from "@openrift/shared";
import { useDeferredValue, useEffect, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserActiveFilters,
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { useGridKeyboardNav } from "@/components/cards/use-grid-keyboard-nav";
import { DeckAddStrip } from "@/components/deck/deck-add-strip";
import { DeckCardDetailMenu } from "@/components/deck/deck-card-detail-menu";
import { DeckOverview } from "@/components/deck/deck-overview";
import { DeckTableActions } from "@/components/deck/deck-table-actions";
import { FormatTagPickBanner, needsFormatTagPick } from "@/components/deck/format-tag-pick-banner";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import { canAddRune, useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import { useDeckItems } from "@/hooks/use-deck-items";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  buildDeckQuantityByCell,
  catalogCardToDeckBuilderCard,
  cellPreferredPrintingId,
} from "@/lib/deck-builder-card";
import { getFormatTagConfig } from "@/lib/format-tag-config";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

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
  // Printings view counts the specific printing cell; cards view the whole card.
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
        activeZone === "runes"
          ? Math.max(0, 12 - runeTotal)
          : 3 - (copyLimitTotalByCard.get(cardId) ?? 0)
      }
      onQuickAdd={handleQuickAdd}
      onRemove={handleRemove}
    />
  );
}

/**
 * Build a map of domain → rune DeckBuilderCards from the full catalog.
 * @returns A map keyed by domain name, each value an array of rune cards in that domain.
 */
export function buildRunesByDomain(allPrintings: Printing[]): Map<string, DeckBuilderCard[]> {
  const runesByDomain = new Map<string, DeckBuilderCard[]>();
  for (const entry of allPrintings) {
    if (entry.card.type !== "rune") {
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
  /** Overview-only — opens the editor's detail pane for the clicked card. The
   * editor builds the handler because it owns the deck-items list used for the
   * pane's prev/next navigation. */
  onOverviewCardClick: (card: DeckBuilderCard) => void;
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
  onOverviewCardClick,
}: DeckCardBrowserProps) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const { filters } = useFilterValues();
  // Seed the language filter from the user's preferred languages on first visit
  // (same as /cards), so the printings view isn't flooded with every language.
  // Mounted here, not in the inner browser, so toggling between the overview and
  // a zone doesn't re-seed and undo a user who cleared the language filter.
  // Clearing every language still shows all languages for the rest of the visit.
  useSeedLanguagesFromPrefs(filters.languages);

  // Tag-locked decks without picked tags intercept everything else — there's
  // no useful overview or browser to render until the user picks.
  if (needsFormatTagPick(deckDetail.deck)) {
    return <FormatTagPickBanner deck={deckDetail.deck} />;
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
}: Omit<DeckCardBrowserProps, "deckId" | "onOverviewCardClick"> & {
  deck: DeckResponse;
  onCardClick: (card: DeckBuilderCard) => void;
}) {
  const cards = useDeckCards(deck.id);
  const customTagAssignments = useCustomTagAssignments();
  const { getPreferredFrontImage } = usePreferredPrinting();

  // Mirror the parent editor's deckItems so arrow-key navigation walks the
  // same list the detail pane's prev/next uses. selectedIndex from the
  // selection store is consistent across both paths because useDeckItems
  // produces the same dedup'd visual-order list here as in the editor.
  const { items, printingsByCardId } = useDeckItems(cards);
  const selectedCard = useSelectionStore((state) => state.selectedCard);
  const siblingPrintings = selectedCard
    ? (printingsByCardId.get(selectedCard.cardId) ?? EMPTY_SIBLINGS)
    : EMPTY_SIBLINGS;
  useGridKeyboardNav({ items, siblingPrintings });

  return (
    <DeckOverview
      deck={{
        id: deck.id,
        name: deck.name,
        format: deck.format,
        formatConfig: deck.formatConfig,
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
    />
  );
}

function DeckCardBrowserInner({ deckId }: { deckId: string }) {
  const showImages = useDisplayStore((state) => state.showImages);
  const isMobile = useIsMobile();
  const { allPrintings, sets } = useCards();
  const channels = useChannelRegistry();
  const customTagAssignments = useCustomTagAssignments();
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  // The grid's "owned" badge must reflect deck-available copies only. Copies in
  // collections excluded from deck building are "locked away" and don't feed the
  // deck (mirrors the ownership panel's available/locked split). Using the raw
  // owned total here would count those excluded copies as owned/available,
  // contradicting the ownership panel that reports them as locked.
  const { data: deckCounts } = useDeckBuildingCounts(Boolean(session?.user));
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
  const { data: deckDetail } = useDeckDetail(deckId);
  const isFreeform = deckDetail.deck.format === WellKnown.deckFormat.FREEFORM;
  // Tag-locked formats restrict the Custom Tags filter section to their own
  // category (e.g. Custom-Region → only the "region" dropdown). Other
  // formats pass `undefined` so every category remains available for
  // self-narrowing.
  const formatTagConfig = getFormatTagConfig(deckDetail.deck.format);
  const visibleCustomTagCategories: ReadonlySet<string> | undefined = formatTagConfig
    ? new Set([formatTagConfig.category])
    : undefined;
  // Wrapper only renders this component when activeZone is set
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone) as DeckZone;
  // Single-card zones only apply in constructed — freeform legend/champion are multi-card.
  const isSingleCardZone = !isFreeform && (activeZone === "legend" || activeZone === "champion");

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

  // "copies" is a collection-only view — clamp to "printings" in the deck builder.
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

  const filteredCards = sortedCards;

  const deferredSortedCards = useDeferredValue(filteredCards);
  const isGridStale = deferredSortedCards !== filteredCards;

  // Build a map of cardId → total quantity across all zones
  const deckQuantityByCard = new Map<string, number>();
  for (const card of deckCards) {
    deckQuantityByCard.set(card.cardId, (deckQuantityByCard.get(card.cardId) ?? 0) + card.quantity);
  }

  // Printings view shows per-printing counts: a pinned row counts on its
  // printing's cell, a default-art row on the card's canonical printing cell.
  const deckQuantityByCell = buildDeckQuantityByCell(
    deckCards,
    (cardId) => getPreferredPrinting(cardId)?.id,
  );
  const deckQtyForCell = (printing: Printing): number =>
    view === "printings"
      ? (deckQuantityByCell.get(printing.id) ?? 0)
      : (deckQuantityByCard.get(printing.cardId) ?? 0);

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

  // `event` is typed as a structural `{ shiftKey?: boolean }` so the table
  // path can synthesize the bit it cares about without faking a full
  // React.MouseEvent. The grid path still passes a real event in.
  const handleQuickAdd = (printing: Printing, event?: { shiftKey?: boolean }) => {
    // In printings view the clicked printing is pinned as the deck card's art;
    // cards view keeps default art (null).
    const builderCard: DeckBuilderCard = {
      ...catalogCardToDeckBuilderCard(printing.cardId, printing.card),
      preferredPrintingId: cellPreferredPrintingId(
        view,
        printing.id,
        getPreferredPrinting(printing.cardId)?.id,
      ),
    };

    if (activeZone === "legend" && !isFreeform) {
      setLegend(builderCard, buildRunesByDomain(allPrintings));
    } else {
      // Shift+click adds up to the zone maximum (or +3 in freeform where there's no max).
      const count = event?.shiftKey
        ? isFreeform
          ? 3
          : activeZone === "runes"
            ? Math.max(0, 12 - runeTotal)
            : 3
        : undefined;
      addCard(builderCard, activeZone, count);
    }
  };

  const handleRemove = (printing: Printing, event?: { shiftKey?: boolean }) => {
    const cardId = printing.cardId;
    // Printings view targets the clicked printing's row (null on the default
    // cell); cards view leaves the row unspecified so the default-art row goes
    // first. `undefined` means "any printing of this card".
    const cellPrintingId =
      view === "printings"
        ? cellPreferredPrintingId(view, printing.id, getPreferredPrinting(cardId)?.id)
        : undefined;
    const matchesCell = (card: DeckBuilderCard): boolean =>
      card.cardId === cardId &&
      (cellPrintingId === undefined || card.preferredPrintingId === cellPrintingId);

    // Shift+click removes all matching copies across all zones.
    if (event?.shiftKey) {
      for (const card of deckCards) {
        if (matchesCell(card)) {
          setQuantity(card.cardId, card.zone, 0, card.preferredPrintingId);
        }
      }
      return;
    }

    // Remove from the active zone first, then try other zones.
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

  // Compute cross-zone totals for copy limit zones (main + sideboard). Overflow
  // is excluded — it is a free parking zone, so its copies don't count toward
  // the 3-copy cap that disables the browser's add button.
  const copyLimitTotalByCard = new Map<string, number>();
  for (const card of deckCards) {
    if (card.zone === "main" || card.zone === "sideboard") {
      copyLimitTotalByCard.set(
        card.cardId,
        (copyLimitTotalByCard.get(card.cardId) ?? 0) + card.quantity,
      );
    }
  }

  const runeTotal = deckCards
    .filter((card) => card.zone === "runes")
    .reduce((sum, card) => sum + card.quantity, 0);

  // Register the row-body click handler so the virtualized CardTable can
  // dispatch row clicks without taking unstable closures as props. The +/-
  // buttons in the actions cell come from the deck-specific renderActions
  // slot below, which closes over deck state directly — no store needed for
  // those.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers({
      onRowClick: handleCardClick,
    });
    return () => {
      useCardRowActionsStore.getState().setHandlers({});
    };
  });

  const isMaxReached = (item: CardViewerItem): boolean => {
    if (isFreeform) {
      return false;
    }
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
    if (activeZone === "overflow") {
      // Free parking zone — never capped.
      return false;
    }
    return (copyLimitTotalByCard.get(cardId) ?? 0) >= 3;
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const ownedCount = ownedCounts?.get(item.printing.id) ?? 0;
    const deckQty = deckQtyForCell(item.printing);
    // Single-card zone strip controls key off "this card is in the active
    // zone", not "this card is anywhere in the deck": a champion unit can
    // simultaneously sit in main as regular copies without being the chosen
    // champion, so don't flip to "Remove" just because deckQty > 0.
    const isInActiveSingleZone =
      isSingleCardZone &&
      deckCards.some((card) => card.cardId === cardId && card.zone === activeZone);

    // On mobile, a tap adds the card (no hover to reach the + button);
    // long-press (or desktop right-click) opens the detail view via the context menu.
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
        stripSlot="topSlot"
        strip={
          <DeckAddStrip
            printing={item.printing}
            ownedCount={ownedCount}
            deckQuantity={deckQty}
            maxReached={isMaxReached(item)}
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
                : activeZone === "runes"
                  ? Math.max(0, 12 - runeTotal)
                  : 3 - (copyLimitTotalByCard.get(cardId) ?? 0)
            }
            onQuickAdd={handleQuickAdd}
            onRemove={handleRemove}
          />
        }
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

  const leftPane = <BrowserLeftPane />;

  const rightPane = (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={setSearch}
    />
  );

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      setDisplayLabel={setDisplayLabel}
      visibleCustomTagCategories={visibleCustomTagCategories}
    >
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
        aboveGrid={<BrowserActiveFilters />}
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
        {isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={setSearch}
          />
        )}
      </BrowserCardViewer>
    </CardBrowserFilterProvider>
  );
}
