import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export function sourceSettingsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("sourceSettings")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("source")
        .execute();
    },

    async reorder(sources: string[]) {
      await db.transaction().execute(async (tx) => {
        for (let i = 0; i < sources.length; i++) {
          await tx
            .insertInto("sourceSettings")
            .values({ source: sources[i], sortOrder: i + 1, isHidden: false })
            .onConflict((oc) =>
              oc.column("source").doUpdateSet({ sortOrder: i + 1, updatedAt: new Date() }),
            )
            .execute();
        }
      });
    },

    upsert(source: string, updates: { sortOrder?: number; isHidden?: boolean }) {
      return db
        .insertInto("sourceSettings")
        .values({
          source,
          sortOrder: updates.sortOrder ?? 0,
          isHidden: updates.isHidden ?? false,
        })
        .onConflict((oc) =>
          oc.column("source").doUpdateSet({
            ...(updates.sortOrder === undefined ? {} : { sortOrder: updates.sortOrder }),
            ...(updates.isHidden === undefined ? {} : { isHidden: updates.isHidden }),
            updatedAt: new Date(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
