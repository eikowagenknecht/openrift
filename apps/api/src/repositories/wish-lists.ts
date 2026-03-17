import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, WishListItemsTable, WishListsTable } from "../db/index.js";

/**
 * Queries for user wish lists and their items.
 *
 * @returns An object with wish list query methods bound to the given `db`.
 */
export function wishListsRepo(db: Kysely<Database>) {
  return {
    /** @returns All wish lists for a user, ordered by name. */
    listForUser(userId: string): Promise<Selectable<WishListsTable>[]> {
      return db
        .selectFrom("wishLists")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single wish list by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<WishListsTable> | undefined> {
      return db
        .selectFrom("wishLists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the wish list exists for the given user. */
    exists(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<WishListsTable>, "id"> | undefined> {
      return db
        .selectFrom("wishLists")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created wish list row. */
    create(values: {
      userId: string;
      name: string;
      rules: string | null;
    }): Promise<Selectable<WishListsTable>> {
      return db.insertInto("wishLists").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated wish list row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<WishListsTable> | undefined> {
      return db
        .updateTable("wishLists")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("wishLists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns All items for a wish list. Scoped to the owning user for defense-in-depth. */
    items(wishListId: string, userId: string): Promise<Selectable<WishListItemsTable>[]> {
      return db
        .selectFrom("wishListItems")
        .selectAll()
        .where("wishListId", "=", wishListId)
        .where("userId", "=", userId)
        .execute();
    },

    /** @returns The newly created wish list item row. */
    createItem(values: {
      wishListId: string;
      userId: string;
      cardId: string | null;
      printingId: string | null;
      quantityDesired: number;
    }): Promise<Selectable<WishListItemsTable>> {
      return db.insertInto("wishListItems").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated wish list item row, or `undefined` if not found. */
    updateItem(
      itemId: string,
      wishListId: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<WishListItemsTable> | undefined> {
      return db
        .updateTable("wishListItems")
        .set(updates)
        .where("id", "=", itemId)
        .where("wishListId", "=", wishListId)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the item existed. */
    deleteItem(itemId: string, wishListId: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("wishListItems")
        .where("id", "=", itemId)
        .where("wishListId", "=", wishListId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns All wish list items across all wish lists for a user, with wish list name. */
    allItemsForUser(userId: string): Promise<
      {
        wishListId: string;
        wishListName: string;
        cardId: string | null;
        printingId: string | null;
        quantityDesired: number;
      }[]
    > {
      return db
        .selectFrom("wishListItems as wi")
        .innerJoin("wishLists as wl", "wl.id", "wi.wishListId")
        .select([
          "wl.id as wishListId",
          "wl.name as wishListName",
          "wi.cardId",
          "wi.printingId",
          "wi.quantityDesired",
        ])
        .where("wl.userId", "=", userId)
        .execute();
    },
  };
}
