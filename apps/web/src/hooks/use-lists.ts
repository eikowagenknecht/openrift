import type {
  Currency,
  ListBulkAddResponse,
  ListDetailResponse,
  ListEntryDetailResponse,
  ListIntent,
  ListKind,
  ListListResponse,
  ListMoveResponse,
  ListResponse,
  ListShareResponse,
  PublicListDetailResponse,
  TradePreference,
} from "@openrift/shared";
import { listsContract, publicListsContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { useListsWriter, useSyncedListEntries, useSyncedLists } from "@/lib/copies-collection";
import { tradeDefaultsFromListRow, tradeOverrideFromEntryRow } from "@/lib/lists-offline";
import type { ListEntryShapeRow, ListShapeRow, ListsWriteCollection } from "@/lib/lists-offline";
import { createOfflineTx, settleForFeedback } from "@/lib/offline-feedback";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";
import { uuidv7 } from "@/lib/uuidv7";

// ── LIST ─────────────────────────────────────────────────────────────────────

const fetchLists = createServerFn({ method: "GET" })
  .validator((input: { intent?: ListIntent } | undefined) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListListResponse> =>
      apiOrpcClient(listsContract, context.cookie).list(
        data?.intent ? { intent: data.intent } : {},
      ),
  );

const fetchListDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }): Promise<ListDetailResponse> => {
    // 404 (unknown list, or one belonging to another user) maps to the
    // NOT_FOUND sentinel the route boundary expects.
    const { error, data } = await safe(
      apiOrpcClient(listsContract, context.cookie).get({ id: listId }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function listsQueryOptions(userId: string, intent?: ListIntent) {
  return queryOptions({
    queryKey: queryKeys.lists.all(userId, intent),
    queryFn: () => fetchLists({ data: intent ? { intent } : undefined }),
    select: (data: ListListResponse) => data.items,
    staleTime: 5 * 60 * 1000,
  });
}

export function listDetailQueryOptions(userId: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.lists.detail(userId, listId),
    queryFn: () => fetchListDetail({ data: listId }),
  });
}

// Stable placeholder for rows the query layer hasn't caught up with yet (a
// just-created optimistic list). A constant on purpose: a fresh `new Date()`
// per render would defeat React Compiler memoization of the merged list. The
// real timestamps arrive with the next list refetch.
const PENDING_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * Reproduces the server's `listForUser` ordering client-side so the merged
 * synced rows render in the order the query layer did: sort order, then name.
 *
 * @returns Negative/zero/positive per the usual comparator contract.
 */
function compareListRows(a: ListShapeRow, b: ListShapeRow): number {
  if (a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  return a.name.localeCompare(b.name);
}

/**
 * The viewer's lists in the pre-Electric `ListResponse` shape.
 *
 * Reads are layered (ADR-027 lists vertical): the synced lists shape is the
 * source of truth for existence, name, trade defaults, and sort order — so
 * optimistic creates/renames/deletes/reorders reflect instantly and offline —
 * and `entryCount` is derived live from the synced entries shape. The
 * react-query list keeps owning the server-derived fields a single-table
 * shape cannot carry (share state, timestamps).
 *
 * During SSR (and while the shape hasn't finished its first sync, e.g. when
 * Electric is unavailable) the hook falls back to the server-provided list,
 * exactly like before.
 *
 * @returns The suspense query result with `data` replaced by the merged rows.
 */
export function useLists(intent?: ListIntent) {
  const userId = useRequiredUserId();
  const syncedLists = useSyncedLists();
  const syncedEntries = useSyncedListEntries();
  const serverQuery = useSuspenseQuery(listsQueryOptions(userId, intent));

  // Skip the live queries during SSR: TanStack DB's live-query internals use
  // useSyncExternalStore without providing a getServerSnapshot, so running
  // them server-side forces a client-render fallback with a warning. On the
  // server we fall back to the server-provided list (stale but correct at
  // load). The collections are null mid-sign-out (this hook itself unmounts
  // an instant later); same-shape fallback applies.
  const { data: listRows, isReady: listsReady } = useLiveQuery(
    (q) => (globalThis.window === undefined || !syncedLists ? null : q.from({ list: syncedLists })),
    [syncedLists],
  );
  const { data: entryRows } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !syncedEntries ? null : q.from({ entry: syncedEntries }),
    [syncedEntries],
  );

  const countByList = new Map<string, number>();
  for (const entry of entryRows ?? []) {
    countByList.set(entry.list_id, (countByList.get(entry.list_id) ?? 0) + 1);
  }
  // Once the entries subscription is established, the live count overrides
  // the server-computed entryCount so mutations reflect without a round-trip.
  const entryCount = (id: string, serverCount: number) =>
    entryRows ? (countByList.get(id) ?? 0) : serverCount;

  // `isReady` gates the switch to synced rows: before the first sync ever
  // completes (or when sync is unavailable) the shape would render an empty
  // list, so the server list stays authoritative until then.
  if (!listRows || !listsReady) {
    const data = serverQuery.data.map((list) => ({
      ...list,
      entryCount: entryCount(list.id, list.entryCount),
    }));
    return { ...serverQuery, data };
  }

  const serverById = new Map(serverQuery.data.map((list) => [list.id, list]));
  const data = listRows
    .filter((row) => intent === undefined || row.intent === intent)
    .toSorted(compareListRows)
    .map((row): ListResponse => {
      const server = serverById.get(row.id);
      return {
        id: row.id,
        name: row.name,
        intent: row.intent,
        kind: row.kind,
        entryCount: entryCount(row.id, server?.entryCount ?? 0),
        tradeDefaults: tradeDefaultsFromListRow(row),
        currency: row.currency,
        // Server-derived enrichment; the fallbacks only apply to rows the
        // query layer hasn't caught up with (just-created optimistic rows).
        isPublic: server?.isPublic ?? false,
        shareToken: server?.shareToken ?? null,
        createdAt: server?.createdAt ?? PENDING_TIMESTAMP,
        updatedAt: server?.updatedAt ?? PENDING_TIMESTAMP,
      };
    });
  return { ...serverQuery, data };
}

/**
 * One list with its enriched entries, layered like {@link useLists}: the
 * synced entries shape owns existence, quantity, and the trade override —
 * so quantity steppers and removals reflect instantly and offline — while
 * the server detail keeps owning the card/printing enrichment (names,
 * images, set data) a single-table shape cannot carry. A fresh optimistic
 * entry the query layer hasn't seen yet stays hidden until the post-write
 * invalidation lands, matching the old behavior where fresh adds waited
 * for the refetch.
 *
 * @returns The suspense query result with `data` replaced by the merged
 *   detail payload.
 */
export function useListDetail(listId: string) {
  const userId = useRequiredUserId();
  const syncedLists = useSyncedLists();
  const syncedEntries = useSyncedListEntries();
  const serverQuery = useSuspenseQuery(listDetailQueryOptions(userId, listId));

  const { data: listRows } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !syncedLists
        ? null
        : q.from({ list: syncedLists }).where(({ list }) => eq(list.id, listId)),
    [syncedLists, listId],
  );
  const { data: entryRows, isReady: entriesReady } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !syncedEntries
        ? null
        : q.from({ entry: syncedEntries }).where(({ entry }) => eq(entry.list_id, listId)),
    [syncedEntries, listId],
  );

  const serverData = serverQuery.data;
  const syncedRow = listRows?.[0];
  // The synced shape wins for the fields it carries (name, trade defaults,
  // currency); share state and timestamps stay query-layer. A missing synced
  // row (pre-first-sync, or an optimistic delete just before navigation)
  // falls back to the server list.
  let list: ListResponse = serverData.list;
  if (syncedRow) {
    list = {
      ...serverData.list,
      name: syncedRow.name,
      tradeDefaults: tradeDefaultsFromListRow(syncedRow),
      currency: syncedRow.currency,
    };
  }

  let entries = serverData.entries;
  let liveEntryCount = serverData.list.entryCount;
  if (entryRows && entriesReady) {
    const syncedById = new Map(entryRows.map((row) => [row.id, row]));
    entries = serverData.entries.flatMap((entry): ListEntryDetailResponse[] => {
      const row = syncedById.get(entry.id);
      if (!row) {
        // Deleted optimistically (or on another device) — drop instantly.
        return [];
      }
      return [{ ...entry, quantity: row.quantity, tradeOverride: tradeOverrideFromEntryRow(row) }];
    });
    liveEntryCount = entryRows.length;
  }

  return {
    ...serverQuery,
    data: { list: { ...list, entryCount: liveEntryCount }, entries },
  };
}

