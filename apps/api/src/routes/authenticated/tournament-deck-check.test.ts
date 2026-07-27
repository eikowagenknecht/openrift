import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { tournamentDeckCheckRouter } from "./tournament-deck-check.js";

// setEntryState concurrency regression (see deck-check-states.ts /
// applyJudgeTransition): two near-simultaneous judge requests must not both
// validate against the same pre-transition snapshot. The transactional
// re-load inside `context.transact` is what makes the second request see the
// first's committed write and fail the transition instead of overwriting it.

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const TOURNAMENT_ID = "b0000000-0001-4000-a000-000000000001";
const ENTRY_ID = "c0000000-0001-4000-a000-000000000001";

const now = new Date("2026-06-01T00:00:00Z");

const event = {
  id: TOURNAMENT_ID,
  groupId: null,
  name: "Summoner Skirmish",
  eventDate: null,
  format: null,
  playMode: "1v1" as const,
  allowedSets: null,
  status: "active" as const,
  listLockMode: "manual" as const,
  allowSelfSubmission: true,
  submissionToken: null,
  submissionsCloseAt: null,
  createdAt: now,
  updatedAt: now,
};

function entry(state: "submitted" | "approved") {
  return {
    id: ENTRY_ID,
    tournamentId: TOURNAMENT_ID,
    participantId: null,
    externalId: "ext-1",
    submittedAt: now,
    allowDeckPublishing: true,
    allowNameSharing: true,
    allowRiotIdSharing: true,
    contentHash: "hash",
    state,
    reviewOutcome: state === "approved" ? "ok" : null,
    checkedBy: null,
    checkedAt: null,
    approvedBy: state === "approved" ? USER_ID : null,
    approvedAt: state === "approved" ? now : null,
    unlockRequestedAt: null,
    preEditLines: null,
    notes: null,
    changeSummary: null,
    withdrawnAt: null,
    playerMessage: null,
    createdAt: now,
    updatedAt: now,
    playerName: "Player One",
    riotId: null,
    claimedUserId: null,
    claimSource: null,
    claimedAt: null,
    claimBlockedAt: null,
    claimToken: null,
  };
}

function makeApp() {
  const tournaments = { isHostOrStaff: vi.fn(() => Promise.resolve(true)) };

  // The plain (non-transactional) repos: this is what `authorizeJudge` and the
  // outer `loadEntry` 404-check see. It reflects the state at the start of the
  // request ("submitted"), before a concurrent judge's commit lands.
  const outerDeckCheck = {
    getEventById: vi.fn(() => Promise.resolve(event)),
    getEntry: vi.fn(() => Promise.resolve(entry("submitted"))),
    updateEntry: vi.fn(() => Promise.resolve(entry("submitted"))),
  };
  const outerRepos = { deckCheck: outerDeckCheck, tournaments };

  // The transactional repos handed to the `context.transact` callback: by the
  // time this request's transaction opens, a concurrent judge has already
  // committed the entry into "approved". The re-load must see that, not the
  // stale "submitted" snapshot loaded above.
  const txDeckCheck = {
    getEntryForUpdate: vi.fn(() => Promise.resolve(entry("approved"))),
    updateEntry: vi.fn(() => Promise.resolve(entry("approved"))),
  };
  const txRepos = { deckCheck: txDeckCheck, tournaments };

  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID } as never);
    c.set("repos", outerRepos as never);
    c.set("transact", (async (fn: (repos: typeof txRepos) => unknown) => fn(txRepos)) as never);
    await next();
  });
  registerRouterForTest(app, tournamentDeckCheckRouter);
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 409);
    }
    throw err;
  });

  return { app, outerDeckCheck, txDeckCheck };
}

describe("PUT /tournaments/{tournamentId}/deck-check/entries/{entryId}/state", () => {
  it("rejects a transition validated against a stale snapshot and writes nothing", async () => {
    const { app, txDeckCheck } = makeApp();

    // A judge tries to approve, believing (from the pre-request load) that the
    // entry is still "submitted". By the time the transaction opens, another
    // judge has already approved it. Approving an already-approved entry is
    // not a valid transition, so this must 409 instead of silently
    // overwriting the concurrent judge's approval.
    const res = await app.request(
      `/api/v1/tournaments/${TOURNAMENT_ID}/deck-check/entries/${ENTRY_ID}/state`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "approved" }),
      },
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CONFLICT");
    // The re-loaded, locked entry was consulted...
    expect(txDeckCheck.getEntryForUpdate).toHaveBeenCalledWith(TOURNAMENT_ID, ENTRY_ID);
    // ...and the invalid transition never reached a write.
    expect(txDeckCheck.updateEntry).not.toHaveBeenCalled();
  });
});
