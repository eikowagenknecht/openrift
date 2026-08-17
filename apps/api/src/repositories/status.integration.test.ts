import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { statusRepo } from "./status.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("statusRepo (integration)", () => {
  const { db } = ctx!;
  const repo = statusRepo(db);
  const marketplace = "test-mp-status";
  const groupId = 91_001;
  const externalId = 87_001;

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceProductPrices")
      .where(
        "marketplaceProductId",
        "in",
        db.selectFrom("marketplaceProducts").select("id").where("marketplace", "=", marketplace),
      )
      .execute();
    await db
      .deleteFrom("marketplaceProductVariants")
      .where(
        "marketplaceProductId",
        "in",
        db.selectFrom("marketplaceProducts").select("id").where("marketplace", "=", marketplace),
      )
      .execute();
    await db.deleteFrom("marketplaceProducts").where("marketplace", "=", marketplace).execute();
    await db.deleteFrom("marketplaceGroups").where("marketplace", "=", marketplace).execute();
  });

  it("counts price rows once per (product, recorded_at), not once per variant", async () => {
    // Regression: variants and prices both hang off a product. Counting them
    // in one join multiplied each product's price rows by its variant count —
    // on the dev database cardmarket reported 519354 rows against 270817 real
    // ones. Two variants and three price rows must stay 2 and 3, not 2 and 6.
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "Status Test Group" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const product = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace,
        externalId,
        groupId,
        productName: "Status Test Product",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: product.id, printingId: PRINTING_1.id },
        { marketplaceProductId: product.id, printingId: PRINTING_2.id },
      ])
      .execute();

    await db
      .insertInto("marketplaceProductPrices")
      .values([
        { marketplaceProductId: product.id, recordedAt: new Date("2026-01-01T00:00:00Z") },
        { marketplaceProductId: product.id, recordedAt: new Date("2026-01-02T00:00:00Z") },
        { marketplaceProductId: product.id, recordedAt: new Date("2026-01-03T00:00:00Z") },
      ])
      .execute();

    const stats = await repo.getPricingStats();
    const source = stats.sources.find((s) => s.marketplace === marketplace);

    expect(source).toBeDefined();
    expect(source!.products).toBe(1);
    expect(source!.variants).toBe(2);
    expect(source!.prices).toBe(3);
    expect(source!.latestPrice).toContain("2026-01-03");
  });

  it("reports zero prices for a marketplace whose products have no price rows", async () => {
    const priceless = 87_002;
    // `marketplace_products` FKs (marketplace, group_id) into
    // `marketplace_groups`, so the group has to exist under this marketplace.
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace: `${marketplace}-empty`, groupId, name: "Empty Group" })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();
    await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: `${marketplace}-empty`,
        externalId: priceless,
        groupId,
        productName: "Priceless Product",
        finish: "normal",
        language: null,
      })
      .execute();

    const stats = await repo.getPricingStats();
    const source = stats.sources.find((s) => s.marketplace === `${marketplace}-empty`);

    expect(source).toEqual({
      marketplace: `${marketplace}-empty`,
      products: 1,
      variants: 0,
      prices: 0,
      latestPrice: null,
    });

    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "=", `${marketplace}-empty`)
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "=", `${marketplace}-empty`)
      .execute();
  });

  it("totals the per-marketplace price counts", async () => {
    const stats = await repo.getPricingStats();
    expect(stats.totalPrices).toBe(stats.sources.reduce((sum, s) => sum + s.prices, 0));
  });
});
