import { createLazyFileRoute } from "@tanstack/react-router";

import { StandingsTable } from "@/components/pod-tournaments/standings-table";
import { TournamentPageFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/run/$id_/standings")({
  component: TournamentStandingsRoute,
});

function TournamentStandingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentPageFrame
      id={id}
      active="standings"
      render={(data) => <StandingsTable standings={data.standings} />}
    />
  );
}
