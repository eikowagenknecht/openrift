import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Feature flags routes
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
const noop = () => {};

function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

mock.module("../../auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = `openrift_test_feature_flags_${Date.now()}`;
  const adminSql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${tempDbName}"`);
  await adminSql.end();

  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../../app.js"),
    import("../../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;

  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
  await migrateModule.migrate(db, noopLogger);

  // Seed the test user (not yet admin — admin is added after the 403 test)
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "a@test.com",
      name: "User A",
      email_verified: true,
      image: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Feature flags routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

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
      await db.insertInto("admins").values({ user_id: USER_ID }).execute();
    });
  });

  // ── Public GET /feature-flags ────────────────────────────────────────────

  describe("GET /feature-flags (public)", () => {
    it("returns empty map when no flags exist", async () => {
      const res = await app.fetch(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({});
    });
  });

  // ── Admin POST /admin/feature-flags ──────────────────────────────────────

  describe("POST /admin/feature-flags", () => {
    it("creates a flag with defaults", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "deck-builder" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });
    });

    it("creates a flag with enabled and description", async () => {
      const res = await app.fetch(
        req("POST", "/admin/feature-flags", {
          key: "dark-mode",
          enabled: true,
          description: "Toggle dark mode UI",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });
    });

    it("rejects duplicate key with 409", async () => {
      const res = await app.fetch(req("POST", "/admin/feature-flags", { key: "deck-builder" }));
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
      expect(json).toEqual({
        "deck-builder": false,
        "dark-mode": true,
      });
    });
  });

  // ── Admin GET /admin/feature-flags ───────────────────────────────────────

  describe("GET /admin/feature-flags", () => {
    it("returns all flags with full shape, ordered by key", async () => {
      const res = await app.fetch(req("GET", "/admin/feature-flags"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.flags).toBeArray();
      expect(json.flags).toHaveLength(2);

      // Ordered by key: dark-mode comes before deck-builder
      expect(json.flags[0].key).toBe("dark-mode");
      expect(json.flags[0].enabled).toBe(true);
      expect(json.flags[0].description).toBe("Toggle dark mode UI");
      expect(json.flags[0].created_at).toBeString();
      expect(json.flags[0].updated_at).toBeString();

      expect(json.flags[1].key).toBe("deck-builder");
      expect(json.flags[1].enabled).toBe(false);
      expect(json.flags[1].description).toBeNull();
    });
  });

  // ── Admin PATCH /admin/feature-flags/:key ────────────────────────────────

  describe("PATCH /admin/feature-flags/:key", () => {
    it("updates enabled status", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/feature-flags/deck-builder", { enabled: true }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify via public endpoint
      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await check.json();
      expect(flags["deck-builder"]).toBe(true);
    });

    it("updates description", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/feature-flags/deck-builder", { description: "Build your deck" }),
      );
      expect(res.status).toBe(200);

      // Verify via admin endpoint
      const check = await app.fetch(req("GET", "/admin/feature-flags"));
      const json = await check.json();
      const flag = json.flags.find((f: { key: string }) => f.key === "deck-builder");
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
      const res = await app.fetch(req("DELETE", "/admin/feature-flags/dark-mode"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify it's gone from public endpoint
      const check = await app.fetch(req("GET", "/feature-flags"));
      const flags = await check.json();
      expect(flags["dark-mode"]).toBeUndefined();
    });

    it("returns 404 for non-existent key", async () => {
      const res = await app.fetch(req("DELETE", "/admin/feature-flags/dark-mode"));
      expect(res.status).toBe(404);
    });
  });
});
