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

interface KeywordTextSources {
  errata: { correctedRulesText: string | null; correctedEffectText: string | null } | undefined;
  printings: { printedRulesText: string | null; printedEffectText: string | null }[];
}

/**
 * Derive a card's keyword list from its card-level errata text plus every EN
 * printing's text, in that order, deduped by first occurrence. Exported so
 * `services/import-errata.ts` shares the exact derivation the recompute paths
 * use instead of carrying its own copy.
 */
export function deriveKeywords({ errata, printings }: KeywordTextSources): string[] {
  return [
    ...extractKeywords(errata?.correctedRulesText ?? ""),
    ...extractKeywords(errata?.correctedEffectText ?? ""),
    ...printings.flatMap((printing) => [
      ...extractKeywords(printing.printedRulesText ?? ""),
      ...extractKeywords(printing.printedEffectText ?? ""),
    ]),
  ].filter((keyword, index, all) => all.indexOf(keyword) === index);
}

export function keywordsRepo(db: Kysely<Database>) {
  return {
    listAll(): Promise<Selectable<KeywordsTable>[]> {
      return db.selectFrom("keywords").selectAll().orderBy("name").execute();
    },

    /**
     * Names of keywords flagged as cost keywords (glyph cost inside the bracket).
     * Fed to `fixTypography` so the cost-keyword set stays data-driven.
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

    listAllTranslations(): Promise<KeywordTranslationRow[]> {
      return db
        .selectFrom("keywordTranslations")
        .select(["keywordName", "language", "label"])
        .orderBy("keywordName")
        .orderBy("language")
        .execute();
    },

    async getKeywordCounts(): Promise<{ keyword: string; count: number }[]> {
      const rows = await sql<{ keyword: string; count: string }>`
        SELECT kw AS keyword, COUNT(*)::text AS count
        FROM cards, unnest(keywords) AS kw
        GROUP BY kw
        ORDER BY COUNT(*) DESC, kw
      `.execute(db);
      return rows.rows.map((row) => ({ keyword: row.keyword, count: Number(row.count) }));
    },

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

    async deleteStyle(name: string): Promise<void> {
      await db.deleteFrom("keywords").where("name", "=", name).execute();
    },

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
     */
    getTranslationCandidates(): Promise<
      {
        cardId: string;
        enRulesText: string | null;
        enEffectText: string | null;
        otherLanguage: string;
        otherRulesText: string | null;
        otherEffectText: string | null;
      }[]
    > {
      return db
        .selectFrom("printings as en")
        .innerJoin("printings as other", (jb) =>
          jb
            .onRef("other.cardId", "=", "en.cardId")
            .on("other.language", "!=", WellKnown.language.EN),
        )
        .select([
          "en.cardId",
          "en.printedRulesText as enRulesText",
          "en.printedEffectText as enEffectText",
          "other.language as otherLanguage",
          "other.printedRulesText as otherRulesText",
          "other.printedEffectText as otherEffectText",
        ])
        .where("en.language", "=", WellKnown.language.EN)
        .where((eb) =>
          eb.or([
            eb("en.printedRulesText", "is not", null),
            eb("en.printedEffectText", "is not", null),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb("other.printedRulesText", "is not", null),
            eb("other.printedEffectText", "is not", null),
          ]),
        )
        .execute();
    },

    // `cards.keywords` is a derived cache, never a source of truth. Its only
    // input is card text: `extractKeywords` reads the `[...]` bracket spans out
    // of EN printing text and card-level errata text, so the cache goes stale
    // exactly when one of those texts changes, and only then. Any write path
    // for those texts owes the cache a refresh — `services/printing-admin.ts`
    // calls `recomputeForPrintingCard`, and `services/import-errata.ts` writes
    // `keywords` in the same statement via the shared `deriveKeywords` export.
    //
    // The `keywords` table is *not* an input. It holds per-name display
    // metadata (colour, dark text, cost-keyword flag) that the extractor never
    // reads, and the name is its primary key, so there is no rename to chase.
    // Creating, restyling, or deleting a keyword row therefore cannot
    // invalidate this cache and needs no recompute.

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

        const existing = card.keywords;
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
