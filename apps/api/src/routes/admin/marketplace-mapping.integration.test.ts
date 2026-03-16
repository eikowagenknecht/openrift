import { describe, expect, it } from "bun:test";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: TCGPlayer & Cardmarket mapping routes
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix MKM- for entities it creates, groupId range distinct from others.
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
    .values({ slug: "MKM-TEST", name: "MKM Test Set", printedTotal: 2, sortOrder: 100 })
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
  cardId = cardRow.id;

  // Seed printing (normal finish)
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      slug: "MKM-001:common:normal:",
      cardId: cardId,
      setId: setId,
      sourceId: "MKM-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "MKM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
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
      cardId: cardId,
      setId: setId,
      sourceId: "MKM-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "foil",
      artist: "Test Artist",
      publicCode: "MKM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  _secondPrintingId = secondPrintingRow.id;

  // Marketplace group for TCGPlayer
  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "tcgplayer", groupId: 10_200, name: "MKM TCG Group" })
    .execute();

  // Marketplace group for Cardmarket
  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "cardmarket", groupId: 10_201, name: "MKM CM Group" })
    .execute();

  // TCGPlayer staging row (matches "MKM Test Card" by name prefix)
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "tcgplayer",
      externalId: 12_345,
      groupId: 10_200,
      productName: "MKM Test Card Normal",
      finish: "normal",
      recordedAt: new Date("2026-01-15T12:00:00Z"),
      marketCents: 100,
      lowCents: 50,
      midCents: 75,
      highCents: 150,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    })
    .execute();

  // Cardmarket staging row
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "cardmarket",
      externalId: 67_890,
      groupId: 10_201,
      productName: "MKM Test Card Normal",
      finish: "normal",
      recordedAt: new Date("2026-01-15T12:00:00Z"),
      marketCents: 80,
      lowCents: 40,
      midCents: null,
      highCents: null,
      trendCents: 70,
      avg1Cents: 60,
      avg7Cents: 65,
      avg30Cents: 75,
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
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 12_345)
        .where("finish", "=", "normal")
        .execute();
      expect(stagingRows).toHaveLength(0);

      // marketplace_sources row should exist
      const sourceRow = await db
        .selectFrom("marketplaceSources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printingId", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.externalId).toBe(12_345);

      // marketplace_snapshots should have at least one row
      const snapshots = await db
        .selectFrom("marketplaceSnapshots")
        .selectAll()
        .where("sourceId", "=", sourceRow?.id as string)
        .execute();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].marketCents).toBe(100);
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
        .selectFrom("marketplaceSources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printingId", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeUndefined();

      // Staging rows should be restored
      const stagingRows = await db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 12_345)
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
        .selectFrom("marketplaceSources")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printingId", "=", printingId)
        .where("externalId", "is not", null)
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
        .selectFrom("marketplaceSources")
        .selectAll()
        .where("marketplace", "=", "cardmarket")
        .where("printingId", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.externalId).toBe(67_890);

      // Verify staging row was deleted
      const stagingRows = await db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", "cardmarket")
        .where("externalId", "=", 67_890)
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
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "cardmarket",
          externalId: 67_890,
          groupId: 10_201,
          productName: "MKM Test Card Normal",
          finish: "normal",
          recordedAt: new Date("2026-01-15T12:00:00Z"),
          marketCents: 80,
          lowCents: 40,
          midCents: null,
          highCents: null,
          trendCents: 70,
          avg1Cents: 60,
          avg7Cents: 65,
          avg30Cents: 75,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
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
