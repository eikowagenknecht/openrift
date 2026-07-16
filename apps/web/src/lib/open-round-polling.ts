// While a round is open for reporting, results arrive from other people (players
// on the report link, the organizer), so the round views poll. Outside an open
// round the data only changes through this client's own mutations — no polling.
const OPEN_ROUND_REFETCH_MS = 5000;

/**
 * Poll interval for a pod round payload: refetch while any round is reporting,
 * stop once every round is finalized (or there are no rounds yet).
 * @returns The interval in milliseconds, or `false` to disable polling.
 */
export function openRoundRefetchInterval(
  data: { rounds: { status: string }[] } | undefined,
): number | false {
  return data?.rounds.some((round) => round.status === "reporting") ? OPEN_ROUND_REFETCH_MS : false;
}
