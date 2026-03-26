import type { Kysely, Selectable } from "kysely";

import type { Database, UserPreferencesTable } from "../db/index.js";

export function userPreferencesRepo(db: Kysely<Database>) {
  return {
    getByUserId(userId: string): Promise<Selectable<UserPreferencesTable> | undefined> {
      return db
        .selectFrom("userPreferences")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    upsert(
      userId: string,
      updates: Partial<
        Omit<Selectable<UserPreferencesTable>, "userId" | "createdAt" | "updatedAt">
      >,
    ): Promise<Selectable<UserPreferencesTable>> {
      return db
        .insertInto("userPreferences")
        .values({ userId, ...updates })
        .onConflict((oc) => oc.column("userId").doUpdateSet(updates))
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
