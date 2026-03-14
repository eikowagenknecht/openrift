import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as AppModule from "../app.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as DbModule from "../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Trade Lists routes
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const PRINTING_1 = "d0000000-0000-4000-a000-000000000001";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
const noop = () => {};

function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

mock.module("../auth.js", () => ({
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
  tempDbName = `openrift_test_tradelists_${Date.now()}`;
  const adminSql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${tempDbName}"`);
  await adminSql.end();

  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../app.js"),
    import("../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;

  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
  await migrateModule.migrate(db, noopLogger);

  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();

  await db
    .insertInto("sets")
    .values({
      id: SET_ID,
      slug: "TEST-SET",
      name: "Test Set",
      printed_total: 10,
      sort_order: 0,
      released_at: null,
    })
    .execute();

  await db
    .insertInto("cards")
    .values({
      id: CARD_ID,
      slug: "TST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: 4,
      might_bonus: null,
      keywords: [],
      rules_text: "Rules",
      effect_text: "Effect",
      tags: [],
    })
    .execute();

  await db
    .insertInto("printings")
    .values({
      id: PRINTING_1,
      slug: "TST-001:rare:normal",
      card_id: CARD_ID,
      set_id: SET_ID,
      source_id: "TST-001",
      collector_number: 1,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      finish: "normal",
      artist: "Artist",
      public_code: "ABCD",
      printed_rules_text: "Rules",
      printed_effect_text: "Effect",
      flavor_text: null,
      comment: null,
    })
    .execute();
}

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

describe.skipIf(!DATABASE_URL)("Trade Lists routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  let tradeListId: string;
  let secondTradeListId: string;
  let itemId: string;
  let copyId: string;

  // ── Setup: create a copy to add to trade list ──────────────────────────────

  it("setup: creates a copy for trade list tests", async () => {
    await app.fetch(req("GET", "/collections")); // ensure inbox
    const colRes = await app.fetch(req("POST", "/collections", { name: "Trade Source" }));
    const col = (await colRes.json()) as { id: string };

    const copyRes = await app.fetch(
      req("POST", "/copies", { copies: [{ printingId: PRINTING_1, collectionId: col.id }] }),
    );
    const copies = (await copyRes.json()) as { id: string }[];
    copyId = copies[0].id;
  });

  // ── POST /trade-lists ─────────────────────────────────────────────────────

  describe("POST /trade-lists", () => {
    it("creates a trade list", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", { name: "My Trades" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeString();
      expect(json.name).toBe("My Trades");
      tradeListId = json.id;
    });

    it("creates another for deletion tests", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", { name: "Delete Me" }));
      expect(res.status).toBe(201);
      secondTradeListId = ((await res.json()) as { id: string }).id;
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", {}));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /trade-lists ──────────────────────────────────────────────────────

  describe("GET /trade-lists", () => {
    it("returns all trade lists", async () => {
      const res = await app.fetch(req("GET", "/trade-lists"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
    });
  });

  // ── GET /trade-lists/:id ──────────────────────────────────────────────────

  describe("GET /trade-lists/:id", () => {
    it("returns { tradeList, items } shape", async () => {
      const res = await app.fetch(req("GET", `/trade-lists/${tradeListId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tradeList).toBeDefined();
      expect(json.tradeList.id).toBe(tradeListId);
      expect(json.tradeList.name).toBe("My Trades");
      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/trade-lists/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /trade-lists/:id ────────────────────────────────────────────────

  describe("PATCH /trade-lists/:id", () => {
    it("updates trade list name", async () => {
      const res = await app.fetch(
        req("PATCH", `/trade-lists/${tradeListId}`, { name: "Renamed Trades" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("Renamed Trades");
    });
  });

  // ── POST /trade-lists/:id/items ───────────────────────────────────────────

  describe("POST /trade-lists/:id/items", () => {
    it("adds a copy to the trade list", async () => {
      const res = await app.fetch(req("POST", `/trade-lists/${tradeListId}/items`, { copyId }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeString();
      itemId = json.id;
    });

    it("returns 404 for non-existent trade list", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/trade-lists/${fakeId}/items`, { copyId }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent copy", async () => {
      const fakeCopyId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/trade-lists/${tradeListId}/items`, { copyId: fakeCopyId }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /trade-lists/:id/items/:itemId ──────────────────────────────────

  describe("DELETE /trade-lists/:id/items/:itemId", () => {
    it("removes an item from the trade list", async () => {
      const res = await app.fetch(req("DELETE", `/trade-lists/${tradeListId}/items/${itemId}`));
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/trade-lists/${tradeListId}/items/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /trade-lists/:id ───────────────────────────────────────────────

  describe("DELETE /trade-lists/:id", () => {
    it("deletes a trade list", async () => {
      const res = await app.fetch(req("DELETE", `/trade-lists/${secondTradeListId}`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/trade-lists/${secondTradeListId}`));
      expect(res.status).toBe(404);
    });
  });
});
