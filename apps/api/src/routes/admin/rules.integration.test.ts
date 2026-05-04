import { afterAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin rules import + delete flows.
// Uses unique version strings prefixed with "ar-int-" so we don't collide
// with real data, and cleans them up in afterAll.
// ---------------------------------------------------------------------------

const ADMIN_ID = "a0000000-0045-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

const COLLISION_VERSION = "ar-int-collision";
const CORE_VERSION = "ar-int-core";
const TOURNAMENT_VERSION = "ar-int-tournament";

const SAMPLE_CONTENT = ["100. # Setup", "100.1. Players begin with seven cards in hand."].join(
  "\n",
);

describe.skipIf(!adminCtx)("Admin rules routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  afterAll(async () => {
    // Cascade deletes the rule rows.
    await db
      .deleteFrom("ruleVersions")
      .where("version", "in", [COLLISION_VERSION, CORE_VERSION, TOURNAMENT_VERSION])
      .execute();
  });

  describe("admin-only access control", () => {
    it("POST /admin/rules/import returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        req("POST", "/admin/rules/import", {
          kind: "core",
          version: "ar-int-forbidden",
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /admin/rules/import", () => {
    it("imports a core ruleset", async () => {
      const res = await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "core",
          version: CORE_VERSION,
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.kind).toBe("core");
      expect(json.version).toBe(CORE_VERSION);
      expect(json.added).toBe(2);
    });

    it("imports a tournament ruleset under the same version string without collision", async () => {
      const res = await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "tournament",
          version: CORE_VERSION,
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.kind).toBe("tournament");
      expect(json.version).toBe(CORE_VERSION);
    });

    it("rejects duplicate (kind, version)", async () => {
      const first = await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "core",
          version: COLLISION_VERSION,
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(first.status).toBe(201);

      const second = await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "core",
          version: COLLISION_VERSION,
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(second.status).toBe(409);
    });

    it("rejects an invalid kind", async () => {
      const res = await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "bogus",
          version: "ar-int-bogus",
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /admin/rules/{kind}/versions/{version}", () => {
    it("deletes only the specified kind", async () => {
      // Seed a tournament-only version to delete.
      await app.fetch(
        req("POST", "/admin/rules/import", {
          kind: "tournament",
          version: TOURNAMENT_VERSION,
          sourceType: "manual",
          content: SAMPLE_CONTENT,
        }),
      );

      const res = await app.fetch(
        req("DELETE", `/admin/rules/tournament/versions/${TOURNAMENT_VERSION}`),
      );
      expect(res.status).toBe(204);

      // Same version string in core (the earlier import under CORE_VERSION) still exists.
      const corePresent = await db
        .selectFrom("ruleVersions")
        .selectAll()
        .where("kind", "=", "core")
        .where("version", "=", CORE_VERSION)
        .executeTakeFirst();
      expect(corePresent).toBeDefined();
    });

    it("returns 404 when (kind, version) doesn't exist", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/rules/core/versions/ar-int-does-not-exist"),
      );
      expect(res.status).toBe(404);
    });
  });
});
