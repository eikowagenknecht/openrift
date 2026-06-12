import { useNavigate } from "@tanstack/react-router";

import { PlayerDeckSourceForm } from "@/components/deck-check/player-deck-source-form";
import type { DeckSourceInput } from "@/components/deck-check/player-deck-source-form";
import { PAGE_TOP_BAR_STICKY, PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  usePreviewTournamentDeck,
  useSubmitTournamentDeck,
  useTournamentSubmissionPage,
} from "@/hooks/use-deck-check-player";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatAbsoluteDate } from "@/lib/format-date";
import { PAGE_PADDING } from "@/lib/utils";

/**
 * The event submission page a shared link opens (ADR-026): event facts, the
 * deadline, and the deck picker. If the viewer already has a linked entry in
 * the event, submitting replaces that entry's list instead of duplicating it.
 * @returns The page.
 */
export function PlayerSubmitPage({ token }: { token: string }) {
  const { data, isPending, isError } = useTournamentSubmissionPage(token);
  const submitDeck = useSubmitTournamentDeck();
  const preview = usePreviewTournamentDeck();
  const navigate = useNavigate();
  const { labels: formatLabels } = useDeckFormatList();

  if (isPending) {
    return <p className="text-muted-foreground p-6 text-center">Loading...</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-muted-foreground p-6 text-center">
        This submission link is not valid. Ask the organizer for a current one.
      </p>
    );
  }

  const eventDate = data.eventDate
    ? formatAbsoluteDate(data.eventDate, { year: "numeric", month: "short", day: "numeric" })
    : null;
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
      void navigate({ to: "/tournament-decks/$entryId", params: { entryId: result.entryId } });
    }
  };

  return (
    <div>
      <div className={PAGE_TOP_BAR_STICKY}>
        <div className="mx-auto w-full max-w-3xl">
          <PageTopBar>
            <PageTopBarTitle>Submit your deck</PageTopBarTitle>
          </PageTopBar>
        </div>
      </div>
      <div className={`flex justify-center ${PAGE_PADDING}`}>
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <div className="bg-card flex flex-col gap-1 rounded-md border p-4">
            <h2 className="font-medium">{data.eventName}</h2>
            <p className="text-muted-foreground text-sm">
              {data.groupName}
              {eventDate ? ` · ${eventDate}` : ""}
            </p>
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
                  You already have a deck entered for this event; submitting replaces it and sends
                  the new list for review.
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
                initialAllowNameSharing={data.linkedEntry?.allowNameSharing ?? true}
                initialAllowRiotIdSharing={data.linkedEntry?.allowRiotIdSharing ?? true}
              />
            </>
          ) : (
            <p className="text-muted-foreground">Submissions for this event are closed.</p>
          )}
        </div>
      </div>
    </div>
  );
}
