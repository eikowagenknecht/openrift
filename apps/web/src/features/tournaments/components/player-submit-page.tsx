import { formatDayTimeLocal } from "@openrift/shared/format-date";
import { useNavigate } from "@tanstack/react-router";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeckCheckInfoCardSkeleton } from "@/features/tournaments/components/deck-check-skeletons";
import { PlayerDeckSourceForm } from "@/features/tournaments/components/player-deck-source-form";
import type { DeckSourceInput } from "@/features/tournaments/components/player-deck-source-form";
import {
  usePreviewTournamentDeck,
  useSubmitTournamentDeck,
  useTournamentSubmissionPage,
} from "@/features/tournaments/hooks/use-deck-check-player";
import { useDeckFormatList } from "@/hooks/use-enums";

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

  // Local time zone is safe only because this route is `data-only`.
  const closesAt = data.submissionsCloseAt ? formatDayTimeLocal(data.submissionsCloseAt) : null;
  const linkedState = data.linkedEntry?.state;
  const blockedMessage =
    linkedState === "withdrawn"
      ? "Your entry in this event was withdrawn by the organizer. Contact a judge before submitting again."
      : linkedState === "approved"
        ? "Your deck for this event was already approved by a judge. To change it, request an unlock from your deck page."
        : linkedState === "checked"
          ? "Your deck for this event was already checked by a judge. Contact a judge to change it."
          : data.linkedEntry && !data.linkedEntry.canReplace
            ? "Your deck for this event is already submitted and locked. To change it, request an unlock from your deck page."
            : null;

  const submit = async (input: DeckSourceInput) => {
    const result = await submitDeck.mutateAsync({ token, ...input });
    if (result.entryId) {
      void navigate({ to: "/tournaments/$id/my-deck", params: { id: result.tournamentId } });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-1 p-4">
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
      </Card>

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
