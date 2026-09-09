import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import { TournamentStandingsTab } from "@/features/tournaments/components/tournament-standings-tab";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/standings")({
  component: TournamentStandingsRoute,
});

function TournamentStandingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentSectionFrame
      id={id}
      section="standings"
      render={(detail) => <TournamentStandingsTab id={id} detail={detail} />}
    />
  );
}
