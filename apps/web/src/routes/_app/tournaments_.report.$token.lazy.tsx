import { createLazyFileRoute } from "@tanstack/react-router";

import { ReportRoundsContent } from "@/features/tournaments/components/tournament-report-page";
import { TournamentReportFrame } from "@/features/tournaments/components/tournament-shell";

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
