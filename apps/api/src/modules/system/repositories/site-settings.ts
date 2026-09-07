import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { SiteSettingsTable } from "../../../db/tables/settings.js";

type Scope = "web" | "api";

export function siteSettingsRepo(db: Kysely<Database>) {
  return {
    listByScope(scope: Scope): Promise<Pick<Selectable<SiteSettingsTable>, "key" | "value">[]> {
      return db
        .selectFrom("siteSettings")
        .select(["key", "value"])
        .where("scope", "=", scope)
        .execute();
    },

    listAll(): Promise<Selectable<SiteSettingsTable>[]> {
      return db.selectFrom("siteSettings").selectAll().orderBy("key").execute();
    },

    /**
     * Callers compare `=== false`, so `undefined` (key never created) and any
     * value other than the stored string `"false"` both keep a feature on.
     */
    async getBool(key: string): Promise<boolean | undefined> {
      const row = await db
        .selectFrom("siteSettings")
        .select("value")
        .where("key", "=", key)
        .executeTakeFirst();
      if (row === undefined) {
        return undefined;
      }
      return row.value !== "false";
    },

    create(values: {
      key: string;
      value: string;
      scope: Scope;
    }): Promise<Selectable<SiteSettingsTable> | undefined> {
      return db
        .insertInto("siteSettings")
        .values(values)
        .onConflict((oc) => oc.column("key").doNothing())
        .returningAll()
        .executeTakeFirst();
    },

    update(
      key: string,
      updates: { value?: string; scope?: Scope },
    ): Promise<Selectable<SiteSettingsTable> | undefined> {
      return db
        .updateTable("siteSettings")
        .set(updates)
        .where("key", "=", key)
        .returningAll()
        .executeTakeFirst();
    },

    deleteByKey(key: string): Promise<DeleteResult> {
      return db.deleteFrom("siteSettings").where("key", "=", key).executeTakeFirst();
    },
  };
}
