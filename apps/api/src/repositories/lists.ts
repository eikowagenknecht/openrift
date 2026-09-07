import {
  evaluateListRules,
  expandList,
  ownedCopyPrintingScope,
} from "@openrift/shared/list-rule-eval";
import type {
  KeepPriorityOrders,
  ManualEntryRow,
  OwnedCopyRow,
} from "@openrift/shared/list-rule-eval";
import type { EntrySource, ListIntent, ListKind } from "@openrift/shared/types/api/list";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Finish, Rarity } from "@openrift/shared/types/enums";
import { hydrateListRules, ruleFiltersOnPrice } from "@openrift/shared/types/list-rule";
import type { ListRuleCombine, ListRules } from "@openrift/shared/types/list-rule";
import { legendDisplayName } from "@openrift/shared/utils";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import { DeleteResult, sql } from "kysely";

import type { Database, ListEntriesTable, ListsTable } from "../db/index.js";
import type { PrintingDetail } from "./query-helpers.js";
import {
  cardTypesColumn,
  findByShareToken,
  imageId,
  joinFrontImage,
  printingDetailsByIds,
  selectCopyWithCard,
  selectShareState,
  updateShareRow,
} from "./query-helpers.js";

/**
 * Lazy providers a dynamic-rule list read needs but the repo can't build from
 * `db` alone. Wired in `createRepos`; only invoked when a list actually
 * carries a rule, so manual-only reads pay nothing.
 */
export interface ListRuleProviders {
  assembleCatalog: () => Promise<{
    printings: Printing[];
    customTagAssignments: Record<string, readonly string[]>;
  }>;
  /**
   * The given user's personally-owned copies, narrowed to `printingIds`.
   * Omitting the argument loads the whole collection, which is only correct
   * when the caller has no rule set to narrow by.
   */
  ownedCopies: (ownerId: string, printingIds?: readonly string[]) => Promise<OwnedCopyRow[]>;
  /**
   * Reference orders (finish / rarity / art-variant) a trade rule uses to keep
   * the nicer copies and offer the plainer ones.
   */
  enumOrders: () => Promise<KeepPriorityOrders>;
  /**
   * Latest-price lookup (major currency units) for rules with a price bound.
   * Wired to a content-addressed memo in `createRepos` so the uncached
   * public-share read never pays the full price-map load.
   */
  priceLookup: () => Promise<PriceLookup>;
}

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

export interface BulkUpsertResult {
  inserted: number;
  /** Existing entries whose quantity was incremented (not replaced). */
  updated: number;
}

interface ListWithCount extends Selectable<ListsTable> {
  entryCount: number;
}

interface ListEntryRowBase {
  /** Real `list_entries.id` for manual/both entries; `null` for rule-only. */
  id: string | null;
  listId: string;
  quantity: number;
  source: EntrySource;
  /** The rules' additive contribution to `quantity`; 0 for manual-only. */
  ruleQuantity: number;
  cardName: string;
  tradeOverride: TradePreference;
}

