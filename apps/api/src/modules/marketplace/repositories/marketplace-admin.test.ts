import { beforeEach, describe, expect, it } from "vitest";

import { createMockDb } from "../../../test/mock-db.js";
import { createRecordingDb, onlyStatement } from "../../../test/recording-db.js";
import { marketplaceAdminRepo } from "./marketplace-admin.js";

describe("marketplaceAdminRepo", () => {
  it("listAllGroups returns groups", async () => {
    const db = createMockDb([
      { marketplace: "tcgplayer", groupId: 1, name: "Group", abbreviation: "G" },
    ]);
    expect(await marketplaceAdminRepo(db).listAllGroups()).toHaveLength(1);
  });

  it("stagingCountsByMarketplaceGroup without filter", async () => {
    const db = createMockDb([{ marketplace: "tcgplayer", groupId: 1, count: 10 }]);
    expect(await marketplaceAdminRepo(db).stagingCountsByMarketplaceGroup()).toHaveLength(1);
  });

  it("stagingCountsByMarketplaceGroup with marketplace filter", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).stagingCountsByMarketplaceGroup("tcgplayer")).toEqual([]);
  });

  it("assignedCountsByMarketplaceGroup without filter", async () => {
    const db = createMockDb([{ marketplace: "tcgplayer", groupId: 1, count: 5 }]);
    expect(await marketplaceAdminRepo(db).assignedCountsByMarketplaceGroup()).toHaveLength(1);
  });

  it("assignedCountsByMarketplaceGroup with marketplace filter", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).assignedCountsByMarketplaceGroup("tcgplayer")).toEqual(
      [],
    );
  });

  it("updateGroup returns true when name is updated", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await marketplaceAdminRepo(db).updateGroup("tcgplayer", 1, { name: "New Name" })).toBe(
      true,
    );
  });

  it("updateGroup returns true when groupKind is updated", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(
      await marketplaceAdminRepo(db).updateGroup("tcgplayer", 1, { groupKind: "special" }),
    ).toBe(true);
  });

  it("updateGroup returns true when setId is assigned", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(
      await marketplaceAdminRepo(db).updateGroup("tcgplayer", 1, {
        setId: "019cfc3b-0389-744b-837c-792fd586300e",
      }),
    ).toBe(true);
  });

  it("updateGroup returns true when setId is cleared to null", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await marketplaceAdminRepo(db).updateGroup("tcgplayer", 1, { setId: null })).toBe(true);
  });

  it("updateGroup returns false when not found", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).updateGroup("tcgplayer", 999, { name: null })).toBe(
      false,
    );
  });

  it("updateGroup returns false when patch is empty", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).updateGroup("tcgplayer", 1, {})).toBe(false);
  });

  it("listIgnoredProducts returns ignored products and variants merged", async () => {
    // The proxy mock returns the same execute result for both queries (products + variants).
    // We supply one row shape that's compatible with the product path.
    const now = new Date();
    const db = createMockDb([
      { marketplace: "tcgplayer", externalId: 1, productName: "Card", createdAt: now },
    ]);
    const result = await marketplaceAdminRepo(db).listIgnoredProducts();
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.marketplace).toBe("tcgplayer");
  });

  it("getStagingProductNames returns names", async () => {
    const db = createMockDb([{ externalId: 1, productName: "Card" }]);
    expect(await marketplaceAdminRepo(db).getStagingProductNames("tcgplayer", [1])).toHaveLength(1);
  });

  it("insertIgnoredProducts inserts L2 ignores", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).insertIgnoredProducts([
        { marketplace: "tcgplayer", externalId: 1, productName: "Card" },
      ]),
    ).resolves.toBeUndefined();
  });

  it("insertIgnoredProducts is a no-op for empty input", async () => {
    const db = createMockDb([]);
    await expect(marketplaceAdminRepo(db).insertIgnoredProducts([])).resolves.toBeUndefined();
  });

  it("insertIgnoredVariants inserts L3 ignores", async () => {
    // The repo needs to look up parent products after upserting them; the mock proxy
    // will happily return whatever we provide for every query.
    const db = createMockDb([
      { id: "mp-1", marketplace: "tcgplayer", externalId: 1, finish: "normal", language: null },
    ]);
    await expect(
      marketplaceAdminRepo(db).insertIgnoredVariants([
        {
          marketplace: "tcgplayer",
          externalId: 1,
          finish: "normal",
          language: null,
          productName: "Card",
          groupId: 10,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it("insertIgnoredVariants is a no-op for empty input", async () => {
    const db = createMockDb([]);
    await expect(marketplaceAdminRepo(db).insertIgnoredVariants([])).resolves.toBeUndefined();
  });

  it("deleteIgnoredProducts returns deleted count for L2", async () => {
    const db = createMockDb([{ numDeletedRows: 2n }]);
    expect(await marketplaceAdminRepo(db).deleteIgnoredProducts("tcgplayer", [1, 2])).toBe(2);
  });

  it("deleteIgnoredProducts returns 0 for empty input", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).deleteIgnoredProducts("tcgplayer", [])).toBe(0);
  });

  it("deleteIgnoredVariants returns deleted count for L3", async () => {
    const db = createMockDb([{ numDeletedRows: 3n }]);
    expect(
      await marketplaceAdminRepo(db).deleteIgnoredVariants("tcgplayer", [
        { externalId: 1, finish: "normal", language: "EN" },
      ]),
    ).toBe(3);
  });

  it("deleteIgnoredVariants returns 0 for empty input", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).deleteIgnoredVariants("tcgplayer", [])).toBe(0);
  });

  it("upsertStagingCardOverride upserts an override (product exists)", async () => {
    // The mock proxy returns the same shape for every query; it satisfies both
    // the product-id resolve (`inserted: 1`) and the override insert.
    const db = createMockDb([{ inserted: 1 }]);
    await expect(
      marketplaceAdminRepo(db).upsertStagingCardOverride({
        marketplace: "tcgplayer",
        externalId: 1,
        finish: "normal",
        language: "EN",
        cardId: "c-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("upsertStagingCardOverride throws when the product does not exist", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).upsertStagingCardOverride({
        marketplace: "tcgplayer",
        externalId: 999,
        finish: "normal",
        language: "EN",
        cardId: "c-1",
      }),
    ).rejects.toThrow("no marketplace_products row");
  });

  it("deleteStagingCardOverride deletes an override", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).deleteStagingCardOverride("tcgplayer", 1, "normal", "EN"),
    ).resolves.toBeUndefined();
  });

  it("clearPriceData returns counts", async () => {
    const db = createMockDb([{ numDeletedRows: 5n }]);
    const result = await marketplaceAdminRepo(db).clearPriceData("tcgplayer");
    expect(result).toEqual({ prices: 5, variants: 5, products: 5 });
  });
});

