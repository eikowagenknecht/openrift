import type {
  CollectionResponse,
  CollectionShareResponse,
  PublicCollectionDetailResponse,
} from "@openrift/shared";
import { collectionsContract, publicCollectionsContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import type { CollectionShapeRow, CollectionsWriteCollection } from "@/lib/collections-offline";
import { collectionsQueryOptions } from "@/lib/collections-query";
import {
  useCollectionsWriter,
  useCopiesCollection,
  useSyncedCollections,
} from "@/lib/copies-collection";
import { createOfflineTx, settleForFeedback } from "@/lib/offline-feedback";
import { queryKeys } from "@/lib/query-keys";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";
import { uuidv7 } from "@/lib/uuidv7";

// Re-export for back-compat with consumers that pulled it from this module
// before the split. Route loaders should import from @/lib/collections-query
// directly so the loader path doesn't drag in @tanstack/react-db.
export { collectionsQueryOptions } from "@/lib/collections-query";

// Stable placeholder for rows the query layer hasn't caught up with yet (a
// just-created optimistic collection). A constant on purpose: a fresh
// `new Date()` per render would defeat React Compiler memoization of the
// merged list. The real timestamps arrive with the next list refetch.
const PENDING_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * Reproduces the server's `listAccessibleForUser` ordering client-side so
 * the merged synced rows render in the same order the query layer did:
 * personal collections first, then group sections alphabetically; within a
 * section the inbox leads, then sort order, then name.
 *
 * @returns Negative/zero/positive per the usual comparator contract.
 */
function compareCollections(a: CollectionResponse, b: CollectionResponse): number {
  if ((a.groupId === null) !== (b.groupId === null)) {
    return a.groupId === null ? -1 : 1;
  }
  const groupNames = (a.groupName ?? "").localeCompare(b.groupName ?? "");
  if (groupNames !== 0) {
    return groupNames;
  }
  if (a.isInbox !== b.isInbox) {
    return a.isInbox ? -1 : 1;
  }
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name);
}

/**
 * The viewer's collections in the pre-Electric `CollectionResponse` shape.
 *
 * Reads are layered (ADR-027 collections vertical): the synced collections
 * shape is the source of truth for existence, name, description, inbox flag,
 * and sort order — so optimistic creates/renames/deletes/reorders reflect
 * instantly and offline. The react-query list keeps owning the server-derived
 * fields a single-table shape cannot carry (value totals, share state, group
 * slug/name, per-viewer deck-building availability, admin rights), and
 * copyCount is derived live from the synced copies view.
 *
 * During SSR (and while the shape hasn't finished its first sync, e.g. when
 * Electric is unavailable) the hook falls back to the server-provided list,
 * exactly like before.
 *
 * @returns The suspense query result with `data` replaced by the merged rows.
 */
export function useCollections() {
  const userId = useRequiredUserId();
  const copiesCollection = useCopiesCollection();
  const syncedCollections = useSyncedCollections();
  const serverQuery = useSuspenseQuery(collectionsQueryOptions(userId));

  // Skip the live queries during SSR: TanStack DB's live-query internals use
  // useSyncExternalStore without providing a getServerSnapshot, so running
  // them server-side forces a client-render fallback with a warning. On the
  // server we fall back to the server-provided list (stale but correct at
  // load).
  //
  // The collections are null mid-sign-out (this hook itself unmounts an
  // instant later); same-shape fallback applies.
  const { data: copies } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !copiesCollection
        ? null
        : q.from({ copy: copiesCollection }),
    [copiesCollection],
  );
  const { data: syncedRows, isReady: syncedReady } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !syncedCollections
        ? null
        : q.from({ col: syncedCollections }),
    [syncedCollections],
  );

  const countById = new Map<string, number>();
  for (const copy of copies ?? []) {
    countById.set(copy.collectionId, (countById.get(copy.collectionId) ?? 0) + 1);
  }
  // Once the copies subscription is established, the live count overrides the
  // server-computed copyCount so mutations reflect without a round-trip.
  const copyCount = (id: string, serverCount: number) =>
    copies ? (countById.get(id) ?? 0) : serverCount;

  // `isReady` gates the switch to synced rows: before the first sync ever
  // completes (or when sync is unavailable) the shape would render an empty
  // list, so the server list stays authoritative until then.
  if (!syncedRows || !syncedReady) {
    const data = serverQuery.data.map((col) => ({
      ...col,
      copyCount: copyCount(col.id, col.copyCount),
    }));
    return { ...serverQuery, data };
  }

  const serverById = new Map(serverQuery.data.map((col) => [col.id, col]));
  // Group slug/name fallback for optimistic rows the query layer doesn't know
  // yet: sibling collections of the same group already carry them.
  const groupInfoById = new Map<string, { slug: string; name: string }>();
  for (const col of serverQuery.data) {
    if (col.groupId && col.groupSlug && col.groupName) {
      groupInfoById.set(col.groupId, { slug: col.groupSlug, name: col.groupName });
    }
  }

  const data = syncedRows
    .map((row): CollectionResponse => {
      const server = serverById.get(row.id);
      const groupInfo = row.group_id ? groupInfoById.get(row.group_id) : undefined;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        isInbox: row.is_inbox,
        sortOrder: row.sort_order,
        groupId: row.group_id,
        copyCount: copyCount(row.id, server?.copyCount ?? 0),
        // Server-derived enrichment; the fallbacks only apply to rows the
        // query layer hasn't caught up with (just-created optimistic rows).
        isPublic: server?.isPublic ?? false,
        shareToken: server?.shareToken ?? null,
        totalValueCents: server?.totalValueCents ?? null,
        unpricedCopyCount: server?.unpricedCopyCount ?? null,
        createdAt: server?.createdAt ?? PENDING_TIMESTAMP,
        updatedAt: server?.updatedAt ?? PENDING_TIMESTAMP,
        groupSlug: server?.groupSlug ?? groupInfo?.slug ?? null,
        groupName: server?.groupName ?? groupInfo?.name ?? null,
        availableForDeckbuilding: server?.availableForDeckbuilding ?? row.group_id === null,
        viewerCanAdmin: server?.viewerCanAdmin ?? row.group_id === null,
      };
    })
    .toSorted(compareCollections);
  return { ...serverQuery, data };
}

