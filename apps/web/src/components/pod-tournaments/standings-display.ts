// Score, rank, and tie-break presentation for the standings surfaces. The API
// sends the rows already sorted through the full tie-break chain but carries no
// rank field, so the rank a reader sees is derived here — once, for both the
// table and the podium, so the two can never disagree.

import type { PodStandingRow } from "@openrift/shared";

/**
 * Render a score as an integer when whole, otherwise up to two decimals (averages
 * like avg-opponent-score can produce 1.75, which should not round to 1.8).
 * @returns The formatted score string.
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : Number(score.toFixed(2)).toString();
}

/**
 * Competition ranks for an already-sorted standings list: players level on
 * points share a rank and the next distinct score skips ahead (1, 1, 3). Only
 * the score is compared — the deeper tie-breaks order the rows but don't
 * settle the claim to a place, which is why two seats can both be gold.
 *
 * @param standings The standings rows, best first.
 * @returns One rank per row, index-aligned with `standings`.
 */
export function standingRanks(standings: readonly PodStandingRow[]): number[] {
  const ranks: number[] = [];
  for (const [index, row] of standings.entries()) {
    const previous = standings[index - 1];
    ranks.push(
      previous !== undefined && previous.score === row.score ? ranks[index - 1] : index + 1,
    );
  }
  return ranks;
}

// The engine's tie-break chain below the score, in order. `podWins` is left out
// on purpose: the seat already shows the win count, so repeating it as the
// deciding number would say the same thing twice.
const TIE_BREAKS: { read: (row: PodStandingRow) => number; label: (value: number) => string }[] = [
  { read: (row) => row.avgOpponentScore, label: (value) => `opp ${formatScore(value)}` },
  { read: (row) => row.gamePoints, label: (value) => `${formatScore(value)} game pts` },
  { read: (row) => row.avgOpponentGamePoints, label: (value) => `opp game ${formatScore(value)}` },
];

/**
 * The number that separated two players level on points: the first tie-break in
 * the engine's chain where they differ, formatted for `row`. Returns null when
 * they aren't tied on points, when the win count decided it (already on show),
 * or when every tie-break matched and the order is arbitrary.
 *
 * @param row The row to describe.
 * @param other The row it is being separated from.
 * @returns The deciding tie-break label, or null.
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

/**
 * What "wins" means on a pod event, for the surfaces that show the figure.
 * The exclusion is the engine's (see `podWins` in the API's aggregate), and it
 * is not guessable from the number alone.
 */
export const POD_WINS_HINT = "Pods won outright. A shared 1st place doesn't count.";

/**
 * A player's record, in the vocabulary of the engine that drew the rounds.
 * Swiss keeps the familiar W-L-D; pods can't use it — the engine only counts
 * wins, draws, and losses for 1v1s, so an FFA field would read 0-0-0 down the
 * page. A free-for-all has no loss to record anyway: you place, and third is
 * not a defeat by anyone in particular. `pod wins` rather than a bare `wins`
 * so the figure can't be misread as a match record.
 *
 * @param row The player's standing row.
 * @param swiss Whether the tournament pairs Swiss rather than pods.
 * @returns The record text.
 */
export function formatPlayerRecord(row: PodStandingRow, swiss: boolean): string {
  return swiss
    ? `${row.wins}-${row.losses}-${row.draws}`
    : `${row.podWins} pod win${row.podWins === 1 ? "" : "s"}`;
}
