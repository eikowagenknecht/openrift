import type { Repos, Transact } from "../deps.js";
import { AppError, ERROR_CODES } from "../errors.js";
import { logEvents } from "./event-logger.js";
import { ensureInbox } from "./inbox.js";

interface AddCopyInput {
  printingId: string;
  collectionId?: string;
  acquisitionSourceId?: string;
}

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
  acquisitionSourceId: string | null;
}

/**
 * Batch-add copies (acquisition). Inserts copies into the given collections
 * (or the user's inbox) and logs an acquisition activity.
 * @returns The created copies with their IDs
 */
export async function addCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copies: AddCopyInput[],
): Promise<AddCopyResult[]> {
  const inboxId = await ensureInbox(repos, userId);

  // Verify all explicit collectionIds belong to this user
  const explicitIds = [...new Set(copies.map((c) => c.collectionId).filter(Boolean))] as string[];
  if (explicitIds.length > 0) {
    const owned = await repos.collections.listIdsByIdsForUser(explicitIds, userId);
    if (owned.length !== explicitIds.length) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "One or more collections do not belong to you",
      );
    }
  }

  const created = await transact(async (trxRepos) => {
    const copyValues = copies.map((item) => ({
      userId: userId,
      printingId: item.printingId,
      collectionId: item.collectionId ?? inboxId,
      acquisitionSourceId: item.acquisitionSourceId ?? null,
    }));

    const copyRows = await trxRepos.copies.insertBatch(copyValues);

    // Look up collection names for activity items
    const collectionIds = [...new Set(copyRows.map((r) => r.collectionId))];
    const collectionRows = await trxRepos.collections.listIdAndNameByIds(collectionIds);
    const collectionNames = new Map(collectionRows.map((col) => [col.id, col.name]));

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

    return copyRows;
  });

  return created.map((r) => ({
    id: r.id,
    printingId: r.printingId,
    collectionId: r.collectionId,
    acquisitionSourceId: r.acquisitionSourceId ?? null,
  }));
}

/**
 * Move copies between collections (reorganization).
 * Verifies the target collection, moves copies, and logs a reorganization activity.
 */
export async function moveCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copyIds: string[],
  toCollectionId: string,
): Promise<void> {
  // Verify target collection belongs to user
  const target = await repos.collections.getIdAndName(toCollectionId, userId);

  if (!target) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Target collection not found");
  }

  await transact(async (trxRepos) => {
    // Fetch copies with their current collection info
    const copies = await trxRepos.copies.listWithCollectionName(copyIds, userId);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
    }

    // Update copies
    await trxRepos.copies.moveBatch(
      copies.map((row) => row.id),
      userId,
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
  });
}

/**
 * Dispose copies (disposal) — hard-deletes with metadata snapshot.
 * Logs a disposal activity before deleting.
 */
export async function disposeCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
): Promise<void> {
  await transact(async (trxRepos) => {
    // Fetch copies with collection info for snapshots
    const copies = await trxRepos.copies.listWithCollectionName(copyIds, userId);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
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

    // Hard-delete copies (activity_items.copy_id → SET NULL via FK)
    await trxRepos.copies.deleteBatch(
      copies.map((row) => row.id),
      userId,
    );
  });
}
