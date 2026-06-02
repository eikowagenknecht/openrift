import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export interface WellKnownStatusRow {
  slug: string;
  isWellKnown: boolean;
}

/**
 * Repository for the startup well-known reference-data check. Isolated here so
 * the validation service goes through the repository layer instead of touching
 * the raw Kysely instance. The table and primary-key column are dynamic across
 * the reference tables, so the unavoidable casts live in this one sanctioned
 * place rather than leaking into a service.
 * @returns The well-known repository, bound to `db`.
 */
export function wellKnownRepo(db: Kysely<Database>) {
  return {
    /**
     * Reads the well-known status of the given primary-key values in `table`,
     * aliasing the pk column to `slug` so callers get a uniform shape.
     * @returns One row per matching value: `{ slug, isWellKnown }`.
     */
    wellKnownStatus(
      table: keyof Database,
      pk: string,
      values: string[],
    ): Promise<WellKnownStatusRow[]> {
      // table/pk are dynamic across the reference tables, hence the casts.
      return db
        .selectFrom(table as any)
        .select([`${pk} as slug`, "isWellKnown"] as any)
        .where(pk as any, "in", values)
        .execute() as Promise<WellKnownStatusRow[]>;
    },
  };
}
