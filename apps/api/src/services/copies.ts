import { ERROR_CODES } from "@openrift/shared";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { assertFound } from "../utils/assertions.js";
import { logEvents } from "./event-logger.js";
import { ensureInbox } from "./inbox.js";

interface AddCopyInput {
  /**
   * Client-generated copy id (ADR-027 step 2): with a synced collection the
   * optimistic row and the replicated row must be the same row. Falls back to
   * the column default (`uuidv7()`) when absent.
   */
  id?: string;
  printingId: string;
  collectionId?: string;
}

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
  /**
   * Owning group of the copy's collection, or null for personal collections.
   * Derived from the collection so the client no longer has to synthesize it.
   */
  groupId: string | null;
}

/**
 * Batch-add copies. Inserts copies into the given collections (or the user's
 * inbox) and logs collection events. Collection write access is checked via
 * `filterWritableByViewer` — for personal collections the user must own them,
 * for shared collections they must be a group member.
 *
 * @returns The created copies with their IDs, plus the insert's Postgres
 *   transaction id for Electric stream matching (ADR-027 step 2).
 */
export async function addCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copies: AddCopyInput[],
): Promise<{ items: AddCopyResult[]; txid: number }> {
  const inboxId = await ensureInbox(repos, userId);

  // Verify every explicit collectionId is writable by this user
  const explicitIds = [...new Set(copies.map((c) => c.collectionId).filter(Boolean))] as string[];
  if (explicitIds.length > 0) {
    const writable = await repos.collections.filterWritableByViewer(explicitIds, userId);
    if (writable.length !== explicitIds.length) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "One or more collections are not writable by you",
      );
    }
  }

  const created = await transact(async (trxRepos) => {
    // Copies no longer carry an owner column — ownership derives from the
    // collection. The acting `userId` is still recorded as the event actor below.
    const copyValues = copies.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      printingId: item.printingId,
      collectionId: item.collectionId ?? inboxId,
    }));

    const copyRows = await trxRepos.copies.insertBatch(copyValues);

    // Look up collection name + owning group for event logging and to populate
    // each created copy's `groupId` (derived from the collection).
    const collectionIds = [...new Set(copyRows.map((r) => r.collectionId))];
    const collectionRows = await trxRepos.collections.listIdNameGroupByIds(collectionIds);
    const collectionNames = new Map(collectionRows.map((col) => [col.id, col.name]));
    const collectionGroupIds = new Map(collectionRows.map((col) => [col.id, col.groupId]));

    await logEvents(
      trxRepos,
      copyRows.map((row) => ({
        userId,
        action: "added" as const,
        printingId: row.printingId,
        copyId: row.id,
        toCollectionId: row.collectionId,
        toCollectionName: collectionNames.get(row.collectionId) ?? null,
      })),
    );

    return {
      items: copyRows.map((row) => ({
        id: row.id,
        printingId: row.printingId,
        collectionId: row.collectionId,
        groupId: collectionGroupIds.get(row.collectionId) ?? null,
      })),
      txid: await trxRepos.sync.currentTransactionId(),
    };
  });

  return created;
}

/**
 * Move copies between collections.
 *
 * The viewer must have write access to:
 *   - every source collection the copies are currently in
 *   - the target collection
 *
 * Source access means the copy lives in one of the viewer's writable collections
 * (personal owner OR group member of a shared collection that contains it).
 *
 * @returns The move's Postgres transaction id for Electric stream matching.
 */
export async function moveCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copyIds: string[],
  toCollectionId: string,
): Promise<{ txid: number }> {
  const targetWritable = await repos.collections.filterWritableByViewer([toCollectionId], userId);
  if (targetWritable.length === 0) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Target collection not found");
  }
  const targetMeta = await repos.collections.listIdAndNameByIds([toCollectionId]);
  const target = targetMeta[0];
  assertFound(target, "Target collection not found");

  return transact(async (trxRepos) => {
    const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
    }

    const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
    const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
    if (writableSources.length !== sourceIds.length) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
    }

    await trxRepos.copies.moveBatchById(
      copies.map((row) => row.id),
      toCollectionId,
    );

    await logEvents(
      trxRepos,
      copies.map((copy) => ({
        userId,
        action: "moved" as const,
        printingId: copy.printingId,
        copyId: copy.id,
        fromCollectionId: copy.collectionId,
        fromCollectionName: copy.collectionName,
        toCollectionId: target.id,
        toCollectionName: target.name,
      })),
    );

    return { txid: await trxRepos.sync.currentTransactionId() };
  });
}

/**
 * Dispose copies — hard-deletes from the collection.
 * Logs removal events before deleting. The viewer must have write access to
 * every source collection (personal owner or group member of a shared one).
 *
 * Rejects copies reserved by a live trade (ADR-019). Trade-sync's giver path
 * releases its reservation rows first and then disposes within the same
 * transaction via {@link disposeCopiesInTransaction} with the guard skipped.
 *
 * @returns The deletion's Postgres transaction id for Electric stream matching.
 */
export function disposeCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
): Promise<{ txid: number }> {
  return transact(async (trxRepos) => {
    await disposeCopiesInTransaction(trxRepos, userId, copyIds);
    return { txid: await trxRepos.sync.currentTransactionId() };
  });
}

/**
 * The body of {@link disposeCopies}, runnable inside an existing transaction.
 * Lets trade-sync (ADR-019) combine reservation-release + dispose atomically
 * while keeping a single copy-deletion choke point that emits `removed` events.
 *
 * @returns Nothing; throws `AppError` on missing/unwritable/reserved copies.
 */
export async function disposeCopiesInTransaction(
  trxRepos: Repos,
  userId: string,
  copyIds: string[],
  options?: { skipReservationGuard?: boolean },
): Promise<void> {
  const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

  if (copies.length !== copyIds.length) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
  }

  const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
  const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
  if (writableSources.length !== sourceIds.length) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
  }

  // A reserved copy is physically promised to a trade — refuse to destroy it.
  if (options?.skipReservationGuard !== true) {
    const reserved = await trxRepos.cardTrades.filterReservedCopyIds(copyIds);
    if (reserved.length > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This card is reserved in an active trade — cancel the trade to free it.",
      );
    }
  }

  // Log disposal events before deleting (so copy FK is still valid)
  await logEvents(
    trxRepos,
    copies.map((copy) => ({
      userId,
      action: "removed" as const,
      printingId: copy.printingId,
      copyId: copy.id,
      fromCollectionId: copy.collectionId,
      fromCollectionName: copy.collectionName,
    })),
  );

  // Hard-delete copies (collection_events.copy_id → SET NULL via FK)
  await trxRepos.copies.deleteBatchById(copies.map((row) => row.id));
}
