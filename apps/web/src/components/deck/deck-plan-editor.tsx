import type { DeckFormat, DeckZone } from "@openrift/shared";
import { legendDisplayName, WellKnown } from "@openrift/shared";
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { use, useState } from "react";
import { createPortal } from "react-dom";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { HoverHandler } from "@/components/deck/deck-card-picker";
import { CardChip, CardPicker } from "@/components/deck/deck-card-picker";
import { PlanTabActionsContext } from "@/components/deck/deck-overview";
import { SwapColumns } from "@/components/deck/swap-column-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
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
import { sortOverviewCards } from "@/lib/deck-card-sort";
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
  maindeckCandidates: { cardId: string; cardName: string; quantity: number }[];
  sideboardCandidates: { cardId: string; cardName: string; quantity: number }[];
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
  // Cap each quantity box at the copies the zone actually holds. A card that
  // has since left the deck isn't in the candidates any more — leave it
  // uncapped so the row stays editable, and let the amber
  // out-exceeds-maindeck / in-exceeds-sideboard warnings report the drift.
  const maxSwapQuantity = (cardId: string, direction: SwapDirection) => {
    const candidates = direction === "out" ? maindeckCandidates : sideboardCandidates;
    return (
      candidates.find((candidate) => candidate.cardId === cardId)?.quantity ??
      Number.POSITIVE_INFINITY
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

          <SwapColumns
            swaps={matchup.swaps}
            maindeckCandidates={maindeckCandidates}
            sideboardCandidates={sideboardCandidates}
            onAdd={addSwap}
            onSetQuantity={setSwapQuantity}
            onRemove={removeSwap}
            onHoverCard={onHoverCard}
            maxQuantityFor={maxSwapQuantity}
          />

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
  const actionsSlot = use(PlanTabActionsContext);
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
  // Swap pickers list cards in the deck list's default order. Rows stay
  // per-entry, but the copy count sums a card's pinned printings so "of N"
  // reports what the zone really holds.
  const zoneCandidates = (zone: DeckZone) => {
    const inZone = deckCards.filter((card) => card.zone === zone);
    const totalByCard = new Map<string, number>();
    for (const card of inZone) {
      totalByCard.set(card.cardId, (totalByCard.get(card.cardId) ?? 0) + card.quantity);
    }
    return sortOverviewCards(inZone, zone).map((card) => ({
      cardId: card.cardId,
      cardName: card.cardName,
      quantity: totalByCard.get(card.cardId) ?? card.quantity,
    }));
  };
  const maindeckCandidates = zoneCandidates(WellKnown.deckZone.MAIN);
  const sideboardCandidates = zoneCandidates(WellKnown.deckZone.SIDEBOARD);
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

  // The host (the overview's Plan tab) lends a slot in its tab row; labels
  // collapse to their icons on phones so the row fits beside the tabs.
  const actions = (
    <>
      {isDirty ? (
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Unsaved changes
        </Badge>
      ) : null}
      {savePlan.isError ? (
        <span className="text-destructive hidden text-sm sm:inline">Save failed</span>
      ) : null}
      {isPlanDraftEmpty(draft) ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label="Clear plan"
          onClick={() => setClearConfirmOpen(true)}
        >
          <Trash2Icon />
          <span className="hidden sm:inline">Clear plan</span>
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => savePlan.mutate({ deckId, plan: planDraftToSaveInput(draft) })}
        disabled={!isDirty || savePlan.isPending}
      >
        {savePlan.isPending ? "Saving…" : "Save plan"}
      </Button>
    </>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* No host slot (standalone use): the actions stay inline at the top. */}
      {actionsSlot === undefined && <div className="flex items-center gap-2">{actions}</div>}
      {actionsSlot ? createPortal(actions, actionsSlot) : null}

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
