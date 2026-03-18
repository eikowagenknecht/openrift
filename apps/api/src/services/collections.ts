import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import type { Repos } from "../deps.js";
import { createActivity } from "./activity-logger.js";

interface DeleteCollectionOpts {
  collectionId: string;
  collectionName: string;
  moveCopiesTo: string;
  targetName: string;
  userId: string;
}

/**
 * Deletes a collection, atomically relocating its copies to the target
 * collection and logging a reorganization activity.
 */
export async function deleteCollection(
  db: Kysely<Database>,
  repos: Repos,
  opts: DeleteCollectionOpts,
): Promise<void> {
  const { collectionId, collectionName, moveCopiesTo, targetName, userId } = opts;

  await db.transaction().execute(async (trx) => {
    const copies = await repos.collections.listCopiesInCollection(collectionId, trx);

    if (copies.length > 0) {
      await repos.collections.moveCopiesBetweenCollections(collectionId, moveCopiesTo, trx);

      await createActivity(trx, {
        userId,
        type: "reorganization",
        name: `Moved cards from deleted collection "${collectionName}"`,
        isAuto: true,
        items: copies.map((copy) => ({
          copyId: copy.id,
          printingId: copy.printingId,
          action: "moved" as const,
          fromCollectionId: collectionId,
          fromCollectionName: collectionName,
          toCollectionId: moveCopiesTo,
          toCollectionName: targetName,
        })),
      });
    }

    await repos.collections.deleteByIdForUser(collectionId, userId, trx);
  });
}
