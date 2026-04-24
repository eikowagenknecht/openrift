import { afterAll, describe, expect, it } from "vitest";

import { PRINTINGS } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { marketplaceMappingRepo } from "./marketplace-mapping.js";

const ctx = createDbContext("a0000000-0044-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceMappingRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceMappingRepo(db);
  const marketplace = "test-mp-mapping";
  const externalId = 872_479;
  const groupId = 90_001;

  const enPrintingId = PRINTINGS["SFD-R01:common:normal::EN"].id;
  const zhPrintingId = PRINTINGS["SFD-R01:common:normal::ZH"].id;

  afterAll(async () => {
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

  it("upsertProductVariants allows one product to map to multiple printings (language-aggregate CM)", async () => {
    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "Test CM Group" })
      .execute();

    // First assignment: product → EN printing, language = NULL (CM aggregate).
    const first = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: enPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(first).toHaveLength(1);
    expect(first[0].printingId).toBe(enPrintingId);

    // Second assignment: same product → ZH printing, same finish/language.
    // Before migration 102 this would replace the EN row via the unique
    // conflict on (product_id, finish, language). With the new index
    // including printing_id, both rows coexist.
    const second = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: zhPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(second).toHaveLength(1);
    expect(second[0].printingId).toBe(zhPrintingId);

    const rows = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select(["mpv.printingId"])
      .where("mp.marketplace", "=", marketplace)
      .where("mp.externalId", "=", externalId)
      .execute();

    const printingIds = rows.map((r) => r.printingId).toSorted();
    expect(printingIds).toEqual([enPrintingId, zhPrintingId].toSorted());
  });

  it("upsertProductVariants is idempotent for the same (product, finish, language, printing)", async () => {
    // Re-upsert the EN row from the previous test — must not create a duplicate.
    const again = await repo.upsertProductVariants([
      {
        marketplace,
        printingId: enPrintingId,
        externalId,
        groupId,
        productName: "Test Product",
        finish: "normal",
        language: null,
      },
    ]);
    expect(again).toHaveLength(1);
    expect(again[0].printingId).toBe(enPrintingId);

    const enRows = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select(["mpv.id"])
      .where("mp.marketplace", "=", marketplace)
      .where("mp.externalId", "=", externalId)
      .where("mpv.printingId", "=", enPrintingId)
      .execute();

    expect(enRows).toHaveLength(1);
  });
});
