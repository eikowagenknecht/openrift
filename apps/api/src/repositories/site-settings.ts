import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, SiteSettingsTable } from "../db/index.js";

type Scope = "web" | "api";

/**
 * Queries for site settings.
 *
 * @returns An object with site setting query methods bound to the given `db`.
 */
export function siteSettingsRepo(db: Kysely<Database>) {
  return {
    /** @returns Settings matching the given scope. */
    listByScope(scope: Scope): Promise<Pick<Selectable<SiteSettingsTable>, "key" | "value">[]> {
      return db
        .selectFrom("siteSettings")
        .select(["key", "value"])
        .where("scope", "=", scope)
        .execute();
    },

    /** @returns All settings with full details, ordered by key (for admin). */
    listAll(): Promise<Selectable<SiteSettingsTable>[]> {
      return db.selectFrom("siteSettings").selectAll().orderBy("key").execute();
    },

    /** @returns The newly created setting row, or `undefined` if the key already exists. */
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

    /** @returns The updated setting row, or `undefined` if not found. */
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

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByKey(key: string): Promise<DeleteResult> {
      return db.deleteFrom("siteSettings").where("key", "=", key).executeTakeFirst();
    },
  };
}
