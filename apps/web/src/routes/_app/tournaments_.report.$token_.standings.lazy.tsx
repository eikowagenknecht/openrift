import { createLazyFileRoute } from "@tanstack/react-router";

import { RegionOverview } from "@/components/pod-tournaments/region-overview";
import { StandingsTable } from "@/components/pod-tournaments/standings-table";
import { TournamentReportFrame } from "@/components/pod-tournaments/tournament-shell";
import { useRegionLabel } from "@/hooks/use-region-label";

export const Route = createLazyFileRoute("/_app/tournaments_/report/$token_/standings")({
  component: ReportStandingsRoute,
});

function ReportStandingsRoute() {
  const { token } = Route.useParams();
  const regionLabel = useRegionLabel();
  return (
    <TournamentReportFrame
      token={token}
      active="standings"
      render={(data) => (
        <div className="flex flex-col gap-6">
          <StandingsTable
            standings={data.standings}
            variant={data.pairingStyle === "swiss" ? "swiss" : "pod"}
            regionsEnabled={data.regionsEnabled}
            regionLabel={regionLabel}
          />
          {data.regionsEnabled ? (
            <RegionOverview standings={data.standings} regionLabel={regionLabel} />
          ) : null}
        </div>
      )}
    />
  );
}
