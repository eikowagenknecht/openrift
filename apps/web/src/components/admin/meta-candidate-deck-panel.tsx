import type { MetaCandidateDeck } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { ArchiveXIcon, CheckIcon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CandidateStateBadge, ConfirmActionButton } from "@/components/admin/meta-candidate-shared";
import { MetaCardNamePicker } from "@/components/admin/meta-card-name-picker";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { DeckIdentityLine } from "@/components/deck/deck-identity-line";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import {
  useAcceptMetaCandidateDeck,
  useCheckMetaCandidateDeck,
  useIgnoreMetaCandidateDeck,
} from "@/hooks/use-admin-meta-candidates";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useZoneOrder } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import {
  formatCardDeltaLines,
  formatDiffValue,
  groupCandidateCardsByZone,
  hasDeckChanges,
} from "@/lib/meta-candidate-review";
import { formatFinishTier } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * Why this deck cannot be archived yet, if anything. The parent event's own
 * accept gate is not repeated here — the page states it once above the list.
 *
 * @param deck - The candidate deck.
 * @returns The blocking reason, or null when the deck is ready.
 */
function acceptBlockedReason(deck: MetaCandidateDeck): string | null {
  if (deck.unresolvedNames.length > 0) {
    const count = deck.unresolvedNames.length;
    return `${count} card ${count === 1 ? "name" : "names"} still unmatched.`;
  }
  return null;
}

interface MetaCandidateDeckPanelProps {
  deck: MetaCandidateDeck;
  /** Whether the parent candidate event is already linked to a live event. */
  eventAccepted: boolean;
}

/**
 * One candidate deck in the review page (ADR-014): its metadata, its card list,
 * the names that matched nothing, and the diff against the live deck once it is
 * linked. A deck is archived on its own, so an event with one bad decklist
 * still publishes the rest.
 *
 * @returns The deck panel.
 */
export function MetaCandidateDeckPanel({ deck, eventAccepted }: MetaCandidateDeckPanelProps) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const domainColors = useDomainColors();
  const acceptDeck = useAcceptMetaCandidateDeck();
  const checkDeck = useCheckMetaCandidateDeck();
  const ignoreDeck = useIgnoreMetaCandidateDeck();
  const [expanded, setExpanded] = useState(false);

  // A candidate's zone slugs come from the source, so one may name no
  // configured zone; that is a boundary value, not a missing enum label.
  function zoneLabel(zone: string): string {
    return zoneLabels[zone as keyof typeof zoneLabels] ?? zone;
  }

  const blockedReason = acceptBlockedReason(deck);
  const reviewed = deck.checkedAt !== null;
  const groups = groupCandidateCardsByZone(deck.cards, zoneOrder);
  const copies = deck.cards.reduce((total, card) => total + card.quantity, 0);
  const showDiff = hasDeckChanges(deck.diff);
  const deltaLines = deck.diff ? formatCardDeltaLines(deck.diff.cards, zoneLabel) : [];

  // The deck's identity, deck-list style: matched legend/champion resolve to
  // real cards (art, epithet folding); an unmatched legend still shows the
  // source's raw name so the row never reads as anonymous.
  const legendEntry = deck.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const championEntry = deck.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  const legendCard = legendEntry?.cardId
    ? getPreferredPrinting(legendEntry.cardId)?.card
    : undefined;
  const championCard = championEntry?.cardId
    ? getPreferredPrinting(championEntry.cardId)?.card
    : undefined;
  const legendImage = legendEntry?.cardId
    ? (getPreferredFrontImage(legendEntry.cardId) ?? null)
    : null;
  const legendDomains = legendCard?.domains;
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  async function handleAccept() {
    try {
      await acceptDeck.mutateAsync({ id: deck.id });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Archived ${deck.playerName}'s deck`);
  }

  return (
    <div className="rounded-lg border p-3" style={gradientStyle}>
      <div className="flex flex-wrap items-center gap-2">
        <CardArtThumb imageId={legendImage?.imageId ?? null} className="w-8 shrink-0" alt="" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {deck.name !== null && <span className="truncate font-medium">{deck.name}</span>}
            {legendCard || championCard ? (
              <DeckIdentityLine
                legendCard={legendCard}
                championCard={championCard}
                className={cn(deck.name !== null && "text-muted-foreground")}
              />
            ) : (
              legendEntry && <span className="truncate font-medium">{legendEntry.name}</span>
            )}
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            {formatFinishTier(deck.finishTier)} · {deck.playerName}
            {deck.record !== null && ` · ${deck.record}`}
          </p>
        </div>
        <CandidateStateBadge state={deck.state} />
        <MetaListStatusBadge listStatus={deck.listStatus} />
        {deck.unresolvedNames.length > 0 && (
          <Badge variant="destructive">{deck.unresolvedNames.length} unmatched</Badge>
        )}
        {reviewed && <Badge variant="muted">Reviewed</Badge>}
        {deck.shareToken && (
          <MetaPublicLinkButton
            href={`/meta/decks/${deck.shareToken}`}
            label="Live deck"
            ariaLabel={`Open ${deck.playerName}'s archived deck`}
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAccept}
            disabled={!eventAccepted || blockedReason !== null || acceptDeck.isPending}
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={checkDeck.isPending}
            onClick={() => checkDeck.mutate({ id: deck.id, checked: !reviewed })}
          >
            {reviewed ? <UndoIcon /> : <CheckIcon />}
            {reviewed ? "Unmark" : "Mark reviewed"}
          </Button>
          <ConfirmActionButton
            title={`Ignore ${deck.playerName}'s deck?`}
            description="The staged deck is deleted, and future uploads skip this key until you unignore it."
            confirmLabel="Ignore"
            onConfirm={() => ignoreDeck.mutateAsync({ id: deck.id })}
          >
            <ArchiveXIcon />
            Ignore
          </ConfirmActionButton>
        </div>
      </div>

      {blockedReason && <p className="text-muted-foreground mt-1 text-sm">{blockedReason}</p>}

      {deck.unresolvedNames.length > 0 && (
        <div className="mt-2 space-y-1">
          {deck.unresolvedNames.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-destructive">{name}</span>
              <MetaCardNamePicker name={name} />
            </div>
          ))}
        </div>
      )}

      {showDiff && deck.diff && (
        <div className="mt-2 space-y-1 rounded-md border p-2 text-sm">
          {deck.diff.fields.map((field) => (
            <p key={field.field}>
              <span className="text-muted-foreground">{field.field}: </span>
              {formatDiffValue(field.from)} → {formatDiffValue(field.to)}
            </p>
          ))}
          {/* Keyed by position too: two rows can render the same text when one
              card name covers two card ids. */}
          {deltaLines.map((line, index) => (
            <p key={`${index}\n${line}`} className="font-mono">
              {line}
            </p>
          ))}
        </div>
      )}

      <ExpandToggle
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground mt-2 text-sm"
      >
        {copies} {copies === 1 ? "copy" : "copies"} across {deck.cards.length}{" "}
        {deck.cards.length === 1 ? "row" : "rows"}
      </ExpandToggle>

      {expanded && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.zone}>
              <p className="text-muted-foreground text-sm">{zoneLabel(group.zone)}</p>
              <ul>
                {group.cards.map((card) => (
                  <li
                    key={`${card.zone}-${card.name}`}
                    className={cn("tabular-nums", card.cardId === null && "text-destructive")}
                  >
                    {card.quantity}× {card.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
