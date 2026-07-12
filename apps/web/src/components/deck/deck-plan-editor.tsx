import type { DeckFormat } from "@openrift/shared";
import { getOrientation, imageUrl, legendDisplayName, WellKnown } from "@openrift/shared";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import type { CardSearchResult } from "@/components/cards/card-search-dropdown";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { useDeckPlan, useSaveDeckPlan } from "@/hooks/use-deck-plan";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  computePlanWarnings,
  createEmptyMatchup,
  createEmptyPlanDraft,
  isMatchupComplete,
  isPlanDraftEmpty,
  planDraftToSaveInput,
  planResponseToDraft,
} from "@/lib/deck-plan";
import type {
  DeckPlanContext,
  PlanDraft,
  PlanMatchupDraft,
  PlanWarning,
  SwapDirection,
} from "@/lib/deck-plan";
import { zoneExpected } from "@/lib/deck-zone-labels";
import { cn } from "@/lib/utils";

type HoverHandler = (cardId: string | null, preferredPrintingId?: string | null) => void;

function buildContext(deckCards: DeckBuilderCard[]): DeckPlanContext {
  const maindeck = new Map<string, number>();
  const sideboard = new Map<string, number>();
  const battlefieldCardIds = new Set<string>();
  for (const card of deckCards) {
    if (card.zone === WellKnown.deckZone.MAIN) {
      maindeck.set(card.cardId, card.quantity);
    } else if (card.zone === WellKnown.deckZone.SIDEBOARD) {
      sideboard.set(card.cardId, card.quantity);
    } else if (card.zone === WellKnown.deckZone.BATTLEFIELD) {
      battlefieldCardIds.add(card.cardId);
    }
  }
  return { maindeck, sideboard, battlefieldCardIds };
}

function toResults(
  cards: { cardId: string; cardName: string; cardType?: string }[],
  query: string,
): CardSearchResult[] {
  const needle = query.trim().toLowerCase();
  return cards
    .filter((card) => needle === "" || card.cardName.toLowerCase().includes(needle))
    .slice(0, 50)
    .map((card) => ({ id: card.cardId, label: card.cardName, detail: card.cardType }));
}

// A compact thumbnail + name chip for a picked card. Hovering shows the full
// card via the page's floating preview (the opponent card isn't in the deck, so
// the name/image come from the catalog).
function CardChip({
  cardId,
  onRemove,
  onHoverCard,
  variant = "pill",
}: {
  cardId: string;
  onRemove?: () => void;
  onHoverCard?: HoverHandler;
  /** "pill" is a compact inline chip; "field" fills the row like an input box. */
  variant?: "pill" | "field";
}) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const printing = getPreferredPrinting(cardId);
  const frontImage = printing?.images.find((image) => image.face === "front");
  const landscape = getOrientation(printing?.card.types ?? []) === "landscape";
  const field = variant === "field";
  return (
    <span
      className={cn(
        "min-w-0 items-center text-sm",
        field
          ? "dark:bg-input/30 border-input flex h-8 w-full gap-2 rounded-lg border bg-transparent px-2.5"
          : "bg-muted/60 inline-flex gap-1.5 rounded-md py-0.5 pr-1 pl-1.5",
      )}
      onMouseEnter={() => onHoverCard?.(cardId)}
      onMouseLeave={() => onHoverCard?.(null)}
    >
      {frontImage ? (
        <ImgWithFallback
          src={imageUrl(frontImage.imageId, "400w")}
          alt=""
          className={cn("shrink-0 rounded-xs object-cover", landscape ? "h-5 w-8" : "h-7 w-5")}
          fallback={null}
        />
      ) : null}
      <span className="truncate">
        {printing ? legendDisplayName(printing.card) : "Unknown card"}
      </span>
      {onRemove ? (
        <ChipRemoveButton
          onClick={onRemove}
          aria-label="Remove"
          className={cn("text-muted-foreground shrink-0 p-0.5", field ? "ml-auto" : "ml-0")}
        >
          <XIcon className="size-3.5" />
        </ChipRemoveButton>
      ) : null}
    </span>
  );
}

