import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";
import { marketplaceRepo } from "./marketplace.js";

// Random per-file so nothing couples to a fixed id (see seedTestUser).
const userId = crypto.randomUUID();
const normalPrintingId = crypto.randomUUID();
const ctPrintingId = crypto.randomUUID();

const ctx = createDbContext(userId);

/**
 * The chart on /collections/stats and the "Estimated Value" figure next to it
 * must agree. They diverged for months because the chart re-implemented the
 * headline price rule with its own ordering, and because a printing can have
 * several SKUs bound on one marketplace with nothing saying which is the price.
 *
 * Migration 219 makes both read `mv_daily_printing_prices`, so the agreement is
 * structural rather than two expressions kept in sync by hand. These tests pin
 * that down, plus the two rules the view encodes: cheapest bound SKU wins, and
 * CardTrader's Zero price carries forward across days.
 */
describe.skipIf(!ctx)("collection value history (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  const friendGroups = friendGroupsRepo(db);
  const mpSynthetic = "mp-value-history";
  const syntheticGroupId = 80_101;
  const ctGroupId = 80_102;

  let collectionId = "";
  let groupCollectionId = "";
  let groupId = "";

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
          { id: normalPrintingId, shortCode: "VH-001", publicCode: "VH-001/002" },
          { id: ctPrintingId, shortCode: "VH-002", publicCode: "VH-002/002" },
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

    const collection = await db
      .insertInto("collections")
      .values({ userId, name: "Value History Binder", isInbox: false, sortOrder: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    collectionId = collection.id;

    await db
      .insertInto("marketplaceGroups")
      .values([
        {
          marketplace: mpSynthetic,
          groupId: syntheticGroupId,
          name: "VH Synthetic",
          abbreviation: null,
        },
        { marketplace: "cardtrader", groupId: ctGroupId, name: "VH CT", abbreviation: null },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    // Two SKUs of the same external product bound to one printing. This is the
    // shape the admin UI creates on purpose: computeWeakProductSuggestions
    // mirrors a "bogus" listing whose finish matches no printing on the card
    // onto its sibling SKU's printings. The foil row is the bogus one and is
    // 100x the real price.
    const skuRows = await db
      .insertInto("marketplaceProducts")
      .values([
        {
          marketplace: mpSynthetic,
          groupId: syntheticGroupId,
          externalId: 91_001,
          productName: "VH Normal",
          finish: "normal",
          language: null,
        },
        {
          marketplace: mpSynthetic,
          groupId: syntheticGroupId,
          externalId: 91_001,
          productName: "VH Normal",
          finish: "foil",
          language: null,
        },
        {
          marketplace: "cardtrader",
          groupId: ctGroupId,
          externalId: 91_002,
          productName: "VH CardTrader",
          finish: "normal",
          language: "EN",
        },
      ])
      .returning(["id", "finish", "marketplace"])
      .execute();

    const cheapSku = skuRows.find((r) => r.marketplace === mpSynthetic && r.finish === "normal")!;
    const bogusSku = skuRows.find((r) => r.marketplace === mpSynthetic && r.finish === "foil")!;
    const ctSku = skuRows.find((r) => r.marketplace === "cardtrader")!;

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: cheapSku.id, printingId: normalPrintingId },
        { marketplaceProductId: bogusSku.id, printingId: normalPrintingId },
        { marketplaceProductId: ctSku.id, printingId: ctPrintingId },
      ])
      .execute();

    // Synthetic marketplace falls into the ELSE branch of the headline CASE,
    // so market_cents is the headline. Cheap SKU 100, bogus SKU 10000.
    await db
      .insertInto("marketplaceProductPrices")
      .values([
        { marketplaceProductId: cheapSku.id, recordedAt: dayOffset(3), marketCents: 100 },
        { marketplaceProductId: cheapSku.id, recordedAt: dayOffset(0), marketCents: 100 },
        { marketplaceProductId: bogusSku.id, recordedAt: dayOffset(3), marketCents: 10_000 },
        { marketplaceProductId: bogusSku.id, recordedAt: dayOffset(0), marketCents: 10_000 },
        // CardTrader: Zero price three days ago, none since. The carry-forward
        // must keep 250 rather than dropping to today's low_cents of 900.
        {
          marketplaceProductId: ctSku.id,
          recordedAt: dayOffset(3),
          lowCents: 800,
          zeroLowCents: 250,
        },
        { marketplaceProductId: ctSku.id, recordedAt: dayOffset(0), lowCents: 900 },
      ])
      .execute();

    // Two copies of the normal printing, one of the CT printing.
    const copyRows = await db
      .insertInto("copies")
      .values([
        { printingId: normalPrintingId, collectionId },
        { printingId: normalPrintingId, collectionId },
        { printingId: ctPrintingId, collectionId },
      ])
      .returning(["id", "printingId"])
      .execute();

    await db
      .insertInto("collectionEvents")
      .values(
        copyRows.map((copy) => ({
          userId,
          action: "added" as const,
          printingId: copy.printingId,
          copyId: copy.id,
          toCollectionId: collectionId,
          toCollectionName: "Value History Binder",
          createdAt: dayOffset(3),
        })),
      )
      .execute();

    // An orphan `removed` with no matching `added`, for a printing the user
    // still holds. 6573 of these exist in production: their copies predate
    // event logging, so migration 139's backfill could never reach them. A
    // forward replay lets this cancel one of the two live copies above.
    await db
      .insertInto("collectionEvents")
      .values({
        userId,
        action: "removed" as const,
        printingId: normalPrintingId,
        copyId: null,
        fromCollectionId: collectionId,
        fromCollectionName: "Value History Binder",
        createdAt: dayOffset(2),
      })
      .execute();

    // A group collection the user contributes to. The Stats card's
    // all-collections figure leaves group copies out (buildStacks skips
    // copy.groupId !== null), so the chart's all-collections mode must too.
    const group = await friendGroups.createWithOwner(
      {
        slug: `vh-${userId.slice(0, 8)}`,
        name: "Value History Group",
        description: null,
        code: null,
      },
      userId,
    );
    groupId = group.id;

    const groupCollection = await db
      .insertInto("collections")
      .values({
        userId: null,
        groupId: group.id,
        name: "Group Bulk Box",
        isInbox: false,
        sortOrder: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    groupCollectionId = groupCollection.id;

    const groupCopy = await db
      .insertInto("copies")
      .values({ printingId: normalPrintingId, collectionId: groupCollection.id })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("collectionEvents")
      .values({
        userId,
        action: "added" as const,
        printingId: normalPrintingId,
        copyId: groupCopy.id,
        toCollectionId: groupCollection.id,
        toCollectionName: "Group Bulk Box",
        createdAt: dayOffset(2),
      })
      .execute();

    await repo.refreshLatestPrices();
  });

  afterAll(async () => {
    await db.deleteFrom("collectionEvents").where("userId", "=", userId).execute();
    await db
      .deleteFrom("copies")
      .where("collectionId", "in", [collectionId, groupCollectionId])
      .execute();
    await db
      .deleteFrom("collections")
      .where("id", "in", [collectionId, groupCollectionId])
      .execute();
    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    await db.deleteFrom("users").where("id", "=", userId).execute();
    await sql`
      DELETE FROM marketplace_product_prices pp
      USING marketplace_products mp
      WHERE mp.id = pp.marketplace_product_id
        AND mp.external_id IN (91001, 91002)
    `.execute(db);
    await sql`
      DELETE FROM marketplace_product_variants mpv
      USING marketplace_products mp
      WHERE mp.id = mpv.marketplace_product_id
        AND mp.external_id IN (91001, 91002)
    `.execute(db);
    await db
      .deleteFrom("marketplaceProducts")
      .where("externalId", "in", [91_001, 91_002])
      .execute();
    await sql`
      DELETE FROM marketplace_groups
      WHERE (marketplace, group_id) IN ((${mpSynthetic}, ${syntheticGroupId}), ('cardtrader', ${ctGroupId}))
    `.execute(db);
    await db.deleteFrom("printings").where("id", "in", [normalPrintingId, ctPrintingId]).execute();
    await repo.refreshLatestPrices();
  });

  // ---------------------------------------------------------------------------
  // The invariant
  // ---------------------------------------------------------------------------

  it("ends the series on the same value the Stats card shows", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });
    const values = await repo.collectionValues([collectionId], mpSynthetic);

    const last = series.at(-1);
    expect(last).toBeDefined();
    expect(last!.valueCents).toBe(values.get(collectionId)!.totalValueCents);
  });

  it("ends the series on the collection's actual copy count", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });

    // Three copies, despite the orphan `removed` event with no matching
    // `added`. A forward replay would report two.
    expect(series.at(-1)!.copyCount).toBe(3);
  });

  it("leaves group-collection copies out of the all-collections total", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: null,
      cutoff: null,
      scope: {},
    });

    // Three personal copies. The fourth lives in a group collection, which
    // the Stats card's all-collections figure also excludes.
    expect(series.at(-1)!.copyCount).toBe(3);
  });

  it("counts group copies when that collection is the one selected", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: [groupCollectionId],
      cutoff: null,
      scope: {},
    });
    const value = await repo.singleCollectionValue(groupCollectionId, mpSynthetic);

    expect(series.at(-1)!.copyCount).toBe(1);
    expect(series.at(-1)!.valueCents).toBe(value!.totalValueCents);
  });

  it("spans the whole requested range even with no events inside it", async () => {
    // Every event in this fixture is at least two days old.
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: [collectionId],
      cutoff: new Date(Date.now() - 86_400_000),
      scope: {},
    });

    expect(series.length).toBe(2);
    expect(series.at(-1)!.copyCount).toBe(3);
  });

  it("returns dates ascending with no gaps", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpSynthetic,
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });

    for (let i = 1; i < series.length; i++) {
      const previous = new Date(`${series[i - 1].date}T00:00:00Z`);
      previous.setUTCDate(previous.getUTCDate() + 1);
      expect(series[i].date).toBe(previous.toISOString().slice(0, 10));
    }
  });

  it("holds the invariant on cardtrader too, where the Zero rule applies", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: "cardtrader",
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });
    const values = await repo.collectionValues([collectionId], "cardtrader");

    expect(series.at(-1)!.valueCents).toBe(values.get(collectionId)!.totalValueCents);
  });

  // ---------------------------------------------------------------------------
  // The rules the daily view encodes
  // ---------------------------------------------------------------------------

  it("prices a printing from its cheapest bound SKU, not an arbitrary one", async () => {
    const row = await db
      .selectFrom("mvLatestPrintingPrices")
      .select("headlineCents")
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpSynthetic)
      .executeTakeFirstOrThrow();

    // 100 (real listing), not 10000 (the bogus foil SKU bound to the same
    // printing) and not whatever the plan happened to emit first.
    expect(row.headlineCents).toBe(100);
  });

  it("returns the same total on repeated calls", async () => {
    const runs = await Promise.all(
      [0, 1, 2].map(async () => {
        const series = await repo.collectionValueTimeSeries({
          userId,
          marketplace: mpSynthetic,
          collectionIds: [collectionId],
          cutoff: null,
          scope: {},
        });
        return series.at(-1)!.valueCents;
      }),
    );

    expect(new Set(runs).size).toBe(1);
  });

  it("carries a CardTrader Zero price forward past days without one", async () => {
    const row = await db
      .selectFrom("mvLatestPrintingPrices")
      .select("headlineCents")
      .where("printingId", "=", ctPrintingId)
      .where("marketplace", "=", "cardtrader")
      .executeTakeFirstOrThrow();

    // The newest snapshot has no Zero price, only lowCents 900. Zero excludes
    // the per-seller shipping a raw low listing adds, so the older 250 stays.
    expect(row.headlineCents).toBe(250);
  });

  it("keeps the latest view equal to the daily view's most recent day", async () => {
    const daily = await db
      .selectFrom("mvDailyPrintingPrices")
      .select(["headlineCents"])
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpSynthetic)
      .orderBy("day", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    const latest = await db
      .selectFrom("mvLatestPrintingPrices")
      .select("headlineCents")
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpSynthetic)
      .executeTakeFirstOrThrow();

    expect(latest.headlineCents).toBe(daily.headlineCents);
  });
});
