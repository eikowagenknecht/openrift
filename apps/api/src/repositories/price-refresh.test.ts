import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { priceRefreshRepo } from "./price-refresh.js";

describe("priceRefreshRepo", () => {
  it("allSets returns sets", async () => {
    const db = createMockDb([{ id: "s-1", name: "Proving Grounds" }]);
    expect(await priceRefreshRepo(db).allSets()).toHaveLength(1);
  });

  it("allCards returns cards", async () => {
    const db = createMockDb([{ id: "c-1", name: "Annie" }]);
    expect(await priceRefreshRepo(db).allCards()).toHaveLength(1);
  });

  it("allPrintingsForPriceMatch returns printings", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await priceRefreshRepo(db).allPrintingsForPriceMatch()).toHaveLength(1);
  });

  it("loadIgnoredKeys returns LoadedIgnoredKeys with productIds and variantKeys", async () => {
    // The mock proxy returns the same execute result for both the product and
    // variant queries. A row with externalId + finish + language satisfies both
    // (extra fields are ignored for the product query).
    const db = createMockDb([{ externalId: 123, finish: "normal", language: "EN" }]);
    const result = await priceRefreshRepo(db).loadIgnoredKeys("tcgplayer");
    expect(result.productIds).toBeInstanceOf(Set);
    expect(result.variantKeys).toBeInstanceOf(Set);
    expect(result.productIds.has(123)).toBe(true);
    expect(result.variantKeys.has("123::normal::EN")).toBe(true);
  });

  it("loadIgnoredKeys returns empty sets when no ignored rows", async () => {
    const db = createMockDb([]);
    const result = await priceRefreshRepo(db).loadIgnoredKeys("tcgplayer");
    expect(result.productIds.size).toBe(0);
    expect(result.variantKeys.size).toBe(0);
  });

  it("upsertGroups upserts marketplace groups", async () => {
    const db = createMockDb([]);
    await expect(
      priceRefreshRepo(db).upsertGroups("tcgplayer", [{ groupId: 1, name: "Group" }]),
    ).resolves.toBeUndefined();
  });

  it("upsertGroups is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(priceRefreshRepo(db).upsertGroups("tcgplayer", [])).resolves.toBeUndefined();
  });

  it("upsertProductsForMarketplace returns product IDs per SKU", async () => {
    const db = createMockDb([{ id: "mp-1", externalId: 123, finish: "normal", language: "EN" }]);
    const result = await priceRefreshRepo(db).upsertProductsForMarketplace("tcgplayer", [
      {
        externalId: 123,
        finish: "normal",
        language: "EN",
        groupId: 1,
        productName: "Card",
      },
    ]);
    expect(result).toEqual([{ id: "mp-1", externalId: 123, finish: "normal", language: "EN" }]);
  });

  it("upsertProductsForMarketplace is a no-op for empty input", async () => {
    const db = createMockDb([]);
    expect(await priceRefreshRepo(db).upsertProductsForMarketplace("tcgplayer", [])).toEqual([]);
  });

  it("countProductPrices returns count", async () => {
    const db = createMockDb([{ count: 42 }]);
    expect(await priceRefreshRepo(db).countProductPrices("tcgplayer")).toBe(42);
  });

  it("upsertProductPrices returns affected count", async () => {
    const db = createMockDb([{ _: 1 }]);
    expect(
      await priceRefreshRepo(db).upsertProductPrices([
        {
          marketplaceProductId: "mp-1",
          recordedAt: new Date(),
          marketCents: 1500,
          lowCents: null,
          zeroLowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
    ).toBe(1);
  });

  it("existingSourcesByMarketplaces returns sources with finish + language", async () => {
    const db = createMockDb([
      {
        marketplace: "tcgplayer",
        externalId: 123,
        printingId: "p-1",
        finish: "normal",
        language: "EN",
        groupId: 1,
        productName: "Card",
      },
    ]);
    expect(await priceRefreshRepo(db).existingSourcesByMarketplaces(["tcgplayer"])).toHaveLength(1);
  });

  it("batchInsertProductVariants inserts products + variants", async () => {
    const db = createMockDb([
      { id: "mp-1", marketplace: "tcgplayer", externalId: 123, finish: "normal", language: null },
    ]);
    await expect(
      priceRefreshRepo(db).batchInsertProductVariants([
        {
          marketplace: "tcgplayer",
          externalId: 123,
          groupId: 1,
          productName: "Card",
          printingId: "p-1",
          finish: "normal",
          language: null,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it("batchInsertProductVariants is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(priceRefreshRepo(db).batchInsertProductVariants([])).resolves.toBeUndefined();
  });
});
