import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

const ctx = createDbContext("a0000000-0030-4000-a000-000000000001");

describe.skipIf(!ctx)("marketplaceRepo (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  // Use the seed printing but create our own marketplace data with unique
  // marketplace names so other tests' cleanup never deletes them.
  const anniePrintingId = "019cf052-e020-7222-b8bf-3c9fc2151abc";
  const mpTcg = "mp-repo-test-tcg";
  const mpCm = "mp-repo-test-cm";

  let tcgProductId = "";

  // Track snapshot IDs for cleanup
  const createdSnapshotIds: string[] = [];

  beforeAll(async () => {
    // Create marketplace groups for our test marketplaces
    await db
      .insertInto("marketplaceGroups")
      .values([
        { marketplace: mpTcg, groupId: 80_001, name: "MP Repo Test TCG", abbreviation: null },
        { marketplace: mpCm, groupId: 80_002, name: "MP Repo Test CM", abbreviation: null },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    // Create two marketplace products linked to the same printing but different marketplaces
    const [tcg] = await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: mpTcg,
        groupId: 80_001,
        externalId: 653_136,
        productName: "Annie Fiery (Test TCG)",
        printingId: anniePrintingId,
      })
      .returning("id")
      .execute();
    tcgProductId = tcg.id;

    await db
      .insertInto("marketplaceProducts")
      .values({
        marketplace: mpCm,
        groupId: 80_002,
        externalId: 847_523,
        productName: "Annie, Fiery (Test CM)",
        printingId: anniePrintingId,
      })
      .execute();
  });

  afterAll(async () => {
    for (const id of createdSnapshotIds.toReversed()) {
      await db.deleteFrom("marketplaceSnapshots").where("id", "=", id).execute();
    }
    await db.deleteFrom("marketplaceProducts").where("marketplace", "in", [mpTcg, mpCm]).execute();
    await db.deleteFrom("marketplaceGroups").where("marketplace", "in", [mpTcg, mpCm]).execute();
  });

  // ---------------------------------------------------------------------------
  // sourcesForPrinting
  // ---------------------------------------------------------------------------

  it("returns marketplace sources for a known printing", async () => {
    const sources = await repo.sourcesForPrinting(anniePrintingId);

    // At least our 2 test products (other tests may have added more)
    expect(sources.length).toBeGreaterThanOrEqual(2);

    const testSources = sources.filter((s) => s.marketplace === mpTcg || s.marketplace === mpCm);
    expect(testSources.length).toBe(2);
  });

  it("returns empty array for a nonexistent printing", async () => {
    const sources = await repo.sourcesForPrinting("a0000000-0000-4000-a000-000000000000");

    expect(sources).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // snapshots
  // ---------------------------------------------------------------------------

  it("returns snapshots ordered by recordedAt ascending", async () => {
    // Insert two snapshots for our TCG product
    const snap1 = await db
      .insertInto("marketplaceSnapshots")
      .values({
        productId: tcgProductId,
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
        productId: tcgProductId,
        marketCents: 120,
        lowCents: 90,
        midCents: 110,
        highCents: 160,
        recordedAt: new Date("2026-02-01T00:00:00Z"),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdSnapshotIds.push(snap2.id);

    const snaps = await repo.snapshots(tcgProductId, null);

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
    const snaps = await repo.snapshots(tcgProductId, cutoff);

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

  it("returns latest prices with printingId and marketCents", async () => {
    const prices = await repo.latestPrices();

    // We inserted snapshots for our TCG product, so it should appear
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
