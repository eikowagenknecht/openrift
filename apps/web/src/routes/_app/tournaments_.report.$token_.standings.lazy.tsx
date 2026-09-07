import { createLazyFileRoute } from "@tanstack/react-router";

import { RegionOverview } from "@/features/tournaments/components/region-overview";
import { StandingsPodium } from "@/features/tournaments/components/standings-podium";
import { StandingsTable } from "@/features/tournaments/components/standings-table";
import { TournamentReportFrame } from "@/features/tournaments/components/tournament-shell";
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
      render={(data) => {
        const variant = data.pairingStyle === "swiss" ? "swiss" : "pod";
        return (
          <div className="flex flex-col gap-6">
            <StandingsPodium
              standings={data.standings}
              variant={variant}
              playMode={data.playMode}
            />
            <StandingsTable
              standings={data.standings}
              variant={variant}
              playMode={data.playMode}
              regionsEnabled={data.regionsEnabled}
              regionLabel={regionLabel}
            />
            {data.regionsEnabled ? (
              <RegionOverview standings={data.standings} regionLabel={regionLabel} />
            ) : null}
          </div>
        );
      }}
    />
  );
}
