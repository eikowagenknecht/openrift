import type { DeleteResult, Kysely, Selectable, UpdateResult } from "kysely";

import type { Database, ReferenceTable } from "../db/index.js";
import { reorderBySortOrder } from "./sort-order.js";

/**
 * The admin-editable reference tables keyed by a text `slug`, each carrying the
 * {@link ReferenceTable} columns plus at most a nullable `color`. `deckZones`,
 * `conditions`, `graders` and `cardSizes` share the row shape but expose no
 * create / delete route, so they are deliberately excluded.
 */
export type SlugTaxonomyTable =
  | "artVariants"
  | "cardTypes"
  | "deckFormats"
  | "domains"
  | "finishes"
  | "rarities"
  | "superTypes";

/** Columns a given taxonomy adds on top of {@link ReferenceTable} (only `color` today). */
type ExtraColumns<T extends SlugTaxonomyTable> = Omit<
  Selectable<Database[T]>,
  keyof ReferenceTable
>;

/**
 * The union of columns the seven tables have. Kysely resolves column types from
 * a concrete table name, so the builders in {@link slugTaxonomyRepo} are
 * typechecked against this stand-in rather than against a generic `Database[T]`
 * that it cannot see through.
 */
interface TaxonomyDb {
  taxonomy: ReferenceTable & { color: string | null | undefined };
}

/**
 * The CRUD surface shared by the slug-keyed taxonomies. `isInUse` is the one
 * method with no common implementation — each taxonomy is referenced from a
 * different table and column — so the caller supplies it.
 */
export interface SlugTaxonomyRepo<T extends SlugTaxonomyTable> {
  listAll: () => Promise<Selectable<Database[T]>[]>;
  getBySlug: (slug: string) => Promise<Selectable<Database[T]> | undefined>;
  create: (
    values: { slug: string; label: string; sortOrder?: number } & Partial<ExtraColumns<T>>,
  ) => Promise<Selectable<Database[T]>>;
  update: (
    slug: string,
    updates: { label?: string } & Partial<ExtraColumns<T>>,
  ) => Promise<UpdateResult>;
  deleteBySlug: (slug: string) => Promise<DeleteResult>;
  isInUse: (slug: string) => Promise<unknown>;
  reorder: (slugs: readonly string[]) => Promise<void>;
}

/**
 * Builds the CRUD surface shared by the slug-keyed reference taxonomies
 * (finishes, art variants, card types, supertypes, deck formats, rarities,
 * domains). Every method is identical across them apart from the table name and
 * the in-use lookup, so each taxonomy repo is this factory plus its own
 * `isInUse`.
 *
 * New rows are always created with `is_well_known: false` — well-known rows are
 * seeded by migrations, never through the admin API.
 *
 * @returns The taxonomy repo bound to `options.table`.
 */
export function slugTaxonomyRepo<T extends SlugTaxonomyTable>(
  db: Kysely<Database>,
  options: {
    /** Kysely table name, e.g. `"artVariants"`. */
    table: T;
    /** Resolves to a truthy row while the slug is still referenced somewhere. */
    isInUse: (slug: string) => Promise<unknown>;
  },
): SlugTaxonomyRepo<T> {
  const { table, isInUse } = options;

  // Type-only redirection onto TaxonomyDb: the real table name is what reaches
  // the query at runtime, and the signatures on SlugTaxonomyRepo<T> restore the
  // exact per-table row shape for callers.
  const rows = db as unknown as Kysely<TaxonomyDb>;
  const from = table as unknown as "taxonomy";
  type Row = Selectable<Database[T]>;

  return {
    listAll() {
      return rows.selectFrom(from).selectAll().orderBy("sortOrder").execute() as Promise<Row[]>;
    },

    getBySlug(slug) {
      return rows
        .selectFrom(from)
        .selectAll()
        .where("slug", "=", slug)
        .executeTakeFirst() as Promise<Row | undefined>;
    },

    create(values) {
      const { slug, label, sortOrder, ...extras } = values;
      return rows
        .insertInto(from)
        .values({
          ...(extras as { color?: string | null }),
          slug,
          label,
          sortOrder: sortOrder ?? 0,
          isWellKnown: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow() as Promise<Row>;
    },

    update(slug, updates) {
      return rows
        .updateTable(from)
        .set(updates as { label?: string; color?: string | null })
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    },

    deleteBySlug(slug) {
      return rows.deleteFrom(from).where("slug", "=", slug).executeTakeFirstOrThrow();
    },

    isInUse,

    reorder(slugs) {
      return reorderBySortOrder(db, { table, keyColumn: "slug", keys: slugs });
    },
  };
}
