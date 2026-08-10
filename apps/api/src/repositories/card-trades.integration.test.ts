import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import type { ListRule } from "@openrift/shared";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import {
  acceptTrade,
  autoCancelUnfillablePendingTrades,
  cancelTrade,
  createTrade,
  declineTrade,
  listTradeCopyOptions,
  setTradeQuantity,
  skipTradeSync,
  applyTradeSync,
} from "../services/card-trades.js";
import { disposeCopies, moveCopies } from "../services/copies.js";
import { CARD_FURY_UNIT, PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";

const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();
/** Never party to a trade in this file, so their annotation list stays empty. */
const BYSTANDER_ID = crypto.randomUUID();
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID, OUTSIDER_ID, BYSTANDER_ID];

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("cardTradesRepo (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const transact = createTransact(db);
  const groupsRepo = friendGroupsRepo(db);

  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    for (const id of ALL_USER_IDS) {
      await seedTestUser(db, { id });
    }
  });

  beforeEach(async () => {
    // Every test builds its own match, but the demand-side netting reads the
    // receiver's live trades globally: a reserved or completed-unsynced trade
    // a previous test left behind (cleanup is afterAll-only) would net away the
    // next test's freshly seeded want for the same printing. Clear this file's
    // trades between tests (cascades card_trade_copies, releasing pins).
    await db
      .deleteFrom("cardTrades")
      .where((eb) =>
        eb.or([eb("giverUserId", "in", ALL_USER_IDS), eb("receiverUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
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
    // Users are file-owned; delete them last, once nothing references them.
    await db.deleteFrom("users").where("id", "in", ALL_USER_IDS).execute();
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

  /** Records a PSA 10 on a copy, so the candidates stop being interchangeable. */
  async function gradeCopy(copyId: string): Promise<void> {
    await db
      .updateTable("copies")
      .set({ grader: "psa", grade: 10 })
      .where("id", "=", copyId)
      .execute();
  }

  /** @returns The id of a giver-owned PRINTING_1 copy that is on no shared list. */
  async function unlistedGiverCopy(): Promise<string> {
    const collectionId = await collectionFor(GIVER_ID);
    const row = await db
      .insertInto("copies")
      .values({ printingId: PRINTING_1.id, collectionId })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** @returns The trade's current status, read straight from the row. */
  async function statusOf(tradeId: string): Promise<string | undefined> {
    const row = await repos.cardTrades.getById(tradeId);
    return row?.status;
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
   * The giver's "I have this, want it?" offer, so the initiator is the giver.
   * @returns The created trade DTO.
   */
  function offer(group: { slug: string }, toUserId: string, quantity: number) {
    return createTrade(repos, {
      callerUserId: GIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: toUserId,
      role: "giver",
      printingId: PRINTING_1.id,
      quantity,
    });
  }

  /** Gives an existing member of `groupId` a shared wish for PRINTING_1. */
  async function shareWish(groupId: string, userId: string, quantity: number): Promise<void> {
    const wish = await db
      .insertInto("lists")
      .values({ userId, name: "Wants", intent: "wish", kind: "printing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("listEntries")
      .values({ listId: wish.id, userId, kind: "printing", printingId: PRINTING_1.id, quantity })
      .execute();
    await groupsRepo.share(groupId, wish.id, userId);
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

  it("a firm reserved trade nets the receiver's want across groups", async () => {
    // The same pair matched in two groups on the same printing. Once the trade
    // in the first group is reserved, the second group's identical suggestion
    // must stop advertising — its supply copy is unreserved, but the want is
    // already covered by a firm promise.
    const first = await setupMatch(1);
    const second = await setupMatch(1);
    expect(await availableForReceiver(first.group.id)).toBe(1);
    expect(await availableForReceiver(second.group.id)).toBe(1);

    const trade = await request(first.group, 1);
    // A pending request is a bid, not a promise — the twin suggestion stays.
    expect(await availableForReceiver(second.group.id)).toBe(1);

    await acceptTrade(transact, trade.id, GIVER_ID);
    expect(await availableForReceiver(second.group.id)).toBe(0);

    // Reserved with the receiver's side unsettled still nets: the card is
    // promised, just not in hand yet.
    expect(await availableForReceiver(second.group.id)).toBe(0);

    // Settling the receiver's side ends the promise window. The second group's
    // own manual wish entry still says 1 (manual lists don't self-clean), so
    // its suggestion legitimately returns; dynamic netOwned wishes recompute
    // from the newly owned copy instead and stay hidden.
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    expect(await availableForReceiver(second.group.id)).toBe(1);
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

  it("accepting one request auto-cancels the competing one the stack can't cover", async () => {
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

    // The giver accepts the first; the only copy is now pinned to it.
    await acceptTrade(transact, tradeForReceiver.id, GIVER_ID);

    // The second request can no longer be filled, so the accept closes it in
    // the same transaction (system actor). It used to sit pending for the whole
    // seven-day TTL, silently 409-ing every time the giver pressed accept.
    const outsiderRow = await repos.cardTrades.getById(tradeForOutsider.id);
    expect(outsiderRow?.status).toBe("cancelled");
    expect(outsiderRow?.lastActorUserId).toBeNull();

    // And accepting it now reports the closed state, not a bare supply error.
    await expect(acceptTrade(transact, tradeForOutsider.id, GIVER_ID)).rejects.toMatchObject({
      status: 409,
      message: "This trade is no longer pending",
    });
  });

  it("receiver sync can only be applied once", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const receiverCopiesBefore = await countReceiverCopiesOfP1();
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    // A second apply (double-click / retry) is rejected by the guarded UPDATE.
    await expect(applyTradeSync(transact, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
    // Exactly one copy was added, not two (the rejected retry adds nothing).
    expect((await countReceiverCopiesOfP1()) - receiverCopiesBefore).toBe(1);
  });

  it("a trade one side has settled can no longer be cancelled", async () => {
    // The giver's settle hard-deletes the copies, so a later cancel could not
    // put them back and would only record a lie (ADR-019, amendment
    // 2026-08-10). The trade stays reserved until the receiver settles too.
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await applyTradeSync(transact, trade.id, GIVER_ID);
    await expect(cancelTrade(transact, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.status).toBe("reserved");
  });

  it("a fully settled trade can no longer be cancelled either", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await applyTradeSync(transact, trade.id, GIVER_ID);
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
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

  it("one side settling leaves the trade reserved; the second one completes it", async () => {
    // Nobody asserts completion. It is derived from both halves being settled,
    // which is what makes a premature "trade done" inexpressible.
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    const afterFirst = await applyTradeSync(transact, trade.id, RECEIVER_ID);
    expect(afterFirst.status).toBe("reserved");

    const afterSecond = await applyTradeSync(transact, trade.id, GIVER_ID);
    expect(afterSecond.status).toBe("completed");
    expect(afterSecond.completedAt).not.toBeNull();
  });

  it("a skip settles a side too, so skip then apply completes the trade", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    const afterSkip = await skipTradeSync(transact, trade.id, GIVER_ID);
    expect(afterSkip.status).toBe("reserved");
    const afterApply = await applyTradeSync(transact, trade.id, RECEIVER_ID);
    expect(afterApply.status).toBe("completed");
  });

  it("countCompletedCardsInGroup sums only completed trades' quantities", async () => {
    const { group } = await setupMatch(3);
    expect(await repos.cardTrades.countCompletedCardsInGroup(group.id)).toBe(0);
    const trade = await request(group, 2);
    await acceptTrade(transact, trade.id, GIVER_ID);
    // Reserved with neither side settled doesn't count toward the lifetime
    // stat: nothing has physically moved yet.
    expect(await repos.cardTrades.countCompletedCardsInGroup(group.id)).toBe(0);
    // The first settle counts it. Waiting for both would permanently undercount
    // every swap whose second side never confirms.
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    expect(await repos.cardTrades.countCompletedCardsInGroup(group.id)).toBe(2);
    // The second settle doesn't double it.
    await applyTradeSync(transact, trade.id, GIVER_ID);
    expect(await repos.cardTrades.countCompletedCardsInGroup(group.id)).toBe(2);
  });

  it("countCompletedCardsByMemberInGroup credits both parties, completed only", async () => {
    const { group } = await setupMatch(3);
    expect(await repos.cardTrades.countCompletedCardsByMemberInGroup(group.id)).toEqual(new Map());
    const trade = await request(group, 2);
    await acceptTrade(transact, trade.id, GIVER_ID);
    // Unsettled reserved trades don't count — same rule as the group-wide stat.
    expect(await repos.cardTrades.countCompletedCardsByMemberInGroup(group.id)).toEqual(new Map());
    await applyTradeSync(transact, trade.id, RECEIVER_ID);
    expect(await repos.cardTrades.countCompletedCardsByMemberInGroup(group.id)).toEqual(
      new Map([
        [GIVER_ID, 2],
        [RECEIVER_ID, 2],
      ]),
    );
  });

  it("giver settle disposes copies (removed event + tradelist entry gone)", async () => {
    const { group, tradeListId, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
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
    await skipTradeSync(transact, trade.id, GIVER_ID);

    const stillThere = await db
      .selectFrom("copies")
      .select("id")
      .where("id", "=", copyIds[0])
      .executeTakeFirst();
    expect(stillThere).toBeDefined();
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(0);
  });

  it("disposeCopies refuses a reserved copy; a personal move succeeds; applyGiverSync disposes", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    await expect(disposeCopies(transact, GIVER_ID, [copyIds[0]])).rejects.toMatchObject({
      status: 409,
    });

    // Moving a reserved copy between the owner's own collections is allowed.
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

    // Settling (which releases the pin first) disposes successfully. The trade
    // stays reserved: the receiver has not settled their half yet.
    await expect(applyTradeSync(transact, trade.id, GIVER_ID)).resolves.toMatchObject({
      status: "reserved",
    });
  });

  it("moveCopies refuses to move a reserved copy into a group collection", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    // A pooled collection owned by the group, not by any single member. It
    // cascades away with the group in afterAll.
    const pooled = await db
      .insertInto("collections")
      .values({
        groupId: group.id,
        name: "Pooled Binder",
        isInbox: false,
        sortOrder: 3,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(
      moveCopies(repos, transact, GIVER_ID, [copyIds[0]], pooled.id),
    ).rejects.toMatchObject({ status: 409 });

    // The copy stayed put, so every other member still sees their own supply.
    const stayed = await db
      .selectFrom("copies")
      .select("collectionId")
      .where("id", "=", copyIds[0])
      .executeTakeFirstOrThrow();
    expect(stayed.collectionId).not.toBe(pooled.id);

    // The same move is fine once the copy is no longer pinned.
    await cancelTrade(transact, trade.id, GIVER_ID);
    await expect(
      moveCopies(repos, transact, GIVER_ID, [copyIds[0]], pooled.id),
    ).resolves.toBeUndefined();

    // Move it back so the group collection is empty when the group cascades.
    const home = await collectionFor(GIVER_ID);
    await moveCopies(repos, transact, GIVER_ID, [copyIds[0]], home);
  });

  it("disposeCopies points a live pin at cancelling the trade", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toHaveLength(1);

    await expect(disposeCopies(transact, GIVER_ID, [copyIds[0]])).rejects.toMatchObject({
      status: 409,
      message: "This card is reserved in an active trade — cancel the trade to free it.",
    });

    // Settling the giver's side releases the pin, and the copy is disposable.
    await skipTradeSync(transact, trade.id, GIVER_ID);
    await expect(disposeCopies(transact, GIVER_ID, [copyIds[0]])).resolves.toBeUndefined();
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

    // The giver is the non-initiator: they must accept or decline, so it counts
    // — and it counts as a response owed, not a swap to confirm.
    const giverCounts = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    expect(giverCounts.find((entry) => entry.groupId === group.id)).toMatchObject({
      count: 1,
      respondCount: 1,
      settleCount: 0,
    });

    // The receiver initiated, so their only action is "cancel" — not counted.
    const receiverCounts = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(receiverCounts.find((entry) => entry.groupId === group.id)).toBeUndefined();

    // Accepting makes it reserved, where the giver's action becomes "settle" —
    // still counted, but in the swap half rather than the response half.
    await acceptTrade(transact, trade.id, GIVER_ID);
    const giverAfterAccept = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    expect(giverAfterAccept.find((entry) => entry.groupId === group.id)).toMatchObject({
      respondCount: 0,
      settleCount: 1,
    });
  });

  it("action-needed counts an unsettled reservation from the moment it is accepted", async () => {
    // No grace period on purpose: two people who swap in person and never touch
    // the app would otherwise be reminded by nothing, leaving the giver's copies
    // pinned out of every match view (ADR-019, amendment 2026-08-10).
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const inGroup = (counts: { groupId: string; count: number }[]) =>
      counts.find((entry) => entry.groupId === group.id);

    const giverReserved = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    const receiverReserved = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(inGroup(giverReserved)).toMatchObject({ count: 1, respondCount: 0, settleCount: 1 });
    expect(inGroup(receiverReserved)).toMatchObject({ count: 1, respondCount: 0, settleCount: 1 });

    // Settling the giver's side clears only theirs; the receiver still owes one.
    await applyTradeSync(transact, trade.id, GIVER_ID);
    const giverSettled = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    const receiverStill = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(inGroup(giverSettled)).toBeUndefined();
    expect(inGroup(receiverStill)).toMatchObject({ count: 1, respondCount: 0, settleCount: 1 });
  });

  it("action-needed splits a group holding both kinds of action", async () => {
    const { group } = await setupMatch(2);
    // One trade accepted: neither side has confirmed its half, so both owe one.
    const reserved = await request(group, 1);
    await acceptTrade(transact, reserved.id, GIVER_ID);
    // A second request on top, which only the giver has to answer.
    await request(group, 1);

    const giverCounts = await repos.cardTrades.actionNeededCountsForUser(GIVER_ID);
    expect(giverCounts.find((entry) => entry.groupId === group.id)).toMatchObject({
      count: 2,
      respondCount: 1,
      settleCount: 1,
    });

    // The receiver initiated the pending one, so only their unconfirmed half counts.
    const receiverCounts = await repos.cardTrades.actionNeededCountsForUser(RECEIVER_ID);
    expect(receiverCounts.find((entry) => entry.groupId === group.id)).toMatchObject({
      count: 1,
      respondCount: 0,
      settleCount: 1,
    });
  });

  // ── Pending offers consume supply ────────────────────────────────────────
  // An offer is a commitment, so it holds its copies from the moment it is made
  // (a request stays a bid). The committed sum is global, so these tests cancel
  // the offers they leave behind: this suite shares one DB and one giver, and a
  // lingering pending offer would eat later tests' supply.

  it("a pending offer holds its copy, so the same copy can't be offered twice", async () => {
    const { group } = await setupMatch(1);
    await groupsRepo.addMember(group.id, OUTSIDER_ID, "member");
    await shareWish(group.id, OUTSIDER_ID, 1);

    const first = await offer(group, RECEIVER_ID, 1);
    expect(first.status).toBe("pending");
    expect(first.initiator).toBe("giver");

    // The giver's single copy is spoken for, so a second offer of it is refused
    // and the reported count is the netted one.
    await expect(offer(group, OUTSIDER_ID, 1)).rejects.toMatchObject({
      status: 409,
      message: "Only 0 copies are still available",
    });

    // Cancelling releases the commitment and the copy can be offered again.
    await cancelTrade(transact, first.id, GIVER_ID);
    const second = await offer(group, OUTSIDER_ID, 1);
    expect(second.status).toBe("pending");
    await cancelTrade(transact, second.id, GIVER_ID);
  });

  it("a pending request is a bid: it never holds the giver's supply", async () => {
    const { group } = await setupMatch(1);
    await groupsRepo.addMember(group.id, OUTSIDER_ID, "member");
    await shareWish(group.id, OUTSIDER_ID, 1);

    // Two members ask for the same single copy. Both requests stand; the giver
    // picks which one to accept.
    const fromReceiver = await request(group, 1);
    const fromOutsider = await createTrade(repos, {
      callerUserId: OUTSIDER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    expect(fromReceiver.status).toBe("pending");
    expect(fromOutsider.status).toBe("pending");
    // Neither request consumed the giver's supply: the copy is still visible
    // in the match, exactly as before either request existed.
    expect(await availableForReceiver(group.id)).toBe(1);
  });

  it("counts pending offers across groups, mirroring the global copy pins", async () => {
    const first = await setupMatch(1);
    // A second group where the same physical copy and a matching wish are
    // shared. `uq_card_trades_live` is per group, so only the global committed
    // sum can stop the double-promise here.
    const slug = await uniqueSlug();
    const second = await groupsRepo.createWithOwner(
      { slug, name: "Cross Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(second.id);
    await groupsRepo.addMember(second.id, RECEIVER_ID, "member");
    await groupsRepo.share(second.id, first.tradeListId, GIVER_ID);
    await shareWish(second.id, RECEIVER_ID, 1);

    const offered = await offer(first.group, RECEIVER_ID, 1);
    expect(offered.status).toBe("pending");
    await expect(offer(second, RECEIVER_ID, 1)).rejects.toMatchObject({
      status: 409,
      message: "Only 0 copies are still available",
    });

    await cancelTrade(transact, offered.id, GIVER_ID);
  });

  it("setTradeQuantity resizes an offer without counting it against itself", async () => {
    const { group } = await setupMatch(3);
    const offered = await offer(group, RECEIVER_ID, 2);
    // The 2 copies this offer already holds are its own, so raising it to the
    // giver's full stack of 3 is allowed.
    const resized = await setTradeQuantity(transact, offered.id, GIVER_ID, 3);
    expect(resized.quantity).toBe(3);
    await cancelTrade(transact, offered.id, GIVER_ID);
  });

  it("accepting an offer is not blocked by the supply that offer holds", async () => {
    const { group } = await setupMatch(1);
    const offered = await offer(group, RECEIVER_ID, 1);
    // Accept pins copies rather than re-checking committed offers, so the
    // trade's own commitment can't block the reservation it becomes.
    const reserved = await acceptTrade(transact, offered.id, RECEIVER_ID);
    expect(reserved.status).toBe("reserved");
    expect(await repos.cardTrades.listReservedCopyIds(offered.id)).toHaveLength(1);
  });

  // ── Unfillable pending trades are closed, not left to rot ────────────────
  // Whenever the giver's supply drops below a pending trade's quantity, that
  // trade is auto-cancelled in the same transaction as the drop. Without this
  // it sat pending for the whole seven-day TTL, telling the giver it needed
  // action and 409-ing every time they pressed accept.

  it("disposing the copies behind a pending request closes it", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    expect(trade.status).toBe("pending");

    await disposeCopies(transact, GIVER_ID, [copyIds[0]]);

    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.status).toBe("cancelled");
    // System actor: nobody declined it, the basis simply went away.
    expect(row?.lastActorUserId).toBeNull();
  });

  it("keeps a pending request for 1 while one copy is still left", async () => {
    const { group, copyIds } = await setupMatch(2);
    const trade = await request(group, 1);

    // One of two copies destroyed still covers a request for one.
    await disposeCopies(transact, GIVER_ID, [copyIds[0]]);
    expect(await statusOf(trade.id)).toBe("pending");

    // The last copy going takes the request with it.
    await disposeCopies(transact, GIVER_ID, [copyIds[1]]);
    expect(await statusOf(trade.id)).toBe("cancelled");
  });

  it("closes a pending request for 2 once only one copy is left", async () => {
    // The threshold is the trade's own quantity, not zero.
    const { group, copyIds } = await setupMatch(2);
    const trade = await request(group, 2);

    await disposeCopies(transact, GIVER_ID, [copyIds[0]]);

    expect(await statusOf(trade.id)).toBe("cancelled");
  });

  it("leaves the giver's offer standing and closes the request behind it", async () => {
    const { group, copyIds } = await setupMatch(2);
    await groupsRepo.addMember(group.id, OUTSIDER_ID, "member");
    await shareWish(group.id, OUTSIDER_ID, 1);

    // Two copies cover both: the offer commits one, the request bids for the other.
    const offered = await offer(group, OUTSIDER_ID, 1);
    const requested = await request(group, 1);

    // Destroying one copy leaves a single one, already committed by the offer.
    // Offers are settled before requests are judged, so only the request dies.
    await disposeCopies(transact, GIVER_ID, [copyIds[0]]);

    expect(await statusOf(offered.id)).toBe("pending");
    expect(await statusOf(requested.id)).toBe("cancelled");

    await cancelTrade(transact, offered.id, GIVER_ID);
  });

  it("moving the giver's copy into a group binder closes the request it backed", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);

    // A pooled collection belongs to the group, not to the giver, so the copy
    // leaves their personal supply. It cascades away with the group in afterAll.
    const pooled = await db
      .insertInto("collections")
      .values({ groupId: group.id, name: "Pooled Binder", isInbox: false, sortOrder: 4 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await moveCopies(repos, transact, GIVER_ID, [copyIds[0]], pooled.id);

    expect(await statusOf(trade.id)).toBe("cancelled");

    // Move it back so the group collection is empty when the group cascades.
    const home = await collectionFor(GIVER_ID);
    await moveCopies(repos, transact, GIVER_ID, [copyIds[0]], home);
  });

  it("unsharing the trade list closes the requests it was backing", async () => {
    const { group, tradeListId } = await setupMatch(1);
    const trade = await request(group, 1);

    // Mirrors the unshareList route: drop the share, then re-check the giver's
    // pending trades for the printings still in flight, all in one transaction.
    await transact(async (trxRepos) => {
      await trxRepos.friendGroups.unshare(group.id, tradeListId);
      const printingIds = await trxRepos.cardTrades.listPendingPrintingIdsForGiverInGroup(
        group.id,
        GIVER_ID,
      );
      for (const printingId of printingIds) {
        await autoCancelUnfillablePendingTrades(trxRepos, GIVER_ID, printingId);
      }
    });

    expect(await statusOf(trade.id)).toBe("cancelled");
  });
  // -------------------------------------------------------------------------
  // Choosing which physical copy gets promised (C4)
  // -------------------------------------------------------------------------

  it("promises the plainest copy when the giver makes no choice", async () => {
    const { group, copyIds } = await setupMatch(2);
    await gradeCopy(copyIds[0]);
    const trade = await request(group, 1);

    await acceptTrade(transact, trade.id, GIVER_ID);

    // The PSA 10 stays with its owner while a plain copy is still on the table.
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([copyIds[1]]);
  });

  it("promises exactly the copy the giver picked, graded or not", async () => {
    const { group, copyIds } = await setupMatch(2);
    await gradeCopy(copyIds[0]);
    const trade = await request(group, 1);

    await acceptTrade(transact, trade.id, GIVER_ID, [copyIds[0]]);

    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([copyIds[0]]);
  });

  it("refuses a choice that does not match the trade quantity", async () => {
    const { group, copyIds } = await setupMatch(3);
    const trade = await request(group, 2);

    await expect(acceptTrade(transact, trade.id, GIVER_ID, [copyIds[0]])).rejects.toMatchObject({
      status: 409,
    });
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([]);
    expect(await statusOf(trade.id)).toBe("pending");
  });

  it("refuses a copy the giver owns but never shared with the group", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);
    const unlisted = await unlistedGiverCopy();

    await expect(acceptTrade(transact, trade.id, GIVER_ID, [unlisted])).rejects.toMatchObject({
      status: 409,
    });
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([]);
    expect(await statusOf(trade.id)).toBe("pending");
  });

  it("refuses a copy that belongs to someone else", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    const receiverCollectionId = await collectionFor(RECEIVER_ID);
    const theirs = await db
      .insertInto("copies")
      .values({ printingId: PRINTING_1.id, collectionId: receiverCollectionId })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(acceptTrade(transact, trade.id, GIVER_ID, [theirs.id])).rejects.toMatchObject({
      status: 409,
    });
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([]);
  });

  it("refuses a choice from the receiver accepting the giver's offer", async () => {
    const { group, copyIds } = await setupMatch(2);
    const offered = await offer(group, RECEIVER_ID, 1);

    // The receiver is the recipient here, but the copies are not theirs to pick.
    await expect(
      acceptTrade(transact, offered.id, RECEIVER_ID, [copyIds[0]]),
    ).rejects.toMatchObject({ status: 403 });

    // A pending offer commits supply globally, so release it before moving on.
    await cancelTrade(transact, offered.id, GIVER_ID);
  });

  it("lists the giver's candidate copies plainest-first and flags a real choice", async () => {
    const { group, copyIds } = await setupMatch(2);
    await gradeCopy(copyIds[0]);
    const trade = await request(group, 1);

    const options = await listTradeCopyOptions(repos, trade.id, GIVER_ID);

    expect(options.tradeId).toBe(trade.id);
    expect(options.quantity).toBe(1);
    expect(options.choiceMatters).toBe(true);
    expect(options.copies.map((row) => row.id)).toEqual([copyIds[1], copyIds[0]]);
    expect(options.copies[0].hasRecordedDetails).toBe(false);
    expect(options.copies[1]).toMatchObject({
      grader: "psa",
      grade: 10,
      hasRecordedDetails: true,
      collectionName: "Trade Test Binder",
    });
  });

  it("does not flag a choice when the candidates are identical and unrecorded", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 1);

    const options = await listTradeCopyOptions(repos, trade.id, GIVER_ID);

    expect(options.copies).toHaveLength(2);
    expect(options.choiceMatters).toBe(false);
  });

  it("keeps the candidate copies away from the receiver", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);

    await expect(listTradeCopyOptions(repos, trade.id, RECEIVER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  // ── Settle-time copy choice ────────────────────────────────────────────────
  // The candidate set here is every free copy the giver owns of the printing,
  // and this suite's copies accumulate across tests, so these assert membership
  // and per-copy outcomes rather than candidate counts.

  /** @returns Whether the copy row still exists. */
  async function copyExists(copyId: string): Promise<boolean> {
    const row = await db
      .selectFrom("copies")
      .select("id")
      .where("id", "=", copyId)
      .executeTakeFirst();
    return row !== undefined;
  }

  it("offers a reserved trade's pins first, then the giver's unshared copies", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const unlisted = await unlistedGiverCopy();

    const options = await listTradeCopyOptions(repos, trade.id, GIVER_ID);

    expect(options.copies[0]).toMatchObject({ id: copyIds[0], pinned: true });
    // The copy that physically travelled can be one the group never saw, which
    // is the case the accept picker's group-scoped supply cannot cover.
    const alternatives = options.copies.filter((row) => !row.pinned).map((row) => row.id);
    expect(alternatives).toContain(unlisted);
  });

  it("removes the copy the giver says changed hands, leaving the pinned one alone", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const unlisted = await unlistedGiverCopy();

    await applyTradeSync(transact, trade.id, GIVER_ID, { copyIds: [unlisted] });

    expect(await copyExists(unlisted)).toBe(false);
    expect(await copyExists(copyIds[0])).toBe(true);
    // The pins are released either way, so the untouched copy goes back into
    // the group's supply instead of staying hidden.
    expect(await repos.cardTrades.listReservedCopyIds(trade.id)).toEqual([]);
    const row = await repos.cardTrades.getById(trade.id);
    expect(row?.giverSyncAppliedAt).not.toBeNull();
    expect(row?.status).toBe("reserved");
  });

  it("refuses a settle choice of the wrong size", async () => {
    const { group, copyIds } = await setupMatch(2);
    const trade = await request(group, 2);
    await acceptTrade(transact, trade.id, GIVER_ID);

    await expect(
      applyTradeSync(transact, trade.id, GIVER_ID, { copyIds: [copyIds[0]] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await copyExists(copyIds[0])).toBe(true);
    expect(await copyExists(copyIds[1])).toBe(true);
  });

  it("refuses a settle choice naming someone else's copy", async () => {
    const { group, copyIds } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const receiverCollectionId = await collectionFor(RECEIVER_ID);
    const theirs = await db
      .insertInto("copies")
      .values({ printingId: PRINTING_1.id, collectionId: receiverCollectionId })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(
      applyTradeSync(transact, trade.id, GIVER_ID, { copyIds: [theirs.id] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await copyExists(theirs.id)).toBe(true);
    expect(await copyExists(copyIds[0])).toBe(true);
  });

  it("refuses a settle choice from the receiver, whose side owns no copies", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    const unlisted = await unlistedGiverCopy();

    await expect(
      applyTradeSync(transact, trade.id, RECEIVER_ID, { copyIds: [unlisted] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await copyExists(unlisted)).toBe(true);
  });

  it("has nothing to choose once the giver has settled", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);
    await applyTradeSync(transact, trade.id, GIVER_ID);

    await expect(listTradeCopyOptions(repos, trade.id, GIVER_ID)).rejects.toMatchObject({
      status: 409,
    });
  });

  // ── liveAnnotationsForUser ─────────────────────────────────────────────────
  // Every test in this file trades PRINTING_1 and cleanup only runs in afterAll,
  // so the annotation buckets accumulate. Each case therefore reads one bucket
  // before and after the action and asserts the delta, never an absolute count.

  /** @returns The viewer's PRINTING_1 bucket for one role and phase, zeroed when absent. */
  async function bucket(
    userId: string,
    role: "giver" | "receiver",
    phase: "asked" | "offered" | "reserved" | "traded",
  ): Promise<{ tradeCount: number; quantity: number }> {
    const rows = await repos.cardTrades.liveAnnotationsForUser(userId);
    const row = rows.find(
      (entry) => entry.printingId === PRINTING_1.id && entry.role === role && entry.phase === phase,
    );
    return { tradeCount: row?.tradeCount ?? 0, quantity: row?.quantity ?? 0 };
  }

  /** @returns The delta of one bucket across `action`. */
  async function bucketDelta(
    userId: string,
    role: "giver" | "receiver",
    phase: "asked" | "offered" | "reserved" | "traded",
    action: () => Promise<unknown>,
  ): Promise<{ tradeCount: number; quantity: number }> {
    const before = await bucket(userId, role, phase);
    await action();
    const after = await bucket(userId, role, phase);
    return {
      tradeCount: after.tradeCount - before.tradeCount,
      quantity: after.quantity - before.quantity,
    };
  }

  it("reports a receiver-initiated request as asked on both sides", async () => {
    const { group } = await setupMatch(3);
    const giverBefore = await bucket(GIVER_ID, "giver", "asked");
    const receiverBefore = await bucket(RECEIVER_ID, "receiver", "asked");

    await request(group, 2);

    const giverAfter = await bucket(GIVER_ID, "giver", "asked");
    const receiverAfter = await bucket(RECEIVER_ID, "receiver", "asked");
    expect(giverAfter.tradeCount - giverBefore.tradeCount).toBe(1);
    expect(giverAfter.quantity - giverBefore.quantity).toBe(2);
    expect(receiverAfter.tradeCount - receiverBefore.tradeCount).toBe(1);
    expect(receiverAfter.quantity - receiverBefore.quantity).toBe(2);
  });

  it("reports a giver-initiated offer as offered on both sides", async () => {
    const { group } = await setupMatch(2);
    const giverBefore = await bucket(GIVER_ID, "giver", "offered");
    const receiverBefore = await bucket(RECEIVER_ID, "receiver", "offered");
    const askedBefore = await bucket(GIVER_ID, "giver", "asked");

    await offer(group, RECEIVER_ID, 1);

    const giverAfter = await bucket(GIVER_ID, "giver", "offered");
    const receiverAfter = await bucket(RECEIVER_ID, "receiver", "offered");
    expect(giverAfter.tradeCount - giverBefore.tradeCount).toBe(1);
    expect(receiverAfter.tradeCount - receiverBefore.tradeCount).toBe(1);
    // `initiator` is what splits pending in two, so the same row must not also
    // land in `asked`.
    expect(await bucket(GIVER_ID, "giver", "asked")).toEqual(askedBefore);
  });

  it("moves the bucket from asked to reserved on accept", async () => {
    const { group } = await setupMatch(2);
    const trade = await request(group, 2);

    const askedBefore = await bucket(GIVER_ID, "giver", "asked");
    const reservedDelta = await bucketDelta(GIVER_ID, "giver", "reserved", () =>
      acceptTrade(transact, trade.id, GIVER_ID),
    );
    const askedAfter = await bucket(GIVER_ID, "giver", "asked");

    expect(reservedDelta).toEqual({ tradeCount: 1, quantity: 2 });
    expect(askedBefore.tradeCount - askedAfter.tradeCount).toBe(1);
  });

  it("drops a settled side's reserved annotation and leaves the other side's", async () => {
    // There is no rung above reserved: once a side settles, the giver's copies
    // are gone and the receiver's are ordinary owned copies, so there is nothing
    // left to annotate (ADR-019, amendment 2026-08-10).
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);
    await acceptTrade(transact, trade.id, GIVER_ID);

    const receiverReserved = await bucket(RECEIVER_ID, "receiver", "reserved");
    expect(receiverReserved.tradeCount).toBeGreaterThanOrEqual(1);

    const afterSkip = await bucketDelta(GIVER_ID, "giver", "reserved", () =>
      skipTradeSync(transact, trade.id, GIVER_ID),
    );
    expect(afterSkip).toEqual({ tradeCount: -1, quantity: -1 });
    expect(await bucket(RECEIVER_ID, "receiver", "reserved")).toEqual(receiverReserved);
  });

  it("drops a declined trade from every bucket", async () => {
    const { group } = await setupMatch(1);
    const trade = await request(group, 1);

    const before = await repos.cardTrades.liveAnnotationsForUser(GIVER_ID);
    await declineTrade(transact, trade.id, GIVER_ID);
    const after = await repos.cardTrades.liveAnnotationsForUser(GIVER_ID);

    const askedOf = (rows: typeof before) =>
      rows.find(
        (row) => row.printingId === PRINTING_1.id && row.role === "giver" && row.phase === "asked",
      )?.tradeCount ?? 0;
    expect(askedOf(before) - askedOf(after)).toBe(1);
  });

  it("sums live trades from several groups into one printing bucket", async () => {
    const { group: first } = await setupMatch(2);
    const { group: second } = await setupMatch(2);

    const delta = await bucketDelta(GIVER_ID, "giver", "asked", async () => {
      await request(first, 2);
      await request(second, 1);
    });

    expect(delta).toEqual({ tradeCount: 2, quantity: 3 });
  });

  it("returns nothing for a user with no live trades", async () => {
    expect(await repos.cardTrades.liveAnnotationsForUser(BYSTANDER_ID)).toEqual([]);
  });
});
