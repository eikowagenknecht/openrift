import type { CopyLink, OwnedCopyRow } from "@openrift/shared";
import type { Insertable, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CopiesTable, Database } from "../db/index.js";
import { keysetCursorPredicate, requireFrontImage, selectCopyWithCard } from "./query-helpers.js";

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
  /** True when the copy is pinned to a live outgoing trade (ADR-019): still owned, but reserved. */
  reserved: boolean;
};

/**
 * A copy's per-copy metadata (ADR-038) with the name of the collection holding
 * it. Feeds the trade-accept copy picker, which needs enough detail to tell two
 * physical copies of one printing apart.
 */
type CopyMetadataRow = Pick<
  Selectable<CopiesTable>,
  | "id"
  | "printingId"
  | "collectionId"
  | "condition"
  | "grader"
  | "grade"
  | "notesPublic"
  | "notesPrivate"
  | "isAltered"
  | "links"
> & { collectionName: string };

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

/**
 * Deck-building availability of a joined `collections as col` (with the
 * viewer's `collection_deckbuilding_prefs as pref` left-joined): personal
 * collections default on, group collections are opt-in per member. A deck's
 * home collection (`exemptCollectionId`) counts for that deck even when the
 * collection is excluded, because the deck physically lives in that box.
 * @returns The SQL boolean expression.
 */
