import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTINGS } from "../../../test/fixtures/constants.js";
import { createDbContext } from "../../../test/integration-context.js";
import { cardmarketStockRepo } from "./cardmarket-stock.js";

const ctx = createDbContext("a0000000-0031-4000-a000-000000000001");

describe.skipIf(!ctx)("cardmarketStockRepo (integration)", () => {
  const { db } = ctx!;
  const repo = cardmarketStockRepo(db);

  // This file's own 914_xxx externalId range keys every assertion and the cleanup.
  const groupId = 80_201;
  const mappedExternalId = 914_101;
  const unmappedExternalId = 914_102;
  const tcgExternalId = 914_103;

  const runeEnPrintingId = PRINTINGS["OGN-007:common:normal::EN"].id;
  const runeScPrintingId = PRINTINGS["OGN-007:common:normal::SC"].id;

  const createdProductIds: string[] = [];

  beforeAll(async () => {
    await db
      .insertInto("marketplaceGroups")
      .values([
        { marketplace: "cardmarket", groupId, name: "CM Stock Test", abbreviation: null },
        { marketplace: "tcgplayer", groupId, name: "TCG Stock Test", abbreviation: null },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const [mapped] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: "cardmarket",
        groupId,
        externalId: mappedExternalId,
        productName: "Fury Rune (Test CM)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();
    createdProductIds.push(mapped!.id);

    // One Cardmarket product covering two languages of the same card.
    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: mapped!.id, printingId: runeEnPrintingId },
        { marketplaceProductId: mapped!.id, printingId: runeScPrintingId },
      ])
      .execute();

    const [unmapped] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: "cardmarket",
        groupId,
        externalId: unmappedExternalId,
        productName: "Unmapped Rune (Test CM)",
        finish: "foil",
        language: null,
      })
      .returning("id")
      .execute();
    createdProductIds.push(unmapped!.id);

    const [tcg] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: "tcgplayer",
        groupId,
        externalId: tcgExternalId,
        productName: "Fury Rune (Test TCG)",
        finish: "normal",
        language: null,
      })
      .returning("id")
      .execute();
    createdProductIds.push(tcg!.id);

    await db
      .insertInto("marketplaceProductVariants")
      .values({ marketplaceProductId: tcg!.id, printingId: runeEnPrintingId })
      .execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceProductVariants")
      .where("marketplaceProductId", "in", createdProductIds)
      .execute();
    await db.deleteFrom("marketplaceProducts").where("id", "in", createdProductIds).execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("groupId", "=", groupId)
      .where("marketplace", "in", ["cardmarket", "tcgplayer"])
      .execute();
  });

  it("returns every printing behind a language-aggregate product", async () => {
    const rows = await repo.productPrintings([mappedExternalId]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.externalId === mappedExternalId)).toBe(true);
    expect(rows.every((row) => row.productName === "Fury Rune (Test CM)")).toBe(true);
    expect(new Set(rows.map((row) => row.language))).toEqual(new Set(["EN", "SC"]));
    expect(new Set(rows.map((row) => row.printingId))).toEqual(
      new Set([runeEnPrintingId, runeScPrintingId]),
    );
  });

  it("returns a mapped-nothing row for a product with no variants", async () => {
    const rows = await repo.productPrintings([unmappedExternalId]);

    expect(rows).toEqual([
      {
        externalId: unmappedExternalId,
        finish: "foil",
        productName: "Unmapped Rune (Test CM)",
        printingId: null,
        language: null,
      },
    ]);
  });

  it("ignores products from other marketplaces sharing an external id", async () => {
    const rows = await repo.productPrintings([tcgExternalId]);

    expect(rows).toEqual([]);
  });

  it("returns nothing for an unknown product and for an empty request", async () => {
    expect(await repo.productPrintings([914_999])).toEqual([]);
    expect(await repo.productPrintings([])).toEqual([]);
  });
});
