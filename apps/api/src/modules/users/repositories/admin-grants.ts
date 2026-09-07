import type { DeleteResult, Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

interface GrantWithUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  section: string;
}

/** Unknown section slugs in the table are filtered out at the API layer, not here. */
export function adminGrantsRepo(db: Kysely<Database>) {
  return {
    async sectionsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("adminGrants")
        .select("section")
        .where("userId", "=", userId)
        .orderBy("section")
        .execute();
      return rows.map((r) => r.section);
    },

    async listAllWithUsers(): Promise<GrantWithUser[]> {
      const rows = await db
        .selectFrom("adminGrants")
        .innerJoin("users", "users.id", "adminGrants.userId")
        .select([
          "adminGrants.userId",
          "users.name as userName",
          "users.email as userEmail",
          "adminGrants.section",
        ])
        .orderBy("users.email")
        .orderBy("adminGrants.section")
        .execute();
      return rows;
    },

    /** Grant the section to the user (no-op when already granted). */
    async add(userId: string, section: string): Promise<void> {
      await db
        .insertInto("adminGrants")
        .values({ userId, section })
        .onConflict((oc) => oc.columns(["userId", "section"]).doNothing())
        .execute();
    },

    /** Check `numDeletedRows` on the result to verify the grant existed. */
    remove(userId: string, section: string): Promise<DeleteResult> {
      return db
        .deleteFrom("adminGrants")
        .where("userId", "=", userId)
        .where("section", "=", section)
        .executeTakeFirst();
    },
  };
}
