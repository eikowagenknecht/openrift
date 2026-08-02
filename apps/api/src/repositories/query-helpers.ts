import { ERROR_CODES } from "@openrift/shared";
import type { Expression, Kysely, RawBuilder, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
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
 * The timestamp is compared through `date_trunc('milliseconds', ...)`: the
 * column keeps µs precision that a JS `Date` cannot carry, so an untruncated
 * equality would silently skip the rows sharing the cursor's second.
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
  const truncatedTime = sql<Date>`date_trunc('milliseconds', ${sql.ref(options.timeColumn)})`;
  if (id === null) {
    return sql<SqlBool>`${truncatedTime} < ${time}`;
  }
  const idRef = sql.ref(options.idColumn);
  const tieBreak =
    options.idDirection === "asc" ? sql<SqlBool>`${idRef} > ${id}` : sql<SqlBool>`${idRef} < ${id}`;
  return sql<SqlBool>`(${truncatedTime} < ${time} or (${truncatedTime} = ${time} and ${tieBreak}))`;
}

/**
 * Base query: copies → printings → cards → front-face printing images → image files
 * (aliases: cp, p, c, pi, imgf).
 * @returns A Kysely SelectQueryBuilder with the five tables joined.
 */
export function selectCopyWithCard(db: Kysely<Database>) {
  return db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("cards as c", "c.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId");
}
