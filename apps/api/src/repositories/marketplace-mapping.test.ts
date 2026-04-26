import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
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
    // return value to satisfy both the product upsert (raw SQL: needs id,
    // marketplace, externalId, finish, language) and the variant insert (Kysely
    // RETURNING: needs id, marketplaceProductId, printingId).
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
        marketplace: "tcgplayer",
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
    expect(await marketplaceMappingRepo(db).getVariantForPrinting("tcgplayer", "p1", 100)).toEqual(
      row,
    );
  });

  it("getVariantForPrinting returns undefined when not found", async () => {
    const db = createMockDb([]);
    expect(
      await marketplaceMappingRepo(db).getVariantForPrinting("tcgplayer", "p-missing", 100),
    ).toBeUndefined();
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

  it("countMappedVariants returns count", async () => {
    const db = createMockDb([{ count: 42 }]);
    expect(await marketplaceMappingRepo(db).countMappedVariants("tcgplayer")).toBe(42);
  });

  it("deleteMappedVariants deletes all mapped variants (parent products left behind)", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).deleteMappedVariants("tcgplayer"),
    ).resolves.toBeUndefined();
  });
});
