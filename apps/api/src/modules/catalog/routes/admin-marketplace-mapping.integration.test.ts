import { describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  refreshCardAggregates,
  syncCardCardTypes,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// The integration database is shared across files, so entities created here use
// the MKM- prefix and a groupId range distinct from the other test files.

const USER_ID = "a0000000-0013-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

let setId: string;
let cardId: string;
let printingId: string;

if (ctx) {
  const { db } = ctx;

  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "MKM-TEST", name: "MKM Test Set", printedTotal: 2, sortOrder: 100 })
    .returning("id")
    .execute();
  setId = setRow!.id;

  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "MKM-001",
      name: "MKM Test Card",
      type: "unit",
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow!.id;
  await syncCardCardTypes(db);

  await db.insertInto("cardDomains").values({ cardId, domainSlug: "mind", ordinal: 0 }).execute();

  const [printingRow] = await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "MKM-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "MKM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printingId = printingRow!.id;

  await db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode: "MKM-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "foil",
      artist: "Test Artist",
      publicCode: "MKM",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();

  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "tcgplayer", groupId: 10_200, name: "MKM TCG Group" })
    .execute();

  await db
    .insertInto("marketplaceGroups")
    .values({ marketplace: "cardmarket", groupId: 10_201, name: "MKM CM Group" })
    .execute();

  // The "staged" TCGPlayer product the admin will map.
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

