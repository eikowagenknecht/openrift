// Shared plumbing for durable offline writes (ADR-027 step 3): opening a
// named offline transaction on the executor and settling its commit for UI
// feedback. Used by the copies (use-copies.ts) and collections
// (use-collections.ts) mutation hooks.

import type { OfflineExecutor } from "@tanstack/offline-transactions";
import type { Transaction } from "@tanstack/react-db";

/**
 * How long UI feedback waits for server confirmation. Beyond this window (or
 * while offline) the write is settled as "queued": it is durably persisted
 * and the outbox keeps dispatching it in the background, so from the user's
 * point of view the action has succeeded.
 */
export const SYNC_FEEDBACK_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- timer primitive
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * A committed offline transaction, by either createOfflineTransaction shape
 * (the durable wrapper, or the plain Transaction fallback in online-only
 * tabs). Both expose mutate/commit; mutate returns the underlying TanStack DB
 * transaction, which accepts further mutate calls while pending — that is
 * what lets a batched window join multiple calls into one commit.
 */
export interface OfflineTxLike<TRow extends object> {
  mutate: (callback: () => void) => Transaction<TRow>;
  commit: () => Promise<unknown>;
}

/**
 * Opens a named offline transaction on the executor without auto-commit.
 * Optional `metadata` rides along with the transaction (and survives outbox
 * serialization), for inputs the row shape itself cannot carry — e.g. the
 * groupSlug of a collection create, or the full ordered-id list of a reorder.
 *
 * @returns The transaction, narrowed to the mutate/commit surface the hooks use.
 */
export function createOfflineTx<TRow extends object>(
  executor: OfflineExecutor,
  mutationFnName: string,
  metadata?: Record<string, unknown>,
): OfflineTxLike<TRow> {
  return executor.createOfflineTransaction({
    mutationFnName,
    autoCommit: false,
    ...(metadata ? { metadata } : {}),
  }) as unknown as OfflineTxLike<TRow>;
}

/**
 * Settles a committed offline transaction for UI feedback: resolves once the
 * server confirmed, or as "queued" when offline / still retrying past the
 * feedback window (the outbox owns it from there). Rejects only when the
 * transaction failed permanently within the window — that is the path that
 * reaches the caller's error toast, matching the old fail-fast behavior for
 * 4xx responses.
 *
 * @returns "synced" on in-window server confirmation, "queued" otherwise.
 */
export function settleForFeedback(
  commitPromise: Promise<unknown>,
  executor: OfflineExecutor,
): Promise<"synced" | "queued"> {
  // oxlint-disable promise/prefer-await-to-then -- racing a commit against a feedback window needs promise combinators
  const confirmed = commitPromise.then(() => "synced" as const);
  // A permanent failure after the feedback window rolls back silently; keep
  // the late rejection handled so it never surfaces as an unhandled promise.
  confirmed.catch(() => null);
  if (!executor.isOnline()) {
    return Promise.resolve("queued");
  }
  return Promise.race([confirmed, sleep(SYNC_FEEDBACK_TIMEOUT_MS).then(() => "queued" as const)]);
  // oxlint-enable promise/prefer-await-to-then
}
