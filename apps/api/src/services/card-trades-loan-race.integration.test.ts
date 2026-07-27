import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import { friendGroupsRepo } from "../repositories/friend-groups.js";
import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { acceptTrade, createTrade } from "./card-trades.js";
import { createLoan } from "./loans.js";

// Integration counterpart to the mocked cross-claim regression tests in
// card-trades.test.ts / loans.test.ts: acceptTrade and createLoan both
// re-check the opposite claim table (cardTradeCopies / loanCopies) after
// locking the candidate copies with `copies.lockByIds` (a real `FOR UPDATE`).
// Driving this through two real, concurrently-committing transactions against
// the shared database proves the row lock actually serializes the two
// services, rather than the unit tests' hand-fed "the other side already
// claimed it" mock responses.

const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const ALL_USER_IDS = [GIVER_ID, RECEIVER_ID];

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("acceptTrade vs createLoan cross-claim race (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
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

  afterAll(async () => {
    // Loans and trades first (cascading loan_copies / card_trade_copies), then
    // groups, lists, copies (before their collections — a trigger blocks
    // deleting a non-empty collection), and collections. Users are file-owned
    // and deleted last.
    await db
      .deleteFrom("loans")
      .where((eb) =>
        eb.or([eb("lenderUserId", "in", ALL_USER_IDS), eb("borrowerUserId", "in", ALL_USER_IDS)]),
      )
      .execute();
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
    await db
      .deleteFrom("copies")
      .where(
        "collectionId",
        "in",
        db.selectFrom("collections").select("id").where("userId", "in", ALL_USER_IDS),
      )
      .execute();
    await db.deleteFrom("collections").where("userId", "in", ALL_USER_IDS).execute();
    await db.deleteFrom("users").where("id", "in", ALL_USER_IDS).execute();
  });

  it("locks the single shared copy so a concurrent accept and loan never both claim it", async () => {
    const slug = `race-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Race Group", description: null, code: null },
      GIVER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, RECEIVER_ID, "member");

    // RECEIVER wishes 1 of PRINTING_1, shared to the group.
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

    // GIVER owns exactly one unclaimed copy, offered on a shared tradelist —
    // the same physical copy is also lendable, since nothing has claimed it yet.
    const collection = await db
      .insertInto("collections")
      .values({ userId: GIVER_ID, name: "Race Binder", isInbox: false, sortOrder: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    const copy = await db
      .insertInto("copies")
      .values({ printingId: PRINTING_1.id, collectionId: collection.id })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tradeList = await db
      .insertInto("lists")
      .values({ userId: GIVER_ID, name: "Haves", intent: "trade", kind: "copy" })
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

    const trade = await createTrade(repos, {
      callerUserId: RECEIVER_ID,
      groupSlug: group.slug,
      counterpartyUserId: GIVER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    expect(trade.status).toBe("pending");

    // The giver accepts the pending trade (reserving the copy for the trade)
    // and, concurrently, lends the same copy out (free-text borrower — no
    // third member needed, since both services draw from the giver's own
    // unclaimed-copy pool for this printing).
    const [acceptResult, loanResult] = await Promise.allSettled([
      acceptTrade(transact, trade.id, GIVER_ID),
      createLoan(transact, {
        lenderUserId: GIVER_ID,
        printingId: PRINTING_1.id,
        quantity: 1,
        borrowerName: "Race Borrower",
      }),
    ]);

    // The `FOR UPDATE` lock in `copies.lockByIds` serializes the two
    // transactions on this copy: whichever commits first claims it, and the
    // other's post-lock re-check against the opposite claim table sees the
    // committed claim and 409s — never both succeeding, never both failing.
    const outcomes = [acceptResult, loanResult];
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });

    // The copy landed in exactly one of the two claim tables, never both.
    const tradeCopyRows = await db
      .selectFrom("cardTradeCopies")
      .select("copyId")
      .where("copyId", "=", copy.id)
      .execute();
    const loanCopyRows = await db
      .selectFrom("loanCopies")
      .select("copyId")
      .where("copyId", "=", copy.id)
      .execute();
    expect(tradeCopyRows.length + loanCopyRows.length).toBe(1);

    // Cross-check: the claim table that got the row matches which promise won.
    if (acceptResult.status === "fulfilled") {
      expect(tradeCopyRows).toHaveLength(1);
      expect(loanCopyRows).toHaveLength(0);
    } else {
      expect(loanCopyRows).toHaveLength(1);
      expect(tradeCopyRows).toHaveLength(0);
    }
  });
});
