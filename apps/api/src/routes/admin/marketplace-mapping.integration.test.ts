import { describe, expect, it } from "bun:test";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: TCGPlayer & Cardmarket mapping routes
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix MKM- for entities it creates, group_id range distinct from others.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0013-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed IDs populated during setup
let setId: string;
let cardId: string;
let printingId: string;
let _secondPrintingId: string;

if (ctx) {
  const { db } = ctx;

  // Seed set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "MKM-TEST", name: "MKM Test Set", printed_total: 2, sort_order: 100 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Seed card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "MKM-001",
      name: "MKM Test Card",
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
  cardId = cardRow.id;

  // Seed printing (normal finish)
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      slug: "MKM-001:common:normal:",
      card_id: cardId,
      set_id: setId,
      source_id: "MKM-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "MKM",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Seed second printing (foil finish)
  const [secondPrintingRow] = await db
    .insertInto("printings")
    .values({
      slug: "MKM-001:common:foil:",
      card_id: cardId,
      set_id: setId,
      source_id: "MKM-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "foil",
      artist: "Test Artist",
      public_code: "MKM",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  _secondPrintingId = secondPrintingRow.id;

  // Marketplace group for TCGPlayer
  await db
    .insertInto("marketplace_groups")
    .values({ marketplace: "tcgplayer", group_id: 10_200, name: "MKM TCG Group" })
    .execute();

  // Marketplace group for Cardmarket
  await db
    .insertInto("marketplace_groups")
    .values({ marketplace: "cardmarket", group_id: 10_201, name: "MKM CM Group" })
    .execute();

  // TCGPlayer staging row (matches "MKM Test Card" by name prefix)
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "tcgplayer",
      external_id: 12_345,
      group_id: 10_200,
      product_name: "MKM Test Card Normal",
      finish: "normal",
      recorded_at: new Date("2026-01-15T12:00:00Z"),
      market_cents: 100,
      low_cents: 50,
      mid_cents: 75,
      high_cents: 150,
      trend_cents: null,
      avg1_cents: null,
      avg7_cents: null,
      avg30_cents: null,
    })
    .execute();

  // Cardmarket staging row
  await db
    .insertInto("marketplace_staging")
    .values({
      marketplace: "cardmarket",
      external_id: 67_890,
      group_id: 10_201,
      product_name: "MKM Test Card Normal",
      finish: "normal",
      recorded_at: new Date("2026-01-15T12:00:00Z"),
      market_cents: 80,
      low_cents: 40,
      mid_cents: null,
      high_cents: null,
      trend_cents: 70,
      avg1_cents: 60,
      avg7_cents: 65,
      avg30_cents: 75,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Marketplace mapping routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── TCGPlayer: GET ─────────────────────────────────────────────────────────

  describe("GET /admin/tcgplayer-mappings", () => {
    it("returns overview with groups and staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/tcgplayer-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups.length).toBeGreaterThanOrEqual(1);
      expect(json.unmatchedProducts).toBeArray();
      expect(json.ignoredProducts).toBeArray();
      expect(json.allCards).toBeArray();

      // Our seeded card should appear in groups
      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();
      expect(testGroup.printings.length).toBeGreaterThanOrEqual(1);
      // Staged product matched by name prefix
      expect(testGroup.stagedProducts.length).toBeGreaterThanOrEqual(1);
      expect(testGroup.stagedProducts[0].externalId).toBe(12_345);
    });

    it("without all=true, filters to groups with unmapped printings", async () => {
      const res = await app.fetch(req("GET", "/admin/tcgplayer-mappings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // All returned groups should have at least one unmapped printing
      for (const group of json.groups) {
        const hasUnmapped = group.printings.some(
          (p: { externalId: number | null }) => p.externalId === null,
        );
        expect(hasUnmapped).toBe(true);
      }
    });

    it("all=true returns all groups including fully mapped ones", async () => {
      const resAll = await app.fetch(req("GET", "/admin/tcgplayer-mappings?all=true"));
      const resFiltered = await app.fetch(req("GET", "/admin/tcgplayer-mappings"));

      const allJson = await resAll.json();
      const allGroups = allJson.groups;
      const filteredJson = await resFiltered.json();
      const filteredGroups = filteredJson.groups;

      expect(allGroups.length).toBeGreaterThanOrEqual(filteredGroups.length);
    });
  });

  // ── TCGPlayer: POST (save mappings) ────────────────────────────────────────

  describe("POST /admin/tcgplayer-mappings", () => {
    it("returns saved: 0 for empty mappings array", async () => {
      const res = await app.fetch(req("POST", "/admin/tcgplayer-mappings", { mappings: [] }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });

    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        req("POST", "/admin/tcgplayer-mappings", {
          mappings: [{ printingId, externalId: 12_345 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(1);
    });

    it("after mapping, staging row is deleted and snapshot is created", async () => {
      // Staging row for this external_id + finish should be gone
      const stagingRows = await db
        .selectFrom("marketplace_staging")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("external_id", "=", 12_345)
        .where("finish", "=", "normal")
        .execute();
      expect(stagingRows).toHaveLength(0);

      // marketplace_sources row should exist
      const sourceRow = await db
        .selectFrom("marketplace_sources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printing_id", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.external_id).toBe(12_345);

      // marketplace_snapshots should have at least one row
      const snapshots = await db
        .selectFrom("marketplace_snapshots")
        .selectAll()
        .where("source_id", "=", sourceRow?.id as string)
        .execute();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].market_cents).toBe(100);
    });

    it("mapped printing shows externalId in overview", async () => {
      const res = await app.fetch(req("GET", "/admin/tcgplayer-mappings?all=true"));
      const json = await res.json();

      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();

      const mappedPrinting = testGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mappedPrinting).toBeDefined();
      expect(mappedPrinting.externalId).toBe(12_345);
    });
  });

  // ── TCGPlayer: DELETE (unmap single) ───────────────────────────────────────

  describe("DELETE /admin/tcgplayer-mappings", () => {
    it("unmaps a single printing and restores staging rows", async () => {
      const res = await app.fetch(req("DELETE", "/admin/tcgplayer-mappings", { printingId }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Source should be deleted
      const sourceRow = await db
        .selectFrom("marketplace_sources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printing_id", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeUndefined();

      // Staging rows should be restored
      const stagingRows = await db
        .selectFrom("marketplace_staging")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("external_id", "=", 12_345)
        .where("finish", "=", "normal")
        .execute();
      expect(stagingRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── TCGPlayer: DELETE /all (unmap all) ─────────────────────────────────────

  describe("DELETE /admin/tcgplayer-mappings/all", () => {
    it("unmaps all TCGPlayer mappings", async () => {
      // First map something so there's data to unmap
      await app.fetch(
        req("POST", "/admin/tcgplayer-mappings", {
          mappings: [{ printingId, externalId: 12_345 }],
        }),
      );

      const res = await app.fetch(req("DELETE", "/admin/tcgplayer-mappings/all"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.unmapped).toBeGreaterThanOrEqual(1);

      // No more sources with external_id should exist for TCGPlayer for our printing
      const sources = await db
        .selectFrom("marketplace_sources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printing_id", "=", printingId)
        .where("external_id", "is not", null)
        .execute();
      expect(sources).toHaveLength(0);
    });
  });

  // ── Cardmarket: GET ────────────────────────────────────────────────────────

  describe("GET /admin/cardmarket-mappings", () => {
    it("returns overview with groups and staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups.length).toBeGreaterThanOrEqual(1);

      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();
      expect(testGroup.stagedProducts.length).toBeGreaterThanOrEqual(1);
      expect(testGroup.stagedProducts[0].externalId).toBe(67_890);
    });

    it("without all=true, filters to groups with unmapped printings", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-mappings"));
      expect(res.status).toBe(200);

      const json = await res.json();
      for (const group of json.groups) {
        const hasUnmapped = group.printings.some(
          (p: { externalId: number | null }) => p.externalId === null,
        );
        expect(hasUnmapped).toBe(true);
      }
    });
  });

  // ── Cardmarket: POST (save mappings) ───────────────────────────────────────

  describe("POST /admin/cardmarket-mappings", () => {
    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        req("POST", "/admin/cardmarket-mappings", {
          mappings: [{ printingId, externalId: 67_890 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(1);

      // Verify source was created
      const sourceRow = await db
        .selectFrom("marketplace_sources")
        .selectAll()
        .where("marketplace", "=", "cardmarket")
        .where("printing_id", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.external_id).toBe(67_890);

      // Verify staging row was deleted
      const stagingRows = await db
        .selectFrom("marketplace_staging")
        .selectAll()
        .where("marketplace", "=", "cardmarket")
        .where("external_id", "=", 67_890)
        .where("finish", "=", "normal")
        .execute();
      expect(stagingRows).toHaveLength(0);
    });

    it("returns saved: 0 for empty mappings array", async () => {
      const res = await app.fetch(req("POST", "/admin/cardmarket-mappings", { mappings: [] }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });
  });

  // ── Cardmarket: DELETE (unmap single) ──────────────────────────────────────

  describe("DELETE /admin/cardmarket-mappings", () => {
    it("unmaps a single printing", async () => {
      const res = await app.fetch(req("DELETE", "/admin/cardmarket-mappings", { printingId }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });

  // ── Cardmarket: DELETE /all (unmap all) ────────────────────────────────────

  describe("DELETE /admin/cardmarket-mappings/all", () => {
    it("unmaps all Cardmarket mappings", async () => {
      // Re-map so there's something to unmap
      // First re-seed staging since it was deleted by the POST above
      await db
        .insertInto("marketplace_staging")
        .values({
          marketplace: "cardmarket",
          external_id: 67_890,
          group_id: 10_201,
          product_name: "MKM Test Card Normal",
          finish: "normal",
          recorded_at: new Date("2026-01-15T12:00:00Z"),
          market_cents: 80,
          low_cents: 40,
          mid_cents: null,
          high_cents: null,
          trend_cents: 70,
          avg1_cents: 60,
          avg7_cents: 65,
          avg30_cents: 75,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "external_id", "finish", "recorded_at"]).doNothing(),
        )
        .execute();

      await app.fetch(
        req("POST", "/admin/cardmarket-mappings", {
          mappings: [{ printingId, externalId: 67_890 }],
        }),
      );

      const res = await app.fetch(req("DELETE", "/admin/cardmarket-mappings/all"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.unmapped).toBeGreaterThanOrEqual(1);
    });
  });
});
