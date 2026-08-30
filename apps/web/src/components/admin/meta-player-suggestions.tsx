import { LinkIcon } from "lucide-react";

import { ConfirmActionButton } from "@/components/admin/meta-candidate-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useLinkMetaCandidatePlayer,
  useMetaPlayerMatchSuggestions,
} from "@/hooks/use-admin-meta-candidates";
import { formatRank } from "@/lib/meta-format";

/**
 * The archived standings rows in this event that a source's player might be,
 * ranked, with the reasons behind each rank (ADR-014). Only offered inside its
 * own event — a candidate row may not link outside it — and only ever applied by
 * a click that confirms.
 *
 * Mounted from an expanded roster row, so the query runs for the row an admin
 * is actually working on rather than for every player in the event.
 *
 * @returns The suggestion list.
 */
export function MetaPlayerSuggestions({
  candidatePlayerId,
  playerName,
}: {
  candidatePlayerId: string;
  /** The source's spelling of the player, for the confirmation copy. */
  playerName: string;
}) {
  const linkPlayer = useLinkMetaCandidatePlayer();
  const { data, isPending } = useMetaPlayerMatchSuggestions(candidatePlayerId, true);
  const suggestions = data?.suggestions ?? [];

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Looking for matches…</p>;
  }
  if (suggestions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No archived standings row in this event carries a matching player name.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {suggestions.map((suggestion) => (
        <li key={suggestion.metaEventPlayerId} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate">{suggestion.playerName}</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatRank(suggestion.rank, suggestion.rankIsTier)}
            {suggestion.deckId !== null && " · has a list"}
          </span>
          {suggestion.reasons.map((reason) => (
            <Badge key={reason} variant="muted">
              {reason}
            </Badge>
          ))}
          <ConfirmActionButton
            title={`Link ${playerName} to ${suggestion.playerName}?`}
            description="The source then describes that archived player, and its values become takeable field by field. Nothing is copied over by linking."
            confirmLabel="Link"
            onConfirm={() =>
              linkPlayer.mutateAsync({
                id: candidatePlayerId,
                metaEventPlayerId: suggestion.metaEventPlayerId,
              })
            }
            trigger={<Button variant="outline" size="sm" className="ml-auto" />}
          >
            <LinkIcon />
            Link
          </ConfirmActionButton>
        </li>
      ))}
    </ul>
  );
}
