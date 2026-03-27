import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CollectionsTable, CopiesTable, Database } from "../db/index.js";

interface CollectionWithCount extends Selectable<CollectionsTable> {
  copyCount: number;
}

/**
 * Queries for user collections.
 *
 * @returns An object with collection query methods bound to the given `db`.
 */
export function collectionsRepo(db: Kysely<Database>) {
  return {
    /** @returns All collections for a user with copy counts, inbox first, then by sort order and name. */
    listForUser(userId: string): Promise<CollectionWithCount[]> {
      return db
        .selectFrom("collections")
        .selectAll("collections")
        .select(
          sql<number>`(select count(*)::int from copies where copies.collection_id = collections.id)`.as(
            "copyCount",
          ),
        )
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

    /** @returns Copies in the given collection (id and printingId only). */
    listCopiesInCollection(
      collectionId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id" | "printingId">[]> {
      return db
        .selectFrom("copies")
        .select(["id", "printingId"])
        .where("collectionId", "=", collectionId)
        .execute();
    },

    /** Moves all copies from one collection to another. */
    async moveCopiesBetweenCollections(
      fromCollectionId: string,
      toCollectionId: string,
    ): Promise<void> {
      await db
        .updateTable("copies")
        .set({ collectionId: toCollectionId })
        .where("collectionId", "=", fromCollectionId)
        .execute();
    },

    /** Deletes a collection by ID scoped to a user. */
    async deleteByIdForUser(id: string, userId: string): Promise<void> {
      await db
        .deleteFrom("collections")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Ensures the user has an inbox collection. Creates one if it doesn't exist,
     * handling race conditions via `ON CONFLICT DO NOTHING`.
     * @returns The inbox collection ID
     */
    async ensureInbox(userId: string): Promise<string> {
      const result = await db
        .insertInto("collections")
        .values({
          userId: userId,
          name: "Inbox",
          isInbox: true,
          availableForDeckbuilding: true,
          sortOrder: 0,
        })
        .onConflict((oc) => oc.doNothing())
        .returning("id")
        .executeTakeFirst();

      if (result) {
        return result.id;
      }

      // Insert was a no-op (inbox already exists) — fetch it
      const row = await db
        .selectFrom("collections")
        .select("id")
        .where("userId", "=", userId)
        .where("isInbox", "=", true)
        .executeTakeFirstOrThrow();

      return row.id;
    },
  };
}
