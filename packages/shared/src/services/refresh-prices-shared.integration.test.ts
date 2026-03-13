import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type { Kysely } from "kysely";

import type { Database } from "../db/types.js";
import type { Logger } from "../logger.js";
import { setupTestDb } from "../test/integration-setup.js";
import { loadReferenceData, upsertPriceData } from "./refresh-prices-shared.js";
import type {
  PriceUpsertConfig,
  SnapshotData,
  SourceRow,
  StagingRow,
} from "./refresh-prices-shared.js";

const DATABASE_URL = process.env.DATABASE_URL;

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};
const _noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;

// ── Cardmarket config (matches real usage) ───────────────────────────────

const CM_CONFIG: PriceUpsertConfig = {
  marketplace: "cardmarket",
  priceColumns: [
    "market_cents",
    "low_cents",
    "trend_cents",
    "avg1_cents",
    "avg7_cents",
    "avg30_cents",
  ],
};

describe.skipIf(!DATABASE_URL)("refresh-prices-shared integration", () => {
  let db: Kysely<Database>;
  let teardown: () => Promise<void>;

  // Seed IDs
  const setId = "INT";
  const cardId = "INT-001";
  const printingId = "INT-001:normal:::normal";
  const printingId2 = "INT-001:normal:::foil";

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, teardown } = await setupTestDb(DATABASE_URL!));

    // Seed reference data: set → card → printings
    await db
      .insertInto("sets")
      .values({ id: setId, name: "Integration Set", printed_total: 100, sort_order: 1 })
      .execute();

    await db
      .insertInto("cards")
      .values({
        id: cardId,
        name: "Test Card",
        type: "Unit",
        super_types: [],
        domains: ["Fury"],
        might: 2,
        energy: 3,
        power: 4,
        might_bonus: null,
        keywords: [],
        rules_text: "Test rules",
        effect_text: "",
        tags: [],
      })
      .execute();

    // Seed group for cardmarket marketplace
    await db
      .insertInto("marketplace_groups")
      .values({ marketplace: "cardmarket", group_id: 1, name: "Test Expansion" })
      .execute();

    await db
      .insertInto("printings")
      .values([
        {
          id: printingId,
          card_id: cardId,
          set_id: setId,
          source_id: "INT-001",
          collector_number: 1,
          rarity: "Common",
          art_variant: "normal",
          is_signed: false,
          is_promo: false,
          finish: "normal",
          artist: "Test Artist",
          public_code: "INT-001/100",
          printed_rules_text: "Test rules",
          printed_effect_text: "",
          flavor_text: "",
        },
        {
          id: printingId2,
          card_id: cardId,
          set_id: setId,
          source_id: "INT-001",
          collector_number: 1,
          rarity: "Common",
          art_variant: "normal",
          is_signed: false,
          is_promo: false,
          finish: "foil",
          artist: "Test Artist",
          public_code: "INT-001/100",
          printed_rules_text: "Test rules",
          printed_effect_text: "",
          flavor_text: "",
        },
      ])
      .execute();
  });

  afterAll(async () => {
    await teardown();
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

      expect(ref.setNameById.get(setId)).toBe("Integration Set");
    });

    it("builds cardNameById map", async () => {
      const ref = await loadReferenceData(db);

      expect(ref.cardNameById.get(cardId)).toBe("Test Card");
    });

    it("builds namesBySet with normalized card names", async () => {
      const ref = await loadReferenceData(db);

      const setMap = ref.namesBySet.get(setId);
      expect(setMap).toBeDefined();
      // "Test Card" normalizes to "testcard"
      expect(setMap?.get("testcard")).toBe(cardId);
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

    function makeSourceRow(pid: string, extId: number): SourceRow {
      return { printing_id: pid, external_id: extId, group_id: 1, product_name: "Test Product" };
    }

    function makeStagingRow(extId: number, finish: string): StagingRow {
      return {
        external_id: extId,
        group_id: 1,
        product_name: "Test Product",
        finish,
        recorded_at: recordedAt,
      } as StagingRow;
    }

    it("inserts new sources, snapshots, and staging rows", async () => {
      const sources: SourceRow[] = [makeSourceRow(printingId, 1001)];

      const snapshots: SnapshotData[] = [
        {
          printing_id: printingId,
          recorded_at: recordedAt,
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        } as unknown as SnapshotData,
      ];

      const staging: StagingRow[] = [
        {
          ...makeStagingRow(1001, "normal"),
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        } as unknown as StagingRow,
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, sources, snapshots, staging);

      expect(counts.sources.total).toBe(1);
      expect(counts.sources.new).toBe(1);
      expect(counts.sources.updated).toBe(0);
      expect(counts.sources.unchanged).toBe(0);

      expect(counts.snapshots.total).toBe(1);
      expect(counts.snapshots.new).toBe(1);

      expect(counts.staging.total).toBe(1);
      expect(counts.staging.new).toBe(1);
    });

    it("reports unchanged when upserting identical data", async () => {
      // Same data as the first insert — should be unchanged
      const sources: SourceRow[] = [makeSourceRow(printingId, 1001)];

      const snapshots: SnapshotData[] = [
        {
          printing_id: printingId,
          recorded_at: recordedAt,
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        } as unknown as SnapshotData,
      ];

      const staging: StagingRow[] = [
        {
          ...makeStagingRow(1001, "normal"),
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        } as unknown as StagingRow,
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, sources, snapshots, staging);

      expect(counts.sources.new).toBe(0);
      expect(counts.sources.unchanged).toBe(1);
      expect(counts.snapshots.new).toBe(0);
      expect(counts.snapshots.unchanged).toBe(1);
      expect(counts.staging.new).toBe(0);
      expect(counts.staging.unchanged).toBe(1);
    });

    it("reports updated when prices change", async () => {
      const sources: SourceRow[] = [makeSourceRow(printingId, 1001)];

      const snapshots: SnapshotData[] = [
        {
          printing_id: printingId,
          recorded_at: recordedAt,
          market_cents: 200,
          low_cents: 100,
          trend_cents: 180,
          avg1_cents: 190,
          avg7_cents: 185,
          avg30_cents: 188,
        } as unknown as SnapshotData,
      ];

      const staging: StagingRow[] = [
        {
          ...makeStagingRow(1001, "normal"),
          market_cents: 200,
          low_cents: 100,
          trend_cents: 180,
          avg1_cents: 190,
          avg7_cents: 185,
          avg30_cents: 188,
        } as unknown as StagingRow,
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, sources, snapshots, staging);

      expect(counts.snapshots.updated).toBeGreaterThan(0);
      expect(counts.staging.updated).toBeGreaterThan(0);
    });

    it("deduplicates sources by printing_id", async () => {
      const sources: SourceRow[] = [
        makeSourceRow(printingId2, 2001),
        makeSourceRow(printingId2, 2002), // duplicate printing_id, last wins
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, sources, [], []);

      // Only one unique source should be upserted
      expect(counts.sources.total).toBe(1);
    });

    it("deduplicates staging by (external_id, finish, recorded_at)", async () => {
      const staging: StagingRow[] = [
        {
          ...makeStagingRow(9001, "normal"),
          market_cents: 50,
          low_cents: 25,
          trend_cents: 40,
          avg1_cents: 45,
          avg7_cents: 42,
          avg30_cents: 44,
        } as unknown as StagingRow,
        {
          ...makeStagingRow(9001, "normal"),
          market_cents: 60,
          low_cents: 30,
          trend_cents: 50,
          avg1_cents: 55,
          avg7_cents: 52,
          avg30_cents: 54,
        } as unknown as StagingRow,
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, [], [], staging);

      expect(counts.staging.total).toBe(1);
    });

    it("skips snapshots for sources not in the database", async () => {
      const snapshots: SnapshotData[] = [
        {
          printing_id: "nonexistent-printing",
          recorded_at: recordedAt,
          market_cents: 100,
          low_cents: 50,
          trend_cents: 80,
          avg1_cents: 90,
          avg7_cents: 85,
          avg30_cents: 88,
        } as unknown as SnapshotData,
      ];

      const counts = await upsertPriceData(db, CM_CONFIG, [], snapshots, []);

      expect(counts.snapshots.total).toBe(0);
    });

    it("handles empty inputs", async () => {
      const counts = await upsertPriceData(db, CM_CONFIG, [], [], []);

      expect(counts.sources.total).toBe(0);
      expect(counts.snapshots.total).toBe(0);
      expect(counts.staging.total).toBe(0);
    });
  });
});
