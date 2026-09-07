import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

const ERRATA_COLUMNS = [
  "correctedRulesText",
  "correctedEffectText",
  "source",
  "sourceUrl",
  "effectiveDate",
] as const;

/**
 * Write path only: read-side errata for catalog assembly and candidate-review
 * detail lives in `catalogRepo` / `candidateCardsRepo` instead.
 */
export function cardErrataRepo(db: Kysely<Database>) {
  return {
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

    async deleteByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("cardErrata").where("cardId", "=", cardId).execute();
    },

    async getByCardId(cardId: string) {
      return (
        (await db
          .selectFrom("cardErrata")
          .select(ERRATA_COLUMNS)
          .where("cardId", "=", cardId)
          .executeTakeFirst()) ?? null
      );
    },

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
