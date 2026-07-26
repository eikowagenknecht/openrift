import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerDeckPage } from "@/components/deck-check/player-deck-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/my-deck")({
  component: MyTournamentDeckRoute,
});

function MyTournamentDeckRoute() {
  const { id } = Route.useParams();
  return <PlayerDeckPage tournamentId={id} />;
}
