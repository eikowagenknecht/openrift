import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

const ctx = createDbContext("a0000000-0030-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  // Seed data references:
  // - Printing: Annie, Fiery = '019cf052-e020-7222-b8bf-3c9fc2151abc'
  // - TCGPlayer source for Annie: '019cf052-a62c-7993-b36e-917d2cbf013a'
  // - Cardmarket source for Annie: '019cf052-a62e-71a4-af71-47bf427ddf16'
  const anniePrintingId = "019cf052-e020-7222-b8bf-3c9fc2151abc";
  const annieTcgSourceId = "019cf052-a62c-7993-b36e-917d2cbf013a";

  // Track snapshot IDs for cleanup
  const createdSnapshotIds: string[] = [];

  afterAll(async () => {
    for (const id of createdSnapshotIds.toReversed()) {
      await db.deleteFrom("marketplaceSnapshots").where("id", "=", id).execute();
    }
  });

  // ---------------------------------------------------------------------------
  // sourcesForPrinting
  // ---------------------------------------------------------------------------

  it("returns marketplace sources for a known printing", async () => {
    const sources = await repo.sourcesForPrinting(anniePrintingId);

    expect(sources.length).toBeGreaterThanOrEqual(2);

    const tcg = sources.find((s) => s.marketplace === "tcgplayer");
    expect(tcg).toBeDefined();
    expect(tcg!.externalId).toBe(653_136);

    const cm = sources.find((s) => s.marketplace === "cardmarket");
    expect(cm).toBeDefined();
    expect(cm!.externalId).toBe(847_523);
  });

  it("returns empty array for a nonexistent printing", async () => {
    const sources = await repo.sourcesForPrinting("a0000000-0000-4000-a000-000000000000");

    expect(sources).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // snapshots
  // ---------------------------------------------------------------------------

  it("returns snapshots ordered by recordedAt ascending", async () => {
    // Insert two snapshots for the Annie TCGPlayer source
    const snap1 = await db
      .insertInto("marketplaceSnapshots")
      .values({
        productId: annieTcgSourceId,
        marketCents: 100,
        lowCents: 80,
        midCents: 95,
        highCents: 150,
        recordedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdSnapshotIds.push(snap1.id);

    const snap2 = await db
      .insertInto("marketplaceSnapshots")
      .values({
        productId: annieTcgSourceId,
        marketCents: 120,
        lowCents: 90,
        midCents: 110,
        highCents: 160,
        recordedAt: new Date("2026-02-01T00:00:00Z"),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdSnapshotIds.push(snap2.id);

    const snaps = await repo.snapshots(annieTcgSourceId, null);

    expect(snaps.length).toBeGreaterThanOrEqual(2);
    // Verify ascending order
    for (let i = 1; i < snaps.length; i++) {
      expect(new Date(snaps[i].recordedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(snaps[i - 1].recordedAt).getTime(),
      );
    }
  });

  it("filters snapshots by cutoff date", async () => {
    const cutoff = new Date("2026-01-15T00:00:00Z");
    const snaps = await repo.snapshots(annieTcgSourceId, cutoff);

    // Should only include snap2 (Feb) and anything after cutoff
    for (const s of snaps) {
      expect(new Date(s.recordedAt).getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });

  it("returns empty array for a nonexistent source", async () => {
    const snaps = await repo.snapshots("a0000000-0000-4000-a000-000000000000", null);

    expect(snaps).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // latestPrices
  // ---------------------------------------------------------------------------

  it("returns latest tcgplayer prices with printingId and marketCents", async () => {
    const prices = await repo.latestPrices();

    // We inserted snapshots for Annie's TCGPlayer source, so it should appear
    expect(prices.length).toBeGreaterThanOrEqual(1);

    const anniePrice = prices.find((p) => p.printingId === anniePrintingId);
    expect(anniePrice).toBeDefined();
    // The latest snapshot is snap2 with marketCents=120
    expect(anniePrice!.marketCents).toBe(120);
  });

  it("each row has printingId and marketCents fields", async () => {
    const prices = await repo.latestPrices();

    for (const p of prices) {
      expect(p.printingId).toBeDefined();
      expect(typeof p.marketCents).toBe("number");
    }
  });
});
