import type { MetaCandidatePlayer } from "@openrift/shared";
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
  useAcceptMetaCandidatePlayer,
  useCheckMetaCandidatePlayer,
  useIgnoreMetaCandidatePlayer,
} from "@/hooks/use-admin-meta-candidates";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useZoneOrder } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import {
  formatCardDeltaLines,
  formatDiffValue,
  groupCandidateCardsByZone,
  hasCandidateChanges,
} from "@/lib/meta-candidate-review";
import { formatRank, formatRecord } from "@/lib/meta-format";
import { needsUnresolvedLegendConfirm } from "@/lib/meta-player-roster";
import { cn } from "@/lib/utils";

/**
 * Why this row cannot be filed yet, if anything. The parent event's own accept
 * gate is not repeated here — the page states it once above the list.
 *
 * @param player - The candidate standings row.
 * @returns The blocking reason, or null when the row is ready.
 */
function acceptBlockedReason(player: MetaCandidatePlayer): string | null {
  if (player.unresolvedNames.length > 0) {
    const count = player.unresolvedNames.length;
    return `${count} card ${count === 1 ? "name" : "names"} still unmatched.`;
  }
  return null;
}

interface MetaCandidatePlayerPanelProps {
  player: MetaCandidatePlayer;
  /** Whether the parent candidate event is already linked to a live event. */
  eventAccepted: boolean;
}

/**
 * One candidate standings row in the review page (ADR-014): who played, how they
 * finished, the decklist when the source published one, the names that matched
 * nothing, and the diff against the live row once it is linked. A row is filed
 * on its own, so an event with one bad decklist still publishes the rest.
 *
 * @returns The standings-row panel.
 */
export function MetaCandidatePlayerPanel({ player, eventAccepted }: MetaCandidatePlayerPanelProps) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const domainColors = useDomainColors();
  const acceptPlayer = useAcceptMetaCandidatePlayer();
  const checkPlayer = useCheckMetaCandidatePlayer();
  const ignorePlayer = useIgnoreMetaCandidatePlayer();
  const [expanded, setExpanded] = useState(false);

  // A candidate's zone slugs come from the source, so one may name no
  // configured zone; that is a boundary value, not a missing enum label.
  function zoneLabel(zone: string): string {
    return zoneLabels[zone as keyof typeof zoneLabels] ?? zone;
  }

  const blockedReason = acceptBlockedReason(player);
  const allowUnresolvedLegend = needsUnresolvedLegendConfirm(player);
  const reviewed = player.checkedAt !== null;
  const cards = player.cards ?? [];
  const groups = groupCandidateCardsByZone(player.cards, zoneOrder);
  const copies = cards.reduce((total, card) => total + card.quantity, 0);
  const showDiff = hasCandidateChanges(player.diff);
  const deltaLines = player.diff ? formatCardDeltaLines(player.diff.cards, zoneLabel) : [];
  const record = formatRecord(player.wins, player.losses, player.draws);

  // The player's identity: a legend the catalog placed resolves to a real card
  // (art, epithet folding); one it could not still shows the source's raw name,
  // so the row never reads as anonymous.
  const legendCard = player.legendCardId
    ? getPreferredPrinting(player.legendCardId)?.card
    : undefined;
  const championCard = player.championCardId
    ? getPreferredPrinting(player.championCardId)?.card
    : undefined;
  const legendImage = player.legendCardId
    ? (getPreferredFrontImage(player.legendCardId) ?? null)
    : null;
  const legendDomains = legendCard?.domains;
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  async function handleAccept() {
    try {
      await acceptPlayer.mutateAsync({ id: player.id, allowUnresolvedLegend });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Filed ${player.playerName}`);
  }

  return (
    <div className="rounded-lg border p-3" style={gradientStyle}>
      <div className="flex flex-wrap items-center gap-2">
        <CardArtThumb imageId={legendImage?.imageId ?? null} className="w-8 shrink-0" alt="" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{player.playerName}</span>
            {legendCard || championCard ? (
              <DeckIdentityLine
                legendCard={legendCard}
                championCard={championCard}
                className="text-muted-foreground"
              />
            ) : (
              player.legendName !== null && (
                <span className="text-destructive truncate">{player.legendName}</span>
              )
            )}
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            {formatRank(player.rank, player.rankIsTier)}
            {record !== null && ` · ${record}`}
          </p>
        </div>
        <CandidateStateBadge state={player.state} />
        <MetaListStatusBadge listStatus={player.listStatus} />
        {player.listStatus === "none" && <Badge variant="muted">Standings only</Badge>}
        {player.unresolvedNames.length > 0 && (
          <Badge variant="destructive">{player.unresolvedNames.length} unmatched</Badge>
        )}
        {reviewed && <Badge variant="muted">Reviewed</Badge>}
        {player.shareToken && (
          <MetaPublicLinkButton
            href={`/meta/decks/${player.shareToken}`}
            label="Live deck"
            ariaLabel={`Open ${player.playerName}'s archived deck`}
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAccept}
            disabled={!eventAccepted || blockedReason !== null || acceptPlayer.isPending}
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={checkPlayer.isPending}
            onClick={() => checkPlayer.mutate({ id: player.id, checked: !reviewed })}
          >
            {reviewed ? <UndoIcon /> : <CheckIcon />}
            {reviewed ? "Unmark" : "Mark reviewed"}
          </Button>
          <ConfirmActionButton
            title={`Ignore ${player.playerName}?`}
            description="The staged row stays, hidden from the queue, and future uploads skip this key until you unignore it."
            confirmLabel="Ignore"
            onConfirm={() => ignorePlayer.mutateAsync({ id: player.id })}
          >
            <ArchiveXIcon />
            Ignore
          </ConfirmActionButton>
        </div>
      </div>

      {blockedReason && <p className="text-muted-foreground mt-1 text-sm">{blockedReason}</p>}

      {allowUnresolvedLegend && (
        <p className="text-muted-foreground mt-1 text-sm">
          Accepting files this player with no legend, which leaves them out of the play-rate stats.
        </p>
      )}

      {player.unresolvedNames.length > 0 && (
        <div className="mt-2 space-y-1">
          {player.unresolvedNames.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-destructive">{name}</span>
              <MetaCardNamePicker name={name} />
            </div>
          ))}
        </div>
      )}

      {showDiff && player.diff && (
        <div className="mt-2 space-y-1 rounded-md border p-2 text-sm">
          {player.diff.fields.map((field) => (
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

      {player.cards !== null && (
        <ExpandToggle
          expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground mt-2 text-sm"
        >
          {copies} {copies === 1 ? "copy" : "copies"} across {cards.length}{" "}
          {cards.length === 1 ? "row" : "rows"}
        </ExpandToggle>
      )}

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
