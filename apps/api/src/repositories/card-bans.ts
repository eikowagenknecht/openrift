import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Card ban queries for admin CRUD and catalog lookups.
 * @returns An object with card ban query methods bound to the given `db`.
 */
export function cardBansRepo(db: Kysely<Database>) {
  return {
    /** @returns All active bans for a given card. */
    listByCard(cardId: string) {
      return db
        .selectFrom("cardBans")
        .selectAll()
        .where("cardId", "=", cardId)
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns A specific active ban, or undefined. */
    findActiveBan(cardId: string, formatId: string) {
      return db
        .selectFrom("cardBans")
        .selectAll()
        .where("cardId", "=", cardId)
        .where("formatId", "=", formatId)
        .where("unbannedAt", "is", null)
        .executeTakeFirst();
    },

    /** @returns The newly created ban row. */
    create(ban: { cardId: string; formatId: string; bannedAt: string; reason: string | null }) {
      return db.insertInto("cardBans").values(ban).returningAll().executeTakeFirstOrThrow();
    },

    /**
     * Sets `unbannedAt` on the active ban for the given card+format.
     * @returns Whether a row was updated.
     */
    async unban(cardId: string, formatId: string): Promise<boolean> {
      const result = await db
        .updateTable("cardBans")
        .set({ unbannedAt: new Date().toISOString().slice(0, 10) })
        .where("cardId", "=", cardId)
        .where("formatId", "=", formatId)
        .where("unbannedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
  };
}
