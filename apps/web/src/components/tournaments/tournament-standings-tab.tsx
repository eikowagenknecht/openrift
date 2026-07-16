import { RegionOverview } from "@/components/pod-tournaments/region-overview";
import { StandingsPodium } from "@/components/pod-tournaments/standings-podium";
import { StandingsTable } from "@/components/pod-tournaments/standings-table";
import { useRegionLabel } from "@/hooks/use-region-label";
import { useTournamentRunState } from "@/hooks/use-tournaments";

// Standings come from the same pod engine, reused via the shared id.
export function TournamentStandingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  const variant = data.tournament.pairingStyle === "swiss" ? "swiss" : "pod";
  return (
    <div className="flex flex-col gap-6">
      <StandingsPodium standings={data.standings} variant={variant} />
      <StandingsTable
        standings={data.standings}
        variant={variant}
        regionsEnabled={data.tournament.regionsEnabled}
        regionLabel={regionLabel}
      />
      {data.tournament.regionsEnabled ? (
        <RegionOverview standings={data.standings} regionLabel={regionLabel} />
      ) : null}
    </div>
  );
}
