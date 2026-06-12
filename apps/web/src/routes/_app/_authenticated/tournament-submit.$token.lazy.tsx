import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerSubmitPage } from "@/components/deck-check/player-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournament-submit/$token")({
  component: TournamentSubmitRoute,
});

function TournamentSubmitRoute() {
  const { token } = Route.useParams();
  return <PlayerSubmitPage token={token} />;
}