// ── MUTATIONS ────────────────────────────────────────────────────────────────
//
// List and entry mutations are durable offline transactions (ADR-027 step 3),
// mirroring the collections hooks in use-collections.ts: the optimistic
// change applies instantly to the synced shapes, the transaction persists to
// the per-user IndexedDB outbox, and the executor dispatches it to the API —
// immediately when online, replayed FIFO after offline periods and reloads.
// The named mutation functions live in @/lib/lists-offline; they return the
// Postgres txid so the optimistic overlay holds until the change arrives back
// through the Electric stream.
//
// Share/unshare stays on the query layer (the token is minted server-side),
// as do entry moves and from-copies adds: both derive their effect server-
// side (same-kind/intent validation, copy-to-target mapping and ownership
// filtering) in ways the client can't reproduce from single-table shapes.

interface CreateListInput {
  name: string;
  intent: ListIntent;
  kind: ListKind;
  /** ADR-017: list-level trade defaults. Ignored on organize lists. */
  tradeDefaults?: TradePreference;
  /** ADR-017: list currency. Required when any 'absolute' preference is set. */
  currency?: Currency | null;
}

/**
 * The next sort_order for a new list in its intent bucket, mirroring the
 * server's max+1 insert so the optimistic row lands at the bottom of the
 * bucket, exactly where the server will put it.
 *
 * @returns The sort order for the optimistic insert.
 */
