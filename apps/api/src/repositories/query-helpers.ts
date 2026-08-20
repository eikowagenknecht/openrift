import { ERROR_CODES } from "@openrift/shared";
import type { Finish, Rarity } from "@openrift/shared/types";
import type {
  Expression,
  Kysely,
  RawBuilder,
  SelectQueryBuilder,
  SqlBool,
  StringReference,
} from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import type { ImageFilesTable, PrintingImagesTable, PrintingsTable } from "../db/tables.js";
import { AppError } from "../errors.js";

/**
 * Resolve card_id dynamically: direct card name match → alias match → candidate printing match.
 * candidate_cards no longer stores card_id — matching is always derived from the
 * card name or a previously-created card_name_alias.
 * Uses indexed norm_name columns for fast equality lookups.
 *
 * @param alias — the candidate_cards table alias used in the query (e.g. "cs")
 * @returns A raw SQL expression resolving to the card UUID or NULL.
 */
export const resolveCardId = (alias: string): RawBuilder<string | null> =>
  sql<string | null>`COALESCE(
    (SELECT c_res.id FROM cards c_res WHERE c_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1),
    (SELECT cna_res.card_id FROM card_name_aliases cna_res WHERE cna_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1),
    (SELECT p_res.card_id FROM candidate_printings ps_res JOIN printings p_res ON p_res.short_code = ps_res.short_code JOIN candidate_cards cs_res ON cs_res.id = ps_res.candidate_card_id WHERE cs_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1)
  )`;

/**
 * Resolves the image_files.id (UUID) for a self-hosted image. Returns NULL
 * when the row hasn't been rehosted yet, so callers can keep the existing
 * `IS NOT NULL` filter to exclude external-only entries from public pages.
 * The client constructs variant URLs from this ID via `imageUrl()` in shared.
 * @returns A raw SQL expression: alias.id (or NULL if not rehosted)
 */
export function imageId(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`CASE WHEN ${sql.ref(`${alias}.rehostedUrl`)} IS NOT NULL THEN ${sql.ref(`${alias}.id`)} ELSE NULL END`;
}

/**
 * The same rule as {@link imageId}, applied to a printing's pinned fallback art
 * (migration 257) one join away: NULL unless something is pinned *and* that
 * file has been rehosted. A correlated subquery rather than a join, because the
 * five queries that build a catalog printing row select from a shared column
 * list and would each have to carry the join otherwise. It is a primary-key
 * lookup on a column that is NULL for all but a handful of printings.
 *
 * @param alias — the printings (or `printings_ordered`) alias in the query
 * @returns An aliased SQL expression: the servable image id, or NULL.
 */
export function fallbackImageId(alias: string) {
  return sql<string | null>`(
    SELECT fbf.id FROM image_files fbf
    WHERE fbf.id = ${sql.ref(`${alias}.fallbackImageFileId`)}
      AND fbf.rehosted_url IS NOT NULL
  )`.as("fallbackImageId");
}

/**
 * Resolves the best available image URL, falling back to the original provider URL.
 * Use this only in admin contexts where showing external images is acceptable.
 * @returns A raw SQL expression: COALESCE(alias.rehosted_url, alias.original_url)
 */
export function imageUrlWithOriginal(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehostedUrl`)}, ${sql.ref(`${alias}.originalUrl`)})`;
}

const CURSOR_SEPARATOR = "_";

/**
 * Builds an opaque keyset cursor from a timestamp and id. The matching reader
 * is {@link keysetCursorPredicate}; `keysetCursorSchema` in `@openrift/shared`
 * validates the same grammar at the contract boundary.
 * @returns A cursor string encoding both values.
 */
export function buildKeysetCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
}

/**
 * Splits a cursor into its timestamp and id parts.
 * @returns The decoded timestamp, and the id (null for a legacy cursor).
 */
function parseKeysetCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  // Legacy timestamp-only cursor (backward compat during deploys) has no
  // separator; either way, the part before it (or the whole string) must be
  // a parseable timestamp.
  const rawTime = separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
  const time = new Date(rawTime);
  if (Number.isNaN(time.getTime())) {
    // The query schemas (keysetCursorSchema) already reject syntactically
    // invalid cursors before this runs; this is a defensive backstop against
    // any other caller passing an unvalidated cursor straight through.
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Invalid cursor");
  }
  return {
    time,
    id: separatorIndex === -1 ? null : cursor.slice(separatorIndex + 1),
  };
}

/**
 * WHERE predicate that resumes a keyset-paginated list after `cursor`. The
 * caller's ORDER BY must be `<timeColumn> desc, <idColumn> <idDirection>` —
 * the tie-break comparator follows `idDirection`, so the two orderings in use
 * (events page id-descending, copies id-ascending) stay explicit rather than
 * drifting apart.
 *
 * The predicate has two parts, and both are needed.
 *
 * The correctness half compares through `date_trunc('milliseconds', ...)`: the
 * column keeps µs precision that a JS `Date` cannot carry, so an untruncated
 * equality would silently skip the rows sharing the cursor's millisecond.
 *
 * The performance half is the redundant `<timeColumn> < cursorTime + 1ms`
 * bound. `date_trunc` is only STABLE, so no index can serve the truncated
 * comparison and the planner falls back to scanning the table. The bare column
 * bound is sargable, so an index on `(timeColumn, idColumn)` can seek. It
 * excludes nothing: the cursor time is millisecond-aligned (it comes from a JS
 * `Date`), every row passing the truncated half satisfies
 * `date_trunc(col) <= cursorTime`, and that is equivalent to
 * `col < cursorTime + 1ms`.
 *
 * @param cursor — a cursor produced by {@link buildKeysetCursor}
 * @param options — the ordered columns and the id tie-break direction
 * @returns A SQL predicate for `query.where(...)`.
 * @throws {AppError} 400 when the cursor's timestamp part is unparseable.
 */
