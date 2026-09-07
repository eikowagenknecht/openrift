import type { DeleteResult, Kysely, Selectable, UpdateResult } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ReferenceTable } from "../../../db/tables/reference.js";
import { reorderBySortOrder } from "./sort-order.js";

/**
 * `deckZones`, `conditions`, `graders` and `cardSizes` share this row shape
 * but expose no create/delete route, so they are deliberately excluded.
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
 * Kysely resolves column types from a concrete table name, so the builders in
 * {@link slugTaxonomyRepo} are typechecked against this stand-in.
 */
interface TaxonomyDb {
  taxonomy: ReferenceTable & { color: string | null | undefined };
}

/** `isInUse` has no common implementation: each taxonomy is referenced from a different table and column. */
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

/** New rows are always created with `is_well_known: false`; well-known rows are seeded by migrations. */
export function slugTaxonomyRepo<T extends SlugTaxonomyTable>(
  db: Kysely<Database>,
  options: {
    table: T;
    isInUse: (slug: string) => Promise<unknown>;
  },
): SlugTaxonomyRepo<T> {
  const { table, isInUse } = options;

  // Real table name reaches the query at runtime via `from`; SlugTaxonomyRepo<T>
  // restores the exact per-table row shape for callers.
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
