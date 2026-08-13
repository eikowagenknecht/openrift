import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { marketplaceRepo } from "./marketplace.js";

// Random per-file so nothing couples to a fixed id (see seedTestUser).
const userId = crypto.randomUUID();
const risingPrintingId = crypto.randomUUID();
const flatPrintingId = crypto.randomUUID();
const latePrintingId = crypto.randomUUID();

const ctx = createDbContext(userId);

/**
 * `baselineValueCents` prices each day's holdings as if the market had frozen
 * on the first day of the requested range, so the gap to `valueCents` is price
 * movement with buying and selling divided out.
 *
 * Three scenarios get their own collection, because the series is scoped by
 * collection but `startDay` is not — it comes from the user's first event
 * either way. Every `added` event is therefore dated six days ago, which pins
 * `startDay` to the same day for all of them.
 */
describe.skipIf(!ctx)("collection value baseline (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  const marketplace = "mp-value-baseline";
  const groupId = 80_201;

  let risingCollectionId = "";
  let flatCollectionId = "";
  let lateCollectionId = "";

  /** @returns The UTC date `daysAgo` days before today, at midnight. */
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
          { id: risingPrintingId, shortCode: "VB-001", publicCode: "VB-001/003" },
          { id: flatPrintingId, shortCode: "VB-002", publicCode: "VB-002/003" },
          { id: latePrintingId, shortCode: "VB-003", publicCode: "VB-003/003" },
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
        ["Rising", "Flat", "Late"].map((name, index) => ({
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

    await db
      .insertInto("marketplaceGroups")
      .values({ marketplace, groupId, name: "VB Synthetic", abbreviation: null })
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const skuRows = await db
      .insertInto("marketplaceProducts")
      .values(
        [
          { externalId: 92_001, productName: "VB Rising" },
          { externalId: 92_002, productName: "VB Flat" },
          { externalId: 92_003, productName: "VB Late" },
        ].map((p) => ({ ...p, marketplace, groupId, finish: "normal", language: null })),
      )
      .returning(["id", "externalId"])
      .execute();

    const risingSku = skuRows.find((r) => r.externalId === 92_001)!;
    const flatSku = skuRows.find((r) => r.externalId === 92_002)!;
    const lateSku = skuRows.find((r) => r.externalId === 92_003)!;

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: risingSku.id, printingId: risingPrintingId },
        { marketplaceProductId: flatSku.id, printingId: flatPrintingId },
        { marketplaceProductId: lateSku.id, printingId: latePrintingId },
      ])
      .execute();

    // A synthetic marketplace falls into the ELSE branch of the headline CASE,
    // so market_cents is the headline and these numbers are the prices.
    await db
      .insertInto("marketplaceProductPrices")
      .values([
        // Rising: 100 at the window start, a step to 150, then 300 today. The
        // mid-window step is what lets a shorter range freeze somewhere else.
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(6), marketCents: 100 },
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(4), marketCents: 150 },
        { marketplaceProductId: risingSku.id, recordedAt: dayOffset(0), marketCents: 300 },
        // Flat: unchanged across the window, so buying must move both lines
        // by the same amount.
        { marketplaceProductId: flatSku.id, recordedAt: dayOffset(6), marketCents: 200 },
        { marketplaceProductId: flatSku.id, recordedAt: dayOffset(0), marketCents: 200 },
        // Late: no price at all until day 2, though the copy is held from day
        // 6, and then a rise. Freezing at its first-ever 500 would book a 400
        // gain over a window it had no starting price for.
        { marketplaceProductId: lateSku.id, recordedAt: dayOffset(2), marketCents: 500 },
        { marketplaceProductId: lateSku.id, recordedAt: dayOffset(0), marketCents: 900 },
      ])
      .execute();

    const copyRows = await db
      .insertInto("copies")
      .values([
        { printingId: risingPrintingId, collectionId: risingCollectionId },
        { printingId: flatPrintingId, collectionId: flatCollectionId },
        { printingId: flatPrintingId, collectionId: flatCollectionId },
        { printingId: latePrintingId, collectionId: lateCollectionId },
      ])
      .returning(["id", "printingId", "collectionId"])
      .execute();

    // One of the two flat copies arrives mid-window; everything else is held
    // from day six so `startDay` is the same for every scenario.
    const flatCopies = copyRows.filter((c) => c.printingId === flatPrintingId);
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
          createdAt: copy.id === flatCopies[1].id ? dayOffset(2) : dayOffset(6),
        })),
      )
      .execute();

    await repo.refreshLatestPrices();
  });

  afterAll(async () => {
    const collectionIds = [risingCollectionId, flatCollectionId, lateCollectionId];
    await db.deleteFrom("collectionEvents").where("userId", "=", userId).execute();
    await db.deleteFrom("copies").where("collectionId", "in", collectionIds).execute();
    await db.deleteFrom("collections").where("id", "in", collectionIds).execute();
    await db.deleteFrom("users").where("id", "=", userId).execute();
    await sql`
      DELETE FROM marketplace_product_prices pp
      USING marketplace_products mp
      WHERE mp.id = pp.marketplace_product_id
        AND mp.external_id IN (92001, 92002, 92003)
    `.execute(db);
    await sql`
      DELETE FROM marketplace_product_variants mpv
      USING marketplace_products mp
      WHERE mp.id = mpv.marketplace_product_id
        AND mp.external_id IN (92001, 92002, 92003)
    `.execute(db);
    await db
      .deleteFrom("marketplaceProducts")
      .where("externalId", "in", [92_001, 92_002, 92_003])
      .execute();
    await sql`
      DELETE FROM marketplace_groups
      WHERE marketplace = ${marketplace} AND group_id = ${groupId}
    `.execute(db);
    await db
      .deleteFrom("printings")
      .where("id", "in", [risingPrintingId, flatPrintingId, latePrintingId])
      .execute();
    await repo.refreshLatestPrices();
  });

  /** @returns The value series for one collection over the given cutoff. */
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

    // Nothing was bought or sold, so the counterfactual never moves.
    expect(new Set(series.map((p) => p.baselineValueCents))).toEqual(new Set([100]));
    expect(series[0].valueCents).toBe(100);
    expect(series.at(-1)!.valueCents).toBe(300);
  });

  it("moves both lines together when prices are flat and cards are added", async () => {
    const series = await seriesFor(flatCollectionId);

    // The whole point of the second line: buying is not a return.
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

    // All-time freezes at the day-6 price of 100; the 3-day window freezes at
    // the day-4 step of 150, carried forward to its own first day. Without
    // this the range toggle would not change the reported return at all.
    expect(allTime.at(-1)!.baselineValueCents).toBe(100);
    expect(threeDays.at(-1)!.baselineValueCents).toBe(150);
    expect(threeDays.at(-1)!.valueCents).toBe(300);
  });

  it("reports no return for a printing that had no price at the range start", async () => {
    const series = await seriesFor(lateCollectionId);

    // Held from day six, unpriced until day two, then 500 -> 900. There is no
    // day-six price to freeze at, so the honest return over this window is
    // zero: the two lines track each other exactly, including on the days the
    // printing is unpriced and both read zero.
    for (const point of series) {
      expect(point.copyCount).toBe(1);
      expect(point.baselineValueCents).toBe(point.valueCents);
    }
    expect(series[0].valueCents).toBe(0);
    // Charged its own current price rather than its first-ever 500, which
    // would have shown a 400 gain the holder never made. Pricing every
    // late-listed card at its release-day high is what made the All range read
    // 3x the real collection value.
    expect(series.at(-1)!.valueCents).toBe(900);
    expect(series.at(-1)!.baselineValueCents).toBe(900);
  });

  it("leaves the real line equal to the Stats card figure", async () => {
    const series = await seriesFor(risingCollectionId);
    const values = await repo.collectionValues([risingCollectionId], marketplace);

    // The baseline is additive: it must not have perturbed the headline.
    expect(series.at(-1)!.valueCents).toBe(values.get(risingCollectionId)!.totalValueCents);
  });
});