/**
 * Builds a Map from collection ID to CollectionResponse for O(1) lookups.
 * @returns A stable Map derived from the collections query data.
 */
export function useCollectionsMap(): Map<string, CollectionResponse> {
  "use memo";
  const { data: collections } = useCollections();
  return new Map(collections.map((col) => [col.id, col]));
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// Collection create/rename/delete/reorder are durable offline transactions
// (ADR-027 step 3), mirroring the copies hooks in use-copies.ts: the
// optimistic change applies instantly to the synced collections shape, the
// transaction persists to the per-user IndexedDB outbox, and the executor
// dispatches it to the API — immediately when online, replayed FIFO after
// offline periods and reloads. The named mutation functions live in
// @/lib/collections-offline; they return the Postgres txid so the optimistic
// overlay holds until the change arrives back through the Electric stream.
//
// Share/unshare and deck-building availability stay on the query layer: the
// share token is minted server-side, and the deck-building flag is a
// per-viewer preference table the shape doesn't sync.

/**
 * The next sort_order for a new personal collection, mirroring the server's
 * `nextPersonalSortOrder` (max + 1 over personal rows) so the optimistic row
 * lands at the bottom of the list, exactly where the server will put it.
 *
 * @returns The sort order for the optimistic insert.
 */
function nextPersonalSortOrder(collection: CollectionsWriteCollection): number {
  let max = -1;
  for (const row of collection.toArray) {
    if (row.group_id === null && row.sort_order > max) {
      max = row.sort_order;
    }
  }
  return max + 1;
}

export function useCreateCollection() {
  const writer = useCollectionsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
      groupSlug?: string;
      /**
       * Owning group's id, required alongside `groupSlug` for a shared
       * collection so the optimistic row lands in the right group section.
       * The API itself resolves the group from the slug.
       */
      groupId?: string;
    }): Promise<{ id: string; name: string }> => {
      if (!writer) {
        throw new Error("Cannot create a collection while signed out");
      }
      const groupId = body.groupId ?? null;
      const row: CollectionShapeRow = {
        // Client-generated id (ADR-027): the optimistic row and the
        // replicated row are the same row — no temp-id machinery.
        id: uuidv7(),
        group_id: groupId,
        name: body.name,
        description: body.description ?? null,
        is_inbox: false,
        // Group collections stay alphabetical (sort_order 0); personal ones
        // append to the bottom of the user's list.
        sort_order: groupId ? 0 : nextPersonalSortOrder(writer.collection),
      };
      // Inputs the shape row can't carry ride along as transaction metadata
      // (survives outbox serialization): see CreateCollectionTxMetadata.
      const tx = createOfflineTx<CollectionShapeRow>(writer.executor, "createCollections", {
        ...(body.groupSlug === undefined ? {} : { groupSlug: body.groupSlug }),
        ...(body.availableForDeckbuilding === undefined
          ? {}
          : { availableForDeckbuilding: body.availableForDeckbuilding }),
      });
      tx.mutate(() => {
        writer.collection.insert(row);
      });
      await settleForFeedback(tx.commit(), writer.executor);
      return { id: row.id, name: row.name };
    },
  });
}

