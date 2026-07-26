import { createLazyFileRoute } from "@tanstack/react-router";

import { RegionOverview } from "@/components/pod-tournaments/region-overview";
import { StandingsPodium } from "@/components/pod-tournaments/standings-podium";
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
      render={(data) => {
        const variant = data.pairingStyle === "swiss" ? "swiss" : "pod";
        return (
          // The same composition as the signed-in Standings tab. This is the
          // page spectators and unclaimed players actually open, so it gets the
          // throne too rather than a bare table.
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
