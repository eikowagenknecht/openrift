import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { claimParticipantByToken } from "./deck-check-player.js";

const TOURNAMENT_ID = "019ebd7e-ee5b-76ab-bd4f-9d2184fc3296";
const USER_ID = "user-claiming";
const TOKEN = "claim-token";

/**
 * A minimal repos double exposing only the methods the claim path touches.
 * @returns The repos double plus the spies the assertions check.
 */
function makeRepos(overrides: {
  tokenParticipant?: unknown;
  existingParticipant?: unknown;
  linkResult?: unknown;
  entryId?: string | null;
}) {
  const linkParticipantByClaimTokenIfUnclaimed = vi.fn(() =>
    Promise.resolve(overrides.linkResult ?? undefined),
  );
  const findParticipantByClaimToken = vi.fn(() =>
    Promise.resolve(overrides.tokenParticipant ?? undefined),
  );
  const findParticipantByUser = vi.fn(() =>
    Promise.resolve(overrides.existingParticipant ?? undefined),
  );
  const findEntryIdByParticipant = vi.fn(() => Promise.resolve(overrides.entryId ?? null));
  const repos = {
    tournaments: {
      findParticipantByClaimToken,
      findParticipantByUser,
      linkParticipantByClaimTokenIfUnclaimed,
    },
    deckCheck: { findEntryIdByParticipant },
    // oxlint-disable-next-line typescript/no-explicit-any -- partial repos double for the claim path
  } as any as Repos;
  return { repos, findParticipantByUser, linkParticipantByClaimTokenIfUnclaimed };
}

describe("claimParticipantByToken", () => {
  it("refuses as 'duplicate' when the caller already holds a different spot in the tournament", async () => {
    // The token's spot is unclaimed and unblocked, but the caller is already a
    // participant in this tournament under another spot — linking this one too
    // would violate uq_tournament_participants_user (ADR-033). It must resolve
    // to a friendly outcome, not the raw unique-violation 500.
    const { repos, findParticipantByUser, linkParticipantByClaimTokenIfUnclaimed } = makeRepos({
      tokenParticipant: {
        id: "spot-from-token",
        tournamentId: TOURNAMENT_ID,
        userId: null,
        claimBlockedAt: null,
      },
      existingParticipant: {
        id: "spot-already-held",
        tournamentId: TOURNAMENT_ID,
        userId: USER_ID,
      },
      entryId: "deck-already-held",
    });

    const result = await claimParticipantByToken(repos, TOKEN, USER_ID);

    expect(result).toEqual({
      status: "duplicate",
      tournamentId: TOURNAMENT_ID,
      entryId: "deck-already-held",
    });
    expect(findParticipantByUser).toHaveBeenCalledWith(TOURNAMENT_ID, USER_ID);
    // It bails before attempting the link, so no unique violation is ever risked.
    expect(linkParticipantByClaimTokenIfUnclaimed).not.toHaveBeenCalled();
  });

  it("links the spot when the caller holds no other spot in the tournament", async () => {
    const { repos, linkParticipantByClaimTokenIfUnclaimed } = makeRepos({
      tokenParticipant: {
        id: "spot-from-token",
        tournamentId: TOURNAMENT_ID,
        userId: null,
        claimBlockedAt: null,
      },
      existingParticipant: undefined,
      linkResult: { id: "spot-from-token", tournamentId: TOURNAMENT_ID },
      entryId: null,
    });

    const result = await claimParticipantByToken(repos, TOKEN, USER_ID);

    expect(result).toEqual({ status: "claimed", tournamentId: TOURNAMENT_ID, entryId: null });
    expect(linkParticipantByClaimTokenIfUnclaimed).toHaveBeenCalledWith(
      TOKEN,
      USER_ID,
      "claim_link",
    );
  });
});
