import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// Route-level integration tests for the unified tournaments running surface
// (ADR-033): the pod pairings/standings run state, round-running mutations, and
// the report token, mounted under `/tournaments/{id}`. These are the regression
// tests for the org-host / staff / participant authorization model — the retired
// pod route was owner-only, which 403'd everyone (including the org host) on an
// org-hosted tournament. Auth is mocked; the shared DB is real.

const HOST_ID = "a0000000-0220-4000-a000-000000000001";
const ORGOWNER_ID = "a0000000-0221-4000-a000-000000000001";
const ORGJUDGE_ID = "a0000000-0222-4000-a000-000000000001";
const PARTICIPANT_ID = "a0000000-0223-4000-a000-000000000001";
const STRANGER_ID = "a0000000-0224-4000-a000-000000000001";
const ORG_ID = "01900000-0220-7000-8000-000000000001";
const UNKNOWN_ID = "01900000-0220-7000-8000-0000000000ff";

const ALL_IDS = [HOST_ID, ORGOWNER_ID, ORGJUDGE_ID, PARTICIPANT_ID, STRANGER_ID];

const hostCtx = createTestContext(HOST_ID, "run-host@test.com");
const orgOwnerCtx = createTestContext(ORGOWNER_ID, "run-orgowner@test.com");
const orgJudgeCtx = createTestContext(ORGJUDGE_ID, "run-orgjudge@test.com");
const participantCtx = createTestContext(PARTICIPANT_ID, "run-participant@test.com");
const strangerCtx = createTestContext(STRANGER_ID, "run-stranger@test.com");

const ready =
  hostCtx && orgOwnerCtx && orgJudgeCtx && participantCtx && strangerCtx ? hostCtx : null;

/**
 * Creates a pod tournament via the given context.
 * @returns The new tournament's id.
 */
async function createPodTournament(
  ctx: NonNullable<typeof hostCtx>,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await ctx.app.fetch(
    req("POST", "/tournaments", {
      pairingStyle: "pod",
      deckSubmission: "none",
      startsAt: "2026-06-01T12:00:00Z",
      ...body,
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe.skipIf(!ready)("Tournament running surface (integration)", () => {
  const host = hostCtx!;
  const orgOwner = orgOwnerCtx!;
  const orgJudge = orgJudgeCtx!;
  const participant = participantCtx!;
  const stranger = strangerCtx!;

  beforeAll(async () => {
    for (const userId of ALL_IDS) {
      await host.db
        .insertInto("users")
        .values({
          id: userId,
          email: `run-${userId.slice(11, 15)}@test.com`,
          name: "T",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
    // An org owned by ORGOWNER with ORGJUDGE as a judge member.
    await host.db
      .insertInto("organizations")
      .values({ id: ORG_ID, slug: "run-org", name: "Run Org", ownerUserId: ORGOWNER_ID })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    await host.db
      .insertInto("organizationMembers")
      .values([
        { orgId: ORG_ID, userId: ORGOWNER_ID, role: "owner" },
        { orgId: ORG_ID, userId: ORGJUDGE_ID, role: "judge" },
      ])
      .onConflict((oc) => oc.columns(["orgId", "userId"]).doNothing())
      .execute();
  });

  afterAll(async () => {
    await host.db.deleteFrom("tournaments").where("hostUserId", "in", ALL_IDS).execute();
    await host.db.deleteFrom("tournaments").where("hostOrgId", "=", ORG_ID).execute();
    await host.db.deleteFrom("organizations").where("id", "=", ORG_ID).execute();
    await host.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
  });

  it("returns the run state to the host and 404s strangers and unknown ids", async () => {
    const id = await createPodTournament(host, { name: "Personal Run", host: { type: "user" } });

    const asHost = await host.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(asHost.status).toBe(200);
    const body = (await asHost.json()) as { tournament: { id: string }; standings: unknown[] };
    expect(body.tournament.id).toBe(id);
    expect(Array.isArray(body.standings)).toBe(true);

    // No relationship → 404 (mirrors the detail gate), not a leaky 403.
    const asStranger = await stranger.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(asStranger.status).toBe(404);

    const missing = await host.app.fetch(req("GET", `/tournaments/${UNKNOWN_ID}/run`));
    expect(missing.status).toBe(404);
  });

  it("lets a participant follow the run state read-only but not manage it", async () => {
    const id = await createPodTournament(host, {
      name: "Participant View",
      host: { type: "user" },
    });
    await host.db
      .insertInto("tournamentParticipants")
      .values({ tournamentId: id, userId: PARTICIPANT_ID, displayName: "P", status: "active" })
      .execute();

    const view = await participant.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(view.status).toBe(200);

    // Read-only: a manage-only mutation (the report token) is refused.
    const manage = await participant.app.fetch(req("POST", `/tournaments/${id}/report-token`));
    expect(manage.status).toBe(403);
  });

  it("lets the org owner and judge run an org-hosted tournament (no owner-only 403)", async () => {
    const id = await createPodTournament(orgOwner, {
      name: "Org Run",
      host: { type: "organization", orgId: ORG_ID },
    });

    // The bug: the owner-only pod route 403'd everyone here. The org owner now
    // reads the run state and manages it.
    const ownerView = await orgOwner.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(ownerView.status).toBe(200);

    const enable = await orgOwner.app.fetch(req("POST", `/tournaments/${id}/report-token`));
    expect(enable.status).toBe(200);
    const token = ((await enable.json()) as { reportToken: string | null }).reportToken;
    expect(token).toBeTruthy();

    const followAlong = await orgOwner.app.fetch(req("GET", `/pod-tournaments/report/${token}`));
    expect(followAlong.status).toBe(200);

    // An org judge has a relationship (can follow) but no manage authority.
    const judgeView = await orgJudge.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(judgeView.status).toBe(200);
    const judgeManage = await orgJudge.app.fetch(req("POST", `/tournaments/${id}/report-token`));
    expect(judgeManage.status).toBe(403);

    // An unrelated user sees nothing.
    const strangerView = await stranger.app.fetch(req("GET", `/tournaments/${id}/run`));
    expect(strangerView.status).toBe(404);

    // Disabling the token revokes the follow-along.
    const disable = await orgOwner.app.fetch(req("DELETE", `/tournaments/${id}/report-token`));
    expect(disable.status).toBe(200);
    const afterDisable = await orgOwner.app.fetch(req("GET", `/pod-tournaments/report/${token}`));
    expect(afterDisable.status).toBe(404);
  });
});
