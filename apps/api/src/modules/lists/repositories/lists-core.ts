import type { ListIntent } from "@openrift/shared/types/api/list";
import type { ListRuleCombine, ListRules } from "@openrift/shared/types/list-rule";
import type { DeleteResult, Insertable, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListsTable } from "../../../db/tables/lists.js";

export interface ListWithCount extends Selectable<ListsTable> {
  entryCount: number;
}

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

export function listsCoreRepo(db: Kysely<Database>) {
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
  };
}
