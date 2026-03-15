import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

import type * as AppModule from "../app.js";
import type * as DbModule from "../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Wish Lists routes
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
  tempDbName = `openrift_test_wishlists_${Date.now()}`;
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

describe.skipIf(!DATABASE_URL)("Wish Lists routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  let wishListId: string;
  let secondWishListId: string;
  let itemId: string;

  // ── POST /wish-lists ──────────────────────────────────────────────────────

  describe("POST /wish-lists", () => {
    it("creates a wish list", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", { name: "My Wish List" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeString();
      expect(json.name).toBe("My Wish List");
      expect(json.createdAt).toBeString();
      wishListId = json.id;
    });

    it("creates another wish list for deletion tests", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", { name: "Delete Me" }));
      expect(res.status).toBe(201);
      secondWishListId = ((await res.json()) as { id: string }).id;
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", {}));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /wish-lists ───────────────────────────────────────────────────────

  describe("GET /wish-lists", () => {
    it("returns all wish lists", async () => {
      const res = await app.fetch(req("GET", "/wish-lists"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
    });
  });

  // ── GET /wish-lists/:id ───────────────────────────────────────────────────

  describe("GET /wish-lists/:id", () => {
    it("returns { wishList, items } shape", async () => {
      const res = await app.fetch(req("GET", `/wish-lists/${wishListId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.wishList).toBeDefined();
      expect(json.wishList.id).toBe(wishListId);
      expect(json.wishList.name).toBe("My Wish List");
      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/wish-lists/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /wish-lists/:id ─────────────────────────────────────────────────

  describe("PATCH /wish-lists/:id", () => {
    it("updates wish list name", async () => {
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}`, { name: "Renamed Wish List" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("Renamed Wish List");
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/wish-lists/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /wish-lists/:id/items ────────────────────────────────────────────

  describe("POST /wish-lists/:id/items", () => {
    it("adds an item by cardId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          cardId: CARD_ID,
          quantityDesired: 3,
        }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeString();
      itemId = json.id;
    });

    it("adds an item by printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          printingId: PRINTING_1,
          quantityDesired: 1,
        }),
      );
      expect(res.status).toBe(201);
    });

    it("rejects adding item with both cardId and printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          cardId: CARD_ID,
          printingId: PRINTING_1,
          quantityDesired: 1,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects adding item with neither cardId nor printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, { quantityDesired: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent wish list", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/wish-lists/${fakeId}/items`, { cardId: CARD_ID, quantityDesired: 1 }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /wish-lists/:id/items/:itemId ────────────────────────────────────

  describe("PATCH /wish-lists/:id/items/:itemId", () => {
    it("updates item quantity", async () => {
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}/items/${itemId}`, { quantityDesired: 5 }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}/items/${fakeId}`, { quantityDesired: 1 }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /wish-lists/:id/items/:itemId ───────────────────────────────────

  describe("DELETE /wish-lists/:id/items/:itemId", () => {
    it("deletes an item", async () => {
      const res = await app.fetch(req("DELETE", `/wish-lists/${wishListId}/items/${itemId}`));
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/wish-lists/${wishListId}/items/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /wish-lists/:id ────────────────────────────────────────────────

  describe("DELETE /wish-lists/:id", () => {
    it("deletes a wish list", async () => {
      const res = await app.fetch(req("DELETE", `/wish-lists/${secondWishListId}`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/wish-lists/${secondWishListId}`));
      expect(res.status).toBe(404);
    });
  });
});
