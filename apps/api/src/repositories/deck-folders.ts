import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, DeckFoldersTable } from "../db/index.js";

export type DeckFolderWithCount = Selectable<DeckFoldersTable> & { deckCount: number };

/**
 * Deck count as a correlated subquery, so reads and writes can both return the
 * full {@link DeckFolderWithCount} shape without a follow-up query. Postgres
 * allows a scalar subquery in RETURNING, which is what makes this work for
 * `create` and `rename` as well as `listForUser`.
 */
const deckCountExpr = sql<number>`(select count(*)::int from deck_folder_entries where deck_folder_entries.folder_id = deck_folders.id)`;

/**
 * Queries for a user's deck folders and deck↔folder membership.
 *
 * Every method is user-scoped: an id that isn't the caller's simply matches
 * nothing rather than erroring, which keeps the routes free of ownership
 * pre-checks.
 */
export function deckFoldersRepo(db: Kysely<Database>) {
  return {
    // Name is the tiebreaker so a fresh set (all sort_order 0) still reads
    // sensibly.
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

    /**
     * Inserts a folder at the end of the user's order, so a new folder lands
     * after the existing ones instead of at position 0.
     *
     * Throws a 23505 unique violation on `uq_deck_folders_user_name` when the
     * user already has a folder by that name; the route maps it to a 409.
     */
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

    // Re-numbers `sort_order` to match `orderedIds` in a single statement, so
    // the set is never seen partially re-numbered. IDs the user doesn't own
    // are silently ignored — the caller sends its current view of the list.
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

    // Replaces a deck's folder membership with exactly `folderIds`. Unknown or
    // unowned ids are dropped by the insert's ownership filter rather than
    // rejected, matching the silently-ignore stance of `reorder`.
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
        // Selecting the folder rows (rather than inserting values directly)
        // filters out ids belonging to someone else in the same statement.
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

    // Decks with no folders are absent from the map rather than present with
    // an empty array.
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
