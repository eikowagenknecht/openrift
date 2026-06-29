import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentOverviewFrame } from "@/components/tournaments/tournament-detail-frame";
import { TournamentOverviewTab } from "@/components/tournaments/tournament-overview-tab";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id")({
  component: TournamentOverviewRoute,
});

function TournamentOverviewRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentOverviewFrame
      id={id}
      render={(detail) => <TournamentOverviewTab id={id} detail={detail} />}
    />
  );
}
