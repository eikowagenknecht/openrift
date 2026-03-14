import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as AppModule from "../app.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as DbModule from "../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Copies routes
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const PRINTING_1 = "d0000000-0000-4000-a000-000000000001";
const PRINTING_2 = "d0000000-0000-4000-a000-000000000002";

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
  tempDbName = `openrift_test_copies_${Date.now()}`;
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

  // Seed test user
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();

  // Seed card data
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
      slug: "TEST-CARD",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: 4,
      might_bonus: null,
      keywords: [],
      rules_text: "Test rules",
      effect_text: "Test effect",
      tags: [],
    })
    .execute();

  await db
    .insertInto("printings")
    .values({
      id: PRINTING_1,
      slug: "TEST-001:rare:normal",
      card_id: CARD_ID,
      set_id: SET_ID,
      source_id: "TEST-001",
      collector_number: 1,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "ABCD",
      printed_rules_text: "Test rules",
      printed_effect_text: "Test effect",
      flavor_text: null,
      comment: null,
    })
    .execute();

  await db
    .insertInto("printings")
    .values({
      id: PRINTING_2,
      slug: "TEST-002:common:normal",
      card_id: CARD_ID,
      set_id: SET_ID,
      source_id: "TEST-002",
      collector_number: 2,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "EFGH",
      printed_rules_text: "Test rules",
      printed_effect_text: "Test effect",
      flavor_text: null,
      comment: null,
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

describe.skipIf(!DATABASE_URL)("Copies routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  let collectionId: string;
  let secondCollectionId: string;
  let copyIds: string[] = [];

  // ── Setup: create collections ──────────────────────────────────────────────

  it("setup: creates collections for copy tests", async () => {
    // Trigger inbox creation
    await app.fetch(req("GET", "/collections"));

    const res1 = await app.fetch(req("POST", "/collections", { name: "Main Collection" }));
    collectionId = ((await res1.json()) as { id: string }).id;

    const res2 = await app.fetch(req("POST", "/collections", { name: "Second Collection" }));
    secondCollectionId = ((await res2.json()) as { id: string }).id;
  });

  // ── POST /copies ──────────────────────────────────────────────────────────

  describe("POST /copies", () => {
    it("adds copies to a collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1, collectionId },
            { printingId: PRINTING_1, collectionId },
            { printingId: PRINTING_2, collectionId },
          ],
        }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as { id: string; printingId: string; collectionId: string }[];
      expect(json).toHaveLength(3);
      expect(json[0].id).toBeString();
      expect(json[0].printingId).toBe(PRINTING_1);
      expect(json[0].collectionId).toBe(collectionId);
      copyIds = json.map((c) => c.id);
    });

    it("defaults to inbox when collectionId is omitted", async () => {
      const res = await app.fetch(req("POST", "/copies", { copies: [{ printingId: PRINTING_2 }] }));
      expect(res.status).toBe(201);

      const json = (await res.json()) as { collectionId: string }[];
      // Should go to inbox, which is different from our test collection
      expect(json[0].collectionId).not.toBe(collectionId);
    });

    it("rejects with empty copies array", async () => {
      const res = await app.fetch(req("POST", "/copies", { copies: [] }));
      expect(res.status).toBe(400);
    });

    it("rejects without copies field", async () => {
      const res = await app.fetch(req("POST", "/copies", {}));
      expect(res.status).toBe(400);
    });

    it("rejects invalid printingId format", async () => {
      const res = await app.fetch(
        req("POST", "/copies", { copies: [{ printingId: "not-a-uuid" }] }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /copies ───────────────────────────────────────────────────────────

  describe("GET /copies", () => {
    it("returns all copies for the user with card info", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      // 3 from first add + 1 from inbox add = 4
      expect(json.length).toBe(4);

      // Each copy should have denormalized card info
      const copy = json[0];
      expect(copy.id).toBeString();
      expect(copy.printingId).toBeString();
      expect(copy.collectionId).toBeString();
      expect(copy.cardName).toBe("Test Card");
      expect(copy.cardType).toBe("Unit");
    });
  });

  // ── GET /copies/count ─────────────────────────────────────────────────────

  describe("GET /copies/count", () => {
    it("returns counts per printing", async () => {
      const res = await app.fetch(req("GET", "/copies/count"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // 2 of PRINTING_1, 2 of PRINTING_2 (1 explicit + 1 inbox)
      expect(json[PRINTING_1]).toBe(2);
      expect(json[PRINTING_2]).toBe(2);
    });
  });

  // ── GET /copies/:id ───────────────────────────────────────────────────────

  describe("GET /copies/:id", () => {
    it("returns a single copy by ID", async () => {
      const res = await app.fetch(req("GET", `/copies/${copyIds[0]}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.id).toBe(copyIds[0]);
      expect(json.collectionId).toBe(collectionId);
      expect(json.cardName).toBe("Test Card");
      // Should include the same fields as GET /copies
      expect(json.artVariant).toBe("normal");
      expect(json.isSigned).toBe(false);
      expect(json.finish).toBe("normal");
      expect(json.artist).toBe("Test Artist");
    });

    it("returns 404 for non-existent copy", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/copies/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /copies/move ─────────────────────────────────────────────────────

  describe("POST /copies/move", () => {
    it("moves copies to another collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", {
          copyIds: [copyIds[0]],
          toCollectionId: secondCollectionId,
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify the copy is now in the second collection
      const copyRes = await app.fetch(req("GET", `/copies/${copyIds[0]}`));
      const copy = await copyRes.json();
      expect(copy.collectionId).toBe(secondCollectionId);
    });

    it("rejects moving to non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [copyIds[1]], toCollectionId: fakeId }),
      );
      expect(res.status).toBe(404);
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [], toCollectionId: secondCollectionId }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── POST /copies/dispose ──────────────────────────────────────────────────

  describe("POST /copies/dispose", () => {
    it("disposes (hard-deletes) copies", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [copyIds[2]] }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify the copy is gone
      const copyRes = await app.fetch(req("GET", `/copies/${copyIds[2]}`));
      expect(copyRes.status).toBe(404);
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [] }));
      expect(res.status).toBe(400);
    });

    it("silently succeeds for non-existent copy IDs", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [fakeId] }));
      expect(res.status).toBe(200);
    });
  });

  // ── Activity logging ────────────────────────────────────────────────────────

  describe("Activity logging", () => {
    it("created activities for copy operations", async () => {
      const res = await app.fetch(req("GET", "/activities"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { activities: { type: string }[] };
      const types = json.activities.map((a) => a.type);
      // Should have: acquisition (x2), reorganization (move), disposal
      expect(types).toContain("acquisition");
      expect(types).toContain("reorganization");
      expect(types).toContain("disposal");
    });
  });
});
