import type { KeepPriorityOrders } from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

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

/** A `languages` row remapped onto the standard slug/label enum shape. */
interface LanguageEnumRow {
  slug: string;
  label: string;
  color: string | null;
  sortOrder: number;
  isWellKnown: boolean;
}

/**
 * Every reference table's rows, keyed by table name — the source of the /init
 * `enums` payload. Spelled out per key rather than as a `Record<string, …>` so
 * the route can map it onto the contract without casting.
 */
export interface AllEnumRows {
  cardTypes: EnumRow[];
  rarities: RarityRow[];
  domains: DomainRow[];
  superTypes: EnumRow[];
  finishes: EnumRow[];
  artVariants: EnumRow[];
  cardSizes: EnumRow[];
  deckFormats: EnumRow[];
  deckZones: EnumRow[];
  conditions: EnumRow[];
  graders: EnumRow[];
  languages: LanguageEnumRow[];
  markers: MarkerRow[];
}

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
      | "conditions"
      | "graders"
    >,
  ): Promise<EnumRow[]> {
    return db.selectFrom(table).selectAll().orderBy("sortOrder").execute();
  }

  return {
    /**
     * A token that changes whenever any reference table's *content* changes.
     *
     * Only `languages` and `markers` carry `updated_at`, so this hashes each
     * table's whole row set (`t::text` captures every column, including ones
     * added later) rather than probing timestamps. All thirteen tables hold ~71
     * rows between them, so the digest is far cheaper than the thirteen round
     * trips it lets a caller skip — and unlike a TTL it has no staleness
     * window, so an admin edit is visible on the next read.
     *
     * @returns An opaque version token for the reference-table content.
     */
    async contentVersion(): Promise<string> {
      const digest = (table: string) =>
        sql`coalesce((SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM ${sql.raw(table)} t), '')`;
      const tables = [
        "card_types",
        "super_types",
        "finishes",
        "art_variants",
        "card_sizes",
        "deck_formats",
        "deck_zones",
        "conditions",
        "graders",
        "rarities",
        "domains",
        "languages",
        "markers",
      ];
      const result = await sql<{ token: string }>`SELECT ${sql.join(
        tables.map((t) => digest(t)),
        sql` || '|' || `,
      )} AS token`.execute(db);
      return result.rows[0]?.token ?? "";
    },

    /**
     * The reference orders a trade rule needs to rank owned copies by niceness
     * (ADR-034): finish / rarity / art-variant slugs in ascending sort order.
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
    async all(): Promise<AllEnumRows> {
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
        conditions,
        graders,
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
        list("conditions"),
        list("graders"),
        db.selectFrom("languages").selectAll().orderBy("sortOrder").orderBy("name").execute(),
        db.selectFrom("markers").selectAll().orderBy("sortOrder").orderBy("label").execute(),
      ]);

      // Map languages (code/name/color) to the standard enum shape (slug/label),
      // carrying `color` through so the client can render language chips.
      const languages = languageRows.map((row) => ({
        slug: row.code,
        label: row.name,
        color: row.color,
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
        conditions,
        graders,
        languages,
        markers,
      };
    },
  };
}
