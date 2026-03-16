import { describe, expect, it, mock } from "bun:test";

// Mock the price refresh service BEFORE any other imports that depend on it
mock.module("../../services/price-refresh/index.js", () => ({
  refreshTcgplayerPrices: async () => ({ status: "ok", updated: 0 }),
  refreshCardmarketPrices: async () => ({ status: "ok", updated: 0 }),
}));

// oxlint-disable-next-line import/first -- mock.module must run before this import
import {
  createTestContext,
  createUnauthenticatedTestContext,
  req,
} from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin operations (clear prices, refresh prices)
//
// Uses the shared integration database. Auth and price-refresh service are mocked.
// Uses prefix OPS- for entities it creates.
// ---------------------------------------------------------------------------

const ADMIN_USER_ID = "a0000000-0019-4000-a000-000000000001";
const NON_ADMIN_USER_ID = "a0000000-0001-4000-a000-000000000001";

const ctx = createTestContext(ADMIN_USER_ID);
const unauthCtx = createUnauthenticatedTestContext();
const nonAdminCtx = createTestContext(NON_ADMIN_USER_ID);

// Seed test-specific data (OPS- prefix to avoid collisions)
if (ctx) {
  const { db } = ctx;

  // Ensure admin user is in admins table
  await db
    .insertInto("admins")
    .values({ userId: ADMIN_USER_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
    .execute();
}

let seedCounter = 0;

/** Seed marketplace data for a given marketplace (tcgplayer or cardmarket). */
async function seedMarketplaceData(marketplace: string) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;

  // Use a counter suffix to ensure unique slugs across repeated calls
  const suffix = seedCounter++;

  const [set] = await db
    .insertInto("sets")
    .values({
      slug: `OPS-${marketplace}-SET-${suffix}`,
      name: `OPS ${marketplace} Test Set ${suffix}`,
      printedTotal: 1,
      sortOrder: 900 + suffix,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: `OPS-${marketplace}-${suffix}`,
      name: `OPS ${marketplace} Card ${suffix}`,
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
      slug: `OPS-${marketplace}-${suffix}:common:normal:`,
      cardId: card.id,
      setId: set.id,
      sourceId: `OPS-${marketplace}-${suffix}`,
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

  // Use suffix-based IDs to avoid conflicts across repeated seed calls
  const baseGroupId = 90_000 + suffix * 10 + (marketplace === "tcgplayer" ? 1 : 2);
  const baseExtId = 90_000 + suffix * 100 + (marketplace === "tcgplayer" ? 99 : 98);
  const stagingExtId = 90_000 + suffix * 100 + (marketplace === "tcgplayer" ? 88 : 87);

  // marketplace_groups (needed for marketplace_sources FK)
  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace,
      groupId: baseGroupId,
      name: `OPS ${marketplace} Group ${suffix}`,
    })
    .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
    .execute();

  // marketplace_sources
  const [source] = await db
    .insertInto("marketplaceSources")
    .values({
      marketplace,
      printingId: printing.id,
      externalId: baseExtId,
      groupId: baseGroupId,
      productName: `OPS ${marketplace} Test ${suffix}`,
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
      externalId: stagingExtId,
      groupId: baseGroupId,
      productName: `OPS ${marketplace} Staged ${suffix}`,
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

  // ── Authentication & authorization ──────────────────────────────────────

  describe("authentication and authorization", () => {
    it("returns 401 for unauthenticated request to clear-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(
        req("POST", "/admin/clear-prices", { source: "tcgplayer" }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated request to refresh-tcgplayer-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(req("POST", "/admin/refresh-tcgplayer-prices"));
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated request to refresh-cardmarket-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(req("POST", "/admin/refresh-cardmarket-prices"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user on clear-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(
        req("POST", "/admin/clear-prices", { source: "tcgplayer" }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 for non-admin user on refresh-tcgplayer-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(req("POST", "/admin/refresh-tcgplayer-prices"));
      expect(res.status).toBe(403);
    });

    it("returns 403 for non-admin user on refresh-cardmarket-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(req("POST", "/admin/refresh-cardmarket-prices"));
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/clear-prices (validation) ─────────────────────────────

  describe("POST /admin/clear-prices (validation)", () => {
    it("returns 400 for invalid source value", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "invalid" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when source is missing from body", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-prices", {}));
      expect(res.status).toBe(400);
    });

    it("returns error when body is missing", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-prices"));
      expect(res.status).toBe(400);
    });
  });

  // ── POST /admin/clear-prices (tcgplayer) ────────────────────────────────

  describe("POST /admin/clear-prices (tcgplayer)", () => {
    it("clears tcgplayer marketplace data and returns counts", async () => {
      await seedMarketplaceData("tcgplayer");

      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "tcgplayer" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.source).toBe("tcgplayer");
      expect(json.deleted).toBeDefined();
      expect(typeof json.deleted.snapshots).toBe("number");
      expect(typeof json.deleted.sources).toBe("number");
      expect(typeof json.deleted.staging).toBe("number");
      expect(json.deleted.snapshots).toBeGreaterThanOrEqual(1);
      expect(json.deleted.sources).toBeGreaterThanOrEqual(1);
      expect(json.deleted.staging).toBeGreaterThanOrEqual(1);
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

    it("returns zero counts when clearing already-empty tcgplayer data", async () => {
      // Tables are already empty from the previous clear
      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "tcgplayer" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.source).toBe("tcgplayer");
      expect(json.deleted.snapshots).toBe(0);
      expect(json.deleted.sources).toBe(0);
      expect(json.deleted.staging).toBe(0);
    });
  });

  // ── POST /admin/clear-prices (cardmarket) ──────────────────────────────

  describe("POST /admin/clear-prices (cardmarket)", () => {
    it("clears cardmarket marketplace data and returns counts", async () => {
      await seedMarketplaceData("cardmarket");

      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "cardmarket" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.source).toBe("cardmarket");
      expect(json.deleted).toBeDefined();
      expect(typeof json.deleted.snapshots).toBe("number");
      expect(typeof json.deleted.sources).toBe("number");
      expect(typeof json.deleted.staging).toBe("number");
      expect(json.deleted.snapshots).toBeGreaterThanOrEqual(1);
      expect(json.deleted.sources).toBeGreaterThanOrEqual(1);
      expect(json.deleted.staging).toBeGreaterThanOrEqual(1);
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

    it("returns zero counts when clearing already-empty cardmarket data", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "cardmarket" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.source).toBe("cardmarket");
      expect(json.deleted.snapshots).toBe(0);
      expect(json.deleted.sources).toBe(0);
      expect(json.deleted.staging).toBe(0);
    });
  });

  // ── POST /admin/clear-prices does not affect other marketplace ─────────

  describe("POST /admin/clear-prices (cross-marketplace isolation)", () => {
    it("clearing tcgplayer does not remove cardmarket data", async () => {
      // Seed both marketplaces
      await seedMarketplaceData("tcgplayer");
      await seedMarketplaceData("cardmarket");

      // Clear only tcgplayer
      const res = await app.fetch(req("POST", "/admin/clear-prices", { source: "tcgplayer" }));
      expect(res.status).toBe(200);

      // Verify tcgplayer is cleared
      const tcgSources = await db
        .selectFrom("marketplaceSources")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .execute();
      expect(tcgSources).toHaveLength(0);

      // Verify cardmarket is untouched
      const cmSources = await db
        .selectFrom("marketplaceSources")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .execute();
      expect(cmSources.length).toBeGreaterThanOrEqual(1);

      const cmStaging = await db
        .selectFrom("marketplaceStaging")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .execute();
      expect(cmStaging.length).toBeGreaterThanOrEqual(1);

      // Clean up cardmarket for subsequent tests
      await app.fetch(req("POST", "/admin/clear-prices", { source: "cardmarket" }));
    });
  });

  // ── POST /admin/refresh-tcgplayer-prices ────────────────────────────────

  describe("POST /admin/refresh-tcgplayer-prices", () => {
    it("returns 200 with mocked result", async () => {
      const res = await app.fetch(req("POST", "/admin/refresh-tcgplayer-prices"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: "ok", updated: 0 });
    });
  });

  // ── POST /admin/refresh-cardmarket-prices ──────────────────────────────

  describe("POST /admin/refresh-cardmarket-prices", () => {
    it("returns 200 with mocked result", async () => {
      const res = await app.fetch(req("POST", "/admin/refresh-cardmarket-prices"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: "ok", updated: 0 });
    });
  });
});
