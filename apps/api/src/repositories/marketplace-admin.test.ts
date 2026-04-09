import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
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

  it("updateGroupName returns true when updated", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await marketplaceAdminRepo(db).updateGroupName("tcgplayer", 1, "New Name")).toBe(true);
  });

  it("updateGroupName returns false when not found", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).updateGroupName("tcgplayer", 999, null)).toBe(false);
  });

  it("listIgnoredProducts returns ignored products", async () => {
    const db = createMockDb([{ marketplace: "tcgplayer", externalId: 1 }]);
    expect(await marketplaceAdminRepo(db).listIgnoredProducts()).toHaveLength(1);
  });

  it("getStagingProductNames returns names", async () => {
    const db = createMockDb([{ externalId: 1, productName: "Card" }]);
    expect(await marketplaceAdminRepo(db).getStagingProductNames("tcgplayer", [1])).toHaveLength(1);
  });

  it("insertIgnoredProducts inserts products", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).insertIgnoredProducts([
        { marketplace: "tcgplayer", externalId: 1, finish: "normal", productName: "Card" },
      ]),
    ).resolves.toBeUndefined();
  });

  it("deleteIgnoredProducts returns deleted count", async () => {
    const db = createMockDb([{ numDeletedRows: 2n }]);
    expect(
      await marketplaceAdminRepo(db).deleteIgnoredProducts("tcgplayer", [
        { externalId: 1, finish: "normal" },
      ]),
    ).toBe(2);
  });

  it("deleteIgnoredProducts returns 0 for empty input", async () => {
    const db = createMockDb([]);
    expect(await marketplaceAdminRepo(db).deleteIgnoredProducts("tcgplayer", [])).toBe(0);
  });

  it("upsertStagingCardOverride upserts an override", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).upsertStagingCardOverride({
        marketplace: "tcgplayer",
        externalId: 1,
        finish: "normal",
        cardId: "c-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("deleteStagingCardOverride deletes an override", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceAdminRepo(db).deleteStagingCardOverride("tcgplayer", 1, "normal"),
    ).resolves.toBeUndefined();
  });

  it("clearPriceData returns counts", async () => {
    const db = createMockDb([{ numDeletedRows: 5n }]);
    const result = await marketplaceAdminRepo(db).clearPriceData("tcgplayer");
    expect(result).toEqual({ snapshots: 5, sources: 5, staging: 5 });
  });
});
