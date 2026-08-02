import { WellKnown } from "@openrift/shared";
import { extractKeywords } from "@openrift/shared/keywords";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, KeywordsTable } from "../db/index.js";

interface KeywordTranslationRow {
  keywordName: string;
  language: string;
  label: string;
}

/** Text sources a card's keywords are derived from. */
interface KeywordTextSources {
  errata: { correctedRulesText: string | null; correctedEffectText: string | null } | undefined;
  printings: { printedRulesText: string | null; printedEffectText: string | null }[];
}

/**
 * Derive a card's keyword list from its card-level errata text plus every EN
 * printing's text, in that order, deduped by first occurrence.
 *
 * @returns The card's keywords.
 */
function deriveKeywords({ errata, printings }: KeywordTextSources): string[] {
  return [
    ...extractKeywords(errata?.correctedRulesText ?? ""),
    ...extractKeywords(errata?.correctedEffectText ?? ""),
    ...printings.flatMap((printing) => [
      ...extractKeywords(printing.printedRulesText ?? ""),
      ...extractKeywords(printing.printedEffectText ?? ""),
    ]),
  ].filter((keyword, index, all) => all.indexOf(keyword) === index);
}

/**
 * Queries for keywords (canonical names with display styles), their
 * per-language translations, and the derivation that recomputes
 * `cards.keywords` from printing and errata text.
 *
 * @returns An object with keyword query methods bound to the given `db`.
 */
export function keywordsRepo(db: Kysely<Database>) {
  return {
    /** @returns All keywords. */
    listAll(): Promise<Selectable<KeywordsTable>[]> {
      return db.selectFrom("keywords").selectAll().orderBy("name").execute();
    },

    /**
     * Names of keywords flagged as cost keywords (glyph cost inside the bracket).
     * Fed to `fixTypography` so the cost-keyword set stays data-driven.
     * @returns Sorted array of cost-keyword names.
     */
    async listCostKeywords(): Promise<string[]> {
      const rows = await db
        .selectFrom("keywords")
        .select("name")
        .where("costKeyword", "=", true)
        .orderBy("name")
        .execute();
      return rows.map((row) => row.name);
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
    async upsertStyle(values: {
      name: string;
      color: string;
      darkText: boolean;
      costKeyword: boolean;
    }): Promise<void> {
      await db
        .insertInto("keywords")
        .values({ ...values, isWellKnown: false })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet((eb) => ({
            color: eb.ref("excluded.color"),
            darkText: eb.ref("excluded.darkText"),
            costKeyword: eb.ref("excluded.costKeyword"),
          })),
        )
        .execute();
    },

    /** Insert a new keyword. */
    async createStyle(values: {
      name: string;
      color: string;
      darkText: boolean;
      costKeyword: boolean;
    }): Promise<void> {
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
        JOIN printings other ON en.card_id = other.card_id AND other.language <> ${WellKnown.language.EN}
        WHERE en.language = ${WellKnown.language.EN}
          AND (en.printed_rules_text IS NOT NULL OR en.printed_effect_text IS NOT NULL)
          AND (other.printed_rules_text IS NOT NULL OR other.printed_effect_text IS NOT NULL)
      `.execute(db);
      return rows.rows;
    },

    // ── Derivation (cards.keywords) ───────────────────────────────────────

    /**
     * Recompute keywords for the card that owns the given printing by scanning
     * all sibling printings' text plus any card-level errata text.
     */
    async recomputeForPrintingCard(printingId: string): Promise<void> {
      const row = await db
        .selectFrom("printings")
        .select(["printings.cardId"])
        .where("printings.id", "=", printingId)
        .executeTakeFirst();

      if (!row) {
        return;
      }

      const errata = await db
        .selectFrom("cardErrata")
        .select(["correctedRulesText", "correctedEffectText"])
        .where("cardId", "=", row.cardId)
        .executeTakeFirst();

      const siblings = await db
        .selectFrom("printings")
        .select(["printedRulesText", "printedEffectText"])
        .where("cardId", "=", row.cardId)
        .where("language", "=", WellKnown.language.EN)
        .execute();

      const keywords = deriveKeywords({ errata, printings: siblings });

      await db.updateTable("cards").set({ keywords }).where("id", "=", row.cardId).execute();
    },

    /**
     * Recompute keywords for all cards by scanning card-level and printing-level
     * text fields. Only updates cards whose computed keywords differ.
     * @returns Count of total cards scanned and cards actually updated.
     */
    async recomputeAll(): Promise<{ totalCards: number; updated: number }> {
      const cards = await db.selectFrom("cards").select(["id", "keywords"]).execute();

      const errata = await db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();

      const errataByCard = new Map(errata.map((e) => [e.cardId, e]));

      const printings = await db
        .selectFrom("printings")
        .select(["cardId", "printedRulesText", "printedEffectText"])
        .where("language", "=", WellKnown.language.EN)
        .execute();

      const printingsByCard = Map.groupBy(printings, (row) => row.cardId);

      let updated = 0;

      for (const card of cards) {
        const keywords = deriveKeywords({
          errata: errataByCard.get(card.id),
          printings: printingsByCard.get(card.id) ?? [],
        });

        const existing = card.keywords as string[];
        const changed =
          keywords.length !== existing.length || keywords.some((kw) => !existing.includes(kw));

        if (changed) {
          await db.updateTable("cards").set({ keywords }).where("id", "=", card.id).execute();
          updated++;
        }
      }

      return { totalCards: cards.length, updated };
    },
  };
}
