import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";
import { marketplaceRepo } from "./marketplace.js";

const userId = crypto.randomUUID();
const normalPrintingId = crypto.randomUUID();
const ctPrintingId = crypto.randomUUID();

const ctx = createDbContext(userId);

describe.skipIf(!ctx)("collection value history (integration)", () => {
  const { db } = ctx!;
  const repo = marketplaceRepo(db);

  const friendGroups = friendGroupsRepo(db);
  const mpTcg = "tcgplayer" as const;
  const tcgGroupId = 80_101;
  const ctGroupId = 80_102;

  let collectionId = "";
  let groupCollectionId = "";
  let groupId = "";

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
          marketplace: mpTcg,
          groupId: tcgGroupId,
          name: "VH TCG",
          abbreviation: null,
        },
        { marketplace: "cardtrader", groupId: ctGroupId, name: "VH CT", abbreviation: null },
      ])
      .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
      .execute();

    const skuRows = await db
      .insertInto("marketplaceProducts")
      .values([
        {
          marketplace: mpTcg,
          groupId: tcgGroupId,
          externalId: 91_001,
          productName: "VH Normal",
          finish: "normal",
          language: null,
        },
        {
          marketplace: mpTcg,
          groupId: tcgGroupId,
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

    const cheapSku = skuRows.find((r) => r.marketplace === mpTcg && r.finish === "normal")!;
    const bogusSku = skuRows.find((r) => r.marketplace === mpTcg && r.finish === "foil")!;
    const ctSku = skuRows.find((r) => r.marketplace === "cardtrader")!;

    await db
      .insertInto("marketplaceProductVariants")
      .values([
        { marketplaceProductId: cheapSku.id, printingId: normalPrintingId },
        { marketplaceProductId: bogusSku.id, printingId: normalPrintingId },
        { marketplaceProductId: ctSku.id, printingId: ctPrintingId },
      ])
      .execute();

    await db
      .insertInto("marketplaceProductPrices")
      .values([
        { marketplaceProductId: cheapSku.id, recordedAt: dayOffset(3), marketCents: 100 },
        { marketplaceProductId: cheapSku.id, recordedAt: dayOffset(0), marketCents: 100 },
        { marketplaceProductId: bogusSku.id, recordedAt: dayOffset(3), marketCents: 10_000 },
        { marketplaceProductId: bogusSku.id, recordedAt: dayOffset(0), marketCents: 10_000 },
        {
          marketplaceProductId: ctSku.id,
          recordedAt: dayOffset(3),
          lowCents: 800,
          zeroLowCents: 250,
        },
        { marketplaceProductId: ctSku.id, recordedAt: dayOffset(0), lowCents: 900 },
      ])
      .execute();

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
      WHERE (marketplace, group_id) IN ((${mpTcg}, ${tcgGroupId}), ('cardtrader', ${ctGroupId}))
    `.execute(db);
    await db.deleteFrom("printings").where("id", "in", [normalPrintingId, ctPrintingId]).execute();
    await repo.refreshLatestPrices();
  });

  it("ends the series on the same value the Stats card shows", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpTcg,
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });
    const values = await repo.collectionValues([collectionId], mpTcg);

    const last = series.at(-1);
    expect(last).toBeDefined();
    expect(last!.valueCents).toBe(values.get(collectionId)!.totalValueCents);
  });

  it("ends the series on the collection's actual copy count", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpTcg,
      collectionIds: [collectionId],
      cutoff: null,
      scope: {},
    });

    expect(series.at(-1)!.copyCount).toBe(3);
  });

  it("leaves group-collection copies out of the all-collections total", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpTcg,
      collectionIds: null,
      cutoff: null,
      scope: {},
    });

    expect(series.at(-1)!.copyCount).toBe(3);
  });

  it("counts group copies when that collection is the one selected", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpTcg,
      collectionIds: [groupCollectionId],
      cutoff: null,
      scope: {},
    });
    const value = await repo.singleCollectionValue(groupCollectionId, mpTcg);

    expect(series.at(-1)!.copyCount).toBe(1);
    expect(series.at(-1)!.valueCents).toBe(value!.totalValueCents);
  });

  it("spans the whole requested range even with no events inside it", async () => {
    const series = await repo.collectionValueTimeSeries({
      userId,
      marketplace: mpTcg,
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
      marketplace: mpTcg,
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

  it("prices a printing from its cheapest bound SKU, not an arbitrary one", async () => {
    const row = await db
      .selectFrom("mvLatestPrintingPrices")
      .select("headlineCents")
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpTcg)
      .executeTakeFirstOrThrow();

    expect(row.headlineCents).toBe(100);
  });

  it("returns the same total on repeated calls", async () => {
    const runs = await Promise.all(
      [0, 1, 2].map(async () => {
        const series = await repo.collectionValueTimeSeries({
          userId,
          marketplace: mpTcg,
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

    expect(row.headlineCents).toBe(250);
  });

  it("keeps the latest view equal to the daily view's most recent day", async () => {
    const daily = await db
      .selectFrom("mvDailyPrintingPrices")
      .select(["headlineCents"])
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpTcg)
      .orderBy("day", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    const latest = await db
      .selectFrom("mvLatestPrintingPrices")
      .select("headlineCents")
      .where("printingId", "=", normalPrintingId)
      .where("marketplace", "=", mpTcg)
      .executeTakeFirstOrThrow();

    expect(latest.headlineCents).toBe(daily.headlineCents);
  });
});
