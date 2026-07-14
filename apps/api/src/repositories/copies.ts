import type { CopyLink, OwnedCopyRow } from "@openrift/shared";
import type { Insertable, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CopiesTable, Database } from "../db/index.js";

/**
 * Slim copy row — printing details are resolved client-side from the catalog.
 * `groupId` is the owning group of the copy's collection (null for personal
 * collections); the client uses it to keep group-owned copies out of personal
 * "owned" totals while still showing them inside the group collection.
 * Carries the per-copy metadata (ADR-038) so the synced client store has it.
 */
type CopyRow = Pick<
  Selectable<CopiesTable>,
  | "id"
  | "printingId"
  | "collectionId"
  | "createdAt"
  | "condition"
  | "grader"
  | "grade"
  | "notesPublic"
  | "notesPrivate"
  | "isAltered"
  | "links"
> & {
  groupId: string | null;
  /** True when the copy is out on a live loan (ADR-039). */
  onLoan: boolean;
  /** True when the copy is pinned to a live outgoing trade (ADR-034): still owned, but reserved. */
  reserved: boolean;
};

/** The per-copy metadata columns (ADR-038), aliased for `cp`-joined queries. */
const COPY_METADATA_COLUMNS = [
  "cp.condition",
  "cp.grader",
  "cp.grade",
  "cp.notesPublic",
  "cp.notesPrivate",
  "cp.isAltered",
  "cp.links",
] as const;

/** postgres.js under Bun returns jsonb columns as a string instead of a parsed
 *  array. This helper normalises `links` so callers always get an array.
 *  @returns the parsed links array */
function parseLinks(links: CopyLink[] | string): CopyLink[] {
  return typeof links === "string" ? (JSON.parse(links) as CopyLink[]) : links;
}

