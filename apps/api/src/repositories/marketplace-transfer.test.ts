import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { marketplaceTransferRepo } from "./marketplace-transfer.js";

describe("marketplaceTransferRepo", () => {
  it("snapshotsByMarketplace returns snapshot rows", async () => {
    const rows = [{ printingId: "p1", marketCents: 1500 }];
    const db = createMockDb(rows);
    const repo = marketplaceTransferRepo(db);
    expect(await repo.snapshotsByMarketplace("tcgplayer", ["p1"])).toEqual(rows);
  });

  it("insertSnapshot upserts a snapshot row", async () => {
    const db = createMockDb([]);
    const repo = marketplaceTransferRepo(db);
    await expect(
      repo.insertSnapshot("prod-1", {
        recordedAt: new Date(),
        marketCents: 1500,
        lowCents: 1000,
        midCents: 1500,
        highCents: 2000,
        trendCents: 1400,
        avg1Cents: 1500,
        avg7Cents: 1450,
        avg30Cents: 1400,
      }),
    ).resolves.toBeUndefined();
  });

  it("insertStagingFromSnapshot inserts staging data", async () => {
    const db = createMockDb([]);
    const repo = marketplaceTransferRepo(db);
    await expect(
      repo.insertStagingFromSnapshot(
        "tcgplayer",
        { externalId: 123, groupId: 456, productName: "Card" },
        "normal",
        "EN",
        {
          recordedAt: new Date(),
          marketCents: 1500,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("bulkUnmapToStaging executes raw SQL", async () => {
    const db = createMockDb([]);
    const repo = marketplaceTransferRepo(db);
    await expect(repo.bulkUnmapToStaging("tcgplayer")).resolves.toBeUndefined();
  });
});
