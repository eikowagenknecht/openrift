import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for the admins table (admin role checks and auto-promotion).
 *
 * @returns An object with admin query methods bound to the given `db`.
 */
export function adminsRepo(db: Kysely<Database>) {
  return {
    /** @returns Whether the given user is an admin. */
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