describe.skipIf(!ctx)("Marketplace mapping routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  describe("GET /admin/marketplace-mappings (TCGPlayer data)", () => {
    it("returns overview with groups and staged products", async () => {
      const res = await app.fetch(adminReq("GET", "/marketplace-mappings"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.groups).toEqual(expect.any(Array));
      expect(json.groups.length).toBeGreaterThanOrEqual(1);
      expect(json.unmatchedProducts).toBeDefined();
      expect(json.allCards).toEqual(expect.any(Array));

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

  describe("POST /admin/marketplace-mappings?marketplace=tcgplayer", () => {
    it("returns saved: 0 for empty mappings array", async () => {
      const res = await app.fetch(
        adminReq("POST", "/marketplace-mappings?marketplace=tcgplayer", { mappings: [] }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.saved).toBe(0);
    });

    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        adminReq("POST", "/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 12_345, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.saved).toBe(1);
    });

    it("after mapping, the variant binding exists and the product row is preserved", async () => {
      // saveMappings doesn't delete or rewrite anything in the products table —
      // it only inserts a `marketplace_product_variants` row. The
      // unmatched-products feed filters bound products via NOT EXISTS(mpv), so
      // the product disappears from the staged panel but the row itself (and
      // its price history) remains untouched.
      const variantRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mpv.id as variantId", "mp.externalId as externalId", "mp.id as productId"])
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(variantRow).toBeDefined();
      expect(variantRow?.externalId).toBe(12_345);

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
      const res = await app.fetch(adminReq("GET", "/marketplace-mappings"));
      const json = await readJson(res);

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

  describe("DELETE /admin/marketplace-mappings?marketplace=tcgplayer", () => {
    it("unmaps a single printing, deletes the variant, keeps the product and its price history", async () => {
      const res = await app.fetch(
        adminReq(
          "DELETE",
          `/marketplace-mappings?marketplace=tcgplayer&printingId=${printingId}&externalId=12345&finish=normal`,
        ),
      );
      expect(res.status).toBe(204);

      const variantRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .selectAll("mpv")
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(variantRow).toBeUndefined();

      // Unmap leaves the product row and its price history in place, so it
      // reappears in the unmatched panel without any rehydrate step.
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

  describe("POST /admin/marketplace-mappings?marketplace=cardmarket", () => {
    it("maps a staged product to a printing", async () => {
      const res = await app.fetch(
        adminReq("POST", "/marketplace-mappings?marketplace=cardmarket", {
          mappings: [{ printingId, externalId: 67_890, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.saved).toBe(1);

      const sourceRow = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mpv.id as variantId", "mp.externalId as externalId"])
        .where("mp.marketplace", "=", "cardmarket")
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
      expect(sourceRow).toBeDefined();
      expect(sourceRow?.externalId).toBe(67_890);

      // The product row stays in place after mapping: the unmatched-products
      // feed hides it via NOT EXISTS, but the underlying row is untouched.
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
        adminReq("POST", "/marketplace-mappings?marketplace=cardmarket", { mappings: [] }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.saved).toBe(0);
    });
  });

  describe("DELETE /admin/marketplace-mappings?marketplace=cardmarket", () => {
    it("unmaps a single printing", async () => {
      const res = await app.fetch(
        adminReq(
          "DELETE",
          `/marketplace-mappings?marketplace=cardmarket&printingId=${printingId}&externalId=67890&finish=normal`,
        ),
      );
      expect(res.status).toBe(204);
    });

    it("only removes the specified product when two are mapped to the same printing", async () => {
      // CardTrader is the realistic case: TCG/CM enforce one product per
      // printing by SKU, but CardTrader doesn't, so an admin can legitimately
      // end up with two product IDs bound to the same printing.
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

      const mapRes = await app.fetch(
        adminReq("POST", "/marketplace-mappings?marketplace=cardtrader", {
          mappings: [
            { printingId, externalId: 55_555, finish: "normal", language: "EN" },
            { printingId, externalId: 66_666, finish: "normal", language: "EN" },
          ],
        }),
      );
      expect(mapRes.status).toBe(200);

      const before = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(["mp.externalId as externalId"])
        .where("mp.marketplace", "=", "cardtrader")
        .where("mpv.printingId", "=", printingId)
        .execute();
      expect(before.map((row) => row.externalId).toSorted()).toEqual([55_555, 66_666]);

      // Without the externalId filter the lookup is ambiguous and could
      // non-deterministically delete the wrong variant.
      const unmapRes = await app.fetch(
        adminReq(
          "DELETE",
          `/marketplace-mappings?marketplace=cardtrader&printingId=${printingId}&externalId=55555&finish=normal&language=EN`,
        ),
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

  describe("staging row filtering edge cases", () => {
    it("excludes ignored products from staging and lists them separately", async () => {
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

      // Whole-product ignore, keyed on external_id.
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values({
          marketplace: "tcgplayer",
          externalId: 99_001,
          productName: "MKM Ignored Product",
        })
        .onConflict((oc) => oc.columns(["marketplace", "externalId"]).doNothing())
        .execute();

      const res = await app.fetch(adminReq("GET", "/marketplace-mappings"));
      expect(res.status).toBe(200);

      const json = await readJson(res);

      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      if (testGroup) {
        const allStaged = testGroup.tcgplayer.stagedProducts;
        expect(
          allStaged.find((p: { externalId: number }) => p.externalId === 99_001),
        ).toBeUndefined();
      }

      expect(
        json.unmatchedProducts.tcgplayer.find(
          (p: { externalId: number }) => p.externalId === 99_001,
        ),
      ).toBeUndefined();
    });
  });

  describe("manual card overrides", () => {
    it("matches staged product via override instead of name prefix", async () => {
      // A product whose name does NOT match any card by prefix or containment —
      // only the override should pull it into our test card's group.
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

      await db
        .insertInto("marketplaceProductCardOverrides")
        .values({
          marketplaceProductId: overrideProductRow.id,
          cardId,
        })
        .onConflict((oc) => oc.column("marketplaceProductId").doNothing())
        .execute();

      const res = await app.fetch(adminReq("GET", "/marketplace-mappings"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      const testGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "MKM Test Card",
      );
      expect(testGroup).toBeDefined();

      const overrideStaged = testGroup.tcgplayer.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 99_002,
      );
      expect(overrideStaged).toBeDefined();
      expect(overrideStaged.productName).toBe("ZZZ Totally Unrelated Product Name");
      expect(overrideStaged.isOverride).toBe(true);

      const unmatched = json.unmatchedProducts.tcgplayer.find(
        (p: { externalId: number }) => p.externalId === 99_002,
      );
      expect(unmatched).toBeUndefined();
    });
  });

  describe("containment matching", () => {
    it("matches staged product via containment when prefix fails", async () => {
      // "Annie, Fiery" is a seeded OGS card. The normalized name is long
      // enough (>= 5 chars). Insert an unbound marketplace product whose
      // name doesn't start with "Annie, Fiery" but contains it.
      //
      // Annie has cardmarket + cardtrader variants from the seed but no
      // tcgplayer variant — so without inserting one, her card group falls out
      // of `matchedCards` for the tcgplayer side of the unified response (the
      // "no variants in any marketplace" inclusion path doesn't apply when
      // other-marketplace variants exist). Add a tcgplayer variant so the
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

      const res = await app.fetch(adminReq("GET", "/marketplace-mappings"));
      expect(res.status).toBe(200);

      const json = await readJson(res);

      const annieGroup = json.groups.find(
        (g: { cardName: string }) => g.cardName === "Annie, Fiery",
      );
      expect(annieGroup).toBeDefined();

      const containmentStaged = annieGroup.tcgplayer.stagedProducts.find(
        (p: { externalId: number }) => p.externalId === 99_003,
      );
      expect(containmentStaged).toBeDefined();
      expect(containmentStaged.productName).toBe("Champion Annie, Fiery Special");

      const unmatched = json.unmatchedProducts.tcgplayer.find(
        (p: { externalId: number }) => p.externalId === 99_003,
      );
      expect(unmatched).toBeUndefined();
    });
  });

  describe("saveMappings edge cases", () => {
    it("returns saved: 0 when mapping references a non-existent product", async () => {
      const res = await app.fetch(
        adminReq("POST", "/marketplace-mappings?marketplace=tcgplayer", {
          mappings: [{ printingId, externalId: 999_999, finish: "normal", language: null }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.saved).toBe(0);
    });
  });
});
