import { evaluateListRules, expandList, hydrateListRules } from "@openrift/shared";
import type {
  CardType,
  EntrySource,
  Finish,
  KeepPriorityOrders,
  ListIntent,
  ListKind,
  ListRuleCombine,
  ListRules,
  ManualEntryRow,
  OwnedCopyRow,
  Printing,
  Rarity,
  TradePreference,
} from "@openrift/shared";
import type { DeleteResult, Insertable, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database, ListEntriesTable, ListsTable } from "../db/index.js";
import { imageId } from "./query-helpers.js";

/**
 * Lazy providers a dynamic-rule list read needs but the repo can't build from
 * `db` alone (ADR-034). Wired in `createRepos`. Both are only invoked when a
 * list actually carries a rule, so manual-only reads pay nothing.
 */
export interface ListRuleProviders {
  /**
   * Assembles the full catalog `Printing[]` for `filterCards`, plus the
   * card→custom-tag-slug map rules need to filter on custom tags (ADR-034).
   */
  assembleCatalog: () => Promise<{
    printings: Printing[];
    customTagAssignments: Record<string, readonly string[]>;
  }>;
  /** The given user's personally-owned copies (trade-rule source). */
  ownedCopies: (ownerId: string) => Promise<OwnedCopyRow[]>;
  /**
   * Reference orders (finish / rarity / art-variant) a trade rule uses to keep
   * the nicer copies and offer the plainer ones. Only fetched for trade rules.
   */
  enumOrders: () => Promise<KeepPriorityOrders>;
}

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

export interface BulkUpsertResult {
  /** Brand-new entries created. */
  inserted: number;
  /** Existing entries whose quantity was incremented. */
  updated: number;
}

interface ListWithCount extends Selectable<ListsTable> {
  entryCount: number;
}

interface ListEntryRowBase {
  /** Real `list_entries.id` for manual/both entries; `null` for rule-only (ADR-034). */
  id: string | null;
  listId: string;
  quantity: number;
  /** Where this entry came from (ADR-034). Manual-only lists are always "manual". */
  source: EntrySource;
  /** Rule's contribution to `quantity` (ADR-034 additive model); 0 for manual-only. */
  ruleQuantity: number;
  cardName: string;
  cardType: CardType;
  tradeOverride: TradePreference;
}

/**
 * Re-hydrate the persisted `rules` jsonb into normalized {@link ListRules}.
 * Delegates to the shared {@link hydrateListRules} so a rule saved before a
 * newer filter dimension existed still evaluates (the backfill mirrors
 * `filterCards`). ADR-034.
 * @returns The parsed, normalized rules (empty array when the column is empty).
 */
function parseRules(value: ListRules | string | null | undefined): ListRules {
  return hydrateListRules(value);
}

/**
 * Binds the rules as a real `jsonb` array via a `text::jsonb` cast.
 *
 * postgres.js infers a bound param's type from its immediate cast: with a bare
 * `::jsonb` it json-*encodes* the JS string into a jsonb *scalar string* (which
 * breaks the `jsonb_array_length` CHECK). Casting through `::text` first forces
 * the param to bind as text, so `::jsonb` then *parses* it into an array. (We
 * verified `${str}::jsonb` → "string" but `${str}::text::jsonb` → "array".)
 * @returns A Kysely expression that stores `value` as a jsonb array.
 */
function rulesJsonb(value: ListRules | null | undefined) {
  return sql<ListRules>`${JSON.stringify(value ?? [])}::text::jsonb`;
}

