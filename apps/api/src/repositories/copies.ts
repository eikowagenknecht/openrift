import type { Insertable, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CopiesTable, Database } from "../db/index.js";

/** Slim copy row — printing details are resolved client-side from the catalog. */
type CopyRow = Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId" | "createdAt">;

const CURSOR_SEPARATOR = "_";

/**
 * Builds an opaque keyset cursor from a timestamp and id.
 * @returns A cursor string encoding both values.
 */
export function buildCopiesCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
}

function parseCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  if (separatorIndex === -1) {
    // Legacy timestamp-only cursor (backward compat during deploys)
    return { time: new Date(cursor), id: null };
  }
  return {
    time: new Date(cursor.slice(0, separatorIndex)),
    id: cursor.slice(separatorIndex + 1),
  };
}

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
        const { time, id } = parseCursor(cursor);
        // Truncate to milliseconds so PostgreSQL's µs precision matches JS Date's ms precision
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("id", ">", id)])]),
            )
          : query.where(tsMs, "<", time);
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

    /** @returns The subset of input IDs that are owned by the given user. */
    async filterUserOwned(ids: readonly string[], userId: string): Promise<string[]> {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("copies")
        .select("id")
        .where("userId", "=", userId)
        .where("id", "in", ids)
        .execute();
      return rows.map((row) => row.id);
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
        const { time, id } = parseCursor(cursor);
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("id", ">", id)])]),
            )
          : query.where(tsMs, "<", time);
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

    /**
     * Like {@link listWithCollectionName} but without filtering by acting user.
     * Used by mutation services when the viewer's right to touch a copy comes
     * from collection-level access (shared collections) rather than ownership.
     * @returns Matching copies with their current collection name.
     */
    listWithCollectionContext(copyIds: string[]): Promise<
      (Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId"> & {
        collectionName: string;
      })[]
    > {
      if (copyIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select(["cp.id", "cp.printingId", "cp.collectionId", "col.name as collectionName"])
        .where("cp.id", "in", copyIds)
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

    /** Like {@link moveBatch} without user scoping; caller verified write access. */
    async moveBatchById(copyIds: string[], toCollectionId: string): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db
        .updateTable("copies")
        .set({ collectionId: toCollectionId })
        .where("id", "in", copyIds)
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

    /** Like {@link deleteBatch} without user scoping; caller verified write access. */
    async deleteBatchById(copyIds: string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db.deleteFrom("copies").where("id", "in", copyIds).execute();
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
