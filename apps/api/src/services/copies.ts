import { ERROR_CODES, normalizeCopyMetadataPatch } from "@openrift/shared";
import type { CopyLink, CopyMetadataPatch } from "@openrift/shared";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { assertFound } from "../utils/assertions.js";
import { logEvents } from "./event-logger.js";
import { ensureInbox } from "./inbox.js";

interface AddCopyInput {
  printingId: string;
  collectionId?: string;
  /** Per-copy metadata (ADR-038), optional at insert time. */
  condition?: string | null;
  grader?: string | null;
  grade?: number | null;
  notesPublic?: string | null;
  notesPrivate?: string | null;
  isAltered?: boolean;
  links?: CopyLink[];
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
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: boolean;
  links: CopyLink[];
  /** Always false for a copy that was just created (ADR-039). */
  onLoan: boolean;
}

/**
 * Batch-add copies. Inserts copies into the given collections (or the user's
 * inbox) and logs collection events. Collection write access is checked via
 * `filterWritableByViewer` — for personal collections the user must own them,
 * for shared collections they must be a group member.
 *
 * @returns The created copies with their IDs
 */
export async function addCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copies: AddCopyInput[],
): Promise<AddCopyResult[]> {
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
      printingId: item.printingId,
      collectionId: item.collectionId ?? inboxId,
      condition: item.condition ?? null,
      grader: item.grader ?? null,
      grade: item.grade ?? null,
      notesPublic: item.notesPublic ?? null,
      notesPrivate: item.notesPrivate ?? null,
      isAltered: item.isAltered ?? false,
      links: item.links ? JSON.stringify(item.links) : undefined,
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

    return copyRows.map((row) => ({
      ...row,
      groupId: collectionGroupIds.get(row.collectionId) ?? null,
    }));
  });

  return created;
}

/**
 * Applies one metadata patch (ADR-038) to a batch of copies. The viewer must
 * have write access to every collection the copies live in — the same rule as
 * {@link moveCopies}. Metadata edits are not logged to `collection_events`
 * (the ledger stays a movement history).
 *
 * Cross-field state is normalized via {@link normalizeCopyMetadataPatch}
 * (shared with the client's optimistic update) so a patch only has to be
 * internally consistent.
 */
export async function updateCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
  patch: CopyMetadataPatch,
): Promise<void> {
  const normalized = normalizeCopyMetadataPatch(patch);

  await transact(async (trxRepos) => {
    const copies = await trxRepos.copies.listWithCollectionContext(copyIds);

    if (copies.length !== copyIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more copies not found");
    }

    const sourceIds = [...new Set(copies.map((row) => row.collectionId))];
    const writableSources = await trxRepos.collections.filterWritableByViewer(sourceIds, userId);
    if (writableSources.length !== sourceIds.length) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "One or more copies are not writable by you");
    }

    await trxRepos.copies.updateMetadataBatchById(copyIds, {
      ...normalized,
      links: normalized.links ? JSON.stringify(normalized.links) : undefined,
    });
  });
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
 */
export async function moveCopies(
  repos: Repos,
  transact: Transact,
  userId: string,
  copyIds: string[],
  toCollectionId: string,
): Promise<void> {
  const targetWritable = await repos.collections.filterWritableByViewer([toCollectionId], userId);
  if (targetWritable.length === 0) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Target collection not found");
  }
  const targetMeta = await repos.collections.listIdAndNameByIds([toCollectionId]);
  const target = targetMeta[0];
  assertFound(target, "Target collection not found");

  await transact(async (trxRepos) => {
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
 */
export async function disposeCopies(
  transact: Transact,
  userId: string,
  copyIds: string[],
): Promise<void> {
  await transact((trxRepos) => disposeCopiesInTransaction(trxRepos, userId, copyIds));
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
  // Lock the copy rows first so a concurrent trade-accept or loan reserving one
  // of them serializes against this dispose (audit #7). Without the lock the
  // reservation guard below could pass, the reserve pin lands in the gap, and
  // the delete would cascade the just-created reservation away.
  await trxRepos.copies.lockByIds(copyIds);

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
  // Same for a copy out on a loan (ADR-039): write-off releases its pins first
  // and then disposes in the same transaction, so the guard passes there.
  if (options?.skipReservationGuard !== true) {
    const reserved = await trxRepos.cardTrades.filterReservedCopyIds(copyIds);
    if (reserved.length > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This card is reserved in an active trade — cancel the trade to free it.",
      );
    }
    const loaned = await trxRepos.loans.filterLoanedCopyIds(copyIds);
    if (loaned.length > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This card is lent out — mark the loan returned or written off to free it.",
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
