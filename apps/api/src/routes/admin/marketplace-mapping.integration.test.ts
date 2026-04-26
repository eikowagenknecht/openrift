import { describe, expect, it } from "vitest";

import { createTestContext, refreshCardAggregates, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Marketplace mapping mutation routes
//
// Tests POST/DELETE on /admin/marketplace-mappings?marketplace=<mp>
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix MKM- for entities it creates, groupId range distinct from others.
//
// Phase-4 schema: prices live on `marketplace_product_prices` keyed by SKU;
// the legacy `marketplace_staging` and `marketplace_snapshots` are gone.
// All upstream products live in `marketplace_products` with price history in
// `marketplace_product_prices`. The "unmatched products" feed surfaces
// products with no `marketplace_product_variants` row. Card overrides key on
// `marketplace_product_id` instead of the SKU tuple.
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
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  await db.insertInto("cardDomains").values({ cardId, domainSlug: "Mind", ordinal: 0 }).execute();

  // Seed printing (normal finish)
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "MKM-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
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
      cardId,
      setId,
      shortCode: "MKM-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
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

  // ── TCGPlayer product + price (the "staged" product the admin will map) ─
  await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "tcgplayer",
      externalId: 12_345,
      groupId: 10_200,
      productName: "MKM Test Card Normal",
      finish: "normal",
      language: null,
    })
    .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing())
    .execute();

  const tcgProductRow = await db
    .selectFrom("marketplaceProducts")
    .select("id")
    .where("marketplace", "=", "tcgplayer")
    .where("externalId", "=", 12_345)
    .where("finish", "=", "normal")
    .where("language", "is", null)
    .executeTakeFirstOrThrow();

  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: tcgProductRow.id,
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
    .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
    .execute();

  // ── Cardmarket product + price ─────────────────────────────────────────
  await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "cardmarket",
      externalId: 67_890,
      groupId: 10_201,
      productName: "MKM Test Card Normal",
      finish: "normal",
      language: null,
    })
    .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing())
    .execute();

  const cmProductRow = await db
    .selectFrom("marketplaceProducts")
    .select("id")
    .where("marketplace", "=", "cardmarket")
    .where("externalId", "=", 67_890)
    .where("finish", "=", "normal")
    .where("language", "is", null)
    .executeTakeFirstOrThrow();

  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: cmProductRow.id,
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
    .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
    .execute();

  await refreshCardAggregates(db);
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
      expect(json.groups).toEqual(expect.any(Array));
      expect(json.groups.length).toBeGreaterThanOrEqual(1);
      expect(json.unmatchedProducts).toBeDefined();
      expect(json.allCards).toEqual(expect.any(Array));

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
          mappings: [{ printingId, externalId: 12_345, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(1);
    });

    it("after mapping, the variant binding exists and the product row is preserved", async () => {
      // Phase 4: saveMappings doesn't delete or rewrite anything in the
      // products table — it only inserts a `marketplace_product_variants` row.
      // The unmatched-products feed filters bound products via NOT EXISTS(mpv),
      // so the product disappears from the staged panel but the row itself
      // (and its price history) remains untouched.
      const variantRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mpv.id as variantId", "mp.externalId as externalId", "mp.id as productId"])
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(variantRow).toBeDefined();
      expect(variantRow?.externalId).toBe(12_345);

      // The marketplace_products row still exists.
      const productRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 12_345)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirst();
      expect(productRow).toBeDefined();
      expect(productRow?.id).toBe(variantRow?.productId);
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
    it("unmaps a single printing, deletes the variant, keeps the product and its price history", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          printingId,
          externalId: 12_345,
        }),
      );
      expect(res.status).toBe(204);

      // Variant should be deleted (parent product is intentionally left behind).
      const variantRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .selectAll("mpv")
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(variantRow).toBeUndefined();

      // Phase 4: unmap leaves the product row in place — no per-fetch rehydrate
      // step is needed for it to reappear in the unmatched panel. Verify the
      // product row still exists and its price history is intact.
      const productRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 12_345)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirstOrThrow();

      const priceRows = await db
        .selectFrom("marketplaceProductPrices")
        .selectAll()
        .where("marketplaceProductId", "=", productRow.id)
        .execute();
      expect(priceRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── TCGPlayer: DELETE /all (unmap all) ─────────────────────────────────────

  describe("DELETE /admin/marketplace-mappings/all?marketplace=tcgplayer", () => {
    it("unmaps all TCGPlayer mappings", async () => {
      // First map something so there's data to unmap
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 12_345, finish: "normal", language: null }],
        }),
      );

      const res = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings/all?marketplace=tcgplayer"),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.unmapped).toBeGreaterThanOrEqual(1);

      // No variant rows should exist for TCGPlayer for our printing.
      const variants = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .selectAll("mpv")
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mpv.printingId", "=", printingId)
        .execute();
      expect(variants).toHaveLength(0);
    });
  });

  // ── Cardmarket: POST (save mappings) ───────────────────────────────────────

  describe("POST /admin/marketplace-mappings?marketplace=cardmarket", () => {
    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 67_890, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(1);

      // Verify the product + variant was created (joined via the variant).
      const sourceRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mpv.id as variantId", "mp.externalId as externalId"])
        .where("mp.marketplace", "=", "cardmarket")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.externalId).toBe(67_890);

      // Phase 4: the product row stays in place after mapping. Verify it is
      // still present (the unmatched-products feed hides it via NOT EXISTS,
      // but the underlying row is untouched).
      const productRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "cardmarket")
        .where("externalId", "=", 67_890)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirst();
      expect(productRow).toBeDefined();
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
        req("DELETE", "/admin/marketplace-mappings?marketplace=cardmarket", {
          printingId,
          externalId: 67_890,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("only removes the specified product when two are mapped to the same printing", async () => {
      // Seed two CardTrader products and a CardTrader group. CardTrader is the
      // realistic case for this bug — TCG/CM enforce one product per printing
      // by SKU, but CardTrader doesn't, so an admin can legitimately end up
      // with two product IDs bound to the same printing.
      await db
        .insertInto("marketplaceGroups")
        .values({ marketplace: "cardtrader", groupId: 10_202, name: "MKM CT Group" })
        .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
        .execute();

      for (const eid of [55_555, 66_666]) {
        await db
          .insertInto("marketplaceProducts")
          .values({
            marketplace: "cardtrader",
            externalId: eid,
            groupId: 10_202,
            productName: `MKM CT Product ${eid}`,
            finish: "normal",
            language: "EN",
          })
          .onConflict((oc) =>
            oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
          )
          .execute();
      }

      // Map both products to the same printing.
      const mapRes = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardtrader", {
          mappings: [
            { printingId, externalId: 55_555, finish: "normal", language: "EN" },
            { printingId, externalId: 66_666, finish: "normal", language: "EN" },
          ],
        }),
      );
      expect(mapRes.status).toBe(200);

      // Sanity: two variants exist for this (cardtrader, printingId).
      const before = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mp.externalId as externalId"])
        .where("mp.marketplace", "=", "cardtrader")
        .where("mpv.printingId", "=", printingId)
        .execute();
      expect(before.map((row) => row.externalId).toSorted()).toEqual([55_555, 66_666]);

      // Unmap just product 55_555. Without the externalId filter the lookup
      // is ambiguous and could non-deterministically delete the wrong variant.
      const unmapRes = await app.fetch(
        req("DELETE", "/admin/marketplace-mappings?marketplace=cardtrader", {
          printingId,
          externalId: 55_555,
        }),
      );
      expect(unmapRes.status).toBe(204);

      const after = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mp.externalId as externalId"])
        .where("mp.marketplace", "=", "cardtrader")
        .where("mpv.printingId", "=", printingId)
        .execute();
      expect(after.map((row) => row.externalId)).toEqual([66_666]);
    });
  });

  // ── Cardmarket: DELETE /all (unmap all) ────────────────────────────────────

  describe("DELETE /admin/marketplace-mappings/all?marketplace=cardmarket", () => {
    it("unmaps all Cardmarket mappings", async () => {
      // Phase 4: the product row was never deleted by the previous POST, so
      // we can re-map directly without re-seeding anything.
      await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 67_890, finish: "normal", language: null }],
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

  // ── Coverage: ignored-product filter ──────────────────────────────────────

  describe("staging row filtering edge cases", () => {
    it("excludes ignored products from staging and lists them separately", async () => {
      // Seed a fresh "staged" product (marketplace_products + price) that we'll
      // then mark as ignored at the L2 level.
      await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_001,
          groupId: 10_200,
          productName: "MKM Ignored Product",
          finish: "normal",
          language: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
        )
        .execute();

      const ignoredProductRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 99_001)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirstOrThrow();

      await db
        .insertInto("marketplaceProductPrices")
        .values({
          marketplaceProductId: ignoredProductRow.id,
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
        .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
        .execute();

      // Insert an L2 ignored-product record for this external_id (whole-product ignore).
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_001,
          productName: "MKM Ignored Product",
        })
        .onConflict((oc) => oc.columns(["marketplace", "externalId"]).doNothing())
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

  // ── Coverage: manual card overrides ───────────────────────────────────────

  describe("manual card overrides", () => {
    it("matches staged product via override instead of name prefix", async () => {
      // Insert a marketplace product (with price) whose name does NOT match
      // any card by prefix or containment — only the override should pull it
      // into our test card's group.
      await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_002,
          groupId: 10_200,
          productName: "ZZZ Totally Unrelated Product Name",
          finish: "normal",
          language: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
        )
        .execute();

      const overrideProductRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 99_002)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirstOrThrow();

      await db
        .insertInto("marketplaceProductPrices")
        .values({
          marketplaceProductId: overrideProductRow.id,
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
        .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
        .execute();

      // Phase 4: the override is keyed on `marketplace_product_id` (the
      // table's PK), so we look up the product first and then pin it.
      await db
        .insertInto("marketplaceProductCardOverrides")
        .values({
          marketplaceProductId: overrideProductRow.id,
          cardId,
        })
        .onConflict((oc) => oc.column("marketplaceProductId").doNothing())
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

  // ── Coverage: containment matching second pass ────────────────────────────

  describe("containment matching", () => {
    it("matches staged product via containment when prefix fails", async () => {
      // "Annie, Fiery" is a seeded OGS card. The normalized name is long
      // enough (>= 5 chars). Insert an unbound marketplace product whose
      // name doesn't start with "Annie, Fiery" but contains it.
      //
      // Earlier tests in this file run `DELETE /admin/marketplace-mappings/all
      // ?marketplace=tcgplayer`, which removes every tcgplayer variant. Annie
      // still has cardmarket + cardtrader variants from the seed, so without a
      // tcgplayer variant her card group falls out of `matchedCards` for the
      // tcgplayer side of the unified response (the "no variants in any
      // marketplace" inclusion path doesn't apply when other-marketplace
      // variants exist). Restore one tcgplayer variant for Annie so the
      // matcher has a card group to attach the containment match to.
      const anniePrintingId = "019cfc3b-03d6-74cf-adec-1dce41f631eb";
      const annieTcgProductId = "019dc041-cda5-7eb9-bcfe-056f971e963a";
      await db
        .insertInto("marketplaceProductVariants")
        .values({ marketplaceProductId: annieTcgProductId, printingId: anniePrintingId })
        .onConflict((oc) => oc.columns(["marketplaceProductId", "printingId"]).doNothing())
        .execute();

      await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_003,
          groupId: 10_200,
          productName: "Champion Annie, Fiery Special",
          finish: "normal",
          language: null,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
        )
        .execute();

      const containmentProductRow = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 99_003)
        .where("finish", "=", "normal")
        .where("language", "is", null)
        .executeTakeFirstOrThrow();

      await db
        .insertInto("marketplaceProductPrices")
        .values({
          marketplaceProductId: containmentProductRow.id,
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
        .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
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

  // ── Coverage: saveMappings with no matching product ───────────────────────

  describe("saveMappings edge cases", () => {
    it("returns saved: 0 when mapping references a non-existent product", async () => {
      // Phase 4: saveMappings looks up the SKU in `marketplace_products`
      // (not staging). An external ID with no matching product row produces
      // a `skipped` entry and `saved: 0`.
      const res = await app.fetch(
        req("POST", "/admin/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 999_999, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.saved).toBe(0);
    });
  });
});
