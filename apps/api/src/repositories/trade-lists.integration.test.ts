import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { tradeListsRepo } from "./trade-lists.js";

// ---------------------------------------------------------------------------
// Integration tests: tradeListsRepo
//
// Uses the shared integration database with pre-seeded OGS card data.
// Trade lists are user-scoped; items require copies (which need a collection
// and printing). We set up the prerequisite rows in the first tests and clean
// up everything in afterAll.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0032-4000-a000-000000000001";
const OTHER_USER_ID = "a0000000-0031-4000-a000-000000000001";

const ctx = createDbContext(USER_ID);

describe.skipIf(!ctx)("tradeListsRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db, userId } = ctx!;
  const repo = tradeListsRepo(db);

  // IDs captured during tests for cleanup
  let tradeListId: string;
  let secondTradeListId: string;
  let collectionId: string;
  let copyId1: string;
  let copyId2: string;
  let tradeListItemId: string;

  afterAll(async () => {
    // Delete in reverse order of creation to respect foreign keys
    if (tradeListItemId) {
      await db.deleteFrom("tradeListItems").where("id", "=", tradeListItemId).execute();
    }
    if (copyId1) {
      await db.deleteFrom("copies").where("id", "=", copyId1).execute();
    }
    if (copyId2) {
      await db.deleteFrom("copies").where("id", "=", copyId2).execute();
    }
    if (collectionId) {
      await db.deleteFrom("collections").where("id", "=", collectionId).execute();
    }
    if (tradeListId) {
      await db.deleteFrom("tradeLists").where("id", "=", tradeListId).execute();
    }
    if (secondTradeListId) {
      await db.deleteFrom("tradeLists").where("id", "=", secondTradeListId).execute();
    }
  });

  // ── create ──────────────────────────────────────────────────────────────

  it("creates a trade list", async () => {
    const list = await repo.create({ userId, name: "Haves", rules: null });

    expect(list.id).toBeTypeOf("string");
    expect(list.userId).toBe(userId);
    expect(list.name).toBe("Haves");
    expect(list.rules).toBeNull();
    tradeListId = list.id;
  });

  it("creates a second trade list for ordering tests", async () => {
    const list = await repo.create({ userId, name: "Alpha List", rules: null });

    expect(list.name).toBe("Alpha List");
    secondTradeListId = list.id;
  });

  // ── listForUser ─────────────────────────────────────────────────────────

  it("lists trade lists for the user ordered by name", async () => {
    const lists = await repo.listForUser(userId);

    expect(lists.length).toBe(2);
    // "Alpha List" should come before "Haves"
    expect(lists[0].name).toBe("Alpha List");
    expect(lists[1].name).toBe("Haves");
  });

  it("returns empty array for a different user", async () => {
    const lists = await repo.listForUser(OTHER_USER_ID);
    // Other user may have data from other tests, but shouldn't have our lists
    const ourLists = lists.filter((l) => l.id === tradeListId || l.id === secondTradeListId);

    expect(ourLists).toEqual([]);
  });

  // ── getByIdForUser ──────────────────────────────────────────────────────

  it("returns a trade list by ID for the owning user", async () => {
    const list = await repo.getByIdForUser(tradeListId, userId);

    expect(list).toBeDefined();
    expect(list!.id).toBe(tradeListId);
    expect(list!.name).toBe("Haves");
  });

  it("returns undefined when fetched by a different user", async () => {
    const result = await repo.getByIdForUser(tradeListId, OTHER_USER_ID);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a nonexistent ID", async () => {
    const result = await repo.getByIdForUser("00000000-0000-0000-0000-000000000000", userId);

    expect(result).toBeUndefined();
  });

  // ── exists ──────────────────────────────────────────────────────────────

  it("returns the id when the trade list exists for the user", async () => {
    const result = await repo.exists(tradeListId, userId);

    expect(result).toEqual({ id: tradeListId });
  });

  it("returns undefined when checked by a different user", async () => {
    const result = await repo.exists(tradeListId, OTHER_USER_ID);

    expect(result).toBeUndefined();
  });

  // ── update ──────────────────────────────────────────────────────────────

  it("updates a trade list and returns the updated row", async () => {
    const updated = await repo.update(tradeListId, userId, { name: "Updated Haves" });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated Haves");
  });

  it("returns undefined when updating as a different user", async () => {
    const result = await repo.update(tradeListId, OTHER_USER_ID, { name: "Hijacked" });

    expect(result).toBeUndefined();
  });

  // ── trade list items (requires copies) ──────────────────────────────────

  it("sets up a collection and copies for item tests", async () => {
    // Create a collection for the user
    const col = await db
      .insertInto("collections")
      .values({ userId, name: "Test Collection 0032" })
      .returningAll()
      .executeTakeFirstOrThrow();
    collectionId = col.id;

    // Create copies referencing seed printings
    const copy1 = await db
      .insertInto("copies")
      .values({ userId, collectionId, printingId: PRINTING_1.id })
      .returningAll()
      .executeTakeFirstOrThrow();
    copyId1 = copy1.id;

    const copy2 = await db
      .insertInto("copies")
      .values({ userId, collectionId, printingId: PRINTING_2.id })
      .returningAll()
      .executeTakeFirstOrThrow();
    copyId2 = copy2.id;

    expect(copyId1).toBeTypeOf("string");
    expect(copyId2).toBeTypeOf("string");
  });

  it("creates a trade list item", async () => {
    const item = await repo.createItem({
      tradeListId,
      userId,
      copyId: copyId1,
    });

    expect(item.id).toBeTypeOf("string");
    expect(item.tradeListId).toBe(tradeListId);
    expect(item.copyId).toBe(copyId1);
    tradeListItemId = item.id;
  });

  // ── itemsWithDetails ────────────────────────────────────────────────────

  it("returns items with card, printing, and copy details", async () => {
    const items = await repo.itemsWithDetails(tradeListId, userId);

    expect(items.length).toBe(1);
    expect(items[0].id).toBe(tradeListItemId);
    expect(items[0].copyId).toBe(copyId1);
    expect(items[0].printingId).toBe(PRINTING_1.id);
    expect(items[0].cardName).toBeTypeOf("string");
    expect(items[0].cardType).toBeTypeOf("string");
    expect(items[0].rarity).toBe("epic");
    expect(items[0].finish).toBe("normal");
  });

  it("returns empty array for items with a wrong userId", async () => {
    const items = await repo.itemsWithDetails(tradeListId, OTHER_USER_ID);

    expect(items).toEqual([]);
  });

  // ── deleteItem ──────────────────────────────────────────────────────────

  it("deletes a trade list item", async () => {
    const result = await repo.deleteItem(tradeListItemId, tradeListId, userId);

    expect(result.numDeletedRows).toBe(1n);
    // Clear so afterAll doesn't try to double-delete
    tradeListItemId = "";
  });

  it("returns 0 deleted rows for a nonexistent item", async () => {
    const result = await repo.deleteItem(
      "00000000-0000-0000-0000-000000000000",
      tradeListId,
      userId,
    );

    expect(result.numDeletedRows).toBe(0n);
  });

  // ── deleteByIdForUser ───────────────────────────────────────────────────

  it("deletes a trade list by id and userId", async () => {
    const result = await repo.deleteByIdForUser(secondTradeListId, userId);

    expect(result.numDeletedRows).toBe(1n);
    // Clear so afterAll doesn't try to double-delete
    secondTradeListId = "";
  });

  it("returns 0 deleted rows when deleting as a different user", async () => {
    const result = await repo.deleteByIdForUser(tradeListId, OTHER_USER_ID);

    expect(result.numDeletedRows).toBe(0n);
  });
});
