import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export function providerSettingsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("providerSettings")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("provider")
        .execute();
    },

    async reorder(providers: string[]) {
      await db.transaction().execute(async (tx) => {
        for (let i = 0; i < providers.length; i++) {
          await tx
            .insertInto("providerSettings")
            .values({
              provider: providers[i],
              sortOrder: i + 1,
              isHidden: false,
              isFavorite: false,
            })
            .onConflict((oc) => oc.column("provider").doUpdateSet({ sortOrder: i + 1 }))
            .execute();
        }
      });
    },

    upsert(
      provider: string,
      updates: { sortOrder?: number; isHidden?: boolean; isFavorite?: boolean },
    ) {
      return db
        .insertInto("providerSettings")
        .values({
          provider,
          sortOrder: updates.sortOrder ?? 0,
          isHidden: updates.isHidden ?? false,
          isFavorite: updates.isFavorite ?? false,
        })
        .onConflict((oc) =>
          oc.column("provider").doUpdateSet({
            ...(updates.sortOrder === undefined ? {} : { sortOrder: updates.sortOrder }),
            ...(updates.isHidden === undefined ? {} : { isHidden: updates.isHidden }),
            ...(updates.isFavorite === undefined ? {} : { isFavorite: updates.isFavorite }),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async favoriteProviders(): Promise<Set<string>> {
      const rows = await db
        .selectFrom("providerSettings")
        .select("provider")
        .where("isFavorite", "=", true)
        .execute();
      return new Set(rows.map((r) => r.provider));
    },
  };
}
