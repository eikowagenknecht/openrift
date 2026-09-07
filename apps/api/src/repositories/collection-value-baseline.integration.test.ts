import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

const userId = crypto.randomUUID();
const risingPrintingId = crypto.randomUUID();
const flatPrintingId = crypto.randomUUID();
const latePrintingId = crypto.randomUUID();
const midPrintingId = crypto.randomUUID();

const ctx = createDbContext(userId);

describe.skipIf(!ctx)("collection value baseline (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  const marketplace = "tcgplayer" as const;
  const groupId = 80_201;

  let risingCollectionId = "";
  let flatCollectionId = "";
  let lateCollectionId = "";
  let midCollectionId = "";

  function dayOffset(daysAgo: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d;
  }

  beforeAll(async () => {
    const seedPrinting = await db
      .selectFrom("printings")
      .select(["cardId", "setId", "artist"])
      .where("id", "=", PRINTING_1.id)
      .executeTakeFirstOrThrow();

    await db
      .insertInto("printings")
      .values(
        [
          { id: risingPrintingId, shortCode: "VB-001", publicCode: "VB-001/004" },
          { id: flatPrintingId, shortCode: "VB-002", publicCode: "VB-002/004" },
          { id: latePrintingId, shortCode: "VB-003", publicCode: "VB-003/004" },
          { id: midPrintingId, shortCode: "VB-004", publicCode: "VB-004/004" },
        ].map((p) => ({
          ...p,
          cardId: seedPrinting.cardId,
          setId: seedPrinting.setId,
          artist: seedPrinting.artist,
          rarity: "common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          size: "standard",
          language: "EN",
        })),
      )
      .execute();

    await seedTestUser(db, { id: userId });

    const collections = await db
      .insertInto("collections")
      .values(
        ["Rising", "Flat", "Late", "Mid"].map((name, index) => ({
          userId,
          name: `Baseline ${name}`,
          isInbox: false,
          sortOrder: index + 1,
        })),
      )
      .returning(["id", "name"])
      .execute();
    risingCollectionId = collections.find((c) => c.name === "Baseline Rising")!.id;
    flatCollectionId = collections.find((c) => c.name === "Baseline Flat")!.id;
    lateCollectionId = collections.find((c) => c.name === "Baseline Late")!.id;
    midCollectionId = collections.find((c) => c.name === "Baseline Mid")!.id;

    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "VB TCG", abbreviation: null })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const skuRows = await db
      .insertInto("marketplaceProducts")
      .values(
        [
          { externalId: 92_001, productName: "VB Rising" },
          { externalId: 92_002, productName: "VB Flat" },
          { externalId: 92_003, productName: "VB Late" },
          { externalId: 92_004, productName: "VB Mid" },
        ].map((p) => ({ ...p, marketplace, groupId, finish: "normal", language: null })),
      )
      .returning(["id", "externalId"])
      .execute();

    const risingSku = skuRows.find((r) => r.externalId === 92_001)!;
    const flatSku = skuRows.find((r) => r.externalId === 92_002)!;
    const lateSku = skuRows.find((r) => r.externalId === 92_003)!;
    const midSku = skuRows.find((r) => r.externalId === 92_004)!;

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: risingSku.id, printingId: risingPrintingId },
        { marketplaceProductId: flatSku.id, printingId: flatPrintingId },
        { marketplaceProductId: lateSku.id, printingId: latePrintingId },
        { marketplaceProductId: midSku.id, printingId: midPrintingId },
      ])
      .execute();

    await db
      .insertInto("marketplaceProductPrices")
      .values([
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(6), marketCents: 100 },
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(4), marketCents: 150 },
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(0), marketCents: 300 },
        { marketplaceProductId: flatSku.id, recordedAt: dayOffset(6), marketCents: 200 },
        { marketplaceProductId: flatSku.id, recordedAt: dayOffset(0), marketCents: 200 },
        { marketplaceProductId: lateSku.id, recordedAt: dayOffset(2), marketCents: 500 },
        { marketplaceProductId: lateSku.id, recordedAt: dayOffset(0), marketCents: 900 },
        { marketplaceProductId: midSku.id, recordedAt: dayOffset(6), marketCents: 100 },
        { marketplaceProductId: midSku.id, recordedAt: dayOffset(3), marketCents: 400 },
        { marketplaceProductId: midSku.id, recordedAt: dayOffset(0), marketCents: 500 },
      ])
      .execute();

    const copyRows = await db
      .insertInto("copies")
      .values([
        { printingId: risingPrintingId, collectionId: risingCollectionId },
        { printingId: flatPrintingId, collectionId: flatCollectionId },
        { printingId: flatPrintingId, collectionId: flatCollectionId },
        { printingId: latePrintingId, collectionId: lateCollectionId },
        { printingId: midPrintingId, collectionId: midCollectionId },
      ])
      .returning(["id", "printingId", "collectionId"])
      .execute();

    const midWindowCopyIds = new Set([
      copyRows.filter((c) => c.printingId === flatPrintingId)[1].id,
      copyRows.find((c) => c.printingId === midPrintingId)!.id,
    ]);
    await db
      .insertInto("collectionEvents")
      .values(
        copyRows.map((copy) => ({
          userId,
          action: "added" as const,
          printingId: copy.printingId,
          copyId: copy.id,
          toCollectionId: copy.collectionId,
          toCollectionName: "Baseline",
          createdAt: midWindowCopyIds.has(copy.id) ? dayOffset(2) : dayOffset(6),
        })),
      )
      .execute();

    await repo.refreshLatestPrices();
  });

  afterAll(async () => {
    const collectionIds = [risingCollectionId, flatCollectionId, lateCollectionId, midCollectionId];
    await db.deleteFrom("collectionEvents").where("userId", "=", userId).execute();
    await db.deleteFrom("copies").where("collectionId", "in", collectionIds).execute();
    await db.deleteFrom("collections").where("id", "in", collectionIds).execute();
    await db.deleteFrom("users").where("id", "=", userId).execute();
    await sql`
      DELETE FROM marketplace_product_prices pp
      USING marketplace_products mp
      WHERE mp.id = pp.marketplace_product_id
        AND mp.external_id IN (92001, 92002, 92003, 92004)
    `.execute(db);
    await sql`
      DELETE FROM marketplace_product_variants mpv
      USING marketplace_products mp
      WHERE mp.id = mpv.marketplace_product_id
        AND mp.external_id IN (92001, 92002, 92003, 92004)
    `.execute(db);
    await db
      .deleteFrom("marketplaceProducts")
      .where("externalId", "in", [92_001, 92_002, 92_003, 92_004])
      .execute();
    await sql`
      DELETE FROM marketplace_groups
      WHERE marketplace = ${marketplace} AND group_id = ${groupId}
    `.execute(db);
    await db
      .deleteFrom("printings")
      .where("id", "in", [risingPrintingId, flatPrintingId, latePrintingId, midPrintingId])
      .execute();
    await repo.refreshLatestPrices();
  });

  function seriesFor(collectionId: string, cutoff: Date | null = null) {
    return repo.collectionValueTimeSeries({
      userId,
      marketplace,
      collectionIds: [collectionId],
      cutoff,
      scope: {},
    });
  }

  it("holds the baseline flat while prices rise under a fixed composition", async () => {
    const series = await seriesFor(risingCollectionId);

    expect(new Set(series.map((p) => p.baselineValueCents))).toEqual(new Set([100]));
    expect(series[0].valueCents).toBe(100);
    expect(series.at(-1)!.valueCents).toBe(300);
  });

  it("moves both lines together when prices are flat and cards are added", async () => {
    const series = await seriesFor(flatCollectionId);

    for (const point of series) {
      expect(point.valueCents).toBe(point.baselineValueCents);
    }
    expect(series[0].copyCount).toBe(1);
    expect(series.at(-1)!.copyCount).toBe(2);
    expect(series.at(-1)!.valueCents).toBe(400);
  });

  it("rebases the baseline when the requested range changes", async () => {
    const allTime = await seriesFor(risingCollectionId);
    const threeDays = await seriesFor(risingCollectionId, dayOffset(3));

    expect(allTime.at(-1)!.baselineValueCents).toBe(100);
    expect(threeDays.at(-1)!.baselineValueCents).toBe(150);
    expect(threeDays.at(-1)!.valueCents).toBe(300);
  });

  it("prices a mid-window purchase at what it cost that day, not at the range start", async () => {
    const series = await seriesFor(midCollectionId);

    expect(series.at(-1)!.valueCents).toBe(500);
    expect(series.at(-1)!.baselineValueCents).toBe(400);
    expect(series[0].valueCents).toBe(400);
    expect(series[0].baselineValueCents).toBe(400);
  });

  it("drops a printing from both lines on days it has no price", async () => {
    const series = await seriesFor(lateCollectionId);

    expect(series[0].copyCount).toBe(1);
    expect(series[0].valueCents).toBe(0);
    expect(series[0].baselineValueCents).toBe(0);
    expect(series.at(-1)!.valueCents).toBe(900);
    expect(series.at(-1)!.baselineValueCents).toBe(500);
  });

  it("leaves the real line equal to the Stats card figure", async () => {
    const series = await seriesFor(risingCollectionId);
    const values = await repo.collectionValues([risingCollectionId], marketplace);

    expect(series.at(-1)!.valueCents).toBe(values.get(risingCollectionId)!.totalValueCents);
  });
});
