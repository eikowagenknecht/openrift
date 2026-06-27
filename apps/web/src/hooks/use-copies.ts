import type { CopyListMembershipsResponse, CopyResponse } from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import { eq, useLiveQuery } from "@tanstack/react-db";
import type { Transaction } from "@tanstack/react-db";
import { useBatcher } from "@tanstack/react-pacer";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useUserId } from "@/lib/auth-session";
import type { CopiesWriter, CopyShapeRow } from "@/lib/copies-collection";
import { useCopiesCollection, useCopiesWriter } from "@/lib/copies-collection";
import { createOfflineTx, settleForFeedback } from "@/lib/offline-feedback";
import type { OfflineTxLike } from "@/lib/offline-feedback";
import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";
import { uuidv7 } from "@/lib/uuidv7";

export function useCopies(collectionId?: string): {
  data: CopyResponse[];
  isReady: boolean;
} {
  const copiesCollection = useCopiesCollection();

  const { data, isReady } = useLiveQuery(
    (q) => {
      if (!copiesCollection) {
        return null;
      }
      const base = q.from({ copy: copiesCollection });
      return collectionId === undefined
        ? base
        : base.where(({ copy }) => eq(copy.collectionId, collectionId));
    },
    [collectionId, copiesCollection],
  );

  return { data: data ?? [], isReady };
}

/**
 * Which of the viewer's own lists reference `copyIds`. Backs the dispose
 * confirmation's cross-list warning, so it stays disabled until `enabled` (the
 * dialog is open) and there is at least one id. Ids are deduped + sorted for a
 * stable query key across selection order. Pass `excludeListId` to drop the
 * originating list from the result — used by the "Sold" action on a list page,
 * where the copy is necessarily on the current list and only the *other* lists
 * are worth warning about.
 * @returns react-query result carrying a `CopyListMembershipsResponse`.
 */
export function useCopyListMemberships(
  copyIds: string[],
  enabled: boolean,
  excludeListId?: string,
) {
  const userId = useUserId();
  const stableIds = [...new Set(copyIds)].toSorted();
  return useQuery({
    queryKey: queryKeys.copies.listMemberships(userId ?? "", stableIds, excludeListId),
    queryFn: (): Promise<CopyListMembershipsResponse> =>
      browserApiOrpcClient(copiesContract).listMemberships({ copyIds: stableIds, excludeListId }),
    enabled: enabled && Boolean(userId) && stableIds.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// Every mutation is a durable offline transaction (ADR-027 step 3): the
// optimistic change applies instantly, the transaction persists to a per-user
// IndexedDB outbox, and the executor dispatches it to the API — immediately
// when online, replayed FIFO with backoff after offline periods and reloads.
// The named mutation functions live in copies-collection.ts; they return the
// Postgres txid so the optimistic overlay holds until the change arrives back
// through the Electric stream.
//
// The hooks stay wrapped in useMutation purely for the isPending / onError
// plumbing existing call sites rely on. networkMode "always" because the
// default ("online") would pause the mutationFn itself while offline — the
// outbox is the component that owns offline waiting, not react-query.
//
// The transaction/feedback plumbing (createOfflineTx, settleForFeedback) is
// shared with the collection mutation hooks — see @/lib/offline-feedback.

function createCopiesTx(writer: CopiesWriter, mutationFnName: string): OfflineTxLike<CopyShapeRow> {
  return createOfflineTx<CopyShapeRow>(writer.executor, mutationFnName);
}

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
}

export function useAddCopies() {
  const writer = useCopiesWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async (body: {
      copies: { printingId: string; collectionId: string; id?: string }[];
    }): Promise<AddCopyResult[]> => {
      // Hook runs on the public /cards page (via useQuickAddActions ->
      // useBatchedAddCopies), but the add buttons are gated on isLoggedIn,
      // so reaching mutationFn without a writer means a UI bug (or the
      // sub-100ms persistence-init window right after hydration).
      if (!writer) {
        throw new Error("Cannot add copies while signed out");
      }
      const rows: CopyShapeRow[] = body.copies.map((copy) => ({
        id: copy.id ?? uuidv7(),
        printing_id: copy.printingId,
        collection_id: copy.collectionId,
      }));
      const tx = createCopiesTx(writer, "addCopies");
      tx.mutate(() => {
        writer.collection.insert(rows);
      });
      await settleForFeedback(tx.commit(), writer.executor);
      return rows.map((row) => ({
        id: row.id,
        printingId: row.printing_id,
        collectionId: row.collection_id,
      }));
    },
  });
}

