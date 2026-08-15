import { createLogger } from "@openrift/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { createTrade } from "./card-trades.js";
import type { TradeEmailDeps } from "./trade-notifications.js";
import { TRADE_REQUEST_EMAIL_SETTING } from "./trade-notifications.js";

const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID];
const GIVER_EMAIL = `test-${GIVER_ID}@test.com`;
const RECEIVER_EMAIL = `test-${RECEIVER_ID}@test.com`;

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("trade-request email (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const groupsRepo = friendGroupsRepo(db);
  const createdGroupIds: string[] = [];

  // Captures the emails a single createTrade call would send.
  function makeEmailDeps(): { deps: TradeEmailDeps; sent: { to: string; subject: string }[] } {
    const sent: { to: string; subject: string }[] = [];
    const deps: TradeEmailDeps = {
      // oxlint-disable-next-line require-await -- mock matches the async sender shape
      sendEmail: async ({ to, subject }) => {
        sent.push({ to, subject });
        return undefined;
      },
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      log: createLogger("test", "silent"),
    };
    return { deps, sent };
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
    // Reset verification + clear any email-notification preference between tests.
    await insertUsers(true);
    await repos.userPreferences.upsert(GIVER_ID, { emailNotifications: null });
    await repos.userPreferences.upsert(RECEIVER_ID, { emailNotifications: null });
    // Clear prior trades so each test starts from a clean slate (createTrade
    // rejects a duplicate live trade for the same pair + printing).
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

  // Giver shares one trade copy of PRINTING_1; receiver wishes one — both in a fresh group.
  async function setupMatch() {
    const slug = `re-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Email Test Group", description: null, code: null },
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
        quantity: 1,
      })
      .execute();
    await groupsRepo.share(group.id, wish.id, RECEIVER_ID);

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

    return group;
  }

  function requestAsReceiver(group: { slug: string }, deps?: TradeEmailDeps) {
    return createTrade(
      repos,
      {
        callerUserId: RECEIVER_ID,
        groupSlug: group.slug,
        counterpartyUserId: GIVER_ID,
        role: "receiver",
        printingId: PRINTING_1.id,
        quantity: 1,
      },
      deps,
    );
  }

  function offerAsGiver(group: { slug: string }, deps?: TradeEmailDeps) {
    return createTrade(
      repos,
      {
        callerUserId: GIVER_ID,
        groupSlug: group.slug,
        counterpartyUserId: RECEIVER_ID,
        role: "giver",
        printingId: PRINTING_1.id,
        quantity: 1,
      },
      deps,
    );
  }

  it("emails the non-initiator (the giver) instantly on a receiver-initiated request", async () => {
    // Recipient (the giver) opts into the instant cadence so the email sends
    // straight from createTrade instead of queueing for the coalescing flush.
    await repos.userPreferences.upsert(GIVER_ID, {
      emailNotifications: { tradeRequestCadence: "instant" },
    });
    const group = await setupMatch();
    const { deps, sent } = makeEmailDeps();
    const trade = await requestAsReceiver(group, deps);
    expect(trade.status).toBe("pending");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(GIVER_EMAIL);
    expect(sent[0].subject).toContain("wants to trade for");
  });

  it("emails the receiver (non-initiator) instantly on a giver-initiated offer", async () => {
    // Recipient (the receiver) opts into the instant cadence.
    await repos.userPreferences.upsert(RECEIVER_ID, {
      emailNotifications: { tradeRequestCadence: "instant" },
    });
    const group = await setupMatch();
    const { deps, sent } = makeEmailDeps();
    await offerAsGiver(group, deps);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(RECEIVER_EMAIL);
    expect(sent[0].subject).toContain("offers you");
  });

  it("does not email when the recipient turned trade-request emails off", async () => {
    await repos.userPreferences.upsert(GIVER_ID, { emailNotifications: { tradeRequests: false } });
    const group = await setupMatch();
    const { deps, sent } = makeEmailDeps();
    const trade = await requestAsReceiver(group, deps);
    expect(trade.status).toBe("pending");
    expect(sent).toHaveLength(0);
  });

  it("does not email an unverified recipient", async () => {
    await insertUsers(false);
    const group = await setupMatch();
    const { deps, sent } = makeEmailDeps();
    await requestAsReceiver(group, deps);
    expect(sent).toHaveLength(0);
  });

  it("still creates the trade when the email send throws", async () => {
    const group = await setupMatch();
    const failingDeps: TradeEmailDeps = {
      // oxlint-disable-next-line require-await -- mock matches the async sender shape
      sendEmail: async () => {
        throw new Error("SMTP down");
      },
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      log: createLogger("test", "silent"),
    };
    const trade = await requestAsReceiver(group, failingDeps);
    expect(trade.status).toBe("pending");
  });

  it("does not email when the site setting is turned off", async () => {
    await repos.siteSettings.create({
      key: TRADE_REQUEST_EMAIL_SETTING,
      value: "false",
      scope: "api",
    });
    try {
      const group = await setupMatch();
      const { deps, sent } = makeEmailDeps();
      const trade = await requestAsReceiver(group, deps);
      expect(trade.status).toBe("pending");
      expect(sent).toHaveLength(0);
    } finally {
      await repos.siteSettings.deleteByKey(TRADE_REQUEST_EMAIL_SETTING);
    }
  });

  it("still emails when the setting is on", async () => {
    await repos.userPreferences.upsert(GIVER_ID, {
      emailNotifications: { tradeRequestCadence: "instant" },
    });
    await repos.siteSettings.create({
      key: TRADE_REQUEST_EMAIL_SETTING,
      value: "true",
      scope: "api",
    });
    try {
      const group = await setupMatch();
      const { deps, sent } = makeEmailDeps();
      await requestAsReceiver(group, deps);
      expect(sent).toHaveLength(1);
    } finally {
      await repos.siteSettings.deleteByKey(TRADE_REQUEST_EMAIL_SETTING);
    }
  });
});
