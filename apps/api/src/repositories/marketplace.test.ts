import { beforeEach, describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { createRecordingDb, onlyStatement } from "../test/recording-db.js";
import { marketplaceRepo } from "./marketplace.js";

describe("marketplaceRepo", () => {
  it("latestPrices returns price rows", async () => {
    const rows = [{ printingId: "p1", marketplace: "tcgplayer", marketCents: 1500 }];
    const db = createMockDb(rows);
    const repo = marketplaceRepo(db);
    expect(await repo.latestPrices()).toEqual(rows);
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

describe("marketplaceRepo (generated SQL)", () => {
  const captured = createRecordingDb();

  beforeEach(() => {
    captured.reset();
  });

  it("sourcesForPrinting reads only the variants bound to that printing", async () => {
    // Cross-language aggregates are materialised as their own variant rows,
    // so there is no sibling fan-out left to replay here.
    await marketplaceRepo(captured.db).sourcesForPrinting("pr-1");

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe(
      'select "mpv"."id" as "variant_id", "mp"."external_id" as "external_id",' +
        ' "mp"."marketplace" as "marketplace", "mp"."language" as "language"' +
        ' from "marketplace_product_variants" as "mpv"' +
        ' inner join "marketplace_products" as "mp" on "mp"."id" = "mpv"."marketplace_product_id"' +
        ' where "mpv"."printing_id" = $1',
    );
    expect(parameters).toEqual(["pr-1"]);
  });

  it("sourcesForPrintings binds every printing id it was given", async () => {
    await marketplaceRepo(captured.db).sourcesForPrintings(["pr-1", "pr-2"]);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain('where "mpv"."printing_id" in ($1, $2)');
    expect(parameters).toEqual(["pr-1", "pr-2"]);
  });
});
