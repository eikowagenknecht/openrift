import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * A group collection has many viewers, so hiding it cannot live as a column
 * on `collections` — one member hiding it would hide it for the whole group.
 */
export function collectionSidebarPrefsRepo(db: Kysely<Database>) {
  return {
    async set(userId: string, collectionId: string, hidden: boolean): Promise<void> {
      await db
        .insertInto("collectionSidebarPrefs")
        .values({ userId, collectionId, hidden })
        .onConflict((oc) => oc.columns(["userId", "collectionId"]).doUpdateSet({ hidden }))
        .execute();
    },
  };
}
