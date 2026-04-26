import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, KeywordsTable } from "../db/index.js";

interface KeywordTranslationRow {
  keywordName: string;
  language: string;
  label: string;
}

/**
 * Queries for keywords (canonical names with display styles) and their
 * per-language translations.
 *
 * @returns An object with keyword query methods bound to the given `db`.
 */
export function keywordsRepo(db: Kysely<Database>) {
  return {
    /** @returns All keywords. */
    listAll(): Promise<Selectable<KeywordsTable>[]> {
      return db.selectFrom("keywords").selectAll().orderBy("name").execute();
    },

    /** @returns All keyword translations. */
    listAllTranslations(): Promise<KeywordTranslationRow[]> {
      return db
        .selectFrom("keywordTranslations")
        .select(["keywordName", "language", "label"])
        .orderBy("keywordName")
        .orderBy("language")
        .execute();
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

    /** Insert or update a keyword. */
    async upsertStyle(values: { name: string; color: string; darkText: boolean }): Promise<void> {
      await db
        .insertInto("keywords")
        .values({ ...values, isWellKnown: false })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet((eb) => ({
            color: eb.ref("excluded.color"),
            darkText: eb.ref("excluded.darkText"),
          })),
        )
        .execute();
    },

    /** Insert a new keyword. */
    async createStyle(values: { name: string; color: string; darkText: boolean }): Promise<void> {
      await db
        .insertInto("keywords")
        .values({ ...values, isWellKnown: false })
        .execute();
    },

    /** Delete a keyword by name. */
    async deleteStyle(name: string): Promise<void> {
      await db.deleteFrom("keywords").where("name", "=", name).execute();
    },

    /** Upsert a single keyword translation. */
    async upsertTranslation(values: {
      keywordName: string;
      language: string;
      label: string;
    }): Promise<void> {
      await db
        .insertInto("keywordTranslations")
        .values(values)
        .onConflict((oc) =>
          oc
            .columns(["keywordName", "language"])
            .doUpdateSet((eb) => ({ label: eb.ref("excluded.label") })),
        )
        .execute();
    },

    /** Delete a keyword translation. */
    async deleteTranslation(keywordName: string, language: string): Promise<void> {
      await db
        .deleteFrom("keywordTranslations")
        .where("keywordName", "=", keywordName)
        .where("language", "=", language)
        .execute();
    },

    /**
     * Bulk insert discovered translations, skipping rows that already exist
     * (preserving manual corrections).
     *
     * @returns Number of rows inserted.
     */
    async bulkInsertTranslations(
      rows: { keywordName: string; language: string; label: string }[],
    ): Promise<number> {
      if (rows.length === 0) {
        return 0;
      }
      const result = await db
        .insertInto("keywordTranslations")
        .values(rows)
        .onConflict((oc) => oc.columns(["keywordName", "language"]).doNothing())
        .execute();
      return result.length > 0 ? Number(result[0].numInsertedOrUpdatedRows ?? 0) : 0;
    },

    /**
     * Fetches printing text pairs for keyword translation discovery.
     * Returns cards that have both EN and non-EN printings with rules/effect text.
     *
     * @returns Rows with card_id, EN text fields, and non-EN text fields + language.
     */
    async getTranslationCandidates(): Promise<
      {
        cardId: string;
        enRulesText: string | null;
        enEffectText: string | null;
        otherLanguage: string;
        otherRulesText: string | null;
        otherEffectText: string | null;
      }[]
    > {
      const rows = await sql<{
        cardId: string;
        enRulesText: string | null;
        enEffectText: string | null;
        otherLanguage: string;
        otherRulesText: string | null;
        otherEffectText: string | null;
      }>`
        SELECT
          en.card_id AS "cardId",
          en.printed_rules_text AS "enRulesText",
          en.printed_effect_text AS "enEffectText",
          other.language AS "otherLanguage",
          other.printed_rules_text AS "otherRulesText",
          other.printed_effect_text AS "otherEffectText"
        FROM printings en
        JOIN printings other ON en.card_id = other.card_id AND other.language <> 'EN'
        WHERE en.language = 'EN'
          AND (en.printed_rules_text IS NOT NULL OR en.printed_effect_text IS NOT NULL)
          AND (other.printed_rules_text IS NOT NULL OR other.printed_effect_text IS NOT NULL)
      `.execute(db);
      return rows.rows;
    },
  };
}
