import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin promo-types CRUD
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix ipt- for slug names to avoid collisions with other tests.
// ---------------------------------------------------------------------------

const ADMIN_ID = "a0000000-0045-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

// ---------------------------------------------------------------------------
// Track created IDs for cleanup within ordered tests
// ---------------------------------------------------------------------------

let createdId1 = "";
let createdId2 = "";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!adminCtx)("Admin promo-types routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  // ── Non-admin access control ──────────────────────────────────────────────

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/promo-types returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(req("GET", "/admin/promo-types"));
      expect(res.status).toBe(403);
    });

    it("POST /admin/promo-types returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        req("POST", "/admin/promo-types", { slug: "ipt-blocked", label: "Blocked" }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/promo-types (before creation) ─────────────────────────────

  describe("GET /admin/promo-types (initial)", () => {
    it("returns 200 with a list (no ipt- entries yet)", async () => {
      const res = await app.fetch(req("GET", "/admin/promo-types"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.promoTypes).toBeInstanceOf(Array);
      const iptTypes = json.promoTypes.filter((t: { slug: string }) => t.slug.startsWith("ipt-"));
      expect(iptTypes).toHaveLength(0);
    });
  });

  // ── POST /admin/promo-types ───────────────────────────────────────────────

  describe("POST /admin/promo-types", () => {
    it("creates a promo type with defaults", async () => {
      const res = await app.fetch(
        req("POST", "/admin/promo-types", { slug: "ipt-alpha", label: "IPT Alpha" }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.promoType.slug).toBe("ipt-alpha");
      expect(json.promoType.label).toBe("IPT Alpha");
      expect(json.promoType.id).toBeTypeOf("string");
      expect(json.promoType.createdAt).toBeTypeOf("string");
      expect(json.promoType.updatedAt).toBeTypeOf("string");
      createdId1 = json.promoType.id;
    });

    it("creates a promo type with explicit sortOrder", async () => {
      const res = await app.fetch(
        req("POST", "/admin/promo-types", { slug: "ipt-beta", label: "IPT Beta", sortOrder: 99 }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.promoType.slug).toBe("ipt-beta");
      expect(json.promoType.sortOrder).toBe(99);
      createdId2 = json.promoType.id;
    });

    it("returns 409 for duplicate slug", async () => {
      const res = await app.fetch(
        req("POST", "/admin/promo-types", { slug: "ipt-alpha", label: "Duplicate" }),
      );
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    it("returns 400 for invalid slug (not kebab-case)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/promo-types", { slug: "NotKebab", label: "Bad" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing label", async () => {
      const res = await app.fetch(req("POST", "/admin/promo-types", { slug: "ipt-nolabel" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/promo-types (after creation) ──────────────────────────────

  describe("GET /admin/promo-types (after creation)", () => {
    it("returns both ipt- promo types", async () => {
      const res = await app.fetch(req("GET", "/admin/promo-types"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const iptTypes = json.promoTypes.filter((t: { slug: string }) => t.slug.startsWith("ipt-"));
      expect(iptTypes).toHaveLength(2);
    });
  });

  // ── PATCH /admin/promo-types/:id ─────────────────────────────────────────

  describe("PATCH /admin/promo-types/:id", () => {
    it("updates label only", async () => {
      const res = await app.fetch(
        req("PATCH", `/admin/promo-types/${createdId1}`, { label: "IPT Alpha Updated" }),
      );
      expect(res.status).toBe(204);
    });

    it("updates slug (triggers printing rename)", async () => {
      const res = await app.fetch(
        req("PATCH", `/admin/promo-types/${createdId1}`, { slug: "ipt-alpha-v2" }),
      );
      expect(res.status).toBe(204);

      // Verify slug changed via list
      const listRes = await app.fetch(req("GET", "/admin/promo-types"));
      const json = await listRes.json();
      const updated = json.promoTypes.find((t: { id: string }) => t.id === createdId1);
      expect(updated.slug).toBe("ipt-alpha-v2");
      expect(updated.label).toBe("IPT Alpha Updated");
    });

    it("returns 404 for non-existent ID", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/promo-types/a0000000-dead-4000-a000-000000000000", {
          label: "Ghost",
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 when new slug conflicts", async () => {
      const res = await app.fetch(
        req("PATCH", `/admin/promo-types/${createdId1}`, { slug: "ipt-beta" }),
      );
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toContain("already in use");
    });
  });

  // ── PUT /admin/promo-types/reorder ────────────────────────────────────────

  describe("PUT /admin/promo-types/reorder", () => {
    it("reorders all promo types", async () => {
      // First, get the full list of all promo types (not just ipt- ones)
      const listRes = await app.fetch(req("GET", "/admin/promo-types"));
      const json = await listRes.json();
      const allIds = json.promoTypes.map((t: { id: string }) => t.id);

      // Reverse the order
      const reversed = allIds.toReversed();
      const res = await app.fetch(req("PUT", "/admin/promo-types/reorder", { ids: reversed }));
      expect(res.status).toBe(204);
    });

    it("returns 400 for duplicate IDs", async () => {
      const res = await app.fetch(
        req("PUT", "/admin/promo-types/reorder", { ids: [createdId1, createdId1] }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Duplicate");
    });

    it("returns 400 for wrong count of IDs", async () => {
      const res = await app.fetch(req("PUT", "/admin/promo-types/reorder", { ids: [createdId1] }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Expected");
    });

    it("returns 400 for unknown IDs", async () => {
      // Get the correct count but include an unknown ID
      const listRes = await app.fetch(req("GET", "/admin/promo-types"));
      const json = await listRes.json();
      const allIds = json.promoTypes.map((t: { id: string }) => t.id);

      // Replace the last ID with a fake one
      const withUnknown = [...allIds.slice(0, -1), "a0000000-dead-4000-a000-000000000000"];
      const res = await app.fetch(req("PUT", "/admin/promo-types/reorder", { ids: withUnknown }));
      expect(res.status).toBe(400);

      const reJson = await res.json();
      expect(reJson.error).toContain("Unknown promo type IDs");
    });
  });

  // ── DELETE /admin/promo-types/:id ────────────────────────────────────────

  describe("DELETE /admin/promo-types/:id", () => {
    it("deletes ipt-beta", async () => {
      const res = await app.fetch(req("DELETE", `/admin/promo-types/${createdId2}`));
      expect(res.status).toBe(204);
    });

    it("deletes ipt-alpha-v2", async () => {
      const res = await app.fetch(req("DELETE", `/admin/promo-types/${createdId1}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for already-deleted promo type", async () => {
      const res = await app.fetch(req("DELETE", `/admin/promo-types/${createdId2}`));
      expect(res.status).toBe(404);
    });

    it("verifies no ipt- promo types remain", async () => {
      const res = await app.fetch(req("GET", "/admin/promo-types"));
      const json = await res.json();
      const iptTypes = json.promoTypes.filter((t: { slug: string }) => t.slug.startsWith("ipt-"));
      expect(iptTypes).toHaveLength(0);
    });
  });
});
