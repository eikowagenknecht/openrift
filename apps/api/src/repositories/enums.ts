import type { Kysely, Selectable } from "kysely";

import type { Database, ReferenceTable } from "../db/index.js";

type EnumRow = Selectable<ReferenceTable>;

/**
 * Read-only queries for reference tables (enums backed by DB rows).
 *
 * @returns An object with enum query methods bound to the given `db`.
 */
export function enumsRepo(db: Kysely<Database>) {
  function list(
    table: keyof Pick<
      Database,
      | "cardTypes"
      | "rarities"
      | "domains"
      | "superTypes"
      | "finishes"
      | "artVariants"
      | "deckFormats"
      | "deckZones"
    >,
  ): Promise<EnumRow[]> {
    return db.selectFrom(table).selectAll().orderBy("sortOrder").execute();
  }

  return {
    /** @returns All rows from every reference table, keyed by table name. */
    async all(): Promise<Record<string, EnumRow[]>> {
      const [
        cardTypes,
        rarities,
        domains,
        superTypes,
        finishes,
        artVariants,
        deckFormats,
        deckZones,
      ] = await Promise.all([
        list("cardTypes"),
        list("rarities"),
        list("domains"),
        list("superTypes"),
        list("finishes"),
        list("artVariants"),
        list("deckFormats"),
        list("deckZones"),
      ]);
      return {
        cardTypes,
        rarities,
        domains,
        superTypes,
        finishes,
        artVariants,
        deckFormats,
        deckZones,
      };
    },
  };
}
