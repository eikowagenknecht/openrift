import type { PlayerDeckCheckEntrySummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";

import { DeckCheckListSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { PAGE_TOP_BAR_STICKY, PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { useMyTournamentDecks } from "@/hooks/use-deck-check-player";
import { formatAbsoluteDate } from "@/lib/format-date";
import { PAGE_PADDING } from "@/lib/utils";

/**
 * "My tournament decks" (ADR-026): every entry linked to the viewer's
 * account, across all events. Loading the page also links entries whose
 * email matches the account (the lazy auto-match), so a player who signed up
 * after the organizer pushed still sees their deck with zero extra steps.
 * @returns The page.
 */
export function PlayerDecksPage() {
  const { data, isPending } = useMyTournamentDecks();

  return (
    <div>
      <div className={PAGE_TOP_BAR_STICKY}>
        <div className="mx-auto w-full max-w-3xl">
          <PageTopBar>
            <PageTopBarTitle>My tournament decks</PageTopBarTitle>
          </PageTopBar>
        </div>
      </div>
      <div className={`flex justify-center ${PAGE_PADDING}`}>
        <div className="flex w-full max-w-3xl flex-col gap-3">
          {isPending ? (
            <DeckCheckListSkeleton />
          ) : !data || data.items.length === 0 ? (
            <div className="text-muted-foreground flex flex-col gap-1 py-12 text-center">
              <p>No tournament decks yet.</p>
              <p className="text-sm">
                Decks you entered into a tournament show up here once the organizer&apos;s list
                carries your account email, or after a judge connects your entry.
              </p>
            </div>
          ) : (
            data.items.map((entry) => <PlayerDeckRow key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerDeckRow({ entry }: { entry: PlayerDeckCheckEntrySummaryResponse }) {
  const eventDate = entry.eventDate
    ? formatAbsoluteDate(entry.eventDate, { year: "numeric", month: "short", day: "numeric" })
    : null;
  const withdrawn = entry.state === "withdrawn";
  return (
    <Link
      to="/tournaments/my-decks/$entryId"
      params={{ entryId: entry.id }}
      className="bg-card hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md border p-3 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate font-medium ${withdrawn ? "line-through" : ""}`}>
          {entry.eventName}
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {[entry.groupName, eventDate].filter(Boolean).join(" · ")}
        </span>
      </div>
      {entry.playerMessage ? (
        <MailIcon className="text-muted-foreground size-4" aria-label="Message from a judge" />
      ) : null}
      {entry.reviewOutcome === "issue" && entry.state !== "checked" ? (
        <Badge variant="destructive">Changes requested</Badge>
      ) : null}
      {entry.unlockRequested ? <Badge variant="outline">Unlock requested</Badge> : null}
      <PlayerStateBadge state={entry.state} reviewOutcome={entry.reviewOutcome} />
    </Link>
  );
}

export function PlayerStateBadge({
  state,
  reviewOutcome,
}: {
  state: PlayerDeckCheckEntrySummaryResponse["state"];
  reviewOutcome: PlayerDeckCheckEntrySummaryResponse["reviewOutcome"];
}) {
  if (state === "editable") {
    return <Badge variant="outline">Not submitted</Badge>;
  }
  if (state === "approved") {
    return <Badge>Approved</Badge>;
  }
  if (state === "checked") {
    return reviewOutcome === "issue" ? (
      <Badge variant="destructive">Checked · issue</Badge>
    ) : (
      <Badge>Checked</Badge>
    );
  }
  if (state === "withdrawn") {
    return <Badge variant="secondary">Withdrawn</Badge>;
  }
  return <Badge variant="secondary">Submitted</Badge>;
}
