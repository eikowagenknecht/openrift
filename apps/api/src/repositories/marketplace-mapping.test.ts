import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { marketplaceMappingRepo } from "./marketplace-mapping.js";

describe("marketplaceMappingRepo", () => {
  it("ignoredProducts returns ignored products for a marketplace", async () => {
    const rows = [{ externalId: 1, finish: "normal", productName: "Card", createdAt: new Date() }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).ignoredProducts("tcgplayer")).toEqual(rows);
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
    const rows = [{ externalId: 1, finish: "normal", cardId: "c1" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).stagingCardOverrides("tcgplayer")).toEqual(rows);
  });

  it("printingFinishesAndLanguages returns finishes and languages by IDs", async () => {
    const rows = [{ id: "p1", finish: "normal", language: "EN" }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).printingFinishesAndLanguages(["p1"])).toEqual(rows);
  });

  it("stagingByExternalIds returns staging rows by external IDs", async () => {
    const rows = [{ id: "s1", externalId: 100 }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).stagingByExternalIds("tcgplayer", [100])).toEqual(rows);
  });

  it("upsertSources batch-upserts marketplace sources", async () => {
    const rows = [{ id: "src-1", printingId: "p1" }];
    const db = createMockDb(rows);
    const values = [
      {
        marketplace: "tcgplayer",
        printingId: "p1",
        externalId: 100,
        groupId: 1,
        productName: "Card",
        language: "EN",
      },
    ];
    expect(await marketplaceMappingRepo(db).upsertSources(values)).toEqual(rows);
  });

  it("insertSnapshots batch-inserts snapshots", async () => {
    const db = createMockDb([]);
    const rows = [
      {
        productId: "src-1",
        recordedAt: new Date(),
        marketCents: 500,
        lowCents: 400,
        midCents: 500,
        highCents: 600,
        trendCents: 450,
        avg1Cents: 490,
        avg7Cents: 480,
        avg30Cents: 470,
      },
    ];
    await expect(marketplaceMappingRepo(db).insertSnapshots(rows)).resolves.toBeUndefined();
  });

  it("deleteStagingTuples deletes staging rows by tuples", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).deleteStagingTuples("tcgplayer", [
        { externalId: 1, finish: "normal", language: "EN" },
      ]),
    ).resolves.toBeUndefined();
  });

  it("getSource returns a source by marketplace and printingId", async () => {
    const row = { id: "src-1", marketplace: "tcgplayer", printingId: "p1" };
    const db = createMockDb([row]);
    expect(await marketplaceMappingRepo(db).getSource("tcgplayer", "p1")).toEqual(row);
  });

  it("getSource returns undefined when not found", async () => {
    const db = createMockDb([]);
    expect(await marketplaceMappingRepo(db).getSource("tcgplayer", "p-missing")).toBeUndefined();
  });

  it("getPrintingFinishAndLanguage returns finish and language by printingId", async () => {
    const row = { finish: "foil", language: "EN" };
    const db = createMockDb([row]);
    expect(await marketplaceMappingRepo(db).getPrintingFinishAndLanguage("p1")).toEqual(row);
  });

  it("snapshotsByProductId returns snapshots", async () => {
    const rows = [{ productId: "src-1", marketCents: 500 }];
    const db = createMockDb(rows);
    expect(await marketplaceMappingRepo(db).snapshotsByProductId("src-1")).toEqual(rows);
  });

  it("deleteSnapshotsByProductId deletes snapshots", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).deleteSnapshotsByProductId("src-1"),
    ).resolves.toBeUndefined();
  });

  it("deleteSourceById deletes a source", async () => {
    const db = createMockDb([]);
    await expect(marketplaceMappingRepo(db).deleteSourceById("src-1")).resolves.toBeUndefined();
  });

  it("countMappedSources returns count", async () => {
    const db = createMockDb([{ count: 42 }]);
    expect(await marketplaceMappingRepo(db).countMappedSources("tcgplayer")).toBe(42);
  });

  it("deleteSnapshotsForMappedSources deletes snapshots", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).deleteSnapshotsForMappedSources("tcgplayer"),
    ).resolves.toBeUndefined();
  });

  it("deleteMappedSources deletes all mapped sources", async () => {
    const db = createMockDb([]);
    await expect(
      marketplaceMappingRepo(db).deleteMappedSources("tcgplayer"),
    ).resolves.toBeUndefined();
  });
});
