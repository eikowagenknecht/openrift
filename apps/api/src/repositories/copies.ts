import type { Insertable, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CopiesTable, Database } from "../db/index.js";

/**
 * Slim copy row — printing details are resolved client-side from the catalog.
 * `groupId` is the owning group of the copy's collection (null for personal
 * collections); the client uses it to keep group-owned copies out of personal
 * "owned" totals while still showing them inside the group collection.
 */
type CopyRow = Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId" | "createdAt"> & {
  groupId: string | null;
};

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
 * Copy ownership is derived from the collection (personal collections set
 * user_id, group collections set group_id) — copies carry no owner column of
 * their own. Visibility therefore keys off collection access: a viewer sees a
 * copy if they personally own its collection or are a member of its group.
 *
 * @returns An object with copy query methods bound to the given `db`.
 */
export function copiesRepo(db: Kysely<Database>) {
  return {
    /**
     * Copies across every collection the viewer can access — their personal
     * collections plus the shared collections of every group they belong to.
     * This is the source feed for the collection browser; group-owned copies
     * (added by any member) appear to all members. When `limit` is provided,
     * fetches `limit + 1` rows to detect `hasMore`.
     * @returns Accessible copies, newest first.
     */
    listForAccessibleCollections(
      userId: string,
      limit?: number,
      cursor?: string,
    ): Promise<CopyRow[]> {
      let query = db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "cp.createdAt",
          "col.groupId as groupId",
        ])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .orderBy("cp.createdAt", "desc")
        .orderBy("cp.id");
      if (limit !== undefined) {
        query = query.limit(limit + 1);
      }
      if (cursor) {
        const { time, id } = parseCursor(cursor);
        // Truncate to milliseconds so PostgreSQL's µs precision matches JS Date's ms precision
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("cp.createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("cp.id", ">", id)])]),
            )
          : query.where(tsMs, "<", time);
      }
      return query.execute();
    },

    /** @returns Whether a copy is in a collection the viewer can access, or `undefined`. */
    existsForViewer(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id"> | undefined> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .select("cp.id")
        .where("cp.id", "=", id)
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .executeTakeFirst();
    },

    /** @returns The subset of input IDs the viewer can access (via collection ownership/membership). */
    async filterAccessibleByViewer(ids: readonly string[], userId: string): Promise<string[]> {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .select("cp.id")
        .where("cp.id", "in", ids as string[])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .execute();
      return rows.map((row) => row.id);
    },

    /**
     * Copies in a specific collection. Authorization is the caller's
     * responsibility (via `collections.getAccessForUser`). When `limit` is
     * provided, fetches `limit + 1` rows to detect `hasMore`.
     * @returns Copies in the collection, newest first.
     */
    listForCollection(collectionId: string, limit?: number, cursor?: string): Promise<CopyRow[]> {
      let query = db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "cp.createdAt",
          "col.groupId as groupId",
        ])
        .where("cp.collectionId", "=", collectionId)
        .orderBy("cp.createdAt", "desc")
        .orderBy("cp.id");
      if (limit !== undefined) {
        query = query.limit(limit + 1);
      }
      if (cursor) {
        const { time, id } = parseCursor(cursor);
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("cp.createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("cp.id", ">", id)])]),
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

    /**
     * Copies with their current collection name, for move/dispose operations.
     * Not user-scoped: the viewer's right to touch a copy comes from
     * collection-level access (checked by the caller), not copy ownership.
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

    /** Moves copies to a target collection; caller verified write access. */
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

    /** Hard-deletes copies by IDs; caller verified write access. */
    async deleteBatchById(copyIds: string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db.deleteFrom("copies").where("id", "in", copyIds).execute();
    },

    /**
     * Owned count per card+printing from collections that feed the viewer's
     * deck inventory. A collection counts when it's accessible to the viewer
     * AND deck-building-available for them: `COALESCE(pref.available,
     * group_id IS NULL)` — personal collections default on, group collections
     * are opt-in per member.
     * @returns Count per card+printing across the viewer's deck-available collections.
     */
    countByCardAndPrintingForDeckbuilding(
      userId: string,
    ): Promise<{ cardId: string; printingId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .leftJoin("collectionDeckbuildingPrefs as pref", (join) =>
          join.onRef("pref.collectionId", "=", "col.id").on("pref.userId", "=", userId),
        )
        .select((eb) => [
          "p.cardId" as const,
          "cp.printingId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .where(sql`coalesce(pref.available, col.group_id is null)`, "=", true)
        .groupBy(["p.cardId", "cp.printingId"])
        .execute();
    },
  };
}
