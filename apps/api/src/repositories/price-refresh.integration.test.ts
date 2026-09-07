import type { Marketplace } from "@openrift/shared";
import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { priceRefreshRepo } from "./price-refresh.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("priceRefreshRepo (integration)", () => {
  const { db } = ctx!;
  const repo = priceRefreshRepo(db);
  const seedPrintingId = PRINTING_1.id;
  const secondPrintingId = PRINTING_2.id;

  // Real marketplace names: a CHECK constraint rejects made-up ones. The
  // marketplaces are shared with the seed, so isolation comes from this
  // file's groupId/externalId ranges, never the marketplace alone.
  const firstMarketplace = "tcgplayer" as const;
  const secondMarketplace = "cardmarket" as const;
  const marketplaces: Marketplace[] = [firstMarketplace, secondMarketplace];
  const groupIds = [9001, 9002, 9003];
  const firstExternalId = 80_001;
  const sharedExternalId = 80_002;
  const externalIds = [firstExternalId, sharedExternalId];

  afterAll(async () => {
    // Variants don't cascade from the product delete, so they go first.
    await db
      .deleteFrom("marketplaceProductVariants")
      .where("marketplaceProductId", "in", (eb) =>
        eb
          .selectFrom("marketplaceProducts")
          .select("id")
          .where("marketplace", "in", marketplaces)
          .where("externalId", "in", externalIds),
      )
      .execute();
    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "in", marketplaces)
      .where("externalId", "in", externalIds)
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "in", marketplaces)
      .where("groupId", "in", groupIds)
      .execute();
  });

  it("upsertGroups creates new marketplace groups", async () => {
    await repo.upsertGroups(firstMarketplace, [
      { groupId: 9001, name: "Test Group A" },
      { groupId: 9002, name: "Test Group B", abbreviation: "TGB" },
    ]);

    const groups = await db
      .selectFrom("marketplaceGroups")
      .selectAll()
      .where("marketplace", "=", firstMarketplace)
      .where("groupId", "in", [9001, 9002])
      .execute();
    expect(groups.length).toBe(2);
  });

  it("upsertGroups with empty array is a no-op", async () => {
    await repo.upsertGroups(firstMarketplace, []);
  });

  it("upsertGroups preserves existing name on conflict", async () => {
    await repo.upsertGroups(firstMarketplace, [{ groupId: 9001 }]);
    const group = await db
      .selectFrom("marketplaceGroups")
      .selectAll()
      .where("marketplace", "=", firstMarketplace)
      .where("groupId", "=", 9001)
      .executeTakeFirst();
    expect(group!.name).toBe("Test Group A");
  });

  it("batchInsertProductVariants inserts marketplace products + variants", async () => {
    await repo.batchInsertProductVariants([
      {
        marketplace: firstMarketplace,
        externalId: firstExternalId,
        groupId: 9001,
        productName: "Test Product",
        printingId: seedPrintingId,
        finish: "normal",
        language: "EN",
      },
    ]);

    const products = await db
      .selectFrom("marketplaceProducts")
      .selectAll()
      .where("marketplace", "=", firstMarketplace)
      .where("externalId", "=", firstExternalId)
      .execute();
    expect(products.length).toBe(1);
    expect(products[0].productName).toBe("Test Product");
    expect(products[0].finish).toBe("normal");
    expect(products[0].language).toBe("EN");

    const variants = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .selectAll("mpv")
      .where("mp.marketplace", "=", firstMarketplace)
      .where("mp.externalId", "=", firstExternalId)
      .execute();
    expect(variants.length).toBe(1);
  });

  it("batchInsertProductVariants with empty array is a no-op", async () => {
    await repo.batchInsertProductVariants([]);
  });

  it("batchInsertProductVariants keeps two marketplaces that share an external id apart", async () => {
    await repo.upsertGroups(secondMarketplace, [
      { groupId: 9003, name: "Second Marketplace Group" },
    ]);

    await repo.batchInsertProductVariants([
      {
        marketplace: firstMarketplace,
        externalId: sharedExternalId,
        groupId: 9001,
        productName: "Shared Id, First Marketplace",
        printingId: seedPrintingId,
        finish: "normal",
        language: null,
      },
      {
        marketplace: secondMarketplace,
        externalId: sharedExternalId,
        groupId: 9003,
        productName: "Shared Id, Second Marketplace",
        printingId: secondPrintingId,
        finish: "normal",
        language: null,
      },
    ]);

    const rows = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select(["mp.marketplace", "mpv.printingId"])
      .where("mp.marketplace", "in", marketplaces)
      .where("mp.externalId", "=", sharedExternalId)
      .execute();

    expect(
      rows.map((r) => [r.marketplace, r.printingId]).toSorted((a, b) => a[0].localeCompare(b[0])),
    ).toEqual([
      [secondMarketplace, secondPrintingId],
      [firstMarketplace, seedPrintingId],
    ]);
  });

  it("existingSourcesByMarketplaces returns variants for given marketplaces", async () => {
    const result = await repo.existingSourcesByMarketplaces([firstMarketplace]);
    // The whole marketplace is shared with the seed and other files — scope
    // to this file's externalIds before asserting.
    const mine = result.filter((r) => externalIds.includes(r.externalId));
    expect(mine.length).toBeGreaterThanOrEqual(1);
    for (const row of mine) {
      expect(row.marketplace).toBe(firstMarketplace);
    }
    const firstProduct = mine.find((r) => r.externalId === firstExternalId);
    expect(firstProduct).toBeDefined();
    expect(firstProduct!.finish).toBeTypeOf("string");
    expect(firstProduct!.language).toBeTypeOf("string");
  });
});
