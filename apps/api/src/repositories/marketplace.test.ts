import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { marketplaceRepo } from "./marketplace.js";

describe("marketplaceRepo", () => {
  it("latestPrices returns price rows from latest_printing_prices", async () => {
    const rows = [{ printingId: "p1", marketplace: "tcgplayer", marketCents: 1500 }];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.latestPrices()).toEqual(rows);
  });

  it("latestPricesForPrintings short-circuits on empty input", async () => {
    const db = createMockDb([]);
    const repo = marketplaceRepo(db);
    expect(await repo.latestPricesForPrintings([])).toEqual([]);
  });

  it("latestPricesForPrintings returns filtered rows", async () => {
    const rows = [{ printingId: "p1", marketplace: "cardmarket", marketCents: 900 }];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.latestPricesForPrintings(["p1"])).toEqual(rows);
  });

  it("refreshLatestPrices runs the upsert + delete maintenance transaction", async () => {
    // The maintain-table op replaced the old MV refresh; it runs an upsert and a
    // stale-key delete inside one transaction. The mock resolves both raw SQL
    // statements, so this exercises the code path end to end without a database.
    const db = createMockDb([]);
    const repo = marketplaceRepo(db);
    await expect(repo.refreshLatestPrices()).resolves.toBeUndefined();
  });

  it("sourcesForPrinting returns product sources", async () => {
    const rows = [{ id: "ps1", externalId: 12_345, marketplace: "tcgplayer" }];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.sourcesForPrinting("p1")).toEqual(rows);
  });

  it("sourcesForPrintings short-circuits on empty input", async () => {
    const db = createMockDb([]);
    const repo = marketplaceRepo(db);
    expect(await repo.sourcesForPrintings([])).toEqual([]);
  });

  it("sourcesForPrintings returns batched product sources", async () => {
    const rows = [
      { printingId: "p1", externalId: 12_345, marketplace: "tcgplayer" },
      { printingId: "p2", externalId: 67_890, marketplace: "cardmarket" },
    ];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.sourcesForPrintings(["p1", "p2"])).toEqual(rows);
  });

  it("snapshots without cutoff returns all snapshots", async () => {
    const rows = [{ recordedAt: new Date(), marketCents: 1500 }];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.snapshots("ps1", null)).toEqual(rows);
  });

  it("snapshots with cutoff filters by date", async () => {
    const db = createMockDb([]);
    const repo = marketplaceRepo(db);
    expect(await repo.snapshots("ps1", new Date("2025-01-01"))).toEqual([]);
  });
});
