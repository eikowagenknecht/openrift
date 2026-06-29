import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import { TournamentPairingsTab } from "@/components/tournaments/tournament-pairings-tab";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/pairings")({
  component: TournamentPairingsRoute,
});

function TournamentPairingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentSectionFrame
      id={id}
      section="pairings"
      render={() => <TournamentPairingsTab id={id} />}
    />
  );
}
