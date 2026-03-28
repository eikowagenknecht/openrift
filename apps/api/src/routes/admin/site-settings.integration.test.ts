import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin site-settings CRUD
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix iss- for setting keys to avoid collisions with other tests.
// ---------------------------------------------------------------------------

const ADMIN_ID = "a0000000-0047-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!adminCtx)("Admin site-settings routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  // ── Non-admin access control ──────────────────────────────────────────────

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/site-settings returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(req("GET", "/admin/site-settings"));
      expect(res.status).toBe(403);
    });

    it("POST /admin/site-settings returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        req("POST", "/admin/site-settings", { key: "iss-blocked", value: "nope" }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/site-settings (initial) ────────────────────────────────────

  describe("GET /admin/site-settings (initial)", () => {
    it("returns 200 with a list (no iss- entries yet)", async () => {
      const res = await app.fetch(req("GET", "/admin/site-settings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.settings).toBeInstanceOf(Array);
      const issSettings = json.settings.filter((s: { key: string }) => s.key.startsWith("iss-"));
      expect(issSettings).toHaveLength(0);
    });
  });

  // ── POST /admin/site-settings ─────────────────────────────────────────────

  describe("POST /admin/site-settings", () => {
    it("creates a setting with default scope (web)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/site-settings", {
          key: "iss-analytics-url",
          value: "https://analytics.test.com",
        }),
      );
      expect(res.status).toBe(201);
    });

    it("creates a setting with explicit scope (api)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/site-settings", {
          key: "iss-rate-limit",
          value: "200",
          scope: "api",
        }),
      );
      expect(res.status).toBe(201);
    });

    it("returns 409 for duplicate key", async () => {
      const res = await app.fetch(
        req("POST", "/admin/site-settings", {
          key: "iss-analytics-url",
          value: "duplicate",
        }),
      );
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    it("returns 400 for invalid key (not kebab-case)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/site-settings", { key: "NotKebab", value: "bad" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing value", async () => {
      const res = await app.fetch(req("POST", "/admin/site-settings", { key: "iss-no-value" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid scope", async () => {
      const res = await app.fetch(
        req("POST", "/admin/site-settings", {
          key: "iss-bad-scope",
          value: "x",
          scope: "invalid",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/site-settings (after creation) ────────────────────────────

  describe("GET /admin/site-settings (after creation)", () => {
    it("returns both iss- settings with full shape", async () => {
      const res = await app.fetch(req("GET", "/admin/site-settings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const issSettings = json.settings.filter((s: { key: string }) => s.key.startsWith("iss-"));
      expect(issSettings).toHaveLength(2);

      const analytics = issSettings.find((s: { key: string }) => s.key === "iss-analytics-url");
      expect(analytics).toBeDefined();
      expect(analytics.value).toBe("https://analytics.test.com");
      expect(analytics.scope).toBe("web");
      expect(analytics.createdAt).toBeTypeOf("string");
      expect(analytics.updatedAt).toBeTypeOf("string");

      const rateLimit = issSettings.find((s: { key: string }) => s.key === "iss-rate-limit");
      expect(rateLimit).toBeDefined();
      expect(rateLimit.value).toBe("200");
      expect(rateLimit.scope).toBe("api");
    });
  });

  // ── PATCH /admin/site-settings/:key ──────────────────────────────────────

  describe("PATCH /admin/site-settings/:key", () => {
    it("updates value only", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/site-settings/iss-analytics-url", {
          value: "https://new.analytics.test.com",
        }),
      );
      expect(res.status).toBe(204);

      // Verify updated value
      const listRes = await app.fetch(req("GET", "/admin/site-settings"));
      const json = await listRes.json();
      const updated = json.settings.find((s: { key: string }) => s.key === "iss-analytics-url");
      expect(updated.value).toBe("https://new.analytics.test.com");
      expect(updated.scope).toBe("web");
    });

    it("updates scope only", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/site-settings/iss-analytics-url", { scope: "api" }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/admin/site-settings"));
      const json = await listRes.json();
      const updated = json.settings.find((s: { key: string }) => s.key === "iss-analytics-url");
      expect(updated.scope).toBe("api");
    });

    it("updates both value and scope", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/site-settings/iss-rate-limit", {
          value: "500",
          scope: "web",
        }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/admin/site-settings"));
      const json = await listRes.json();
      const updated = json.settings.find((s: { key: string }) => s.key === "iss-rate-limit");
      expect(updated.value).toBe("500");
      expect(updated.scope).toBe("web");
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/site-settings/iss-nonexistent", { value: "ghost" }),
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain("not found");
    });

    it("returns 400 when neither value nor scope is provided", async () => {
      const res = await app.fetch(req("PATCH", "/admin/site-settings/iss-analytics-url", {}));
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /admin/site-settings/:key ─────────────────────────────────────

  describe("DELETE /admin/site-settings/:key", () => {
    it("deletes iss-rate-limit", async () => {
      const res = await app.fetch(req("DELETE", "/admin/site-settings/iss-rate-limit"));
      expect(res.status).toBe(204);
    });

    it("deletes iss-analytics-url", async () => {
      const res = await app.fetch(req("DELETE", "/admin/site-settings/iss-analytics-url"));
      expect(res.status).toBe(204);
    });

    it("returns 404 for already-deleted setting", async () => {
      const res = await app.fetch(req("DELETE", "/admin/site-settings/iss-rate-limit"));
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain("not found");
    });

    it("verifies no iss- settings remain", async () => {
      const res = await app.fetch(req("GET", "/admin/site-settings"));
      const json = await res.json();
      const issSettings = json.settings.filter((s: { key: string }) => s.key.startsWith("iss-"));
      expect(issSettings).toHaveLength(0);
    });
  });
});
