import { describe, expect, it, mock } from "bun:test";

// Mock the price refresh service BEFORE any other imports that depend on it
mock.module("../../services/price-refresh/index.js", () => ({
  refreshTcgplayerPrices: async () => ({ status: "ok", updated: 0 }),
  refreshCardmarketPrices: async () => ({ status: "ok", updated: 0 }),
}));

// oxlint-disable-next-line import/first -- mock.module must run before this import
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin operations (clear prices, refresh prices)
//
// Uses the shared integration database. Auth and price-refresh service are mocked.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0019-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed test-specific data (OPS- prefix to avoid collisions)
if (ctx) {
  const { db } = ctx;

  // Ensure user is an admin
  await db
    .insertInto("admins")
    .values({ user_id: USER_ID })
    .onConflict((oc) => oc.column("user_id").doNothing())
    .execute();
}

/** Seed marketplace data for a given marketplace (tcgplayer or cardmarket). */
async function seedMarketplaceData(marketplace: string) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;

  const [set] = await db
    .insertInto("sets")
    .values({
      slug: `OPS-${marketplace}-SET`,
      name: `OPS ${marketplace} Test Set`,
      printed_total: 1,
      sort_order: marketplace === "tcgplayer" ? 901 : 902,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: `OPS-${marketplace}-001`,
      name: `OPS ${marketplace} Card`,
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
      slug: `OPS-${marketplace}-001:common:normal:`,
      card_id: card.id,
      set_id: set.id,
      source_id: `OPS-${marketplace}-001`,
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "OPS",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();

  // marketplace_groups (needed for marketplace_sources FK)
  await db
    .insertInto("marketplace_groups")
    .values({
      marketplace,
      group_id: marketplace === "tcgplayer" ? 90_001 : 90_002,
      name: `OPS ${marketplace} Group`,
    })
    .onConflict((oc) => oc.columns(["marketplace", "group_id"]).doNothing())
    .execute();

  const groupId = marketplace === "tcgplayer" ? 90_001 : 90_002;

  // marketplace_sources
  const [source] = await db
    .insertInto("marketplace_sources")
    .values({
      marketplace,
      printing_id: printing.id,
      external_id: marketplace === "tcgplayer" ? 90_999 : 90_998,
      group_id: groupId,
      product_name: `OPS ${marketplace} Test`,
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
      external_id: marketplace === "tcgplayer" ? 90_888 : 90_887,
      group_id: groupId,
      product_name: `OPS ${marketplace} Staged`,
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

describe.skipIf(!ctx)("Admin operations routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── POST /admin/clear-prices (tcgplayer) ────────────────────────────────

  describe("POST /admin/clear-prices (tcgplayer)", () => {
    it("clears tcgplayer marketplace data and returns counts", async () => {
      await seedMarketplaceData("tcgplayer");

      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "tcgplayer" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.source).toBe("tcgplayer");
      // Counts include seed data + test-seeded data
      expect(json.result.deleted.snapshots).toBeGreaterThanOrEqual(1);
      expect(json.result.deleted.sources).toBeGreaterThanOrEqual(1);
      expect(json.result.deleted.staging).toBeGreaterThanOrEqual(1);
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
      // Counts include seed data + test-seeded data
      expect(json.result.deleted.snapshots).toBeGreaterThanOrEqual(1);
      expect(json.result.deleted.sources).toBeGreaterThanOrEqual(1);
      expect(json.result.deleted.staging).toBeGreaterThanOrEqual(1);
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