interface ListEntryRowPrintingFields {
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

export type ListEntryRow =
  | (ListEntryRowBase & { kind: "card"; cardId: string })
  | (ListEntryRowBase & ListEntryRowPrintingFields & { kind: "printing"; printingId: string })
  | (ListEntryRowBase &
      ListEntryRowPrintingFields & {
        kind: "copy";
        copyId: string;
        printingId: string;
        collectionId: string;
        /** True when the copy is pinned to a live in-app trade. */
        reserved: boolean;
        /** True when the copy is out on a live loan. */
        onLoan: boolean;
      });

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

/** `kind` is immutable post-creation. */
export type NewListValues = Pick<
  Insertable<ListsTable>,
  | "userId"
  | "name"
  | "intent"
  | "kind"
  | "defaultPricePref"
  | "defaultPriceAbsoluteCents"
  | "defaultTradeType"
  | "currency"
> & {
  rules?: ListRules | null;
  /** null = the intent's default combine mode. */
  ruleCombine?: ListRuleCombine | null;
};

/**
 * Intent and kind are immutable post-creation — the DB-level intent×kind
 * constraint would make swapping either field a shape change that breaks
 * every existing entry.
 */
export type ListUpdate = Omit<
  Updateable<ListsTable>,
  "id" | "userId" | "intent" | "kind" | "createdAt" | "updatedAt"
>;

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

export function listsRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    /**
     * The entry count is a correlated subquery so a list with no entries
     * still appears (no GROUP BY drops).
     */
    listForUser(userId: string, intent?: ListIntent): Promise<ListWithCount[]> {
      let query = db
        .selectFrom("lists")
        .selectAll("lists")
        .select(
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = lists.id)`.as(
            "entryCount",
          ),
        )
        .where("userId", "=", userId);
      if (intent) {
        query = query.where("intent", "=", intent);
      }
      return query.orderBy("sortOrder").orderBy("name").execute();
    },

    getByIdForUser(id: string, userId: string): Promise<Selectable<ListsTable> | undefined> {
      return db
        .selectFrom("lists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    getIdKindIntent(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<ListsTable>, "id" | "kind" | "intent"> | undefined> {
      return db
        .selectFrom("lists")
        .select(["id", "kind", "intent"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Inserts at the end of the (user, intent) bucket; position 0 would force
     * re-ordering every other row on each create.
     */
    create(values: NewListValues): Promise<Selectable<ListsTable>> {
      const { rules, ...rest } = values;
      return db
        .insertInto("lists")
        .values({
          ...rest,
          rules: rules ?? [],
          sortOrder: sql<number>`coalesce((select max(sort_order) + 1 from lists where user_id = ${values.userId} and intent = ${values.intent}), 0)`,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Single statement so the bucket is never seen partially re-numbered.
     * IDs not owned by the user (or not in the given intent) are silently
     * ignored — the caller is expected to send the current view of the bucket.
     */
    async reorder(
      userId: string,
      intent: ListIntent,
      orderedIds: readonly string[],
    ): Promise<void> {
      if (orderedIds.length === 0) {
        return;
      }
      const ids = [...orderedIds];
      await sql`
        update lists
        set sort_order = ranked.new_order
        from (
          select id, ord::int - 1 as new_order
          from unnest(${ids}::uuid[]) with ordinality as t(id, ord)
        ) as ranked
        where lists.id = ranked.id
          and lists.user_id = ${userId}
          and lists.intent = ${intent}
      `.execute(db);
    },

    update(
      id: string,
      userId: string,
      updates: ListUpdate,
    ): Promise<Selectable<ListsTable> | undefined> {
      const { rules, ...rest } = updates;
      const setValues = rules === undefined ? rest : { ...rest, rules: rules ?? [] };
      return db
        .updateTable("lists")
        .set(setValues)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("lists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Snapshot for the danger-zone collection reset: only lists that had
     * entries before the wipe are prune candidates afterwards.
     */
    async listIdsWithEntries(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("lists")
        .select("id")
        .where("userId", "=", userId)
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom("listEntries")
              .select("listEntries.id")
              .whereRef("listEntries.listId", "=", "lists.id"),
          ),
        )
        .execute();
      return rows.map((row) => row.id);
    },

    /**
     * Deletes the given lists if they are now empty and have no dynamic rules
     * (a rule-driven list is never "empty" — its rules repopulate it).
     * Non-matching IDs are silently skipped.
     */
    async deleteEmptyWithoutRules(userId: string, ids: readonly string[]): Promise<number> {
      if (ids.length === 0) {
        return 0;
      }
      const result = await db
        .deleteFrom("lists")
        .where("id", "in", ids as string[])
        .where("userId", "=", userId)
        .where(sql<boolean>`jsonb_array_length(rules) = 0`)
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("listEntries")
                .select("listEntries.id")
                .whereRef("listEntries.listId", "=", "lists.id"),
            ),
          ),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    /**
     * Only copy-kind entries carry a non-null `copy_id`, so the `copyId in`
     * filter implicitly restricts to them. Drives the dispose confirmation's
     * cross-list warning: disposing hard-deletes the copy and cascades its
     * `list_entries` away, so the copy also disappears from every list here.
     */
    async listMembershipsForCopies(
      copyIds: readonly string[],
      userId: string,
      excludeListId?: string,
    ): Promise<{
      lists: { id: string; name: string; copyCount: number }[];
      copiesOnAnyList: number;
    }> {
      if (copyIds.length === 0) {
        return { lists: [], copiesOnAnyList: 0 };
      }
      let query = db
        .selectFrom("listEntries as le")
        .innerJoin("lists as l", "l.id", "le.listId")
        .where("le.copyId", "in", [...copyIds])
        .where("l.userId", "=", userId);
      // Drop the originating list so its own membership doesn't show up in the
      // "Sold" confirmation — the user already knows the copy is leaving it.
      if (excludeListId !== undefined) {
        query = query.where("l.id", "!=", excludeListId);
      }
      const rows = await query
        .select(["l.id as listId", "l.name as listName", "le.copyId as copyId"])
        .execute();

      // A copy can appear on several lists; count distinct copies, not rows.
      const perList = new Map<string, { id: string; name: string; copies: Set<string> }>();
      const copiesOnAnyList = new Set<string>();
      for (const row of rows) {
        if (row.copyId === null) {
          continue;
        }
        copiesOnAnyList.add(row.copyId);
        const existing = perList.get(row.listId);
        if (existing) {
          existing.copies.add(row.copyId);
        } else {
          perList.set(row.listId, {
            id: row.listId,
            name: row.listName,
            copies: new Set([row.copyId]),
          });
        }
      }
      const lists = [...perList.values()]
        .map((entry) => ({ id: entry.id, name: entry.name, copyCount: entry.copies.size }))
        .sort(
          (first, second) =>
            second.copyCount - first.copyCount || first.name.localeCompare(second.name),
        );
      return { lists, copiesOnAnyList: copiesOnAnyList.size };
    },

    /**
     * `undefined` only when the list isn't owned by the user — callers must
     * distinguish "not owned" (→ 404) from "owned but unshared" (→ token null).
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<{ shareToken: string | null; isPublic: boolean } | undefined> {
      return selectShareState(db, "lists", id, userId);
    },

    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<ListsTable> | undefined> {
      return updateShareRow(db, "lists", id, userId, shareToken, isPublic);
    },

    async findByShareToken(
      shareToken: string,
    ): Promise<
      { list: Selectable<ListsTable>; ownerName: string | null; ownerEmail: string } | undefined
    > {
      const found = await findByShareToken(db, "lists", shareToken);
      if (!found) {
        return undefined;
      }
      return { list: found.row, ownerName: found.ownerName, ownerEmail: found.ownerEmail };
    },

    entriesWithDetails(listId: string, kind: ListKind, userId: string): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId, userId });
    },

    /** No user scoping — the caller has already verified access (e.g. by share token). */
    entriesWithDetailsAnon(listId: string, kind: ListKind): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId });
    },

    /**
     * Rule-expanded entry counts for several lists. Omits lists with no rules
     * (or that don't exist); callers keep their materialized count for those.
     */
    async expandedCounts(listIds: readonly string[]): Promise<Map<string, number>> {
      const counts = new Map<string, number>();
      if (listIds.length === 0 || !providers) {
        return counts;
      }

      const listRows = await db
        .selectFrom("lists")
        .select(["id", "kind", "rules", "ruleCombine", "userId"])
        .where("id", "in", [...listIds])
        .execute();
      const ruleLists = listRows
        .map((row) => ({ ...row, rules: hydrateListRules(row.rules) }))
        .filter((row) => row.rules.length > 0);
      if (ruleLists.length === 0) {
        return counts;
      }

      // One inventory read per owner, not per list.
      const owners = [
        ...new Set(ruleLists.filter((row) => needsOwnedCopies(row.rules)).map((row) => row.userId)),
      ];

      // Everything below depends only on `ruleLists`, so it all overlaps. The
      // per-list path deliberately loads prices *before* copies (its
      // `ownedCopyPrintingScope` narrowing has to see the same prices the
      // evaluation will), but this path loads copies unscoped, so no such
      // ordering applies and the round trips can go out together.
      const [manualRows, catalogData, ownedByOwner, priceLookup, enumOrders] = await Promise.all([
        db
          .selectFrom("listEntries")
          .select([
            "id",
            "listId",
            "kind",
            "cardId",
            "printingId",
            "copyId",
            "quantity",
            "pricePref",
            "priceAbsoluteCents",
            "tradeType",
          ])
          .where(
            "listId",
            "in",
            ruleLists.map((row) => row.id),
          )
          .execute(),
        providers.assembleCatalog(),
        Promise.all(
          owners.map(async (owner) => [owner, await providers.ownedCopies(owner)] as const),
        ).then((entries) => new Map(entries)),
        ruleLists.some((row) => row.rules.some(ruleFiltersOnPrice))
          ? providers.priceLookup()
          : undefined,
        ruleLists.some((row) => row.rules.some((rule) => rule.kind === "trade"))
          ? providers.enumOrders()
          : undefined,
      ]);
      const manualByList = Map.groupBy(manualRows, (row) => row.listId);
      const { printings: catalog, customTagAssignments } = catalogData;

      for (const list of ruleLists) {
        const manual = (manualByList.get(list.id) ?? []).map((row) => toRawManualEntryRow(row));
        const ruleEntries = evaluateListRules(
          list.rules,
          list.kind,
          {
            catalog,
            ownedCopies: ownedByOwner.get(list.userId) ?? [],
            customTagAssignments,
            enumOrders,
            priceLookup,
          },
          list.ruleCombine,
        );
        counts.set(list.id, expandList(list.kind, manual, ruleEntries).length);
      }
      return counts;
    },

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

async function fetchEnrichedEntries(
  db: Kysely<Database>,
  kind: ListKind,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  const rows =
    kind === "card"
      ? await cardEntryQuery(db, scope)
      : kind === "printing"
        ? await printingEntryQuery(db, scope)
        : await copyEntryQuery(db, scope);
  return rows.sort((a, b) => a.cardName.localeCompare(b.cardName));
}

function entryTargetKey(row: ListEntryRow): string {
  if (row.kind === "card") {
    return row.cardId;
  }
  if (row.kind === "printing") {
    return row.printingId;
  }
  return row.copyId;
}

function expandedTargetKey(
  kind: ListKind,
  entry: { cardId?: string; printingId?: string; copyId?: string },
): string {
  if (kind === "card") {
    return entry.cardId ?? "";
  }
  if (kind === "printing") {
    return entry.printingId ?? "";
  }
  return entry.copyId ?? "";
}

/**
 * Whether a rule set consults the owner's copies: a trade rule takes them as
 * its supply, and a `netOwned` wish rule subtracts what the owner already has.
 * Kept as one predicate so the per-list and batched-count paths can't drift on
 * which rules trigger the inventory load.
 */
function needsOwnedCopies(rules: ListRules): boolean {
  return rules.some((rule) => rule.kind === "trade" || (rule.kind === "wish" && rule.netOwned));
}

/**
 * Maps a raw `list_entries` row to the shape `expandList` merges rule output
 * against, skipping the enrichment joins.
 *
 * Safe for counting because the table's constraints already guarantee what those
 * joins would have checked: FKs to `cards` / `printings` / `copies` mean the
 * target row exists, `fk_list_entries_list_kind` means the entry's kind matches
 * its list's, and `chk_list_entries_kind_shape` means exactly the one id column
 * for that kind is set. So no row an INNER join would have dropped reaches here,
 * and the merged key set is the same one the enriched path produces.
 */
function toRawManualEntryRow(
  row: Pick<
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
  >,
): ManualEntryRow {
  return {
    id: row.id,
    kind: row.kind,
    cardId: row.cardId,
    printingId: row.printingId,
    copyId: row.copyId,
    quantity: row.quantity,
    tradeOverride: tradeOverrideFromRow(row),
  };
}

function toManualEntryRow(row: ListEntryRow): ManualEntryRow {
  return {
    id: row.id ?? "",
    kind: row.kind,
    cardId: row.kind === "card" ? row.cardId : null,
    printingId: row.kind === "printing" || row.kind === "copy" ? row.printingId : null,
    copyId: row.kind === "copy" ? row.copyId : null,
    quantity: row.quantity,
    tradeOverride: row.tradeOverride,
  };
}

async function expandAndEnrich(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  kind: ListKind,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  const manual = await fetchEnrichedEntries(db, kind, scope);

  let ruleQuery = db
    .selectFrom("lists")
    .select(["rules", "ruleCombine", "userId"])
    .where("id", "=", scope.listId);
  if (scope.userId !== undefined) {
    ruleQuery = ruleQuery.where("userId", "=", scope.userId);
  }
  const listRow = await ruleQuery.executeTakeFirst();
  const rules = listRow ? hydrateListRules(listRow.rules) : [];
  if (!listRow || rules.length === 0 || !providers) {
    return manual;
  }

  const { printings: catalog, customTagAssignments } = await providers.assembleCatalog();
  // Loaded before the copy scope below — the scope must see the same prices as
  // the evaluation, or copy loading would drift from what the rules match.
  const priceLookup = rules.some((rule) => ruleFiltersOnPrice(rule))
    ? await providers.priceLookup()
    : undefined;
  const needsCopies = needsOwnedCopies(rules);
  // Only load the copies the rules can actually consult. Computed from the
  // catalog alone (no rule's match depends on what is owned), so this is a pure
  // narrowing of the same result set — see `ownedCopyPrintingScope`.
  const ownedCopies = needsCopies
    ? await providers.ownedCopies(
        listRow.userId,
        ownedCopyPrintingScope(rules, kind, { catalog, customTagAssignments, priceLookup }),
      )
    : [];
  // Trade rules rank owned copies by niceness (keep the nicer, offer the
  // plainer); wish rules don't, so the reference orders load only for trade rules.
  const needsKeepOrder = rules.some((rule) => rule.kind === "trade");
  const enumOrders = needsKeepOrder ? await providers.enumOrders() : undefined;
  const ruleEntries = evaluateListRules(
    rules,
    kind,
    {
      catalog,
      ownedCopies,
      customTagAssignments,
      enumOrders,
      priceLookup,
    },
    listRow.ruleCombine,
  );
  const expanded = expandList(
    kind,
    manual.map((row) => toManualEntryRow(row)),
    ruleEntries,
  );

  const manualByKey = new Map(manual.map((row) => [entryTargetKey(row), row]));
  const ruleOnlyKeys = expanded.filter((entry) => entry.id === null);
  const details = await loadRuleOnlyDetails(db, kind, ruleOnlyKeys);

  const result: ListEntryRow[] = [];
  for (const entry of expanded) {
    if (entry.id !== null) {
      // Manual or both: reuse the enriched manual row, but take the merged
      // quantity + source from the expansion.
      const base = manualByKey.get(expandedTargetKey(kind, entry));
      if (base) {
        result.push({
          ...base,
          quantity: entry.quantity,
          ruleQuantity: entry.ruleQuantity,
          source: entry.source,
        });
      }
      continue;
    }
    const row = buildRuleOnlyRow(kind, entry, details, scope.listId);
    if (row) {
      result.push(row);
    }
  }
  return result.sort((a, b) => a.cardName.localeCompare(b.cardName));
}

interface RuleOnlyDetails {
  cards: Map<string, { cardName: string }>;
  printings: Map<string, PrintingDetail>;
  copies: Map<string, CopyDetail>;
}

interface CopyDetail extends PrintingDetail {
  printingId: string;
  collectionId: string;
  reserved: boolean;
  onLoan: boolean;
}

async function loadRuleOnlyDetails(
  db: Kysely<Database>,
  kind: ListKind,
  ruleOnly: { cardId?: string; printingId?: string; copyId?: string }[],
): Promise<RuleOnlyDetails> {
  const empty: RuleOnlyDetails = { cards: new Map(), printings: new Map(), copies: new Map() };
  if (ruleOnly.length === 0) {
    return empty;
  }
  if (kind === "card") {
    const ids = ruleOnly
      .map((entry) => entry.cardId)
      .filter((id): id is string => id !== undefined);
    return { ...empty, cards: await cardDetailsByIds(db, ids) };
  }
  if (kind === "printing") {
    const ids = ruleOnly
      .map((entry) => entry.printingId)
      .filter((id): id is string => id !== undefined);
    return { ...empty, printings: await printingDetailsByIds(db, ids) };
  }
  const ids = ruleOnly.map((entry) => entry.copyId).filter((id): id is string => id !== undefined);
  return { ...empty, copies: await copyDetailsByIds(db, ids) };
}

function buildRuleOnlyRow(
  kind: ListKind,
  entry: {
    cardId?: string;
    printingId?: string;
    copyId?: string;
    quantity: number;
    ruleQuantity: number;
    tradeOverride: TradePreference;
  },
  details: RuleOnlyDetails,
  listId: string,
): ListEntryRow | null {
  if (kind === "card") {
    const detail = entry.cardId ? details.cards.get(entry.cardId) : undefined;
    if (!detail || !entry.cardId) {
      return null;
    }
    return {
      kind: "card",
      id: null,
      listId,
      quantity: entry.quantity,
      ruleQuantity: entry.ruleQuantity,
      source: "rule",
      cardId: entry.cardId,
      cardName: detail.cardName,
      tradeOverride: entry.tradeOverride,
    };
  }
  if (kind === "printing") {
    const detail = entry.printingId ? details.printings.get(entry.printingId) : undefined;
    if (!detail || !entry.printingId) {
      return null;
    }
    return {
      kind: "printing",
      id: null,
      listId,
      quantity: entry.quantity,
      ruleQuantity: entry.ruleQuantity,
      source: "rule",
      printingId: entry.printingId,
      ...detail,
      tradeOverride: entry.tradeOverride,
    };
  }
  const detail = entry.copyId ? details.copies.get(entry.copyId) : undefined;
  if (!detail || !entry.copyId) {
    return null;
  }
  return {
    kind: "copy",
    id: null,
    listId,
    quantity: entry.quantity,
    ruleQuantity: entry.ruleQuantity,
    source: "rule",
    copyId: entry.copyId,
    printingId: detail.printingId,
    collectionId: detail.collectionId,
    cardName: detail.cardName,
    setId: detail.setId,
    rarity: detail.rarity,
    finish: detail.finish,
    shortCode: detail.shortCode,
    language: detail.language,
    imageId: detail.imageId,
    reserved: detail.reserved,
    onLoan: detail.onLoan,
    tradeOverride: entry.tradeOverride,
  };
}

async function cardDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, { cardName: string }>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("cards as card")
    .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id")
    .select(["card.id", "card.name as name", cardTypesColumn(), "card.tags as tags"])
    .where("card.id", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.id, { cardName: legendDisplayName(row) }]));
}

async function copyDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, CopyDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await selectCopyWithCard(db)
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
    .select([
      "cp.id",
      "cp.printingId",
      "cp.collectionId",
      "c.name as name",
      cardTypesColumn(),
      "c.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
      "ctc.copyId as reservedByTradeCopyId",
      "lc.copyId as pinnedByLoanCopyId",
    ])
    .where("cp.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        printingId: row.printingId,
        collectionId: row.collectionId,
        cardName: legendDisplayName(row),
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
        reserved: row.reservedByTradeCopyId !== null,
        onLoan: row.pinnedByLoanCopyId !== null,
      },
    ]),
  );
}

async function cardEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = db
    .selectFrom("listEntries as le")
    .innerJoin("cards as card", "card.id", "le.cardId")
    .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id")
    .where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.cardId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
    ])
    .execute();
  return rows.map((row) => ({
    kind: "card",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    cardId: row.cardId as string,
    cardName: legendDisplayName(row),
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

async function printingEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = joinFrontImage(
    db
      .selectFrom("listEntries as le")
      .innerJoin("printings as p", "p.id", "le.printingId")
      .innerJoin("cards as card", "card.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id"),
  ).where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.printingId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
    ])
    .execute();
  return rows.map((row) => ({
    kind: "printing",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    printingId: row.printingId as string,
    cardName: legendDisplayName(row),
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

async function copyEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = joinFrontImage(
    db
      .selectFrom("listEntries as le")
      .innerJoin("copies as cp", "cp.id", "le.copyId")
      .innerJoin("printings as p", "p.id", "cp.printingId")
      .innerJoin("cards as card", "card.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id"),
  )
    // UNIQUE copy_id: at most one live trade per copy, so this join can't multiply rows.
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    // Same UNIQUE copy_id guarantee for loans.
    .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
    .where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.copyId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
      "cp.collectionId",
      "cp.printingId",
      "ctc.copyId as reservedByTradeCopyId",
      "lc.copyId as pinnedByLoanCopyId",
    ])
    .execute();
  return rows.map((row) => ({
    kind: "copy",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    copyId: row.copyId as string,
    printingId: row.printingId,
    collectionId: row.collectionId,
    cardName: legendDisplayName(row),
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    reserved: row.reservedByTradeCopyId !== null,
    onLoan: row.pinnedByLoanCopyId !== null,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

function tradeOverrideFromRow(row: {
  pricePref: string | null;
  priceAbsoluteCents: number | null;
  tradeType: string | null;
}): TradePreference {
  if (row.pricePref === null && row.priceAbsoluteCents === null && row.tradeType === null) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.pricePref as TradePreference["pricePref"],
    priceAbsoluteCents: row.priceAbsoluteCents,
    tradeType: row.tradeType as TradePreference["tradeType"],
  };
}
