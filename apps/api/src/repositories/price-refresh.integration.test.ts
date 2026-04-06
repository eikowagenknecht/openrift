import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { priceRefreshRepo } from "./price-refresh.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("priceRefreshRepo (integration)", () => {
  const { db } = ctx!;
  const repo = priceRefreshRepo(db);
  const seedPrintingId = PRINTING_1.id;

  afterAll(async () => {
    // Clean up test marketplace data
    await db
      .deleteFrom("marketplaceProducts")
      .where("marketplace", "=", "test-marketplace-pr")
      .execute();
    await db
      .deleteFrom("marketplaceGroups")
      .where("marketplace", "=", "test-marketplace-pr")
      .execute();
  });

  it("upsertGroups creates new marketplace groups", async () => {
    await repo.upsertGroups("test-marketplace-pr", [
      { groupId: 9001, name: "Test Group A" },
      { groupId: 9002, name: "Test Group B", abbreviation: "TGB" },
    ]);

    const groups = await db
      .selectFrom("marketplaceGroups")
      .selectAll()
      .where("marketplace", "=", "test-marketplace-pr")
      .execute();
    expect(groups.length).toBe(2);
  });

  it("upsertGroups with empty array is a no-op", async () => {
    await repo.upsertGroups("test-marketplace-pr", []);
  });

  it("upsertGroups preserves existing name on conflict", async () => {
    await repo.upsertGroups("test-marketplace-pr", [{ groupId: 9001 }]);
    const group = await db
      .selectFrom("marketplaceGroups")
      .selectAll()
      .where("marketplace", "=", "test-marketplace-pr")
      .where("groupId", "=", 9001)
      .executeTakeFirst();
    expect(group!.name).toBe("Test Group A");
  });

  it("batchInsertProducts inserts marketplace products", async () => {
    await repo.batchInsertProducts([
      {
        marketplace: "test-marketplace-pr",
        externalId: 80_001,
        groupId: 9001,
        productName: "Test Product",
        printingId: seedPrintingId,
      },
    ]);

    const products = await db
      .selectFrom("marketplaceProducts")
      .selectAll()
      .where("marketplace", "=", "test-marketplace-pr")
      .execute();
    expect(products.length).toBe(1);
    expect(products[0].productName).toBe("Test Product");
  });

  it("batchInsertProducts with empty array is a no-op", async () => {
    await repo.batchInsertProducts([]);
  });

  it("existingSourcesByMarketplaces returns products for given marketplaces", async () => {
    const result = await repo.existingSourcesByMarketplaces(["test-marketplace-pr"]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].marketplace).toBe("test-marketplace-pr");
  });

  it("existingExternalIdsByMarketplace returns external IDs", async () => {
    const ids = await repo.existingExternalIdsByMarketplace("test-marketplace-pr");
    expect(ids).toContain(80_001);
  });

  it("existingExternalIdsByMarketplace returns empty for unknown marketplace", async () => {
    const ids = await repo.existingExternalIdsByMarketplace("nonexistent-mp");
    expect(ids).toEqual([]);
  });
});
