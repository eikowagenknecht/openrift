import { describe, expect, it } from "vitest";

import { adminReq, createTestContext, req } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

const USER_ID = "a0000000-0016-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

describe.skipIf(!ctx)("Feature flags routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // Must run before the user becomes admin: the isAdmin cache only caches
  // positive results, so a never-admin user always misses it and hits the DB.
  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/feature-flags returns 403 for non-admin", async () => {
      const res = await app.fetch(adminReq("GET", "/feature-flags"));
      expect(res.status).toBe(403);
    });
  });

  describe("promote user to admin", () => {
    it("inserts user into admins table", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();
    });
  });

  describe("GET /feature-flags (public)", () => {
    it("returns a map (may have flags from other tests)", async () => {
      const res = await app.fetch(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.flags["ffl-deck-builder"]).toBeUndefined();
    });
  });

  describe("POST /admin/feature-flags", () => {
    it("creates a flag with defaults", async () => {
      const res = await app.fetch(adminReq("POST", "/feature-flags", { key: "ffl-deck-builder" }));
      expect(res.status).toBe(201);
    });

    it("creates a flag with enabled and description", async () => {
      const res = await app.fetch(
        adminReq("POST", "/feature-flags", {
          key: "ffl-dark-mode",
          enabled: true,
          description: "Toggle dark mode UI",
        }),
      );
      expect(res.status).toBe(201);
    });

    it("rejects duplicate key with 409", async () => {
      const res = await app.fetch(adminReq("POST", "/feature-flags", { key: "ffl-deck-builder" }));
      expect(res.status).toBe(409);
    });

    it("rejects non-kebab-case key with 400", async () => {
      const res = await app.fetch(adminReq("POST", "/feature-flags", { key: "NotKebab" }));
      expect(res.status).toBe(400);
    });

    it("rejects single-char key with 400", async () => {
      const res = await app.fetch(adminReq("POST", "/feature-flags", { key: "x" }));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /feature-flags (after creation)", () => {
    it("returns created flags as key-enabled map", async () => {
      const res = await app.fetch(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.flags["ffl-deck-builder"]).toBe(false);
      expect(json.flags["ffl-dark-mode"]).toBe(true);
    });
  });

  describe("GET /admin/feature-flags", () => {
    it("returns ffl- flags with full shape", async () => {
      const res = await app.fetch(adminReq("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.flags).toEqual(expect.any(Array));

      const fflFlags = json.flags.filter((f: { key: string }) => f.key.startsWith("ffl-"));
      expect(fflFlags).toHaveLength(2);

      const darkMode = fflFlags.find((f: { key: string }) => f.key === "ffl-dark-mode");
      expect(darkMode).toBeDefined();
      expect(darkMode.enabled).toBe(true);
      expect(darkMode.description).toBe("Toggle dark mode UI");
      expect(darkMode.createdAt).toBeTypeOf("string");
      expect(darkMode.updatedAt).toBeTypeOf("string");

      const deckBuilder = fflFlags.find((f: { key: string }) => f.key === "ffl-deck-builder");
      expect(deckBuilder).toBeDefined();
      expect(deckBuilder.enabled).toBe(false);
      expect(deckBuilder.description).toBeNull();
    });
  });

  describe("PATCH /admin/feature-flags/:key", () => {
    it("updates enabled status", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/feature-flags/ffl-deck-builder", { enabled: true }),
      );
      expect(res.status).toBe(204);

      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await readJson(check);
      expect(flags.flags["ffl-deck-builder"]).toBe(true);
    });

    it("updates description", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/feature-flags/ffl-deck-builder", { description: "Build your deck" }),
      );
      expect(res.status).toBe(204);

      const check = await app.fetch(adminReq("GET", "/feature-flags"));
      const json = await readJson(check);
      const flag = json.flags.find((f: { key: string }) => f.key === "ffl-deck-builder");
      expect(flag.description).toBe("Build your deck");
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/feature-flags/does-not-exist", { enabled: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/feature-flags/:key", () => {
    it("deletes a flag", async () => {
      const res = await app.fetch(adminReq("DELETE", "/feature-flags/ffl-dark-mode"));
      expect(res.status).toBe(204);

      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await readJson(check);
      expect(flags.flags["ffl-dark-mode"]).toBeUndefined();
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(adminReq("DELETE", "/feature-flags/ffl-dark-mode"));
      expect(res.status).toBe(404);
    });
  });
});
