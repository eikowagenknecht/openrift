import { LinkIcon } from "lucide-react";

import { ConfirmActionButton } from "@/components/admin/meta-candidate-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useLinkMetaCandidateDeck,
  useMetaDeckMatchSuggestions,
} from "@/hooks/use-admin-meta-candidates";
import { formatFinishTier } from "@/lib/meta-format";

/**
 * The archived decks in this event that a source's pilot might be, ranked, with
 * the reasons behind each rank (ADR-014). Only offered inside its own event —
 * a candidate deck may not link outside it — and only ever applied by a click
 * that confirms.
 *
 * Mounted from an expanded roster row, so the query runs for the row an admin
 * is actually working on rather than for every pilot in the event.
 *
 * @returns The suggestion list.
 */
export function MetaDeckSuggestions({
  candidateDeckId,
  playerName,
}: {
  candidateDeckId: string;
  /** The source's spelling of the pilot, for the confirmation copy. */
  playerName: string;
}) {
  const linkDeck = useLinkMetaCandidateDeck();
  const { data, isPending } = useMetaDeckMatchSuggestions(candidateDeckId, true);
  const suggestions = data?.suggestions ?? [];

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Looking for matches…</p>;
  }
  if (suggestions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No archived deck in this event carries a matching pilot name.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {suggestions.map((suggestion) => (
        <li key={suggestion.deckId} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate">{suggestion.playerName}</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatFinishTier(suggestion.finishTier)} · {suggestion.name}
          </span>
          {suggestion.reasons.map((reason) => (
            <Badge key={reason} variant="muted">
              {reason}
            </Badge>
          ))}
          <ConfirmActionButton
            title={`Link ${playerName} to ${suggestion.playerName}'s deck?`}
            description="The source then describes that archived deck, and its values become takeable field by field. Nothing is copied over by linking."
            confirmLabel="Link"
            onConfirm={() =>
              linkDeck.mutateAsync({ id: candidateDeckId, deckId: suggestion.deckId })
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
