import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerClaimPage } from "@/components/deck-check/player-claim-page";

export const Route = createLazyFileRoute("/_app/tournaments_/claim/$token")({
  component: TournamentClaimRoute,
});

function TournamentClaimRoute() {
  const { token } = Route.useParams();
  return <PlayerClaimPage token={token} />;
}
