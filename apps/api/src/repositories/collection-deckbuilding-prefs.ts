import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Per-viewer deck-building availability overrides for collections.
 *
 * Availability is a viewer-scoped opinion ("does this collection feed *my*
 * deck inventory?"). A row is an explicit override; absence falls back to the
 * type default `group_id IS NULL` — personal collections feed decks by
 * default, group collections are opt-in per member. The deck-availability
 * queries live in the copies/decks repos via
 * `COALESCE(pref.available, col.group_id IS NULL)`.
 *
 * @returns An object with deck-building preference methods bound to the given `db`.
 */
export function collectionDeckbuildingPrefsRepo(db: Kysely<Database>) {
  return {
    /**
     * Sets the viewer's explicit availability for a collection (upsert).
     * @returns Nothing.
     */
    async set(userId: string, collectionId: string, available: boolean): Promise<void> {
      await db
        .insertInto("collectionDeckbuildingPrefs")
        .values({ userId, collectionId, available })
        .onConflict((oc) => oc.columns(["userId", "collectionId"]).doUpdateSet({ available }))
        .execute();
    },

    /**
     * The viewer's effective availability for a collection, applying the type
     * default when no override exists.
     * @returns `true` if the collection feeds the viewer's deck inventory.
     */
    async isAvailableForViewer(userId: string, collectionId: string): Promise<boolean> {
      const row = await db
        .selectFrom("collections as col")
        .leftJoin("collectionDeckbuildingPrefs as pref", (join) =>
          join.onRef("pref.collectionId", "=", "col.id").on("pref.userId", "=", userId),
        )
        .select(sql<boolean>`coalesce(pref.available, col.group_id is null)`.as("available"))
        .where("col.id", "=", collectionId)
        .executeTakeFirst();
      return row?.available ?? false;
    },
  };
}
