import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { Database, AcquisitionSourcesTable } from "../db/index.js";

/**
 * Queries for user acquisition sources.
 *
 * @returns An object with acquisition source query methods bound to the given `db`.
 */
export function acquisitionSourcesRepo(db: Kysely<Database>) {
  return {
    /** @returns All acquisition sources for a user, ordered by name. */
    listForUser(userId: string): Promise<Selectable<AcquisitionSourcesTable>[]> {
      return db
        .selectFrom("acquisitionSources")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single acquisition source by ID scoped to a user, or `undefined`. */
    getByIdForUser(
      id: string,
      userId: string,
    ): Promise<Selectable<AcquisitionSourcesTable> | undefined> {
      return db
        .selectFrom("acquisitionSources")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created acquisition source row. */
    create(values: {
      userId: string;
      name: string;
      description: string | null;
    }): Promise<Selectable<AcquisitionSourcesTable>> {
      return db
        .insertInto("acquisitionSources")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The updated acquisition source row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<AcquisitionSourcesTable> | undefined> {
      return db
        .updateTable("acquisitionSources")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("acquisitionSources")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },
  };
}
