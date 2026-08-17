import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/** Columns every errata read in this repo selects. */
const ERRATA_COLUMNS = [
  "correctedRulesText",
  "correctedEffectText",
  "source",
  "sourceUrl",
  "effectiveDate",
] as const;

/**
 * Admin write path for card errata (the corrected rules/effect text that
 * overrides what is printed on a card).
 *
 * Read-side errata used by catalog assembly and the candidate-review detail
 * views stay in `catalogRepo` / `candidateCardsRepo`, because those return
 * catalog- and candidate-shaped rows rather than the errata row itself.
 *
 * @returns An object with card-errata methods bound to the given `db`.
 */
export function cardErrataRepo(db: Kysely<Database>) {
  return {
    /** Upsert card errata (insert or update on conflict by cardId). */
    async upsert(
      cardId: string,
      data: {
        correctedRulesText: string | null;
        correctedEffectText: string | null;
        source: string;
        sourceUrl: string | null;
        effectiveDate: string | null;
      },
    ): Promise<void> {
      const values = {
        correctedRulesText: data.correctedRulesText,
        correctedEffectText: data.correctedEffectText,
        source: data.source,
        sourceUrl: data.sourceUrl,
        effectiveDate: data.effectiveDate,
      };
      await db
        .insertInto("cardErrata")
        .values({ cardId, ...values })
        .onConflict((oc) => oc.column("cardId").doUpdateSet(values))
        .execute();
    },

    /** Delete card errata by card ID. */
    async deleteByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("cardErrata").where("cardId", "=", cardId).execute();
    },

    /**
     * Get card errata by card ID.
     * @returns Errata fields, or null if no errata exists.
     */
    async getByCardId(cardId: string) {
      return (
        (await db
          .selectFrom("cardErrata")
          .select(ERRATA_COLUMNS)
          .where("cardId", "=", cardId)
          .executeTakeFirst()) ?? null
      );
    },

    /** @returns Existing errata rows for the given card ids. */
    getByCardIds(cardIds: string[]) {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardErrata")
        .select(["cardId", ...ERRATA_COLUMNS])
        .where("cardId", "in", cardIds)
        .execute();
    },
  };
}
