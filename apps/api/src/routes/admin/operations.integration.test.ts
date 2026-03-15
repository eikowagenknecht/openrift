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
// Integration tests: Admin operations (clear prices, refresh prices)
//
// Uses a temp database — auth and price-refresh service are mocked.
// Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

// Mock the price refresh service BEFORE any other mocks
mock.module("@openrift/shared/services/price-refresh", () => ({
  refreshTcgplayerPrices: async () => ({ status: "ok", updated: 0 }),
  refreshCardmarketPrices: async () => ({ status: "ok", updated: 0 }),
}));

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
  tempDbName = `openrift_test_operations_${Date.now()}`;
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
}

/** Seed marketplace data for a given marketplace (tcgplayer or cardmarket). */
async function seedMarketplaceData(marketplace: string) {
  const [set] = await db
    .insertInto("sets")
    .values({
      slug: `${marketplace}-SET`,
      name: `${marketplace} Test Set`,
      printed_total: 1,
      sort_order: marketplace === "tcgplayer" ? 1 : 2,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: `${marketplace}-001`,
      name: `${marketplace} Card`,
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

  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: `${marketplace}-001:common:normal:`,
      card_id: card.id,
      set_id: set.id,
      source_id: `${marketplace}-001`,
      collector_number: 1,
      rarity: "Common",
      art_variant: "",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "",
      public_code: "",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();

  // marketplace_sources
  const [source] = await db
    .insertInto("marketplace_sources")
    .values({
      marketplace,
      printing_id: printing.id,
      external_id: marketplace === "tcgplayer" ? 999 : 998,
      group_id: 1,
      product_name: `${marketplace} Test`,
    })
    .returning("id")
    .execute();

  // marketplace_snapshots
  await db
    .insertInto("marketplace_snapshots")
    .values({
      source_id: source.id,
      recorded_at: new Date(),
      market_cents: 100,
      low_cents: 50,
    })
    .execute();

  // marketplace_staging
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace,
      external_id: marketplace === "tcgplayer" ? 888 : 887,
      group_id: 1,
      product_name: `${marketplace} Staged`,
      finish: "normal",
      recorded_at: new Date(),
      market_cents: 200,
      low_cents: 100,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Admin operations routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── POST /admin/clear-prices (tcgplayer) ────────────────────────────────

  describe("POST /admin/clear-prices (tcgplayer)", () => {
    it("clears tcgplayer marketplace data and returns counts", async () => {
      await seedMarketplaceData("tcgplayer");

      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "tcgplayer" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.source).toBe("tcgplayer");
      expect(json.result.deleted.snapshots).toBe(1);
      expect(json.result.deleted.sources).toBe(1);
      expect(json.result.deleted.staging).toBe(1);
    });

    it("verifies tables are empty for tcgplayer after clearing", async () => {
      const sources = await db
        .selectFrom("marketplace_sources")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .execute();
      expect(sources).toHaveLength(0);

      const staging = await db
        .selectFrom("marketplace_staging")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .execute();
      expect(staging).toHaveLength(0);
    });
  });

  // ── POST /admin/clear-prices (cardmarket) ──────────────────────────────

  describe("POST /admin/clear-prices (cardmarket)", () => {
    it("clears cardmarket marketplace data and returns counts", async () => {
      await seedMarketplaceData("cardmarket");

      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "cardmarket" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.source).toBe("cardmarket");
      expect(json.result.deleted.snapshots).toBe(1);
      expect(json.result.deleted.sources).toBe(1);
      expect(json.result.deleted.staging).toBe(1);
    });

    it("verifies tables are empty for cardmarket after clearing", async () => {
      const sources = await db
        .selectFrom("marketplace_sources")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .execute();
      expect(sources).toHaveLength(0);

      const staging = await db
        .selectFrom("marketplace_staging")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .execute();
      expect(staging).toHaveLength(0);
    });
  });

  // ── POST /admin/clear-prices (invalid source) ──────────────────────────

  describe("POST /admin/clear-prices (invalid source)", () => {
    it("returns 400 for invalid source", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "invalid" }));
      expect(res.status).toBe(400);
    });
  });

  // ── POST /admin/refresh-tcgplayer-prices ────────────────────────────────

  describe("POST /admin/refresh-tcgplayer-prices", () => {
    it("returns 200 with mocked result", async () => {
      const res = await app.fetch(req("POST", "/admin/refresh-tcgplayer-prices"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result).toEqual({ status: "ok", updated: 0 });
    });
  });

  // ── POST /admin/refresh-cardmarket-prices ──────────────────────────────

  describe("POST /admin/refresh-cardmarket-prices", () => {
    it("returns 200 with mocked result", async () => {
      const res = await app.fetch(req("POST", "/admin/refresh-cardmarket-prices"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result).toEqual({ status: "ok", updated: 0 });
    });
  });
});
