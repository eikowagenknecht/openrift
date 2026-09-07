import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export function adminsRepo(db: Kysely<Database>) {
  return {
    async isAdmin(userId: string): Promise<boolean> {
      const row = await db
        .selectFrom("admins")
        .select("userId")
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row !== undefined;
    },

    /** Insert the user as an admin (no-op on conflict). */
    async autoPromote(userId: string): Promise<void> {
      await db
        .insertInto("admins")
        .values({ userId })
        .onConflict((oc) => oc.column("userId").doNothing())
        .execute();
    },
  };
}
