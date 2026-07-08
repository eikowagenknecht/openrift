import type { DeleteResult, Kysely } from "kysely";

import type { Database } from "../db/index.js";

interface GrantWithUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  section: string;
}

/**
 * Queries for per-section admin grants (selective admin access without full
 * admin rights). Sections are slugs from the shared `ADMIN_SECTIONS` registry;
 * unknown slugs in the table are filtered out at the API layer, not here.
 *
 * @returns An object with admin-grant query methods bound to the given `db`.
 */
export function adminGrantsRepo(db: Kysely<Database>) {
  return {
    /** @returns The section slugs granted to the given user (sorted). */
    async sectionsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("adminGrants")
        .select("section")
        .where("userId", "=", userId)
        .orderBy("section")
        .execute();
      return rows.map((r) => r.section);
    },

    /** @returns All grants across all users, joined with user name/email for admin display. */
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

    /** @returns Delete result — check `numDeletedRows` to verify the grant existed. */
    remove(userId: string, section: string): Promise<DeleteResult> {
      return db
        .deleteFrom("adminGrants")
        .where("userId", "=", userId)
        .where("section", "=", section)
        .executeTakeFirst();
    },
  };
}
