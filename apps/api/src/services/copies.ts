import type { Database } from "@openrift/shared/db";
import type { Kysely } from "kysely";

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
      user_id: userId,
      printing_id: item.printingId,
      collection_id: item.collectionId ?? inboxId,
      source_id: item.sourceId ?? null,
    }));

    const copyRows = await trx
      .insertInto("copies")
      .values(copyValues)
      .returning(["id", "printing_id", "collection_id", "source_id"])
      .execute();

    // Look up collection names for activity items
    const collectionIds = [...new Set(copyRows.map((r) => r.collection_id))];
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
        printingId: row.printing_id,
        action: "added" as const,
        toCollectionId: row.collection_id,
        toCollectionName: collectionNames.get(row.collection_id) ?? null,
      })),
    });

    return copyRows;
  });

  return created.map((r) => ({
    id: r.id,
    printingId: r.printing_id,
    collectionId: r.collection_id,
    sourceId: r.source_id ?? null,
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
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Target collection not found");
  }

  await db.transaction().execute(async (trx) => {
    // Fetch copies with their current collection info
    const copies = await trx
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collection_id")
      .select(["cp.id", "cp.printing_id", "cp.collection_id", "col.name as collection_name"])
      .where("cp.id", "in", copyIds)
      .where("cp.user_id", "=", userId)
      .execute();

    if (copies.length === 0) {
      return;
    }

    // Update copies
    await trx
      .updateTable("copies")
      .set({ collection_id: toCollectionId, updated_at: new Date() })
      .where(
        "id",
        "in",
        copies.map((row) => row.id),
      )
      .where("user_id", "=", userId)
      .execute();

    // Log reorganization activity
    await createActivity(trx, {
      userId,
      type: "reorganization",
      isAuto: true,
      items: copies.map((copy) => ({
        copyId: copy.id,
        printingId: copy.printing_id,
        action: "moved" as const,
        fromCollectionId: copy.collection_id,
        fromCollectionName: copy.collection_name,
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
      .innerJoin("collections as col", "col.id", "cp.collection_id")
      .select([
        "cp.id",
        "cp.printing_id",
        "cp.collection_id",
        "cp.source_id",
        "col.name as collection_name",
      ])
      .where("cp.id", "in", copyIds)
      .where("cp.user_id", "=", userId)
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
        printingId: copy.printing_id,
        action: "removed" as const,
        fromCollectionId: copy.collection_id,
        fromCollectionName: copy.collection_name,
        metadataSnapshot: {
          copyId: copy.id,
          sourceId: copy.source_id,
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
      .where("user_id", "=", userId)
      .execute();
  });
}
