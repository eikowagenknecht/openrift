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
