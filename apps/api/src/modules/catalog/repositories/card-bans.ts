import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export function cardBansRepo(db: Kysely<Database>) {
  return {
    listFormats() {
      return db.selectFrom("formats").select(["id", "name"]).orderBy("name").execute();
    },

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

    listActiveForCards(cardIds: string[], formatIds: string[]) {
      if (cardIds.length === 0 || formatIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardBans")
        .select(["cardId", "formatId"])
        .where("cardId", "in", cardIds)
        .where("formatId", "in", formatIds)
        .where("unbannedAt", "is", null)
        .execute();
    },

    findActiveBan(cardId: string, formatId: string) {
      return db
        .selectFrom("cardBans")
        .selectAll()
        .where("cardId", "=", cardId)
        .where("formatId", "=", formatId)
        .where("unbannedAt", "is", null)
        .executeTakeFirst();
    },

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

    async update(
      cardId: string,
      formatId: string,
      fields: { bannedAt?: string; reason?: string | null },
    ) {
      const row = await db
        .updateTable("cardBans")
        .set(fields)
        .where("cardId", "=", cardId)
        .where("formatId", "=", formatId)
        .where("unbannedAt", "is", null)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        return null;
      }
      const format = await db
        .selectFrom("formats")
        .select("name")
        .where("id", "=", row.formatId)
        .executeTakeFirstOrThrow();
      return { ...row, formatName: format.name };
    },

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
