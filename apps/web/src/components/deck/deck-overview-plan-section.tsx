import type { DeckPlanResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import type { CardMetaLookup } from "@/components/deck/deck-plan-view";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pressable } from "@/components/ui/pressable";
import { useCards } from "@/hooks/use-cards";
import { deckPlanQueryOptions } from "@/hooks/use-deck-plan";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useRequiredUserId } from "@/lib/auth-session";
import {
  buildPlanCardMeta,
  isPlanDraftEmpty,
  planResponseToDraft,
  planSummary,
} from "@/lib/deck-plan";
import { cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

type HoverHandler = (cardId: string | null, preferredPrintingId?: string | null) => void;
type ClickHandler = (cardId: string) => void;

/**
 * Read-only plan on the editor overview dashboard. Renders nothing until a plan
 * exists, then shows a collapsed section (full editing still lives on the Plan
 * tab, reachable via the inline Edit button). SSR-safe: the plan loads through
 * plain react-query and the catalog is already in cache on this surface.
 *
 * This is a deliberately more visual presentation than the editor's read-only
 * view (e.g. battlefields render as large landscape thumbnails, matching the
 * deck overview's battlefield zone), not a 1:1 reuse of `DeckPlanView`.
 * @returns The collapsible plan section, or null when there's no plan.
 */
export function DeckOverviewPlanSection({
  deckId,
  onHoverCard,
  onCardClick,
}: {
  deckId: string;
  onHoverCard?: HoverHandler;
  onCardClick?: ClickHandler;
}) {
  const userId = useRequiredUserId();
  const planQuery = useQuery(deckPlanQueryOptions(userId, deckId));
  const { cardsById } = useCards();
  const { getPreferredFrontImage } = usePreferredPrinting();
  const setPlanActive = useDeckBuilderUiStore((state) => state.setPlanActive);

  const plan = planQuery.data?.plan;
  if (!plan || isPlanDraftEmpty(planResponseToDraft(plan))) {
    return null;
  }

  const planCardMeta = buildPlanCardMeta(
    plan,
    cardsById,
    (cardId) => getPreferredFrontImage(cardId, null)?.imageId ?? null,
  );
  const metaById = new Map(planCardMeta.map((meta) => [meta.cardId, meta]));
  const lookup: CardMetaLookup = (cardId) => metaById.get(cardId);

  return (
    <Collapsible className="mx-1 mb-4 rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2">
        <CollapsibleTrigger
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-label="Toggle deck plan"
        >
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
          <span className="font-semibold">Deck plan</span>
          <span className="text-muted-foreground truncate text-sm">{planSummary(plan)}</span>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPlanActive(true)}
          className="text-muted-foreground shrink-0"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      </div>
      <CollapsibleContent className="space-y-5 px-3 pb-4">
        {plan.generalStrategy !== "" && (
          <PlanBlock title="Strategy">
            <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
              {plan.generalStrategy}
            </p>
          </PlanBlock>
        )}

        <PlanMulligan plan={plan} />
        <PlanBattlefields
          plan={plan}
          lookup={lookup}
          onHoverCard={onHoverCard}
          onCardClick={onCardClick}
        />

        {plan.matchups.length > 0 && (
          <PlanBlock title="Matchups">
            <div className="grid gap-3 @2xl:grid-cols-2">
              {plan.matchups.map((matchup) => (
                <MatchupCard
                  key={matchup.id}
                  matchup={matchup}
                  lookup={lookup}
                  onHoverCard={onHoverCard}
                  onCardClick={onCardClick}
                />
              ))}
            </div>
          </PlanBlock>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PlanBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function PlanMulligan({ plan }: { plan: DeckPlanResponse }) {
  const hasMulligan = plan.mulliganSplit
    ? plan.mulliganFirst !== "" || plan.mulliganSecond !== ""
    : plan.mulliganGeneral !== "";
  if (!hasMulligan) {
    return null;
  }
  return (
    <PlanBlock title="Mulligan priority">
      {plan.mulliganSplit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs">Going first</div>
            <p className="whitespace-pre-wrap">{plan.mulliganFirst || "—"}</p>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Going second</div>
            <p className="whitespace-pre-wrap">{plan.mulliganSecond || "—"}</p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
          {plan.mulliganGeneral}
        </p>
      )}
    </PlanBlock>
  );
}

// Battlefields render as large landscape thumbnails (h-20 w-28), matching the
// deck overview's battlefield zone, instead of the small inline text+thumb the
// editor read-only view uses.
function PlanBattlefields({
  plan,
  lookup,
  onHoverCard,
  onCardClick,
}: {
  plan: DeckPlanResponse;
  lookup: CardMetaLookup;
  onHoverCard?: HoverHandler;
  onCardClick?: ClickHandler;
}) {
  if (plan.battlefieldCustom) {
    if (plan.battlefieldNote === "") {
      return null;
    }
    return (
      <PlanBlock title="Battlefields">
        <p className="text-muted-foreground max-w-prose whitespace-pre-wrap">
          {plan.battlefieldNote}
        </p>
      </PlanBlock>
    );
  }

  const entries = [
    { label: "Game 1", cardId: plan.battlefieldGame1CardId },
    { label: "Going first", cardId: plan.battlefieldFirstCardId },
    { label: "Going second", cardId: plan.battlefieldSecondCardId },
  ].flatMap((entry) =>
    entry.cardId === null ? [] : [{ label: entry.label, cardId: entry.cardId }],
  );
  if (entries.length === 0) {
    return null;
  }

  return (
    <PlanBlock title="Battlefields">
      <div className="flex flex-wrap gap-4">
        {entries.map((entry) => {
          const meta = lookup(entry.cardId);
          return (
            <div key={entry.label} className="space-y-1">
              <div className="text-muted-foreground text-xs">{entry.label}</div>
              <PlanThumb
                cardId={entry.cardId}
                cardName={meta?.cardName ?? "Unknown card"}
                imageId={meta?.imageId ?? null}
                className="h-20 w-28"
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
              />
            </div>
          );
        })}
      </div>
    </PlanBlock>
  );
}

// One matchup: a hero header (the opponent card's portrait + name when one is
// linked, otherwise just the free-text label), a divider, then the OUT / IN
// sideboard swaps in two columns, with the per-matchup notes underneath.
function MatchupCard({
  matchup,
  lookup,
  onHoverCard,
  onCardClick,
}: {
  matchup: DeckPlanResponse["matchups"][number];
  lookup: CardMetaLookup;
  onHoverCard?: HoverHandler;
  onCardClick?: ClickHandler;
}) {
  const opponentCard = matchup.opponentCardId === null ? null : lookup(matchup.opponentCardId);
  // The linked card is the primary title; the label falls back to it when no
  // card is linked, and rides along as a secondary line when one is.
  const title = opponentCard?.cardName ?? matchup.opponentLabel;
  const secondaryLabel = matchup.opponentCardId === null ? "" : matchup.opponentLabel;
  const outSwaps = matchup.swaps.filter((swap) => swap.direction === "out");
  const inSwaps = matchup.swaps.filter((swap) => swap.direction === "in");
  const hasSwaps = outSwaps.length > 0 || inSwaps.length > 0;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        {matchup.opponentCardId !== null && (
          <PlanThumb
            cardId={matchup.opponentCardId}
            cardName={opponentCard?.cardName ?? "Unknown card"}
            imageId={opponentCard?.imageId ?? null}
            className="aspect-card w-24"
            onHoverCard={onHoverCard}
            onCardClick={onCardClick}
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="space-y-0.5">
            <div className="font-medium">{title}</div>
            {secondaryLabel !== "" && (
              <div className="text-muted-foreground text-sm">{secondaryLabel}</div>
            )}
          </div>
          {matchup.notes !== "" && (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{matchup.notes}</p>
          )}
        </div>
      </div>

      {hasSwaps && (
        <div className="grid gap-4 border-t pt-3 sm:grid-cols-2">
          <MatchupSwapColumn
            label="Out"
            tone="text-destructive"
            sign="−"
            swaps={outSwaps}
            lookup={lookup}
            onHoverCard={onHoverCard}
            onCardClick={onCardClick}
          />
          <MatchupSwapColumn
            label="In"
            tone="text-green-600 dark:text-green-400"
            sign="+"
            swaps={inSwaps}
            lookup={lookup}
            onHoverCard={onHoverCard}
            onCardClick={onCardClick}
          />
        </div>
      )}
    </div>
  );
}

// One side (OUT or IN) of a matchup's swaps, rendered as card images with a
// quantity badge — image-forward like the deck overview's zone thumbnails,
// rather than the share page's thumbnail-plus-text lines.
function MatchupSwapColumn({
  label,
  tone,
  sign,
  swaps,
  lookup,
  onHoverCard,
  onCardClick,
}: {
  label: string;
  tone: string;
  sign: string;
  swaps: { cardId: string; quantity: number }[];
  lookup: CardMetaLookup;
  onHoverCard?: HoverHandler;
  onCardClick?: ClickHandler;
}) {
  return (
    <div className="space-y-1.5">
      <div className={cn("text-2xs font-semibold tracking-wide uppercase", tone)}>
        {sign} {label}
      </div>
      {swaps.length === 0 ? (
        <div className="text-muted-foreground text-sm">No changes</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {swaps.map((swap) => {
            const meta = lookup(swap.cardId);
            return (
              <div key={swap.cardId} className="relative">
                <PlanThumb
                  cardId={swap.cardId}
                  cardName={meta?.cardName ?? "Unknown card"}
                  imageId={meta?.imageId ?? null}
                  className="aspect-card w-16"
                  onHoverCard={onHoverCard}
                  onCardClick={onCardClick}
                />
                {swap.quantity > 1 && (
                  <span className="bg-background/90 text-foreground text-2xs absolute right-0.5 bottom-0.5 rounded px-1 leading-tight font-medium tabular-nums">
                    ×{swap.quantity}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A clickable, hover-previewable card image used across the plan section. The
// `className` sizes the box (e.g. "h-20 w-28" landscape, "aspect-card w-24"
// portrait); object-cover fits the card art to it.
function PlanThumb({
  cardId,
  cardName,
  imageId,
  className,
  onHoverCard,
  onCardClick,
}: {
  cardId: string;
  cardName: string;
  imageId: string | null;
  className: string;
  onHoverCard?: HoverHandler;
  onCardClick?: ClickHandler;
}) {
  // A failed image gets the same "Unknown" box as a card with no image.
  // Keyed by id so a changed image on a reused instance retries fresh.
  const [failedImageId, setFailedImageId] = useState<string | null>(null);
  if (imageId === null || imageId === failedImageId) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-center rounded-md border border-dashed text-xs",
          className,
        )}
      >
        Unknown
      </div>
    );
  }
  return (
    <Pressable
      onClick={() => onCardClick?.(cardId)}
      onMouseEnter={() => onHoverCard?.(cardId)}
      onMouseLeave={() => onHoverCard?.(null)}
      aria-label={`View ${cardName}`}
      className="block shrink-0 rounded-md"
    >
      <img
        src={imageUrl(imageId, "400w")}
        alt={cardName}
        className={cn("rounded-md object-cover shadow-sm", className)}
        onError={() => setFailedImageId(imageId)}
      />
    </Pressable>
  );
}
