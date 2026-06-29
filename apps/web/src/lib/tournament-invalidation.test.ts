import { describe, expect, it } from "vitest";

import { queryKeys } from "@/lib/query-keys";
import {
  deckCheckEntryInvalidationKeys,
  participantMutationInvalidationKeys,
  podRoundMutationInvalidationKeys,
} from "@/lib/tournament-invalidation";

describe("participantMutationInvalidationKeys", () => {
  const userId = "user-1";
  const id = "tournament-1";

  it("invalidates the unified list, detail, and roster", () => {
    const keys = participantMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(queryKeys.tournaments.all(userId));
    expect(keys).toContainEqual(queryKeys.tournaments.detail(userId, id));
    expect(keys).toContainEqual(queryKeys.tournaments.participants(userId, id));
  });

  // Regression: pods reference tournament_participants directly, so a roster
  // change must also drop the pod pairings/standings cache. Without this key,
  // dropping or removing a player leaves the pairings tab showing stale data.
  it("invalidates the pod tournament detail so pairings/standings refresh", () => {
    const keys = participantMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(queryKeys.podTournaments.detail(userId, id));
  });
});

describe("podRoundMutationInvalidationKeys", () => {
  const userId = "user-1";
  const id = "tournament-1";

  it("invalidates the pod list and detail", () => {
    const keys = podRoundMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(queryKeys.podTournaments.all(userId));
    expect(keys).toContainEqual(queryKeys.podTournaments.detail(userId, id));
  });

  // Regression: running a round writes current_round/status onto the shared
  // tournaments row, so the unified detail must refresh too. Without these keys,
  // the Overview pairings tile shows a stale round and Settings still treats the
  // pairing engine as editable (stale hasRounds).
  it("invalidates the unified list and detail so Overview/Settings refresh", () => {
    const keys = podRoundMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(queryKeys.tournaments.all(userId));
    expect(keys).toContainEqual(queryKeys.tournaments.detail(userId, id));
  });
});

describe("deckCheckEntryInvalidationKeys", () => {
  const userId = "user-1";
  const tournamentId = "tournament-1";
  const entryId = "entry-1";

  it("invalidates the entry list", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId });
    expect(keys).toContainEqual(queryKeys.tournamentDeckCheck.entries(userId, tournamentId));
  });

  // The list key is always present; a mutation with no entry id (e.g. creating an
  // entry) must not push an undefined single-entry key.
  it("invalidates only the list when no entry id is given", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId });
    expect(keys).toHaveLength(1);
  });

  it("also invalidates the single entry's detail when an entry id is given", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId, entryId });
    expect(keys).toContainEqual(queryKeys.tournamentDeckCheck.entries(userId, tournamentId));
    expect(keys).toContainEqual(queryKeys.tournamentDeckCheck.entry(userId, tournamentId, entryId));
    expect(keys).toHaveLength(2);
  });
});