function nextIntentSortOrder(lists: ListsWriteCollection, intent: ListIntent): number {
  let max = -1;
  for (const row of lists.toArray) {
    if (row.intent === intent && row.sort_order > max) {
      max = row.sort_order;
    }
  }
  return max + 1;
}

export function useCreateList() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (body: CreateListInput): Promise<{ id: string; name: string }> => {
      if (!writer) {
        throw new Error("Cannot create a list while signed out");
      }
      // ADR-017: organize lists never carry trade defaults; mirror the
      // server-side strip so the optimistic row matches the inserted row.
      const supportsPrefs = body.intent !== "organize";
      const tradeDefaults = supportsPrefs ? body.tradeDefaults : undefined;
      const row: ListShapeRow = {
        // Client-generated id (ADR-027): the optimistic row and the
        // replicated row are the same row — no temp-id machinery.
        id: uuidv7(),
        name: body.name,
        intent: body.intent,
        kind: body.kind,
        default_price_pref: tradeDefaults?.pricePref ?? null,
        default_price_absolute_cents: tradeDefaults?.priceAbsoluteCents ?? null,
        default_trade_type: tradeDefaults?.tradeType ?? null,
        currency: supportsPrefs ? (body.currency ?? null) : null,
        sort_order: nextIntentSortOrder(writer.lists, body.intent),
      };
      const tx = createOfflineTx<ListShapeRow>(writer.executor, "createLists");
      tx.mutate(() => {
        writer.lists.insert(row);
      });
      await settleForFeedback(tx.commit(), writer.executor);
      return { id: row.id, name: row.name };
    },
  });
}

