import { beforeEach, describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { createRecordingDb } from "../test/recording-db.js";
import { statusRepo } from "./status.js";

const captured = createRecordingDb();

function statements(): string[] {
  return captured.statements.map((s) => s.sql.replaceAll(/\s+/gu, " "));
}

describe("statusRepo.getPricingStats", () => {
  beforeEach(() => {
    captured.reset();
  });

  it("counts prices in a query that never joins the variants table", async () => {
    await statusRepo(captured.db).getPricingStats();

    const [products, prices] = statements();
    expect(products).toContain('from "marketplace_products"');
    expect(products).toContain('join "marketplace_product_variants"');
    expect(products).not.toContain("marketplace_product_prices");
    expect(prices).toContain('from "marketplace_product_prices"');
    expect(prices).not.toContain("marketplace_product_variants");
  });

  it("counts every price row, not the distinct products behind them", async () => {
    await statusRepo(captured.db).getPricingStats();

    const [, prices] = statements();
    expect(prices).toContain("cast(count(*) as integer)");
    expect(prices).toContain('cast(max("pp"."recorded_at") as text)');
  });

  it("counts each product and variant once even when a product has many variants", async () => {
    await statusRepo(captured.db).getPricingStats();

    const [products] = statements();
    expect(products).toContain('cast(count(distinct "mp"."id") as integer)');
    expect(products).toContain('cast(count(distinct "mpv"."id") as integer)');
  });

  it("pairs each marketplace's product counts with its own price aggregate", async () => {
    const db = createMockDb([
      {
        marketplace: "cardmarket",
        products: 12,
        variants: 30,
        prices: 7,
        latestPrice: "2026-08-15 00:00:00+00",
      },
    ]);

    const stats = await statusRepo(db).getPricingStats();

    expect(stats).toEqual({
      totalPrices: 7,
      sources: [
        {
          marketplace: "cardmarket",
          products: 12,
          variants: 30,
          prices: 7,
          latestPrice: "2026-08-15 00:00:00+00",
        },
      ],
    });
  });

  it("returns an empty result when no marketplace has products", async () => {
    const stats = await statusRepo(createMockDb([])).getPricingStats();

    expect(stats).toEqual({ totalPrices: 0, sources: [] });
  });
});
