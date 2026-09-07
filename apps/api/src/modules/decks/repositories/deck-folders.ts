import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { DeckFoldersTable } from "../../../db/tables/decks.js";

export type DeckFolderWithCount = Selectable<DeckFoldersTable> & { deckCount: number };

const deckCountExpr = sql<number>`(select count(*)::int from deck_folder_entries where deck_folder_entries.folder_id = deck_folders.id)`;

// Every method is user-scoped: an id that isn't the caller's matches nothing, it never errors.
export function deckFoldersRepo(db: Kysely<Database>) {
  return {
    listForUser(userId: string): Promise<DeckFolderWithCount[]> {
      return db
        .selectFrom("deckFolders")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .where("userId", "=", userId)
        .orderBy("sortOrder")
        .orderBy((eb) => eb.fn("lower", ["name"]))
        .execute();
    },

    // Throws a 23505 unique violation on `uq_deck_folders_user_name` when the
    // user already has a folder by that name; the route maps it to a 409.
    create(userId: string, name: string): Promise<DeckFolderWithCount> {
      return db
        .insertInto("deckFolders")
        .values({
          userId,
          name,
          sortOrder: sql<number>`coalesce((select max(sort_order) + 1 from deck_folders where user_id = ${userId}), 0)`,
        })
        .returningAll()
        .returning(deckCountExpr.as("deckCount"))
        .executeTakeFirstOrThrow();
    },

    // Raises the same unique violation as `create` on a name collision.
    rename(id: string, userId: string, name: string): Promise<DeckFolderWithCount | undefined> {
      return db
        .updateTable("deckFolders")
        .set({ name })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .returning(deckCountExpr.as("deckCount"))
        .executeTakeFirst();
    },

    // Membership rows cascade, so the decks themselves are untouched — they
    // just stop being filed here.
    async remove(id: string, userId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("deckFolders")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    // IDs the user doesn't own are silently ignored, not rejected.
    async reorder(userId: string, orderedIds: readonly string[]): Promise<void> {
      if (orderedIds.length === 0) {
        return;
      }
      const ids = [...orderedIds];
      await sql`
        update deck_folders
        set sort_order = ranked.new_order
        from (
          select id, ord::int - 1 as new_order
          from unnest(${ids}::uuid[]) with ordinality as t(id, ord)
        ) as ranked
        where deck_folders.id = ranked.id
          and deck_folders.user_id = ${userId}
      `.execute(db);
    },

    // Unknown or unowned ids are dropped by the insert's ownership filter.
    async setForDeck(deckId: string, userId: string, folderIds: readonly string[]): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("deckFolderEntries")
          .where("deckId", "=", deckId)
          .where("userId", "=", userId)
          .execute();
        if (folderIds.length === 0) {
          return;
        }
        // Must select from deckFolders filtered by userId, not insert raw ids, or ownership isn't enforced.
        await trx
          .insertInto("deckFolderEntries")
          .columns(["folderId", "deckId", "userId"])
          .expression((eb) =>
            eb
              .selectFrom("deckFolders")
              .select((seb) => [
                "deckFolders.id",
                seb.val(deckId).as("deckId"),
                "deckFolders.userId",
              ])
              .where("deckFolders.userId", "=", userId)
              .where("deckFolders.id", "in", [...folderIds]),
          )
          .execute();
      });
    },

    // Decks with no folders are absent from the map, not present with an empty array.
    async folderIdsByDeckIds(
      deckIds: readonly string[],
      userId: string,
    ): Promise<Map<string, string[]>> {
      const byDeck = new Map<string, string[]>();
      if (deckIds.length === 0) {
        return byDeck;
      }
      const rows = await db
        .selectFrom("deckFolderEntries")
        .innerJoin("deckFolders", "deckFolders.id", "deckFolderEntries.folderId")
        .select(["deckFolderEntries.deckId", "deckFolderEntries.folderId"])
        .where("deckFolderEntries.userId", "=", userId)
        .where("deckFolderEntries.deckId", "in", [...deckIds])
        .orderBy("deckFolders.sortOrder")
        .orderBy((eb) => eb.fn("lower", ["deckFolders.name"]))
        .execute();
      for (const row of rows) {
        const existing = byDeck.get(row.deckId);
        if (existing) {
          existing.push(row.folderId);
        } else {
          byDeck.set(row.deckId, [row.folderId]);
        }
      }
      return byDeck;
    },
  };
}
