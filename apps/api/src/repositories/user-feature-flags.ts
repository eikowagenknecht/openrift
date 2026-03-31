import type { DeleteResult, Kysely } from "kysely";

import type { Database, UserFeatureFlagsTable } from "../db/index.js";

interface OverrideWithUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  flagKey: string;
  enabled: boolean;
}

/**
 * Queries for per-user feature flag overrides.
 *
 * @returns An object with user feature flag query methods bound to the given `db`.
 */
export function userFeatureFlagsRepo(db: Kysely<Database>) {
  return {
    /** @returns All overrides for a given user. */
    listByUser(userId: string): Promise<UserFeatureFlagsTable[]> {
      return db.selectFrom("userFeatureFlags").selectAll().where("userId", "=", userId).execute();
    },

    /** @returns All overrides across all users, joined with user name/email for admin display. */
    async listAllWithUsers(): Promise<OverrideWithUser[]> {
      const rows = await db
        .selectFrom("userFeatureFlags")
        .innerJoin("users", "users.id", "userFeatureFlags.userId")
        .select([
          "userFeatureFlags.userId",
          "users.name as userName",
          "users.email as userEmail",
          "userFeatureFlags.flagKey",
          "userFeatureFlags.enabled",
        ])
        .orderBy("userFeatureFlags.flagKey")
        .orderBy("users.email")
        .execute();
      return rows;
    },

    /**
     * Merges global defaults with per-user overrides into a single `Record<string, boolean>`.
     *
     * @returns A flat flags map where user overrides take precedence over global defaults.
     */
    async listMerged(userId: string): Promise<Record<string, boolean>> {
      const [globals, overrides] = await Promise.all([
        db.selectFrom("featureFlags").select(["key", "enabled"]).execute(),
        db
          .selectFrom("userFeatureFlags")
          .select(["flagKey", "enabled"])
          .where("userId", "=", userId)
          .execute(),
      ]);

      const flags: Record<string, boolean> = {};
      for (const row of globals) {
        flags[row.key] = row.enabled;
      }
      for (const row of overrides) {
        flags[row.flagKey] = row.enabled;
      }
      return flags;
    },

    /**
     * Sets a per-user override, inserting or updating as needed.
     *
     * @returns The upserted row.
     */
    upsert(
      userId: string,
      flagKey: string,
      enabled: boolean,
    ): Promise<UserFeatureFlagsTable | undefined> {
      return db
        .insertInto("userFeatureFlags")
        .values({ userId, flagKey, enabled })
        .onConflict((oc) => oc.columns(["userId", "flagKey"]).doUpdateSet({ enabled }))
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    delete(userId: string, flagKey: string): Promise<DeleteResult> {
      return db
        .deleteFrom("userFeatureFlags")
        .where("userId", "=", userId)
        .where("flagKey", "=", flagKey)
        .executeTakeFirst();
    },
  };
}
