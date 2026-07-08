import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import { acceptTrade, createTrade } from "../services/card-trades.js";
import { disposeCopies } from "../services/copies.js";
import {
  acknowledgeLoan,
  createLoan,
  deleteLoan,
  rejectLoan,
  returnLoanCopies,
  writeOffLoan,
} from "../services/loans.js";
import { CARD_FURY_UNIT, PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";

const LENDER_ID = crypto.randomUUID();
const BORROWER_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();
const ALL_USER_IDS = [LENDER_ID, BORROWER_ID, OUTSIDER_ID];

const ctx = createDbContext(LENDER_ID);

describe.skipIf(!ctx)("loansRepo (integration)", () => {
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
    // Loans first (cascading loan_copies), then trades, groups, lists, copies
    // (before their collections — a trigger blocks deleting a non-empty
    // collection), and collections. Users are file-owned and deleted last.
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

  let collectionCounter = 0;

  async function uniqueSlug(): Promise<string> {
    return `ln-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  /** @returns A fresh personal collection for the user (never the inbox). */
  async function freshCollection(userId: string): Promise<string> {
    collectionCounter += 1;
    const created = await db
      .insertInto("collections")
      .values({ userId, name: `Loan Binder ${collectionCounter}`, isInbox: false, sortOrder: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  }

  /** @returns `count` fresh copies of the printing in the collection. */
  async function addCopies(
    collectionId: string,
    count: number,
    printingId: string = PRINTING_1.id,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const copy = await db
        .insertInto("copies")
        .values({ printingId, collectionId })
        .returning("id")
        .executeTakeFirstOrThrow();
      ids.push(copy.id);
    }
    return ids;
  }

  /** @returns A fresh group with LENDER as owner and BORROWER as member. */
  async function groupWithBorrower() {
    const slug = await uniqueSlug();
    const group = await groupsRepo.createWithOwner(
      { slug, name: "Loan Test Group", description: null, code: null },
      LENDER_ID,
    );
    createdGroupIds.push(group.id);
    await groupsRepo.addMember(group.id, BORROWER_ID, "member");
    return group;
  }

  it("records a free-text loan, pins copies, and orients the DTO to the lender", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 3);

    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 2,
      borrowerName: "Bob from locals",
      contextCollectionId: collectionId,
    });

    expect(loan.status).toBe("active");
    expect(loan.role).toBe("lender");
    expect(loan.counterparty).toBeNull();
    expect(loan.counterpartyName).toBe("Bob from locals");
    expect(loan.quantity).toBe(2);
    expect(loan.returnedQuantity).toBe(0);
    expect(loan.cardId).toBe(CARD_FURY_UNIT.id);

    const pinned = await repos.loans.listPinnedCopyIds(loan.id);
    expect(pinned).toHaveLength(2);
    for (const copyId of pinned) {
      expect(copyIds).toContain(copyId);
    }

    // Pinned copies leave the lendable pool; the third copy stays.
    const unclaimed = await repos.loans.listUnclaimedCopyIds(LENDER_ID, PRINTING_1.id);
    for (const copyId of pinned) {
      expect(unclaimed).not.toContain(copyId);
    }
    const remaining = copyIds.filter((id) => !pinned.includes(id));
    expect(unclaimed).toContain(remaining[0]);
  });

  it("prefers the context collection when picking copies", async () => {
    const otherCollection = await freshCollection(LENDER_ID);
    await addCopies(otherCollection, 2);
    const contextCollection = await freshCollection(LENDER_ID);
    const contextCopies = await addCopies(contextCollection, 2);

    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 2,
      borrowerName: "Context Tester",
      contextCollectionId: contextCollection,
    });

    const pinned = await repos.loans.listPinnedCopyIds(loan.id);
    expect(pinned.toSorted()).toEqual(contextCopies.toSorted());
  });

  it("rejects lending more than the unclaimed copies", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    await addCopies(collectionId, 2, PRINTING_2.id);
    await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_2.id,
      quantity: 2,
      borrowerName: "First Borrower",
      contextCollectionId: collectionId,
    });

    await expect(
      createLoan(transact, {
        lenderUserId: LENDER_ID,
        printingId: PRINTING_2.id,
        quantity: 1,
        borrowerName: "Second Borrower",
        contextCollectionId: collectionId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("validates borrower shape and self-loans", async () => {
    await expect(
      createLoan(transact, {
        lenderUserId: LENDER_ID,
        printingId: PRINTING_1.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createLoan(transact, {
        lenderUserId: LENDER_ID,
        printingId: PRINTING_1.id,
        quantity: 1,
        borrowerUserId: BORROWER_ID,
        borrowerName: "Both set",
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createLoan(transact, {
        lenderUserId: LENDER_ID,
        printingId: PRINTING_1.id,
        quantity: 1,
        borrowerUserId: LENDER_ID,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires a member borrower to share a group", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    await addCopies(collectionId, 1);

    // OUTSIDER shares no group with LENDER.
    await expect(
      createLoan(transact, {
        lenderUserId: LENDER_ID,
        printingId: PRINTING_1.id,
        quantity: 1,
        borrowerUserId: OUTSIDER_ID,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("runs the member acknowledge/reject flow and the borrower badge count", async () => {
    await groupWithBorrower();
    const collectionId = await freshCollection(LENDER_ID);
    await addCopies(collectionId, 1);

    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 1,
      borrowerUserId: BORROWER_ID,
      contextCollectionId: collectionId,
    });

    // Borrower orientation: counterparty is the lender, acknowledge pending.
    const borrowerView = await repos.loans.getDtoByIdForUser(loan.id, BORROWER_ID);
    expect(borrowerView?.role).toBe("borrower");
    expect(borrowerView?.counterparty?.userId).toBe(LENDER_ID);
    expect(borrowerView?.actionNeeded).toBe("acknowledge");
    expect(await repos.loans.acknowledgeNeededCountForUser(BORROWER_ID)).toBe(1);

    // Only the borrower can acknowledge; strangers get a 404.
    await expect(acknowledgeLoan(transact, loan.id, OUTSIDER_ID)).rejects.toMatchObject({
      status: 404,
    });

    const acknowledged = await acknowledgeLoan(transact, loan.id, BORROWER_ID);
    expect(acknowledged.acknowledgedAt).not.toBeNull();
    expect(acknowledged.actionNeeded).toBeNull();
    expect(await repos.loans.acknowledgeNeededCountForUser(BORROWER_ID)).toBe(0);

    // Reject flips the state back and clears the acknowledgment.
    const rejected = await rejectLoan(transact, loan.id, BORROWER_ID);
    expect(rejected.rejectedAt).not.toBeNull();
    expect(rejected.acknowledgedAt).toBeNull();

    // The lender sees the rejection; the loan stays active on their side.
    const lenderView = await repos.loans.getDtoByIdForUser(loan.id, LENDER_ID);
    expect(lenderView?.status).toBe("active");
    expect(lenderView?.rejectedAt).not.toBeNull();
  });

  it("handles partial returns and closes when everything is back", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    await addCopies(collectionId, 3);
    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 3,
      borrowerName: "Partial Pat",
      contextCollectionId: collectionId,
    });

    const partial = await returnLoanCopies(transact, loan.id, LENDER_ID, 2);
    expect(partial.status).toBe("active");
    expect(partial.returnedQuantity).toBe(2);
    expect(await repos.loans.listPinnedCopyIds(loan.id)).toHaveLength(1);

    // More than outstanding is a 400.
    await expect(returnLoanCopies(transact, loan.id, LENDER_ID, 2)).rejects.toMatchObject({
      status: 400,
    });

    const closed = await returnLoanCopies(transact, loan.id, LENDER_ID, 1);
    expect(closed.status).toBe("returned");
    expect(closed.closedAt).not.toBeNull();
    expect(await repos.loans.listPinnedCopyIds(loan.id)).toHaveLength(0);

    // A closed loan can't take more returns.
    await expect(returnLoanCopies(transact, loan.id, LENDER_ID, 1)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("write-off with removal disposes the outstanding copies and logs events", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 2);
    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 2,
      borrowerName: "Vanished Vlad",
      contextCollectionId: collectionId,
    });

    const closed = await writeOffLoan(transact, loan.id, LENDER_ID, true);
    expect(closed.status).toBe("written_off");
    expect(closed.closedAt).not.toBeNull();

    const remainingCopies = await db
      .selectFrom("copies")
      .select("id")
      .where("id", "in", copyIds)
      .execute();
    expect(remainingCopies).toHaveLength(0);

    const events = await db
      .selectFrom("collectionEvents")
      .select("id")
      .where("userId", "=", LENDER_ID)
      .where("action", "=", "removed")
      .where("fromCollectionId", "=", collectionId)
      .execute();
    expect(events).toHaveLength(2);
  });

  it("write-off without removal keeps the copies and releases the pins", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 1);
    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 1,
      borrowerName: "Skipped Sam",
      contextCollectionId: collectionId,
    });

    const closed = await writeOffLoan(transact, loan.id, LENDER_ID, false);
    expect(closed.status).toBe("written_off");
    expect(await repos.loans.listPinnedCopyIds(loan.id)).toHaveLength(0);

    // The stale copy survives and is claimable again — the cost of skipping.
    const unclaimed = await repos.loans.listUnclaimedCopyIds(LENDER_ID, PRINTING_1.id);
    expect(unclaimed).toContain(copyIds[0]);
  });

  it("refuses to dispose a copy that is out on a loan", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 1);
    await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 1,
      borrowerName: "Dispose Guard",
      contextCollectionId: collectionId,
    });

    await expect(disposeCopies(transact, LENDER_ID, [copyIds[0]!])).rejects.toMatchObject({
      status: 409,
    });
  });

  it("deleting a loan releases its pins", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 1);
    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 1,
      borrowerName: "Mistake Mia",
      contextCollectionId: collectionId,
    });

    // Only the lender may delete.
    await expect(deleteLoan(transact, loan.id, BORROWER_ID)).rejects.toMatchObject({
      status: 404,
    });

    await deleteLoan(transact, loan.id, LENDER_ID);
    expect(await repos.loans.getById(loan.id)).toBeUndefined();
    const unclaimed = await repos.loans.listUnclaimedCopyIds(LENDER_ID, PRINTING_1.id);
    expect(unclaimed).toContain(copyIds[0]);
  });

  it("keeps loaned copies out of the deck-building inventory count", async () => {
    const collectionId = await freshCollection(LENDER_ID);
    await addCopies(collectionId, 3, PRINTING_2.id);

    const countFor = async () => {
      const rows = await repos.copies.countByCardAndPrintingForDeckbuilding(LENDER_ID);
      return rows.find((row) => row.printingId === PRINTING_2.id)?.count ?? 0;
    };

    const before = await countFor();
    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_2.id,
      quantity: 2,
      borrowerName: "Deck Avail",
      contextCollectionId: collectionId,
    });
    expect(await countFor()).toBe(before - 2);

    await returnLoanCopies(transact, loan.id, LENDER_ID, 2);
    expect(await countFor()).toBe(before);
  });

  it("keeps loaned copies out of trade supply and reservation", async () => {
    // Full ADR-019 match shape: borrower wishes 2, lender offers 2 shared
    // tradelist copies — then one of them goes out on a loan.
    const group = await groupWithBorrower();

    const wish = await db
      .insertInto("lists")
      .values({ userId: BORROWER_ID, name: "Wants", intent: "wish", kind: "printing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: BORROWER_ID,
        kind: "printing",
        printingId: PRINTING_1.id,
        quantity: 2,
      })
      .execute();
    await groupsRepo.share(group.id, wish.id, BORROWER_ID);

    const collectionId = await freshCollection(LENDER_ID);
    const copyIds = await addCopies(collectionId, 2);
    const tradeList = await db
      .insertInto("lists")
      .values({ userId: LENDER_ID, name: "Haves", intent: "trade", kind: "copy" })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const copyId of copyIds) {
      await db
        .insertInto("listEntries")
        .values({ listId: tradeList.id, userId: LENDER_ID, kind: "copy", copyId, quantity: 1 })
        .execute();
    }
    await groupsRepo.share(group.id, tradeList.id, LENDER_ID);

    const loan = await createLoan(transact, {
      lenderUserId: LENDER_ID,
      printingId: PRINTING_1.id,
      quantity: 1,
      borrowerName: "Loaned Away",
      contextCollectionId: collectionId,
    });
    const loanedPins = await repos.loans.listPinnedCopyIds(loan.id);
    const loanedCopyId = loanedPins[0]!;

    // With one copy on loan only one is offerable, so a request for 2 fails.
    await expect(
      createTrade(repos, {
        callerUserId: BORROWER_ID,
        groupSlug: group.slug,
        counterpartyUserId: LENDER_ID,
        role: "receiver",
        printingId: PRINTING_1.id,
        quantity: 2,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const trade = await createTrade(repos, {
      callerUserId: BORROWER_ID,
      groupSlug: group.slug,
      counterpartyUserId: LENDER_ID,
      role: "receiver",
      printingId: PRINTING_1.id,
      quantity: 1,
    });
    await acceptTrade(transact, trade.id, LENDER_ID);

    // The reservation pinned the copy that is NOT on loan.
    const reserved = await repos.cardTrades.listReservedCopyIds(trade.id);
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).not.toBe(loanedCopyId);
  });
});