interface ListEntryRowPrintingFields {
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

/**
 * Enriched list-entry row, discriminated on `kind` to match the parent list.
 * Each variant carries exactly the fields meaningful for its kind — the
 * `card` variant has no printing details, `printing` has set/rarity/finish,
 * `copy` adds the underlying printing + owning collection.
 */
export type ListEntryRow =
  | (ListEntryRowBase & { kind: "card"; cardId: string })
  | (ListEntryRowBase & ListEntryRowPrintingFields & { kind: "printing"; printingId: string })
  | (ListEntryRowBase &
      ListEntryRowPrintingFields & {
        kind: "copy";
        copyId: string;
        printingId: string;
        collectionId: string;
        /** True when the copy is pinned to a live in-app trade (ADR-019). */
        reserved: boolean;
      });

/**
 * Insert payload for `createEntry` / `bulkCreateEntries`. `kind` is required
 * and must match the parent list (the DB enforces it via the composite FK
 * `fk_list_entries_list_kind`). Exactly one of cardId/printingId/copyId is
 * non-null (per kind), per `chk_list_entries_kind_shape`.
 */
export type NewEntryValues = Pick<
  Insertable<ListEntriesTable>,
  | "id"
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

/** Insert payload for `create`. `kind` is required and immutable post-creation. */
export type NewListValues = Pick<
  Insertable<ListsTable>,
  | "id"
  | "userId"
  | "name"
  | "intent"
  | "kind"
  | "defaultPricePref"
  | "defaultPriceAbsoluteCents"
  | "defaultTradeType"
  | "currency"
> & {
  /** Optional dynamic rules (ADR-034); the repo serializes them before insert. */
  rules?: ListRules | null;
  /** Optional combine mode (ADR-034 amendment 2); null = the intent's default. */
  ruleCombine?: ListRuleCombine | null;
};

/**
 * Patch payload for `update`. Intent and kind are immutable post-creation —
 * the DB-level intent×kind constraint would make swapping either field a
 * shape change that breaks every existing entry.
 */
export type ListUpdate = Omit<
  Updateable<ListsTable>,
  "id" | "userId" | "intent" | "kind" | "createdAt" | "updatedAt"
>;

/**
 * Patch payload for `updateEntry`. Target columns + kind are immutable
 * post-creation by convention — a re-targeting is delete + create.
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

/**
 * Queries for unified user lists (wish / trade / organize) × granularity
 * (card / printing / copy) and their entries.
 *
 * @returns An object with list query methods bound to the given `db`.
 */
export function listsRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    /**
     * @returns All lists for a user with their entry counts, optionally filtered
     *   by intent, ordered by name. The count is computed via a correlated
     *   subquery so a list with no entries still appears (no GROUP BY drops).
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

    /** @returns A single list by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<ListsTable> | undefined> {
      return db
        .selectFrom("lists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The list's id, kind, and intent, scoped to a user, or `undefined`. */
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
     * Inserts a new list at the end of its (user, intent) bucket so it appears
     * after the user's existing lists in the sidebar rather than landing at
     * position 0 and re-ordering on every create.
     * @returns The newly created list row.
     */
    create(values: NewListValues): Promise<Selectable<ListsTable>> {
      const { rules, ...rest } = values;
      return db
        .insertInto("lists")
        .values({
          ...rest,
          rules: rulesJsonb(rules),
          sortOrder: sql<number>`coalesce((select max(sort_order) + 1 from lists where user_id = ${values.userId} and intent = ${values.intent}), 0)`,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Re-numbers `sort_order` for the lists in the given intent bucket to
     * match `orderedIds`, in a single statement so the bucket is never seen
     * partially re-numbered. IDs not owned by the user (or not in the given
     * intent) are silently ignored — the caller is expected to send the
     * current view of the bucket.
     * @returns Nothing.
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

    /** @returns The updated list row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: ListUpdate,
    ): Promise<Selectable<ListsTable> | undefined> {
      // `rules` must be cast text→jsonb so it stores as an array (see rulesJsonb);
      // every other column passes through unchanged.
      const { rules, ...rest } = updates;
      const setValues = rules === undefined ? rest : { ...rest, rules: rulesJsonb(rules) };
      return db
        .updateTable("lists")
        .set(setValues)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("lists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Lists owned by `userId` that reference any of `copyIds`, with a per-list
     * copy count and the distinct number of those copies on at least one list.
     * Only copy-kind entries carry a non-null `copy_id`, so the `copyId in`
     * filter implicitly restricts to them. Drives the dispose confirmation's
     * cross-list warning: disposing hard-deletes the copy and cascades its
     * `list_entries` away, so the copy also disappears from every list here.
     * @returns Per-list breakdown (busiest first) and the distinct cross-list copy count.
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

      // A copy can appear on several lists, so count distinct copies per list
      // (and overall) rather than summing rows.
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
     * Reads the current share state (token + public flag) for a list the user
     * owns. Used by GET /lists/{id}/share and the idempotent POST /share, which
     * must distinguish "not owned" (→ 404) from "owned but unshared" (→ token
     * null). Returns `undefined` only when the list isn't owned by the user.
     * @returns `{ shareToken, isPublic }` for an owned list, else `undefined`.
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<{ shareToken: string | null; isPublic: boolean } | undefined> {
      return db
        .selectFrom("lists")
        .select(["shareToken", "isPublic"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Sets (or nulls) the share_token and is_public flag. Mirrors the deck
     * pattern: `is_public=true` with a token means "shareable by link"; both
     * null + false means private.
     * @returns The updated list row, or `undefined` if not owned by the user.
     */
    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<ListsTable> | undefined> {
      return db
        .updateTable("lists")
        .set({ shareToken, isPublic })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Looks up a public list by its share token. Anonymous — no user scoping.
     * @returns The list plus owner display name, or `undefined` if the token
     * doesn't match a public list.
     */
    async findByShareToken(
      shareToken: string,
    ): Promise<
      { list: Selectable<ListsTable>; ownerName: string | null; ownerEmail: string } | undefined
    > {
      const row = await db
        .selectFrom("lists as l")
        .innerJoin("users as u", "u.id", "l.userId")
        .selectAll("l")
        .select(["u.name as ownerName", "u.email as ownerEmail"])
        .where("l.shareToken", "=", shareToken)
        .where("l.isPublic", "=", true)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const { ownerName, ownerEmail, ...list } = row;
      return { list, ownerName, ownerEmail };
    },

    /**
     * Enriched entries for a list, joined with card/printing/copy details.
     * The single query dispatched depends on the list's `kind`, so each path
     * uses clean INNER joins along its target's FK and the per-kind partial
     * unique index. Scoped to the owning user for defense-in-depth.
     * @returns Enriched entry rows sorted by card name.
     */
    entriesWithDetails(listId: string, kind: ListKind, userId: string): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId, userId });
    },

    /**
     * Same as `entriesWithDetails` but anonymous — no user scoping. Caller
     * has already verified access (e.g. by share token).
     * @returns Enriched entry rows sorted by card name.
     */
    entriesWithDetailsAnon(listId: string, kind: ListKind): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId });
    },

    /** @returns The newly created entry row. */
    createEntry(values: NewEntryValues): Promise<Selectable<ListEntriesTable>> {
      return db.insertInto("listEntries").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /**
     * Bulk-upsert entries (all of the same kind, matching the parent list).
     *
     * For card- and printing-kind lists, ON CONFLICT bumps the existing row's
     * `quantity` by the new row's `quantity` — drag-readd accumulates count
     * instead of silently dropping. The `(xmax = 0)` marker distinguishes
     * freshly-inserted rows from rows that took the DO UPDATE branch in a
     * single roundtrip (xmax is the deleting/updating txid, 0 for inserts).
     *
     * For copy-kind lists, ON CONFLICT does nothing — a list_entry with a
     * `copy_id` points to a specific physical copy, which is singular by
     * definition. A duplicate drop of the same copy is a no-op, not a
     * quantity bump.
     *
     * `kind` selects which partial unique index ON CONFLICT targets; Postgres
     * needs the matching WHERE predicate to disambiguate which partial index
     * to use, or it raises "no unique or exclusion constraint matching the
     * ON CONFLICT specification".
     *
     * @returns Counts of brand-new vs. merged-into entries (`updated` is
     *   always 0 for copy-kind lists).
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
      // quantities so the merge semantics match a later ON CONFLICT bump;
      // copy kind keeps the first occurrence (DO NOTHING is singular).
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
            : conflictTarget
                .doUpdateSet({
                  quantity: sql<number>`list_entries.quantity + excluded.quantity`,
                })
                // Replay guard (ADR-027): when the client supplies entry ids,
                // a retried insert whose first attempt landed conflicts with
                // its OWN row — same id — and must not double-bump the
                // quantity. A genuine merge conflicts with a row that has a
                // different id, so the bump still applies. Rows without a
                // client id get a fresh default uuid that never matches, so
                // legacy callers keep the old merge semantics.
                .where(sql<boolean>`list_entries.id is distinct from excluded.id`);
        })
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
     * Drag-from-collections sugar: takes copy IDs and inserts entries in the
     * shape required by the list's kind. The mapping is:
     *   - kind = 'copy'     → one entry per owned copy
     *   - kind = 'printing' → one entry per distinct printing across the owned copies
     *   - kind = 'card'     → one entry per distinct card across the owned copies
     *
     * Accounting:
     *   - `added`: derived targets that produced a brand-new entry.
     *   - `updated`: derived targets that matched an existing entry — the
     *     existing row's quantity is incremented (see `bulkCreateEntries`).
     *   - `skipped`: copy IDs that didn't qualify (see `personalOnly`: own
     *     collections only for trade/wish, plus shared group collections for
     *     organize). Kind-dedup collapses (3 copies of one card → 1 card entry)
     *     are NOT counted as skipped — the user got the entry they wanted; the
     *     other two folded into the same row.
     *
     * @returns `{ added, updated, skipped }` — drives the success-toast
     *   wording ("Added N", "Updated quantity", "(M not owned)").
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

      // Resolve { copyId, printingId, cardId } for the addable subset. With
      // `personalOnly` (trade/wish lists), only copies in the user's own
      // collections qualify — a card you merely have group access to isn't
      // yours to trade away or to wish for. Without it (organize lists), shared
      // group collections the user belongs to count too. Copies that don't
      // qualify are silently dropped; we recover the count via `copyIds.length -
      // owned.length` so they still surface as skipped instead of vanishing
      // from the toast.
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
      // Copy-kind dupes go through DO NOTHING so they don't return a row;
      // recover them here so they surface as `skipped` in the toast rather
      // than vanishing. For card/printing kinds, every row either inserts or
      // updates, so `droppedDupes` is 0.
      const droppedDupes = values.length - result.inserted - result.updated;
      return {
        added: result.inserted,
        updated: result.updated,
        skipped: nonOwnedCount + droppedDupes,
      };
    },

    /** @returns The updated entry row, or `undefined` if not found. */
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

    /** @returns Delete result — check `numDeletedRows` to verify the entry existed. */
    deleteEntry(entryId: string, listId: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("listEntries")
        .where("id", "=", entryId)
        .where("listId", "=", listId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Reads a single entry by id, scoped to its owner, regardless of which list
     * it belongs to. Used by trade-sync (ADR-019) to decrement a snapshotted
     * wish entry whose `listId` was not carried alongside the entry id.
     * @returns The entry row, or `undefined` if not found / not owned by the user.
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
     * Reads raw entry rows for a list-to-list move. Scoped to a single list +
     * the owning user so a stray entry id from another list (or another user's
     * list) is filtered out, not 403'd.
     * @returns The matching insertable subset of each entry row.
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

    /** @returns Delete result — `numDeletedRows` is the count actually removed. */
    deleteEntriesByIds(
      entryIds: readonly string[],
      listId: string,
      userId: string,
    ): Promise<DeleteResult> {
      if (entryIds.length === 0) {
        return Promise.resolve({ numDeletedRows: 0n } as DeleteResult);
      }
      return db
        .deleteFrom("listEntries")
        .where("id", "in", [...entryIds])
        .where("listId", "=", listId)
        .where("userId", "=", userId)
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

/** @returns The target id (cardId / printingId / copyId) of an enriched row. */
function entryTargetKey(row: ListEntryRow): string {
  if (row.kind === "card") {
    return row.cardId;
  }
  if (row.kind === "printing") {
    return row.printingId;
  }
  return row.copyId;
}

/** @returns The target id of an expanded entry for the list's kind. */
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

/** @returns The lightweight manual-entry shape `expandList` consumes. */
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

/**
 * The authority that turns a list's manual entries + its dynamic rules into the
 * rendered, enriched, deduped entry set (ADR-034). Manual-only lists short-
 * circuit to the existing enrichment. When rules are present they are evaluated
 * against the server-assembled catalog (+ the owner's copies for trade rules),
 * merged with manual entries via `expandList`, and the rule-only entries are
 * enriched by target id.
 * @returns Enriched entry rows (manual ∪ rule output), sorted by card name.
 */
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
  const rules = listRow ? parseRules(listRow.rules) : [];
  // Manual-only (the overwhelmingly common case): nothing to expand.
  if (!listRow || rules.length === 0 || !providers) {
    return manual;
  }

  const { printings: catalog, customTagAssignments } = await providers.assembleCatalog();
  // Trade rules need the owner's copies for supply; wish rules need them too when
  // netting against what's owned ("only what I'm missing", ADR-034).
  const needsCopies = rules.some(
    (rule) => rule.kind === "trade" || (rule.kind === "wish" && rule.netOwned),
  );
  const ownedCopies = needsCopies ? await providers.ownedCopies(listRow.userId) : [];
  // Trade rules rank owned copies by niceness (keep the nicer, offer the plainer);
  // wish rules don't, so only pay for the reference orders on a trade rule.
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
  cards: Map<string, { cardName: string; cardType: CardType }>;
  printings: Map<string, PrintingDetail>;
  copies: Map<string, CopyDetail>;
}

interface PrintingDetail {
  cardName: string;
  cardType: CardType;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

interface CopyDetail extends PrintingDetail {
  printingId: string;
  collectionId: string;
  reserved: boolean;
}

/**
 * Loads detail rows for the rule-only target ids of the given kind.
 * @returns Detail maps for cards, printings, and copies (only the relevant one is populated).
 */
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

/**
 * Assembles an enriched `ListEntryRow` for one rule-only entry.
 * @returns The enriched row, or null if its detail row vanished.
 */
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
      cardType: detail.cardType,
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
    cardType: detail.cardType,
    setId: detail.setId,
    rarity: detail.rarity,
    finish: detail.finish,
    shortCode: detail.shortCode,
    language: detail.language,
    imageId: detail.imageId,
    reserved: detail.reserved,
    tradeOverride: entry.tradeOverride,
  };
}

async function cardDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, { cardName: string; cardType: CardType }>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("cards as card")
    .select(["card.id", "card.name as cardName", "card.type as cardType"])
    .where("card.id", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.id, { cardName: row.cardName, cardType: row.cardType }]));
}

