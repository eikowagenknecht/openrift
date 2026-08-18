import { beforeEach, describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { createRecordingDb } from "../test/recording-db.js";
import { marketplaceMappingRepo } from "./marketplace-mapping.js";

describe("marketplaceMappingRepo", () => {
  it("ignoredProducts returns L2 ignores for a marketplace", async () => {
    const rows = [{ externalId: 1, productName: "Card", createdAt: new Date() }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).ignoredProducts("tcgplayer")).toEqual(rows);
  });

  it("ignoredVariants returns L3 ignores for a marketplace", async () => {
    const rows = [
      {
        externalId: 1,
        finish: "normal",
        language: "EN",
        productName: "Card",
        createdAt: new Date(),
      },
    ];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).ignoredVariants("tcgplayer")).toEqual(rows);
  });

  it("allStaging returns all staging rows for a marketplace", async () => {
    const rows = [{ id: "s1", marketplace: "tcgplayer", recordedAt: new Date() }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).allStaging("tcgplayer")).toEqual(rows);
  });

  it("groupNames returns group display names", async () => {
    const rows = [{ gid: 1, name: "Alpha" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).groupNames("tcgplayer")).toEqual(rows);
  });

  it("allCardsWithPrintings returns cards with joins", async () => {
    const rows = [{ cardId: "c1", printingId: "p1", setId: "s1" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).allCardsWithPrintings("tcgplayer")).toEqual(rows);
  });

  it("stagingCardOverrides returns overrides for a marketplace", async () => {
    const rows = [{ externalId: 1, finish: "normal", language: "EN", cardId: "c1" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).stagingCardOverrides("tcgplayer")).toEqual(rows);
  });

  it("printingFinishesAndLanguages returns finishes and languages by IDs", async () => {
    const rows = [{ id: "p1", finish: "normal", language: "EN" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).printingFinishesAndLanguages(["p1"])).toEqual(rows);
  });

  it("upsertProductVariants returns empty array for empty input", async () => {
    const db = createMockDb([]);
    expect(await marketplaceMappingRepo(db).upsertProductVariants([])).toEqual([]);
  });

  it("upsertProductVariants batch-upserts product + variant rows", async () => {
    // The mock proxy returns the same rows from every call, so we structure the
    // return value to satisfy both the product upsert (needs id, marketplace,
    // externalId, finish, language) and the variant insert (needs id,
    // marketplaceProductId, printingId).
    const db = createMockDb([
      {
        id: "mp-1",
        marketplaceProductId: "mp-1",
        marketplace: "tcgplayer",
        externalId: 100,
        finish: "normal",
        language: "EN",
        printingId: "p1",
      },
    ]);
    const values = [
      {
        marketplace: "tcgplayer" as const,
        printingId: "p1",
        externalId: 100,
        groupId: 1,
        productName: "Card",
        finish: "normal",
        language: "EN",
      },
    ];
    const result = await marketplaceMappingRepo(db).upsertProductVariants(values);
    expect(result).toHaveLength(1);
    expect(result[0].printingId).toBe("p1");
    expect(result[0].finish).toBe("normal");
    expect(result[0].language).toBe("EN");
  });

  it("getVariantForPrinting returns the variant for a printing", async () => {
    const row = {
      variantId: "var-1",
      marketplaceProductId: "mp-1",
      finish: "normal",
      language: "EN",
      externalId: 100,
      groupId: 1,
      productName: "Card",
      marketplace: "tcgplayer",
    };
    const db = createMockDb([row]);
    expect(
      await marketplaceMappingRepo(db).getVariantForPrinting(
        "tcgplayer",
        "p1",
        100,
        "normal",
        "EN",
      ),
    ).toEqual(row);
  });

  it("getVariantForPrinting returns undefined when not found", async () => {
    const db = createMockDb([]);
    expect(
      await marketplaceMappingRepo(db).getVariantForPrinting(
        "tcgplayer",
        "p-missing",
        100,
        "normal",
        "EN",
      ),
    ).toBeUndefined();
  });

  it("getVariantForPrinting accepts null language for marketplaces without language SKUs", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).getVariantForPrinting("tcgplayer", "p1", 100, "normal", null),
    ).resolves.toBeUndefined();
  });

  it("getPrintingFinishAndLanguage returns finish and language by printingId", async () => {
    const row = { finish: "foil", language: "EN" };
    const db = createMockDb([row]);
    expect(await marketplaceMappingRepo(db).getPrintingFinishAndLanguage("p1")).toEqual(row);
  });

  it("deleteVariantById deletes a variant (parent product left behind)", async () => {
    const db = createMockDb([]);
    await expect(marketplaceMappingRepo(db).deleteVariantById("var-1")).resolves.toBeUndefined();
  });

  it("allStaging carries a NULL language through, the normal case for CM/TCG", async () => {
    const rows = [
      {
        marketplace: "cardmarket",
        externalId: 42,
        groupId: 7,
        productName: "Card",
        finish: "normal",
        language: null,
        recordedAt: new Date("2026-08-15T00:00:00Z"),
      },
    ];
    const db = createMockDb(rows);
    const [row] = await marketplaceMappingRepo(db).allStaging("cardmarket");
    expect(row.language).toBeNull();
  });
});

describe("marketplaceMappingRepo (generated SQL)", () => {
  const captured = createRecordingDb();

  beforeEach(() => {
    captured.reset();
  });

  it("allStaging picks the newest price per product through a lateral, not a full join", async () => {
    // Joining the whole price history and reducing with DISTINCT ON made the
    // cost grow with retained history. The lateral reads one row per product
    // straight off the (marketplace_product_id, recorded_at) primary key.
    await marketplaceMappingRepo(captured.db).allStaging("cardmarket");

    const [{ sql, parameters }] = captured.statements;
    const flat = sql.replaceAll(/\s+/gu, " ");
    expect(flat).toContain('inner join lateral (select "p"."recorded_at"');
    expect(flat).toContain('order by "p"."recorded_at" desc limit $1) as "latest" on true');
    expect(flat).toContain(
      'and not exists (select "mpv"."id" from "marketplace_product_variants" as "mpv"' +
        ' where "mpv"."marketplace_product_id" = "mp"."id")',
    );
    expect(parameters).toEqual([1, "cardmarket"]);
  });

  it("upsertProductVariants updates on conflict so RETURNING covers existing products", async () => {
    // The SKU unique is NULLS NOT DISTINCT, so a NULL language collapses onto
    // the existing row rather than inserting a second one. `doNothing` would
    // leave that row out of RETURNING and the variant would have no id to bind.
    captured.setRows([
      {
        id: "mp-1",
        marketplace: "cardmarket",
        externalId: 42,
        finish: "normal",
        language: null,
        marketplaceProductId: "mp-1",
        printingId: "pr-1",
      },
    ]);

    await marketplaceMappingRepo(captured.db).upsertProductVariants([
      {
        marketplace: "cardmarket",
        printingId: "pr-1",
        externalId: 42,
        groupId: 7,
        productName: "Card",
        finish: "normal",
        language: null,
      },
    ]);

    const [products] = captured.statements;
    expect(products.sql).toContain(
      'on conflict ("marketplace", "external_id", "finish", "language") do update set',
    );
    expect(products.sql).toContain(
      'returning "id", "marketplace", "external_id", "finish", "language"',
    );
    expect(products.parameters).toEqual(["cardmarket", 42, 7, "Card", "normal", null]);
  });
});
