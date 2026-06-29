import { createLazyFileRoute } from "@tanstack/react-router";

import { ReportRoundsContent } from "@/components/pod-tournaments/tournament-report-page";
import { TournamentReportFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/tournaments_/report/$token")({
  component: ReportRoundsRoute,
});

function ReportRoundsRoute() {
  const { token } = Route.useParams();
  return (
    <TournamentReportFrame
      token={token}
      active="rounds"
      render={(data) => <ReportRoundsContent token={token} data={data} />}
    />
  );
}