interface UpdateListInput {
  listId: string;
  name?: string;
  tradeDefaults?: TradePreference;
  currency?: Currency | null;
}

export function useUpdateList() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (body: UpdateListInput) => {
      if (!writer) {
        throw new Error("Cannot update a list while signed out");
      }
      const tx = createOfflineTx<ListShapeRow>(writer.executor, "updateLists");
      tx.mutate(() => {
        writer.lists.update(body.listId, (draft) => {
          if (body.name !== undefined) {
            draft.name = body.name;
          }
          if (body.tradeDefaults !== undefined) {
            draft.default_price_pref = body.tradeDefaults.pricePref;
            draft.default_price_absolute_cents = body.tradeDefaults.priceAbsoluteCents;
            draft.default_trade_type = body.tradeDefaults.tradeType;
          }
          if (body.currency !== undefined) {
            draft.currency = body.currency;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

export function useDeleteList() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (listId: string) => {
      if (!writer) {
        throw new Error("Cannot delete a list while signed out");
      }
      const tx = createOfflineTx<ListShapeRow>(writer.executor, "deleteLists");
      tx.mutate(() => {
        writer.lists.delete(listId);
      });
      // The server cascades the list's entries; those deletes arrive through
      // the Electric stream, so no manual entry cleanup is needed here.
      await settleForFeedback(tx.commit(), writer.executor);
      return listId;
    },
  });
}

/**
 * Reorders the user's lists within one intent bucket. The optimistic update
 * renumbers `sort_order` on the synced rows by `orderedIds`; lists from other
 * intents keep their order. The intent and the full id list ride in the
 * transaction metadata because unchanged rows produce no mutation, and the
 * server renumbers exactly the ids it receives.
 *
 * @returns A mutation that takes `{ intent, orderedIds }` and reorders the
 *   matching intent bucket in the sidebar.
 */
export function useReorderLists() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ intent, orderedIds }: { intent: ListIntent; orderedIds: string[] }) => {
      if (!writer || orderedIds.length === 0) {
        return;
      }
      const tx = createOfflineTx<ListShapeRow>(writer.executor, "reorderLists", {
        intent,
        orderedIds,
      });
      tx.mutate(() => {
        writer.lists.update(orderedIds, (drafts) => {
          for (const [index, draft] of drafts.entries()) {
            draft.sort_order = index;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

// ── ENTRIES ──────────────────────────────────────────────────────────────────

interface BulkAddVariables {
  listId: string;
  entries: {
    cardId?: string;
    printingId?: string;
    copyId?: string;
    quantity?: number;
  }[];
}

/**
 * Stable lookup key for an entry's target within one list.
 *
 * @returns A `kind:id` string keyed on whichever target column is set.
 */
function entryTargetKey(row: ListEntryShapeRow): string {
  if (row.card_id !== null) {
    return `card:${row.card_id}`;
  }
  if (row.printing_id !== null) {
    return `printing:${row.printing_id}`;
  }
  return `copy:${row.copy_id}`;
}

function targetFromInput(input: {
  cardId?: string;
  printingId?: string;
  copyId?: string;
}): { key: string; kind: ListKind } | null {
  if (input.cardId !== undefined) {
    return { key: `card:${input.cardId}`, kind: "card" };
  }
  if (input.printingId !== undefined) {
    return { key: `printing:${input.printingId}`, kind: "printing" };
  }
  if (input.copyId !== undefined) {
    return { key: `copy:${input.copyId}`, kind: "copy" };
  }
  return null;
}

/**
 * Adds entries to a list, resolving merge-vs-insert client-side against the
 * synced entries shape: an input matching an existing entry bumps that
 * entry's quantity (an idempotent absolute update on replay), a new target
 * inserts a fresh row under a client-generated id (replay-safe via the
 * server's id guard), and re-adding a copy already on the list is skipped —
 * a copy entry is singular, mirroring the server's DO NOTHING.
 *
 * @returns A mutation resolving to the usual added/updated/skipped counters.
 */
export function useBulkAddListEntries() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: BulkAddVariables): Promise<ListBulkAddResponse> => {
      if (!writer) {
        throw new Error("Cannot add to a list while signed out");
      }
      const existingByTarget = new Map<string, ListEntryShapeRow>();
      for (const row of writer.listEntries.toArray) {
        if (row.list_id === vars.listId) {
          existingByTarget.set(entryTargetKey(row), row);
        }
      }

      const inserts: ListEntryShapeRow[] = [];
      const insertedByTarget = new Map<string, ListEntryShapeRow>();
      // entryId → new absolute quantity (absolute, so a replay can't double-bump).
      const bumps = new Map<string, number>();
      let skipped = 0;
      for (const input of vars.entries) {
        const target = targetFromInput(input);
        if (!target) {
          skipped += 1;
          continue;
        }
        const delta = input.quantity ?? 1;
        const pending = insertedByTarget.get(target.key);
        if (pending) {
          // In-batch duplicate: merge into the pending insert (copy entries
          // are singular and skip instead).
          if (pending.kind === "copy") {
            skipped += 1;
          } else {
            pending.quantity += delta;
          }
          continue;
        }
        const existing = existingByTarget.get(target.key);
        if (existing) {
          if (existing.kind === "copy") {
            skipped += 1;
          } else {
            bumps.set(existing.id, (bumps.get(existing.id) ?? existing.quantity) + delta);
          }
          continue;
        }
        const row: ListEntryShapeRow = {
          id: uuidv7(),
          list_id: vars.listId,
          kind: target.kind,
          card_id: input.cardId ?? null,
          printing_id: input.printingId ?? null,
          copy_id: input.copyId ?? null,
          quantity: delta,
          price_pref: null,
          price_absolute_cents: null,
          trade_type: null,
        };
        inserts.push(row);
        insertedByTarget.set(target.key, row);
      }

      const settles: Promise<unknown>[] = [];
      if (inserts.length > 0) {
        const tx = createOfflineTx<ListEntryShapeRow>(writer.executor, "createListEntries");
        tx.mutate(() => {
          writer.listEntries.insert(inserts);
        });
        settles.push(settleForFeedback(tx.commit(), writer.executor));
      }
      if (bumps.size > 0) {
        const tx = createOfflineTx<ListEntryShapeRow>(writer.executor, "updateListEntries");
        tx.mutate(() => {
          writer.listEntries.update([...bumps.keys()], (drafts) => {
            for (const draft of drafts) {
              const next = bumps.get(draft.id);
              if (next !== undefined) {
                draft.quantity = next;
              }
            }
          });
        });
        settles.push(settleForFeedback(tx.commit(), writer.executor));
      }
      await Promise.all(settles);
      return { added: inserts.length, updated: bumps.size, skipped };
    },
  });
}

interface UpdateListEntryInput {
  listId: string;
  entryId: string;
  quantity?: number;
  /** ADR-017 per-entry override. NULL fields fall through to list defaults. */
  tradeOverride?: TradePreference;
}

export function useUpdateListEntry() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: UpdateListEntryInput) => {
      if (!writer) {
        throw new Error("Cannot update a list entry while signed out");
      }
      const tx = createOfflineTx<ListEntryShapeRow>(writer.executor, "updateListEntries");
      tx.mutate(() => {
        writer.listEntries.update(vars.entryId, (draft) => {
          if (vars.quantity !== undefined) {
            draft.quantity = vars.quantity;
          }
          if (vars.tradeOverride !== undefined) {
            draft.price_pref = vars.tradeOverride.pricePref;
            draft.price_absolute_cents = vars.tradeOverride.priceAbsoluteCents;
            draft.trade_type = vars.tradeOverride.tradeType;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

export function useRemoveListEntry() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: { listId: string; entryId: string }) => {
      if (!writer) {
        throw new Error("Cannot remove a list entry while signed out");
      }
      const tx = createOfflineTx<ListEntryShapeRow>(writer.executor, "deleteListEntries");
      tx.mutate(() => {
        writer.listEntries.delete(vars.entryId);
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

export function useBulkRemoveListEntries() {
  const writer = useListsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: { listId: string; entryIds: string[] }) => {
      if (!writer || vars.entryIds.length === 0) {
        return;
      }
      const tx = createOfflineTx<ListEntryShapeRow>(writer.executor, "deleteListEntries");
      tx.mutate(() => {
        writer.listEntries.delete(vars.entryIds);
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

// Drag-from-collections sugar. Stays on the query layer: the server derives
// the right entry shape from the list's kind (one entry per copy / distinct
// printing / distinct card) and filters to copies the viewer owns — a mapping
// the client can't reproduce from single-table shapes. The created rows
// arrive through the Electric stream moments later.
const bulkAddCopiesToListFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListBulkAddResponse> =>
      apiOrpcClient(listsContract, context.cookie).bulkAddFromCopies({
        id: data.listId,
        copyIds: data.copyIds,
      }),
  );

export function useBulkAddCopiesToList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<ListBulkAddResponse, { listId: string; copyIds: string[] }>({
    mutationFn: (vars) => bulkAddCopiesToListFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.listId),
    ],
  });
}

// List-to-list move. Stays on the query layer: the server enforces same-kind
// + same-intent + same-user and re-targets the entries transactionally — the
// moved rows arrive through the Electric stream. We invalidate both list
// details + the lists index so the enrichment follows.
const moveListEntriesFn = createServerFn({ method: "POST" })
  .validator((input: { fromListId: string; toListId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListMoveResponse> =>
      apiOrpcClient(listsContract, context.cookie).moveEntries({
        id: data.fromListId,
        toListId: data.toListId,
        entryIds: data.entryIds,
      }),
  );

export function useMoveListEntries() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    ListMoveResponse,
    { fromListId: string; toListId: string; entryIds: string[] }
  >({
    mutationFn: (vars) => moveListEntriesFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.fromListId),
      queryKeys.lists.detail(userId, variables.toListId),
    ],
  });
}

// ── SHARING ──────────────────────────────────────────────────────────────────

const shareListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: listId }): Promise<ListShareResponse> =>
      apiOrpcClient(listsContract, context.cookie).share({ id: listId }),
  );

export function useShareList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => shareListFn({ data: listId }),
    onSuccess: (data, listId) => {
      queryClient.setQueryData<ListDetailResponse>(queryKeys.lists.detail(userId, listId), (old) =>
        old
          ? {
              ...old,
              list: { ...old.list, shareToken: data.shareToken, isPublic: data.isPublic },
            }
          : old,
      );
    },
  });
}

const unshareListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await apiOrpcClient(listsContract, context.cookie).unshare({ id: listId });
  });

export function useUnshareList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => unshareListFn({ data: listId }),
    onSuccess: (_, listId) => {
      queryClient.setQueryData<ListDetailResponse>(queryKeys.lists.detail(userId, listId), (old) =>
        old ? { ...old, list: { ...old.list, shareToken: null, isPublic: false } } : old,
      );
    },
  });
}

// Migrated to oRPC: contract-typed client. 404 (unknown/non-public token) is a
// typed NOT_FOUND error mapped to the sentinel the caller expects.
const fetchPublicListFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicListDetailResponse> => {
    const { error, data } = await safe(apiOrpcClient(publicListsContract).share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function publicListQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.lists.publicByToken(token),
    queryFn: () => fetchPublicListFn({ data: token }),
  });
}

export function usePublicList(token: string) {
  return useSuspenseQuery(publicListQueryOptions(token));
}
