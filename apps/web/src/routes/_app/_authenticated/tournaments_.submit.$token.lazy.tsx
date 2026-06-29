import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSubmitPage } from "@/components/tournaments/tournament-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/submit/$token")({
  component: SubmitRoute,
});

function SubmitRoute() {
  const { token } = Route.useParams();
  return <TournamentSubmitPage token={token} />;
}
