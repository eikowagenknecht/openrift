import type { PodStandingRow } from "@openrift/shared/types/api/pod-tournament";

/**
 * Renders as an integer when whole, otherwise up to two decimals (avoids
 * rounding an average like 1.75 to 1.8).
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : Number(score.toFixed(2)).toString();
}

/**
 * Competition ranks for an already-sorted standings list: players level on
 * score share a rank and the next distinct score skips ahead (1, 1, 3).
 * Deeper tie-breaks order the rows but don't affect the rank.
 */
export function standingRanks(standings: readonly PodStandingRow[]): number[] {
  return rankedStandings(standings).map((entry) => entry.rank);
}

export function rankedStandings<T extends PodStandingRow>(
  standings: readonly T[],
): { row: T; rank: number }[] {
  const ranked: { row: T; rank: number }[] = [];
  let previous: PodStandingRow | undefined;
  let previousRank = 0;
  for (const [index, row] of standings.entries()) {
    const rank = previous !== undefined && previous.score === row.score ? previousRank : index + 1;
    ranked.push({ row, rank });
    previous = row;
    previousRank = rank;
  }
  return ranked;
}

// Engine's tie-break chain below the score, in order. `podWins` is omitted:
// the seat already shows the win count.
const TIE_BREAKS: { read: (row: PodStandingRow) => number; label: (value: number) => string }[] = [
  { read: (row) => row.avgOpponentScore, label: (value) => `opp ${formatScore(value)}` },
  { read: (row) => row.gamePoints, label: (value) => `${formatScore(value)} game pts` },
  { read: (row) => row.avgOpponentGamePoints, label: (value) => `opp game ${formatScore(value)}` },
];

/**
 * First tie-break in the engine's chain where `row` and `other` differ,
 * formatted for `row`. Null when not tied on points/podWins, or all match.
 */
export function decidingTieBreak(row: PodStandingRow, other: PodStandingRow): string | null {
  if (row.score !== other.score || row.podWins !== other.podWins) {
    return null;
  }
  for (const tieBreak of TIE_BREAKS) {
    if (tieBreak.read(row) !== tieBreak.read(other)) {
      return tieBreak.label(tieBreak.read(row));
    }
  }
  return null;
}

export const POD_WINS_HINT = "Pods won outright. A shared 1st place doesn't count.";

/**
 * Swiss keeps W-L-D; the engine only tracks win/loss/draw for 1v1s, so an
 * FFA pod reports its win count instead.
 */
export function formatPlayerRecord(row: PodStandingRow, swiss: boolean): string {
  return swiss
    ? `${row.wins}-${row.losses}-${row.draws}`
    : `${row.podWins} pod win${row.podWins === 1 ? "" : "s"}`;
}
