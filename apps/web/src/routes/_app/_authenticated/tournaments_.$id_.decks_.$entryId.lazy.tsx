import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentDeckCheckEntry } from "@/features/tournaments/components/deck-check-entry-page";
import { useTournamentDetail } from "@/features/tournaments/hooks/use-tournaments";
import { canManageTournament } from "@/features/tournaments/lib/tournament-display";

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
