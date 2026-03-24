import type { Kysely, Selectable } from "kysely";

import type { Database, KeywordStylesTable } from "../db/index.js";

/**
 * Queries for keyword styles.
 *
 * @returns An object with keyword style query methods bound to the given `db`.
 */
export function keywordStylesRepo(db: Kysely<Database>) {
  return {
    /** @returns All keyword styles. */
    listAll(): Promise<Selectable<KeywordStylesTable>[]> {
      return db.selectFrom("keywordStyles").selectAll().orderBy("name").execute();
    },
  };
}