export function keysetCursorPredicate(
  cursor: string,
  options: { timeColumn: string; idColumn: string; idDirection: "asc" | "desc" },
): Expression<SqlBool> {
  const { time, id } = parseKeysetCursor(cursor);
  const timeRef = sql.ref(options.timeColumn);
  const truncatedTime = sql<Date>`date_trunc('milliseconds', ${timeRef})`;
  // Exclusive upper bound: the cursor's millisecond plus one, so every µs
  // inside the cursor's own millisecond still passes and the truncated half
  // stays the only thing deciding those rows.
  const upperBound = new Date(time.getTime() + 1);
  const sargableBound = sql<SqlBool>`${timeRef} < ${upperBound}`;
  if (id === null) {
    return sql<SqlBool>`(${sargableBound} and ${truncatedTime} < ${time})`;
  }
  const idRef = sql.ref(options.idColumn);
  const tieBreak =
    options.idDirection === "asc" ? sql<SqlBool>`${idRef} > ${id}` : sql<SqlBool>`${idRef} < ${id}`;
  return sql<SqlBool>`(${sargableBound} and (${truncatedTime} < ${time} or (${truncatedTime} = ${time} and ${tieBreak})))`;
}

interface FrontImageTables {
  pi: PrintingImagesTable;
  imgf: ImageFilesTable;
}

/**
 * Left-joins the active front-face image of the `p`-aliased printing, exposing
 * it as `pi` (printing_images) and `imgf` (image_files). Left, not inner, so a
 * printing with no artwork still yields its row — pair it with `imageId("imgf")`
 * to get the nullable image id, or read `imgf.rehostedUrl` directly.
 *
 * The query must already have `printings` (or `printings_ordered`) aliased to
 * `p`; the generic constraint enforces that much, and the internal casts are
 * what let one helper serve every root table. Callers therefore must not
 * already use the `pi` or `imgf` aliases.
 *
 * @param qb A select query with a `p`-aliased printing in scope.
 * @returns The same query with the two image joins appended.
 */
export function joinFrontImage<DB extends { p: { id: unknown } }, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
): SelectQueryBuilder<DB & FrontImageTables, TB | "pi" | "imgf", O> {
  return (qb as unknown as SelectQueryBuilder<Database & { p: PrintingsTable }, "p", O>)
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId") as unknown as SelectQueryBuilder<
    DB & FrontImageTables,
    TB | "pi" | "imgf",
    O
  >;
}

interface RequiredFrontImageTables {
  pim: PrintingImagesTable;
  imgf: ImageFilesTable;
}

/**
 * Inner-join variant of {@link joinFrontImage}: takes the printing id from an
 * explicit reference instead of a `p` alias, and drops rows whose printing has
 * no active front image. Use it where an imageless printing must not surface at
 * all — cover fans and thumb stacks, where a blank tile would waste a slot.
 *
 * Exposes the joins as `pim` and `imgf`, so a query can carry this or
 * `joinFrontImage`, never both.
 *
 * @param qb The select query to extend.
 * @param printingIdRef Reference to the printing id column to match on, e.g. `"cp.printingId"`.
 * @returns The same query with the two image joins appended.
 */
export function requireFrontImage<DB extends Database, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
  printingIdRef: StringReference<DB, TB>,
): SelectQueryBuilder<DB & RequiredFrontImageTables, TB | "pim" | "imgf", O> {
  return (qb as unknown as SelectQueryBuilder<Database & { src: { printingId: string } }, "src", O>)
    .innerJoin("printingImages as pim", (join) =>
      join
        .onRef("pim.printingId", "=", printingIdRef as never)
        .on("pim.face", "=", "front")
        .on("pim.isActive", "=", true),
    )
    .innerJoin("imageFiles as imgf", "imgf.id", "pim.imageFileId") as unknown as SelectQueryBuilder<
    DB & RequiredFrontImageTables,
    TB | "pim" | "imgf",
    O
  >;
}

/**
 * Base query: copies → printings → cards → front-face printing images → image files
 * (aliases: cp, p, c, pi, imgf).
 * @returns A Kysely SelectQueryBuilder with the five tables joined.
 */
export function selectCopyWithCard(db: Kysely<Database>) {
  return joinFrontImage(
    db
      .selectFrom("copies as cp")
      .innerJoin("printings as p", "p.id", "cp.printingId")
      .innerJoin("cards as c", "c.id", "p.cardId"),
  );
}

/** Display detail for one printing: its card's name plus the printing's own identity and art. */
export interface PrintingDetail {
  cardName: string;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

/**
 * Batch-loads display detail for the given printing ids. Shared by the list
 * repository (rule-only entry enrichment) and the trade matcher, which both
 * need the same card-name/set/rarity/finish/art tuple keyed by printing.
 *
 * @param db The Kysely instance to query.
 * @param ids Printing ids to load; an empty array short-circuits without a query.
 * @returns A map of printing id to its detail. Ids with no printing are absent.
 */
export async function printingDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, PrintingDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await joinFrontImage(
    db.selectFrom("printings as p").innerJoin("cards as card", "card.id", "p.cardId"),
  )
    .select([
      "p.id",
      "card.name as cardName",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
    ])
    .where("p.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        cardName: row.cardName,
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
      },
    ]),
  );
}
