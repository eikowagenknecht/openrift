import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentDeckCheckAddButton } from "@/features/tournaments/components/deck-check-event-page";
import { TournamentDeckCheckTab } from "@/features/tournaments/components/tournament-deck-check-tab";
import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import { useTournamentDetail } from "@/features/tournaments/hooks/use-tournaments";
import { canManageTournament } from "@/features/tournaments/lib/tournament-display";

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
