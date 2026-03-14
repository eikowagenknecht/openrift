import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

import type * as AppModule from "./app.js";
import type * as DbModule from "./db.js";

// ---------------------------------------------------------------------------
// Integration tests: CRUD factory user isolation
//
// Uses a temporary database (created before the app loads via top-level await).
// Only auth is mocked — config, db, kysely, and all routes are real and
// connected to the temp DB. Requires DATABASE_URL — excluded from `bun run
// test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_A_ID = "a0000000-0000-4000-a000-00000000aa01";

const COL_ID = "c0000000-0000-4000-a000-0000000000c1";
const DECK_ID = "e0000000-0000-4000-a000-00000000de01";
const SRC_ID = "f0000000-0000-4000-a000-0000000000a1";
const WL_ID = "f1000000-0000-4000-a000-000000000f01";
const TL_ID = "e1000000-0000-4000-a000-000000000e01";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
const noop = () => {};

function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

// ── Mock auth (the only mock needed — db/config/kysely are real) ───────

mock.module("./auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_A_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

// ── Create temp database and load the app ──────────────────────────────

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = `openrift_test_auth_${Date.now()}`;
  const adminSql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${tempDbName}"`);
  await adminSql.end();

  // Point all app modules to the temp database
  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  // Dynamic imports so modules see the updated DATABASE_URL.
  // app.js triggers loading config.js → db.js → crud-factory.js — all real,
  // all connected to the temp DB. auth.js is the only mocked module.
  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("./app.js"),
    import("./db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;

  // Run migrations on the temp database
  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
  await migrateModule.migrate(db, noopLogger);
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

async function expectStatus(method: string, path: string, expected: number, body?: unknown) {
  const res = await app.fetch(req(method, path, body));
  expect(res.status).toBe(expected);
  return res;
}

// ---------------------------------------------------------------------------
// Tests: user-a must NOT see other users' data (temp DB is empty, so all
// queries correctly return 404 / empty).
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Authorization: user isolation — CRUD factory (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  describe("getOne", () => {
    it("GET /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("GET", `/collections/${COL_ID}`, 404);
    });

    it("GET /sources/:id returns 404 for another user's source", async () => {
      await expectStatus("GET", `/sources/${SRC_ID}`, 404);
    });
  });

  describe("update", () => {
    it("PATCH /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("PATCH", `/collections/${COL_ID}`, 404, { name: "Hijacked" });
    });

    it("PATCH /decks/:id returns 404 for another user's deck", async () => {
      await expectStatus("PATCH", `/decks/${DECK_ID}`, 404, { name: "Hijacked" });
    });

    it("PATCH /sources/:id returns 404 for another user's source", async () => {
      await expectStatus("PATCH", `/sources/${SRC_ID}`, 404, { name: "Hijacked" });
    });
  });

  describe("delete", () => {
    it("DELETE /sources/:id returns 404 for another user's source", async () => {
      await expectStatus("DELETE", `/sources/${SRC_ID}`, 404);
    });
  });

  describe("list only returns own resources", () => {
    it("GET /sources returns empty array (user-a has no sources)", async () => {
      const res = await app.fetch(req("GET", "/sources"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });

    it("GET /decks returns empty array (user-a has no decks)", async () => {
      const res = await app.fetch(req("GET", "/decks"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });

  describe("Wish Lists", () => {
    it("PATCH /wish-lists/:id returns 404 for another user's wish list", async () => {
      await expectStatus("PATCH", `/wish-lists/${WL_ID}`, 404, { name: "Hijacked" });
    });

    it("DELETE /wish-lists/:id returns 404 for another user's wish list", async () => {
      await expectStatus("DELETE", `/wish-lists/${WL_ID}`, 404);
    });

    it("GET /wish-lists returns empty array (user-a has no wish lists)", async () => {
      const res = await app.fetch(req("GET", "/wish-lists"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });

  describe("Trade Lists", () => {
    it("PATCH /trade-lists/:id returns 404 for another user's trade list", async () => {
      await expectStatus("PATCH", `/trade-lists/${TL_ID}`, 404, { name: "Hijacked" });
    });

    it("DELETE /trade-lists/:id returns 404 for another user's trade list", async () => {
      await expectStatus("DELETE", `/trade-lists/${TL_ID}`, 404);
    });

    it("GET /trade-lists returns empty array (user-a has no trade lists)", async () => {
      const res = await app.fetch(req("GET", "/trade-lists"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });
});
