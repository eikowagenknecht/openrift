import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import type { ListRule } from "@openrift/shared";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import {
  acceptTrade,
  cancelTrade,
  completeTrade,
  createTrade,
  declineTrade,
  setTradeQuantity,
  skipTradeSync,
  applyTradeSync,
} from "../services/card-trades.js";
import { disposeCopies, moveCopies } from "../services/copies.js";
import { CARD_FURY_UNIT, PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";

const GIVER_ID = "a0000000-0054-4000-a000-000000000001";
const RECEIVER_ID = "a0000000-0055-4000-a000-000000000001";
const OUTSIDER_ID = "a0000000-0056-4000-a000-000000000001";
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID, OUTSIDER_ID];

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("cardTradesRepo (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const transact = createTransact(db);
  const groupsRepo = friendGroupsRepo(db);

  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    for (const id of ALL_USER_IDS) {
      await db
        .insertInto("users")
        .values({
          id,
          email: `repo-${id.slice(11, 15)}@test.com`,
          name: "Test User",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
  });

  afterAll(async () => {
    // Deleting the trades first (cascading card_trade_copies), then groups,
    // lists, copies and collections by owner cleans up everything this file
    // created, including receiver-sync copies and auto-created inboxes.
    await db
      .deleteFrom("cardTrades")
      .where((eb) =>
        eb.or([eb("giverUserId", "in", ALL_USER_IDS), eb("receiverUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    await db.deleteFrom("lists").where("userId", "in", ALL_USER_IDS).execute();
    // Copies must go before their collections — a trigger blocks deleting a
    // collection that still has copies. Ownership is by collection now (no userId).
    await db
      .deleteFrom("copies")
      .where(
        "collectionId",
        "in",
        db.selectFrom("collections").select("id").where("userId", "in", ALL_USER_IDS),
      )
      .execute();
    await db.deleteFrom("collections").where("userId", "in", ALL_USER_IDS).execute();
    // Restore the users for any later test file that reuses these ids.
    for (const id of ALL_USER_IDS) {
      await db
        .insertInto("users")
        .values({
          id,
          email: `repo-${id.slice(11, 15)}@test.com`,
          name: "Test User",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
  });

  async function uniqueSlug(): Promise<string> {
    return `ct-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  async function collectionFor(userId: string): Promise<string> {
    const existing = await db
      .selectFrom("collections")
      .select("id")
      .where("userId", "=", userId)
      .where("isInbox", "=", false)
      .executeTakeFirst();
    if (existing) {
      return existing.id;
    }
    const created = await db
      .insertInto("collections")
      .values({
        userId,
        name: "Trade Test Binder",
        isInbox: false,
        sortOrder: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  }

  /**
   * Builds a live match: GIVER owns `copyCount` shared copies of PRINTING_1 on a
   * trade list; RECEIVER wishes `wishQuantity` of that printing (defaults to
   * `copyCount`); both shared with a fresh group.
   * @returns The group, the receiver's wish entry, and the giver's copy ids.
   */
  async function setupMatch(copyCount: number, wishQuantity: number = copyCount) {
    const slug = await uniqueSlug();
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Trade Test Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, RECEIVER_ID, "member");

    const wish = await db
      .insertInto("lists")
      .values({ userId: RECEIVER_ID, name: "Wants", intent: "wish", kind: "printing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const wishEntry = await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: RECEIVER_ID,
        kind: "printing",
        printingId: PRINTING_1.id,
        quantity: wishQuantity,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await groupsRepo.share(group.id, wish.id, RECEIVER_ID);

    const tradeList = await db
      .insertInto("lists")
      .values({ userId: GIVER_ID, name: "Haves", intent: "trade", kind: "copy" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const collectionId = await collectionFor(GIVER_ID);
    const copyIds: string[] = [];
    for (let index = 0; index < copyCount; index += 1) {
      const copy = await db
        .insertInto("copies")
        .values({ printingId: PRINTING_1.id, collectionId })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("listEntries")
        .values({
          listId: tradeList.id,
          userId: GIVER_ID,
          kind: "copy",
          copyId: copy.id,
          quantity: 1,
        })
        .execute();
      copyIds.push(copy.id);
    }
    await groupsRepo.share(group.id, tradeList.id, GIVER_ID);

    return { group, wishEntryId: wishEntry.id, tradeListId: tradeList.id, copyIds };
  }

  /**
   * Like {@link setupMatch}, but the giver offers the copies via a *dynamic
   * trade rule* (ADR-034, keep 0 per card) instead of manual `copy` entries —
   * the regression case where the reservable-supply count must still see them.
   * The copies live in a fresh collection scoped by the rule, so this suite's
   * shared-DB accumulation can't leak extra copies into the match.
   * @returns The group and the giver's copy ids.
   */
  async function setupRuleMatch(copyCount: number, wishQuantity: number = copyCount) {
    const slug = await uniqueSlug();
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Rule Trade Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, RECEIVER_ID, "member");

    const wish = await db
      .insertInto("lists")
      .values({ userId: RECEIVER_ID, name: "Wants", intent: "wish", kind: "printing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: RECEIVER_ID,
        kind: "printing",
        printingId: PRINTING_1.id,
        quantity: wishQuantity,
      })
      .execute();
    await groupsRepo.share(group.id, wish.id, RECEIVER_ID);

    // A collection dedicated to this match, so the rule (scoped to it) offers
    // only these copies regardless of what other tests left in the giver's binder.
    const collection = await db
      .insertInto("collections")
      .values({ userId: GIVER_ID, name: "Auto Binder", isInbox: false, sortOrder: 2 })
      .returning("id")
      .executeTakeFirstOrThrow();
    const copyIds: string[] = [];
    for (let index = 0; index < copyCount; index += 1) {
      const copy = await db
        .insertInto("copies")
        .values({ printingId: PRINTING_1.id, collectionId: collection.id })
        .returning("id")
        .executeTakeFirstOrThrow();
      copyIds.push(copy.id);
    }

    // No manual `copy` entries — a keep-0 trade rule offers every owned copy in
    // the collection. This is exactly the shape that used to read as 0 supply.
    const tradeRule: ListRule = {
      kind: "trade",
      filter: EMPTY_CARD_FILTERS,
      collectionIds: [collection.id],
      keepPerCard: { mode: "fixed", n: 0 },
      excludeCopyIds: [],
    };
    const tradeList = await db
      .insertInto("lists")
      .values({
        userId: GIVER_ID,
        name: "Auto Haves",
        intent: "trade",
        kind: "copy",
        rules: sql<ListRule[]>`${JSON.stringify([tradeRule])}::text::jsonb`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await groupsRepo.share(group.id, tradeList.id, GIVER_ID);

    return { group, copyIds };
  }

  function availableForReceiver(groupId: string): Promise<number> {
    return repos.friendGroupMatches
      .othersHaveYourWants({ groupId, viewerUserId: RECEIVER_ID, counterpartyUserId: GIVER_ID })
      .then((rows) => rows.filter((row) => row.printingId === PRINTING_1.id).length);
  }

  function request(group: { slug: string }, quantity: number) {
    return createTrade(repos, {
      callerUserId: RECEIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity,
    });
  }

  /**
   * Counts PRINTING_1 copies the receiver owns (ownership is by collection now).
   * The suite shares one DB with afterAll-only cleanup, so copies accumulate
   * across tests — assert deltas around an apply rather than absolute totals.
   * @returns The number of receiver-owned PRINTING_1 copies.
   */
  async function countReceiverCopiesOfP1(): Promise<number> {
    const rows = await db
      .selectFrom("copies")
      .innerJoin("collections", "collections.id", "copies.collectionId")
      .select("copies.id")
      .where("collections.userId", "=", RECEIVER_ID)
      .where("copies.printingId", "=", PRINTING_1.id)
      .execute();
    return rows.length;
  }

  it("a pending request reserves nothing — matched copies still appear", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    expect(trade.status).toBe("pending");
    expect(trade.role).toBe("receiver");
    expect(trade.initiator).toBe("receiver");
    expect(trade.cardId).toBe(CARD_FURY_UNIT.id);
    expect(await availableForReceiver(group.id)).toBe(2);
  });

  it("accept pins exactly quantity copies and hides them; the remainder still matches", async () => {
    const { group } = await setupMatch(3);
    const trade = await request(group, 2);
    const reserved = await acceptTrade(transact, trade.id, GIVER_ID);
    expect(reserved.status).toBe("reserved");
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(2);
    // 3 shared copies − 2 reserved = 1 still matchable for everyone.
    expect(await availableForReceiver(group.id)).toBe(1);
  });

  it("rejects trading more than the wanting side wants", async () => {
    // Giver has 2 shared copies but the receiver only wishes 1.
    const { group } = await setupMatch(2, 1);
    await expect(request(group, 2)).rejects.toMatchObject({ status: 400 });
    // Requesting up to the wished amount is fine.
    const trade = await request(group, 1);
    expect(trade.status).toBe("pending");
  });

  it("auto-cancels a pending request whose underlying copies vanished before acceptance", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    // The giver removes the underlying copy from the group before acceptance
    // (fk cascade also drops its tradelist entry). The basis is gone, so accept
    // resolves the trade to cancelled (system actor) rather than 409-ing.
    await db.deleteFrom("copies").where("id", "=", copyIds[0]).execute();
    const result = await acceptTrade(transact, trade.id, GIVER_ID);
    expect(result.status).toBe("cancelled");
    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.lastActorUserId).toBeNull();
  });

  it("offers and accepts a trade whose supply is a dynamic trade rule, not manual copies (ADR-034)", async () => {
    const { group } = await setupRuleMatch(1);
    // Sanity: the rule-derived copy shows as available supply in the match view.
    expect(await availableForReceiver(group.id)).toBe(1);

    // Regression: the giver offers their single rule-offered copy. This used to
    // 409 with "Only 0 copies are still available" because the supply count only
    // looked at manual `copy` list entries and never evaluated the rule.
    const trade = await createTrade(repos, {
      callerUserId: GIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: RECEIVER_ID,
      role: "giver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    expect(trade.status).toBe("pending");
    expect(trade.initiator).toBe("giver");

    // The recipient accepts; the rule-offered copy is pinnable and reserves.
    const reserved = await acceptTrade(transact, trade.id, RECEIVER_ID);
    expect(reserved.status).toBe("reserved");
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(1);
    // Reserved copy drops out of the rule-derived supply too.
    expect(await availableForReceiver(group.id)).toBe(0);
  });

  it("keeps a request pending when copies still exist but are reserved by a competing trade", async () => {
    // Two members both want the giver's single shared copy.
    const slug = await uniqueSlug();
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Stack Test", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, RECEIVER_ID, "member");
    await groupsRepo.addMember(group.id, OUTSIDER_ID, "member");

    for (const wisherId of [RECEIVER_ID, OUTSIDER_ID]) {
      const wish = await db
        .insertInto("lists")
        .values({ userId: wisherId, name: "Wants", intent: "wish", kind: "printing" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("listEntries")
        .values({
          listId: wish.id,
          userId: wisherId,
          kind: "printing",
          printingId: PRINTING_1.id,
          quantity: 1,
        })
        .execute();
      await groupsRepo.share(group.id, wish.id, wisherId);
    }

    const tradeList = await db
      .insertInto("lists")
      .values({ userId: GIVER_ID, name: "Haves", intent: "trade", kind: "copy" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const collectionId = await collectionFor(GIVER_ID);
    const copy = await db
      .insertInto("copies")
      .values({ printingId: PRINTING_1.id, collectionId })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("listEntries")
      .values({
        listId: tradeList.id,
        userId: GIVER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await groupsRepo.share(group.id, tradeList.id, GIVER_ID);

    const tradeForReceiver = await createTrade(repos, {
      callerUserId: RECEIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    const tradeForOutsider = await createTrade(repos, {
      callerUserId: OUTSIDER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });

    // The giver accepts the first; the only copy is now reserved.
    await acceptTrade(transact, tradeForReceiver.id, GIVER_ID);
    // Accepting the second 409s (copy reserved) and the request stays pending —
    // the basis still exists, it's just exhausted.
    await expect(acceptTrade(transact, tradeForOutsider.id, GIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
    const outsiderRow = await repos.cardTrades.getById(tradeForOutsider.id);
    expect(outsiderRow?.status).toBe("pending");
  });

  it("receiver sync can only be applied once", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, RECEIVER_ID);
    const receiverCopiesBefore = await countReceiverCopiesOfP1();
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    // A second apply (double-click / retry) is rejected by the guarded UPDATE.
    await expect(applyTradeSync(transact, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
    // Exactly one copy was added, not two (the rejected retry adds nothing).
    expect((await countReceiverCopiesOfP1()) - receiverCopiesBefore).toBe(1);
  });

  it("a completed trade can no longer be cancelled (transition guard)", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, GIVER_ID);
    await expect(cancelTrade(transact, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.status).toBe("completed");
  });

  it("decline and cancel release reserved copies back into matching", async () => {
    const declined = await setupMatch(1);
    const declinedTrade = await request(declined.group, 1);
    await declineTrade(transact, declinedTrade.id, GIVER_ID);
    expect(await availableForReceiver(declined.group.id)).toBe(1);

    const cancelled = await setupMatch(1);
    const cancelledTrade = await request(cancelled.group, 1);
    await acceptTrade(transact, cancelledTrade.id, GIVER_ID);
    expect(await availableForReceiver(cancelled.group.id)).toBe(0);
    await cancelTrade(transact, cancelledTrade.id, RECEIVER_ID);
    expect(await availableForReceiver(cancelled.group.id)).toBe(1);
    expect(await repos.cardTrades.listReservedCopyIds(cancelledTrade.id)).toHaveLength(0);
  });

  it("uq_card_trades_live rejects a second live trade; a new one is allowed once terminal", async () => {
    const { group } = await setupMatch(2);
    const first = await request(group, 1);
    await expect(request(group, 1)).rejects.toMatchObject({ status: 409 });
    await declineTrade(transact, first.id, GIVER_ID);
    // Now a fresh request is allowed.
    const second = await request(group, 1);
    expect(second.status).toBe("pending");
  });

  it("setTradeQuantity resizes a pending request and raises the wish entry to match", async () => {
    // Receiver wishes 1 but the giver has 3 — claiming more copies bumps both the
    // trade and the wish entry so sync accounting stays valid.
    const { group, wishEntryId } = await setupMatch(3, 1);
    const trade = await request(group, 1);
    const resized = await setTradeQuantity(transact, trade.id, RECEIVER_ID, 3);
    expect(resized.quantity).toBe(3);
    const wishEntry = await repos.lists.getEntryByIdForUser(wishEntryId, RECEIVER_ID);
    expect(wishEntry?.quantity).toBe(3);
    // Lowering again leaves the wish entry where it was (we never want less).
    const lowered = await setTradeQuantity(transact, trade.id, RECEIVER_ID, 2);
    expect(lowered.quantity).toBe(2);
    const wishAfter = await repos.lists.getEntryByIdForUser(wishEntryId, RECEIVER_ID);
    expect(wishAfter?.quantity).toBe(3);
  });

  it("setTradeQuantity caps at the giver's available supply", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    await expect(setTradeQuantity(transact, trade.id, RECEIVER_ID, 3)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("setTradeQuantity rejects a quantity below 1 (release the last copy via cancel)", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    await expect(setTradeQuantity(transact, trade.id, RECEIVER_ID, 0)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("setTradeQuantity is initiator-only and pending-only", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    // The giver (non-initiator) cannot resize the request.
    await expect(setTradeQuantity(transact, trade.id, GIVER_ID, 2)).rejects.toMatchObject({
      status: 403,
    });
    // An outsider cannot either.
    await expect(setTradeQuantity(transact, trade.id, OUTSIDER_ID, 2)).rejects.toMatchObject({
      status: 403,
    });
    // Once reserved it can no longer be resized.
    await acceptTrade(transact, trade.id, GIVER_ID);
    await expect(setTradeQuantity(transact, trade.id, RECEIVER_ID, 2)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("only the non-initiator can accept/decline; only the initiator can cancel a pending", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    // Initiator (receiver) cannot accept their own request.
    await expect(acceptTrade(transact, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 403,
    });
    // Outsider cannot act.
    await expect(acceptTrade(transact, trade.id, OUTSIDER_ID)).rejects.toMatchObject({
      status: 403,
    });
    // Non-initiator (giver) cannot cancel a pending request.
    await expect(cancelTrade(transact, trade.id, GIVER_ID)).rejects.toMatchObject({ status: 403 });
    // Initiator can cancel.
    const cancelled = await cancelTrade(transact, trade.id, RECEIVER_ID);
    expect(cancelled.status).toBe("cancelled");
  });

  it("either party can mark a reserved trade traded", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const completed = await completeTrade(transact, trade.id, RECEIVER_ID);
    expect(completed.status).toBe("completed");
  });

  it("complete → giver Apply disposes copies (removed event + tradelist entry gone)", async () => {
    const { group, tradeListId, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, GIVER_ID);
    await applyTradeSync(transact, trade.id, GIVER_ID);

    const survivingCopy = await db
      .selectFrom("copies")
      .select("id")
      .where("id", "=", copyIds[0])
      .executeTakeFirst();
    expect(survivingCopy).toBeUndefined();

    const removedEvent = await db
      .selectFrom("collectionEvents")
      .select("id")
      .where("userId", "=", GIVER_ID)
      .where("action", "=", "removed")
      .where("printingId", "=", PRINTING_1.id)
      .executeTakeFirst();
    expect(removedEvent).toBeDefined();

    const orphanEntry = await db
      .selectFrom("listEntries")
      .select("id")
      .where("listId", "=", tradeListId)
      .where("copyId", "=", copyIds[0])
      .executeTakeFirst();
    expect(orphanEntry).toBeUndefined();

    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(0);
  });

  it("complete → receiver Apply adds copies and decrements the wish entry", async () => {
    const { group, wishEntryId } = await setupMatch(2);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, RECEIVER_ID);
    const receiverCopiesBefore = await countReceiverCopiesOfP1();
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    const receiverCopiesAfter = await countReceiverCopiesOfP1();
    expect(receiverCopiesAfter - receiverCopiesBefore).toBe(1);

    const addedEvent = await db
      .selectFrom("collectionEvents")
      .select("id")
      .where("userId", "=", RECEIVER_ID)
      .where("action", "=", "added")
      .where("printingId", "=", PRINTING_1.id)
      .executeTakeFirst();
    expect(addedEvent).toBeDefined();

    const wishEntry = await db
      .selectFrom("listEntries")
      .select("quantity")
      .where("id", "=", wishEntryId)
      .executeTakeFirst();
    expect(wishEntry?.quantity).toBe(1);
  });

  it("giver Skip resolves without disposing, but releases the reservation", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, GIVER_ID);
    await skipTradeSync(transact, trade.id, GIVER_ID);

    const stillThere = await db
      .selectFrom("copies")
      .select("id")
      .where("id", "=", copyIds[0])
      .executeTakeFirst();
    expect(stillThere).toBeDefined();
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(0);
  });

  it("disposeCopies refuses a reserved copy; moveCopies succeeds; applyGiverSync disposes", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    await expect(disposeCopies(transact, GIVER_ID, [copyIds[0]])).rejects.toMatchObject({
      status: 409,
    });

    // Moving a reserved copy between collections is allowed.
    const otherCollection = await db
      .insertInto("collections")
      .values({
        userId: GIVER_ID,
        name: "Move Target",
        isInbox: false,
        sortOrder: 2,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      moveCopies(repos, transact, GIVER_ID, [copyIds[0]], otherCollection.id),
    ).resolves.toBeUndefined();

    // Sync (which releases first) disposes successfully.
    await completeTrade(transact, trade.id, GIVER_ID);
    await expect(applyTradeSync(transact, trade.id, GIVER_ID)).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("expirePending moves only pending rows past 24h to expired", async () => {
    const fresh = await setupMatch(1);
    const freshTrade = await request(fresh.group, 1);

    const stale = await setupMatch(1);
    const staleTrade = await request(stale.group, 1);
    await db
      .updateTable("cardTrades")
      .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where("id", "=", staleTrade.id)
      .execute();

    const reservedSetup = await setupMatch(1);
    const reservedTrade = await request(reservedSetup.group, 1);
    await acceptTrade(transact, reservedTrade.id, GIVER_ID);
    await db
      .updateTable("cardTrades")
      .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where("id", "=", reservedTrade.id)
      .execute();

    const result = await repos.cardTrades.expirePending();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const staleRow = await repos.cardTrades.getById(staleTrade.id);
    expect(staleRow?.status).toBe("expired");
    expect(staleRow?.lastActorUserId).toBeNull();

    const freshRow = await repos.cardTrades.getById(freshTrade.id);
    expect(freshRow?.status).toBe("pending");

    const reservedRow = await repos.cardTrades.getById(reservedTrade.id);
    expect(reservedRow?.status).toBe("reserved");
  });

  it("leaving cancels the departing member's live trades and releases their copies", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    expect(await availableForReceiver(group.id)).toBe(0);

    await repos.cardTrades.cancelForDepartingMember(group.id, RECEIVER_ID);
    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.status).toBe("cancelled");
    expect(await availableForReceiver(group.id)).toBe(1);
  });

  it("action-needed counts a pending request for the recipient, not its initiator", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);

    // The giver is the non-initiator: they must accept or decline, so it counts.
    const giverCounts = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    expect(giverCounts.find((entry) => entry.groupId === group.id)?.count).toBe(1);

    // The receiver initiated, so their only action is "cancel" — not counted.
    const receiverCounts = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(receiverCounts.find((entry) => entry.groupId === group.id)).toBeUndefined();

    // Accepting makes it reserved (giver's action becomes "complete") — no longer counted.
    await acceptTrade(transact, trade.id, GIVER_ID);
    const giverAfterAccept = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    expect(giverAfterAccept.find((entry) => entry.groupId === group.id)).toBeUndefined();
  });

  it("action-needed counts a completed trade for whichever side hasn't applied sync", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await completeTrade(transact, trade.id, GIVER_ID);
    const inGroup = (counts: { groupId: string; count: number }[]) =>
      counts.find((entry) => entry.groupId === group.id);

    // Completion leaves both sides owing their own collection sync (apply-sync).
    const giverCompleted = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    const receiverCompleted = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(inGroup(giverCompleted)?.count).toBe(1);
    expect(inGroup(receiverCompleted)?.count).toBe(1);

    // After the giver applies their sync, only the receiver still owes one.
    await applyTradeSync(transact, trade.id, GIVER_ID);
    const giverSynced = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    const receiverSynced = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(inGroup(giverSynced)).toBeUndefined();
    expect(inGroup(receiverSynced)?.count).toBe(1);
  });
});
