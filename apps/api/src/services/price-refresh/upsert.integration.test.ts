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
  const printingSlug = "UPS-001:normal";
  const printingSlug2 = "UPS-001:foil";

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
        superTypes: [],
        domains: ["Fury"],
        might: 2,
        energy: 3,
        power: 4,
        mightBonus: null,
        keywords: [],
        rulesText: "Test rules",
        effectText: null,
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardId = insertedCard.id;

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
          slug: printingSlug,
          cardId,
          setId,
          shortCode: "UPS-001",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Test Artist",
          publicCode: "UPS-001/100",
          printedRulesText: "Test rules",
          printedEffectText: null,
          flavorText: null,
        },
        {
          slug: printingSlug2,
          cardId,
          setId,
          shortCode: "UPS-001",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
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

    // Seed marketplace sources (created via admin mapping in production)
    await db
      .insertInto("marketplaceProducts")
      .values([
        {
          marketplace: "cardmarket",
          printingId,
          externalId: 94_101,
          groupId: 94_001,
          productName: "UPS Test Product",
        },
        {
          marketplace: "cardmarket",
          printingId: printingId2,
          externalId: 94_201,
          groupId: 94_001,
          productName: "UPS Test Product Foil",
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
        recordedAt: recordedAt,
        marketCents: 0,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
        ...prices,
      };
    }

    it("inserts new snapshots and staging rows", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, staging);

      // Snapshot built internally from staging + mapped source for ext_id 94_101
      expect(counts.snapshots.total).toBe(1);
      expect(counts.snapshots.new).toBe(1);

      expect(counts.staging.total).toBe(1);
      expect(counts.staging.new).toBe(1);
    });

    it("reports unchanged when upserting identical data", async () => {
      // Same data as the first insert — should be unchanged
      const staging: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.new).toBe(0);
      expect(counts.snapshots.unchanged).toBe(1);
      expect(counts.staging.new).toBe(0);
      expect(counts.staging.unchanged).toBe(1);
    });

    it("reports updated when prices change", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          marketCents: 200,
          lowCents: 100,
          trendCents: 180,
          avg1Cents: 190,
          avg7Cents: 185,
          avg30Cents: 188,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.updated).toBeGreaterThan(0);
      expect(counts.staging.updated).toBeGreaterThan(0);
    });

    it("deduplicates staging by (external_id, finish, recorded_at)", async () => {
      const staging: StagingRow[] = [
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

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, staging);

      expect(counts.staging.total).toBe(1);
    });

    it("builds no snapshots for staging with unmapped external_id", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(99_999, "normal", {
          marketCents: 100,
          lowCents: 50,
          trendCents: 80,
          avg1Cents: 90,
          avg7Cents: 85,
          avg30Cents: 88,
        }),
      ];

      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.total).toBe(0);
      // Staging is still inserted even without a mapped source
      expect(counts.staging.total).toBe(1);
    });

    it("handles empty inputs", async () => {
      const counts = await upsertPriceData(repo, noopLogger, CM_CONFIG, []);

      expect(counts.snapshots.total).toBe(0);
      expect(counts.staging.total).toBe(0);
    });
  });
});
