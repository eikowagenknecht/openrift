import { afterAll, describe, expect, it } from "bun:test";

import { createApp } from "./app.js";
import { createDb } from "./db/connect.js";
import { migrate } from "./db/migrate.js";
import { createTempDb, dropTempDb, noopLogger, replaceDbName } from "./test/integration-setup.js";

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

// ── Mock auth (the only mock needed — db/config/kysely are real) ───────

const mockAuth = {
  handler: () => new Response("ok"),
  api: {
    getSession: async () => ({
      user: { id: USER_A_ID, email: "a@test.com", name: "User A" },
      session: { id: "sess-a" },
    }),
  },
  $Infer: { Session: { user: null, session: null } },
} as any;

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
} as any;

// ── Create temp database and load the app ──────────────────────────────

let app: ReturnType<typeof createApp>;
let db: ReturnType<typeof createDb>["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "auth");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });
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
    await dropTempDb(DATABASE_URL, tempDbName);
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