export function useUpdateCollection() {
  const writer = useCollectionsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (body: { id: string; name?: string; description?: string | null }) => {
      if (!writer) {
        throw new Error("Cannot update a collection while signed out");
      }
      const tx = createOfflineTx<CollectionShapeRow>(writer.executor, "updateCollections");
      tx.mutate(() => {
        writer.collection.update(body.id, (draft) => {
          if (body.name !== undefined) {
            draft.name = body.name;
          }
          if (body.description !== undefined) {
            draft.description = body.description;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

export function useDeleteCollection() {
  const writer = useCollectionsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => {
      if (!writer) {
        throw new Error("Cannot delete a collection while signed out");
      }
      const tx = createOfflineTx<CollectionShapeRow>(writer.executor, "deleteCollections");
      tx.mutate(() => {
        writer.collection.delete(id);
      });
      // The server atomically moves the remaining copies to the inbox before
      // deleting the collection; that move arrives through the Electric
      // stream, so no manual write-back into the synced copies view is needed.
      await settleForFeedback(tx.commit(), writer.executor);
      return id;
    },
  });
}

/**
 * Reorders the user's personal collections. The optimistic update renumbers
 * `sort_order` on the synced rows by `orderedIds`; rows not in the list
 * (group-owned collections, and the inbox — pinned first regardless) keep
 * their order. The full id list rides in the transaction metadata because
 * unchanged rows produce no mutation, and the server renumbers exactly the
 * ids it receives.
 *
 * @returns A mutation that takes `{ orderedIds }` and reorders personal
 *   collections in the sidebar.
 */
export function useReorderCollections() {
  const writer = useCollectionsWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ orderedIds }: { orderedIds: string[] }) => {
      if (!writer || orderedIds.length === 0) {
        return;
      }
      const tx = createOfflineTx<CollectionShapeRow>(writer.executor, "reorderCollections", {
        orderedIds,
      });
      tx.mutate(() => {
        writer.collection.update(orderedIds, (drafts) => {
          for (const [index, draft] of drafts.entries()) {
            draft.sort_order = index;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

const setDeckbuildingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; available: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).setDeckbuilding({
      id: data.id,
      available: data.available,
    });
  });

/**
 * Sets the *current viewer's* deck-building availability for a collection.
 * This is a per-member preference — every member with access can set it for
 * themselves, including for shared group collections — so it is not gated on
 * group-admin rights. It lives in a per-viewer preference table the synced
 * shape doesn't carry, so it stays on the query layer: invalidating the
 * collections list refreshes the viewer-effective `availableForDeckbuilding`
 * flag, which in turn drives the owned/locked deck-building counts.
 *
 * @returns A mutation taking `{ id, available }`.
 */
export function useSetCollectionDeckbuilding() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; available: boolean }) => setDeckbuildingFn({ data: body }),
    invalidates: [queryKeys.collections.all(userId)],
  });
}

// ── Collection sharing ──────────────────────────────────────────────────────
//
// Stays on the query layer: the share token is minted server-side, so there
// is nothing to apply optimistically; `useCollections` reads share state from
// the query-layer items, which the success handlers update in place.

const shareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: collectionId }): Promise<CollectionShareResponse> =>
      apiOrpcClient(collectionsContract, context.cookie).share({ id: collectionId }),
  );

export function useShareCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => shareCollectionFn({ data: collectionId }),
    onSuccess: (data, collectionId) => {
      queryClient.setQueryData<CollectionsResponse>(queryKeys.collections.all(userId), (old) =>
        old
          ? {
              ...old,
              items: old.items.map((col) =>
                col.id === collectionId
                  ? { ...col, isPublic: data.isPublic, shareToken: data.shareToken }
                  : col,
              ),
            }
          : old,
      );
    },
  });
}

const unshareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: collectionId }) => {
    await apiOrpcClient(collectionsContract, context.cookie).unshare({ id: collectionId });
  });

export function useUnshareCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => unshareCollectionFn({ data: collectionId }),
    onSuccess: (_, collectionId) => {
      queryClient.setQueryData<CollectionsResponse>(queryKeys.collections.all(userId), (old) =>
        old
          ? {
              ...old,
              items: old.items.map((col) =>
                col.id === collectionId ? { ...col, isPublic: false, shareToken: null } : col,
              ),
            }
          : old,
      );
    },
  });
}

const fetchPublicCollectionFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicCollectionDetailResponse> => {
    // Migrated to oRPC: contract-typed client. 404 (unknown/expired token) is a
    // typed NOT_FOUND error mapped to the sentinel the route boundary expects.
    const client = apiOrpcClient(publicCollectionsContract);
    const { error, data: firstPage } = await safe(client.share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }

    // Walk the cursor server-side so the SSR payload carries every copy for
    // collections larger than the API's per-page cap. Matches the authenticated
    // `fetchCopies` pattern in copies-query.ts.
    const allCopies = [...firstPage.items];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await client.share({ token, cursor });
      allCopies.push(...page.items);
      cursor = page.nextCursor;
    }

    return { ...firstPage, items: allCopies, nextCursor: null };
  });

export function publicCollectionQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.collections.publicByToken(token),
    queryFn: () => fetchPublicCollectionFn({ data: token }),
  });
}

export function usePublicCollection(token: string) {
  return useSuspenseQuery(publicCollectionQueryOptions(token));
}
