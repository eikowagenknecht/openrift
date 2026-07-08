import { createLogger } from "@openrift/shared/logger";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { createTrade } from "./card-trades.js";
import { flushCoalescedTradeRequests } from "./trade-notifications.js";
import type { TradeEmailDeps } from "./trade-notifications.js";

// Random per-file users, self-inserted below. This file keeps its own upsert
// (rather than seedTestUser) because it toggles emailVerified per-case.
const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID];
const GIVER_EMAIL = `test-${GIVER_ID}@test.com`;
const RECEIVER_EMAIL = `test-${RECEIVER_ID}@test.com`;

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

  // Backdates every queued request from GIVER↔RECEIVER so a trailing-debounce
  // window counts it as settled.
  async function backdateRequests(minutesAgo: number) {
    await db
      .updateTable("cardTrades")
      .set({ createdAt: sql<Date>`now() - (${minutesAgo} * interval '1 minute')` })
      .where("giverUserId", "=", GIVER_ID)
      .where("receiverUserId", "=", RECEIVER_ID)
      .execute();
  }

  function flushDeps(sendEmail: TradeEmailDeps["sendEmail"]) {
    return {
      repos,
      log,
      sendEmail,
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
    };
  }

  it("sends every request immediately on the instant cadence", async () => {
    // The recipient is the non-initiator (GIVER); give them the instant cadence.
    await repos.userPreferences.upsert(GIVER_ID, {
      emailNotifications: { tradeRequestCadence: "instant" },
    });
    const group = await setupMatch();
    const { sent, sendEmail } = makeSink();

    await requestAsReceiver(group, PRINTING_1.id, emailDeps(sendEmail));
    expect(sent).toHaveLength(1); // sent right away

    await requestAsReceiver(group, PRINTING_2.id, emailDeps(sendEmail));
    expect(sent).toHaveLength(2); // instant = no coalescing, every request emails
  });

  it("queues a burst on a timed cadence and folds it into one email once it settles", async () => {
    // Default cadence (5 min) — nothing is sent instantly.
    const group = await setupMatch();
    const instant = makeSink();
    await requestAsReceiver(group, PRINTING_1.id, emailDeps(instant.sendEmail));
    await requestAsReceiver(group, PRINTING_2.id, emailDeps(instant.sendEmail));
    expect(instant.sent).toHaveLength(0);

    // A flush while the burst is still fresh leaves the rows queued (not due).
    const early = makeSink();
    const earlyResult = await flushCoalescedTradeRequests(flushDeps(early.sendEmail));
    expect(earlyResult.emailsSent).toBe(0);
    expect(early.sent).toHaveLength(0);

    // Once the last request is older than the window, the burst is due and both
    // requests fold into a single email.
    await backdateRequests(6);
    const flush = makeSink();
    const result = await flushCoalescedTradeRequests(flushDeps(flush.sendEmail));
    expect(result.emailsSent).toBe(1);
    expect(result.requests).toBe(2);
    expect(flush.sent).toHaveLength(1);
    expect(flush.sent[0].to).toBe(GIVER_EMAIL);
    expect(flush.sent[0].subject).toContain("2 trade requests");
    expect(flush.sent[0].subject).not.toContain("more");

    // A second flush has nothing left to send (the rows are now claimed).
    const flush2 = makeSink();
    const result2 = await flushCoalescedTradeRequests(flushDeps(flush2.sendEmail));
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

    // Suppressed pairs are claimed-and-skipped even while fresh, so they aren't
    // reconsidered every tick.
    const flush = makeSink();
    const result = await flushCoalescedTradeRequests(flushDeps(flush.sendEmail));
    expect(flush.sent).toHaveLength(0); // suppressed, no email
    expect(result.emailsSent).toBe(0);

    const remaining = await repos.cardTrades.listPendingRequestEmails();
    expect(remaining.filter((row) => row.recipientUserId === GIVER_ID)).toHaveLength(0);
  });
});