function deckbuildingAvailableSql(exemptCollectionId?: string) {
  const base = sql<boolean>`coalesce(pref.available, col.group_id is null)`;
  if (exemptCollectionId === undefined) {
    return base;
  }
  return sql<boolean>`(${base} or col.id = ${exemptCollectionId})`;
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
        // presence means the copy is reserved for an outgoing trade (ADR-019).
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
        query = query.where(
          keysetCursorPredicate(cursor, {
            timeColumn: "cp.createdAt",
            idColumn: "cp.id",
            idDirection: "asc",
          }),
        );
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
        .where("cp.id", "in", ids)
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
        query = query.where(
          keysetCursorPredicate(cursor, {
            timeColumn: "cp.createdAt",
            idColumn: "cp.id",
            idDirection: "asc",
          }),
        );
      }
      return query.execute();
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
      return rows.map((row) => ({ ...row, onLoan: false, reserved: false }));
    },

    /**
     * Applies one metadata patch to all given copies (ADR-038); caller verified
     * write access. Only defined keys are written, so absent patch fields stay
     * untouched. `links` arrives as a plain `CopyLink[]` and is handed to the
     * jsonb column as-is — postgres.js serializes jsonb parameters itself, and
     * pre-stringifying one encodes it twice into a jsonb string scalar.
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
        links?: CopyLink[];
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

    /**
     * Per-copy metadata (ADR-038) for specific copies, with the name of the
     * collection holding each. Not user-scoped: like the other id-list reads
     * here, the caller has already established the right to see these copies
     * (the trade paths derive the ids from the giver's own shared supply).
     * @returns One row per id that still exists, in no particular order.
     */
    listMetadataByIds(copyIds: readonly string[]): Promise<CopyMetadataRow[]> {
      if (copyIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "col.name as collectionName",
          ...COPY_METADATA_COLUMNS,
        ])
        .where("cp.id", "in", copyIds)
        .execute();
    },

    /**
     * The user's own free copies of one printing, with the same per-copy
     * metadata as {@link listMetadataByIds}. Free means neither out on a live
     * loan (ADR-039, physically absent) nor pinned to a live trade (ADR-019,
     * committed elsewhere) — the two exclusions the buildable counts use.
     *
     * Personal collections only (`col.userId`): a copy sitting in a group
     * collection is not the user's alone to dispose of. Group *sharing* is not
     * a filter here, unlike the trade supply this complements — the settle
     * picker records which copy physically left, and that can be one out of a
     * binder the group never saw.
     * @returns One row per free copy, in no particular order.
     */
    listFreePersonalMetadataForPrinting(
      userId: string,
      printingId: string,
    ): Promise<CopyMetadataRow[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "col.name as collectionName",
          ...COPY_METADATA_COLUMNS,
        ])
        .where("cp.printingId", "=", printingId)
        .where("col.userId", "=", userId)
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("loanCopies as lc")
                .select("lc.copyId")
                .whereRef("lc.copyId", "=", "cp.id"),
            ),
          ),
        )
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("cardTradeCopies as ctc")
                .select("ctc.copyId")
                .whereRef("ctc.copyId", "=", "cp.id"),
            ),
          ),
        )
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
     *
     * `exemptCollectionId` is a deck's home collection: the box that deck lives
     * in counts for it even when it's excluded from deck building generally.
     * @returns Count per card+printing across the viewer's deck-available collections.
     */
    countByCardAndPrintingForDeckbuilding(
      userId: string,
      exemptCollectionId?: string,
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
          .where(deckbuildingAvailableSql(exemptCollectionId), "=", true)
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
     * trade (ADR-019). Borrowed-in copies are added separately (they aren't
     * copy rows — see `loansRepo.borrowedCountByCard`).
     *
     * `exemptCollectionId` is a deck's home collection, which stays buildable
     * for that deck even when excluded from deck building. The `/decks`
     * overview computes many decks at once and uses
     * {@link buildableCountByCardForCollections} instead of calling this per deck.
     * @returns Map from card id to buildable copy count.
     */
    async buildableCountByCard(
      userId: string,
      exemptCollectionId?: string,
    ): Promise<Map<string, number>> {
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
        .where(deckbuildingAvailableSql(exemptCollectionId), "=", true)
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
        // A copy reserved for a live outgoing trade is committed elsewhere (ADR-019).
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
     * The extra buildable stock a deck gains from its home collection, keyed by
     * collection then card. Counts only copies {@link buildableCountByCard}
     * leaves out because their collection is excluded from deck building, so a
     * caller can add the two without double counting. Loaned and trade-reserved
     * copies stay excluded — a home collection overrides the exclusion, not
     * physical absence. Lets the `/decks` overview resolve every deck's home
     * collection in one query instead of one query per deck.
     * @returns Map from collection id to a per-card count map.
     */
    async buildableCountByCardForCollections(
      userId: string,
      collectionIds: readonly string[],
    ): Promise<Map<string, Map<string, number>>> {
      if (collectionIds.length === 0) {
        return new Map();
      }
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
          "cp.collectionId" as const,
          "p.cardId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("cp.collectionId", "in", [...new Set(collectionIds)])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        // Only the copies the general availability rule leaves out: everything
        // else is already in `buildableCountByCard`.
        .where(deckbuildingAvailableSql(), "=", false)
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("loanCopies as lc")
                .select("lc.copyId")
                .whereRef("lc.copyId", "=", "cp.id"),
            ),
          ),
        )
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("cardTradeCopies as ctc")
                .select("ctc.copyId")
                .whereRef("ctc.copyId", "=", "cp.id"),
            ),
          ),
        )
        .groupBy(["cp.collectionId", "p.cardId"])
        .execute();
      const byCollection = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const cards = byCollection.get(row.collectionId) ?? new Map<string, number>();
        cards.set(row.cardId, row.count);
        byCollection.set(row.collectionId, cards);
      }
      return byCollection;
    },

    /**
     * Copies in the user's own (personal) collections, with the metadata a
     * dynamic trade rule needs (ADR-034): the underlying card and whether the
     * copy is pinned to a live trade. Group-owned copies are excluded — a trade
     * list trades only what the user personally owns (mirrors the
     * `personalOnly` add path).
     *
     * `printingIds` narrows the read to the printings a rule set can actually
     * consult (`ownedCopyPrintingScope`). Without it this loads the owner's
     * *entire* collection on every rule expansion, which for a large collection
     * is tens of thousands of rows marshalled to be mostly discarded. An empty
     * array means the rules need no copies at all, so no query is issued.
     *
     * @param userId The owner whose personal collections to read.
     * @param printingIds Optional printing allowlist; omit to load everything.
     * @returns One {@link OwnedCopyRow} per matching personally-owned copy.
     */
    ownedRowsForUser(userId: string, printingIds?: readonly string[]): Promise<OwnedCopyRow[]> {
      if (printingIds?.length === 0) {
        return Promise.resolve([]);
      }
      let query = db
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
        .where("col.userId", "=", userId);
      if (printingIds !== undefined) {
        query = query.where("cp.printingId", "in", printingIds);
      }
      return query.execute();
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
      const rows = await selectCopyWithCard(db)
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

    /**
     * Representative card art batched per collection: up to `limit` distinct
     * printings each, most-copies-first (ties broken by newest copy). Feeds
     * the shared-collection thumb stacks on the group pages; printings
     * without a rehosted front image never surface, so a slot always renders.
     *
     * @param collectionIds The collections to collect covers for.
     * @param limit Max distinct printings per collection.
     * @returns Cover rows grouped by collection, in display order.
     */
    coverPrintingsAcross(
      collectionIds: string[],
      limit: number,
    ): Promise<{ collectionId: string; printingId: string; imageId: string }[]> {
      if (collectionIds.length === 0) {
        return Promise.resolve([]);
      }
      // One row per (collection, printing) with its copy count; the image
      // joins are inner so imageless printings don't burn a cover slot.
      const perPrinting = requireFrontImage(db.selectFrom("copies as cp"), "cp.printingId")
        .select([
          "cp.collectionId",
          "cp.printingId",
          "imgf.id as imageId",
          sql<number>`count(*)::int`.as("copyCount"),
          sql<Date>`max(cp.created_at)`.as("newestAt"),
        ])
        .where("cp.collectionId", "in", collectionIds)
        .where("imgf.rehostedUrl", "is not", null)
        .groupBy(["cp.collectionId", "cp.printingId", "imgf.id"]);
      const ranked = db.selectFrom(perPrinting.as("per")).select([
        "per.collectionId",
        "per.printingId",
        "per.imageId",
        sql<number>`(row_number() over (
            partition by per.collection_id
            order by per.copy_count desc, per.newest_at desc, per.printing_id
          ))::int`.as("coverRank"),
      ]);
      return db
        .selectFrom(ranked.as("ranked"))
        .select(["ranked.collectionId", "ranked.printingId", "ranked.imageId"])
        .where("ranked.coverRank", "<=", limit)
        .orderBy("ranked.collectionId")
        .orderBy("ranked.coverRank")
        .execute();
    },
  };
}
