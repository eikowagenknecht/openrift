import type { DeckOddsConfig, DeckZone } from "@openrift/shared";
import { WellKnown, enumLabel } from "@openrift/shared";
import { HandIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";

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
import { SectionHeading } from "@/components/ui/section-heading";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
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
  buildMulliganPreview,
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

const GROUP_THEMES: readonly OddsGroupTheme[] = ["Curve", "Interaction", "Economy", "Card types"];

const TEXT_ENTRY = 'input, textarea, select, [contenteditable], [role="dialog"]';

const CUSTOM_GROUP_TYPES: readonly string[] = [
  WellKnown.cardType.UNIT,
  "spell",
  WellKnown.cardType.GEAR,
];

// At least one condition is required so a group can't silently match the whole deck.
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

// Runes are their own shuffled deck; this deliberately reads the real deck's
// rune zone and ignores the sideboard experiment, since runes can't be swapped.
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
      <div className="text-muted-foreground text-2xs mb-1.5 flex items-center gap-2 font-semibold tracking-wide uppercase">
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
                      {row.threshold}+ {enumLabel(labels.domains, row.domain)}
                    </span>
                  </span>
                </td>
                {row.byTurn.map((chance, index) => (
                  <td
                    key={RUNE_ODDS_TURNS[index]}
                    className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums"
                  >
                    {/* 0 is structurally impossible; show a dash, not 0%. */}
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

function oddsRowTitle(label: string, inHand: number): string {
  if (inHand > 1) {
    return `${label} (${inHand} in your hand)`;
  }
  if (inHand === 1) {
    return `${label} (in your hand)`;
  }
  return label;
}

function InHandDot({ inHand }: { inHand: number }) {
  if (inHand === 0) {
    return null;
  }
  return (
    <span aria-hidden className="bg-primary mr-1 inline-block size-1.5 rounded-full align-middle" />
  );
}

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
  key: string;
  cardId: string;
  cardName: string;
  preferredPrintingId: string | null;
}

interface BenchState {
  hand: PoolCard[];
  library: PoolCard[];
  mulliganUsed: boolean;
  hasDrawn: boolean;
}

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

  // The counter runs per card across pool entries: a card split over two
  // pinned printings must not restart at 0 and hand two copies the same key.
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

  const pct = formatChancePct;

  return (
    <div className="flex flex-col gap-8 @3xl:flex-row @3xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                !bench && "bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              N
            </Kbd>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={mulliganSelected}
            disabled={!bench || bench.mulliganUsed || bench.hasDrawn || selected.size === 0}
            aria-keyshortcuts="M"
          >
            Mulligan
            <Kbd className="max-sm:hidden">M</Kbd>
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
              const canMulligan = !bench.mulliganUsed && !bench.hasDrawn;
              return (
                <Pressable
                  key={card.key}
                  {...cardHoverProps(onHoverCard, card.cardId, card.preferredPrintingId)}
                  onClick={() => toggleSelected(card.key)}
                  aria-pressed={isSelected}
                  aria-label={canMulligan ? `${card.cardName} — select to mulligan` : card.cardName}
                  style={{ borderRadius: CARD_BORDER_RADIUS }}
                  className={cn(
                    "transition-transform",
                    canMulligan && "hover:-translate-y-1",
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
        {bench && selected.size > 0 && (
          <LibraryOddsLine
            lead={`Exchanging ${selected.size}:`}
            rows={mulliganRows}
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
                <SectionHeading as="span" size="sm">
                  Sideboard test
                </SectionHeading>
              </ExpandToggle>
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
            {/* Collapsing hides the controls only; active swaps keep shaping the odds. */}
            {sideboardOpen && (
              <>
                <SwapColumns
                  swaps={swaps}
                  maindeckCandidates={mainRows}
                  sideboardCandidates={sideboardRows}
                  onAdd={addSwap}
                  onSetQuantity={setSwapQuantity}
                  onRemove={removeSwap}
                  // Caps at what the zone actually holds; these copies feed the odds math directly.
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

      {(oddsRows.length > 0 || hasRunes) && (
        <div className="flex w-full shrink-0 flex-col gap-6 @3xl:w-96 @7xl:grid @7xl:w-[49.5rem] @7xl:grid-cols-2 @7xl:items-start">
          {oddsRows.length > 0 && (
            <div>
              <div className="text-muted-foreground text-2xs mb-1.5 flex items-center font-semibold tracking-wide uppercase">
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
                    {!canCustomize && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Copy this deck to your decks to make your own groups.
                      </p>
                    )}
                    {(customDefs.length > 0 || canCustomize) && (
                      <SectionHeading as="h3" size="sm" className="mt-3 mb-1">
                        This deck
                      </SectionHeading>
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
                              "flex items-center gap-2 rounded-md px-1 py-1 text-sm",
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
                          <SectionHeading as="h3" size="sm" className="mt-3 mb-1">
                            {theme}
                          </SectionHeading>
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
                                    "flex items-center gap-2 rounded-md px-1 py-1 text-sm",
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
                      <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        Hand
                      </th>
                      <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        First 7
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Group rows first, then per-card rows below. */}
                    {groupRows.map((row) => {
                      const inHand = inHandGroupCounts.get(row.key) ?? 0;
                      return (
                        <tr key={row.key} className="bg-muted/50 border-t">
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
          <RuneOddsPanel cards={cards} />
        </div>
      )}
    </div>
  );
}
