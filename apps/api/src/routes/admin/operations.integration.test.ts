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
    .values({ userId: USER_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
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
      printedTotal: 1,
      sortOrder: marketplace === "tcgplayer" ? 901 : 902,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: `OPS-${marketplace}-001`,
      name: `OPS ${marketplace} Card`,
      type: "Unit",
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      rulesText: null,
      effectText: null,
      tags: [],
    })
    .returning("id")
    .execute();

  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: `OPS-${marketplace}-001:common:normal:`,
      cardId: card.id,
      setId: set.id,
      sourceId: `OPS-${marketplace}-001`,
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "OPS",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();

  // marketplace_groups (needed for marketplace_sources FK)
  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace,
      groupId: marketplace === "tcgplayer" ? 90_001 : 90_002,
      name: `OPS ${marketplace} Group`,
    })
    .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
    .execute();

  const groupId = marketplace === "tcgplayer" ? 90_001 : 90_002;

  // marketplace_sources
  const [source] = await db
    .insertInto("marketplaceSources")
    .values({
      marketplace,
      printingId: printing.id,
      externalId: marketplace === "tcgplayer" ? 90_999 : 90_998,
      groupId: groupId,
      productName: `OPS ${marketplace} Test`,
    })
    .returning("id")
    .execute();

  // marketplace_snapshots
  await db
    .insertInto("marketplaceSnapshots")
    .values({
      sourceId: source.id,
      recordedAt: new Date(),
      marketCents: 100,
      lowCents: 50,
    })
    .execute();

  // marketplace_staging
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace,
      externalId: marketplace === "tcgplayer" ? 90_888 : 90_887,
      groupId: groupId,
      productName: `OPS ${marketplace} Staged`,
      finish: "normal",
      recordedAt: new Date(),
      marketCents: 200,
      lowCents: 100,
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
        .selectFrom("marketplaceSources")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .execute();
      expect(sources).toHaveLength(0);

      const staging = await db
        .selectFrom("marketplaceStaging")
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
        .selectFrom("marketplaceSources")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .execute();
      expect(sources).toHaveLength(0);

      const staging = await db
        .selectFrom("marketplaceStaging")
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