/** @returns The row with its `links` jsonb normalised to a parsed array. */
function withParsedLinks<T extends { links: CopyLink[] | string }>(row: T): T {
  return { ...row, links: parseLinks(row.links) };
}

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
        // A copy is pinned by at most one live loan (UNIQUE copy_id), so this
        // join can't multiply rows (ADR-039).
        .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
        // Likewise pinned by at most one live trade (UNIQUE copy_id) — its
        // presence means the copy is reserved for an outgoing trade (ADR-034).
        .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "cp.createdAt",
          "col.groupId as groupId",
          ...COPY_METADATA_COLUMNS,
          sql<boolean>`(lc.copy_id is not null)`.as("onLoan"),
          sql<boolean>`(ctc.copy_id is not null)`.as("reserved"),
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
      return query.execute().then((rows) => rows.map((row) => withParsedLinks(row)));
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
        .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
        .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "cp.createdAt",
          "col.groupId as groupId",
          ...COPY_METADATA_COLUMNS,
          sql<boolean>`(lc.copy_id is not null)`.as("onLoan"),
          sql<boolean>`(ctc.copy_id is not null)`.as("reserved"),
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
      return query.execute().then((rows) => rows.map((row) => withParsedLinks(row)));
    },

    /** @returns The inserted copy rows including their metadata (ADR-038). */
    async insertBatch(
      values: Insertable<CopiesTable>[],
    ): Promise<Omit<CopyRow, "groupId" | "createdAt">[]> {
      const rows = await db
        .insertInto("copies")
        .values(values)
        .returning([
          "id",
          "printingId",
          "collectionId",
          "condition",
          "grader",
          "grade",
          "notesPublic",
          "notesPrivate",
          "isAltered",
          "links",
        ])
        .execute();
      // A freshly inserted copy is never out on a loan (ADR-039).
      return rows.map((row) => ({ ...withParsedLinks(row), onLoan: false, reserved: false }));
    },

    /**
     * Applies one metadata patch to all given copies (ADR-038); caller verified
     * write access. Only defined keys are written, so absent patch fields stay
     * untouched. `links` arrives pre-stringified for the jsonb column.
     */
    async updateMetadataBatchById(
      copyIds: string[],
      patch: {
        condition?: string | null;
        grader?: string | null;
        grade?: number | null;
        notesPublic?: string | null;
        notesPrivate?: string | null;
        isAltered?: boolean;
        links?: string;
      },
    ): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      const set = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(set).length === 0) {
        return;
      }
      await db.updateTable("copies").set(set).where("id", "in", copyIds).execute();
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

    /**
     * Takes a `FOR UPDATE` row lock on the given copies (within the caller's
     * transaction) and returns the ids that still exist. Reserve/dispose paths
     * lock the same rows before acting so they serialize on a shared resource:
     * a dispose can't delete a copy a concurrent trade-accept is reserving, and
     * a reserve sees a copy already gone. Callers must pin/delete only survivors.
     * @returns The subset of `copyIds` that currently exist, now locked.
     */
    async lockByIds(copyIds: string[]): Promise<string[]> {
      if (copyIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("copies")
        .select("id")
        .where("id", "in", copyIds)
        .forUpdate()
        .execute();
      return rows.map((row) => row.id);
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
     * Every copy in the user's personal collections (group collections
     * excluded), with collection context for event logging. Feeds the
     * danger-zone collection reset.
     * @returns Matching copies with their current collection name.
     */
    listInPersonalCollections(userId: string): Promise<
      (Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId"> & {
        collectionName: string;
      })[]
    > {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select(["cp.id", "cp.printingId", "cp.collectionId", "col.name as collectionName"])
        .where("col.userId", "=", userId)
        .execute();
    },

    /**
     * Hard-deletes every copy in the user's personal collections in one
     * statement (no ID list, so it can't hit parameter limits). Group
     * collections are untouched.
     * @returns The number of deleted copies.
     */
    async deleteAllInPersonalCollections(userId: string): Promise<number> {
      const result = await db
        .deleteFrom("copies")
        .where("collectionId", "in", (eb) =>
          eb.selectFrom("collections").select("id").where("userId", "=", userId),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
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
      return (
        db
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
          // ADR-039: a copy out on a loan is physically absent, so it never
          // counts toward deck-building inventory, whatever its collection says.
          .where(({ not, exists, selectFrom }) =>
            not(
              exists(
                selectFrom("loanCopies as lc")
                  .select("lc.copyId")
                  .whereRef("lc.copyId", "=", "cp.id"),
              ),
            ),
          )
          .groupBy(["p.cardId", "cp.printingId"])
          .execute()
      );
    },

    /**
     * Buildable copy count per card for the viewer's deck inventory — the
     * server-side mirror of the deck editor's `available` bucket, so the
     * `/decks` overview's missing count matches the editor exactly. A copy
     * counts when its collection is deck-building-available for the viewer
     * (`COALESCE(pref.available, group_id IS NULL)`) AND it is neither out on a
     * live loan (ADR-039, physically absent) nor reserved for a live outgoing
     * trade (ADR-034). Borrowed-in copies are added separately (they aren't
     * copy rows — see `loansRepo.borrowedCountByCard`).
     * @returns Map from card id to buildable copy count.
     */
    async buildableCountByCard(userId: string): Promise<Map<string, number>> {
      const rows = await db
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
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .where(sql`coalesce(pref.available, col.group_id is null)`, "=", true)
        // A copy out on a live loan is physically absent (ADR-039).
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("loanCopies as lc")
                .select("lc.copyId")
                .whereRef("lc.copyId", "=", "cp.id"),
            ),
          ),
        )
        // A copy reserved for a live outgoing trade is committed elsewhere (ADR-034).
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("cardTradeCopies as ctc")
                .select("ctc.copyId")
                .whereRef("ctc.copyId", "=", "cp.id"),
            ),
          ),
        )
        .groupBy("p.cardId")
        .execute();
      return new Map(rows.map((row) => [row.cardId, row.count]));
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
