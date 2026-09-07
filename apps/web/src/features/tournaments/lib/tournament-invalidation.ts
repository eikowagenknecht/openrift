import {
  podTournamentsKeys,
  tournamentDeckCheckKeys,
  tournamentsKeys,
} from "@/features/tournaments/lib/tournaments-query-keys";

/** Also invalidates the pod detail: pods are built on `tournament_participants`, so a roster change goes stale there too. */
export function participantMutationInvalidationKeys(userId: string, id: string) {
  return [
    tournamentsKeys.all(userId),
    tournamentsKeys.detail(userId, id),
    tournamentsKeys.participants(userId, id),
    podTournamentsKeys.detail(userId, id),
  ];
}

/** Also invalidates the unified tournament detail: a round mutation writes `current_round`/`status` onto the shared `tournaments` row. */
export function podRoundMutationInvalidationKeys(userId: string, id: string) {
  return [
    podTournamentsKeys.all(userId),
    podTournamentsKeys.detail(userId, id),
    tournamentsKeys.all(userId),
    tournamentsKeys.detail(userId, id),
  ];
}

export function deckCheckEntryInvalidationKeys(
  userId: string,
  vars: { tournamentId: string; entryId?: string },
): (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [tournamentDeckCheckKeys.entries(userId, vars.tournamentId)];
  if (vars.entryId) {
    keys.push(tournamentDeckCheckKeys.entry(userId, vars.tournamentId, vars.entryId));
  }
  return keys;
}
