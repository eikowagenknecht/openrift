// While a round is open, results arrive from other people (players, the
// organizer); outside that, data only changes through this client's own mutations.
const OPEN_ROUND_REFETCH_MS = 5000;

export function openRoundRefetchInterval(
  data: { rounds: { status: string }[] } | undefined,
): number | false {
  return data?.rounds.some((round) => round.status === "reporting") ? OPEN_ROUND_REFETCH_MS : false;
}
