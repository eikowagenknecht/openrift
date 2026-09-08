import type { DeckOddsConfig } from "@openrift/shared/contracts/decks";
import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { useEffect, useState } from "react";

import type { CardOpenTarget, HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { DeckBenchHand } from "@/features/decks/components/deck-bench-hand";
import { DeckDrawOddsPanel } from "@/features/decks/components/deck-draw-odds-panel";
import { DeckOddsGroupPicker } from "@/features/decks/components/deck-odds-group-picker";
import { DeckRuneOddsPanel } from "@/features/decks/components/deck-rune-odds-panel";
import { DeckSideboardTest } from "@/features/decks/components/deck-sideboard-test";
import type { BenchState } from "@/features/decks/lib/deck-bench-pool";
import { buildBenchPool } from "@/features/decks/lib/deck-bench-pool";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { sortOverviewCards } from "@/features/decks/lib/deck-card-sort";
import {
  buildDrawOddsRows,
  MULLIGAN_LIMIT,
  OPENING_HAND_SIZE,
} from "@/features/decks/lib/deck-draw-odds";
import type { HandOddsGroup } from "@/features/decks/lib/deck-hand-odds";
import {
  buildInHandGroupCounts,
  buildLibraryHitChances,
  buildMulliganPreview,
} from "@/features/decks/lib/deck-hand-odds";
import { applyMulligan, shuffle } from "@/features/decks/lib/deck-mulligan";
import type { OddsGroupDef } from "@/features/decks/lib/deck-odds-groups";
import {
  defaultOddsGroupKeys,
  isInformativeGroupRow,
  oddsGroupPresets,
  oddsGroupRow,
} from "@/features/decks/lib/deck-odds-groups";
import type { PlanSwapDraft, SwapDirection } from "@/features/decks/lib/deck-plan";
import { applySwaps, hasActiveSwaps } from "@/features/decks/lib/deck-swap-test";
import { useDeckOddsGroupsStore } from "@/features/decks/stores/deck-odds-groups-store";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";

const TEXT_ENTRY = 'input, textarea, select, [contenteditable], [role="dialog"]';

export function DeckTestBench({
  cards,
  deckId,
  oddsConfig,
  onSaveOddsConfig,
  getThumbnail,
  onHoverCard,
  onCardClick,
}: {
  cards: DeckBuilderCard[];
  deckId: string;
  oddsConfig?: DeckOddsConfig | null;
  onSaveOddsConfig?: (config: DeckOddsConfig) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const [bench, setBench] = useState<BenchState | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [swaps, setSwaps] = useState<PlanSwapDraft[]>([]);
  const [sideboardOpen, setSideboardOpen] = useState(false);
  const { labels } = useEnumOrders();
  const hydrated = useHydrated();

  const swapsActive = hasActiveSwaps(swaps);
  const testCards = swapsActive ? applySwaps(cards, swaps) : cards;

  const pool = buildBenchPool(testCards);

  const printingByCardId = new Map(pool.map((copy) => [copy.cardId, copy.preferredPrintingId]));
  const cardById = new Map(
    testCards
      .filter((card) => card.zone === WellKnown.deckZone.MAIN)
      .map((card) => [card.cardId, card] as const),
  );

  const oddsRows = buildDrawOddsRows(testCards);
  const hasRunes = cards.some((card) => card.zone === WellKnown.deckZone.RUNES);

  // Uses `cards`, not `testCards`: a card must stay on the swap list at its
  // real cap no matter how far the experiment has already moved its copies.
  const swapRowsFor = (zone: DeckZone) => {
    const aggregated = [
      ...Map.groupBy(
        cards.filter((card) => card.zone === zone),
        (card) => card.cardId,
      ),
    ].flatMap(([, group]) => {
      const [first] = group;
      if (!first) {
        return [];
      }
      return [{ ...first, quantity: group.reduce((sum, card) => sum + card.quantity, 0) }];
    });
    return sortOverviewCards(aggregated, zone).map((card) => ({
      cardId: card.cardId,
      cardName: card.cardName,
      quantity: card.quantity,
    }));
  };
  const sideboardRows = swapRowsFor(WellKnown.deckZone.SIDEBOARD);
  const mainRows = swapRowsFor(WellKnown.deckZone.MAIN);
  const copiesAvailable = new Map([
    ...sideboardRows.map((card) => [`in:${card.cardId}`, card.quantity] as const),
    ...mainRows.map((card) => [`out:${card.cardId}`, card.quantity] as const),
  ]);

  const presets = oddsGroupPresets(testCards, labels.cardTypes);
  const storedSelection = useDeckOddsGroupsStore((state) => state.selectionByDeck[deckId]);
  const storedCustom = useDeckOddsGroupsStore((state) => state.customByDeck[deckId]);
  const setSelection = useDeckOddsGroupsStore((state) => state.setSelection);
  const clearSelection = useDeckOddsGroupsStore((state) => state.clearSelection);
  const addCustomGroup = useDeckOddsGroupsStore((state) => state.addCustomGroup);
  const removeCustomGroup = useDeckOddsGroupsStore((state) => state.removeCustomGroup);
  const serverBacked = oddsConfig !== undefined;
  const canEditServer = serverBacked && onSaveOddsConfig !== undefined;
  const canCustomize = canEditServer || !serverBacked;

  // The share page SSRs this section; device-local state must not flip the
  // tree during hydration. Server config is part of the SSR payload already.
  const localCustom = hydrated ? storedCustom : undefined;
  const localSelection = hydrated ? storedSelection : undefined;
  const customDefs: readonly OddsGroupDef[] = serverBacked
    ? (oddsConfig?.customGroups ?? [])
    : (localCustom ?? []);
  const allDefs: readonly OddsGroupDef[] = [...customDefs, ...presets];
  const rowsByKey = new Map(allDefs.map((def) => [def.key, oddsGroupRow(testCards, def)]));
  const mainDeckSize = pool.length;
  const suggestedKeys = [
    ...customDefs.map((def) => def.key),
    ...defaultOddsGroupKeys(testCards, presets),
  ];
  const serverSelection = oddsConfig?.selection ?? undefined;
  const explicitSelection = canEditServer
    ? serverSelection
    : serverBacked
      ? (localSelection ?? serverSelection)
      : localSelection;
  const hasOverride = explicitSelection !== undefined;
  const selectedSet = new Set(explicitSelection ?? suggestedKeys);
  const visibleGroups = allDefs.flatMap((def) => {
    const row = rowsByKey.get(def.key);
    if (
      row === undefined ||
      !selectedSet.has(def.key) ||
      !isInformativeGroupRow(row, mainDeckSize)
    ) {
      return [];
    }
    return [{ def, row }];
  });
  const groupRows = visibleGroups.map((group) => group.row);
  const handGroups: HandOddsGroup[] = visibleGroups.map((group) => ({
    def: group.def,
    copies: group.row.copies,
  }));

  const handCardIds = bench?.hand.map((card) => card.cardId) ?? [];
  const libraryCardIds = bench?.library.map((card) => card.cardId) ?? [];
  const inHandCounts = Map.groupBy(handCardIds, (cardId) => cardId);
  const inHandGroupCounts = buildInHandGroupCounts({
    hand: handCardIds,
    cards: cardById,
    groups: handGroups,
  });
  const mulliganRows = buildMulliganPreview({
    kept: bench?.hand.filter((card) => !selected.has(card.key)).map((card) => card.cardId) ?? [],
    library: libraryCardIds,
    cards: cardById,
    groups: handGroups,
    draws: selected.size,
  });
  const nextCardRows = buildLibraryHitChances({
    library: libraryCardIds,
    cards: cardById,
    groups: handGroups,
    draws: 1,
  });

  const persistSelection = (keys: string[] | null) => {
    if (canEditServer) {
      onSaveOddsConfig({ customGroups: [...customDefs], selection: keys });
    } else if (keys === null) {
      clearSelection(deckId);
    } else {
      setSelection(deckId, keys);
    }
  };

  const handleResetSelection = () => {
    persistSelection(null);
  };

  const toggleGroup = (key: string) => {
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    persistSelection(allDefs.filter((def) => next.has(def.key)).map((def) => def.key));
  };

  const handleAddCustom = (group: OddsGroupDef) => {
    if (canEditServer) {
      // null selection means "suggested" and already covers every custom group.
      onSaveOddsConfig({
        customGroups: [...customDefs, group],
        selection: serverSelection === undefined ? null : [...serverSelection, group.key],
      });
      return;
    }
    addCustomGroup(deckId, group);
    if (localSelection) {
      setSelection(deckId, [...localSelection, group.key]);
    }
  };

  const handleRemoveCustom = (key: string) => {
    if (canEditServer) {
      onSaveOddsConfig({
        customGroups: customDefs.filter((def) => def.key !== key),
        selection: serverSelection?.filter((selectedKey) => selectedKey !== key) ?? null,
      });
      return;
    }
    removeCustomGroup(deckId, key);
    if (localSelection) {
      setSelection(
        deckId,
        localSelection.filter((selectedKey) => selectedKey !== key),
      );
    }
  };

  const commitSwaps = (next: PlanSwapDraft[]) => {
    setSwaps(next);
    // A swap invalidates a drawn hand: it came out of the old pool.
    setBench(null);
    setSelected(new Set());
  };

  const addSwap = (direction: SwapDirection, cardId: string) => {
    if (swaps.some((swap) => swap.cardId === cardId && swap.direction === direction)) {
      return;
    }
    commitSwaps([...swaps, { cardId, direction, quantity: 1 }]);
  };

  const setSwapQuantity = (swapIndex: number, quantity: number) => {
    commitSwaps(swaps.map((swap, index) => (index === swapIndex ? { ...swap, quantity } : swap)));
  };

  const removeSwap = (swapIndex: number) => {
    commitSwaps(swaps.filter((_, index) => index !== swapIndex));
  };

  const resetSwaps = () => {
    commitSwaps([]);
  };

  const toggleSideboard = () => {
    setSideboardOpen((open) => !open);
  };

  // Caps at what the zone actually holds; these copies feed the odds math directly.
  const maxSwapQuantityFor = (cardId: string, direction: SwapDirection) =>
    copiesAvailable.get(`${direction}:${cardId}`) ?? 1;

  const drawHand = () => {
    if (pool.length === 0) {
      return;
    }
    const shuffled = shuffle(pool);
    setBench({
      hand: shuffled.slice(0, OPENING_HAND_SIZE),
      library: shuffled.slice(OPENING_HAND_SIZE),
      mulliganUsed: false,
      hasDrawn: false,
    });
    setSelected(new Set());
  };

  const toggleSelected = (key: string) => {
    if (!bench || bench.mulliganUsed || bench.hasDrawn) {
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else if (next.size < MULLIGAN_LIMIT) {
      next.add(key);
    }
    setSelected(next);
  };

  const mulliganSelected = () => {
    // hasDrawn is checked here too: the button is disabled after a draw, but
    // the N/M/D keyboard shortcuts bypass the button and would still fire.
    if (!bench || bench.mulliganUsed || bench.hasDrawn || selected.size === 0) {
      return;
    }
    const result = applyMulligan(bench.hand, bench.library, selected, shuffle);
    setBench({
      hand: result.hand,
      library: result.library,
      mulliganUsed: true,
      hasDrawn: false,
    });
    setSelected(new Set());
  };

  const drawNext = () => {
    if (!bench) {
      return;
    }
    const [next, ...rest] = bench.library;
    if (!next) {
      return;
    }
    setBench({
      ...bench,
      hand: [...bench.hand, next],
      library: rest,
      hasDrawn: true,
    });
    setSelected(new Set());
  };

  // No dependency array: handlers must close over fresh state each render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_ENTRY)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        drawHand();
      } else if (key === "m") {
        event.preventDefault();
        mulliganSelected();
      } else if (key === "d") {
        event.preventDefault();
        drawNext();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  });

  // mainRows reflects the real deck, not the experiment: cutting every
  // main-deck card must not swap the whole tab for a placeholder with no way back.
  if (mainRows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add cards to the main deck to test opening hands.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8 @3xl:flex-row @3xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <DeckBenchHand
          bench={bench}
          selected={selected}
          poolSize={pool.length}
          mulliganRows={mulliganRows}
          nextCardRows={nextCardRows}
          getThumbnail={getThumbnail}
          onHoverCard={onHoverCard}
          onDrawHand={drawHand}
          onMulligan={mulliganSelected}
          onDrawNext={drawNext}
          onToggleSelected={toggleSelected}
        />
        {sideboardRows.length > 0 && (
          <DeckSideboardTest
            swaps={swaps}
            swapsActive={swapsActive}
            mainRows={mainRows}
            sideboardRows={sideboardRows}
            open={sideboardOpen}
            onToggleOpen={toggleSideboard}
            onAdd={addSwap}
            onSetQuantity={setSwapQuantity}
            onRemove={removeSwap}
            onReset={resetSwaps}
            maxQuantityFor={maxSwapQuantityFor}
          />
        )}
      </div>

      {(oddsRows.length > 0 || hasRunes) && (
        <div className="flex w-full shrink-0 flex-col gap-6 @3xl:w-96 @7xl:grid @7xl:w-[49.5rem] @7xl:grid-cols-2 @7xl:items-start">
          {oddsRows.length > 0 && (
            <DeckDrawOddsPanel
              picker={
                <DeckOddsGroupPicker
                  customDefs={customDefs}
                  presets={presets}
                  rowsByKey={rowsByKey}
                  mainDeckSize={mainDeckSize}
                  selectedSet={selectedSet}
                  hasOverride={hasOverride}
                  canCustomize={canCustomize}
                  typeLabels={labels.cardTypes}
                  onToggle={toggleGroup}
                  onReset={handleResetSelection}
                  onAddCustom={handleAddCustom}
                  onRemoveCustom={handleRemoveCustom}
                />
              }
              oddsRows={oddsRows}
              groupRows={groupRows}
              inHandGroupCounts={inHandGroupCounts}
              inHandCounts={inHandCounts}
              printingByCardId={printingByCardId}
              showHandDots={handCardIds.length > 0}
              onHoverCard={onHoverCard}
              onCardClick={onCardClick}
            />
          )}
          <DeckRuneOddsPanel cards={cards} />
        </div>
      )}
    </div>
  );
}
