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

    /**
     * Reads a boolean setting. Values are stored as the strings `"true"` /
     * `"false"` (written by the Switch on the admin page); anything else counts
     * as `true`, so a hand-typed value can never silently disable a feature.
     *
     * The `undefined` case is load-bearing for default-on switches: callers
     * write `=== false` so a setting that was never created keeps the feature
     * running.
     *
     * @returns `false` only for an explicit `"false"`, `true` for any other
     *   stored value, `undefined` when the key does not exist.
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
