import type { Logger } from "@openrift/shared/logger";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { priceRefreshRepo } from "../../repositories/price-refresh.js";
import { createTestContext } from "../../test/integration-context.js";
import { loadReferenceData } from "./reference-data.js";
import type { PriceUpsertConfig, StagingRow } from "./types.js";
import { upsertPriceData } from "./upsert.js";

// ---------------------------------------------------------------------------
// Integration tests: Price refresh upsert service
//
// Uses the shared integration database.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0022-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};
const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;

// ── Cardmarket config (matches real usage) ───────────────────────────────

const CM_CONFIG: PriceUpsertConfig = {
  marketplace: "cardmarket",
};

describe.skipIf(!ctx)("refresh-prices-shared integration", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = priceRefreshRepo(db);

  // Seed slugs (human-readable) — UUIDs are auto-generated
  const setSlug = "UPS";
  const cardSlug = "UPS-001";
  // UUIDs populated by beforeAll after INSERT ... RETURNING
  let setId: string;
  let cardId: string;
  let printingId: string;
  let printingId2: string;

  beforeAll(async () => {
    // Seed reference data: set -> card -> printings
    const insertedSet = await db
      .insertInto("sets")
      .values({ slug: setSlug, name: "UPS Integration Set", printedTotal: 100, sortOrder: 940 })
      .returning("id")
      .executeTakeFirstOrThrow();
    setId = insertedSet.id;

    const insertedCard = await db
      .insertInto("cards")
      .values({
        slug: cardSlug,
        name: "UPS Test Card",
        type: "Unit",
        might: 2,
        energy: 3,
        power: 4,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardId = insertedCard.id;

    await db.insertInto("cardDomains").values({ cardId, domainSlug: "Mind", ordinal: 0 }).execute();

    // Seed group for cardmarket marketplace
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace: "cardmarket", groupId: 94_001, name: "UPS Test Expansion" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const insertedPrintings = await db
      .insertInto("printings")
      .values([
        {
          cardId,
          setId,
          shortCode: "UPS-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "Test Artist",
          publicCode: "UPS-001/100",
          printedRulesText: "Test rules",
          printedEffectText: null,
          flavorText: null,
        },
        {
          cardId,
          setId,
          shortCode: "UPS-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "foil",
          artist: "Test Artist",
          publicCode: "UPS-001/100",
          printedRulesText: "Test rules",
          printedEffectText: null,
          flavorText: null,
        },
      ])
      .returning("id")
      .execute();
    printingId = insertedPrintings[0].id;
    printingId2 = insertedPrintings[1].id;

    // Seed marketplace products + variants (created via admin mapping in production).
    // Each marketplace product row represents ONE SKU; cardmarket has no per-language axis.
    const insertedProducts = await db
      .insertInto("marketplaceProducts")
      .values([
        {
          marketplace: "cardmarket",
          externalId: 94_101,
          groupId: 94_001,
          productName: "UPS Test Product",
          finish: "normal",
          language: null,
        },
        {
          marketplace: "cardmarket",
          externalId: 94_201,
          groupId: 94_001,
          productName: "UPS Test Product Foil",
          finish: "foil",
          language: null,
        },
      ])
      .returning(["id", "externalId"])
      .execute();
    const productIdByExt = new Map(insertedProducts.map((row) => [row.externalId, row.id]));

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        {
          marketplaceProductId: productIdByExt.get(94_101)!,
          printingId,
        },
        {
          marketplaceProductId: productIdByExt.get(94_201)!,
          printingId: printingId2,
        },
      ])
      .execute();
  });

  // ── loadReferenceData ─────────────────────────────────────────────────

  describe("loadReferenceData", () => {
    it("loads sets, cards, and printings", async () => {
      const ref = await loadReferenceData(createRepos(db));

      expect(ref.sets.length).toBeGreaterThanOrEqual(1);
      expect(ref.cards.length).toBeGreaterThanOrEqual(1);
      expect(ref.printings.length).toBeGreaterThanOrEqual(2);
    });

    it("builds setNameById map", async () => {
      const ref = await loadReferenceData(createRepos(db));

      expect(ref.setNameById.get(setId)).toBe("UPS Integration Set");
    });

    it("builds cardNameById map", async () => {
      const ref = await loadReferenceData(createRepos(db));

      expect(ref.cardNameById.get(cardId)).toBe("UPS Test Card");
    });

    it("builds namesBySet with normalized card names", async () => {
      const ref = await loadReferenceData(createRepos(db));

      const setMap = ref.namesBySet.get(setId);
      expect(setMap).toBeDefined();
      // "UPS Test Card" normalizes to "upstestcard"
      expect(setMap?.get("upstestcard")).toBe(cardId);
    });

    it("builds printingsByCardSetFinish map", async () => {
      const ref = await loadReferenceData(createRepos(db));

      const normalKey = `${cardId}|${setId}|normal`;
      const foilKey = `${cardId}|${setId}|foil`;
      expect(ref.printingsByCardSetFinish.get(normalKey)).toContain(printingId);
      expect(ref.printingsByCardSetFinish.get(foilKey)).toContain(printingId2);
    });

    it("builds printingByFullKey map", async () => {
      const ref = await loadReferenceData(createRepos(db));

      const fullKey = `${cardId}|${setId}|normal|normal|false`;
      expect(ref.printingByFullKey.get(fullKey)).toBe(printingId);
    });
  });

  // ── upsertPriceData ───────────────────────────────────────────────────

  describe("upsertPriceData", () => {
    const recordedAt = new Date("2026-03-10T00:00:00Z");

    function makeStagingRow(
      extId: number,
      finish: string,
      prices: Partial<StagingRow> = {},
    ): StagingRow {
      return {
        externalId: extId,
        groupId: 94_001,
        productName: "UPS Test Product",
        finish,
        // Cardmarket has no per-language SKU axis; must match product.language=null.
        language: null,
        recordedAt,
        marketCents: 0,
        lowCents: null,
        zeroLowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
        ...prices,
      };
    }

    it("inserts a new price row per fetched SKU", async () => {
      const fetched: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, fetched);

      // One price row per (product, recorded_at) regardless of how many
      // printings are bound to the product.
      expect(counts.prices.total).toBe(1);
      expect(counts.prices.new).toBe(1);
    });

    it("reports unchanged when upserting identical data", async () => {
      // Same data as the first insert — should be unchanged
      const fetched: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, fetched);

      expect(counts.prices.new).toBe(0);
      expect(counts.prices.unchanged).toBe(1);
    });

    it("reports updated when prices change", async () => {
      const fetched: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 200,
          lowCents: 100,
          trendCents: 180,
          avg1Cents: 190,
          avg7Cents: 185,
          avg30Cents: 188,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, fetched);

      expect(counts.prices.updated).toBeGreaterThan(0);
    });

    it("deduplicates duplicate fetch rows by (external_id, finish, recorded_at)", async () => {
      const fetched: StagingRow[] = [
        makeStagingRow(99_001, "normal", {
          marketCents: 50,
          lowCents: 25,
          trendCents: 40,
          avg1Cents: 45,
          avg7Cents: 42,
          avg30Cents: 44,
        }),
        makeStagingRow(99_001, "normal", {
          marketCents: 60,
          lowCents: 30,
          trendCents: 50,
          avg1Cents: 55,
          avg7Cents: 52,
          avg30Cents: 54,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, fetched);

      expect(counts.prices.total).toBe(1);
    });

    it("creates the product row and writes a price row even for an externalId with no bound printings", async () => {
      // Under the new model, every fetched SKU gets a product row + price row.
      // Binding a printing later inherits the accumulated history.
      const fetched: StagingRow[] = [
        makeStagingRow(99_999, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, fetched);

      expect(counts.prices.total).toBe(1);
    });

    it("handles empty inputs", async () => {
      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, []);

      expect(counts.prices.total).toBe(0);
    });
  });
});
