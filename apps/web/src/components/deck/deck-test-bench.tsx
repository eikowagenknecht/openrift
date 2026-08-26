import type { DeckOddsConfig, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { HandIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { PowerDomainIcon } from "@/components/deck/deck-card-row";
import { SwapColumns } from "@/components/deck/swap-column-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { sortOverviewCards } from "@/lib/deck-card-sort";
import {
  buildDrawOddsRows,
  formatChancePct,
  MULLIGAN_LIMIT,
  OPENING_HAND_SIZE,
} from "@/lib/deck-draw-odds";
import type { HandOddsGroup, LibraryHitChance } from "@/lib/deck-hand-odds";
import {
  buildExchangePreview,
  buildInHandGroupCounts,
  buildLibraryHitChances,
  shortGroupLabel,
} from "@/lib/deck-hand-odds";
import { applyMulligan, shuffle } from "@/lib/deck-mulligan";
import type { OddsGroupDef, OddsGroupTheme } from "@/lib/deck-odds-groups";
import {
  defaultOddsGroupKeys,
  isInformativeGroupRow,
  oddsGroupPresets,
  oddsGroupRow,
} from "@/lib/deck-odds-groups";
import type { PlanSwapDraft, SwapDirection } from "@/lib/deck-plan";
import { buildRuneOddsRows, RUNE_ODDS_TURNS } from "@/lib/deck-rune-odds";
import { applySwaps, hasActiveSwaps } from "@/lib/deck-swap-test";
import { cn } from "@/lib/utils";
import { useDeckOddsGroupsStore } from "@/stores/deck-odds-groups-store";

/** Picker section order. */
const GROUP_THEMES: readonly OddsGroupTheme[] = ["Curve", "Interaction", "Economy", "Card types"];

/** Typing here must not trigger the bench's single-letter shortcuts. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable], [role="dialog"]';

/** Types offered in the custom-group form (the drawn main deck's types). */
const CUSTOM_GROUP_TYPES: readonly string[] = [
  WellKnown.cardType.UNIT,
  "spell",
  WellKnown.cardType.GEAR,
];

/**
 * Inline form for a deck-specific custom group: name, main-deck types, and an
 * energy range. At least one condition is required so a group can't silently
 * match the whole deck.
 * @returns The add-group form.
 */
function CustomGroupForm({
  typeLabels,
  onAdd,
}: {
  typeLabels: Record<string, string>;
  onAdd: (group: OddsGroupDef) => void;
}) {
  const [label, setLabel] = useState("");
  const [types, setTypes] = useState<ReadonlySet<string>>(new Set());
  const [energyMin, setEnergyMin] = useState("");
  const [energyMax, setEnergyMax] = useState("");
  const canAdd =
    label.trim().length > 0 && (types.size > 0 || energyMin !== "" || energyMax !== "");

  const toggleType = (type: string) => {
    const next = new Set(types);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setTypes(next);
  };

  const submit = () => {
    if (!canAdd) {
      return;
    }
    onAdd({
      key: `custom-${crypto.randomUUID()}`,
      label: label.trim(),
      ...(types.size > 0 && { types: [...types] }),
      ...(energyMin !== "" && { energyMin: Number(energyMin) }),
      ...(energyMax !== "" && { energyMax: Number(energyMax) }),
    });
    setLabel("");
    setTypes(new Set());
    setEnergyMin("");
    setEnergyMax("");
  };

  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-md border border-dashed p-2">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="New group, e.g. Turn-1 gear"
        aria-label="Group name"
        className="h-7 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        {CUSTOM_GROUP_TYPES.map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox checked={types.has(type)} onCheckedChange={() => toggleType(type)} />
            {typeLabels[type]}
          </label>
        ))}
      </div>
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        Energy
        <Input
          type="number"
          min={0}
          value={energyMin}
          onChange={(event) => setEnergyMin(event.target.value)}
          aria-label="Minimum energy"
          // Hide the native number spinners — they crowd an already narrow field.
          className="h-7 w-14 [appearance:textfield] text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        to
        <Input
          type="number"
          min={0}
          value={energyMax}
          onChange={(event) => setEnergyMax(event.target.value)}
          aria-label="Maximum energy"
          className="h-7 w-14 [appearance:textfield] text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={submit}
          disabled={!canAdd}
          className="ml-auto"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Odds of having channeled enough runes of a domain by each early turn. Runes
 * are their own shuffled deck, so this reads the real deck's rune zone and is
 * deliberately untouched by the sideboard experiment (runes can't be swapped).
 * @returns The rune-odds block, or null when the deck has no runes.
 */
function RuneOddsPanel({ cards }: { cards: DeckBuilderCard[] }) {
  const [goingSecond, setGoingSecond] = useState(false);
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const rows = buildRuneOddsRows(cards, { goingSecond });
  if (rows.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="text-muted-foreground text-2xs mb-1.5 flex items-center gap-2 font-semibold tracking-widest uppercase">
        Rune odds
        <ToggleGroup
          variant="outline"
          spacing={0}
          size="sm"
          value={[goingSecond ? "second" : "first"]}
          onValueChange={([next]) => setGoingSecond(next === "second")}
          aria-label="Play order"
          className="ml-auto"
        >
          <ToggleGroupItem value="first">Going first</ToggleGroupItem>
          <ToggleGroupItem value="second">Going second</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="px-2 py-1.5 text-left font-medium">Runes</th>
              {RUNE_ODDS_TURNS.map((turn) => (
                <th
                  key={turn}
                  className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap"
                >
                  Turn {turn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.domain}-${row.threshold}`} className="border-t">
                <td className="max-w-0 px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    <PowerDomainIcon domains={[row.domain]} colors={domainColors} />
                    <span className="truncate">
                      {row.threshold}+ {labels.domains[row.domain]}
                    </span>
                  </span>
                </td>
                {row.byTurn.map((chance, index) => (
                  <td
                    key={RUNE_ODDS_TURNS[index]}
                    className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums"
                  >
                    {/* Exactly 0 means structurally impossible (fewer runes
                        channeled than the threshold) — a dash reads clearer
                        than a percentage. */}
                    {chance === 0 ? (
                      <span className="text-muted-foreground/60">–</span>
                    ) : (
                      formatChancePct(chance)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-2xs mt-1.5">
        Chance of having channeled at least that many runes of a domain by the end of each turn. You
        channel two runes a turn{goingSecond ? ", plus one more on your first turn" : ""}.
      </p>
    </div>
  );
}

/**
 * @returns The odds-table row title, flagging what of it sits in the hand.
 */
function oddsRowTitle(label: string, inHand: number): string {
  if (inHand > 1) {
    return `${label} (${inHand} in your hand)`;
  }
  if (inHand === 1) {
    return `${label} (in your hand)`;
  }
  return label;
}

/**
 * Ties an odds row to the hand on the left: this row is one you are holding.
 * @returns The marker, or null for a row the hand does not cover.
 */
function InHandDot({ inHand }: { inHand: number }) {
  if (inHand === 0) {
    return null;
  }
  return (
    <span aria-hidden className="bg-primary mr-1 inline-block size-1.5 rounded-full align-middle" />
  );
}

/**
 * A muted line of "chance to hit each group in the next few cards", counted off
 * the live library rather than the deck list.
 * @returns The line, or null when there is nothing to say.
 */
function LibraryOddsLine({
  lead,
  rows,
  emptyLabel,
}: {
  lead: string;
  rows: readonly LibraryHitChance[];
  emptyLabel?: string;
}) {
  if (rows.length === 0 && emptyLabel === undefined) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-2xs">
      {lead}{" "}
      {rows.length === 0
        ? emptyLabel
        : rows.map((row, index) => (
            <span key={row.key}>
              {index > 0 && " · "}
              <span className="tabular-nums">{formatChancePct(row.chance)}</span>{" "}
              {shortGroupLabel(row.label)}
            </span>
          ))}
    </p>
  );
}

interface PoolCard {
  /** Unique per physical copy so two copies of one card select independently. */
  key: string;
  cardId: string;
  cardName: string;
  preferredPrintingId: string | null;
}

interface BenchState {
  hand: PoolCard[];
  library: PoolCard[];
  mulliganUsed: boolean;
  /** A card was drawn past the opening hand — the mulligan window is closed. */
  hasDrawn: boolean;
}

/**
 * The Test tab: sample opening hands with the real Riftbound rule (4 cards,
 * exchange up to 2 once) plus a hypergeometric draw-odds table for every
 * main-deck card. All client-side math — no server involvement.
 * @returns The test bench.
 */
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
  /** Keys the device-local odds-group state (viewer overrides, local decks). */
  deckId: string;
  /**
   * The deck's server-stored odds settings. Omit entirely for browser-local
   * decks (device-local storage applies); null means a server deck that has
   * not been customized yet.
   */
  oddsConfig?: DeckOddsConfig | null;
  /** Owner save path. Absent on read-only views — viewer toggles stay local. */
  onSaveOddsConfig?: (config: DeckOddsConfig) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  onHoverCard?: HoverHandler;
  /** Opens a card's detail from an odds-table row. */
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const [bench, setBench] = useState<BenchState | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Sideboard experiment: purely local to this tab, never saved anywhere. It
  // carries the deck plan's swap shape so a matchup's swaps could be loaded
  // straight in later.
  const [swaps, setSwaps] = useState<PlanSwapDraft[]>([]);
  // Collapsed by default so the Test tab opens quiet; not persisted.
  const [sideboardOpen, setSideboardOpen] = useState(false);
  const { labels } = useEnumOrders();
  const hydrated = useHydrated();

  const swapsActive = hasActiveSwaps(swaps);
  // Every number on this tab — hands, odds, group rows — reads the swapped
  // deck, so the experiment is visible everywhere at once.
  const testCards = swapsActive ? applySwaps(cards, swaps) : cards;

  // One entry per physical copy of the main deck. The copy counter runs per
  // card across entries — a card split over two pinned printings must not
  // restart at 0 and hand two copies the same key (duplicate React keys, and
  // selecting one would select both).
  const copySeq = new Map<string, number>();
  const pool: PoolCard[] = testCards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .flatMap((card) =>
      Array.from({ length: card.quantity }, () => {
        const index = copySeq.get(card.cardId) ?? 0;
        copySeq.set(card.cardId, index + 1);
        return {
          key: `${card.cardId}-${index}`,
          cardId: card.cardId,
          cardName: card.cardName,
          preferredPrintingId: card.preferredPrintingId,
        };
      }),
    );

  const printingByCardId = new Map(pool.map((copy) => [copy.cardId, copy.preferredPrintingId]));
  const cardById = new Map(
    testCards
      .filter((card) => card.zone === WellKnown.deckZone.MAIN)
      .map((card) => [card.cardId, card] as const),
  );

  const oddsRows = buildDrawOddsRows(testCards);
  const hasRunes = cards.some((card) => card.zone === WellKnown.deckZone.RUNES);

  // The swap columns work off the real deck, so a card stays on its list (and
  // keeps its cap) no matter how far the experiment has moved its copies.
  // Swaps are counted per card, so copies split across pinned printings
  // collapse into one row, and the order matches the deck list's default view.
  const swapRowsFor = (zone: DeckZone) => {
    const aggregated = [
      ...Map.groupBy(
        cards.filter((card) => card.zone === zone),
        (card) => card.cardId,
      ),
    ].map(([, group]) => ({
      ...group[0],
      quantity: group.reduce((sum, card) => sum + card.quantity, 0),
    }));
    // Narrowed back down on the way out: the raw `cardType` slug would
    // surface as the picker's detail column.
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

  // Three-layer group rows: core presets + deck-adaptive suggestions by
  // default, plus per-deck custom groups, all overridable through the picker.
  // Storage depends on the surface: server decks persist on the deck row (so
  // the settings travel with the share page); browser-local decks and share-
  // page viewers use the device-local store.
  const presets = oddsGroupPresets(testCards, labels.cardTypes);
  const storedSelection = useDeckOddsGroupsStore((state) => state.selectionByDeck[deckId]);
  const storedCustom = useDeckOddsGroupsStore((state) => state.customByDeck[deckId]);
  const setSelection = useDeckOddsGroupsStore((state) => state.setSelection);
  const clearSelection = useDeckOddsGroupsStore((state) => state.clearSelection);
  const addCustomGroup = useDeckOddsGroupsStore((state) => state.addCustomGroup);
  const removeCustomGroup = useDeckOddsGroupsStore((state) => state.removeCustomGroup);
  const serverBacked = oddsConfig !== undefined;
  const canEditServer = serverBacked && onSaveOddsConfig !== undefined;
  // The custom-group form shows where edits have somewhere to live: the
  // owner's server config, or the device store for local decks.
  const canCustomize = canEditServer || !serverBacked;

  // Hydration gate: the share page SSRs this section, and device-local state
  // must not flip the tree during hydration. Server config is part of the
  // SSR payload, so it needs no gate.
  const localCustom = hydrated ? storedCustom : undefined;
  const localSelection = hydrated ? storedSelection : undefined;
  const customDefs: readonly OddsGroupDef[] = serverBacked
    ? (oddsConfig?.customGroups ?? [])
    : (localCustom ?? []);
  const allDefs: readonly OddsGroupDef[] = [...customDefs, ...presets];
  const rowsByKey = new Map(allDefs.map((def) => [def.key, oddsGroupRow(testCards, def)]));
  const mainDeckSize = pool.length;
  // New custom groups are visible without touching the selection: the
  // suggested set includes them all.
  const suggestedKeys = [
    ...customDefs.map((def) => def.key),
    ...defaultOddsGroupKeys(testCards, presets),
  ];
  // Explicit selection precedence: the owner edits the server value; a
  // share-page viewer's device override shadows the author's selection; a
  // local deck is device-only.
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
  const exchangeRows = buildExchangePreview({
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
      // A null selection means "suggested", which includes every custom group
      // automatically; an explicit selection needs the new key appended.
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

  // Any swap invalidates a drawn hand — it came out of the old pool.
  const commitSwaps = (next: PlanSwapDraft[]) => {
    setSwaps(next);
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

  const drawHand = () => {
    // Mirrors the button's disabled state for the keyboard path.
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
    // hasDrawn matters on the keyboard path: the button is disabled after a
    // draw, but the shortcut would still fire.
    if (!bench || bench.mulliganUsed || bench.hasDrawn || selected.size === 0) {
      return;
    }
    // Real procedure (rule 118): set the chosen cards aside, draw that many,
    // then Recycle the set-aside cards to the bottom of the deck — so a later
    // "Draw a card" can still reach the exchanged copies.
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
    if (!bench || bench.library.length === 0) {
      return;
    }
    setBench({
      ...bench,
      hand: [...bench.hand, bench.library[0]],
      library: bench.library.slice(1),
      hasDrawn: true,
    });
    setSelected(new Set());
  };

  // Single-letter shortcuts while the Test tab is mounted: N new hand,
  // E exchange the selected cards, D draw a card. Modifier chords stay with
  // the browser and the editor's own Ctrl+K / Ctrl+Z handlers. No dependency
  // array on purpose: the handlers close over fresh state each render, so the
  // listener re-binds per render instead of chasing their identities.
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
      } else if (key === "e") {
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

  // Keyed on the real deck, not the experiment: cutting every main-deck card
  // must not swap the whole tab for a placeholder with no way back.
  if (mainRows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add cards to the main deck to test opening hands.
      </p>
    );
  }

  const pct = formatChancePct;

  return (
    <div className="flex flex-col gap-8 @3xl:flex-row @3xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* The row keeps a fixed shape across states — every button stays
            mounted with a constant label, so nothing moves under the cursor
            between draws. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={bench ? "outline" : "default"}
            onClick={drawHand}
            disabled={pool.length === 0}
            aria-keyshortcuts="N"
          >
            {bench ? <RotateCcwIcon className="size-4" /> : <HandIcon className="size-4" />}
            Draw a hand
            <Kbd
              className={cn(
                "max-sm:hidden",
                // The filled variant needs the chip re-inked or it floats as a
                // light-gray island on the primary fill.
                !bench && "bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              N
            </Kbd>
          </Button>
          {/* The exchange happens before any extra draw, so drawing a card
              locks the button. */}
          <Button
            type="button"
            variant="outline"
            onClick={mulliganSelected}
            disabled={!bench || bench.mulliganUsed || bench.hasDrawn || selected.size === 0}
            aria-keyshortcuts="E"
          >
            Exchange
            <Kbd className="max-sm:hidden">E</Kbd>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={drawNext}
            disabled={!bench || bench.library.length === 0}
            aria-keyshortcuts="D"
          >
            Draw a card
            <Kbd className="max-sm:hidden">D</Kbd>
          </Button>
          {bench && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {bench.library.length} left in deck
            </span>
          )}
        </div>
        {bench ? (
          <div className="flex flex-wrap items-start gap-2">
            {bench.hand.map((card) => {
              const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
              const isSelected = selected.has(card.key);
              const canExchange = !bench.mulliganUsed && !bench.hasDrawn;
              return (
                <Pressable
                  key={card.key}
                  {...cardHoverProps(onHoverCard, card.cardId, card.preferredPrintingId)}
                  onClick={() => toggleSelected(card.key)}
                  aria-pressed={isSelected}
                  aria-label={canExchange ? `${card.cardName} — select to exchange` : card.cardName}
                  style={{ borderRadius: CARD_BORDER_RADIUS }}
                  className={cn(
                    "transition-transform",
                    canExchange && "hover:-translate-y-1",
                    isSelected && "ring-primary ring-offset-background ring-2 ring-offset-2",
                  )}
                >
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={card.cardName}
                      style={{ borderRadius: CARD_BORDER_RADIUS }}
                      className="aspect-card h-40 object-cover shadow-sm sm:h-48"
                      draggable={false}
                    />
                  ) : (
                    <span
                      style={{ borderRadius: CARD_BORDER_RADIUS }}
                      className="aspect-card border-muted-foreground/25 flex h-40 items-center justify-center border border-dashed p-2 text-center text-xs sm:h-48"
                    >
                      {card.cardName}
                    </span>
                  )}
                </Pressable>
              );
            })}
          </div>
        ) : (
          <div className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
            Draw a sample hand to see how the deck opens.
          </div>
        )}
        {/* Both lines sit below the cards, never above them: a line that
            appears on a card click must not shove the cards out from under the
            cursor mid-mulligan. */}
        {bench && selected.size > 0 && (
          <LibraryOddsLine
            lead={`Exchanging ${selected.size}:`}
            rows={exchangeRows}
            emptyLabel="nothing left to look for, this hand covers every group."
          />
        )}
        {bench && selected.size === 0 && bench.library.length > 0 && (
          <LibraryOddsLine lead="Next card:" rows={nextCardRows} />
        )}
        {sideboardRows.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <ExpandToggle
                expanded={sideboardOpen}
                onClick={() => setSideboardOpen((open) => !open)}
                chevronClassName="size-3.5"
              >
                <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
                  Sideboard test
                </span>
              </ExpandToggle>
              {/* Reset stays put while collapsed: swaps still skew every
                  number, so it doubles as the "something is active" flag. */}
              {swapsActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={resetSwaps}
                  className="ml-auto"
                >
                  Reset
                </Button>
              )}
            </div>
            {/* Collapsing hides the controls only — active swaps keep
                shaping the odds and the sample hand. */}
            {sideboardOpen && (
              <>
                <SwapColumns
                  swaps={swaps}
                  maindeckCandidates={mainRows}
                  sideboardCandidates={sideboardRows}
                  onAdd={addSwap}
                  onSetQuantity={setSwapQuantity}
                  onRemove={removeSwap}
                  // These copies feed the odds math directly, so a box can't
                  // go past what the zone actually holds.
                  maxQuantityFor={(cardId, direction) =>
                    copiesAvailable.get(`${direction}:${cardId}`) ?? 1
                  }
                />
                <p className="text-muted-foreground text-2xs mt-1.5">
                  Experiment only — swaps change the odds and sample hands here, nothing is saved to
                  the deck.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* The two odds tables stack in the fixed side rail, then sit next to
          each other once the container leaves room for both columns. */}
      {(oddsRows.length > 0 || hasRunes) && (
        <div className="flex w-full shrink-0 flex-col gap-6 @3xl:w-96 @7xl:grid @7xl:w-[49.5rem] @7xl:grid-cols-2 @7xl:items-start">
          {oddsRows.length > 0 && (
            <div>
              <div className="text-muted-foreground text-2xs mb-1.5 flex items-center font-semibold tracking-widest uppercase">
                Draw odds
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Choose odds rows"
                        className="ml-auto"
                      />
                    }
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                  </PopoverTrigger>
                  <PopoverContent align="end" className="max-h-96 w-80 overflow-y-auto p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Card groups</span>
                      {hasOverride && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => persistSelection(null)}
                        >
                          Reset to suggested
                        </Button>
                      )}
                    </div>
                    {/* A viewer of someone else's deck can toggle rows but has
                    nowhere to save a new group, so point at the copy. */}
                    {!canCustomize && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Copy this deck to your decks to make your own groups.
                      </p>
                    )}
                    {/* Hidden when there is nothing deck-specific to show: no
                    custom groups and no way to add one (read-only viewer). */}
                    {(customDefs.length > 0 || canCustomize) && (
                      <div className="text-muted-foreground text-2xs mt-3 mb-1 font-semibold tracking-widest uppercase">
                        This deck
                      </div>
                    )}
                    <div className="flex flex-col">
                      {customDefs.map((def) => {
                        const row = rowsByKey.get(def.key);
                        if (!row) {
                          return null;
                        }
                        const informative = isInformativeGroupRow(row, mainDeckSize);
                        return (
                          <div
                            key={def.key}
                            className={cn(
                              "flex items-center gap-2 rounded px-1 py-1 text-sm",
                              !informative && "opacity-50",
                            )}
                          >
                            <Checkbox
                              checked={selectedSet.has(def.key)}
                              disabled={!informative}
                              onCheckedChange={() => toggleGroup(def.key)}
                              aria-label={def.label}
                            />
                            <span className="min-w-0 flex-1 truncate">{def.label}</span>
                            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                              {informative
                                ? `${row.copies} · ${formatChancePct(row.openingChance)}`
                                : row.copies === 0
                                  ? "0 in deck"
                                  : "whole deck"}
                            </span>
                            {canCustomize && (
                              <ChipRemoveButton
                                aria-label={`Remove ${def.label}`}
                                onClick={() => handleRemoveCustom(def.key)}
                              />
                            )}
                          </div>
                        );
                      })}
                      {canCustomize && (
                        <CustomGroupForm typeLabels={labels.cardTypes} onAdd={handleAddCustom} />
                      )}
                    </div>
                    {GROUP_THEMES.map((theme) => {
                      const themed = presets.filter((preset) => preset.theme === theme);
                      if (themed.length === 0) {
                        return null;
                      }
                      return (
                        <div key={theme}>
                          <div className="text-muted-foreground text-2xs mt-3 mb-1 font-semibold tracking-widest uppercase">
                            {theme}
                          </div>
                          <div className="flex flex-col">
                            {themed.map((preset) => {
                              const row = rowsByKey.get(preset.key);
                              if (!row) {
                                return null;
                              }
                              const informative = isInformativeGroupRow(row, mainDeckSize);
                              return (
                                <label
                                  key={preset.key}
                                  className={cn(
                                    "flex items-center gap-2 rounded px-1 py-1 text-sm",
                                    informative ? "hover:bg-muted/50 cursor-pointer" : "opacity-50",
                                  )}
                                >
                                  <Checkbox
                                    checked={selectedSet.has(preset.key)}
                                    disabled={!informative}
                                    onCheckedChange={() => toggleGroup(preset.key)}
                                  />
                                  <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                    {informative
                                      ? `${row.copies} · ${formatChancePct(row.openingChance)}`
                                      : row.copies === 0
                                        ? "0 in deck"
                                        : "whole deck"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="px-2 py-1.5 text-left font-medium">Card</th>
                      {/* w-px pins the number columns to their content so the
                      name column gets every remaining pixel. */}
                      <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        Hand
                      </th>
                      <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        First 7
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Role rows first: "will I see *something of this kind*",
                    built from structured card data (types, energy). */}
                    {groupRows.map((row) => {
                      const inHand = inHandGroupCounts.get(row.key) ?? 0;
                      return (
                        <tr key={row.key} className="bg-muted/40 border-t">
                          <td
                            className="max-w-0 truncate px-2 py-1"
                            title={oddsRowTitle(row.label, inHand)}
                          >
                            <InHandDot inHand={inHand} />
                            {row.label}{" "}
                            <span className="text-muted-foreground tabular-nums">
                              · {row.copies}
                            </span>
                          </td>
                          <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                            {pct(row.openingChance)}
                          </td>
                          <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                            {pct(row.earlyChance)}
                          </td>
                        </tr>
                      );
                    })}
                    {oddsRows.map((row) => {
                      const preferredPrintingId = printingByCardId.get(row.cardId) ?? null;
                      const inHand = inHandCounts.get(row.cardId)?.length ?? 0;
                      const openCard = onCardClick
                        ? () =>
                            onCardClick({
                              cardId: row.cardId,
                              preferredPrintingId,
                              zone: WellKnown.deckZone.MAIN,
                            })
                        : undefined;
                      return (
                        <tr
                          key={row.cardId}
                          className={cn("border-t", openCard && "hover:bg-muted/50 cursor-pointer")}
                          {...cardHoverProps(onHoverCard, row.cardId, preferredPrintingId)}
                          {...rowActivateProps(openCard)}
                        >
                          <td
                            className="max-w-0 truncate px-2 py-1"
                            title={oddsRowTitle(row.cardName, inHand)}
                          >
                            <InHandDot inHand={inHand} />
                            <span className="text-muted-foreground tabular-nums">
                              {row.copies}×
                            </span>{" "}
                            {row.cardName}
                          </td>
                          <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                            {pct(row.openingChance)}
                          </td>
                          <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                            {pct(row.earlyChance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-2xs mt-1.5">
                Chance of at least one copy in your opening hand, and anywhere in your first 7
                cards.
              </p>
              {handCardIds.length > 0 && (
                <p className="text-muted-foreground text-2xs">
                  Dots show what you hit in the sample hand.
                </p>
              )}
            </div>
          )}
          {/* Runes are a separate shuffled deck, so this reads the real deck
              and ignores the sideboard experiment. */}
          <RuneOddsPanel cards={cards} />
        </div>
      )}
    </div>
  );
}
