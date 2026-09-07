import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSubmitPage } from "@/features/tournaments/components/tournament-submit-page";

export const Route = createLazyFileRoute("/_app/tournaments_/submit/$token")({
  component: SubmitRoute,
});

function SubmitRoute() {
  const { token } = Route.useParams();
  return <TournamentSubmitPage token={token} />;
}
