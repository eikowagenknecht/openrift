import { queryKeys } from "@/lib/query-keys";

/**
 * Query keys to invalidate after a participant change (add, invite, rename,
 * link, drop, reactivate, remove, ...).
 *
 * Beyond the unified tournament list, detail, and roster, this also invalidates
 * the pod tournament detail. Pods are built directly on `tournament_participants`
 * (the `pod_members` / `pod_byes` rows reference participant ids), so the pod
 * pairings and standings cache goes stale whenever the roster changes. The key
 * is invalidated unconditionally — for a `none`-pairing tournament it simply has
 * no observers, so the invalidation is a no-op.
 * @returns The list of query keys to invalidate.
 */
export function participantMutationInvalidationKeys(userId: string, id: string) {
  return [
    queryKeys.tournaments.all(userId),
    queryKeys.tournaments.detail(userId, id),
    queryKeys.tournaments.participants(userId, id),
    queryKeys.podTournaments.detail(userId, id),
  ];
}

/**
 * Query keys to invalidate after a pod round mutation (generate, replace,
 * reroll, finalize, submit result).
 *
 * Beyond the pod list and detail, this also invalidates the unified tournament
 * list and detail. Running a round writes `current_round` and `status` onto the
 * shared `tournaments` row, which the unified detail surfaces (the Overview
 * pairings tile reads `currentRound`, and Settings gates pairing-engine
 * editability on `hasRounds`). Without dropping the unified detail, those stay stale. This is
 * the mirror of {@link participantMutationInvalidationKeys}, which covers the
 * unified-to-pod direction.
 * @returns The list of query keys to invalidate.
 */
export function podRoundMutationInvalidationKeys(userId: string, id: string) {
  return [
    queryKeys.podTournaments.all(userId),
    queryKeys.podTournaments.detail(userId, id),
    queryKeys.tournaments.all(userId),
    queryKeys.tournaments.detail(userId, id),
  ];
}

/**
 * Query keys to invalidate after a deck-check entry mutation: the entry list
 * always, plus the single entry's detail when the mutation targeted one (some
 * mutations, like creating an entry, have no entry id yet).
 * @returns The list of query keys to invalidate.
 */
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
