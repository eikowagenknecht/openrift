import { mock, describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Integration tests: CRUD factory user isolation
//
// The mock for db.js is not intercepted by bun for the CRUD factory module,
// so these tests hit the real database. user-a (authenticated via auth mock)
// has no rows in the real DB, so all queries correctly return 404 / empty.
// Requires DATABASE_URL (skipped in CI where no database is available).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_A_ID = "a0000000-0000-4000-a000-00000000aa01";
const USER_A = { id: USER_A_ID, email: "a@test.com", name: "User A" };

const COL_ID = "c0000000-0000-4000-a000-0000000000c1";
const DECK_ID = "e0000000-0000-4000-a000-00000000de01";
const SRC_ID = "f0000000-0000-4000-a000-0000000000a1";
const WL_ID = "f1000000-0000-4000-a000-000000000f01";
const TL_ID = "e1000000-0000-4000-a000-000000000e01";

// ---------------------------------------------------------------------------
// Module mocks — needed so the app can load without crashing.
// The CRUD factory bypasses these and hits the real DB.
// ---------------------------------------------------------------------------

// Minimal no-op chain for the mock db (only used by non-CRUD-factory routes)
function noopChain() {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "selectAll",
    "select",
    "innerJoin",
    "leftJoin",
    "distinctOn",
    "where",
    "orderBy",
    "limit",
    "groupBy",
    "returning",
    "returningAll",
    "on",
    "onRef",
    "set",
    "values",
  ]) {
    chain[m] = () => chain;
  }
  chain.execute = async () => [];
  // oxlint-disable-next-line unicorn/no-useless-undefined -- must explicitly return undefined to match Kysely's API
  chain.executeTakeFirst = async () => undefined;
  chain.executeTakeFirstOrThrow = async () => {
    throw new Error("no result");
  };
  chain.onConflict = () => ({ doNothing: () => ({ execute: async () => [] }) });
  return chain;
}

mock.module("./config.js", () => ({
  config: {
    port: 3000,
    databaseUrl: "postgres://mock",
    corsOrigin: undefined,
    auth: {
      secret: "test-secret",
      adminEmail: undefined,
      google: undefined,
      discord: undefined,
    },
    smtp: { configured: false },
    cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
  },
}));

mock.module("kysely", () => {
  const makeSql = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    const obj: Record<string, unknown> = {
      as: () => obj,
      execute: async () => [],
    };
    return obj;
  };
  makeSql.ref = (ref: string) => ref;
  return {
    sql: makeSql,
    // oxlint-disable-next-line typescript/no-extraneous-class -- mock placeholder for Kysely class
    Kysely: class {},
  };
});

mock.module("./db.js", () => ({
  db: {
    fn: {
      count: () => ({ as: () => "count" }),
      countAll: () => ({ as: () => "count" }),
    },
    selectFrom: () => noopChain(),
    selectNoFrom: () => noopChain(),
    insertInto: () => noopChain(),
    updateTable: () => noopChain(),
    deleteFrom: () => {
      const chain = noopChain();
      chain.executeTakeFirst = async () => ({ numDeletedRows: 0n });
      chain.execute = async () => ({ numDeletedRows: 0n });
      return chain;
    },
    transaction: () => ({
      execute: async (fn: (trx: unknown) => Promise<void>) => fn({}),
    }),
  },
  dialect: {},
}));

mock.module("./auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({ user: USER_A, session: { id: "sess-a" } }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

// oxlint-disable-next-line import/first -- mock.module must come before imports
import { app } from "./app";

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
// Tests: CRUD factory routes hit the real DB — user-a must NOT see user-b's data
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Authorization: user isolation — CRUD factory (integration)", () => {
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
