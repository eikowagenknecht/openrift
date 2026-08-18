import type { MetaEventMatchSuggestion } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link2OffIcon, LinkIcon } from "lucide-react";

import { ConfirmActionButton } from "@/components/admin/meta-candidate-shared";
import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useLinkMetaCandidateEvent,
  useMetaEventMatchSuggestions,
  useUnlinkMetaCandidateEvent,
} from "@/hooks/use-admin-meta-candidates";
import { useDeckFormatList } from "@/hooks/use-enums";

/**
 * One proposed live event, with the signals behind its rank. Nothing here links
 * on hover or on render: the button opens a confirmation, because a wrong link
 * fans two unrelated tournaments onto one page and the undo is an unlink plus a
 * re-review of whatever was accepted in between.
 *
 * @returns The suggestion row.
 */
function SuggestionRow({
  suggestion,
  formatLabel,
  onLink,
}: {
  suggestion: MetaEventMatchSuggestion;
  formatLabel: string;
  onLink: (metaEventId: string) => Promise<unknown>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{suggestion.name}</p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {formatDay(suggestion.eventDate)} · {formatLabel} · {suggestion.deckCount}{" "}
          {suggestion.deckCount === 1 ? "deck" : "decks"}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestion.reasons.map((reason) => (
            <Badge key={reason} variant="muted">
              {reason}
            </Badge>
          ))}
        </div>
      </div>
      <ConfirmActionButton
        title={`Link this source to "${suggestion.name}"?`}
        description="Both sources then feed one event page, and this provider gets a citation on it. Nothing else is copied over — take the fields you want from the compare grid."
        confirmLabel="Link"
        onConfirm={() => onLink(suggestion.metaEventId)}
        trigger={<Button variant="outline" size="sm" />}
      >
        <LinkIcon />
        Link
      </ConfirmActionButton>
    </li>
  );
}

interface MetaCandidateLinkPanelProps {
  candidateId: string;
  /** The provider this candidate came from, for the unlink copy. */
  provider: string;
  /** The live event it points at, or null while it is unlinked. */
  metaEventId: string | null;
  /** That event's name, for the linked state's line. */
  metaEventName: string | null;
}

/**
 * The event's link tier (ADR-014, multi-source): what this source is attached
 * to, or the ranked events it might be. Linking is separate from accepting on
 * purpose — a source whose values you rejected still contributed its decks, so
 * the link and the citation it writes do not wait on taking any field.
 *
 * @returns The link panel.
 */
export function MetaCandidateLinkPanel({
  candidateId,
  provider,
  metaEventId,
  metaEventName,
}: MetaCandidateLinkPanelProps) {
  const { labels: formatLabels } = useDeckFormatList();
  const linkEvent = useLinkMetaCandidateEvent();
  const unlinkEvent = useUnlinkMetaCandidateEvent();
  const linked = metaEventId !== null;
  const { data, isPending } = useMetaEventMatchSuggestions(candidateId, !linked);

  const suggestions = data?.suggestions ?? [];
  const windowDays = data?.windowDays ?? 3;

  if (linked) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          Feeding <span className="text-foreground font-medium">{metaEventName ?? "an event"}</span>
        </span>
        <ConfirmActionButton
          title={`Unlink ${provider}?`}
          description="The event keeps every value it holds; only this source's citation and its deck links go away."
          confirmLabel="Unlink"
          onConfirm={() => unlinkEvent.mutateAsync({ id: candidateId })}
          trigger={<Button variant="ghost" size="sm" />}
        >
          <Link2OffIcon />
          Unlink
        </ConfirmActionButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Heading level={3}>Link to an existing event</Heading>
      {isPending && <p className="text-muted-foreground text-sm">Looking for matches…</p>}
      {!isPending && suggestions.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No archived event with this format falls within {windowDays} days of this one. Accepting
          creates a new event.
        </p>
      )}
      {suggestions.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            Ranked guesses, not decisions. Linking fans this source into an event that already
            exists instead of archiving a second copy of the same tournament.
          </p>
          <ul className="rounded-md border px-3">
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.metaEventId}
                suggestion={suggestion}
                formatLabel={formatLabels[suggestion.format] ?? suggestion.format}
                onLink={(id) => linkEvent.mutateAsync({ id: candidateId, metaEventId: id })}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
