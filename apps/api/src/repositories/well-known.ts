import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

export interface WellKnownStatusRow {
  slug: string;
  isWellKnown: boolean;
}

export function wellKnownRepo(db: Kysely<Database>) {
  return {
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
