import { createLogger } from "@openrift/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { acceptTrade, cancelTrade, createTrade, declineTrade } from "./card-trades.js";
import { flushTradeStatusEmails } from "./trade-status-notifications.js";
import type { TradeStatusFlushDeps } from "./trade-status-notifications.js";

// Random per-file users, self-inserted below. This file keeps its own upsert
// (rather than seedTestUser) because it toggles emailVerified per-case.
const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID];
const GIVER_EMAIL = `test-${GIVER_ID}@test.com`;
const RECEIVER_EMAIL = `test-${RECEIVER_ID}@test.com`;

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("trade-status emails (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const transact = createTransact(db);
  const groupsRepo = friendGroupsRepo(db);
  const createdGroupIds: string[] = [];
  const log = createLogger("test", "silent");

  // Captures every email a flush call would send.
  function makeSink() {
    const sent: { to: string; subject: string }[] = [];
    // oxlint-disable-next-line require-await -- mock matches the async sender shape
    const sendEmail = async ({ to, subject }: { to: string; subject: string }) => {
      sent.push({ to, subject });
      return undefined;
    };
    return { sent, sendEmail };
  }

  function flushDeps(sendEmail: TradeStatusFlushDeps["sendEmail"]): TradeStatusFlushDeps {
    return {
      repos,
      log,
      sendEmail,
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
    };
  }

  async function insertUsers(verified = true) {
    await db
      .insertInto("users")
      .values([
        { id: GIVER_ID, email: GIVER_EMAIL, name: "Giver", emailVerified: verified, image: null },
        {
          id: RECEIVER_ID,
          email: RECEIVER_EMAIL,
          name: "Receiver",
          emailVerified: verified,
          image: null,
        },
      ])
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({ emailVerified: eb.ref("excluded.emailVerified") })),
      )
      .execute();
  }

  beforeAll(insertUsers);

  beforeEach(async () => {
    await insertUsers(true);
    // Recipient is the *initiator* (RECEIVER); give them the instant cadence so a
    // queued status change is always due — the timed-cadence debounce is the same
    // `isRequestGroupDue` the trade-request flush already covers.
    await repos.userPreferences.upsert(RECEIVER_ID, {
      emailNotifications: { tradeRequestCadence: "instant" },
    });
    await repos.userPreferences.upsert(GIVER_ID, { emailNotifications: null });
    await db
      .deleteFrom("cardTrades")
      .where((eb) =>
        eb.or([eb("giverUserId", "in", ALL_USER_IDS), eb("receiverUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("cardTrades")
      .where((eb) =>
        eb.or([eb("giverUserId", "in", ALL_USER_IDS), eb("receiverUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    await db.deleteFrom("userPreferences").where("userId", "in", ALL_USER_IDS).execute();
    await db.deleteFrom("lists").where("userId", "in", ALL_USER_IDS).execute();
    await db
      .deleteFrom("copies")
      .where(
        "collectionId",
        "in",
        db.selectFrom("collections").select("id").where("userId", "in", ALL_USER_IDS),
      )
      .execute();
    await db.deleteFrom("collections").where("userId", "in", ALL_USER_IDS).execute();
  });

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
      .values({ userId, name: "Binder", isInbox: false, sortOrder: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  }

  // Giver shares one trade copy of each printing; receiver wishes one of each.
  async function setupMatch() {
    const slug = `st-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Status Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, RECEIVER_ID, "member");

    const wish = await db
      .insertInto("lists")
      .values({ userId: RECEIVER_ID, name: "Wants", intent: "wish", kind: "printing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const tradeList = await db
      .insertInto("lists")
      .values({ userId: GIVER_ID, name: "Haves", intent: "trade", kind: "copy" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const collectionId = await collectionFor(GIVER_ID);

    for (const printingId of [PRINTING_1.id, PRINTING_2.id]) {
      await db
        .insertInto("listEntries")
        .values({ listId: wish.id, userId: RECEIVER_ID, kind: "printing", printingId, quantity: 1 })
        .execute();
      const copy = await db
        .insertInto("copies")
        .values({ printingId, collectionId })
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
    }

    await groupsRepo.share(group.id, wish.id, RECEIVER_ID);
    await groupsRepo.share(group.id, tradeList.id, GIVER_ID);
    return group;
  }

  // RECEIVER requests both printings (the initiator); returns the trade ids.
  async function requestBoth(group: { slug: string }): Promise<{ first: string; second: string }> {
    const first = await createTrade(repos, {
      callerUserId: RECEIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    const second = await createTrade(repos, {
      callerUserId: RECEIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_2.id,
      quantity: 1,
    });
    return { first: first.id, second: second.id };
  }

  it("folds a basket the giver accepts into one email to the initiator", async () => {
    const group = await setupMatch();
    const { first, second } = await requestBoth(group);

    // The non-initiator (GIVER) accepts both requests.
    await acceptTrade(transact, first, GIVER_ID);
    await acceptTrade(transact, second, GIVER_ID);

    const flush = makeSink();
    const result = await flushTradeStatusEmails(flushDeps(flush.sendEmail));

    // Two reserves to the same recipient fold into one email to the initiator.
    expect(result.emailsSent).toBe(1);
    expect(result.events).toBe(2);
    expect(flush.sent).toHaveLength(1);
    expect(flush.sent[0].to).toBe(RECEIVER_EMAIL);
    expect(flush.sent[0].subject).toBe("Giver accepted 2 of your trades");

    // A second flush has nothing left — the rows are claimed.
    const flush2 = makeSink();
    const result2 = await flushTradeStatusEmails(flushDeps(flush2.sendEmail));
    expect(result2.emailsSent).toBe(0);
    expect(flush2.sent).toHaveLength(0);
  });

  it("emails on decline and cancel, and drops a stale reserve when cancelled first", async () => {
    const group = await setupMatch();
    const { first, second } = await requestBoth(group);

    // Decline one; accept-then-cancel the other (the reserve never gets emailed).
    await declineTrade(transact, first, GIVER_ID);
    await acceptTrade(transact, second, GIVER_ID);
    await cancelTrade(transact, second, GIVER_ID);

    const flush = makeSink();
    const result = await flushTradeStatusEmails(flushDeps(flush.sendEmail));

    // One email folding the declined + cancelled events — not three (the reserve
    // for `second` was dropped because it was no longer 'reserved' at flush time).
    expect(result.emailsSent).toBe(1);
    expect(result.events).toBe(2);
    expect(flush.sent[0].to).toBe(RECEIVER_EMAIL);
  });

  it("suppresses the queue without emailing when the recipient opted out", async () => {
    await repos.userPreferences.upsert(RECEIVER_ID, { emailNotifications: { tradeStatus: false } });
    const group = await setupMatch();
    const { first } = await requestBoth(group);
    await acceptTrade(transact, first, GIVER_ID);

    const flush = makeSink();
    const result = await flushTradeStatusEmails(flushDeps(flush.sendEmail));
    expect(result.emailsSent).toBe(0);
    expect(flush.sent).toHaveLength(0);

    // Suppressed rows are claimed, so they aren't reconsidered next tick.
    const remaining = await repos.cardTrades.listPendingStatusEmails();
    expect(remaining.filter((row) => row.recipientUserId === RECEIVER_ID)).toHaveLength(0);
  });

  it("leaves a fresh burst queued on a timed cadence (not yet due)", async () => {
    await repos.userPreferences.upsert(RECEIVER_ID, {
      emailNotifications: { tradeRequestCadence: "30min" },
    });
    const group = await setupMatch();
    const { first } = await requestBoth(group);
    await acceptTrade(transact, first, GIVER_ID);

    const flush = makeSink();
    const result = await flushTradeStatusEmails(flushDeps(flush.sendEmail));
    expect(result.emailsSent).toBe(0);
    expect(flush.sent).toHaveLength(0);

    // The row stays queued (unclaimed) for a later tick.
    const remaining = await repos.cardTrades.listPendingStatusEmails();
    expect(remaining.filter((row) => row.recipientUserId === RECEIVER_ID)).toHaveLength(1);
  });
});
