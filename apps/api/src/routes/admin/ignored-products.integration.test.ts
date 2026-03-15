import { afterAll, describe, expect, it, mock } from "bun:test";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";
import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
  req,
} from "../../test/integration-helper.js";

// ---------------------------------------------------------------------------
// Integration tests: Ignored products & staging card overrides
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

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
let cardId: string;

if (DATABASE_URL) {
  tempDbName = `openrift_test_ignored_products_${Date.now()}`;
  await createTempDb(DATABASE_URL, tempDbName);
  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../../app.js"),
    import("../../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;
  await migrateModule.migrate(db, noopLogger);

  // Seed test user + admin
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
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();

  // Seed a card (needed for staging card overrides FK)
  const [card] = await db
    .insertInto("cards")
    .values({
      slug: "TEST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      keywords: [],
      rules_text: null,
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = card.id;

  // Seed staging row (needed for POST /admin/ignored-products to find product names)
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "tcgplayer",
      external_id: 1001,
      group_id: 1,
      product_name: "Stageable Product",
      finish: "normal",
      recorded_at: new Date(),
      market_cents: 100,
      low_cents: 50,
      mid_cents: null,
      high_cents: null,
      trend_cents: null,
      avg1_cents: null,
      avg7_cents: null,
      avg30_cents: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Ignored products routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── GET /admin/ignored-products (empty) ─────────────────────────────────

  describe("GET /admin/ignored-products (empty)", () => {
    it("returns empty list initially", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-products"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toBeArray();
      expect(json.products).toHaveLength(0);
    });
  });

  // ── POST /admin/ignored-products ────────────────────────────────────────

  describe("POST /admin/ignored-products", () => {
    it("ignores a product that exists in staging", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          source: "tcgplayer",
          products: [{ externalId: 1001, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.ignored).toBe(1);
    });

    it("returns ok but does not insert for non-existent staging ID", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          source: "tcgplayer",
          products: [{ externalId: 9999, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify it was not actually inserted
      const rows = await db
        .selectFrom("marketplace_ignored_products")
        .select("external_id")
        .where("external_id", "=", 9999)
        .execute();
      expect(rows).toHaveLength(0);
    });

    it("returns 400 for invalid source", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          source: "invalid",
          products: [{ externalId: 1001, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/ignored-products (after ignoring) ────────────────────────

  describe("GET /admin/ignored-products (after ignoring)", () => {
    it("returns the ignored product", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-products"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toHaveLength(1);
      expect(json.products[0].marketplace).toBe("tcgplayer");
      expect(json.products[0].externalId).toBe(1001);
      expect(json.products[0].finish).toBe("normal");
      expect(json.products[0].productName).toBe("Stageable Product");
      expect(json.products[0].createdAt).toBeString();
    });
  });

  // ── DELETE /admin/ignored-products ──────────────────────────────────────

  describe("DELETE /admin/ignored-products", () => {
    it("un-ignores a product", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-products", {
          source: "tcgplayer",
          products: [{ externalId: 1001, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.unignored).toBe(1);
    });

    it("returns empty list after un-ignoring", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-products"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toHaveLength(0);
    });
  });

  // ── POST /admin/staging-card-overrides ──────────────────────────────────

  describe("POST /admin/staging-card-overrides", () => {
    it("creates an override", async () => {
      const res = await app.fetch(
        req("POST", "/admin/staging-card-overrides", {
          source: "tcgplayer",
          externalId: 1001,
          finish: "normal",
          cardId,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify the override exists in the database
      const row = await db
        .selectFrom("marketplace_staging_card_overrides")
        .select(["marketplace", "external_id", "finish", "card_id"])
        .where("marketplace", "=", "tcgplayer")
        .where("external_id", "=", 1001)
        .where("finish", "=", "normal")
        .executeTakeFirst();
      expect(row).toBeDefined();
      expect(row?.card_id).toBe(cardId);
    });
  });

  // ── DELETE /admin/staging-card-overrides ─────────────────────────────────

  describe("DELETE /admin/staging-card-overrides", () => {
    it("removes an override", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/staging-card-overrides", {
          source: "tcgplayer",
          externalId: 1001,
          finish: "normal",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify the override is gone
      const row = await db
        .selectFrom("marketplace_staging_card_overrides")
        .select("external_id")
        .where("marketplace", "=", "tcgplayer")
        .where("external_id", "=", 1001)
        .where("finish", "=", "normal")
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });
});
