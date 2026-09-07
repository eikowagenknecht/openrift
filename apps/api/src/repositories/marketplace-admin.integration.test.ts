import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceAdminRepo } from "./marketplace-admin.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceAdminRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceAdminRepo(db);
  // The marketplace vocabulary is a closed CHECK; other test files also use
  // "cardmarket", so isolation comes from this file's own id ranges below.
  const marketplace = "cardmarket" as const;

  const groupId = 92_001;
  const fileExternalIds = [88_001, 88_002, 88_101, 88_102, 88_103, 88_201];

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceIgnoredProducts")
      .where("marketplace", "=", marketplace)
      .where("externalId", "in", fileExternalIds)
      .execute();
    const ownProductIds = db
      .selectFrom("marketplaceProducts")
      .select("id")
      .where("marketplace", "=", marketplace)
      .where("externalId", "in", fileExternalIds);
    await db
      .deleteFrom("marketplaceProductCardOverrides")
      .where("marketplaceProductId", "in", ownProductIds)
      .execute();
    await db
      .deleteFrom("marketplaceIgnoredVariants")
      .where("marketplaceProductId", "in", ownProductIds)
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

    // The listing spans the whole marketplace, so scope down to this file's
    // externalIds before counting.
    const list = await repo.listIgnoredProducts();
    const ours = list.filter(
      (p) => p.marketplace === marketplace && [88_001, 88_002].includes(p.externalId),
    );
    expect(ours.length).toBe(2);

    const count = await repo.deleteIgnoredProducts(marketplace, [88_001]);
    expect(count).toBe(1);

    const after = await repo.listIgnoredProducts();
    const remaining = after.filter(
      (p) => p.marketplace === marketplace && [88_001, 88_002].includes(p.externalId),
    );
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.externalId).toBe(88_002);
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
    // Cardmarket/TCGplayer store NULL language; SKU lookups must use
    // IS NOT DISTINCT FROM since `=` never matches NULL.
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
        (row) =>
          row.level === "variant" &&
          row.marketplace === marketplace &&
          [nullLangExternalId, enLangExternalId].includes(row.externalId),
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
    // clearPriceData wipes the entire marketplace, so counts are asserted as
    // deltas over a captured baseline, which is restored afterward.
    const baseProducts = await db
      .selectFrom("marketplaceProducts")
      .selectAll()
      .where("marketplace", "=", marketplace)
      .execute();
    const baseProductIds = baseProducts.map((p) => p.id);
    const baseVariants =
      baseProductIds.length === 0
        ? []
        : await db
            .selectFrom("marketplaceProductVariants")
            .selectAll()
            .where("marketplaceProductId", "in", baseProductIds)
            .execute();
    const basePrices =
      baseProductIds.length === 0
        ? []
        : await db
            .selectFrom("marketplaceProductPrices")
            .selectAll()
            .where("marketplaceProductId", "in", baseProductIds)
            .execute();
    // These two cascade from the product delete as well — capture them so the
    // restore is complete even when a preceding test left rows behind.
    const baseOverrides =
      baseProductIds.length === 0
        ? []
        : await db
            .selectFrom("marketplaceProductCardOverrides")
            .selectAll()
            .where("marketplaceProductId", "in", baseProductIds)
            .execute();
    const baseIgnoredVariants =
      baseProductIds.length === 0
        ? []
        : await db
            .selectFrom("marketplaceIgnoredVariants")
            .selectAll()
            .where("marketplaceProductId", "in", baseProductIds)
            .execute();

    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "Clearable Group" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const product = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace,
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

    const counts = await repo.clearPriceData(marketplace);

    // Restore before asserting so a failed expectation can't leave the shared
    // DB without its marketplace rows.
    if (baseProducts.length > 0) {
      await db.insertInto("marketplaceProducts").values(baseProducts).execute();
    }
    if (baseVariants.length > 0) {
      await db.insertInto("marketplaceProductVariants").values(baseVariants).execute();
    }
    if (basePrices.length > 0) {
      await db.insertInto("marketplaceProductPrices").values(basePrices).execute();
    }
    if (baseOverrides.length > 0) {
      await db.insertInto("marketplaceProductCardOverrides").values(baseOverrides).execute();
    }
    if (baseIgnoredVariants.length > 0) {
      await db.insertInto("marketplaceIgnoredVariants").values(baseIgnoredVariants).execute();
    }

    // Counts are per table: two price rows against one variant must not
    // multiply the price figure.
    expect(counts).toEqual({
      prices: basePrices.length + 2,
      variants: baseVariants.length + 1,
      products: baseProducts.length + 1,
    });
  });
});
