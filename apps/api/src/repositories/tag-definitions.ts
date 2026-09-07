import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Classification of the printed card tags (`cards.tags`) into admin-managed
 * categories. The card↔tag relation itself lives on the cards; this repo only
 * maps each distinct tag string to a category. Tags without a definition row
 * are unclassified.
 */
export function tagDefinitionsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("tagDefinitions")
        .innerJoin("tagCategories", "tagCategories.id", "tagDefinitions.categoryId")
        .select([
          "tagDefinitions.tag",
          "tagDefinitions.categoryId",
          "tagCategories.slug as category",
        ])
        .orderBy("tagDefinitions.tag")
        .execute();
    },

    /**
     * Classifies one tag: upserts the definition row, or deletes it when
     * `categoryId` is null (back to unclassified).
     */
    async setCategory(tag: string, categoryId: string | null): Promise<void> {
      if (categoryId === null) {
        await db.deleteFrom("tagDefinitions").where("tag", "=", tag).execute();
        return;
      }
      await db
        .insertInto("tagDefinitions")
        .values({ tag, categoryId })
        .onConflict((oc) => oc.column("tag").doUpdateSet({ categoryId }))
        .execute();
    },

    /**
     * Classifies every listed tag that has no definition yet into the given
     * category. Existing classifications are left untouched, so re-running
     * never overwrites deliberate admin choices.
     */
    async classifyMissing(tags: string[], categoryId: string): Promise<number> {
      if (tags.length === 0) {
        return 0;
      }
      const result = await db
        .insertInto("tagDefinitions")
        .values(tags.map((tag) => ({ tag, categoryId })))
        .onConflict((oc) => oc.column("tag").doNothing())
        .execute();
      return result.reduce((sum, row) => sum + Number(row.numInsertedOrUpdatedRows ?? 0), 0);
    },

    /** A definition whose tag has no cards comes back with cardCount 0, and stays visible so it can be un-classified. */
    async distinctCardTags(): Promise<
      { tag: string; cardCount: number; categoryId: string | null }[]
    > {
      const result = await sql<{ tag: string; cardCount: number; categoryId: string | null }>`
        SELECT
          COALESCE(live.tag, def.tag) AS tag,
          COALESCE(live.card_count, 0)::int AS "cardCount",
          def.category_id AS "categoryId"
        FROM (
          SELECT unnest(tags) AS tag, COUNT(*)::int AS card_count
          FROM cards
          GROUP BY 1
        ) live
        FULL OUTER JOIN tag_definitions def ON def.tag = live.tag
        ORDER BY 1
      `.execute(db);
      return result.rows;
    },
  };
}
