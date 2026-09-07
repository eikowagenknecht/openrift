import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerClaimPage } from "@/features/tournaments/components/player-claim-page";

export const Route = createLazyFileRoute("/_app/tournaments_/claim/$token")({
  component: TournamentClaimRoute,
});

function TournamentClaimRoute() {
  const { token } = Route.useParams();
  return <PlayerClaimPage token={token} />;
}
