import type { TournamentDetailResponse } from "@openrift/shared";

import { TournamentDeckCheckEntries } from "@/components/deck-check/deck-check-event-page";
import { DeckCheckIngestGuide } from "@/components/deck-check/deck-check-ingest-guide";
import { canCheckDecks, canManageTournament } from "@/lib/tournament-display";

/**
 * The judge deck-check surface, hosted in the tournament's Deck check tab
 * (ADR-033). The deck-check "event" is the tournament itself, so the reused
 * judge components key off the tournament id. This is the entrant list; one
 * entry's verification view lives at its own `decks/$entryId` route, with the
 * API ingest guide for organizers above the list.
 *
 * The entrant list comes from a staff-only endpoint (the PII boundary), so it is
 * gated to host/organizer/judge. A participant who reaches this URL directly sees
 * friendly copy instead of a perpetual loading skeleton from the 403.
 * @returns The entrant list, or a not-available notice for non-staff.
 */
export function TournamentDeckCheckTab({ detail }: { detail: TournamentDetailResponse }) {
  const canManage = canManageTournament(detail.myRoles);
  if (!canCheckDecks(detail.myRoles)) {
    return (
      <p className="text-muted-foreground p-6 text-center">
        Deck check is for tournament judges. Ask an organizer to add you as a judge to see submitted
        lists.
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