// Searchable picker over a fixed candidate set (deck zone cards or the catalog).
// Remounts the dropdown after each pick so its input clears instead of keeping
// the chosen label.
function CardPicker({
  candidates,
  onSelect,
  placeholder,
}: {
  candidates: { cardId: string; cardName: string; cardType?: string }[];
  onSelect: (cardId: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  // The combobox fires onInputValueChange with the picked label as it fills the
  // input on selection, which would leave `query` stuck on that card and filter
  // the next open down to just it. Clearing here, after the remount, wins over
  // that late update.
  useEffect(() => {
    setQuery("");
  }, [resetKey]);
  return (
    <CardSearchDropdown
      key={resetKey}
      results={toResults(candidates, query)}
      onSearch={setQuery}
      onSelect={(cardId) => {
        onSelect(cardId);
        setResetKey((key) => key + 1);
      }}
      placeholder={placeholder}
      className="h-8"
    />
  );
}

// The small uppercase field label used across the matchup editor, matching the
// "Out (maindeck)" / "In (sideboard)" swap-column headers.
function ColumnLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-2xs text-muted-foreground font-semibold tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

function warningMessage(warning: PlanWarning, nameOf: (cardId: string) => string): string {
  switch (warning.code) {
    case "matchup-no-opponent": {
      return "Name this matchup or link a card.";
    }
    case "swap-unbalanced": {
      return `Swaps don’t balance: ${warning.outCount} out, ${warning.inCount} in.`;
    }
    case "in-exceeds-sideboard": {
      return `Bringing in ${warning.requested}× ${nameOf(warning.cardId)}, but the sideboard has ${warning.available}.`;
    }
    case "out-exceeds-maindeck": {
      return `Taking out ${warning.requested}× ${nameOf(warning.cardId)}, but the maindeck has ${warning.available}.`;
    }
    case "battlefield-not-in-deck": {
      return `${nameOf(warning.cardId)} isn’t a battlefield in this deck.`;
    }
    case "battlefield-duplicate": {
      return `${nameOf(warning.cardId)} is chosen for more than one scenario.`;
    }
  }
}

function WarningList({
  warnings,
  nameOf,
}: {
  warnings: PlanWarning[];
  nameOf: (cardId: string) => string;
}) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {warnings.map((warning, index) => (
        <li
          key={index}
          className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-400"
        >
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{warningMessage(warning, nameOf)}</span>
        </li>
      ))}
    </ul>
  );
}

