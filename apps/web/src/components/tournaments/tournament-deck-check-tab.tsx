import type { TournamentDetailResponse } from "@openrift/shared";

import { TournamentDeckCheckEntries } from "@/components/deck-check/deck-check-event-page";
import { DeckCheckIngestGuide } from "@/components/deck-check/deck-check-ingest-guide";
import { canCheckDecks, canManageTournament } from "@/lib/tournament-display";

/** The entrant list comes from a staff-only endpoint; gate on host/organizer/judge here. */
export function TournamentDeckCheckTab({ detail }: { detail: TournamentDetailResponse }) {
  const canManage = canManageTournament(detail.myRoles);
  if (!canCheckDecks(detail.myRoles)) {
    return (
      <p className="text-muted-foreground p-6 text-center">
        Deck check is for judges. Ask an organizer to add you.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {canManage && detail.deckSubmission !== "none" ? (
        <DeckCheckIngestGuide tournamentId={detail.id} host={detail.host} />
      ) : null}
      <TournamentDeckCheckEntries tournamentId={detail.id} canManage={canManage} />
    </div>
  );
}
