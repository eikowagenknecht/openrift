import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/index.js";

/**
 * Absence of an override falls back to `group_id IS NULL`: personal
 * collections feed decks by default, group collections are opt-in per member.
 */
export function collectionDeckbuildingPrefsRepo(db: Kysely<Database>) {
  return {
    async set(userId: string, collectionId: string, available: boolean): Promise<void> {
      await db
        .insertInto("collectionDeckbuildingPrefs")
        .values({ userId, collectionId, available })
        .onConflict((oc) => oc.columns(["userId", "collectionId"]).doUpdateSet({ available }))
        .execute();
    },

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
