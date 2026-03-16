import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, SourcesTable } from "../db/index.js";

/**
 * Queries for user acquisition sources.
 *
 * @returns An object with source query methods bound to the given `db`.
 */
export function sourcesRepo(db: Kysely<Database>) {
  return {
    /** @returns All sources for a user, ordered by name. */
    listForUser(userId: string): Promise<Selectable<SourcesTable>[]> {
      return db
        .selectFrom("sources")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single source by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<SourcesTable> | undefined> {
      return db
        .selectFrom("sources")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created source row. */
    create(values: {
      userId: string;
      name: string;
      description: string | null;
    }): Promise<Selectable<SourcesTable>> {
      return db.insertInto("sources").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated source row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<SourcesTable> | undefined> {
      return db
        .updateTable("sources")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("sources")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },
  };
}
