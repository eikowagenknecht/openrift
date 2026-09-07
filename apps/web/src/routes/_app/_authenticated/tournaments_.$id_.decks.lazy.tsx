import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentDeckCheckAddButton } from "@/components/deck-check/deck-check-event-page";
import { TournamentDeckCheckTab } from "@/components/tournaments/tournament-deck-check-tab";
import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { canManageTournament } from "@/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/decks")({
  component: TournamentDecksRoute,
});

function TournamentDecksRoute() {
  const { id } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
  const showAddDeck = canManageTournament(detail.myRoles);
  return (
    <TournamentSectionFrame
      id={id}
      section="decks"
      actions={showAddDeck ? <TournamentDeckCheckAddButton tournamentId={id} /> : undefined}
      render={(data) => <TournamentDeckCheckTab detail={data} />}
    />
  );
}
