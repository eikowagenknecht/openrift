import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayersTab } from "@/components/pod-tournaments/tournament-page";
import { TournamentPageFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/run/$id_/players")({
  component: TournamentPlayersRoute,
});

function TournamentPlayersRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentPageFrame
      id={id}
      active="players"
      render={(data) => <PlayersTab id={id} data={data} />}
    />
  );
}
