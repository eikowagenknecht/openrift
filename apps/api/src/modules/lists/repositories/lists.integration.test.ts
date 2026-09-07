import { afterAll, describe, expect, it } from "vitest";

import {
  CARD_CALM_UNIT,
  CARD_FURY_SPELL,
  CARD_FURY_UNIT,
  PRINTING_1,
} from "../../../test/fixtures/constants.js";
import { createDbContext } from "../../../test/integration-context.js";
import { listsRepo } from "./lists.js";

const ctx = createDbContext("a0000000-0040-4000-a000-000000000001");

describe.skipIf(!ctx)("listsRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = listsRepo(db);

  // Track IDs for cleanup. list_entries cascades on lists delete, but copies
  // and collections we create directly need their own cleanup.
  const createdListIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdCopyIds: string[] = [];
  const createdGroupIds: string[] = [];

  afterAll(async () => {
    if (createdListIds.length > 0) {
      await db.deleteFrom("lists").where("id", "in", createdListIds).execute();
    }
    if (createdCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", createdCopyIds).execute();
    }
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
    // Members and the group go last — collections referencing the group must be
    // gone first (handled above).
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroupMembers").where("groupId", "in", createdGroupIds).execute();
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
  });

  async function createTestCopy() {
    let collection = await db
      .selectFrom("collections")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst();
    if (!collection) {
      collection = await db
        .insertInto("collections")
        .values({
          userId,
          name: "Lists Test Binder",
          isInbox: false,
          sortOrder: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      createdCollectionIds.push(collection.id);
    }
    const copy = await db
      .insertInto("copies")
      .values({
        collectionId: collection.id,
        printingId: PRINTING_1.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCopyIds.push(copy.id);
    return copy;
  }

  // A copy living in a *group* collection the user is a member of. The user can
  // see it, but doesn't personally own it — so it must not be addable to a
  // trade/wish list (personalOnly), only to an organize list.
  async function createGroupCopy() {
    const group = await db
      .insertInto("friendGroups")
      .values({ slug: `lists-test-group-${createdGroupIds.length}`, name: "Lists Test Group" })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdGroupIds.push(group.id);
    await db
      .insertInto("friendGroupMembers")
      .values({ groupId: group.id, userId, role: "member" })
      .execute();
    const groupCollection = await db
      .insertInto("collections")
      .values({ groupId: group.id, name: "Group Binder", isInbox: false, sortOrder: 1 })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(groupCollection.id);
    const copy = await db
      .insertInto("copies")
      .values({ collectionId: groupCollection.id, printingId: PRINTING_1.id })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCopyIds.push(copy.id);
    return copy;
  }

  it("creates a list for each allowed intent × kind combo", async () => {
    const combos: { intent: "wish" | "trade" | "organize"; kind: "card" | "printing" | "copy" }[] =
      [
        { intent: "wish", kind: "card" },
        { intent: "wish", kind: "printing" },
        { intent: "trade", kind: "copy" },
        { intent: "organize", kind: "card" },
        { intent: "organize", kind: "printing" },
        { intent: "organize", kind: "copy" },
      ];
    for (const { intent, kind } of combos) {
      const list = await repo.create({ userId, name: `Test ${intent}/${kind}`, intent, kind });
      createdListIds.push(list.id);
      expect(list.intent).toBe(intent);
      expect(list.kind).toBe(kind);
      expect(list.isPublic).toBe(false);
      expect(list.shareToken).toBeNull();
    }
  });

  it("rejects disallowed intent × kind combos at the DB layer", async () => {
    // CHECK chk_lists_intent_kind blocks: wish×copy, trade×card, trade×printing.
    for (const bad of [
      { intent: "wish" as const, kind: "copy" as const },
      { intent: "trade" as const, kind: "card" as const },
      { intent: "trade" as const, kind: "printing" as const },
    ]) {
      await expect(
        repo.create({ userId, name: `Bad ${bad.intent}/${bad.kind}`, ...bad }),
      ).rejects.toThrow();
    }
  });

  it("filters listForUser by intent", async () => {
    const buyLists = await repo.listForUser(userId, "wish");
    const sellLists = await repo.listForUser(userId, "trade");
    expect(buyLists.every((l) => l.intent === "wish")).toBe(true);
    expect(sellLists.every((l) => l.intent === "trade")).toBe(true);
    expect(buyLists.length).toBeGreaterThanOrEqual(1);
    expect(sellLists.length).toBeGreaterThanOrEqual(1);
  });

  it("listForUser includes the per-list entry count", async () => {
    const list = await repo.create({
      userId,
      name: "Count check",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    await repo.bulkCreateEntries("card", [
      { listId: list.id, userId, kind: "card", cardId: CARD_FURY_UNIT.id, quantity: 1 },
    ]);
    const all = await repo.listForUser(userId);
    const fetched = all.find((l) => l.id === list.id);
    expect(fetched?.entryCount).toBe(1);
    // Empty lists must still surface a zero count (correlated subquery, not GROUP BY).
    const empty = await repo.create({
      userId,
      name: "Empty",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(empty.id);
    const allAgain = await repo.listForUser(userId);
    expect(allAgain.find((l) => l.id === empty.id)?.entryCount).toBe(0);
  });

  it("getByIdForUser scopes to the owner", async () => {
    const list = await repo.create({
      userId,
      name: "Scoped",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(list.id);
    const otherUserId = "a0000000-9999-4000-a000-000000000099";
    expect(await repo.getByIdForUser(list.id, otherUserId)).toBeUndefined();
    expect(await repo.getByIdForUser(list.id, userId)).toBeDefined();
  });

  it("getIdKindIntent returns id + kind + intent for the owner only", async () => {
    const list = await repo.create({
      userId,
      name: "IdKind",
      intent: "wish",
      kind: "printing",
    });
    createdListIds.push(list.id);
    expect(await repo.getIdKindIntent(list.id, userId)).toEqual({
      id: list.id,
      kind: "printing",
      intent: "wish",
    });
    expect(
      await repo.getIdKindIntent(list.id, "a0000000-9999-4000-a000-000000000099"),
    ).toBeUndefined();
  });

  it("updates a list name", async () => {
    const list = await repo.create({
      userId,
      name: "Before",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const updated = await repo.update(list.id, userId, { name: "After" });
    expect(updated?.name).toBe("After");
  });

  it("deletes a list", async () => {
    const list = await repo.create({ userId, name: "Doomed", intent: "wish", kind: "card" });
    const result = await repo.deleteByIdForUser(list.id, userId);
    expect(result.numDeletedRows).toBe(1n);
    expect(await repo.getByIdForUser(list.id, userId)).toBeUndefined();
  });

  it("setShareToken sets and clears the public share state", async () => {
    const list = await repo.create({
      userId,
      name: "Shareable",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(list.id);

    const shared = await repo.setShareToken(list.id, userId, "tok-abc", true);
    expect(shared?.isPublic).toBe(true);
    expect(shared?.shareToken).toBe("tok-abc");

    const found = await repo.findByShareToken("tok-abc");
    expect(found?.list.id).toBe(list.id);

    const unshared = await repo.setShareToken(list.id, userId, null, false);
    expect(unshared?.isPublic).toBe(false);
    expect(unshared?.shareToken).toBeNull();
    expect(await repo.findByShareToken("tok-abc")).toBeUndefined();
  });

  it("findByShareToken requires isPublic=true even when a token exists", async () => {
    const list = await repo.create({
      userId,
      name: "Token only",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(list.id);
    await db
      .updateTable("lists")
      .set({ shareToken: "dangling-tok", isPublic: false })
      .where("id", "=", list.id)
      .execute();
    expect(await repo.findByShareToken("dangling-tok")).toBeUndefined();
  });

  it("creates a card-kind entry on a card-kind list", async () => {
    const list = await repo.create({
      userId,
      name: "Card entries",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 4,
    });
    expect(entry.cardId).toBe(CARD_FURY_UNIT.id);
    expect(entry.kind).toBe("card");
    expect(entry.quantity).toBe(4);
  });

  it("creates a printing-kind entry on a printing-kind list", async () => {
    const list = await repo.create({
      userId,
      name: "Printing entries",
      intent: "wish",
      kind: "printing",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "printing",
      cardId: null,
      printingId: PRINTING_1.id,
      copyId: null,
      quantity: 1,
    });
    expect(entry.printingId).toBe(PRINTING_1.id);
    expect(entry.kind).toBe("printing");
  });

  it("creates a copy-kind entry and cascades on copy delete", async () => {
    const copy = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Copy entries",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "copy",
      cardId: null,
      printingId: null,
      copyId: copy.id,
      quantity: 1,
    });
    expect(entry.copyId).toBe(copy.id);

    await db.deleteFrom("copies").where("id", "=", copy.id).execute();
    createdCopyIds.splice(createdCopyIds.indexOf(copy.id), 1);

    const surviving = await db
      .selectFrom("listEntries")
      .selectAll()
      .where("id", "=", entry.id)
      .executeTakeFirst();
    expect(surviving).toBeUndefined();
  });

  it("rejects an entry whose kind doesn't match the list", async () => {
    const list = await repo.create({
      userId,
      name: "Mismatched",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    // The composite FK (list_id, kind) → lists(id, kind) blocks this at the
    // DB layer regardless of which target columns are set.
    await expect(
      repo.createEntry({
        listId: list.id,
        userId,
        kind: "printing",
        cardId: null,
        printingId: PRINTING_1.id,
        copyId: null,
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects a card-kind entry without a card_id (CHECK shape)", async () => {
    const list = await repo.create({
      userId,
      name: "Bad shape",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    await expect(
      repo.createEntry({
        listId: list.id,
        userId,
        kind: "card",
        cardId: null,
        printingId: null,
        copyId: null,
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate card-kind entry on the same list", async () => {
    const list = await repo.create({
      userId,
      name: "Dedup card",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    await expect(
      repo.createEntry({
        listId: list.id,
        userId,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        printingId: null,
        copyId: null,
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it("allows the same printing across different lists", async () => {
    const listA = await repo.create({
      userId,
      name: "List A",
      intent: "wish",
      kind: "printing",
    });
    const listB = await repo.create({
      userId,
      name: "List B",
      intent: "wish",
      kind: "printing",
    });
    createdListIds.push(listA.id, listB.id);
    await repo.createEntry({
      listId: listA.id,
      userId,
      kind: "printing",
      cardId: null,
      printingId: PRINTING_1.id,
      copyId: null,
      quantity: 1,
    });
    await expect(
      repo.createEntry({
        listId: listB.id,
        userId,
        kind: "printing",
        cardId: null,
        printingId: PRINTING_1.id,
        copyId: null,
        quantity: 1,
      }),
    ).resolves.toBeDefined();
  });

  it("bulkCreateEntries inserts and merges dupes within one kind", async () => {
    const list = await repo.create({ userId, name: "Bulk", intent: "wish", kind: "card" });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntries("card", [
      {
        listId: list.id,
        userId,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        printingId: null,
        copyId: null,
        quantity: 1,
      },
      // Duplicate — pre-aggregated before INSERT so quantities sum into one
      // row. Postgres won't let two in-statement rows both hit ON CONFLICT
      // DO UPDATE on the same target, so the dedup happens in app code.
      {
        listId: list.id,
        userId,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        printingId: null,
        copyId: null,
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ inserted: 1, updated: 0 });

    // The single surviving entry's quantity reflects both inputs.
    const rows = await repo.entriesWithDetails(list.id, "card", userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(2);
  });

  it("bulkCreateEntries bumps quantity on a later call against an existing entry", async () => {
    const list = await repo.create({ userId, name: "Bulk repeat", intent: "wish", kind: "card" });
    createdListIds.push(list.id);

    const entry = {
      listId: list.id,
      userId,
      kind: "card" as const,
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    };

    expect(await repo.bulkCreateEntries("card", [entry])).toEqual({ inserted: 1, updated: 0 });
    expect(await repo.bulkCreateEntries("card", [entry])).toEqual({ inserted: 0, updated: 1 });
    expect(await repo.bulkCreateEntries("card", [{ ...entry, quantity: 3 }])).toEqual({
      inserted: 0,
      updated: 1,
    });

    const rows = await repo.entriesWithDetails(list.id, "card", userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(5);
  });

  // ON CONFLICT (list_id, copy_id) must carry the partial-index predicate
  // (`WHERE copy_id IS NOT NULL`), or Postgres raises "no unique or exclusion
  // constraint matching the ON CONFLICT specification" on copy-kind bulk
  // inserts.
  it("bulkCreateEntries works with copy-kind entries (partial-index ON CONFLICT)", async () => {
    const copyA = await createTestCopy();
    const copyB = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Bulk copy",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntries("copy", [
      {
        listId: list.id,
        userId,
        kind: "copy",
        cardId: null,
        printingId: null,
        copyId: copyA.id,
        quantity: 1,
      },
      {
        listId: list.id,
        userId,
        kind: "copy",
        cardId: null,
        printingId: null,
        copyId: copyB.id,
        quantity: 1,
      },
      // Duplicate copyA — copy-kind lists use DO NOTHING (a copy is singular,
      // not "quantity 2 of this physical card"), so the dupe is dropped and
      // doesn't appear in the returned counts.
      {
        listId: list.id,
        userId,
        kind: "copy",
        cardId: null,
        printingId: null,
        copyId: copyA.id,
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ inserted: 2, updated: 0 });

    // The original copyA entry stays at quantity 1 — no merge.
    const rows = await repo.entriesWithDetails(list.id, "copy", userId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.quantity === 1)).toBe(true);
  });

  it("bulkCreateEntries returns zero counts for empty input without a DB roundtrip", async () => {
    const result = await repo.bulkCreateEntries("card", []);
    expect(result).toEqual({ inserted: 0, updated: 0 });
  });

  it("bulkCreateEntriesFromCopies inserts one copy entry per owned copy on a copy-kind list", async () => {
    const copyA = await createTestCopy();
    const copyB = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "From copies (copy)",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "copy",
      userId,
      [copyA.id, copyB.id],
      true,
    );
    expect(result).toEqual({ added: 2, updated: 0, skipped: 0 });

    const rows = await repo.entriesWithDetails(list.id, "copy", userId);
    expect(rows).toHaveLength(2);
  });

  it("bulkCreateEntriesFromCopies dedups to distinct printings on a printing-kind list", async () => {
    // Both copies are of the same PRINTING_1, so the printing-kind list ends
    // up with a single entry even though two copies were dragged.
    const copyA = await createTestCopy();
    const copyB = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "From copies (printing)",
      intent: "wish",
      kind: "printing",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "printing",
      userId,
      [copyA.id, copyB.id],
      true,
    );
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 });
  });

  it("bulkCreateEntriesFromCopies dedups to distinct cards on a card-kind list", async () => {
    const copyA = await createTestCopy();
    const copyB = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "From copies (card)",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "card",
      userId,
      [copyA.id, copyB.id],
      true,
    );
    // Both copies are of the same card via PRINTING_1.
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 });
  });

  it("bulkCreateEntriesFromCopies bumps quantity on a second drag of the same copies", async () => {
    const copy = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Drag re-add",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);

    expect(
      await repo.bulkCreateEntriesFromCopies(list.id, "card", userId, [copy.id], true),
    ).toEqual({
      added: 1,
      updated: 0,
      skipped: 0,
    });
    expect(
      await repo.bulkCreateEntriesFromCopies(list.id, "card", userId, [copy.id], true),
    ).toEqual({
      added: 0,
      updated: 1,
      skipped: 0,
    });

    const rows = await repo.entriesWithDetails(list.id, "card", userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(2);
  });

  // Copy-kind invariant: a copy is one specific physical card, so re-dragging
  // it can't legitimately increase its quantity. The second drag is reported
  // as `skipped`, not `updated`, and the existing entry stays at quantity 1.
  it("bulkCreateEntriesFromCopies keeps copy-kind entries singular on re-drag", async () => {
    const copy = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Copy re-add",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    expect(
      await repo.bulkCreateEntriesFromCopies(list.id, "copy", userId, [copy.id], true),
    ).toEqual({
      added: 1,
      updated: 0,
      skipped: 0,
    });
    expect(
      await repo.bulkCreateEntriesFromCopies(list.id, "copy", userId, [copy.id], true),
    ).toEqual({
      added: 0,
      updated: 0,
      skipped: 1,
    });

    const rows = await repo.entriesWithDetails(list.id, "copy", userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(1);
  });

  it("bulkCreateEntriesFromCopies treats non-owned copies as skipped", async () => {
    const list = await repo.create({
      userId,
      name: "Non-owned",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);

    const fakeCopyId = "a0000000-0040-4000-a000-0000000099aa";
    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "card",
      userId,
      [fakeCopyId],
      true,
    );
    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 });
  });

  it("bulkCreateEntriesFromCopies counts non-owned in skipped on mixed input", async () => {
    const copy = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Mixed owned/non-owned",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const fakeCopyId = "a0000000-0040-4000-a000-00000000bb22";
    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "copy",
      userId,
      [copy.id, fakeCopyId],
      true,
    );
    expect(result).toEqual({ added: 1, updated: 0, skipped: 1 });
  });

  // A copy in a shared group collection is visible to the member but isn't
  // theirs to trade away. With personalOnly it must be skipped on a trade
  // list, never added.
  it("bulkCreateEntriesFromCopies skips group-collection copies on a trade list (personalOnly)", async () => {
    const groupCopy = await createGroupCopy();
    const list = await repo.create({
      userId,
      name: "Trade (group copy)",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "copy",
      userId,
      [groupCopy.id],
      true,
    );
    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect(await repo.entriesWithDetails(list.id, "copy", userId)).toHaveLength(0);
  });

  // The same group copy is fine on an organize list, where personalOnly is off.
  it("bulkCreateEntriesFromCopies adds group-collection copies on an organize list", async () => {
    const groupCopy = await createGroupCopy();
    const list = await repo.create({
      userId,
      name: "Organize (group copy)",
      intent: "organize",
      kind: "copy",
    });
    createdListIds.push(list.id);

    const result = await repo.bulkCreateEntriesFromCopies(
      list.id,
      "copy",
      userId,
      [groupCopy.id],
      false,
    );
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(await repo.entriesWithDetails(list.id, "copy", userId)).toHaveLength(1);
  });

  it("entriesWithDetails returns enriched rows for card-kind lists", async () => {
    const list = await repo.create({
      userId,
      name: "Enriched card",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(list.id);
    await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    const rows = await repo.entriesWithDetails(list.id, "card", userId);
    expect(rows).toHaveLength(1);
    const cardRow = rows[0];
    expect(cardRow?.cardName).toBe(CARD_FURY_UNIT.name);
    expect(cardRow?.kind).toBe("card");
    if (cardRow?.kind === "card") {
      expect(cardRow.cardId).toBe(CARD_FURY_UNIT.id);
    }
    // Card-kind rows carry no printing/set details — they're not on the union variant.
    expect("setId" in (cardRow ?? {})).toBe(false);
    expect("printingId" in (cardRow ?? {})).toBe(false);
  });

  it("entriesWithDetails returns enriched rows for copy-kind lists", async () => {
    const copy = await createTestCopy();
    const list = await repo.create({
      userId,
      name: "Enriched copy",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(list.id);
    await repo.createEntry({
      listId: list.id,
      userId,
      kind: "copy",
      cardId: null,
      printingId: null,
      copyId: copy.id,
      quantity: 1,
    });
    const rows = await repo.entriesWithDetails(list.id, "copy", userId);
    expect(rows).toHaveLength(1);
    const copyRow = rows[0];
    expect(copyRow?.kind).toBe("copy");
    if (copyRow?.kind === "copy") {
      expect(copyRow.setId).not.toBeNull();
      expect(copyRow.collectionId).not.toBeNull();
      // Copy-kind: the rendering printing comes from the underlying copy.
      expect(copyRow.printingId).toBe(PRINTING_1.id);
    }
  });

  it("entriesWithDetails user-scopes the result", async () => {
    const list = await repo.create({
      userId,
      name: "Scoped enriched",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    const wrongUser = "a0000000-9999-4000-a000-000000000099";
    expect(await repo.entriesWithDetails(list.id, "card", wrongUser)).toEqual([]);
  });

  it("updates an entry's quantity", async () => {
    const list = await repo.create({
      userId,
      name: "Update entry",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    const updated = await repo.updateEntry(entry.id, list.id, userId, { quantity: 5 });
    expect(updated?.quantity).toBe(5);
  });

  it("deletes an entry", async () => {
    const list = await repo.create({
      userId,
      name: "Delete entry",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    const result = await repo.deleteEntry(entry.id, list.id, userId);
    expect(result.numDeletedRows).toBe(1n);
  });

  it("deleteEntriesByIds removes only the given entries, scoped to the list", async () => {
    const list = await repo.create({ userId, name: "Bulk delete", intent: "wish", kind: "card" });
    createdListIds.push(list.id);
    const other = await repo.create({ userId, name: "Other list", intent: "wish", kind: "card" });
    createdListIds.push(other.id);

    const makeEntry = (listId: string, cardId: string) =>
      repo.createEntry({
        listId,
        userId,
        kind: "card",
        cardId,
        printingId: null,
        copyId: null,
        quantity: 1,
      });
    const fury = await makeEntry(list.id, CARD_FURY_UNIT.id);
    const spell = await makeEntry(list.id, CARD_FURY_SPELL.id);
    const calm = await makeEntry(list.id, CARD_CALM_UNIT.id);
    // An entry on a different list — passing its id must not delete it.
    const foreign = await makeEntry(other.id, CARD_FURY_UNIT.id);

    const result = await repo.deleteEntriesByIds([fury.id, calm.id, foreign.id], list.id, userId);
    expect(result.numDeletedRows).toBe(2n);

    // spell stayed on the list; foreign stayed on the other list.
    const spellDeleted = await repo.deleteEntry(spell.id, list.id, userId);
    expect(spellDeleted.numDeletedRows).toBe(1n);
    const foreignDeleted = await repo.deleteEntry(foreign.id, other.id, userId);
    expect(foreignDeleted.numDeletedRows).toBe(1n);
  });

  it("deleteEntriesByIds is a no-op for an empty id list", async () => {
    const list = await repo.create({ userId, name: "Empty delete", intent: "wish", kind: "card" });
    createdListIds.push(list.id);
    const result = await repo.deleteEntriesByIds([], list.id, userId);
    expect(result.numDeletedRows).toBe(0n);
  });

  it("deleting a list cascades its entries", async () => {
    const list = await repo.create({
      userId,
      name: "Cascade test",
      intent: "wish",
      kind: "card",
    });
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    await repo.deleteByIdForUser(list.id, userId);
    const surviving = await db
      .selectFrom("listEntries")
      .selectAll()
      .where("id", "=", entry.id)
      .executeTakeFirst();
    expect(surviving).toBeUndefined();
  });

  it("decrementEntryQuantity subtracts in-SQL and deletes on exhaustion", async () => {
    const list = await repo.create({
      userId,
      name: "Decrement",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 5,
    });

    expect(await repo.decrementEntryQuantity(entry.id, userId, 2)).toBe(3);
    expect(await repo.decrementEntryQuantity(entry.id, userId, 2)).toBe(1);

    expect(await repo.decrementEntryQuantity(entry.id, userId, 2)).toBeUndefined();
    const gone = await repo.getEntryByIdForUser(entry.id, userId);
    expect(gone).toBeUndefined();
  });

  it("decrementEntryQuantity is undefined and inert for a missing or foreign entry", async () => {
    const list = await repo.create({
      userId,
      name: "Decrement miss",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 3,
    });

    expect(await repo.decrementEntryQuantity(crypto.randomUUID(), userId, 1)).toBeUndefined();
    expect(
      await repo.decrementEntryQuantity(entry.id, "a0000000-9999-4000-a000-000000000099", 1),
    ).toBeUndefined();
    const untouched = await repo.getEntryByIdForUser(entry.id, userId);
    expect(untouched?.quantity).toBe(3);
  });

  it("raiseEntryQuantityTo lifts to the floor but never lowers", async () => {
    const list = await repo.create({
      userId,
      name: "Raise",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 2,
    });

    // Below the floor → raised; at/above → unchanged (GREATEST, not an assign).
    await repo.raiseEntryQuantityTo(entry.id, userId, 4);
    const raised = await repo.getEntryByIdForUser(entry.id, userId);
    expect(raised?.quantity).toBe(4);
    await repo.raiseEntryQuantityTo(entry.id, userId, 3);
    const held = await repo.getEntryByIdForUser(entry.id, userId);
    expect(held?.quantity).toBe(4);
  });

  it("raiseEntryQuantityTo is a no-op for a foreign owner", async () => {
    const list = await repo.create({
      userId,
      name: "Raise foreign",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(list.id);
    const entry = await repo.createEntry({
      listId: list.id,
      userId,
      kind: "card",
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    await repo.raiseEntryQuantityTo(entry.id, "a0000000-9999-4000-a000-000000000099", 9);
    const unchanged = await repo.getEntryByIdForUser(entry.id, userId);
    expect(unchanged?.quantity).toBe(1);
  });
});
