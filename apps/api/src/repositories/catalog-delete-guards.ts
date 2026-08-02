import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/** Per-source counts of rows that block a card deletion (RESTRICT FKs). */
export interface CardDeleteBlockers {
  copies: number;
  collectionEvents: number;
  deckCards: number;
  listEntries: number;
  loans: number;
  cardTrades: number;
  marketplaceProductVariants: number;
  productPrintings: number;
}

/**
 * Per-source counts of rows that block a single printing's deletion (the
 * RESTRICT FKs on printings; deck_cards is card-scoped and its
 * preferred_printing_id is ON DELETE SET NULL, so it never blocks here).
 */
export interface PrintingDeleteBlockers {
  copies: number;
  collectionEvents: number;
  listEntries: number;
  loans: number;
  cardTrades: number;
  marketplaceProductVariants: number;
  productPrintings: number;
}

/**
 * Read-only guards run before a card or printing is deleted from the catalog.
 * Every method is a pure count over the RESTRICT FKs that would reject the
 * delete, so callers can report which user-owned data is in the way instead of
 * surfacing a raw constraint violation.
 *
 * @returns An object with delete-blocker count methods bound to the given `db`.
 */
export function catalogDeleteGuardsRepo(db: Kysely<Database>) {
  return {
    /**
     * Count rows that reference a card (directly or via its printings) and
     * block deletion: user-owned data plus marketplace product mappings.
     * Cascading / SET NULL children are not counted.
     * @returns Per-source blocker counts, all zero when the card is deletable.
     */
    async countForCard(cardId: string): Promise<CardDeleteBlockers> {
      const result = await sql<CardDeleteBlockers>`
        SELECT
          (SELECT count(*) FROM copies c
             JOIN printings p ON p.id = c.printing_id
            WHERE p.card_id = ${cardId})::int AS "copies",
          (SELECT count(*) FROM collection_events ce
             JOIN printings p ON p.id = ce.printing_id
            WHERE p.card_id = ${cardId})::int AS "collectionEvents",
          (SELECT count(*) FROM deck_cards WHERE card_id = ${cardId})::int AS "deckCards",
          (SELECT count(*) FROM list_entries WHERE card_id = ${cardId})::int AS "listEntries",
          (SELECT count(*) FROM loans WHERE card_id = ${cardId})::int AS "loans",
          (SELECT count(*) FROM card_trades WHERE card_id = ${cardId})::int AS "cardTrades",
          (SELECT count(*) FROM marketplace_product_variants v
             JOIN printings p ON p.id = v.printing_id
            WHERE p.card_id = ${cardId})::int AS "marketplaceProductVariants",
          (SELECT count(*) FROM product_printings pp
             JOIN printings p ON p.id = pp.printing_id
            WHERE p.card_id = ${cardId})::int AS "productPrintings"
      `.execute(db);
      return result.rows[0];
    },

    /** @returns Per-source counts of rows that block deleting this printing. */
    async countForPrinting(printingId: string): Promise<PrintingDeleteBlockers> {
      const result = await sql<PrintingDeleteBlockers>`
        SELECT
          (SELECT count(*) FROM copies
            WHERE printing_id = ${printingId})::int AS "copies",
          (SELECT count(*) FROM collection_events
            WHERE printing_id = ${printingId})::int AS "collectionEvents",
          (SELECT count(*) FROM list_entries
            WHERE printing_id = ${printingId})::int AS "listEntries",
          (SELECT count(*) FROM loans
            WHERE printing_id = ${printingId})::int AS "loans",
          (SELECT count(*) FROM card_trades
            WHERE printing_id = ${printingId})::int AS "cardTrades",
          (SELECT count(*) FROM marketplace_product_variants
            WHERE printing_id = ${printingId})::int AS "marketplaceProductVariants",
          (SELECT count(*) FROM product_printings
            WHERE printing_id = ${printingId})::int AS "productPrintings"
      `.execute(db);
      return result.rows[0];
    },
  };
}
