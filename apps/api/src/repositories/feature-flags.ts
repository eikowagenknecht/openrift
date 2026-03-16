import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for feature flags.
 *
 * @returns An object with feature flag query methods bound to the given `db`.
 */
export function featureFlagsRepo(db: Kysely<Database>) {
  return {
    /** @returns All flags as `{ key, enabled }` pairs (for the public endpoint). */
    listKeyEnabled() {
      return db.selectFrom("feature_flags").select(["key", "enabled"]).execute();
    },

    /** @returns All flags with full details, ordered by key (for admin). */
    listAll() {
      return db.selectFrom("feature_flags").selectAll().orderBy("key").execute();
    },

    /** @returns The flag row if it exists, or `undefined`. */
    getByKey(key: string) {
      return db.selectFrom("feature_flags").select("key").where("key", "=", key).executeTakeFirst();
    },

    /** @returns Inserts a new flag. */
    create(values: { key: string; enabled: boolean; description: string | null }) {
      return db.insertInto("feature_flags").values(values).execute();
    },

    /** @returns Updates a flag by key. */
    update(key: string, updates: Record<string, unknown>) {
      return db.updateTable("feature_flags").set(updates).where("key", "=", key).execute();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByKey(key: string) {
      return db.deleteFrom("feature_flags").where("key", "=", key).executeTakeFirst();
    },
  };
}
