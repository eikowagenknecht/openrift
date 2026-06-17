import { createLogger } from "@openrift/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { createTrade } from "./card-trades.js";
import { flushCoalescedTradeRequests } from "./trade-notifications.js";
import type { TradeEmailDeps } from "./trade-notifications.js";

const GIVER_ID = "a0000000-0059-4000-a000-000000000001";
const RECEIVER_ID = "a0000000-0060-4000-a000-000000000001";
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID];
const GIVER_EMAIL = "coalesce-0059@test.com";
const RECEIVER_EMAIL = "coalesce-0060@test.com";

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("trade-request coalescing (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const groupsRepo = friendGroupsRepo(db);
  const createdGroupIds: string[] = [];
  const log = createLogger("test", "silent");

  // Captures every email a createTrade / flush call would send.
  function makeSink() {
    const sent: { to: string; subject: string }[] = [];
    // oxlint-disable-next-line require-await -- mock matches the async sender shape
    const sendEmail = async ({ to, subject }: { to: string; subject: string }) => {
      sent.push({ to, subject });
      return undefined;
    };
    return { sent, sendEmail };
  }

  function emailDeps(sendEmail: TradeEmailDeps["sendEmail"]): TradeEmailDeps {
    return { sendEmail, appBaseUrl: "http://localhost:5173", unsubscribeSecret: "test", log };
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
    await repos.userPreferences.upsert(GIVER_ID, { emailNotifications: null });
    await repos.userPreferences.upsert(RECEIVER_ID, { emailNotifications: null });
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
    const slug = `co-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Coalesce Group", description: null, code: null },
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

  function requestAsReceiver(group: { slug: string }, printingId: string, deps: TradeEmailDeps) {
    return createTrade(
      repos,
      {
        callerUserId: RECEIVER_ID,
        groupSlug: group.slug,
        counterpartyUserId: GIVER_ID,
        role: "receiver",
        printingId,
        quantity: 1,
      },
      deps,
    );
  }

  it("sends the first request instantly and queues a burst from the same sender", async () => {
    const group = await setupMatch();
    const { sent, sendEmail } = makeSink();

    await requestAsReceiver(group, PRINTING_1.id, emailDeps(sendEmail));
    expect(sent).toHaveLength(1); // leading email sent instantly

    await requestAsReceiver(group, PRINTING_2.id, emailDeps(sendEmail));
    expect(sent).toHaveLength(1); // still 1 — the second is queued, not emailed
  });

  it("flushes the queued requests into one coalesced email once the window settles", async () => {
    const group = await setupMatch();
    const instant = makeSink();
    await requestAsReceiver(group, PRINTING_1.id, emailDeps(instant.sendEmail));
    await requestAsReceiver(group, PRINTING_2.id, emailDeps(instant.sendEmail));
    expect(instant.sent).toHaveLength(1);

    // windowSeconds 0 makes the queued PRINTING_2 request immediately "settled".
    const flush = makeSink();
    const result = await flushCoalescedTradeRequests({
      repos,
      log,
      sendEmail: flush.sendEmail,
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      windowSeconds: 0,
    });

    expect(result.emailsSent).toBe(1);
    expect(result.requests).toBe(1);
    expect(flush.sent).toHaveLength(1);
    expect(flush.sent[0].to).toBe(GIVER_EMAIL);
    expect(flush.sent[0].subject).toContain("more trade request");

    // A second flush has nothing left to send (the rows are now claimed).
    const flush2 = makeSink();
    const result2 = await flushCoalescedTradeRequests({
      repos,
      log,
      sendEmail: flush2.sendEmail,
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      windowSeconds: 0,
    });
    expect(result2.emailsSent).toBe(0);
    expect(flush2.sent).toHaveLength(0);
  });

  it("suppresses the queue without emailing when the recipient opted out", async () => {
    await repos.userPreferences.upsert(GIVER_ID, { emailNotifications: { tradeRequests: false } });
    const group = await setupMatch();
    const { sent, sendEmail } = makeSink();

    // Opted out: nothing sent instantly, and both requests sit queued (NULL).
    await requestAsReceiver(group, PRINTING_1.id, emailDeps(sendEmail));
    await requestAsReceiver(group, PRINTING_2.id, emailDeps(sendEmail));
    expect(sent).toHaveLength(0);

    const flush = makeSink();
    const result = await flushCoalescedTradeRequests({
      repos,
      log,
      sendEmail: flush.sendEmail,
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      windowSeconds: 0,
    });
    expect(flush.sent).toHaveLength(0); // suppressed, no email
    expect(result.emailsSent).toBe(0);

    // But the queue is now claimed, so it won't be reconsidered forever.
    const remaining = await repos.cardTrades.listDueCoalescedRequests(0);
    expect(remaining.filter((row) => row.recipientUserId === GIVER_ID)).toHaveLength(0);
  });
});
