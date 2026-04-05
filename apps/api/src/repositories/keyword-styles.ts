import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, KeywordStylesTable } from "../db/index.js";

/**
 * Queries for keyword styles.
 *
 * @returns An object with keyword style query methods bound to the given `db`.
 */
export function keywordStylesRepo(db: Kysely<Database>) {
  return {
    /** @returns All keyword styles. */
    listAll(): Promise<Selectable<KeywordStylesTable>[]> {
      return db.selectFrom("keywordStyles").selectAll().orderBy("name").execute();
    },

    /**
     * Count how many cards have each keyword.
     * @returns Array of { keyword, count } sorted by count descending.
     */
    async getKeywordCounts(): Promise<{ keyword: string; count: number }[]> {
      const rows = await sql<{ keyword: string; count: string }>`
        SELECT kw AS keyword, COUNT(*)::text AS count
        FROM cards, unnest(keywords) AS kw
        GROUP BY kw
        ORDER BY COUNT(*) DESC, kw
      `.execute(db);
      return rows.rows.map((row) => ({ keyword: row.keyword, count: Number(row.count) }));
    },

    /** Update the color and darkText for a keyword style by name. */
    async updateStyle(
      name: string,
      updates: { color?: string; darkText?: boolean },
    ): Promise<void> {
      await db.updateTable("keywordStyles").set(updates).where("name", "=", name).execute();
    },

    /** Insert or update a keyword style. */
    async upsertStyle(values: { name: string; color: string; darkText: boolean }): Promise<void> {
      await db
        .insertInto("keywordStyles")
        .values(values)
        .onConflict((oc) =>
          oc.column("name").doUpdateSet((eb) => ({
            color: eb.ref("excluded.color"),
            darkText: eb.ref("excluded.darkText"),
          })),
        )
        .execute();
    },

    /** Insert a new keyword style. */
    async createStyle(values: { name: string; color: string; darkText: boolean }): Promise<void> {
      await db.insertInto("keywordStyles").values(values).execute();
    },

    /** Delete a keyword style by name. */
    async deleteStyle(name: string): Promise<void> {
      await db.deleteFrom("keywordStyles").where("name", "=", name).execute();
    },
  };
}
