import { useNavigate } from "@tanstack/react-router";

import { DeckCheckInfoCardSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { PlayerDeckSourceForm } from "@/components/deck-check/player-deck-source-form";
import type { DeckSourceInput } from "@/components/deck-check/player-deck-source-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePreviewTournamentDeck,
  useSubmitTournamentDeck,
  useTournamentSubmissionPage,
} from "@/hooks/use-deck-check-player";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatAbsoluteDate } from "@/lib/format-date";

/**
 * The deck-submission section for a tournament's shared link (ADR-026/033).
 * Embedded in the tournament join landing when the event expects a deck: it
 * shows the format / deadline and the deck picker. If the viewer already has a
 * linked entry, submitting replaces that entry's list instead of duplicating
 * it. Owns no page chrome — the join page supplies the title.
 * @returns The submission section.
 */
export function PlayerSubmitDeckSection({ token }: { token: string }) {
  const { data, isPending, isError } = useTournamentSubmissionPage(token);
  const submitDeck = useSubmitTournamentDeck();
  const preview = usePreviewTournamentDeck();
  const navigate = useNavigate();
  const { labels: formatLabels } = useDeckFormatList();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <DeckCheckInfoCardSkeleton />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-muted-foreground">
        This submission link is not valid for a deck. Ask the organizer for a current one.
      </p>
    );
  }

  const closesAt = data.submissionsCloseAt
    ? formatAbsoluteDate(data.submissionsCloseAt, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const linkedState = data.linkedEntry?.state;
  const blockedMessage =
    linkedState === "withdrawn"
      ? "Your entry in this event was withdrawn by the organizer; contact a judge before submitting again."
      : linkedState === "approved"
        ? "Your deck for this event was already approved by a judge. To change it, request an unlock from your deck page."
        : linkedState === "checked"
          ? "Your deck for this event was already checked by a judge; contact a judge to change it."
          : data.linkedEntry && !data.linkedEntry.canReplace
            ? "Your deck for this event is already submitted and locked. To change it, request an unlock from your deck page."
            : null;

  const submit = async (input: DeckSourceInput) => {
    const result = await submitDeck.mutateAsync({ token, ...input });
    if (result.entryId) {
      void navigate({ to: "/tournaments/my-decks/$entryId", params: { entryId: result.entryId } });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col gap-1 rounded-md border p-4">
        <h2 className="font-medium">Submit your deck</h2>
        {data.format ? (
          <p className="text-muted-foreground text-sm">
            Format: {formatLabels[data.format] ?? data.format}
          </p>
        ) : null}
        {data.allowedSets && data.allowedSets.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Allowed sets: {data.allowedSets.join(", ")}
          </p>
        ) : null}
        {closesAt ? (
          <p className="text-muted-foreground text-sm">Submissions close {closesAt}</p>
        ) : null}
      </div>

      {blockedMessage ? (
        <p className="text-muted-foreground">{blockedMessage}</p>
      ) : data.submissionsOpen ? (
        <>
          {data.linkedEntry ? (
            <p className="text-muted-foreground text-sm">
              You already have a deck entered for this event; submitting replaces it and sends the
              new list for review.
            </p>
          ) : null}
          <PlayerDeckSourceForm
            submitLabel={data.linkedEntry ? "Replace my deck" : "Submit deck"}
            pendingLabel="Submitting..."
            isSubmitting={submitDeck.isPending}
            onSubmit={(input) => void submit(input)}
            onPreview={(input) => preview.mutate({ token, ...input })}
            preview={preview.data ?? null}
            isPreviewing={preview.isPending}
            initialAllowDeckPublishing={data.linkedEntry?.allowDeckPublishing ?? true}
            initialAllowNameSharing={data.linkedEntry?.allowNameSharing ?? true}
            initialAllowRiotIdSharing={data.linkedEntry?.allowRiotIdSharing ?? true}
          />
        </>
      ) : (
        <p className="text-muted-foreground">Submissions for this event are closed.</p>
      )}
    </div>
  );
}
