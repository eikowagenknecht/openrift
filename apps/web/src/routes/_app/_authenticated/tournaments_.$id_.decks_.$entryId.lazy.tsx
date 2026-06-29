import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentDeckCheckEntry } from "@/components/deck-check/deck-check-entry-page";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { canManageTournament } from "@/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/decks_/$entryId")({
  component: TournamentDeckEntryRoute,
});

function TournamentDeckEntryRoute() {
  const { id, entryId } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
  return (
    <TournamentDeckCheckEntry
      tournamentId={id}
      entryId={entryId}
      canManage={canManageTournament(detail.myRoles)}
    />
  );
}
