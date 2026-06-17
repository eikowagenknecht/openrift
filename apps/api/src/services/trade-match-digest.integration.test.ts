import { createLogger } from "@openrift/shared/logger";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { CARD_FURY_UNIT, PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import type { TradeMatchDigestDeps } from "./trade-match-digest.js";
import { sendTradeMatchDigest, TRADE_MATCH_DIGEST_FLAG } from "./trade-match-digest.js";

const GIVER_ID = "a0000000-0060-4000-a000-000000000001";
const DIGEST_ID = "a0000000-0059-4000-a000-000000000001";
const OPTED_OUT_ID = "a0000000-0061-4000-a000-000000000001";
const UNVERIFIED_ID = "a0000000-0062-4000-a000-000000000001";
const ALL_USER_IDS = [GIVER_ID, DIGEST_ID, OPTED_OUT_ID, UNVERIFIED_ID];
const DIGEST_EMAIL = "digest-0059@test.com";

const ctx = createDbContext(GIVER_ID);

const EMAILS: Record<string, string> = {
  [GIVER_ID]: "digest-0060@test.com",
  [DIGEST_ID]: DIGEST_EMAIL,
  [OPTED_OUT_ID]: "digest-0061@test.com",
  [UNVERIFIED_ID]: "digest-0062@test.com",
};

describe.skipIf(!ctx)("trade match digest (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const groupsRepo = friendGroupsRepo(db);
  const createdGroupIds: string[] = [];

  function makeDeps(
    sinceTimestamp: Date | null,
    sent: { to: string; subject: string; html: string }[],
  ): TradeMatchDigestDeps {
    return {
      repos,
      log: createLogger("test", "silent"),
      // oxlint-disable-next-line require-await -- mock matches the async sender shape
      sendEmail: async ({ to, subject, html }) => {
        sent.push({ to, subject, html });
        return undefined;
      },
      appBaseUrl: "http://localhost:5173",
      unsubscribeSecret: "test",
      sinceTimestamp,
    };
  }

  async function insertUser(id: string, verified: boolean) {
    await db
      .insertInto("users")
      .values({ id, email: EMAILS[id], name: "Test User", emailVerified: verified, image: null })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({ emailVerified: eb.ref("excluded.emailVerified") })),
      )
      .execute();
  }

  beforeAll(async () => {
    await insertUser(GIVER_ID, true);
    await insertUser(DIGEST_ID, true);
    await insertUser(OPTED_OUT_ID, true);
    await insertUser(UNVERIFIED_ID, false);
  });

  beforeEach(async () => {
    // DIGEST_ID opts into the digest; OPTED_OUT_ID doesn't; UNVERIFIED_ID opts in
    // but is unverified.
    await repos.userPreferences.upsert(DIGEST_ID, { emailNotifications: { tradeMatches: true } });
    await repos.userPreferences.upsert(OPTED_OUT_ID, { emailNotifications: null });
    await repos.userPreferences.upsert(UNVERIFIED_ID, {
      emailNotifications: { tradeMatches: true },
    });
  });

  // Per-test cleanup: the digest scans *all* of a user's groups, so matches left
  // by earlier tests would leak into later ones (e.g. masking the reserved-copy
  // exclusion). Reset every created group + its lists/copies/trades after each test.
  afterEach(async () => {
    await db.deleteFrom("cardTradeCopies").execute();
    await db
      .deleteFrom("cardTrades")
      .where((eb) =>
        eb.or([eb("giverUserId", "in", ALL_USER_IDS), eb("receiverUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
      createdGroupIds.length = 0;
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

  // GIVER shares a trade copy; `wisherId` wishes it — both in a fresh group. Returns the copy id.
  async function setupMatch(wisherId: string): Promise<string> {
    const slug = `dg-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Digest Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, wisherId, "member");

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

    return copy.id;
  }

  const EPOCH = new Date(0);
  const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

  it("listMatchDigestRecipients includes only opted-in, verified users", async () => {
    const recipients = await repos.userPreferences.listMatchDigestRecipients();
    const ids = new Set(recipients.map((recipient) => recipient.userId));
    expect(ids.has(DIGEST_ID)).toBe(true);
    expect(ids.has(OPTED_OUT_ID)).toBe(false);
    expect(ids.has(UNVERIFIED_ID)).toBe(false);
  });

  it("sends nothing on the first run (no watermark)", async () => {
    await setupMatch(DIGEST_ID);
    const sent: { to: string; subject: string; html: string }[] = [];
    const result = await sendTradeMatchDigest(makeDeps(null, sent));
    expect(result).toEqual({ recipients: 0, emailsSent: 0, matches: 0 });
    expect(sent).toHaveLength(0);
  });

  it("emails the opted-in wisher about a match newer than the watermark", async () => {
    await setupMatch(DIGEST_ID);
    const sent: { to: string; subject: string; html: string }[] = [];
    await sendTradeMatchDigest(makeDeps(EPOCH, sent));
    const mine = sent.find((email) => email.to === DIGEST_EMAIL);
    expect(mine).toBeDefined();
    expect(mine?.subject).toContain("new match");
    expect(mine?.html).toContain(CARD_FURY_UNIT.name);
  });

  it("does not email about a match older than the watermark", async () => {
    await setupMatch(DIGEST_ID);
    const sent: { to: string; subject: string; html: string }[] = [];
    await sendTradeMatchDigest(makeDeps(FUTURE, sent));
    expect(sent.find((email) => email.to === DIGEST_EMAIL)).toBeUndefined();
  });

  it("excludes a match whose copy is reserved by a live trade", async () => {
    const copyId = await setupMatch(DIGEST_ID);
    const trade = await repos.cardTrades.create({
      groupId: createdGroupIds.at(-1)!,
      giverUserId: GIVER_ID,
      receiverUserId: DIGEST_ID,
      initiator: "receiver",
      printingId: PRINTING_1.id,
      cardId: CARD_FURY_UNIT.id,
      quantity: 1,
      receiverWishEntryId: null,
      lastActorUserId: DIGEST_ID,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await repos.cardTrades.pinCopies(trade.id, [copyId]);

    const sent: { to: string; subject: string; html: string }[] = [];
    await sendTradeMatchDigest(makeDeps(EPOCH, sent));
    expect(sent.find((email) => email.to === DIGEST_EMAIL)).toBeUndefined();
  });

  it("sends nothing when the feature flag is turned off", async () => {
    await repos.featureFlags.create({
      key: TRADE_MATCH_DIGEST_FLAG,
      enabled: false,
      description: null,
    });
    try {
      await setupMatch(DIGEST_ID);
      const sent: { to: string; subject: string; html: string }[] = [];
      const result = await sendTradeMatchDigest(makeDeps(EPOCH, sent));
      expect(result).toEqual({ recipients: 0, emailsSent: 0, matches: 0 });
      expect(sent.find((email) => email.to === DIGEST_EMAIL)).toBeUndefined();
    } finally {
      await repos.featureFlags.deleteByKey(TRADE_MATCH_DIGEST_FLAG);
    }
  });

  it("still sends when the flag is on (default-on kill switch)", async () => {
    await repos.featureFlags.create({
      key: TRADE_MATCH_DIGEST_FLAG,
      enabled: true,
      description: null,
    });
    try {
      await setupMatch(DIGEST_ID);
      const sent: { to: string; subject: string; html: string }[] = [];
      await sendTradeMatchDigest(makeDeps(EPOCH, sent));
      expect(sent.find((email) => email.to === DIGEST_EMAIL)).toBeDefined();
    } finally {
      await repos.featureFlags.deleteByKey(TRADE_MATCH_DIGEST_FLAG);
    }
  });
});
