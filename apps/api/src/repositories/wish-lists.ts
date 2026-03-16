import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for user wish lists and their items.
 *
 * @returns An object with wish list query methods bound to the given `db`.
 */
export function wishListsRepo(db: Kysely<Database>) {
  return {
    /** @returns All wish lists for a user, ordered by name. */
    listForUser(userId: string) {
      return db
        .selectFrom("wish_lists")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single wish list by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string) {
      return db
        .selectFrom("wish_lists")
        .selectAll()
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the wish list exists for the given user. */
    exists(id: string, userId: string) {
      return db
        .selectFrom("wish_lists")
        .select("id")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created wish list row. */
    create(values: { user_id: string; name: string; rules: string | null }) {
      return db.insertInto("wish_lists").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated wish list row, or `undefined` if not found. */
    update(id: string, userId: string, updates: Record<string, unknown>) {
      return db
        .updateTable("wish_lists")
        .set(updates)
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string) {
      return db
        .deleteFrom("wish_lists")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns All items for a wish list. */
    itemsForList(wishListId: string) {
      return db
        .selectFrom("wish_list_items")
        .selectAll()
        .where("wish_list_id", "=", wishListId)
        .execute();
    },

    /** @returns The newly created wish list item row. */
    createItem(values: {
      wish_list_id: string;
      user_id: string;
      card_id: string | null;
      printing_id: string | null;
      quantity_desired: number;
    }) {
      return db
        .insertInto("wish_list_items")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The updated wish list item row, or `undefined` if not found. */
    updateItem(
      itemId: string,
      wishListId: string,
      userId: string,
      updates: Record<string, unknown>,
    ) {
      return db
        .updateTable("wish_list_items")
        .set(updates)
        .where("id", "=", itemId)
        .where("wish_list_id", "=", wishListId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the item existed. */
    deleteItem(itemId: string, wishListId: string, userId: string) {
      return db
        .deleteFrom("wish_list_items")
        .where("id", "=", itemId)
        .where("wish_list_id", "=", wishListId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },
  };
}
