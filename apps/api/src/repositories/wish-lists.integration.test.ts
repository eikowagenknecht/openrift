import { afterAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { wishListsRepo } from "./wish-lists.js";

// ---------------------------------------------------------------------------
// Integration tests: wishListsRepo
//
// Uses the shared integration database with pre-seeded OGS card data.
// Wish lists are user-scoped; items reference cardId or printingId from
// seed data (XOR constraint: exactly one must be non-null).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0033-4000-a000-000000000001";
const OTHER_USER_ID = "a0000000-0031-4000-a000-000000000001";

const ctx = createDbContext(USER_ID);

describe.skipIf(!ctx)("wishListsRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db, userId } = ctx!;
  const repo = wishListsRepo(db);

  // IDs captured during tests for cleanup
  let wishListId: string;
  let secondWishListId: string;
  let itemByCardId: string;
  let itemByPrintingId: string;

  afterAll(async () => {
    // Delete in reverse order of creation to respect foreign keys
    if (itemByCardId) {
      await db.deleteFrom("wishListItems").where("id", "=", itemByCardId).execute();
    }
    if (itemByPrintingId) {
      await db.deleteFrom("wishListItems").where("id", "=", itemByPrintingId).execute();
    }
    if (wishListId) {
      await db.deleteFrom("wishLists").where("id", "=", wishListId).execute();
    }
    if (secondWishListId) {
      await db.deleteFrom("wishLists").where("id", "=", secondWishListId).execute();
    }
  });

  // ── create ──────────────────────────────────────────────────────────────

  it("creates a wish list", async () => {
    const list = await repo.create({ userId, name: "Wants", rules: null });

    expect(list.id).toBeTypeOf("string");
    expect(list.userId).toBe(userId);
    expect(list.name).toBe("Wants");
    expect(list.rules).toBeNull();
    wishListId = list.id;
  });

  it("creates a second wish list for ordering and deletion tests", async () => {
    const list = await repo.create({ userId, name: "Alpha Wishes", rules: null });

    expect(list.name).toBe("Alpha Wishes");
    secondWishListId = list.id;
  });

  // ── listForUser ─────────────────────────────────────────────────────────

  it("lists wish lists for the user ordered by name", async () => {
    const lists = await repo.listForUser(userId);

    expect(lists.length).toBe(2);
    // "Alpha Wishes" should come before "Wants"
    expect(lists[0].name).toBe("Alpha Wishes");
    expect(lists[1].name).toBe("Wants");
  });

  it("returns empty array for a different user", async () => {
    const lists = await repo.listForUser(OTHER_USER_ID);
    const ourLists = lists.filter((l) => l.id === wishListId || l.id === secondWishListId);

    expect(ourLists).toEqual([]);
  });

  // ── getByIdForUser ──────────────────────────────────────────────────────

  it("returns a wish list by ID for the owning user", async () => {
    const list = await repo.getByIdForUser(wishListId, userId);

    expect(list).toBeDefined();
    expect(list!.id).toBe(wishListId);
    expect(list!.name).toBe("Wants");
  });

  it("returns undefined when fetched by a different user", async () => {
    const result = await repo.getByIdForUser(wishListId, OTHER_USER_ID);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a nonexistent ID", async () => {
    const result = await repo.getByIdForUser("00000000-0000-0000-0000-000000000000", userId);

    expect(result).toBeUndefined();
  });

  // ── exists ──────────────────────────────────────────────────────────────

  it("returns the id when the wish list exists for the user", async () => {
    const result = await repo.exists(wishListId, userId);

    expect(result).toEqual({ id: wishListId });
  });

  it("returns undefined when checked by a different user", async () => {
    const result = await repo.exists(wishListId, OTHER_USER_ID);

    expect(result).toBeUndefined();
  });

  // ── update ──────────────────────────────────────────────────────────────

  it("updates a wish list and returns the updated row", async () => {
    const updated = await repo.update(wishListId, userId, { name: "Updated Wants" });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated Wants");
  });

  it("returns undefined when updating as a different user", async () => {
    const result = await repo.update(wishListId, OTHER_USER_ID, { name: "Hijacked" });

    expect(result).toBeUndefined();
  });

  // ── createItem (by cardId) ──────────────────────────────────────────────

  it("creates a wish list item referencing a cardId", async () => {
    const item = await repo.createItem({
      wishListId,
      userId,
      cardId: CARD_FURY_UNIT.id,
      printingId: null,
      quantityDesired: 2,
    });

    expect(item.id).toBeTypeOf("string");
    expect(item.wishListId).toBe(wishListId);
    expect(item.cardId).toBe(CARD_FURY_UNIT.id);
    expect(item.printingId).toBeNull();
    expect(item.quantityDesired).toBe(2);
    itemByCardId = item.id;
  });

  // ── createItem (by printingId) ──────────────────────────────────────────

  it("creates a wish list item referencing a printingId", async () => {
    const item = await repo.createItem({
      wishListId,
      userId,
      cardId: null,
      printingId: PRINTING_1.id,
      quantityDesired: 1,
    });

    expect(item.id).toBeTypeOf("string");
    expect(item.printingId).toBe(PRINTING_1.id);
    expect(item.cardId).toBeNull();
    itemByPrintingId = item.id;
  });

  // ── items ───────────────────────────────────────────────────────────────

  it("returns all items for a wish list scoped to the user", async () => {
    const items = await repo.items(wishListId, userId);

    expect(items.length).toBe(2);
    const ids = items.map((i) => i.id);
    expect(ids).toContain(itemByCardId);
    expect(ids).toContain(itemByPrintingId);
  });

  it("returns empty array for items with a wrong userId", async () => {
    const items = await repo.items(wishListId, OTHER_USER_ID);

    expect(items).toEqual([]);
  });

  // ── updateItem ──────────────────────────────────────────────────────────

  it("updates a wish list item quantity", async () => {
    const updated = await repo.updateItem(itemByCardId, wishListId, userId, {
      quantityDesired: 4,
    });

    expect(updated).toBeDefined();
    expect(updated!.quantityDesired).toBe(4);
  });

  it("returns undefined when updating an item as a different user", async () => {
    const result = await repo.updateItem(itemByCardId, wishListId, OTHER_USER_ID, {
      quantityDesired: 99,
    });

    expect(result).toBeUndefined();
  });

  // ── allItemsForUser ─────────────────────────────────────────────────────

  it("returns all items across all wish lists for the user", async () => {
    const allItems = await repo.allItemsForUser(userId);

    expect(allItems.length).toBeGreaterThanOrEqual(2);
    // Each item should have the wish list name
    const ourItems = allItems.filter((i) => i.wishListId === wishListId);
    expect(ourItems.length).toBe(2);
    expect(ourItems[0].wishListName).toBe("Updated Wants");
  });

  it("returns empty for a user with no wish lists", async () => {
    // OTHER_USER_ID shouldn't have wish list items from this test
    const items = await repo.allItemsForUser(OTHER_USER_ID);
    const ourItems = items.filter((i) => i.wishListId === wishListId);

    expect(ourItems).toEqual([]);
  });

  // ── deleteItem ──────────────────────────────────────────────────────────

  it("deletes a wish list item", async () => {
    const result = await repo.deleteItem(itemByPrintingId, wishListId, userId);

    expect(result.numDeletedRows).toBe(1n);
    // Clear so afterAll doesn't try to double-delete
    itemByPrintingId = "";
  });

  it("returns 0 deleted rows for a nonexistent item", async () => {
    const result = await repo.deleteItem(
      "00000000-0000-0000-0000-000000000000",
      wishListId,
      userId,
    );

    expect(result.numDeletedRows).toBe(0n);
  });

  // ── deleteByIdForUser ───────────────────────────────────────────────────

  it("deletes a wish list by id and userId (cascades items)", async () => {
    const result = await repo.deleteByIdForUser(secondWishListId, userId);

    expect(result.numDeletedRows).toBe(1n);
    // Clear so afterAll doesn't try to double-delete
    secondWishListId = "";
  });

  it("returns 0 deleted rows when deleting as a different user", async () => {
    const result = await repo.deleteByIdForUser(wishListId, OTHER_USER_ID);

    expect(result.numDeletedRows).toBe(0n);
  });
});
