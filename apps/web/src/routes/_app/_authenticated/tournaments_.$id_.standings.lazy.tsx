import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import { TournamentStandingsTab } from "@/components/tournaments/tournament-standings-tab";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/standings")({
  component: TournamentStandingsRoute,
});

function TournamentStandingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentSectionFrame
      id={id}
      section="standings"
      render={() => <TournamentStandingsTab id={id} />}
    />
  );
}
