import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin core routes (/admin/me, /admin/cron-status)
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
  tempDbName = `openrift_test_admin_core_${Date.now()}`;
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

  // Seed the test user (FK constraint on admins.user_id → users.id)
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

describe.skipIf(!DATABASE_URL)("Admin core routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  // ── GET /admin/me (non-admin) ────────────────────────────────────────────
  // Important: test non-admin cases FIRST because isAdmin caches positive
  // results for 30 seconds, and we share a single module import.

  describe("GET /admin/me (non-admin)", () => {
    it("returns isAdmin: false when user is not in admins table", async () => {
      const res = await app.fetch(req("GET", "/admin/me"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ isAdmin: false });
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
      await db.insertInto("admins").values({ user_id: USER_ID }).execute();

      // Verify the row exists
      const row = await db
        .selectFrom("admins")
        .select("user_id")
        .where("user_id", "=", USER_ID)
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
      expect(json).toEqual({ tcgplayer: null, cardmarket: null });
    });
  });
});
