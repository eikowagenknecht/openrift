import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Card ban queries for admin CRUD and catalog lookups.
 * @returns An object with card ban query methods bound to the given `db`.
 */
export function cardBansRepo(db: Kysely<Database>) {
  return {
    /** @returns All formats (id + name). */
    listFormats() {
      return db.selectFrom("formats").select(["id", "name"]).orderBy("name").execute();
    },

    /** @returns All active bans for a given card, with format display name. */
    listByCard(cardId: string) {
      return db
        .selectFrom("cardBans")
        .innerJoin("formats", "formats.id", "cardBans.formatId")
        .selectAll("cardBans")
        .select("formats.name as formatName")
        .where("cardBans.cardId", "=", cardId)
        .where("cardBans.unbannedAt", "is", null)
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

    /** @returns The newly created ban row with format display name. */
    async create(ban: {
      cardId: string;
      formatId: string;
      bannedAt: string;
      reason: string | null;
    }) {
      const row = await db
        .insertInto("cardBans")
        .values(ban)
        .returningAll()
        .executeTakeFirstOrThrow();
      const format = await db
        .selectFrom("formats")
        .select("name")
        .where("id", "=", row.formatId)
        .executeTakeFirstOrThrow();
      return { ...row, formatName: format.name };
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
