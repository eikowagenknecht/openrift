import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";

import { GroupCutStandings } from "@/features/tournaments/components/group-cut-standings";
import { RegionOverview } from "@/features/tournaments/components/region-overview";
import { StandingsPodium } from "@/features/tournaments/components/standings-podium";
import { StandingsTable } from "@/features/tournaments/components/standings-table";
import { useTournamentRunState } from "@/features/tournaments/hooks/use-tournament-run";
import { isTournamentStaff } from "@/features/tournaments/lib/tournament-display";
import { useRegionLabel } from "@/hooks/use-region-label";

export function TournamentStandingsTab({
  id,
  detail,
}: {
  id: string;
  detail: TournamentDetailResponse;
}) {
  const { data } = useTournamentRunState(id);
  const regionLabel = useRegionLabel();
  const variant = data.tournament.pairingStyle === "swiss" ? "swiss" : "pod";
  const groupStage = data.groupStage;
  const completed = data.tournament.status === "completed";

  if (data.tournament.format === "group_cut" && groupStage !== null) {
    return (
      <div className="flex flex-col gap-6">
        {completed ? (
          <StandingsPodium
            standings={data.standings}
            variant={variant}
            playMode={data.tournament.playMode}
          />
        ) : null}
        <GroupCutStandings
          groupStage={groupStage}
          cutSize={data.tournament.cutSize}
          legendTiebreak={data.tournament.legendTiebreak}
          metaShares={
            isTournamentStaff(detail.myRoles) ? { id, shares: data.legendMetaShares } : undefined
          }
        />
      </div>
    );
  }

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