export function useMoveCopies() {
  const writer = useCopiesWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      copyIds,
      toCollectionId,
    }: {
      copyIds: string[];
      toCollectionId: string;
    }) => {
      if (!writer || copyIds.length === 0) {
        return;
      }
      const tx = createCopiesTx(writer, "moveCopies");
      tx.mutate(() => {
        writer.collection.update(copyIds, (drafts) => {
          for (const draft of drafts) {
            draft.collection_id = toCollectionId;
          }
        });
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

export function useDisposeCopies() {
  const writer = useCopiesWriter();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({ copyIds }: { copyIds: string[] }) => {
      if (!writer || copyIds.length === 0) {
        return;
      }
      const tx = createCopiesTx(writer, "disposeCopies");
      tx.mutate(() => {
        writer.collection.delete(copyIds);
      });
      await settleForFeedback(tx.commit(), writer.executor);
    },
  });
}

// ── Batched add ─────────────────────────────────────────────────────────────

const BATCH_DELAY = 300;

interface PendingAdd {
  id: string;
  printingId: string;
  collectionId: string;
  resolve: (result: AddCopyResult) => void;
  reject: (error: unknown) => void;
}

interface BatchedAddCallbacks {
  onBatchSuccess?: (printingIds: string[]) => void;
  onBatchError?: (printingIds: string[], error: unknown) => void;
}

interface BatchWindow {
  offlineTx: OfflineTxLike<CopyShapeRow>;
  innerTx: Transaction<CopyShapeRow>;
}

/**
 * Batches rapid add-copy calls into a single durable transaction while still
 * applying each optimistic insert at click time, so owned-count reflects the
 * new row immediately. Implementation: the first click in a 300ms window
 * opens one offline transaction; every further click joins it through the
 * underlying TanStack DB transaction's `mutate` (optimistic state applies
 * instantly); the flush commits once, persisting the whole window to the
 * outbox as a single record and POSTing it in one request. On permanent
 * failure every optimistic row in the window rolls back together.
 *
 * Ids are client-generated (uuidv7) and final — the id handed back from
 * `add` is the id the row keeps forever, even across an offline replay.
 *
 * Caller must pass a concrete collectionId — the inbox-default path doesn't
 * support optimistic inserts because the inbox id isn't known from the add
 * call.
 *
 * Optional batch callbacks fire once per batch (not per add), so callers can
 * surface one toast per batch instead of one per click.
 *
 * @returns An `add` function returning the copy's final id plus a result
 *   promise, and an `isPending` flag.
 */
export function useBatchedAddCopies(callbacks?: BatchedAddCallbacks) {
  const writer = useCopiesWriter();
  // The open batch-window transaction pair. Clicks join it; the flush
  // commits it.
  const windowRef = useRef<BatchWindow | null>(null);
  // useBatcher captures its handler once; refs keep the latest callbacks and
  // executor so we don't recreate the batcher whenever the consumer
  // re-renders. Updated in effects — writing to a ref during render trips
  // React Compiler.
  const callbacksRef = useRef(callbacks);
  const executorRef = useRef<OfflineExecutor | null>(null);
  useEffect(() => {
    callbacksRef.current = callbacks;
    executorRef.current = writer?.executor ?? null;
  });

  // The commit is wrapped in useMutation purely for isPending; the window
  // (with its click-time closure over the current writer) arrives as the
  // variable, so the captured-once batcher handler below has no stale
  // dependencies.
  const commitBatch = useMutation({
    networkMode: "always",
    mutationFn: async (batch: { window: BatchWindow; executor: OfflineExecutor }) => {
      await settleForFeedback(batch.window.offlineTx.commit(), batch.executor);
    },
  });

  const batcher = useBatcher<PendingAdd>(
    (pending) => {
      const printingIds = pending.map((entry) => entry.printingId);
      const window = windowRef.current;
      windowRef.current = null;
      const executor = executorRef.current;
      if (!window || !executor) {
        // Clicks landed without a writer (signed out / UI bug): there is no
        // optimistic state to commit or roll back.
        const error = new Error("Cannot add copies while signed out");
        for (const entry of pending) {
          entry.reject(error);
        }
        callbacksRef.current?.onBatchError?.(printingIds, error);
        return;
      }
      commitBatch.mutate(
        { window, executor },
        {
          onSuccess: () => {
            for (const entry of pending) {
              entry.resolve({
                id: entry.id,
                printingId: entry.printingId,
                collectionId: entry.collectionId,
              });
            }
            callbacksRef.current?.onBatchSuccess?.(printingIds);
          },
          onError: (error) => {
            for (const entry of pending) {
              entry.reject(error);
            }
            callbacksRef.current?.onBatchError?.(printingIds, error);
          },
        },
      );
    },
    { wait: BATCH_DELAY },
  );

  const add = useCallback(
    (printingId: string, collectionId: string): { id: string; result: Promise<AddCopyResult> } => {
      const id = uuidv7();
      if (writer) {
        const collection = writer.collection;
        const insertRow = () => {
          collection.insert({ id, printing_id: printingId, collection_id: collectionId });
        };
        if (windowRef.current) {
          windowRef.current.innerTx.mutate(insertRow);
        } else {
          const offlineTx = createCopiesTx(writer, "addCopies");
          const innerTx = offlineTx.mutate(insertRow);
          windowRef.current = { offlineTx, innerTx };
        }
      }
      // oxlint-disable-next-line promise/avoid-new -- deferred pattern needed to batch individual calls into one POST
      const result = new Promise<AddCopyResult>((resolve, reject) => {
        batcher.addItem({ id, printingId, collectionId, resolve, reject });
      });
      return { id, result };
    },
    [writer, batcher],
  );

  return { add, isPending: commitBatch.isPending };
}
