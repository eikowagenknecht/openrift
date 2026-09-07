import { queryKeys } from "@/lib/query-keys";

/** Also invalidates the pod detail: pods are built on `tournament_participants`, so a roster change goes stale there too. */
export function participantMutationInvalidationKeys(userId: string, id: string) {
  return [
    queryKeys.tournaments.all(userId),
    queryKeys.tournaments.detail(userId, id),
    queryKeys.tournaments.participants(userId, id),
    queryKeys.podTournaments.detail(userId, id),
  ];
}

/** Also invalidates the unified tournament detail: a round mutation writes `current_round`/`status` onto the shared `tournaments` row. */
export function podRoundMutationInvalidationKeys(userId: string, id: string) {
  return [
    queryKeys.podTournaments.all(userId),
    queryKeys.podTournaments.detail(userId, id),
    queryKeys.tournaments.all(userId),
    queryKeys.tournaments.detail(userId, id),
  ];
}

export function deckCheckEntryInvalidationKeys(
  userId: string,
  vars: { tournamentId: string; entryId?: string },
): (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [
    queryKeys.tournamentDeckCheck.entries(userId, vars.tournamentId),
  ];
  if (vars.entryId) {
    keys.push(queryKeys.tournamentDeckCheck.entry(userId, vars.tournamentId, vars.entryId));
  }
  return keys;
}
