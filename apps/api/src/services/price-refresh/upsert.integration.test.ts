import { beforeAll, describe, expect, it } from "bun:test";

import type { Logger } from "@openrift/shared/logger";

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

  // Seed slugs (human-readable) — UUIDs are auto-generated
  const setSlug = "UPS";
  const cardSlug = "UPS-001";
  const printingSlug = "UPS-001:common:normal";
  const printingSlug2 = "UPS-001:common:foil";

  // UUIDs populated by beforeAll after INSERT ... RETURNING
  let setId: string;
  let cardId: string;
  let printingId: string;
  let printingId2: string;

  beforeAll(async () => {
    // Seed reference data: set -> card -> printings
    const insertedSet = await db
      .insertInto("sets")
      .values({ slug: setSlug, name: "UPS Integration Set", printed_total: 100, sort_order: 940 })
      .returning("id")
      .executeTakeFirstOrThrow();
    setId = insertedSet.id;

    const insertedCard = await db
      .insertInto("cards")
      .values({
        slug: cardSlug,
        name: "UPS Test Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 2,
        energy: 3,
        power: 4,
        might_bonus: null,
        keywords: [],
        rules_text: "Test rules",
        effect_text: null,
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardId = insertedCard.id;

    // Seed group for cardmarket marketplace
    await db
      .insertInto("marketplace_groups")
      .values({ marketplace: "cardmarket", group_id: 94_001, name: "UPS Test Expansion" })
      .onConflict((oc) => oc.columns(["marketplace", "group_id"]).doNothing())
      .execute();

    const insertedPrintings = await db
      .insertInto("printings")
      .values([
        {
          slug: printingSlug,
          card_id: cardId,
          set_id: setId,
          source_id: "UPS-001",
          collector_number: 1,
          rarity: "Common",
          art_variant: "normal",
          is_signed: false,
          is_promo: false,
          finish: "normal",
          artist: "Test Artist",
          public_code: "UPS-001/100",
          printed_rules_text: "Test rules",
          printed_effect_text: null,
          flavor_text: null,
        },
        {
          slug: printingSlug2,
          card_id: cardId,
          set_id: setId,
          source_id: "UPS-001",
          collector_number: 1,
          rarity: "Common",
          art_variant: "normal",
          is_signed: false,
          is_promo: false,
          finish: "foil",
          artist: "Test Artist",
          public_code: "UPS-001/100",
          printed_rules_text: "Test rules",
          printed_effect_text: null,
          flavor_text: null,
        },
      ])
      .returning("id")
      .execute();
    printingId = insertedPrintings[0].id;
    printingId2 = insertedPrintings[1].id;

    // Seed marketplace sources (created via admin mapping in production)
    await db
      .insertInto("marketplace_sources")
      .values([
        {
          marketplace: "cardmarket",
          printing_id: printingId,
          external_id: 94_101,
          group_id: 94_001,
          product_name: "UPS Test Product",
        },
        {
          marketplace: "cardmarket",
          printing_id: printingId2,
          external_id: 94_201,
          group_id: 94_001,
          product_name: "UPS Test Product Foil",
        },
      ])
      .execute();
  });

  // ── loadReferenceData ─────────────────────────────────────────────────

  describe("loadReferenceData", () => {
    it("loads sets, cards, and printings", async () => {
      const ref = await loadReferenceData(db);

      expect(ref.sets.length).toBeGreaterThanOrEqual(1);
      expect(ref.cards.length).toBeGreaterThanOrEqual(1);
      expect(ref.printings.length).toBeGreaterThanOrEqual(2);
    });

    it("builds setNameById map", async () => {
      const ref = await loadReferenceData(db);

      expect(ref.setNameById.get(setId)).toBe("UPS Integration Set");
    });

    it("builds cardNameById map", async () => {
      const ref = await loadReferenceData(db);

      expect(ref.cardNameById.get(cardId)).toBe("UPS Test Card");
    });

    it("builds namesBySet with normalized card names", async () => {
      const ref = await loadReferenceData(db);

      const setMap = ref.namesBySet.get(setId);
      expect(setMap).toBeDefined();
      // "UPS Test Card" normalizes to "upstestcard"
      expect(setMap?.get("upstestcard")).toBe(cardId);
    });

    it("builds printingsByCardSetFinish map", async () => {
      const ref = await loadReferenceData(db);

      const normalKey = `${cardId}|${setId}|normal`;
      const foilKey = `${cardId}|${setId}|foil`;
      expect(ref.printingsByCardSetFinish.get(normalKey)).toContain(printingId);
      expect(ref.printingsByCardSetFinish.get(foilKey)).toContain(printingId2);
    });

    it("builds printingByFullKey map", async () => {
      const ref = await loadReferenceData(db);

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
        external_id: extId,
        group_id: 94_001,
        product_name: "UPS Test Product",
        finish,
        recorded_at: recordedAt,
        market_cents: 0,
        low_cents: null,
        mid_cents: null,
        high_cents: null,
        trend_cents: null,
        avg1_cents: null,
        avg7_cents: null,
        avg30_cents: null,
        ...prices,
      };
    }

    it("inserts new snapshots and staging rows", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        }),
      ];

      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, staging);

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
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        }),
      ];

      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.new).toBe(0);
      expect(counts.snapshots.unchanged).toBe(1);
      expect(counts.staging.new).toBe(0);
      expect(counts.staging.unchanged).toBe(1);
    });

    it("reports updated when prices change", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(94_101, "normal", {
          market_cents: 200,
          low_cents: 100,
          trend_cents: 180,
          avg1_cents: 190,
          avg7_cents: 185,
          avg30_cents: 188,
        }),
      ];

      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.updated).toBeGreaterThan(0);
      expect(counts.staging.updated).toBeGreaterThan(0);
    });

    it("deduplicates staging by (external_id, finish, recorded_at)", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(99_001, "normal", {
          market_cents: 50,
          low_cents: 25,
          trend_cents: 40,
          avg1_cents: 45,
          avg7_cents: 42,
          avg30_cents: 44,
        }),
        makeStagingRow(99_001, "normal", {
          market_cents: 60,
          low_cents: 30,
          trend_cents: 50,
          avg1_cents: 55,
          avg7_cents: 52,
          avg30_cents: 54,
        }),
      ];

      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, staging);

      expect(counts.staging.total).toBe(1);
    });

    it("builds no snapshots for staging with unmapped external_id", async () => {
      const staging: StagingRow[] = [
        makeStagingRow(99_999, "normal", {
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        }),
      ];

      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, staging);

      expect(counts.snapshots.total).toBe(0);
      // Staging is still inserted even without a mapped source
      expect(counts.staging.total).toBe(1);
    });

    it("handles empty inputs", async () => {
      const counts = await upsertPriceData(db, noopLogger, CM_CONFIG, []);

      expect(counts.snapshots.total).toBe(0);
      expect(counts.staging.total).toBe(0);
    });
  });
});
