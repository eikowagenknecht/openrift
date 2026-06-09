import { createLazyFileRoute } from "@tanstack/react-router";

import { StandingsTable } from "@/components/pod-tournaments/standings-table";
import { TournamentReportFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/tournaments_/run/report/$token_/standings")({
  component: ReportStandingsRoute,
});

function ReportStandingsRoute() {
  const { token } = Route.useParams();
  return (
    <TournamentReportFrame
      token={token}
      active="standings"
      render={(data) => <StandingsTable standings={data.standings} />}
    />
  );
}
