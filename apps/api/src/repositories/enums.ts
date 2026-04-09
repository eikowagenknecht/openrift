import type { Kysely, Selectable } from "kysely";

import type { Database, DomainsTable, ReferenceTable } from "../db/index.js";

type EnumRow = Selectable<ReferenceTable>;
type DomainRow = Selectable<DomainsTable>;

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
    async all(): Promise<Record<string, (EnumRow | DomainRow)[]>> {
      const [
        cardTypes,
        rarities,
        domains,
        superTypes,
        finishes,
        artVariants,
        deckFormats,
        deckZones,
        languageRows,
      ] = await Promise.all([
        list("cardTypes"),
        list("rarities"),
        db.selectFrom("domains").selectAll().orderBy("sortOrder").execute(),
        list("superTypes"),
        list("finishes"),
        list("artVariants"),
        list("deckFormats"),
        list("deckZones"),
        db.selectFrom("languages").selectAll().orderBy("sortOrder").orderBy("name").execute(),
      ]);

      // Map languages (code/name) to the standard enum shape (slug/label)
      const languages: EnumRow[] = languageRows.map((row) => ({
        slug: row.code,
        label: row.name,
        sortOrder: row.sortOrder,
        isWellKnown: false,
      }));

      return {
        cardTypes,
        rarities,
        domains,
        superTypes,
        finishes,
        artVariants,
        deckFormats,
        deckZones,
        languages,
      };
    },
  };
}
