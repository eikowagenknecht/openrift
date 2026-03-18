import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, FeatureFlagsTable } from "../db/index.js";

/**
 * Queries for feature flags.
 *
 * @returns An object with feature flag query methods bound to the given `db`.
 */
export function featureFlagsRepo(db: Kysely<Database>) {
  return {
    /** @returns All flags as `{ key, enabled }` pairs (for the public endpoint). */
    listKeyEnabled(): Promise<Pick<Selectable<FeatureFlagsTable>, "key" | "enabled">[]> {
      return db.selectFrom("featureFlags").select(["key", "enabled"]).execute();
    },

    /** @returns All flags with full details, ordered by key (for admin). */
    listAll(): Promise<Selectable<FeatureFlagsTable>[]> {
      return db.selectFrom("featureFlags").selectAll().orderBy("key").execute();
    },

    /** @returns The newly created flag row, or `undefined` if the key already exists. */
    create(values: {
      key: string;
      enabled: boolean;
      description: string | null;
    }): Promise<Selectable<FeatureFlagsTable> | undefined> {
      return db
        .insertInto("featureFlags")
        .values(values)
        .onConflict((oc) => oc.column("key").doNothing())
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns The updated flag row, or `undefined` if not found. */
    update(
      key: string,
      updates: { enabled?: boolean; description?: string | null },
    ): Promise<Selectable<FeatureFlagsTable> | undefined> {
      return db
        .updateTable("featureFlags")
        .set({ ...updates, updatedAt: new Date() })
        .where("key", "=", key)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByKey(key: string): Promise<DeleteResult> {
      return db.deleteFrom("featureFlags").where("key", "=", key).executeTakeFirst();
    },
  };
}
