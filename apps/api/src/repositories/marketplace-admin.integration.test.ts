import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { marketplaceAdminRepo } from "./marketplace-admin.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceAdminRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceAdminRepo(db);
  const marketplace = "test-mp-admin";

  afterAll(async () => {
    await db
      .deleteFrom("marketplaceIgnoredProducts")
      .where("marketplace", "=", marketplace)
      .execute();
    await db.deleteFrom("marketplaceGroups").where("marketplace", "=", marketplace).execute();
  });

  it("stagingCountsByMarketplaceGroup with marketplace filter", async () => {
    const result = await repo.stagingCountsByMarketplaceGroup(marketplace);
    expect(Array.isArray(result)).toBe(true);
  });

  it("assignedCountsByMarketplaceGroup with marketplace filter", async () => {
    const result = await repo.assignedCountsByMarketplaceGroup(marketplace);
    expect(Array.isArray(result)).toBe(true);
  });

  it("insertIgnoredProducts inserts and deleteIgnoredProducts removes", async () => {
    await repo.insertIgnoredProducts([
      {
        marketplace,
        externalId: 88_001,
        finish: "normal",
        language: "",
        productName: "Test Ignored",
      },
      {
        marketplace,
        externalId: 88_002,
        finish: "foil",
        language: "",
        productName: "Test Ignored 2",
      },
    ]);

    const list = await repo.listIgnoredProducts();
    const ours = list.filter((p) => p.marketplace === marketplace);
    expect(ours.length).toBe(2);

    const count = await repo.deleteIgnoredProducts(marketplace, [
      { externalId: 88_001, finish: "normal", language: "" },
    ]);
    expect(count).toBe(1);

    const after = await repo.listIgnoredProducts();
    const remaining = after.filter((p) => p.marketplace === marketplace);
    expect(remaining.length).toBe(1);
  });

  it("deleteIgnoredProducts bulk deletes", async () => {
    const count = await repo.deleteIgnoredProducts(marketplace, [
      { externalId: 88_002, finish: "foil", language: "" },
    ]);
    expect(count).toBe(1);
  });

  it("deleteIgnoredProducts with empty array returns 0", async () => {
    const count = await repo.deleteIgnoredProducts(marketplace, []);
    expect(count).toBe(0);
  });
});
