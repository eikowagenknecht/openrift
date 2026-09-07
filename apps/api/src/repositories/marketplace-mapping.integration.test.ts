import { afterAll, describe, expect, it } from "vitest";

import { PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceMappingRepo } from "./marketplace-mapping.js";

const ctx = createDbContext("a0000000-0044-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceMappingRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceMappingRepo(db);
  // The marketplace vocabulary is a closed CHECK; other test files also use
  // "cardtrader", so isolation comes from this file's own id ranges below.
  const marketplace = "cardtrader" as const;
  const externalId = 872_479;
  const groupId = 90_001;
  const fileExternalIds = [872_479, 872_480, 872_481, 872_482, 872_490, 872_491];

  const enPrintingId = PRINTINGS["SFD-R01:common:normal::EN"].id;
  const scPrintingId = PRINTINGS["SFD-R01:common:normal::SC"].id;

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceProductVariants")
      .where(
        "marketplaceProductId",
        "in",
        db
          .selectFrom("marketplaceProducts")
          .select("id")
          .where("marketplace", "=", marketplace)
          .where("externalId", "in", fileExternalIds),
      )
      .execute();
    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "=", marketplace)
      .where("externalId", "in", fileExternalIds)
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "=", marketplace)
      .where("groupId", "=", groupId)
      .execute();
  });

  it("upsertProductVariants allows one product to map to multiple printings (language-aggregate CM)", async () => {
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "Test CM Group" })
      .execute();

    const first = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: enPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(first).toHaveLength(1);
    expect(first[0]!.printingId).toBe(enPrintingId);

    const second = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: scPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(second).toHaveLength(1);
    expect(second[0]!.printingId).toBe(scPrintingId);

    const rows = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select(["mpv.printingId"])
      .where("mp.marketplace", "=", marketplace)
      .where("mp.externalId", "=", externalId)
      .execute();

    const printingIds = rows.map((r) => r.printingId).toSorted();
    expect(printingIds).toEqual([enPrintingId, scPrintingId].toSorted());
  });

  it("upsertProductVariants accepts one batch with multiple sibling-printing variants for the same SKU", async () => {
    // Without the product-row dedupe, this multi-row INSERT (same SKU tuple,
    // differing printing_id) hits "ON CONFLICT DO UPDATE ... row a second time".
    const batchExternalId = 872_480;
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "Test CM Group" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();
    const result = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: enPrintingId,
        externalId: batchExternalId,
        groupId,
        productName: "Batch Sibling Product",
        finish: "normal",
        language: null,
      },
      {
        marketplace,
        printingId: scPrintingId,
        externalId: batchExternalId,
        groupId,
        productName: "Batch Sibling Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.printingId).toSorted()).toEqual(
      [enPrintingId, scPrintingId].toSorted(),
    );
    expect(new Set(result.map((r) => r.variantId)).size).toBe(2);
  });

  it("upsertProductVariants is idempotent for the same (product, finish, language, printing)", async () => {
    const again = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: enPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(again).toHaveLength(1);
    expect(again[0]!.printingId).toBe(enPrintingId);

    const enRows = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select(["mpv.id"])
      .where("mp.marketplace", "=", marketplace)
      .where("mp.externalId", "=", externalId)
      .where("mpv.printingId", "=", enPrintingId)
      .execute();

    expect(enRows).toHaveLength(1);
  });

  describe("pricesByMarketplace", () => {
    // Own externalIds so these never collide with the upsert tests above on
    // the `(marketplace, external_id, finish, language)` SKU key. The shared
    // afterAll deletes the products, and prices cascade from there.
    const historyExternalId = 872_480;
    const twoFinishExternalId = 872_481;
    const pricelessExternalId = 872_482;

    async function insertProduct(opts: {
      externalId: number;
      finish: string;
      printingId: string;
    }): Promise<string> {
      const product = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace,
          externalId: opts.externalId,
          groupId,
          productName: "Priced Product",
          finish: opts.finish,
          language: "EN",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("marketplaceProductVariants")
        .values({ marketplaceProductId: product.id, printingId: opts.printingId })
        .execute();
      return product.id;
    }

    async function insertPrice(productId: string, recordedAt: Date, marketCents: number) {
      await db
        .insertInto("marketplaceProductPrices")
        .values({ marketplaceProductId: productId, recordedAt, marketCents })
        .execute();
    }

    it("returns only the newest price row per product, not the whole history", async () => {
      const productId = await insertProduct({
        externalId: historyExternalId,
        finish: "normal",
        printingId: enPrintingId,
      });
      await insertPrice(productId, new Date("2026-01-02T00:00:00Z"), 200);
      await insertPrice(productId, new Date("2026-01-03T00:00:00Z"), 300);
      await insertPrice(productId, new Date("2026-01-01T00:00:00Z"), 100);

      const rows = await repo.pricesByMarketplace(marketplace, [enPrintingId]);
      const mine = rows.filter((r) => r.externalId === historyExternalId);

      expect(mine).toHaveLength(1);
      expect(mine[0]!.marketCents).toBe(300);
      expect(mine[0]!.recordedAt).toEqual(new Date("2026-01-03T00:00:00Z"));
    });

    it("keeps each finish's own price when two SKUs share an externalId on one printing", async () => {
      const normalId = await insertProduct({
        externalId: twoFinishExternalId,
        finish: "normal",
        printingId: scPrintingId,
      });
      const foilId = await insertProduct({
        externalId: twoFinishExternalId,
        finish: "foil",
        printingId: scPrintingId,
      });
      // The foil row is the newer of the two. Collapsing the SKU tuple would
      // let it overwrite the normal finish's price.
      await insertPrice(normalId, new Date("2026-01-01T00:00:00Z"), 500);
      await insertPrice(foilId, new Date("2026-02-01T00:00:00Z"), 900);

      const rows = await repo.pricesByMarketplace(marketplace, [scPrintingId]);
      const mine = rows.filter((r) => r.externalId === twoFinishExternalId);

      expect(mine).toHaveLength(2);
      expect(mine.map((r) => [r.finish, r.marketCents])).toEqual([
        ["foil", 900],
        ["normal", 500],
      ]);
    });

    it("omits products that have no price rows at all", async () => {
      await insertProduct({
        externalId: pricelessExternalId,
        finish: "normal",
        printingId: enPrintingId,
      });

      const rows = await repo.pricesByMarketplace(marketplace, [enPrintingId]);

      expect(rows.some((r) => r.externalId === pricelessExternalId)).toBe(false);
    });

    it("short-circuits to an empty result for an empty printing list", async () => {
      expect(await repo.pricesByMarketplace(marketplace, [])).toEqual([]);
    });
  });

  describe("allStaging", () => {
    const unboundExternalId = 872_490;
    const boundExternalId = 872_491;

    it("returns unbound SKUs with their newest price, and a NULL language as null", async () => {
      // Cardmarket and TCGplayer don't split SKUs by language, so NULL is the
      // normal value here — the row type has to admit it.
      const unbound = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace,
          externalId: unboundExternalId,
          groupId,
          productName: "Unbound Product",
          finish: "normal",
          language: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await db
        .insertInto("marketplaceProductPrices")
        .values([
          {
            marketplaceProductId: unbound.id,
            recordedAt: new Date("2026-03-01T00:00:00Z"),
            marketCents: 100,
          },
          {
            marketplaceProductId: unbound.id,
            recordedAt: new Date("2026-03-02T00:00:00Z"),
            marketCents: 250,
          },
        ])
        .execute();

      const rows = await repo.allStaging(marketplace);
      const mine = rows.filter((r) => r.externalId === unboundExternalId);

      expect(mine).toHaveLength(1);
      expect(mine[0]!.language).toBeNull();
      expect(mine[0]!.marketCents).toBe(250);
      expect(mine[0]!.recordedAt).toEqual(new Date("2026-03-02T00:00:00Z"));
    });

    it("excludes SKUs that already have a variant binding", async () => {
      const bound = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace,
          externalId: boundExternalId,
          groupId,
          productName: "Bound Product",
          finish: "normal",
          language: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("marketplaceProductPrices")
        .values({
          marketplaceProductId: bound.id,
          recordedAt: new Date("2026-03-01T00:00:00Z"),
          marketCents: 100,
        })
        .execute();
      await db
        .insertInto("marketplaceProductVariants")
        .values({ marketplaceProductId: bound.id, printingId: enPrintingId })
        .execute();

      const rows = await repo.allStaging(marketplace);

      expect(rows.some((r) => r.externalId === boundExternalId)).toBe(false);
    });
  });

  describe("variantsForCard", () => {
    it("returns one row per (printing, variant) for the card", async () => {
      const printing = await db
        .selectFrom("printings")
        .select(["id", "cardId", "language"])
        .where("id", "=", enPrintingId)
        .executeTakeFirstOrThrow();

      const rows = await repo.variantsForCard(printing.cardId);
      // Seeded fixtures may also bind this card's printings for the same
      // marketplace, so scope down to this file's externalIds.
      const mine = rows.filter(
        (r) => r.marketplace === marketplace && fileExternalIds.includes(r.externalId),
      );

      expect(mine.length).toBeGreaterThanOrEqual(1);
      for (const row of mine) {
        expect(row.targetPrintingId).toBe(row.ownerPrintingId);
      }
      const own = mine.filter((r) => r.targetPrintingId === enPrintingId);
      expect(own.length).toBeGreaterThanOrEqual(1);
      expect(own[0]!.ownerLanguage).toBe(printing.language);
    });
  });
});
