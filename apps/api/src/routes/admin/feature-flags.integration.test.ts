import { describe, expect, it } from "bun:test";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Feature flags routes
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix ffl- for flag keys to avoid collisions.
// This user is NOT pre-promoted to admin — tests non-admin access first.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0016-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Feature flags routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── Admin-only access control (tested FIRST, before user is admin) ─────
  // The isAdmin cache only caches positive results, so a user who has never
  // been admin will always miss the cache and hit the DB.

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/feature-flags returns 403 for non-admin", async () => {
      const res = await app.fetch(req("GET", "/admin/feature-flags"));
      expect(res.status).toBe(403);
    });
  });

  // ── Promote user to admin ────────────────────────────────────────────────

  describe("promote user to admin", () => {
    it("inserts user into admins table", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();
    });
  });

  // ── Public GET /feature-flags ────────────────────────────────────────────

  describe("GET /feature-flags (public)", () => {
    it("returns a map (may have flags from other tests)", async () => {
      const res = await app.fetch(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // No ffl- flags should exist yet
      expect(json["ffl-deck-builder"]).toBeUndefined();
    });
  });

  // ── Admin POST /admin/feature-flags ──────────────────────────────────────

  describe("POST /admin/feature-flags", () => {
    it("creates a flag with defaults", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "ffl-deck-builder" }));
      expect(res.status).toBe(204);
    });

    it("creates a flag with enabled and description", async () => {
      const res = await app.fetch(
        req("POST", "/admin/feature-flags", {
          key: "ffl-dark-mode",
          enabled: true,
          description: "Toggle dark mode UI",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("rejects duplicate key with 409", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "ffl-deck-builder" }));
      expect(res.status).toBe(409);
    });

    it("rejects non-kebab-case key with 400", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "NotKebab" }));
      expect(res.status).toBe(400);
    });

    it("rejects single-char key with 400", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "x" }));
      expect(res.status).toBe(400);
    });
  });

  // ── Public GET /feature-flags (after creation) ───────────────────────────

  describe("GET /feature-flags (after creation)", () => {
    it("returns created flags as key-enabled map", async () => {
      const res = await app.fetch(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json["ffl-deck-builder"]).toBe(false);
      expect(json["ffl-dark-mode"]).toBe(true);
    });
  });

  // ── Admin GET /admin/feature-flags ───────────────────────────────────────

  describe("GET /admin/feature-flags", () => {
    it("returns ffl- flags with full shape", async () => {
      const res = await app.fetch(req("GET", "/admin/feature-flags"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.flags).toBeArray();

      const fflFlags = json.flags.filter((f: { key: string }) => f.key.startsWith("ffl-"));
      expect(fflFlags).toHaveLength(2);

      // Ordered by key: ffl-dark-mode comes before ffl-deck-builder
      const darkMode = fflFlags.find((f: { key: string }) => f.key === "ffl-dark-mode");
      expect(darkMode).toBeDefined();
      expect(darkMode.enabled).toBe(true);
      expect(darkMode.description).toBe("Toggle dark mode UI");
      expect(darkMode.createdAt).toBeString();
      expect(darkMode.updatedAt).toBeString();

      const deckBuilder = fflFlags.find((f: { key: string }) => f.key === "ffl-deck-builder");
      expect(deckBuilder).toBeDefined();
      expect(deckBuilder.enabled).toBe(false);
      expect(deckBuilder.description).toBeNull();
    });
  });

  // ── Admin PATCH /admin/feature-flags/:key ────────────────────────────────

  describe("PATCH /admin/feature-flags/:key", () => {
    it("updates enabled status", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/feature-flags/ffl-deck-builder", { enabled: true }),
      );
      expect(res.status).toBe(204);

      // Verify via public endpoint
      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await check.json();
      expect(flags["ffl-deck-builder"]).toBe(true);
    });

    it("updates description", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/feature-flags/ffl-deck-builder", { description: "Build your deck" }),
      );
      expect(res.status).toBe(200);

      // Verify via admin endpoint
      const check = await app.fetch(req("GET", "/admin/feature-flags"));
      const json = await check.json();
      const flag = json.flags.find((f: { key: string }) => f.key === "ffl-deck-builder");
      expect(flag.description).toBe("Build your deck");
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/feature-flags/does-not-exist", { enabled: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Admin DELETE /admin/feature-flags/:key ───────────────────────────────

  describe("DELETE /admin/feature-flags/:key", () => {
    it("deletes a flag", async () => {
      const res = await app.fetch(req("DELETE", "/admin/feature-flags/ffl-dark-mode"));
      expect(res.status).toBe(204);

      // Verify it's gone from public endpoint
      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await check.json();
      expect(flags["ffl-dark-mode"]).toBeUndefined();
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(req("DELETE", "/admin/feature-flags/ffl-dark-mode"));
      expect(res.status).toBe(404);
    });
  });
});
