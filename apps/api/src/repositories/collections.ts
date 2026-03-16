import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for user collections.
 *
 * @returns An object with collection query methods bound to the given `db`.
 */
export function collectionsRepo(db: Kysely<Database>) {
  return {
    /** @returns All collections for a user, inbox first, then by sort order and name. */
    listForUser(userId: string) {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("is_inbox", "desc")
        .orderBy("sort_order")
        .orderBy("name")
        .execute();
    },

    /** @returns A single collection by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string) {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created collection row. */
    create(values: {
      user_id: string;
      name: string;
      description: string | null;
      available_for_deckbuilding: boolean;
      is_inbox: boolean;
      sort_order: number;
    }) {
      return db.insertInto("collections").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated collection row, or `undefined` if not found. */
    update(id: string, userId: string, updates: Record<string, unknown>) {
      return db
        .updateTable("collections")
        .set(updates)
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns The target collection's `id` and `name`, or `undefined` if not found. */
    getIdAndName(id: string, userId: string) {
      return db
        .selectFrom("collections")
        .select(["id", "name"])
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the collection exists for the given user. */
    exists(id: string, userId: string) {
      return db
        .selectFrom("collections")
        .select("id")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },
  };
}
