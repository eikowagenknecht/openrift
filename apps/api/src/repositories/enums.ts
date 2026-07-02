import type { KeepPriorityOrders } from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";

import type {
  Database,
  DomainsTable,
  MarkersTable,
  RaritiesTable,
  ReferenceTable,
} from "../db/index.js";

type EnumRow = Selectable<ReferenceTable>;
type DomainRow = Selectable<DomainsTable>;
type RarityRow = Selectable<RaritiesTable>;
type MarkerRow = Selectable<MarkersTable>;

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
      | "superTypes"
      | "finishes"
      | "artVariants"
      | "cardSizes"
      | "deckFormats"
      | "deckZones"
    >,
  ): Promise<EnumRow[]> {
    return db.selectFrom(table).selectAll().orderBy("sortOrder").execute();
  }

  return {
    /**
     * The reference orders a trade rule needs to rank owned copies by niceness
     * (ADR-034): finish / rarity / art-variant slugs in ascending sort order.
     * Cheaper than {@link all} — three small slug-only reads.
     * @returns Slug arrays keyed by dimension, premium last.
     */
    async keepPriorityOrders(): Promise<KeepPriorityOrders> {
      const [finishes, rarities, artVariants] = await Promise.all([
        db.selectFrom("finishes").select("slug").orderBy("sortOrder").execute(),
        db.selectFrom("rarities").select("slug").orderBy("sortOrder").execute(),
        db.selectFrom("artVariants").select("slug").orderBy("sortOrder").execute(),
      ]);
      return {
        finishes: finishes.map((row) => row.slug),
        rarities: rarities.map((row) => row.slug),
        artVariants: artVariants.map((row) => row.slug),
      };
    },

    /** @returns All rows from every reference table, keyed by table name. */
    async all(): Promise<Record<string, (EnumRow | DomainRow | RarityRow | MarkerRow)[]>> {
      const [
        cardTypes,
        rarities,
        domains,
        superTypes,
        finishes,
        artVariants,
        cardSizes,
        deckFormats,
        deckZones,
        languageRows,
        markers,
      ] = await Promise.all([
        list("cardTypes"),
        db.selectFrom("rarities").selectAll().orderBy("sortOrder").execute(),
        db.selectFrom("domains").selectAll().orderBy("sortOrder").execute(),
        list("superTypes"),
        list("finishes"),
        list("artVariants"),
        list("cardSizes"),
        list("deckFormats"),
        list("deckZones"),
        db.selectFrom("languages").selectAll().orderBy("sortOrder").orderBy("name").execute(),
        db.selectFrom("markers").selectAll().orderBy("sortOrder").orderBy("label").execute(),
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
        cardSizes,
        deckFormats,
        deckZones,
        languages,
        markers,
      };
    },
  };
}
