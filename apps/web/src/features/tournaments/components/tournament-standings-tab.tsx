import { RegionOverview } from "@/features/tournaments/components/region-overview";
import { StandingsPodium } from "@/features/tournaments/components/standings-podium";
import { StandingsTable } from "@/features/tournaments/components/standings-table";
import { useTournamentRunState } from "@/features/tournaments/hooks/use-tournaments";
import { useRegionLabel } from "@/hooks/use-region-label";

export function TournamentStandingsTab({ id }: { id: string }) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  const variant = data.tournament.pairingStyle === "swiss" ? "swiss" : "pod";
  return (
    <div className="flex flex-col gap-6">
      <StandingsPodium
        standings={data.standings}
        variant={variant}
        playMode={data.tournament.playMode}
      />
      <StandingsTable
        standings={data.standings}
        variant={variant}
        playMode={data.tournament.playMode}
        regionsEnabled={data.tournament.regionsEnabled}
        regionLabel={regionLabel}
      />
      {data.tournament.regionsEnabled ? (
        <RegionOverview standings={data.standings} regionLabel={regionLabel} />
      ) : null}
    </div>
  );
}
