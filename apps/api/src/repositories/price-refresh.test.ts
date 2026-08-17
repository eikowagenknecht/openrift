import { beforeEach, describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { createRecordingDb, onlyStatement } from "../test/recording-db.js";
import { priceRefreshRepo } from "./price-refresh.js";

describe("priceRefreshRepo", () => {
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

describe("priceRefreshRepo (generated SQL)", () => {
  const captured = createRecordingDb();

  beforeEach(() => {
    captured.reset();
  });

  it("batchInsertProductVariants keeps two marketplaces sharing an external id apart", async () => {
    // Regression: the product lookup was keyed on (externalId, finish,
    // language) alone while the inputs and the re-select both span
    // marketplaces. Two marketplaces handing out the same external id
    // collapsed onto one key, and every variant bound to whichever product
    // happened to land in the map last.
    captured.setRows([
      { id: "p-tcg", marketplace: "tcgplayer", externalId: 42, finish: "normal", language: null },
      { id: "p-cm", marketplace: "cardmarket", externalId: 42, finish: "normal", language: null },
    ]);

    await priceRefreshRepo(captured.db).batchInsertProductVariants([
      {
        marketplace: "tcgplayer",
        externalId: 42,
        groupId: 7,
        productName: "Card",
        printingId: "pr-tcg",
        finish: "normal",
        language: null,
      },
      {
        marketplace: "cardmarket",
        externalId: 42,
        groupId: 7,
        productName: "Card",
        printingId: "pr-cm",
        finish: "normal",
        language: null,
      },
    ]);

    const variantInsert = captured.statements.at(-1)!;
    expect(variantInsert.sql).toContain('insert into "marketplace_product_variants"');
    expect(variantInsert.parameters).toEqual(["p-tcg", "pr-tcg", "p-cm", "pr-cm"]);
  });

  it("batchInsertProductVariants throws when a marketplace's product is missing", async () => {
    // Only the tcgplayer product comes back, so the cardmarket input has no
    // id to bind to. Before the key carried the marketplace this silently
    // bound to the wrong product instead of failing.
    captured.setRows([
      { id: "p-tcg", marketplace: "tcgplayer", externalId: 42, finish: "normal", language: null },
    ]);

    await expect(
      priceRefreshRepo(captured.db).batchInsertProductVariants([
        {
          marketplace: "cardmarket",
          externalId: 42,
          groupId: 7,
          productName: "Card",
          printingId: "pr-cm",
          finish: "normal",
          language: null,
        },
      ]),
    ).rejects.toThrow("missing product id for cardmarket 42 normal/NULL");
  });

  it("upsertProductsForMarketplace updates on conflict so RETURNING covers existing rows", async () => {
    // `doNothing` would drop conflicting rows from RETURNING, and the caller
    // needs an id for every input SKU — on any refresh past the first, most
    // of them already exist.
    await priceRefreshRepo(captured.db).upsertProductsForMarketplace("cardmarket", [
      { externalId: 42, finish: "normal", language: null, groupId: 7, productName: "Card" },
    ]);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain(
      'on conflict ("marketplace", "external_id", "finish", "language") do update set',
    );
    expect(sql).toContain('"group_id" = "excluded"."group_id"');
    expect(sql).toContain('"product_name" = "excluded"."product_name"');
    expect(sql).toContain('returning "id", "external_id", "finish", "language"');
    // A NULL language is bound as NULL, so the NULLS NOT DISTINCT unique
    // (`marketplace_products_sku_key`) collapses it onto the existing row.
    expect(parameters).toEqual(["cardmarket", 42, 7, "Card", "normal", null]);
  });
});
