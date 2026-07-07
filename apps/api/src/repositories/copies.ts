import type { OwnedCopyRow } from "@openrift/shared";
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

/** Default page size, and hard maximum, for cursor-paginated copy listings. */
const COPIES_PAGE_DEFAULT = 5000;
const COPIES_PAGE_MAX = 5000;

/**
 * Clamps a client-supplied page limit to at most {@link COPIES_PAGE_MAX},
 * defaulting to {@link COPIES_PAGE_DEFAULT} when absent. Replaces the per-route
 * `limit ?? 10_000` soft-cap so no single request pulls an oversized page;
 * clients page through with the returned cursor instead.
 * @returns The effective page limit to request.
 */
export function clampCopiesLimit(limit?: number): number {
  return Math.min(limit ?? COPIES_PAGE_DEFAULT, COPIES_PAGE_MAX);
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

    /**
     * @returns Whether the user may reference this copy, or `undefined`. With
     *   `personalOnly` the copy must be in one of the user's own collections;
     *   otherwise shared group collections the user belongs to count too.
     */
    existsForViewer(
      id: string,
      userId: string,
      personalOnly = false,
    ): Promise<Pick<Selectable<CopiesTable>, "id"> | undefined> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .select("cp.id")
        .where("cp.id", "=", id)
        .where((eb) =>
          personalOnly
            ? eb("col.userId", "=", userId)
            : eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]),
        )
        .executeTakeFirst();
    },

    /**
     * @returns The subset of input IDs the user may reference. With
     *   `personalOnly` only copies in the user's own collections qualify;
     *   otherwise shared group collections the user belongs to count too.
     */
    async filterAccessibleByViewer(
      ids: readonly string[],
      userId: string,
      personalOnly = false,
    ): Promise<string[]> {
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
        .where((eb) =>
          personalOnly
            ? eb("col.userId", "=", userId)
            : eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]),
        )
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

    /**
     * Every copy in the user's own (personal) collections, with the metadata a
     * dynamic trade rule needs (ADR-034): the underlying card and whether the
     * copy is pinned to a live trade. Group-owned copies are excluded — a trade
     * list trades only what the user personally owns (mirrors the
     * `personalOnly` add path).
     * @returns One {@link OwnedCopyRow} per personally-owned copy.
     */
    ownedRowsForUser(userId: string): Promise<OwnedCopyRow[]> {
      return (
        db
          .selectFrom("copies as cp")
          .innerJoin("collections as col", "col.id", "cp.collectionId")
          .innerJoin("printings as p", "p.id", "cp.printingId")
          // A copy is pinned to at most one live trade (UNIQUE copy_id), so this
          // join can't multiply rows. Its presence means the copy is reserved.
          .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
          .select([
            "cp.id as copyId",
            "cp.printingId as printingId",
            "p.cardId as cardId",
            "cp.collectionId as collectionId",
            sql<boolean>`(ctc.copy_id is not null)`.as("reserved"),
          ])
          .where("col.userId", "=", userId)
          .execute()
      );
    },

    /**
     * Aggregates a collection's copies into one tile-row per printing for the
     * share image (ADR-024): summed quantity, card name, and the active front
     * image. Ordered by quantity desc then name so the grid leads with the
     * deepest holdings, and capped (`cap`) so an oversized collection can't force
     * unbounded per-request work — only a dozen tiles are ever drawn. The total
     * distinct-printing count is queried separately so the "+N more" tile stays
     * accurate even when the row fetch is capped.
     * @returns Capped per-printing render rows and the total distinct-printing count.
     */
    async collectionShareImageCards(
      collectionId: string,
      cap: number,
    ): Promise<{
      cards: { cardName: string; quantity: number; imageId: string | null }[];
      totalDistinct: number;
    }> {
      const rows = await db
        .selectFrom("copies as cp")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
        .select((eb) => [
          "c.name as cardName",
          "imgf.id as imageFileId",
          "imgf.rehostedUrl as rehostedUrl",
          eb.cast<number>(eb.fn.countAll(), "integer").as("quantity"),
        ])
        .where("cp.collectionId", "=", collectionId)
        .groupBy(["cp.printingId", "c.name", "imgf.id", "imgf.rehostedUrl"])
        .orderBy((eb) => eb.fn.countAll(), "desc")
        .orderBy("c.name")
        .limit(cap)
        .execute();

      const distinct = await db
        .selectFrom("copies")
        .select(sql<number>`count(distinct printing_id)::int`.as("count"))
        .where("collectionId", "=", collectionId)
        .executeTakeFirstOrThrow();

      return {
        // The renderer reads rehosted (self-hosted) WebP off disk; a printing
        // with no rehosted image gets a name-only tile, matching imageId() in
        // query-helpers. So null out the id unless the image was rehosted.
        cards: rows.map((row) => ({
          cardName: row.cardName,
          quantity: row.quantity,
          imageId: row.rehostedUrl ? row.imageFileId : null,
        })),
        totalDistinct: distinct.count,
      };
    },
  };
}
