import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin core routes (/admin/me, /admin/cron-status)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// This user is NOT pre-promoted to admin — tests non-admin access first.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0010-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Admin core routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── GET /admin/me (non-admin) ────────────────────────────────────────────
  // Important: test non-admin cases FIRST because isAdmin caches positive
  // results for 30 seconds, and we share a single module import.

  describe("GET /admin/me (non-admin)", () => {
    it("returns 403 when user is not in admins table", async () => {
      const res = await app.fetch(req("GET", "/admin/me"));
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/cron-status (non-admin) ───────────────────────────────────

  describe("GET /admin/cron-status (non-admin)", () => {
    it("returns 403 when user is not admin", async () => {
      const res = await app.fetch(req("GET", "/admin/cron-status"));
      expect(res.status).toBe(403);
    });
  });

  // ── Promote user to admin ────────────────────────────────────────────────
  // After this point the isAdmin cache will cache the positive result.

  describe("after promoting user to admin", () => {
    it("inserts user into admins table", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();

      // Verify the row exists
      const row = await db
        .selectFrom("admins")
        .select("userId")
        .where("userId", "=", USER_ID)
        .executeTakeFirst();
      expect(row).toBeDefined();
    });
  });

  // ── GET /admin/me (admin) ────────────────────────────────────────────────

  describe("GET /admin/me (admin)", () => {
    it("returns isAdmin: true when user is in admins table", async () => {
      const res = await app.fetch(req("GET", "/admin/me"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ isAdmin: true });
    });
  });

  // ── GET /admin/cron-status (admin) ───────────────────────────────────────

  describe("GET /admin/cron-status (admin)", () => {
    it("returns 200 with null cron jobs", async () => {
      const res = await app.fetch(req("GET", "/admin/cron-status"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ tcgplayer: null, cardmarket: null, cardtrader: null });
    });
  });
});
