import type { ListKind } from "@openrift/shared/types/api/list";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import { DeleteResult, sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListEntriesTable } from "../../../db/tables/lists.js";

export interface BulkUpsertResult {
  inserted: number;
  /** Existing entries whose quantity was incremented (not replaced). */
  updated: number;
}

/**
 * `kind` must match the parent list (composite FK `fk_list_entries_list_kind`).
 * Exactly one of cardId/printingId/copyId is non-null per kind
 * (`chk_list_entries_kind_shape`).
 */
export type NewEntryValues = Pick<
  Insertable<ListEntriesTable>,
  | "listId"
  | "userId"
  | "kind"
  | "cardId"
  | "printingId"
  | "copyId"
  | "pricePref"
  | "priceAbsoluteCents"
  | "tradeType"
> & {
  quantity: number;
};

/**
 * Target columns + kind are immutable post-creation by convention — a
 * re-targeting is delete + create.
 */
export type ListEntryUpdate = Omit<
  Updateable<ListEntriesTable>,
  | "id"
  | "listId"
  | "userId"
  | "kind"
  | "cardId"
  | "printingId"
  | "copyId"
  | "createdAt"
  | "updatedAt"
>;

export function listEntriesRepo(db: Kysely<Database>) {
  return {
    createEntry(values: NewEntryValues): Promise<Selectable<ListEntriesTable>> {
      return db.insertInto("listEntries").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /**
     * `kind` must select the WHERE predicate matching the target partial
     * unique index, or Postgres raises "no unique or exclusion constraint
     * matching the ON CONFLICT specification". Copy-kind lists never bump
     * quantity on conflict, so `updated` is always 0 there.
     */
    async bulkCreateEntries(kind: ListKind, values: NewEntryValues[]): Promise<BulkUpsertResult> {
      if (values.length === 0) {
        return { inserted: 0, updated: 0 };
      }
      const targetColumn: "cardId" | "printingId" | "copyId" =
        kind === "card" ? "cardId" : kind === "printing" ? "printingId" : "copyId";
      // Pre-aggregate dupes by conflict key: Postgres rejects two rows in the
      // same INSERT both hitting ON CONFLICT DO UPDATE on the same target
      // ("cannot affect row a second time"). Card/printing kinds sum the
      // quantities to match the ON CONFLICT bump semantics; copy kind keeps
      // the first occurrence (DO NOTHING is singular).
      const aggregated = new Map<string, NewEntryValues>();
      for (const value of values) {
        const conflictKey = `${value.listId}\0${String(value[targetColumn])}`;
        const existing = aggregated.get(conflictKey);
        if (existing) {
          if (kind !== "copy") {
            existing.quantity += value.quantity;
          }
        } else {
          aggregated.set(conflictKey, { ...value });
        }
      }
      const rows = await db
        .insertInto("listEntries")
        .values([...aggregated.values()])
        .onConflict((oc) => {
          const conflictTarget = oc
            .columns(["listId", targetColumn])
            .where(targetColumn, "is not", null);
          return kind === "copy"
            ? conflictTarget.doNothing()
            : conflictTarget.doUpdateSet({
                quantity: sql<number>`list_entries.quantity + excluded.quantity`,
              });
        })
        // xmax is the deleting/updating txid; 0 means the row was inserted, not updated.
        .returning(sql<boolean>`(xmax = 0)`.as("inserted"))
        .execute();
      let inserted = 0;
      let updated = 0;
      for (const row of rows) {
        if (row.inserted) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }
      return { inserted, updated };
    },

    /**
     * Takes copy IDs and inserts entries in the shape required by the list's
     * kind (distinct printing/card per copy for those kinds). The result
     * drives the success-toast wording. `skipped` counts copy IDs that didn't
     * qualify (see `personalOnly`); kind-dedup collapses (3 copies of one card
     * → 1 card entry) are NOT counted as skipped — the user got the entry they
     * wanted, the other copies folded into the same row.
     */
    async bulkCreateEntriesFromCopies(
      listId: string,
      kind: ListKind,
      userId: string,
      copyIds: readonly string[],
      personalOnly: boolean,
    ): Promise<{ added: number; updated: number; skipped: number }> {
      if (copyIds.length === 0) {
        return { added: 0, updated: 0, skipped: 0 };
      }

      // With `personalOnly` (trade/wish lists), only copies in the user's own
      // collections qualify — a card you merely have group access to isn't
      // yours to trade away or to wish for. Without it (organize lists), shared
      // group collections the user belongs to count too. Non-qualifying copies
      // are dropped here and recovered as `skipped` via the count difference.
      const owned = await db
        .selectFrom("copies as cp")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .select(["cp.id as copyId", "cp.printingId", "p.cardId"])
        .where("cp.id", "in", [...copyIds])
        .where((eb) =>
          personalOnly
            ? eb("col.userId", "=", userId)
            : eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]),
        )
        .execute();

      const nonOwnedCount = copyIds.length - owned.length;

      if (owned.length === 0) {
        return { added: 0, updated: 0, skipped: nonOwnedCount };
      }

      const values: NewEntryValues[] = [];
      if (kind === "copy") {
        for (const row of owned) {
          values.push({
            listId,
            userId,
            kind: "copy",
            cardId: null,
            printingId: null,
            copyId: row.copyId,
            quantity: 1,
          });
        }
      } else if (kind === "printing") {
        const seen = new Set<string>();
        for (const row of owned) {
          if (seen.has(row.printingId)) {
            continue;
          }
          seen.add(row.printingId);
          values.push({
            listId,
            userId,
            kind: "printing",
            cardId: null,
            printingId: row.printingId,
            copyId: null,
            quantity: 1,
          });
        }
      } else {
        const seen = new Set<string>();
        for (const row of owned) {
          if (seen.has(row.cardId)) {
            continue;
          }
          seen.add(row.cardId);
          values.push({
            listId,
            userId,
            kind: "card",
            cardId: row.cardId,
            printingId: null,
            copyId: null,
            quantity: 1,
          });
        }
      }

      const result = await this.bulkCreateEntries(kind, values);
      // Copy-kind dupes hit DO NOTHING and return no row; recovered here as skipped.
      const droppedDupes = values.length - result.inserted - result.updated;
      return {
        added: result.inserted,
        updated: result.updated,
        skipped: nonOwnedCount + droppedDupes,
      };
    },

    updateEntry(
      entryId: string,
      listId: string,
      userId: string,
      updates: ListEntryUpdate,
    ): Promise<Selectable<ListEntriesTable> | undefined> {
      return db
        .updateTable("listEntries")
        .set(updates)
        .where("id", "=", entryId)
        .where("listId", "=", listId)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Atomically reduces an entry's quantity by `by`, deleting it when the
     * result would reach zero or below (entries are constrained to quantity > 0,
     * so a wish that trade-sync empties is removed, never written non-positive).
     * The guarded UPDATE fires only while the result stays positive, so it can't
     * violate the check constraint, and its row write-lock serializes concurrent
     * decrements. A missing or non-owned entry is a silent no-op. Returns
     * `undefined` when the entry was deleted or absent.
     */
    async decrementEntryQuantity(
      entryId: string,
      userId: string,
      by: number,
    ): Promise<number | undefined> {
      const updated = await db
        .updateTable("listEntries")
        .set({ quantity: sql<number>`quantity - ${by}` })
        .where("id", "=", entryId)
        .where("userId", "=", userId)
        .where("quantity", ">", by)
        .returning("quantity")
        .executeTakeFirst();
      if (updated) {
        return updated.quantity;
      }
      // The entry is gone or exhausted (quantity <= by): remove it. The
      // quantity guard makes this a no-op if a concurrent edit raised the
      // entry back above `by` in the meantime.
      await db
        .deleteFrom("listEntries")
        .where("id", "=", entryId)
        .where("userId", "=", userId)
        .where("quantity", "<=", by)
        .execute();
      return undefined;
    },

    /**
     * Atomically raises an entry's quantity to at least `min` (`GREATEST` in
     * one UPDATE — no read-then-set race with concurrent edits). A missing or
     * non-owned entry is a silent no-op.
     */
    async raiseEntryQuantityTo(entryId: string, userId: string, min: number): Promise<void> {
      await db
        .updateTable("listEntries")
        .set({ quantity: sql<number>`greatest(quantity, ${min})` })
        .where("id", "=", entryId)
        .where("userId", "=", userId)
        .execute();
    },

    deleteEntry(entryId: string, listId: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("listEntries")
        .where("id", "=", entryId)
        .where("listId", "=", listId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Owner-scoped but list-agnostic on purpose: trade-sync decrements a
     * snapshotted wish entry whose `listId` was not carried alongside the
     * entry id.
     */
    getEntryByIdForUser(
      entryId: string,
      userId: string,
    ): Promise<Selectable<ListEntriesTable> | undefined> {
      return db
        .selectFrom("listEntries")
        .selectAll()
        .where("id", "=", entryId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Scoped to a single list + the owning user so a stray entry id from
     * another list (or another user's list) is filtered out, not 403'd.
     */
    entriesForMove(
      listId: string,
      userId: string,
      entryIds: readonly string[],
    ): Promise<
      Pick<
        Selectable<ListEntriesTable>,
        | "id"
        | "kind"
        | "cardId"
        | "printingId"
        | "copyId"
        | "quantity"
        | "pricePref"
        | "priceAbsoluteCents"
        | "tradeType"
      >[]
    > {
      if (entryIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("listEntries")
        .select([
          "id",
          "kind",
          "cardId",
          "printingId",
          "copyId",
          "quantity",
          "pricePref",
          "priceAbsoluteCents",
          "tradeType",
        ])
        .where("listId", "=", listId)
        .where("userId", "=", userId)
        .where("id", "in", [...entryIds])
        .execute();
    },

    deleteEntriesByIds(
      entryIds: readonly string[],
      listId: string,
      userId: string,
    ): Promise<DeleteResult> {
      if (entryIds.length === 0) {
        return Promise.resolve(new DeleteResult(0n));
      }
      return db
        .deleteFrom("listEntries")
        .where("id", "in", [...entryIds])
        .where("listId", "=", listId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Drops the owner's trade-list entries for copies that stop being theirs
     * to offer (moving into a group collection). Trade lists only: an organize
     * list may hold group-shared copies on purpose (`personalOnly` is false
     * for that intent on the manual-add routes), so an organize entry pointing
     * at a group-owned copy is correct and must survive. Wish lists never hold
     * copies at all (`chk_lists_intent_kind` pins them to card and printing kind).
     */
    deleteTradeEntriesForCopies(copyIds: readonly string[], userId: string): Promise<DeleteResult> {
      if (copyIds.length === 0) {
        return Promise.resolve(new DeleteResult(0n));
      }
      return db
        .deleteFrom("listEntries")
        .where("copyId", "in", [...copyIds])
        .where("userId", "=", userId)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("lists")
              .select("lists.id")
              .whereRef("lists.id", "=", "listEntries.listId")
              .where("lists.intent", "=", "trade"),
          ),
        )
        .executeTakeFirst();
    },
  };
}