async function printingDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, PrintingDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("printings as p")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
    .select([
      "p.id",
      "card.name as cardName",
      "card.type as cardType",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("ci").as("imageId"),
    ])
    .where("p.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        cardName: row.cardName,
        cardType: row.cardType,
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
      },
    ]),
  );
}

async function copyDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, CopyDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    .select([
      "cp.id",
      "cp.printingId",
      "cp.collectionId",
      "card.name as cardName",
      "card.type as cardType",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("ci").as("imageId"),
      "ctc.copyId as reservedByTradeCopyId",
    ])
    .where("cp.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        printingId: row.printingId,
        collectionId: row.collectionId,
        cardName: row.cardName,
        cardType: row.cardType,
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
        reserved: row.reservedByTradeCopyId !== null,
      },
    ]),
  );
}

/**
 * Card-targeted entries: `le.card_id` is set. Joins straight to cards. The
 * client picks a representative printing of the card.
 * @returns Rows for the card-kind subset, shaped as the `card` variant of `ListEntryRow`.
 */
async function cardEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = db
    .selectFrom("listEntries as le")
    .innerJoin("cards as card", "card.id", "le.cardId")
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
      "card.name as cardName",
      "card.type as cardType",
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
    cardName: row.cardName,
    cardType: row.cardType as CardType,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

