import type { Insertable, Kysely, Selectable } from "kysely";

import type { CopiesTable, Database } from "../db/index.js";

/** Slim copy row — printing details are resolved client-side from the catalog. */
type CopyRow = Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId" | "createdAt">;

/**
 * Read-only queries for user copy data.
 *
 * @returns An object with copy query methods bound to the given `db`.
 */
export function copiesRepo(db: Kysely<Database>) {
  return {
    /** @returns Copies for a user. When `limit` is provided, fetches `limit + 1` rows to detect `hasMore`. */
    listForUser(userId: string, limit?: number, cursor?: string): Promise<CopyRow[]> {
      let query = db
        .selectFrom("copies")
        .select(["id", "printingId", "collectionId", "createdAt"])
        .where("userId", "=", userId)
        .orderBy("createdAt", "desc")
        .orderBy("id");
      if (limit !== undefined) {
        query = query.limit(limit + 1);
      }
      if (cursor) {
        query = query.where("createdAt", "<", new Date(cursor));
      }
      return query.execute();
    },

    /** @returns A single copy by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<CopyRow | undefined> {
      return db
        .selectFrom("copies")
        .select(["id", "printingId", "collectionId", "createdAt"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Per-(printing, collection) copy counts for a user, ordered by collection sort order. */
    countByCollectionForUser(
      userId: string,
    ): Promise<
      { printingId: string; collectionId: string; collectionName: string; count: number }[]
    > {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select((eb) => [
          "cp.printingId" as const,
          "cp.collectionId" as const,
          "col.name as collectionName",
          eb.cast<number>(eb.fn.count("cp.id"), "integer").as("count"),
        ])
        .where("cp.userId", "=", userId)
        .groupBy(["cp.printingId", "cp.collectionId", "col.name", "col.sortOrder"])
        .orderBy("col.sortOrder")
        .execute();
    },

    /** @returns Whether a copy exists for the given user (for ownership verification), or `undefined`. */
    existsForUser(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id"> | undefined> {
      return db
        .selectFrom("copies")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Copies in a specific collection. When `limit` is provided, fetches `limit + 1` rows to detect `hasMore`. */
    listForCollection(collectionId: string, limit?: number, cursor?: string): Promise<CopyRow[]> {
      let query = db
        .selectFrom("copies")
        .select(["id", "printingId", "collectionId", "createdAt"])
        .where("collectionId", "=", collectionId)
        .orderBy("createdAt", "desc")
        .orderBy("id");
      if (limit !== undefined) {
        query = query.limit(limit + 1);
      }
      if (cursor) {
        query = query.where("createdAt", "<", new Date(cursor));
      }
      return query.execute();
    },

    /** @returns The inserted copy rows with `id`, `printingId`, and `collectionId`. */
    insertBatch(
      values: Insertable<CopiesTable>[],
    ): Promise<Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId">[]> {
      return db
        .insertInto("copies")
        .values(values)
        .returning(["id", "printingId", "collectionId"])
        .execute();
    },

    /** @returns Copies with their current collection name, for move/dispose operations. */
    listWithCollectionName(
      copyIds: string[],
      userId: string,
    ): Promise<
      (Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId"> & {
        collectionName: string;
      })[]
    > {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select(["cp.id", "cp.printingId", "cp.collectionId", "col.name as collectionName"])
        .where("cp.id", "in", copyIds)
        .where("cp.userId", "=", userId)
        .execute();
    },

    /** Moves copies to a target collection. */
    async moveBatch(copyIds: string[], userId: string, toCollectionId: string): Promise<void> {
      await db
        .updateTable("copies")
        .set({ collectionId: toCollectionId })
        .where("id", "in", copyIds)
        .where("userId", "=", userId)
        .execute();
    },

    /** Hard-deletes copies by IDs scoped to a user. */
    async deleteBatch(copyIds: string[], userId: string): Promise<void> {
      await db
        .deleteFrom("copies")
        .where("id", "in", copyIds)
        .where("userId", "=", userId)
        .execute();
    },

    /** @returns Owned count per card+printing from deckbuilding-available collections. */
    countByCardAndPrintingForDeckbuilding(
      userId: string,
    ): Promise<{ cardId: string; printingId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .select((eb) => [
          "p.cardId" as const,
          "cp.printingId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("cp.userId", "=", userId)
        .where("col.availableForDeckbuilding", "=", true)
        .groupBy(["p.cardId", "cp.printingId"])
        .execute();
    },
  };
}