interface MatchupEditorProps {
  matchup: PlanMatchupDraft;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  cardCandidates: { cardId: string; cardName: string; cardType?: string }[];
  maindeckCandidates: { cardId: string; cardName: string }[];
  sideboardCandidates: { cardId: string; cardName: string }[];
  warnings: PlanWarning[];
  nameOf: (cardId: string) => string;
  onHoverCard?: HoverHandler;
  onChange: (partial: Partial<PlanMatchupDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function MatchupEditor({
  matchup,
  index,
  isFirst,
  isLast,
  cardCandidates,
  maindeckCandidates,
  sideboardCandidates,
  warnings,
  nameOf,
  onHoverCard,
  onChange,
  onMove,
  onRemove,
}: MatchupEditorProps) {
  const [collapsed, setCollapsed] = useState(false);

  // The linked card is the primary name; the label is secondary (or primary on
  // its own when no card is linked).
  const cardName = matchup.opponentCardId ? nameOf(matchup.opponentCardId) : null;
  const label = matchup.opponentLabel.trim();
  const hasOpponent = cardName !== null || label !== "";
  const summaryTitle = cardName
    ? label
      ? `${cardName} · ${label}`
      : cardName
    : label || "New matchup";
  const outCount = matchup.swaps
    .filter((swap) => swap.direction === "out")
    .reduce((total, swap) => total + swap.quantity, 0);
  const inCount = matchup.swaps
    .filter((swap) => swap.direction === "in")
    .reduce((total, swap) => total + swap.quantity, 0);

  const addSwap = (direction: SwapDirection, cardId: string) => {
    if (matchup.swaps.some((swap) => swap.cardId === cardId && swap.direction === direction)) {
      return;
    }
    onChange({ swaps: [...matchup.swaps, { cardId, direction, quantity: 1 }] });
  };
  const setSwapQuantity = (swapIndex: number, quantity: number) => {
    onChange({
      swaps: matchup.swaps.map((swap, i) => (i === swapIndex ? { ...swap, quantity } : swap)),
    });
  };
  const removeSwap = (swapIndex: number) => {
    onChange({ swaps: matchup.swaps.filter((_, i) => i !== swapIndex) });
  };

  const renderColumn = (direction: SwapDirection) => {
    const swaps = matchup.swaps
      .map((swap, swapIndex) => ({ swap, swapIndex }))
      .filter((entry) => entry.swap.direction === direction);
    // Drop cards already in this column — re-adding them is a no-op.
    const used = new Set(swaps.map((entry) => entry.swap.cardId));
    const candidates = (direction === "out" ? maindeckCandidates : sideboardCandidates).filter(
      (candidate) => !used.has(candidate.cardId),
    );
    return (
      <div className="flex-1 space-y-2">
        <div className="text-2xs font-semibold tracking-wide uppercase">
          {direction === "out" ? (
            <span className="text-destructive">− Out (maindeck)</span>
          ) : (
            <span className="text-green-600 dark:text-green-400">+ In (sideboard)</span>
          )}
        </div>
        {swaps.map(({ swap, swapIndex }) => (
          <div key={`${swap.cardId}-${swap.direction}`} className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={99}
              value={swap.quantity}
              onChange={(event) =>
                setSwapQuantity(swapIndex, Math.max(1, Number(event.target.value) || 1))
              }
              className="h-8 w-12 shrink-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              aria-label="Quantity"
            />
            <div className="min-w-0 flex-1">
              <CardChip
                cardId={swap.cardId}
                variant="field"
                onRemove={() => removeSwap(swapIndex)}
                onHoverCard={onHoverCard}
              />
            </div>
          </div>
        ))}
        <CardPicker
          candidates={candidates}
          onSelect={(cardId) => addSwap(direction, cardId)}
          placeholder={direction === "out" ? "Add a card to cut…" : "Add a card to bring in…"}
        />
      </div>
    );
  };

  return (
    <div className="bg-card/40 rounded-lg border">
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2",
          !collapsed && "border-b",
        )}
      >
        <ExpandToggle
          expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="min-w-0 flex-1"
        >
          <span
            className={cn("truncate text-sm font-medium", !hasOpponent && "text-muted-foreground")}
          >
            {summaryTitle}
          </span>
          {outCount + inCount > 0 ? (
            <span className="text-muted-foreground shrink-0 text-xs">
              −{outCount}/+{inCount}
            </span>
          ) : null}
        </ExpandToggle>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isFirst}
            onClick={() => onMove(-1)}
            aria-label="Move up"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isLast}
            onClick={() => onMove(1)}
            aria-label="Move down"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove matchup ${index + 1}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="space-y-3 p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <ColumnLabel>Key card</ColumnLabel>
              <div className="h-8">
                {matchup.opponentCardId ? (
                  <CardChip
                    cardId={matchup.opponentCardId}
                    variant="field"
                    onRemove={() => onChange({ opponentCardId: null })}
                    onHoverCard={onHoverCard}
                  />
                ) : (
                  <CardPicker
                    candidates={cardCandidates}
                    onSelect={(cardId) => onChange({ opponentCardId: cardId })}
                    placeholder="Search a card (Diana, Aurora…)"
                  />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <ColumnLabel>Build</ColumnLabel>
              <Input
                value={matchup.opponentLabel}
                onChange={(event) => onChange({ opponentLabel: event.target.value })}
                placeholder="e.g. Scorn of the Moon, Aggro, Control"
                maxLength={120}
                className="h-8 w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            {renderColumn("out")}
            {renderColumn("in")}
          </div>

          <WarningList warnings={warnings} nameOf={nameOf} />

          <div className="space-y-2">
            <ColumnLabel>Matchup notes</ColumnLabel>
            <Textarea
              value={matchup.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="Optional"
              rows={2}
              maxLength={4000}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// The deck Plan editor (ADR-029): deck-level strategy + mulligan + battlefields,
// plus matchup sideboard swaps.
export function DeckPlanEditor({
  deckId,
  deckCards,
  format,
  onHoverCard,
}: {
  deckId: string;
  deckCards: DeckBuilderCard[];
  format: DeckFormat;
  onHoverCard?: HoverHandler;
}) {
  const { data } = useDeckPlan(deckId);
  const savePlan = useSaveDeckPlan();
  const { allPrintings } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels } = useEnumOrders();
  const [draft, setDraft] = useState<PlanDraft>(() => planResponseToDraft(data.plan));
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Formats that play a single battlefield (Custom Region) get one slot
  // instead of the Game 1 / going-first / going-second trio.
  const singleBattlefield = zoneExpected(WellKnown.deckZone.BATTLEFIELD, format) === 1;

  const context = buildContext(deckCards);
  const warnings = computePlanWarnings(draft, context);
  const battlefieldWarnings = warnings.filter(
    (warning) =>
      warning.code === "battlefield-not-in-deck" || warning.code === "battlefield-duplicate",
  );
  const nameOf = (cardId: string) => getPreferredPrinting(cardId)?.card.name ?? "a card";

  // Candidate sets for the pickers. The opponent card can be any catalog card
  // (a Legend, Aurora, a domain signpost), deduped by card id.
  const cardSeen = new Set<string>();
  const cardCandidates: { cardId: string; cardName: string; cardType?: string }[] = [];
  for (const printing of allPrintings) {
    if (!cardSeen.has(printing.cardId)) {
      cardSeen.add(printing.cardId);
      cardCandidates.push({
        cardId: printing.cardId,
        cardName: legendDisplayName(printing.card),
        cardType: printing.card.types.map((slug) => labels.cardTypes[slug]).join(" "),
      });
    }
  }
  const maindeckCandidates = deckCards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .map((card) => ({ cardId: card.cardId, cardName: card.cardName }));
  const sideboardCandidates = deckCards
    .filter((card) => card.zone === WellKnown.deckZone.SIDEBOARD)
    .map((card) => ({ cardId: card.cardId, cardName: card.cardName }));
  const battlefieldCandidates = deckCards
    .filter((card) => card.zone === WellKnown.deckZone.BATTLEFIELD)
    .map((card) => ({ cardId: card.cardId, cardName: card.cardName }));

  const savedPayload = JSON.stringify(planDraftToSaveInput(planResponseToDraft(data.plan)));
  const draftPayload = JSON.stringify(planDraftToSaveInput(draft));
  const isDirty = savedPayload !== draftPayload;

  const updateMatchup = (index: number, partial: Partial<PlanMatchupDraft>) => {
    setDraft((current) => ({
      ...current,
      matchups: current.matchups.map((matchup, i) =>
        i === index ? { ...matchup, ...partial } : matchup,
      ),
    }));
  };
  const moveMatchup = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const next = [...current.matchups];
      const target = index + direction;
      const moved = next[index];
      const replaced = next[target];
      if (!moved || !replaced) {
        return current;
      }
      next[index] = replaced;
      next[target] = moved;
      return { ...current, matchups: next };
    });
  };

  const setBattlefield = (
    key: "battlefieldGame1CardId" | "battlefieldFirstCardId" | "battlefieldSecondCardId",
    cardId: string | null,
  ) => {
    setDraft((current) => ({ ...current, [key]: cardId }));
  };

  const battlefieldRow = (
    label: string,
    key: "battlefieldGame1CardId" | "battlefieldFirstCardId" | "battlefieldSecondCardId",
  ) => {
    const value = draft[key];
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-sm">{label}</span>
        {value ? (
          <CardChip
            cardId={value}
            variant="field"
            onRemove={() => setBattlefield(key, null)}
            onHoverCard={onHoverCard}
          />
        ) : battlefieldCandidates.length > 0 ? (
          <CardPicker
            candidates={battlefieldCandidates}
            onSelect={(cardId) => setBattlefield(key, cardId)}
            placeholder="Choose a battlefield…"
          />
        ) : (
          <span className="text-muted-foreground text-sm">
            Add battlefields to your deck to choose them here.
          </span>
        )}
      </div>
    );
  };

  const completeMatchups = draft.matchups.filter(isMatchupComplete).length;

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-background/80 sticky top-(--sticky-top) z-10 -mx-1 flex items-center justify-between gap-3 px-1 py-2 backdrop-blur-lg">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Plan</h2>
          {isDirty ? <Badge variant="secondary">Unsaved changes</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          {savePlan.isError ? <span className="text-destructive text-sm">Save failed</span> : null}
          {isPlanDraftEmpty(draft) ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setClearConfirmOpen(true)}
            >
              <Trash2Icon className="size-4" />
              Clear plan
            </Button>
          )}
          <Button
            onClick={() => savePlan.mutate({ deckId, plan: planDraftToSaveInput(draft) })}
            disabled={!isDirty || savePlan.isPending}
          >
            {savePlan.isPending ? "Saving…" : "Save plan"}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground">
        An optional plan for piloting this deck: your gameplan, mulligan priorities, battlefield
        choices, and how to sideboard against specific opponents.
      </p>

      <section className="space-y-2">
        <Label htmlFor="plan-strategy">General strategy</Label>
        <Textarea
          id="plan-strategy"
          value={draft.generalStrategy}
          onChange={(event) =>
            setDraft((current) => ({ ...current, generalStrategy: event.target.value }))
          }
          placeholder="How the deck wins, what to prioritise, lines to watch for…"
          rows={4}
          maxLength={8000}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Mulligan priority</h3>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch
              checked={draft.mulliganSplit}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, mulliganSplit: checked === true }))
              }
            />
            Different on the play vs the draw
          </Label>
        </div>
        {draft.mulliganSplit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-sm">Going first</span>
              <Textarea
                value={draft.mulliganFirst}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, mulliganFirst: event.target.value }))
                }
                rows={3}
                maxLength={4000}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-sm">Going second</span>
              <Textarea
                value={draft.mulliganSecond}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, mulliganSecond: event.target.value }))
                }
                rows={3}
                maxLength={4000}
              />
            </div>
          </div>
        ) : (
          <Textarea
            value={draft.mulliganGeneral}
            onChange={(event) =>
              setDraft((current) => ({ ...current, mulliganGeneral: event.target.value }))
            }
            placeholder="Cards or hands to keep, what to ship…"
            rows={3}
            maxLength={4000}
          />
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Battlefields</h3>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch
              checked={draft.battlefieldCustom}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, battlefieldCustom: checked === true }))
              }
            />
            Custom plan
          </Label>
        </div>
        {draft.battlefieldCustom ? (
          <Textarea
            value={draft.battlefieldNote}
            onChange={(event) =>
              setDraft((current) => ({ ...current, battlefieldNote: event.target.value }))
            }
            placeholder="Describe your battlefield plan…"
            rows={3}
            maxLength={4000}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {singleBattlefield ? (
                <>
                  {/* One battlefield in play — a single slot. Stale extra picks
                      (saved before a format switch) stay visible so they can
                      be cleared, but no new ones can be chosen. */}
                  {battlefieldRow("Battlefield", "battlefieldGame1CardId")}
                  {draft.battlefieldFirstCardId
                    ? battlefieldRow("Going first", "battlefieldFirstCardId")
                    : null}
                  {draft.battlefieldSecondCardId
                    ? battlefieldRow("Going second", "battlefieldSecondCardId")
                    : null}
                </>
              ) : (
                <>
                  {battlefieldRow("Game 1", "battlefieldGame1CardId")}
                  {battlefieldRow("Going first", "battlefieldFirstCardId")}
                  {battlefieldRow("Going second", "battlefieldSecondCardId")}
                </>
              )}
            </div>
            <WarningList warnings={battlefieldWarnings} nameOf={nameOf} />
          </>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">
            Matchups
            {completeMatchups > 0 ? (
              <span className="text-muted-foreground ml-1 font-normal">({completeMatchups})</span>
            ) : null}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                matchups: [...current.matchups, createEmptyMatchup()],
              }))
            }
          >
            <PlusIcon className="size-4" />
            Add matchup
          </Button>
        </div>
        {draft.matchups.length === 0 ? (
          <p className="text-muted-foreground">
            No matchups yet. Add one to plan your sideboard against a specific opponent.
          </p>
        ) : (
          <div className="space-y-3">
            {draft.matchups.map((matchup, index) => (
              <MatchupEditor
                // Keyed by the stable client uid so each matchup's component
                // instance (and its collapse state) follows it across reorders.
                key={matchup.uid}
                matchup={matchup}
                index={index}
                isFirst={index === 0}
                isLast={index === draft.matchups.length - 1}
                cardCandidates={cardCandidates}
                maindeckCandidates={maindeckCandidates}
                sideboardCandidates={sideboardCandidates}
                warnings={warnings.filter(
                  (warning) => "matchupIndex" in warning && warning.matchupIndex === index,
                )}
                nameOf={nameOf}
                onHoverCard={onHoverCard}
                onChange={(partial) => updateMatchup(index, partial)}
                onMove={(direction) => moveMatchup(index, direction)}
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    matchups: current.matchups.filter((_, i) => i !== index),
                  }))
                }
              />
            ))}
          </div>
        )}
      </section>

      <ConfirmActionDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear this plan?"
        description="This removes the strategy, mulligan notes, battlefields, and all matchups. This can't be undone."
        confirmLabel="Clear plan"
        pendingLabel="Clearing…"
        isPending={savePlan.isPending}
        onConfirm={() => {
          const empty = createEmptyPlanDraft();
          setDraft(empty);
          savePlan.mutate(
            { deckId, plan: planDraftToSaveInput(empty) },
            { onSuccess: () => setClearConfirmOpen(false) },
          );
        }}
      />
    </div>
  );
}
