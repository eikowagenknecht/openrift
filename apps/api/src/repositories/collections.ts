import type { Kysely, Selectable } from "kysely";

import type { CollectionsTable, Database } from "../db/index.js";

/**
 * Queries for user collections.
 *
 * @returns An object with collection query methods bound to the given `db`.
 */
export function collectionsRepo(db: Kysely<Database>) {
  return {
    /** @returns All collections for a user, inbox first, then by sort order and name. */
    listForUser(userId: string): Promise<Selectable<CollectionsTable>[]> {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("isInbox", "desc")
        .orderBy("sortOrder")
        .orderBy("name")
        .execute();
    },

    /** @returns A single collection by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created collection row. */
    create(values: {
      userId: string;
      name: string;
      description: string | null;
      availableForDeckbuilding: boolean;
      isInbox: boolean;
      sortOrder: number;
    }): Promise<Selectable<CollectionsTable>> {
      return db.insertInto("collections").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated collection row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .updateTable("collections")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns The target collection's `id` and `name`, or `undefined` if not found. */
    getIdAndName(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name"> | undefined> {
      return db
        .selectFrom("collections")
        .select(["id", "name"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the collection exists for the given user. */
    exists(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id"> | undefined> {
      return db
        .selectFrom("collections")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns IDs of the given collections that belong to the user. */
    listIdsByIdsForUser(
      ids: string[],
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id">[]> {
      return db
        .selectFrom("collections")
        .select("id")
        .where("id", "in", ids)
        .where("userId", "=", userId)
        .execute();
    },

    /** @returns `id` and `name` for the given collection IDs. */
    listIdAndNameByIds(
      ids: string[],
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name">[]> {
      return db.selectFrom("collections").select(["id", "name"]).where("id", "in", ids).execute();
    },

    /**
     * Ensures the user has an inbox collection. Creates one if it doesn't exist,
     * handling race conditions via `ON CONFLICT DO NOTHING`.
     * @returns The inbox collection ID
     */
    async ensureInbox(userId: string): Promise<string> {
      const existing = await db
        .selectFrom("collections")
        .select("id")
        .where("userId", "=", userId)
        .where("isInbox", "=", true)
        .executeTakeFirst();

      if (existing) {
        return existing.id;
      }

      await db
        .insertInto("collections")
        .values({
          userId: userId,
          name: "Inbox",
          isInbox: true,
          availableForDeckbuilding: true,
          sortOrder: 0,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      // In case of a race, re-fetch
      const row = await db
        .selectFrom("collections")
        .select("id")
        .where("userId", "=", userId)
        .where("isInbox", "=", true)
        .executeTakeFirst();

      if (!row) {
        throw new Error("Inbox collection not found after insert");
      }
      return row.id;
    },
  };
}
