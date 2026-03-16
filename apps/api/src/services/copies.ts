import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { AppError } from "../errors.js";
import { createActivity } from "./activity-logger.js";
import { ensureInbox } from "./inbox.js";

interface AddCopyInput {
  printingId: string;
  collectionId?: string;
  sourceId?: string;
}

interface AddCopyResult {
  id: string;
  printingId: string;
  collectionId: string;
  sourceId: string | null;
}

/**
 * Batch-add copies (acquisition). Inserts copies into the given collections
 * (or the user's inbox) and logs an acquisition activity.
 * @returns The created copies with their IDs
 */
export async function addCopies(
  db: Kysely<Database>,
  userId: string,
  copies: AddCopyInput[],
): Promise<AddCopyResult[]> {
  const inboxId = await ensureInbox(db, userId);

  const created = await db.transaction().execute(async (trx) => {
    const copyValues = copies.map((item) => ({
      userId: userId,
      printingId: item.printingId,
      collectionId: item.collectionId ?? inboxId,
      sourceId: item.sourceId ?? null,
    }));

    const copyRows = await trx
      .insertInto("copies")
      .values(copyValues)
      .returning(["id", "printingId", "collectionId", "sourceId"])
      .execute();

    // Look up collection names for activity items
    const collectionIds = [...new Set(copyRows.map((r) => r.collectionId))];
    const collections = await trx
      .selectFrom("collections")
      .select(["id", "name"])
      .where("id", "in", collectionIds)
      .execute();
    const collectionNames = new Map(collections.map((col) => [col.id, col.name]));

    await createActivity(trx, {
      userId,
      type: "acquisition",
      isAuto: true,
      items: copyRows.map((row) => ({
        copyId: row.id,
        printingId: row.printingId,
        action: "added" as const,
        toCollectionId: row.collectionId,
        toCollectionName: collectionNames.get(row.collectionId) ?? null,
      })),
    });

    return copyRows;
  });

  return created.map((r) => ({
    id: r.id,
    printingId: r.printingId,
    collectionId: r.collectionId,
    sourceId: r.sourceId ?? null,
  }));
}

/**
 * Move copies between collections (reorganization).
 * Verifies the target collection, moves copies, and logs a reorganization activity.
 */
export async function moveCopies(
  db: Kysely<Database>,
  userId: string,
  copyIds: string[],
  toCollectionId: string,
): Promise<void> {
  // Verify target collection belongs to user
  const target = await db
    .selectFrom("collections")
    .select(["id", "name"])
    .where("id", "=", toCollectionId)
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Target collection not found");
  }

  await db.transaction().execute(async (trx) => {
    // Fetch copies with their current collection info
    const copies = await trx
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collectionId")
      .select(["cp.id", "cp.printingId", "cp.collectionId", "col.name as collectionName"])
      .where("cp.id", "in", copyIds)
      .where("cp.userId", "=", userId)
      .execute();

    if (copies.length === 0) {
      return;
    }

    // Update copies
    await trx
      .updateTable("copies")
      .set({ collectionId: toCollectionId, updatedAt: new Date() })
      .where(
        "id",
        "in",
        copies.map((row) => row.id),
      )
      .where("userId", "=", userId)
      .execute();

    // Log reorganization activity
    await createActivity(trx, {
      userId,
      type: "reorganization",
      isAuto: true,
      items: copies.map((copy) => ({
        copyId: copy.id,
        printingId: copy.printingId,
        action: "moved" as const,
        fromCollectionId: copy.collectionId,
        fromCollectionName: copy.collectionName,
        toCollectionId: target.id,
        toCollectionName: target.name,
      })),
    });
  });
}

/**
 * Dispose copies (disposal) — hard-deletes with metadata snapshot.
 * Logs a disposal activity before deleting.
 */
export async function disposeCopies(
  db: Kysely<Database>,
  userId: string,
  copyIds: string[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Fetch copies with collection info for snapshots
    const copies = await trx
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collectionId")
      .select([
        "cp.id",
        "cp.printingId",
        "cp.collectionId",
        "cp.sourceId",
        "col.name as collectionName",
      ])
      .where("cp.id", "in", copyIds)
      .where("cp.userId", "=", userId)
      .execute();

    if (copies.length === 0) {
      return;
    }

    // Log disposal activity before deleting (so copy FK is still valid)
    await createActivity(trx, {
      userId,
      type: "disposal",
      isAuto: true,
      items: copies.map((copy) => ({
        copyId: copy.id,
        printingId: copy.printingId,
        action: "removed" as const,
        fromCollectionId: copy.collectionId,
        fromCollectionName: copy.collectionName,
        metadataSnapshot: {
          copyId: copy.id,
          sourceId: copy.sourceId,
        },
      })),
    });

    // Hard-delete copies (activity_items.copy_id → SET NULL via FK)
    await trx
      .deleteFrom("copies")
      .where(
        "id",
        "in",
        copies.map((row) => row.id),
      )
      .where("userId", "=", userId)
      .execute();
  });
}
