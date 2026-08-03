import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Per-viewer sidebar visibility overrides for collections (migration 223).
 *
 * Visibility is a viewer-scoped opinion ("do I want this binder in *my*
 * sidebar?"). A row is an explicit override; absence means visible. Group
 * collections have many viewers, so this cannot live as a column on
 * `collections` — one member hiding a shared binder would hide it for the
 * whole group. The read side lives in the collections repo as
 * `COALESCE(sidebar.hidden, false)`.
 *
 * @returns An object with sidebar preference methods bound to the given `db`.
 */
export function collectionSidebarPrefsRepo(db: Kysely<Database>) {
  return {
    /**
     * Sets the viewer's sidebar visibility for a collection (upsert).
     * @returns Nothing.
     */
    async set(userId: string, collectionId: string, hidden: boolean): Promise<void> {
      await db
        .insertInto("collectionSidebarPrefs")
        .values({ userId, collectionId, hidden })
        .onConflict((oc) => oc.columns(["userId", "collectionId"]).doUpdateSet({ hidden }))
        .execute();
    },
  };
}
