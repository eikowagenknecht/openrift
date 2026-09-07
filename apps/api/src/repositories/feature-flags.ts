import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, FeatureFlagsTable } from "../db/index.js";

export function featureFlagsRepo(db: Kysely<Database>) {
  return {
    listKeyEnabled(): Promise<Pick<Selectable<FeatureFlagsTable>, "key" | "enabled">[]> {
      return db.selectFrom("featureFlags").select(["key", "enabled"]).execute();
    },

    async isEnabled(key: string): Promise<boolean | undefined> {
      const row = await db
        .selectFrom("featureFlags")
        .select("enabled")
        .where("key", "=", key)
        .executeTakeFirst();
      return row?.enabled;
    },

    listAll(): Promise<Selectable<FeatureFlagsTable>[]> {
      return db.selectFrom("featureFlags").selectAll().orderBy("key").execute();
    },

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

    update(
      key: string,
      updates: { enabled?: boolean; description?: string | null },
    ): Promise<Selectable<FeatureFlagsTable> | undefined> {
      return db
        .updateTable("featureFlags")
        .set(updates)
        .where("key", "=", key)
        .returningAll()
        .executeTakeFirst();
    },

    deleteByKey(key: string): Promise<DeleteResult> {
      return db.deleteFrom("featureFlags").where("key", "=", key).executeTakeFirst();
    },
  };
}
