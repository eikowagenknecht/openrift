import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { statusRepo } from "./status.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("statusRepo (integration)", () => {
  const { db } = ctx!;
  const repo = statusRepo(db);
  // The marketplace vocabulary is a closed CHECK (migration 247), so the
  // fixtures live under a real marketplace and isolate through this file's own
  // group/external id range; assertions compare before/after deltas instead of
  // absolute totals.
  const marketplace = "tcgplayer" as const;
  const groupId = 91_001;
  const externalId = 87_001;

  afterAll(async () => {
    // Variants don't cascade from the product delete (plain FK); prices do.
    await db
      .deleteFrom("marketplaceProductVariants")
      .where("marketplaceProductId", "in", (eb) =>
        eb
          .selectFrom("marketplaceProducts")
          .select("id")
          .where("marketplace", "=", marketplace)
          .where("groupId", "=", groupId),
      )
      .execute();
    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "=", marketplace)
      .where("groupId", "=", groupId)
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "=", marketplace)
      .where("groupId", "=", groupId)
      .execute();
  });

  /** @returns The pricing stats for this file's marketplace (zeros when absent). */
  async function marketplaceStats(): Promise<{
    products: number;
    variants: number;
    prices: number;
  }> {
    const stats = await repo.getPricingStats();
    const source = stats.sources.find((s) => s.marketplace === marketplace);
    return {
      products: source?.products ?? 0,
      variants: source?.variants ?? 0,
      prices: source?.prices ?? 0,
    };
  }

  it("counts price rows once per (product, recorded_at), not once per variant", async () => {
    // Regression: variants and prices both hang off a product. Counting them
    // in one join multiplied each product's price rows by its variant count —
    // on the dev database cardmarket reported 519354 rows against 270817 real
    // ones. Two variants and three price rows must add 2 and 3, not 2 and 6.
    const before = await marketplaceStats();

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
        { marketplaceProductId: product.id, recordedAt: new Date("2126-01-01T00:00:00Z") },
        { marketplaceProductId: product.id, recordedAt: new Date("2126-01-02T00:00:00Z") },
        { marketplaceProductId: product.id, recordedAt: new Date("2126-01-03T00:00:00Z") },
      ])
      .execute();

    const after = await marketplaceStats();
    expect(after.products - before.products).toBe(1);
    expect(after.variants - before.variants).toBe(2);
    expect(after.prices - before.prices).toBe(3);
    // The far-future recorded_at guarantees this file's newest row wins.
    const stats = await repo.getPricingStats();
    const source = stats.sources.find((s) => s.marketplace === marketplace);
    expect(source?.latestPrice).toContain("2126-01-03");
  });

  it("counts a product without price rows once, adding no prices", async () => {
    const priceless = 87_002;
    const before = await marketplaceStats();

    await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace,
        externalId: priceless,
        groupId,
        productName: "Priceless Product",
        finish: "normal",
        language: null,
      })
      .execute();

    const after = await marketplaceStats();
    expect(after.products - before.products).toBe(1);
    expect(after.variants - before.variants).toBe(0);
    expect(after.prices - before.prices).toBe(0);
  });

  it("totals the per-marketplace price counts", async () => {
    const stats = await repo.getPricingStats();
    expect(stats.totalPrices).toBe(stats.sources.reduce((sum, s) => sum + s.prices, 0));
  });
});
