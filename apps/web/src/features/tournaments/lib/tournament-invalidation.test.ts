import { describe, expect, it } from "vitest";

import {
  deckCheckEntryInvalidationKeys,
  participantMutationInvalidationKeys,
  podRoundMutationInvalidationKeys,
} from "@/features/tournaments/lib/tournament-invalidation";
import {
  podTournamentsKeys,
  tournamentDeckCheckKeys,
  tournamentsKeys,
} from "@/features/tournaments/lib/tournaments-query-keys";

describe("participantMutationInvalidationKeys", () => {
  const userId = "user-1";
  const id = "tournament-1";

  it("invalidates the unified list, detail, and roster", () => {
    const keys = participantMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(tournamentsKeys.all(userId));
    expect(keys).toContainEqual(tournamentsKeys.detail(userId, id));
    expect(keys).toContainEqual(tournamentsKeys.participants(userId, id));
  });

  it("invalidates the pod tournament detail so pairings/standings refresh", () => {
    const keys = participantMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(podTournamentsKeys.detail(userId, id));
  });
});

describe("podRoundMutationInvalidationKeys", () => {
  const userId = "user-1";
  const id = "tournament-1";

  it("invalidates the pod list and detail", () => {
    const keys = podRoundMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(podTournamentsKeys.all(userId));
    expect(keys).toContainEqual(podTournamentsKeys.detail(userId, id));
  });

  it("invalidates the unified list and detail so Overview/Settings refresh", () => {
    const keys = podRoundMutationInvalidationKeys(userId, id);
    expect(keys).toContainEqual(tournamentsKeys.all(userId));
    expect(keys).toContainEqual(tournamentsKeys.detail(userId, id));
  });
});

describe("deckCheckEntryInvalidationKeys", () => {
  const userId = "user-1";
  const tournamentId = "tournament-1";
  const entryId = "entry-1";

  it("invalidates the entry list", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId });
    expect(keys).toContainEqual(tournamentDeckCheckKeys.entries(userId, tournamentId));
  });

  it("invalidates only the list when no entry id is given", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId });
    expect(keys).toHaveLength(1);
  });

  it("also invalidates the single entry's detail when an entry id is given", () => {
    const keys = deckCheckEntryInvalidationKeys(userId, { tournamentId, entryId });
    expect(keys).toContainEqual(tournamentDeckCheckKeys.entries(userId, tournamentId));
    expect(keys).toContainEqual(tournamentDeckCheckKeys.entry(userId, tournamentId, entryId));
    expect(keys).toHaveLength(2);
  });
});
