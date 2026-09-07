import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../../deps.js";
import { CARD_FURY_UNIT } from "../../../test/fixtures/constants.js";
import type { TestContext } from "../../../test/integration-context.js";
import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// Drives the tournament-deck-check.test.ts concurrency case through the real
// app with two real, concurrently-committing Postgres transactions.

const HOST_ID = crypto.randomUUID();
const JUDGE_A_ID = crypto.randomUUID();
const JUDGE_B_ID = crypto.randomUUID();
const ALL_IDS = [HOST_ID, JUDGE_A_ID, JUDGE_B_ID];

const hostCtx = createTestContext(HOST_ID, `test-${HOST_ID}@test.com`);
const judgeACtx = createTestContext(JUDGE_A_ID, `test-${JUDGE_A_ID}@test.com`);
const judgeBCtx = createTestContext(JUDGE_B_ID, `test-${JUDGE_B_ID}@test.com`);

describe.skipIf(!hostCtx)("setEntryState concurrent judge transitions (integration)", () => {
  // oxlint-disable typescript/no-non-null-assertion -- guarded by skipIf
  const host = hostCtx!;
  const judgeA = judgeACtx!;
  const judgeB = judgeBCtx!;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(host.db);

  let tournamentId = "";

  beforeAll(async () => {
    for (const userId of ALL_IDS) {
      await host.db
        .insertInto("users")
        .values({
          id: userId,
          email: `test-${userId}@test.com`,
          name: "T",
          emailVerified: true,
          image: null,
        })
        .execute();
    }

    const created = await host.app.fetch(
      req("POST", "/tournaments", {
        name: "Concurrency Cup",
        host: { type: "user" },
        pairingStyle: "none",
        deckSubmission: "required",
        startsAt: "2026-06-01T12:00:00Z",
      }),
    );
    tournamentId = ((await readJson(created)) as { id: string }).id;
    await repos.tournaments.addStaff(tournamentId, JUDGE_A_ID, "judge");
    await repos.tournaments.addStaff(tournamentId, JUDGE_B_ID, "judge");
    // tournamentToEvent maps status running -> active; deck-check only treats an active event.
    await repos.tournaments.updateSettings(tournamentId, { status: "running" });
  });

  afterAll(async () => {
    // Deleting the tournament cascades its staff, participants, and
    // deck-check entries; users are file-owned and deleted last.
    await host.db.deleteFrom("tournaments").where("hostUserId", "in", ALL_IDS).execute();
    await host.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
  });

  it("serializes two concurrent approvals: exactly one wins, the loser 409s, and the row matches the winner", async () => {
    const participant = await repos.tournaments.createParticipant({
      tournamentId,
      displayName: "Race Riven",
      status: "active",
    });
    const createdEntry = await judgeA.app.fetch(
      req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
        participantId: participant.id,
        cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
      }),
    );
    expect(createdEntry.status).toBe(201);
    const entryId = ((await readJson(createdEntry)) as { entry: { id: string } }).entry.id;

    const approve = async (judge: TestContext): Promise<Response> =>
      await judge.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entryId}/state`, {
          state: "approved",
        }),
      );

    const [resultA, resultB] = await Promise.all([approve(judgeA), approve(judgeB)]);
    const statuses = [resultA.status, resultB.status].toSorted((left, right) => left - right);
    expect(statuses).toEqual([200, 409]);

    const winnerId = resultA.status === 200 ? JUDGE_A_ID : JUDGE_B_ID;

    const finalEntry = await repos.deckCheck.getEntry(tournamentId, entryId);
    expect(finalEntry?.state).toBe("approved");
    expect(finalEntry?.reviewOutcome).toBe("ok");
    expect(finalEntry?.approvedBy).toBe(winnerId);
  });
});
