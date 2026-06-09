import { createLazyFileRoute } from "@tanstack/react-router";

import { PairingsTab } from "@/components/pod-tournaments/tournament-page";
import { TournamentPageFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/run/$id")({
  component: TournamentPairingsRoute,
});

function TournamentPairingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentPageFrame
      id={id}
      active="pairings"
      render={(data) => <PairingsTab id={id} data={data} />}
    />
  );
}
