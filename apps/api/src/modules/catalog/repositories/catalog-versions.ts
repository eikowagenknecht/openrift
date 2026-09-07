import type { Kysely, RawBuilder } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

const CATALOG_SHAPE_VERSION = "2";

/**
 * Excludes the current date; only {@link catalogContentVersion} folds that in.
 * Timestamps are pinned to UTC: `timestamptz::text` renders in the session
 * time zone otherwise, so instances would compute different tokens for identical data.
 */
const STORED_CATALOG_AGGREGATES = sql<string>`
      ${sql.lit(CATALOG_SHAPE_VERSION)} || '|' ||
      coalesce((SELECT count(*) FROM cards)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM cards)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printings)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM printings)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM sets)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM sets)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM card_bans)::text, '') || ':' ||
      coalesce((SELECT max(created_at) AT TIME ZONE 'UTC' FROM card_bans)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM card_errata)::text, '') || ':' ||
      coalesce((SELECT max(created_at) AT TIME ZONE 'UTC' FROM card_errata)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM markers)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM markers)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printing_markers)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM distribution_channels)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM distribution_channels)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printing_distribution_channels)::text, '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || domain_slug || ':' || ordinal::text, ',' ORDER BY card_id, domain_slug)) FROM card_domains), '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || super_type_slug, ',' ORDER BY card_id, super_type_slug)) FROM card_super_types), '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || custom_tag_id::text, ',' ORDER BY card_id, custom_tag_id)) FROM card_custom_tags), '') || '|' ||
      coalesce((SELECT count(*) FROM custom_tags)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM custom_tags)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM set_releases)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM set_releases)::text, '')
`;

async function hashedToken(db: Kysely<Database>, expression: RawBuilder<string>): Promise<string> {
  const result = await sql<{ token: string }>`SELECT md5(${expression}) AS token`.execute(db);
  return result.rows[0]?.token ?? "";
}

export function catalogVersionsRepo(db: Kysely<Database>) {
  return {
    /**
     * Domain/super-type/custom-tag junction tables have no `updated_at`, and a same-cardinality swap leaves `count(*)` unchanged, so they are content-hashed.
     * Includes `current_date` for `setReleased`'s derived flag; {@link catalogResponseVersion} must not inherit it.
     */
    catalogContentVersion(): Promise<string> {
      return hashedToken(db, sql`${STORED_CATALOG_AGGREGATES} || '|' || current_date::text`);
    },

    /**
     * `printing_markers`, `printing_distribution_channels`, and `printing_citations` have no `updated_at`, so they are content-hashed.
     * Any new `CatalogResponse` field must be added to this token or the `immutable` ETag goes stale. Excludes `current_date`.
     */
    async catalogResponseVersion(): Promise<string> {
      const [storedToken, result] = await Promise.all([
        hashedToken(db, STORED_CATALOG_AGGREGATES),
        sql<{ token: string }>`
          SELECT md5(
            coalesce((SELECT count(*) FROM printing_images)::text, '') || ':' ||
            coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM printing_images)::text, '') || '|' ||
            coalesce((SELECT count(*) FROM copies)::text, '') || '|' ||
            coalesce((SELECT md5(string_agg(
              printing_id::text || ':' || marker_id::text, ',' ORDER BY printing_id, marker_id
            )) FROM printing_markers), '') || '|' ||
            coalesce((SELECT md5(string_agg(
              printing_id::text || ':' || channel_id::text || ':' || coalesce(distribution_note, ''),
              ',' ORDER BY printing_id, channel_id
            )) FROM printing_distribution_channels), '') || '|' ||
            coalesce((SELECT md5(string_agg(
              id::text || ':' || label || ':' || coalesce(source_url, '') || ':' || sort_order::text,
              ',' ORDER BY id
            )) FROM printing_citations), '')
          ) AS token
        `.execute(db),
      ]);
      return `${storedToken}${result.rows[0]?.token ?? ""}`;
    },
  };
}