/**
 * Printing-targeted entries: `le.printing_id` is set. Reaches the card via
 * the printing, and the front-face image via the printing-images join.
 * @returns Rows for the printing-kind subset, shaped as the `printing` variant of `ListEntryRow`.
 */
async function printingEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = db
    .selectFrom("listEntries as le")
    .innerJoin("printings as p", "p.id", "le.printingId")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
    .where("le.listId", "=", scope.listId);
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
      "card.name as cardName",
      "card.type as cardType",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("ci").as("imageId"),
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
    cardName: row.cardName,
    cardType: row.cardType as CardType,
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

/**
 * Copy-targeted entries: `le.copy_id` is set; reaches printing/card via the
 * copy, and the front-face image via the printing-images join.
 * @returns Rows for the copy-kind subset, shaped as the `copy` variant of `ListEntryRow`.
 */
async function copyEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = db
    .selectFrom("listEntries as le")
    .innerJoin("copies as cp", "cp.id", "le.copyId")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
    // A copy is pinned to at most one live trade (UNIQUE copy_id), so this
    // join can't multiply rows. Its presence means the copy is reserved.
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
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
      "card.name as cardName",
      "card.type as cardType",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("ci").as("imageId"),
      "cp.collectionId",
      "cp.printingId",
      "ctc.copyId as reservedByTradeCopyId",
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
    cardName: row.cardName,
    cardType: row.cardType as CardType,
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    reserved: row.reservedByTradeCopyId !== null,
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
