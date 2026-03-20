import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Marketplace mapping mutation routes
//
// Tests POST/DELETE on /admin/marketplace-mappings?marketplace=<mp>
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
      shortCode: "MKM-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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
      shortCode: "MKM-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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

  // ── TCGPlayer: GET (via unified endpoint) ─────────────────────────────────

  describe("GET /admin/marketplace-mappings (TCGPlayer data)", () => {
    it("returns overview with groups and staged products", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups.length).toBeGreaterThanOrEqual(1);
      expect(json.unmatchedProducts).toBeDefined();
      expect(json.allCards).toBeArray();

      // Our seeded card should appear in groups
      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();
      expect(testGroup.printings.length).toBeGreaterThanOrEqual(1);
      // Staged product matched by name prefix
      expect(testGroup.tcgplayer.stagedProducts.length).toBeGreaterThanOrEqual(1);
      expect(testGroup.tcgplayer.stagedProducts[0].externalId).toBe(12_345);
    });
  });

  // ── TCGPlayer: POST (save mappings) ────────────────────────────────────────

  describe("POST /admin/marketplace-mappings?marketplace=tcgplayer", () => {
    it("returns saved: 0 for empty mappings array", async () => {
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", { mappings: [] }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });

    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
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
        .selectFrom("marketplaceProducts")
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
        .where("productId", "=", sourceRow?.id as string)
        .execute();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].marketCents).toBe(100);
    });

    it("mapped printing shows externalId in overview", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      const json = await res.json();

      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();

      const mappedPrinting = testGroup.printings.find(
        (p: { printingId: string }) => p.printingId === printingId,
      );
      expect(mappedPrinting).toBeDefined();
      expect(mappedPrinting.tcgExternalId).toBe(12_345);
    });
  });

  // ── TCGPlayer: DELETE (unmap single) ───────────────────────────────────────

  describe("DELETE /admin/marketplace-mappings?marketplace=tcgplayer", () => {
    it("unmaps a single printing and restores staging rows", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings?marketplace=tcgplayer", { printingId }),
      );
      expect(res.status).toBe(204);

      // Source should be deleted
      const sourceRow = await db
        .selectFrom("marketplaceProducts")
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

  describe("DELETE /admin/marketplace-mappings/all?marketplace=tcgplayer", () => {
    it("unmaps all TCGPlayer mappings", async () => {
      // First map something so there's data to unmap
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 12_345 }],
        }),
      );

      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.unmapped).toBeGreaterThanOrEqual(1);

      // No more sources with external_id should exist for TCGPlayer for our printing
      const sources = await db
        .selectFrom("marketplaceProducts")
        .selectAll()
        .where("marketplace", "=", "tcgplayer")
        .where("printingId", "=", printingId)
        .where("externalId", "is not", null)
        .execute();
      expect(sources).toHaveLength(0);
    });
  });

  // ── Cardmarket: POST (save mappings) ───────────────────────────────────────

  describe("POST /admin/marketplace-mappings?marketplace=cardmarket", () => {
    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 67_890 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(1);

      // Verify source was created
      const sourceRow = await db
        .selectFrom("marketplaceProducts")
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
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", { mappings: [] }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });
  });

  // ── Cardmarket: DELETE (unmap single) ──────────────────────────────────────

  describe("DELETE /admin/marketplace-mappings?marketplace=cardmarket", () => {
    it("unmaps a single printing", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings?marketplace=cardmarket", { printingId }),
      );
      expect(res.status).toBe(204);
    });
  });

  // ── Cardmarket: DELETE /all (unmap all) ────────────────────────────────────

  describe("DELETE /admin/marketplace-mappings/all?marketplace=cardmarket", () => {
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
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 67_890 }],
        }),
      );

      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings/all?marketplace=cardmarket"),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.unmapped).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Coverage: line 283 (ignored/duplicate filter), lines 419-436 ──────────
  //
  // Note: line 279 (`row.externalId === null`) is unreachable because the
  // `external_id` column in `marketplace_staging` has a NOT NULL constraint.
  // It's a defensive TypeScript guard only.

  describe("staging row filtering edge cases", () => {
    it("excludes ignored products from staging and lists them separately", async () => {
      // Ensure we have a staging row to ignore
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_001,
          groupId: 10_200,
          productName: "MKM Ignored Product",
          finish: "normal",
          recordedAt: new Date("2026-01-17T12:00:00Z"),
          marketCents: 200,
          lowCents: 100,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
        )
        .execute();

      // Insert an ignored-product record for this external_id + finish
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_001,
          finish: "normal",
          productName: "MKM Ignored Product",
        })
        .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish"]).doNothing())
        .execute();

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();

      // Should NOT appear in staged products for tcgplayer
      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      if (testGroup) {
        const allStaged = testGroup.tcgplayer.stagedProducts;
        expect(
          allStaged.find((p: { externalId: number }) => p.externalId === 99_001),
        ).toBeUndefined();
      }

      // Should NOT appear in unmatched products
      expect(
        json.unmatchedProducts.tcgplayer.find(
          (p: { externalId: number }) => p.externalId === 99_001,
        ),
      ).toBeUndefined();
    });
  });

  // ── Coverage: lines 147-154, 355-357 (manual card overrides) ──────────────

  describe("manual card overrides", () => {
    it("matches staged product via override instead of name prefix", async () => {
      // Insert a staging row that does NOT name-match any card
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_002,
          groupId: 10_200,
          productName: "ZZZ Totally Unrelated Product Name",
          finish: "normal",
          recordedAt: new Date("2026-01-18T12:00:00Z"),
          marketCents: 300,
          lowCents: 150,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
        )
        .execute();

      // Insert an override that maps this product to our test card
      await db
        .insertInto("marketplaceStagingCardOverrides")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_002,
          finish: "normal",
          cardId: cardId,
        })
        .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish"]).doNothing())
        .execute();

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();

      // The override-matched product should appear as staged under our card's tcgplayer section
      const overrideStaged = testGroup.tcgplayer.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 99_002,
      );
      expect(overrideStaged).toBeDefined();
      expect(overrideStaged.productName).toBe("ZZZ Totally Unrelated Product Name");
      expect(overrideStaged.isOverride).toBe(true);

      // It should NOT appear in unmatchedProducts
      const unmatched = json.unmatchedProducts.tcgplayer.find(
        (p: { externalId: number }) => p.externalId === 99_002,
      );
      expect(unmatched).toBeUndefined();
    });
  });

  // ── Coverage: lines 177-189 (containment matching second pass) ────────────

  describe("containment matching", () => {
    it("matches staged product via containment when prefix fails", async () => {
      // "Annie, Fiery" is a seeded OGS card. The normalized name is long
      // enough (>= 5 chars). Insert a staging product whose name doesn't
      // start with "Annie, Fiery" but contains it.
      await db
        .insertInto("marketplaceStaging")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_003,
          groupId: 10_200,
          productName: "Champion Annie, Fiery Special",
          finish: "normal",
          recordedAt: new Date("2026-01-19T12:00:00Z"),
          marketCents: 400,
          lowCents: 200,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
        )
        .execute();

      const res = await app.fetch(req("GET", "/admin/marketplace-mappings?all=true"));
      expect(res.status).toBe(200);

      const json = await res.json();

      // Find the group for "Annie, Fiery"
      const annieGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "Annie, Fiery",
      );
      expect(annieGroup).toBeDefined();

      // The containment-matched product should be staged under Annie's tcgplayer section
      const containmentStaged = annieGroup.tcgplayer.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 99_003,
      );
      expect(containmentStaged).toBeDefined();
      expect(containmentStaged.productName).toBe("Champion Annie, Fiery Special");

      // Should NOT appear in unmatchedProducts
      const unmatched = json.unmatchedProducts.tcgplayer.find(
        (p: { externalId: number }) => p.externalId === 99_003,
      );
      expect(unmatched).toBeUndefined();
    });
  });

  // ── Coverage: saveMappings early return when no staging data ───────────────

  describe("saveMappings edge cases", () => {
    it("returns saved: 0 when mapping references non-existent staging data", async () => {
      // Use a valid printing but an externalId with no matching staging row
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 999_999 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });
  });
});
