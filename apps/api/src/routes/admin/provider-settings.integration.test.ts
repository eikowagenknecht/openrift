import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin provider-settings routes
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses provider name prefix "ips-" to avoid collisions with real providers.
// ---------------------------------------------------------------------------

const ADMIN_ID = "a0000000-0046-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!adminCtx)("Admin provider-settings routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  // ── Non-admin access control ──────────────────────────────────────────────

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/provider-settings returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(req("GET", "/admin/provider-settings"));
      expect(res.status).toBe(403);
    });

    it("PATCH /admin/provider-settings/tcgplayer returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        req("PATCH", "/admin/provider-settings/tcgplayer", { sortOrder: 0 }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/provider-settings (initial) ────────────────────────────────

  describe("GET /admin/provider-settings (initial)", () => {
    it("returns 200 with a list", async () => {
      const res = await app.fetch(req("GET", "/admin/provider-settings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.providerSettings).toBeInstanceOf(Array);
      for (const setting of json.providerSettings) {
        expect(setting.provider).toBeTypeOf("string");
        expect(setting.sortOrder).toBeTypeOf("number");
        expect(setting.isHidden).toBeTypeOf("boolean");
      }
    });
  });

  // ── PATCH /admin/provider-settings/:provider (upsert) ────────────────────

  describe("PATCH /admin/provider-settings/:provider", () => {
    it("upserts a new provider setting (ips-test-provider)", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/provider-settings/ips-test-provider", {
          sortOrder: 50,
          isHidden: true,
        }),
      );
      expect(res.status).toBe(204);

      // Verify it appears in the list
      const listRes = await app.fetch(req("GET", "/admin/provider-settings"));
      const json = await listRes.json();
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry).toBeDefined();
      expect(ipsEntry.sortOrder).toBe(50);
      expect(ipsEntry.isHidden).toBe(true);
    });

    it("updates sortOrder only", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/provider-settings/ips-test-provider", { sortOrder: 10 }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/admin/provider-settings"));
      const json = await listRes.json();
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry.sortOrder).toBe(10);
    });

    it("updates isHidden only", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/provider-settings/ips-test-provider", { isHidden: false }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/admin/provider-settings"));
      const json = await listRes.json();
      const ipsEntry = json.providerSettings.find(
        (s: { provider: string }) => s.provider === "ips-test-provider",
      );
      expect(ipsEntry.isHidden).toBe(false);
    });

    it("upserts a second test provider", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/provider-settings/ips-test-provider-2", {
          sortOrder: 60,
          isHidden: false,
        }),
      );
      expect(res.status).toBe(204);
    });
  });

  // ── PUT /admin/provider-settings/reorder ──────────────────────────────────

  describe("PUT /admin/provider-settings/reorder", () => {
    it("reorders providers", async () => {
      const res = await app.fetch(
        req("PUT", "/admin/provider-settings/reorder", {
          providers: ["ips-test-provider-2", "ips-test-provider"],
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 400 for duplicate providers", async () => {
      const res = await app.fetch(
        req("PUT", "/admin/provider-settings/reorder", {
          providers: ["ips-test-provider", "ips-test-provider"],
        }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Duplicate");
    });
  });

  // ── Cleanup: remove test provider settings directly via DB ────────────────

  describe("cleanup", () => {
    it("removes ips- test provider settings", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const { db } = adminCtx!;
      await db.deleteFrom("providerSettings").where("provider", "like", "ips-%").execute();

      // Verify no ips- entries remain
      const res = await app.fetch(req("GET", "/admin/provider-settings"));
      const json = await res.json();
      const ipsEntries = json.providerSettings.filter((s: { provider: string }) =>
        s.provider.startsWith("ips-"),
      );
      expect(ipsEntries).toHaveLength(0);
    });
  });
});
