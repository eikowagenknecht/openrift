import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import { TournamentPairingsTab } from "@/features/tournaments/components/tournament-pairings-tab";

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
