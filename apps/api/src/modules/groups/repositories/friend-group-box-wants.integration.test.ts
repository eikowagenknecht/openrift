import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CARD_FURY_SPELL,
  CARD_FURY_UNIT,
  PRINTING_1,
  PRINTING_2,
} from "../../../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../../../test/integration-context.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";
import { friendGroupsRepo } from "./friend-groups.js";

const VIEWER_ID = crypto.randomUUID();
const MEMBER_ID = crypto.randomUUID();

const ALT_PRINTING_OF_FURY_UNIT = "019d17a1-2723-733a-a21e-4630e4370046";

const ctx = createDbContext(VIEWER_ID);

// boxWantsForViewer reads every wishlist the viewer owns, not just ones
// shared with the group, so this file keeps its own users to avoid cross-file leakage.
describe.skipIf(!ctx)("friendGroupMatchesRepo.boxWantsForViewer (integration)", () => {
  const { db } = ctx!;
  const repo = friendGroupsRepo(db);
  const matches = friendGroupMatchesRepo(db);

  const createdGroupIds: string[] = [];
  const createdListIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdCopyIds: string[] = [];
  const createdLoanIds: string[] = [];
  const createdTradeIds: string[] = [];

  beforeAll(async () => {
    for (const id of [VIEWER_ID, MEMBER_ID]) {
      await seedTestUser(db, { id });
    }
  });

  afterEach(async () => {
    if (createdListIds.length > 0) {
      await db.deleteFrom("lists").where("id", "in", createdListIds).execute();
      createdListIds.length = 0;
    }
    if (createdTradeIds.length > 0) {
      await db.deleteFrom("cardTrades").where("id", "in", createdTradeIds).execute();
      createdTradeIds.length = 0;
    }
  });

  afterAll(async () => {
    if (createdLoanIds.length > 0) {
      await db.deleteFrom("loans").where("id", "in", createdLoanIds).execute();
    }
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    if (createdCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", createdCopyIds).execute();
    }
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
    await db.deleteFrom("users").where("id", "in", [VIEWER_ID, MEMBER_ID]).execute();
  });

  async function createGroup() {
    const slug = `fgbw-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const group = await repo.createWithOwner(
      { slug, name: "Box Wants Group", description: null, code: null },
      VIEWER_ID,
    );
    createdGroupIds.push(group.id);
    await repo.addMember(group.id, MEMBER_ID, "member");
    return group;
  }

  async function createBox(groupId: string, name = "Bulk Box") {
    const created = await db
      .insertInto("collections")
      .values({ groupId, name, isInbox: false, sortOrder: 1 })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(created.id);
    return created;
  }

  async function createPersonalCollection(userId: string) {
    const created = await db
      .insertInto("collections")
      .values({ userId, name: "Personal Binder", isInbox: false, sortOrder: 1 })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(created.id);
    return created;
  }

  async function addCopy(
    collectionId: string,
    printingId: string,
    values: { isAltered?: boolean } = {},
  ) {
    const copy = await db
      .insertInto("copies")
      .values({ collectionId, printingId, isAltered: values.isAltered ?? false })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCopyIds.push(copy.id);
    return copy;
  }

  async function createWishList(userId: string, kind: "card" | "printing") {
    const list = await db
      .insertInto("lists")
      .values({ userId, name: `Wants (${kind})`, intent: "wish", kind })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdListIds.push(list.id);
    return list;
  }

  async function wantCard(userId: string, cardId: string, quantity: number) {
    const list = await createWishList(userId, "card");
    await db
      .insertInto("listEntries")
      .values({ listId: list.id, userId, kind: "card", cardId, quantity })
      .execute();
    return list;
  }

  async function wantPrinting(userId: string, printingId: string, quantity: number) {
    const list = await createWishList(userId, "printing");
    await db
      .insertInto("listEntries")
      .values({ listId: list.id, userId, kind: "printing", printingId, quantity })
      .execute();
    return list;
  }

  async function loanOut(lenderUserId: string, copyId: string, printingId: string, cardId: string) {
    const loan = await db
      .insertInto("loans")
      .values({
        lenderUserId,
        borrowerName: "Ekko",
        printingId,
        cardId,
        quantity: 1,
        status: "active",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdLoanIds.push(loan.id);
    await db.insertInto("loanCopies").values({ loanId: loan.id, copyId }).execute();
    return loan;
  }

  function boxWants(groupId: string) {
    return matches.boxWantsForViewer({ groupId, viewerUserId: VIEWER_ID });
  }

  it("counts a card want against the box's copies of that card", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    await addCopy(box.id, PRINTING_1.id);
    await addCopy(box.id, PRINTING_1.id);
    await addCopy(box.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 2);

    expect(await boxWants(group.id)).toEqual([
      {
        collectionId: box.id,
        printingId: PRINTING_1.id,
        cardId: CARD_FURY_UNIT.id,
        fulfillableQuantity: 2,
      },
    ]);
  });

  it("counts a printing want against that exact printing only", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    await addCopy(box.id, PRINTING_1.id);
    await addCopy(box.id, ALT_PRINTING_OF_FURY_UNIT);
    await wantPrinting(VIEWER_ID, ALT_PRINTING_OF_FURY_UNIT, 5);

    expect(await boxWants(group.id)).toEqual([
      {
        collectionId: box.id,
        printingId: ALT_PRINTING_OF_FURY_UNIT,
        cardId: CARD_FURY_UNIT.id,
        fulfillableQuantity: 1,
      },
    ]);
  });

  it("ignores cards nobody wants, and boxes holding nothing wanted", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    await addCopy(box.id, PRINTING_2.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 1);

    expect(await boxWants(group.id)).toEqual([]);
    expect(PRINTING_2.cardId).toBe(CARD_FURY_SPELL.id);
  });

  it("skips a loaned or altered copy", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    const loaned = await addCopy(box.id, PRINTING_1.id);
    await addCopy(box.id, PRINTING_1.id, { isAltered: true });
    const takeable = await addCopy(box.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 3);

    await loanOut(MEMBER_ID, loaned.id, PRINTING_1.id, CARD_FURY_UNIT.id);
    expect(takeable.id).not.toBe(loaned.id);

    expect(await boxWants(group.id)).toEqual([
      {
        collectionId: box.id,
        printingId: PRINTING_1.id,
        cardId: CARD_FURY_UNIT.id,
        fulfillableQuantity: 1,
      },
    ]);
  });

  it("skips a copy a live trade has reserved", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    const reserved = await addCopy(box.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 1);

    expect(await boxWants(group.id)).toHaveLength(1);

    const trade = await db
      .insertInto("cardTrades")
      .values({
        groupId: group.id,
        giverUserId: MEMBER_ID,
        receiverUserId: VIEWER_ID,
        initiator: "giver",
        printingId: PRINTING_2.id,
        cardId: CARD_FURY_SPELL.id,
        quantity: 1,
        status: "reserved",
        // A CHECK constraint requires acceptedAt whenever status is "reserved".
        acceptedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdTradeIds.push(trade.id);
    await db
      .insertInto("cardTradeCopies")
      .values({ tradeId: trade.id, copyId: reserved.id })
      .execute();

    expect(await boxWants(group.id)).toEqual([]);
  });

  it("nets the want down by a firm live trade already promising the card", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    await addCopy(box.id, PRINTING_1.id);
    await addCopy(box.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 2);

    expect(await boxWants(group.id)).toMatchObject([{ fulfillableQuantity: 2 }]);

    const trade = await db
      .insertInto("cardTrades")
      .values({
        groupId: group.id,
        giverUserId: MEMBER_ID,
        receiverUserId: VIEWER_ID,
        initiator: "giver",
        printingId: PRINTING_1.id,
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
        status: "reserved",
        acceptedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdTradeIds.push(trade.id);

    expect(await boxWants(group.id)).toEqual([
      {
        collectionId: box.id,
        printingId: PRINTING_1.id,
        cardId: CARD_FURY_UNIT.id,
        fulfillableQuantity: 1,
      },
    ]);

    // Once the receiver syncs, the trade stops netting the want; it's
    // covered by owned copies again.
    await db
      .updateTable("cardTrades")
      .set({ receiverSyncAppliedAt: new Date() })
      .where("id", "=", trade.id)
      .execute();
    expect(await boxWants(group.id)).toMatchObject([{ fulfillableQuantity: 2 }]);
  });

  it("never counts another member's personal collection, shared or not", async () => {
    const group = await createGroup();
    const personal = await createPersonalCollection(MEMBER_ID);
    await addCopy(personal.id, PRINTING_1.id);
    await repo.shareCollection(group.id, personal.id, MEMBER_ID);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 1);

    expect(await boxWants(group.id)).toEqual([]);
  });

  it("answers per box, so one want can be filled from either", async () => {
    const group = await createGroup();
    const first = await createBox(group.id, "Box A");
    const second = await createBox(group.id, "Box B");
    await addCopy(first.id, PRINTING_1.id);
    await addCopy(second.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 1);

    const rows = await boxWants(group.id);
    expect(rows.map((row) => row.collectionId).sort()).toEqual([first.id, second.id].sort());
    expect(rows.every((row) => row.fulfillableQuantity === 1)).toBe(true);
  });

  it("reads only the boxes of the group it was asked about", async () => {
    const group = await createGroup();
    const other = await createGroup();
    const otherBox = await createBox(other.id);
    await addCopy(otherBox.id, PRINTING_1.id);
    await wantCard(VIEWER_ID, CARD_FURY_UNIT.id, 1);

    expect(await boxWants(group.id)).toEqual([]);
    expect(await boxWants(other.id)).toHaveLength(1);
  });

  it("returns nothing when the viewer has no wishlists", async () => {
    const group = await createGroup();
    const box = await createBox(group.id);
    await addCopy(box.id, PRINTING_1.id);

    expect(await matches.boxWantsForViewer({ groupId: group.id, viewerUserId: MEMBER_ID })).toEqual(
      [],
    );
  });
});
