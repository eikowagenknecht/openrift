import type { PodStandingRow } from "@openrift/shared";

import type { PodiumSeat } from "@/components/ui/podium";
import { Podium } from "@/components/ui/podium";

import {
  decidingTieBreak,
  formatPlayerRecord,
  formatScore,
  standingRanks,
} from "./standings-display";

/**
 * The seat's supporting line: the win count (the Swiss record, where there is
 * one), plus the number that broke a tie with the player alongside — shown only
 * when the reader can see two equal scores and would otherwise ask why one of
 * them is first.
 *
 * @param row The player's standing row.
 * @param rival The row this one is tied against, if any.
 * @param swiss Whether the tournament pairs Swiss rather than pods.
 * @returns The hint text.
 */
function seatHint(row: PodStandingRow, rival: PodStandingRow | undefined, swiss: boolean): string {
  const record = formatPlayerRecord(row, swiss);
  const tieBreak = rival === undefined ? null : decidingTieBreak(row, rival);
  return tieBreak === null ? record : `${record} · ${tieBreak}`;
}

/**
 * Turn standings rows into podium seats. The rows arrive sorted and tie-broken,
 * so the top three are the seats; the ranks are the shared competition ranks, so
 * players level on points both wear gold even though only one sits raised.
 *
 * @param standings The standings rows, best first.
 * @param swiss Whether the tournament pairs Swiss rather than pods.
 * @returns At most three seats, in standings order.
 */
function podiumSeats(standings: readonly PodStandingRow[], swiss: boolean): PodiumSeat[] {
  const leader = standings[0];
  if (leader === undefined || leader.roundsPlayed === 0) {
    return [];
  }
  const ranks = standingRanks(standings);
  return standings.slice(0, 3).map((row, index) => ({
    key: row.playerId,
    rank: ranks[index],
    name: row.displayName,
    score: formatScore(row.score),
    hint: seatHint(row, index === 0 ? standings[1] : standings[0], swiss),
  }));
}

/**
 * The standings throne: the top three above the table. Empty until a round has
 * been finalized, which the podium renders as ghost seats rather than a gap.
 *
 * @returns The podium element.
 */
export function StandingsPodium({
  standings,
  variant = "pod",
}: {
  standings: PodStandingRow[];
  /** Drives the hint's record format: Swiss shows W-L-D, pods show wins. */
  variant?: "pod" | "swiss";
}) {
  return (
    <Podium
      seats={podiumSeats(standings, variant === "swiss")}
      emptyLabel="The throne fills after round 1 is finalized."
    />
  );
}