describe("marketplaceAdminRepo (generated SQL)", () => {
  const captured = createRecordingDb();

  beforeEach(() => {
    captured.reset();
  });

  it("deleteIgnoredVariants matches a NULL language, which is the CM/TCG norm", async () => {
    await marketplaceAdminRepo(captured.db).deleteIgnoredVariants("cardmarket", [
      { externalId: 42, finish: "normal", language: null },
    ]);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain(
      'delete from "marketplace_ignored_variants" as "iv" using "marketplace_products" as "mp"',
    );
    // `=` against NULL is never true, so an equality comparison here would
    // silently delete nothing for cardmarket and tcgplayer.
    expect(sql).toContain('"mp"."language" is not distinct from $4');
    expect(parameters).toEqual(["cardmarket", 42, "normal", null]);
  });

  it("deleteIgnoredVariants ORs each SKU tuple, keeping finish and language paired", async () => {
    await marketplaceAdminRepo(captured.db).deleteIgnoredVariants("cardtrader", [
      { externalId: 42, finish: "normal", language: "EN" },
      { externalId: 42, finish: "foil", language: "DE" },
    ]);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain(
      'and (("mp"."external_id" = $2 and "mp"."finish" = $3 and "mp"."language" is not distinct from $4)' +
        ' or ("mp"."external_id" = $5 and "mp"."finish" = $6 and "mp"."language" is not distinct from $7))',
    );
    expect(parameters).toEqual(["cardtrader", 42, "normal", "EN", 42, "foil", "DE"]);
  });

  it("deleteStagingCardOverride matches a NULL language", async () => {
    await marketplaceAdminRepo(captured.db).deleteStagingCardOverride(
      "tcgplayer",
      42,
      "normal",
      null,
    );

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain(
      'delete from "marketplace_product_card_overrides" as "ov" using "marketplace_products" as "mp"',
    );
    expect(sql).toContain('"mp"."language" is not distinct from $4');
    expect(parameters).toEqual(["tcgplayer", 42, "normal", null]);
  });

  it("clearPriceData deletes prices, then variants, then the products themselves", async () => {
    await marketplaceAdminRepo(captured.db).clearPriceData("cardmarket");

    // Dependency order matters: prices and variants both FK to products.
    expect(captured.statements.map((s) => s.sql.replaceAll(/\s+/gu, " "))).toEqual([
      'delete from "marketplace_product_prices" as "pp" using "marketplace_products" as "mp"' +
        ' where "mp"."id" = "pp"."marketplace_product_id" and "mp"."marketplace" = $1',
      'delete from "marketplace_product_variants" as "mpv" using "marketplace_products" as "mp"' +
        ' where "mp"."id" = "mpv"."marketplace_product_id" and "mp"."marketplace" = $1',
      'delete from "marketplace_products" where "marketplace" = $1',
    ]);
  });
});
