import type { PodStandingRow, TournamentPlayMode } from "@openrift/shared";

import type { PodiumSeat } from "@/components/ui/podium";
import { Podium } from "@/components/ui/podium";
import { collapseTeamStandings } from "@/lib/team-display";

import {
  decidingTieBreak,
  formatPlayerRecord,
  formatScore,
  rankedStandings,
} from "./standings-display";

function seatHint(row: PodStandingRow, rival: PodStandingRow | undefined, swiss: boolean): string {
  const record = formatPlayerRecord(row, swiss);
  const tieBreak = rival === undefined ? null : decidingTieBreak(row, rival);
  return tieBreak === null ? record : `${record} · ${tieBreak}`;
}

function podiumSeats(standings: readonly PodStandingRow[], swiss: boolean): PodiumSeat[] {
  const leader = standings[0];
  if (leader === undefined || leader.roundsPlayed === 0) {
    return [];
  }
  return rankedStandings(standings)
    .slice(0, 3)
    .map(({ row, rank }, index) => ({
      key: row.playerId,
      rank,
      name: row.displayName,
      score: formatScore(row.score),
      hint: seatHint(row, index === 0 ? standings[1] : standings[0], swiss),
    }));
}

export function StandingsPodium({
  standings,
  variant = "pod",
  playMode = "1v1",
}: {
  standings: PodStandingRow[];
  /** Drives the hint's record format: Swiss shows W-L-D, pods show wins. */
  variant?: "pod" | "swiss";
  /** 2v2 collapses teammate rows into one seat per team. */
  playMode?: TournamentPlayMode;
}) {
  const rows = playMode === "2v2" ? collapseTeamStandings(standings) : standings;
  return (
    <Podium
      seats={podiumSeats(rows, variant === "swiss")}
      emptyLabel="The throne fills after round 1 is finalized."
    />
  );
}
