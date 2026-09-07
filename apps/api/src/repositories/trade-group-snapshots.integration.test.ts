import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toCardTradeResponse } from "../lib/card-trade-presenters.js";
import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { cardTradesRepo } from "./card-trades.js";
import { friendGroupsRepo } from "./friend-groups.js";

// `trg_snapshot_deleted_group_names` releases pins, cancels live trades, and
// swaps each trade's group reference for the group's name, so members keep a
// readable record after the group is gone.
// One deletion in `beforeAll`; each test reads a different part of the result.
const MEMBER_A_ID = crypto.randomUUID();
const MEMBER_B_ID = crypto.randomUUID();
const ALL_IDS = [MEMBER_A_ID, MEMBER_B_ID];
const GROUP_NAME = "Bandle City Playtest";

const ctx = createDbContext(MEMBER_A_ID);

describe.skipIf(!ctx)("deleted-group name snapshots (integration)", () => {
  const { db } = ctx!;
  const groupsRepo = friendGroupsRepo(db);
  const trades = cardTradesRepo(db);

  let groupId: string;
  let survivingGroupId: string;
  let completedTradeId: string;
  let reservedTradeId: string;
  let collectionId: string;
  let copyId: string;

  beforeAll(async () => {
    for (const id of ALL_IDS) {
      await seedTestUser(db, { id });
    }

    const group = await groupsRepo.createWithOwner(
      {
        slug: `snapshot-252-${MEMBER_A_ID.slice(0, 8)}`,
        name: GROUP_NAME,
        description: null,
        code: null,
      },
      MEMBER_A_ID,
    );
    groupId = group.id;
    await groupsRepo.addMember(groupId, MEMBER_B_ID, "member");

    // Survives the deletion below, so a later test can push a live group at
    // a trade that already carries a snapshot.
    const surviving = await groupsRepo.createWithOwner(
      {
        slug: `snapshot-252-live-${MEMBER_A_ID.slice(0, 8)}`,
        name: "Still Here",
        description: null,
        code: null,
      },
      MEMBER_A_ID,
    );
    survivingGroupId = surviving.id;

    const completed = await db
      .insertInto("cardTrades")
      .values({
        groupId,
        giverUserId: MEMBER_A_ID,
        receiverUserId: MEMBER_B_ID,
        initiator: "receiver",
        printingId: PRINTING_1.id,
        cardId: PRINTING_1.cardId,
        quantity: 1,
        status: "completed",
        acceptedAt: new Date("2026-03-01T00:00:00Z"),
        completedAt: new Date("2026-03-02T00:00:00Z"),
        giverSyncAppliedAt: new Date("2026-03-02T00:00:00Z"),
        receiverSyncAppliedAt: new Date("2026-03-02T00:00:00Z"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    completedTradeId = completed.id;

    // A reserved trade holds pins; the trigger releases them explicitly and does not delete the trade.
    const collection = await db
      .insertInto("collections")
      .values({ userId: MEMBER_A_ID, name: "Snapshot 252 binder" })
      .returning("id")
      .executeTakeFirstOrThrow();
    collectionId = collection.id;
    const copy = await db
      .insertInto("copies")
      .values({ collectionId, printingId: PRINTING_1.id })
      .returning("id")
      .executeTakeFirstOrThrow();
    copyId = copy.id;

    const reserved = await db
      .insertInto("cardTrades")
      .values({
        groupId,
        giverUserId: MEMBER_B_ID,
        receiverUserId: MEMBER_A_ID,
        initiator: "giver",
        printingId: PRINTING_1.id,
        cardId: PRINTING_1.cardId,
        quantity: 1,
        status: "reserved",
        acceptedAt: new Date("2026-03-05T00:00:00Z"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    reservedTradeId = reserved.id;
    await db.insertInto("cardTradeCopies").values({ tradeId: reservedTradeId, copyId }).execute();

    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("cardTrades")
      .where("id", "in", [completedTradeId, reservedTradeId])
      .execute();
    await db.deleteFrom("copies").where("id", "=", copyId).execute();
    await db.deleteFrom("collections").where("id", "=", collectionId).execute();
    await db.deleteFrom("friendGroups").where("id", "=", survivingGroupId).execute();
    await db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
  });

  it("keeps a completed trade and snapshots the group name", async () => {
    const trade = await db
      .selectFrom("cardTrades")
      .select(["status", "groupId", "groupName"])
      .where("id", "=", completedTradeId)
      .executeTakeFirst();
    expect(trade).toBeDefined();
    expect(trade?.status).toBe("completed");
    expect(trade?.groupId).toBeNull();
    expect(trade?.groupName).toBe(GROUP_NAME);
  });

  it("cancels the live trade the group held and snapshots it too", async () => {
    const trade = await db
      .selectFrom("cardTrades")
      .select(["status", "closedAt", "expiresAt", "groupId", "groupName"])
      .where("id", "=", reservedTradeId)
      .executeTakeFirst();
    expect(trade?.status).toBe("cancelled");
    expect(trade?.closedAt).not.toBeNull();
    expect(trade?.expiresAt).toBeNull();
    expect(trade?.groupId).toBeNull();
    expect(trade?.groupName).toBe(GROUP_NAME);
  });

  it("releases the pins the cancelled trade held", async () => {
    const pins = await db
      .selectFrom("cardTradeCopies")
      .select(["copyId"])
      .where("tradeId", "=", reservedTradeId)
      .execute();
    expect(pins).toEqual([]);
    const copy = await db
      .selectFrom("copies")
      .select(["id"])
      .where("id", "=", copyId)
      .executeTakeFirst();
    expect(copy?.id).toBe(copyId);
  });

  it("still shows the finished trade to both members, named", async () => {
    const seen = await Promise.all(
      ALL_IDS.map(async (userId) => {
        const rows = await trades.listDtoRowsForUser(userId, {});
        const listed = rows.map((row) => toCardTradeResponse(row, userId));
        return listed.find((trade) => trade.id === completedTradeId);
      }),
    );
    expect(seen.filter((row) => row !== undefined)).toHaveLength(ALL_IDS.length);
    for (const row of seen) {
      expect(row?.groupId).toBeNull();
      expect(row?.groupSlug).toBeNull();
      expect(row?.groupName).toBe(GROUP_NAME);
    }
  });

  it("refuses a trade that names both a group and a snapshot", async () => {
    await expect(
      db
        .updateTable("cardTrades")
        .set({ groupId: survivingGroupId })
        .where("id", "=", reservedTradeId)
        .execute(),
    ).rejects.toThrow();
  });

  it("refuses a trade that names neither", async () => {
    await expect(
      db
        .updateTable("cardTrades")
        .set({ groupName: null })
        .where("id", "=", completedTradeId)
        .execute(),
    ).rejects.toThrow();
  });
});
