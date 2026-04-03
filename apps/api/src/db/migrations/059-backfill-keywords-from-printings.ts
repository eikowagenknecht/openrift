import { extractKeywords } from "@openrift/shared/keywords";
import type { Kysely } from "kysely";

/**
 * Backfill cards.keywords from printing-level text.
 *
 * Previously keywords were only extracted from card-level rulesText/effectText
 * which are null for non-errata cards. This migration scans all printings'
 * printedRulesText/printedEffectText, extracts keywords, and merges them into
 * each card's keywords array.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const cards = await db
    .selectFrom("cards")
    .select(["id", "rules_text", "effect_text", "keywords"])
    .execute();

  const printings = (await db
    .selectFrom("printings")
    .select(["card_id", "printed_rules_text", "printed_effect_text"])
    .execute()) as {
    card_id: string;
    printed_rules_text: string | null;
    printed_effect_text: string | null;
  }[];

  type PrintingRow = (typeof printings)[number];
  const printingsByCard = Map.groupBy(printings, (row: PrintingRow) => row.card_id);

  for (const card of cards) {
    const cardPrintings = printingsByCard.get(card.id) ?? [];

    const keywords = [
      ...extractKeywords(card.rules_text ?? ""),
      ...extractKeywords(card.effect_text ?? ""),
      ...cardPrintings.flatMap((printing) => [
        ...extractKeywords(printing.printed_rules_text ?? ""),
        ...extractKeywords(printing.printed_effect_text ?? ""),
      ]),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const existing = card.keywords as string[];
    if (keywords.length !== existing.length || keywords.some((kw) => !existing.includes(kw))) {
      await db.updateTable("cards").set({ keywords }).where("id", "=", card.id).execute();
    }
  }
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Not reversible — keywords were already partially populated before this
  // migration. Rolling back would require knowing the original state.
}
