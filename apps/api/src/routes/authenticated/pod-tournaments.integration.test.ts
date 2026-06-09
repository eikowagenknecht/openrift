import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// Route-level integration tests for the pod-tournament runner (ADR-022):
// owner-only access (tournaments are identified by their uuidv7 id, no slugs) and
// the token-gated participant surface. Auth is mocked; the shared DB is real.

const OWNER_ID = "a0000000-0097-4000-a000-000000000001";
const OTHER_ID = "a0000000-0098-4000-a000-000000000001";
const UNKNOWN_ID = "01900000-0000-7000-8000-000000000000";

const ownerCtx = createTestContext(OWNER_ID, "pt-route-owner@test.com");
const otherCtx = createTestContext(OTHER_ID, "pt-route-other@test.com");

describe.skipIf(!ownerCtx || !otherCtx)("Pod tournament routes (integration)", () => {
  const owner = ownerCtx!;
  const other = otherCtx!;
  let id = "";

  beforeAll(async () => {
    for (const userId of [OWNER_ID, OTHER_ID]) {
      await owner.db
        .insertInto("users")
        .values({
          id: userId,
          email: `pt-${userId.slice(11, 15)}@test.com`,
          name: "T",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
  });

  afterAll(async () => {
    await owner.db
      .deleteFrom("podTournaments")
      .where("ownerUserId", "in", [OWNER_ID, OTHER_ID])
      .execute();
    await owner.db.deleteFrom("users").where("id", "in", [OWNER_ID, OTHER_ID]).execute();
  });

  it("creates a tournament identified by its uuid, with a Location header", async () => {
    const res = await owner.app.fetch(req("POST", "/pod-tournaments", { name: "Main Event" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    id = body.id;
    expect(id).toBeTruthy();
    expect(res.headers.get("Location")).toBe(`/api/v1/pod-tournaments/${id}`);
  });

  it("returns the detail to the owner", async () => {
    const res = await owner.app.fetch(req("GET", `/pod-tournaments/${id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tournament: { id: string } };
    expect(body.tournament.id).toBe(id);
  });

  it("rejects a non-owner with 403 and an unknown id with 404", async () => {
    const nonOwner = await other.app.fetch(req("GET", `/pod-tournaments/${id}`));
    expect(nonOwner.status).toBe(403);
    const missing = await owner.app.fetch(req("GET", `/pod-tournaments/${UNKNOWN_ID}`));
    expect(missing.status).toBe(404);
  });

  it("gates the participant surface on the report token", async () => {
    // No token enabled yet: the report endpoint 404s any token.
    const beforeEnable = await owner.app.fetch(req("GET", "/pod-tournaments/report/anything"));
    expect(beforeEnable.status).toBe(404);

    const enabled = await owner.app.fetch(req("POST", `/pod-tournaments/${id}/report-token`));
    const token = ((await enabled.json()) as { tournament: { reportToken: string } }).tournament
      .reportToken;
    expect(token).toBeTruthy();

    const followAlong = await owner.app.fetch(req("GET", `/pod-tournaments/report/${token}`));
    expect(followAlong.status).toBe(200);

    // Disabling the token revokes access.
    await owner.app.fetch(req("DELETE", `/pod-tournaments/${id}/report-token`));
    const afterDisable = await owner.app.fetch(req("GET", `/pod-tournaments/report/${token}`));
    expect(afterDisable.status).toBe(404);
  });
});
