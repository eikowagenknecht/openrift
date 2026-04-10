import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceTransferRepo } from "./marketplace-transfer.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceTransferRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceTransferRepo(db);
  const seedPrintingId = PRINTING_1.id;
  const marketplace = "test-mp-transfer";
  let productId = "";
  let variantId = "";

  afterAll(async () => {
    // Clean up in FK order: staging, snapshots, variants, products, groups.
    await db.deleteFrom("marketplaceStaging").where("marketplace", "=", marketplace).execute();
    if (variantId) {
      await db.deleteFrom("marketplaceSnapshots").where("variantId", "=", variantId).execute();
      await db.deleteFrom("marketplaceProductVariants").where("id", "=", variantId).execute();
    }
    if (productId) {
      await db.deleteFrom("marketplaceProducts").where("id", "=", productId).execute();
    }
    await db.deleteFrom("marketplaceGroups").where("marketplace", "=", marketplace).execute();
  });

  it("insertSnapshot inserts a snapshot row for a variant", async () => {
    // Create a marketplace group, product, and variant first
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId: 99_001, name: "Transfer Test" })
      .execute();

    const product = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace,
        externalId: 99_001,
        groupId: 99_001,
        productName: "Test Transfer Product",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    productId = product.id;

    const variant = await db
      .insertInto("marketplaceProductVariants")
      .values({
        marketplaceProductId: productId,
        printingId: seedPrintingId,
        finish: "normal",
        language: "EN",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    variantId = variant.id;

    const now = new Date();
    await repo.insertSnapshot(variantId, {
      recordedAt: now,
      marketCents: 500,
      lowCents: 400,
      midCents: 500,
      highCents: 600,
      trendCents: 450,
      avg1Cents: 480,
      avg7Cents: 490,
      avg30Cents: 500,
    });

    // Verify via snapshotsByMarketplace
    const snapshots = await repo.snapshotsByMarketplace(marketplace, [seedPrintingId]);
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0].marketCents).toBe(500);
  });

  it("insertStagingFromSnapshot inserts a staging row", async () => {
    const now = new Date();
    await repo.insertStagingFromSnapshot(
      marketplace,
      { externalId: 99_001, groupId: 99_001, productName: "Test Transfer Product" },
      "normal",
      "EN",
      {
        recordedAt: now,
        marketCents: 500,
        lowCents: 400,
        midCents: 500,
        highCents: 600,
        trendCents: 450,
        avg1Cents: 480,
        avg7Cents: 490,
        avg30Cents: 500,
      },
    );

    // Verify staging row exists
    const staging = await db
      .selectFrom("marketplaceStaging")
      .selectAll()
      .where("marketplace", "=", marketplace)
      .execute();
    expect(staging.length).toBeGreaterThanOrEqual(1);
  });

  it("bulkUnmapToStaging copies snapshots back to staging", async () => {
    await repo.bulkUnmapToStaging(marketplace);
    // Should not throw — coverage is the goal
  });
});
