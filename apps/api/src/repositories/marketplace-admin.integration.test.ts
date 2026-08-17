import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceAdminRepo } from "./marketplace-admin.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceAdminRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceAdminRepo(db);
  const marketplace = "test-mp-admin";

  const groupId = 92_001;

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceIgnoredProducts")
      .where("marketplace", "=", marketplace)
      .execute();
    await db
      .deleteFrom("marketplaceProductCardOverrides")
      .where(
        "marketplaceProductId",
        "in",
        db.selectFrom("marketplaceProducts").select("id").where("marketplace", "=", marketplace),
      )
      .execute();
    await db
      .deleteFrom("marketplaceIgnoredVariants")
      .where(
        "marketplaceProductId",
        "in",
        db.selectFrom("marketplaceProducts").select("id").where("marketplace", "=", marketplace),
      )
      .execute();
    await db.deleteFrom("marketplaceProducts").where("marketplace", "=", marketplace).execute();
    await db.deleteFrom("marketplaceGroups").where("marketplace", "=", marketplace).execute();
  });

  it("stagingCountsByMarketplaceGroup with marketplace filter", async () => {
    const result = await repo.stagingCountsByMarketplaceGroup(marketplace);
    expect(Array.isArray(result)).toBe(true);
  });

  it("assignedCountsByMarketplaceGroup with marketplace filter", async () => {
    const result = await repo.assignedCountsByMarketplaceGroup(marketplace);
    expect(Array.isArray(result)).toBe(true);
  });

  it("insertIgnoredProducts inserts and deleteIgnoredProducts removes", async () => {
    await repo.insertIgnoredProducts([
      {
        marketplace,
        externalId: 88_001,
        productName: "Test Ignored",
      },
      {
        marketplace,
        externalId: 88_002,
        productName: "Test Ignored 2",
      },
    ]);

    const list = await repo.listIgnoredProducts();
    const ours = list.filter((p) => p.marketplace === marketplace);
    expect(ours.length).toBe(2);

    const count = await repo.deleteIgnoredProducts(marketplace, [88_001]);
    expect(count).toBe(1);

    const after = await repo.listIgnoredProducts();
    const remaining = after.filter((p) => p.marketplace === marketplace);
    expect(remaining.length).toBe(1);
  });

  it("deleteIgnoredProducts bulk deletes", async () => {
    const count = await repo.deleteIgnoredProducts(marketplace, [88_002]);
    expect(count).toBe(1);
  });

  it("deleteIgnoredProducts with empty array returns 0", async () => {
    const count = await repo.deleteIgnoredProducts(marketplace, []);
    expect(count).toBe(0);
  });

  describe("NULL language SKUs", () => {
    // Cardmarket and TCGplayer don't expose language as a SKU axis, so their
    // `marketplace_products.language` is NULL. Every lookup on the SKU tuple
    // has to compare it with IS NOT DISTINCT FROM — `=` against NULL is never
    // true, so an equality comparison deletes nothing for those marketplaces.
    const nullLangExternalId = 88_101;
    const enLangExternalId = 88_102;

    it("deleteIgnoredVariants removes an ignore whose product has a NULL language", async () => {
      await db
        .insertInto("marketplaceGroups")
        .values({ marketplace, groupId, name: "Admin Test Group" })
        .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
        .execute();

      await repo.insertIgnoredVariants([
        {
          marketplace,
          externalId: nullLangExternalId,
          finish: "normal",
          language: null,
          productName: "Null Language SKU",
          groupId,
        },
        {
          marketplace,
          externalId: enLangExternalId,
          finish: "normal",
          language: "EN",
          productName: "EN Language SKU",
          groupId,
        },
      ]);

      const deleted = await repo.deleteIgnoredVariants(marketplace, [
        { externalId: nullLangExternalId, finish: "normal", language: null },
      ]);
      expect(deleted).toBe(1);

      const remaining = await repo.listIgnoredProducts();
      const ours = remaining.filter(
        (row) => row.level === "variant" && row.marketplace === marketplace,
      );
      expect(ours.map((row) => row.externalId)).toEqual([enLangExternalId]);
    });

    it("deleteIgnoredVariants leaves a NULL-language SKU alone when asked for 'EN'", async () => {
      await repo.insertIgnoredVariants([
        {
          marketplace,
          externalId: nullLangExternalId,
          finish: "normal",
          language: null,
          productName: "Null Language SKU",
          groupId,
        },
      ]);

      const deleted = await repo.deleteIgnoredVariants(marketplace, [
        { externalId: nullLangExternalId, finish: "normal", language: "EN" },
      ]);
      expect(deleted).toBe(0);

      const cleanup = await repo.deleteIgnoredVariants(marketplace, [
        { externalId: nullLangExternalId, finish: "normal", language: null },
        { externalId: enLangExternalId, finish: "normal", language: "EN" },
      ]);
      expect(cleanup).toBe(2);
    });

    it("upsert then deleteStagingCardOverride round-trips a NULL-language SKU", async () => {
      const product = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace,
          externalId: 88_103,
          groupId,
          productName: "Override Target",
          finish: "normal",
          language: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const card = await db
        .selectFrom("printings")
        .select("cardId")
        .limit(1)
        .executeTakeFirstOrThrow();

      await repo.upsertStagingCardOverride({
        marketplace,
        externalId: 88_103,
        finish: "normal",
        language: null,
        cardId: card.cardId,
      });

      const before = await db
        .selectFrom("marketplaceProductCardOverrides")
        .select("cardId")
        .where("marketplaceProductId", "=", product.id)
        .execute();
      expect(before).toHaveLength(1);

      await repo.deleteStagingCardOverride(marketplace, 88_103, "normal", null);

      const after = await db
        .selectFrom("marketplaceProductCardOverrides")
        .select("cardId")
        .where("marketplaceProductId", "=", product.id)
        .execute();
      expect(after).toHaveLength(0);
    });
  });

  it("clearPriceData reports the rows it deleted per table", async () => {
    // Its own marketplace: clearPriceData wipes everything under the name it
    // is given, so sharing one with the tests above would make the counts
    // depend on their leftovers.
    const clearMarketplace = `${marketplace}-clear`;
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace: clearMarketplace, groupId, name: "Clearable Group" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const product = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: clearMarketplace,
        externalId: 88_201,
        groupId,
        productName: "Clearable Product",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("marketplaceProductVariants")
      .values({ marketplaceProductId: product.id, printingId: PRINTING_1.id })
      .execute();
    await db
      .insertInto("marketplaceProductPrices")
      .values([
        { marketplaceProductId: product.id, recordedAt: new Date("2026-01-01T00:00:00Z") },
        { marketplaceProductId: product.id, recordedAt: new Date("2026-01-02T00:00:00Z") },
      ])
      .execute();

    // Two price rows against one variant — the counts are per table, so the
    // variant must not multiply the price figure.
    const counts = await repo.clearPriceData(clearMarketplace);
    expect(counts).toEqual({ prices: 2, variants: 1, products: 1 });

    await db.deleteFrom("marketplaceGroups").where("marketplace", "=", clearMarketplace).execute();
  });
});
