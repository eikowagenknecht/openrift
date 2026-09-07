import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentCreateWizard } from "@/features/tournaments/components/tournament-create-wizard";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/new")({
  component: NewTournamentRoute,
});

function NewTournamentRoute() {
  const { group } = Route.useSearch();
  return <TournamentCreateWizard defaultGroupId={group} />;
}
