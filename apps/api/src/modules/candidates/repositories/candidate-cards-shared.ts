import type { Expression, SqlBool } from "kysely";
import { expressionBuilder, sql } from "kysely";

import type { Database } from "../../../db/tables.js";

/**
 * Canonical ORDER BY keys for candidate-printing queries, mirroring the
 * printings_ordered view's canonical_rank (language, set, short code,
 * markerless before markered, marker sort order, finish, size) so candidate
 * printings sort the same everywhere accepted printings do. The query must
 * alias candidate_printings as `ps` and LEFT-join languages as `l`, sets as
 * `s` (on slug — candidate set_id holds the slug directly), finishes as `f`,
 * and card_sizes as `sz`; candidate data is provider-supplied, so unknown
 * reference values sort last (ASC puts NULL sort orders after known ones),
 * the raw column after each joined sort_order tiebreaks them, and the
 * trailing id makes the full order stable.
 */
export const CANONICAL_CANDIDATE_PRINTING_ORDER = [
  sql`l.sort_order`,
  sql`ps.language`,
  sql`s.sort_order`,
  sql`ps.set_id`,
  sql`ps.short_code`,
  sql`(array_length(ps.marker_slugs, 1) is not null)`,
  sql`coalesce((select min(m.sort_order) from markers m where m.slug = any(ps.marker_slugs)), 0)`,
  sql`f.sort_order`,
  sql`ps.finish`,
  sql`sz.sort_order`,
  sql`ps.is_signed`,
  sql`ps.id`,
];

/**
 * The filters below correlate to the outer query only through `sql.ref` on a
 * caller-supplied alias, so they need nothing from the calling query's table
 * scope. A standalone expression builder keeps the subqueries fully checked
 * against `Database`; an `ExpressionBuilder<Database, any>` parameter would
 * silently disable checking for the whole body.
 */
function candidateFilterEb() {
  return expressionBuilder<Database, never>();
}

export function notIgnoredCard(alias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
    eb.exists(
      eb
        .selectFrom("ignoredCandidateCards as ics")
        .select(sql.lit(1).as("x"))
        .where("ics.provider", "=", sql<string>`${sql.ref(`${alias}.provider`)}`)
        .where("ics.externalId", "=", sql<string>`${sql.ref(`${alias}.externalId`)}`),
    ),
  );
}

export function notHiddenSource(alias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
    eb.exists(
      eb
        .selectFrom("providerSettings as ss")
        .select(sql.lit(1).as("x"))
        .where("ss.provider", "=", sql<string>`${sql.ref(`${alias}.provider`)}`)
        .where("ss.isHidden", "=", true),
    ),
  );
}

export function notIgnoredPrinting(alias: string, csAlias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
    eb.exists(
      eb
        .selectFrom("ignoredCandidatePrintings as ips")
        .select(sql.lit(1).as("x"))
        .where("ips.provider", "=", sql<string>`${sql.ref(`${csAlias}.provider`)}`)
        .where("ips.externalId", "=", sql<string>`${sql.ref(`${alias}.externalId`)}`)
        .where((eb2) =>
          eb2.or([
            eb2("ips.finish", "is", null),
            eb2("ips.finish", "=", sql<string>`${sql.ref(`${alias}.finish`)}`),
          ]),
        ),
    ),
  );
}
