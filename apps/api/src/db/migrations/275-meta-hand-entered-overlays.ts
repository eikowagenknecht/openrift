import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Claims the live values that promotion no longer re-derives.
 *
 * Promotion used to start from the live row, so a value nothing described
 * survived by sitting there. It now starts empty for every column that can hold
 * NULL, which is what lets releasing a claim give a value up. The values a
 * human typed have to become claims for that to be safe, or the next promote
 * would blank them.
 *
 * Two groups need one:
 *
 * - An event no mirror backs, whether hand entered or fed only by a push
 *   provider, has nothing to re-derive any of its fields from.
 * - `notes` on any event, because no source projection has ever produced one.
 *
 * Everything else on a mirror-backed event is left alone deliberately. A claim
 * there would freeze the mirror's current value and stop later fetches moving
 * it, which is the opposite of what the archive wants.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    WITH candidate AS (
      SELECT
        e.id,
        e.player_count,
        e.organizer,
        e.notes,
        e.country,
        e.location,
        NOT EXISTS (
          SELECT 1
          FROM meta_event_sources s
          WHERE s.meta_event_id = e.id
            AND s.provider IS NOT NULL
            AND s.external_id IS NOT NULL
            AND (
              (s.provider = 'uvsgames' AND EXISTS (
                SELECT 1 FROM uvsgames_events m WHERE m.external_id = s.external_id
              ))
              OR (s.provider = 'playloltcg' AND s.external_id ~ '^[0-9]+$' AND EXISTS (
                SELECT 1 FROM playloltcg_events m
                WHERE m.activity_shop_id = s.external_id::integer
              ))
            )
        ) AS unbacked
      FROM meta_events e
    ),
    claimed AS (
      SELECT
        c.*,
        CASE WHEN c.player_count IS NOT NULL AND c.unbacked
          THEN ARRAY['playerCount'] ELSE '{}'::text[] END
        || CASE WHEN c.organizer IS NOT NULL AND c.unbacked
          THEN ARRAY['organizer'] ELSE '{}'::text[] END
        || CASE WHEN c.notes IS NOT NULL
          THEN ARRAY['notes'] ELSE '{}'::text[] END
        || CASE WHEN c.country IS NOT NULL AND c.unbacked
          THEN ARRAY['country'] ELSE '{}'::text[] END
        || CASE WHEN c.location IS NOT NULL AND c.unbacked
          THEN ARRAY['location'] ELSE '{}'::text[] END
        AS fields
      FROM candidate c
    )
    INSERT INTO meta_event_overlays (
      meta_event_id, player_count, organizer, notes, country, location,
      claimed_fields, status, submitted_by_user_id, accepted_at
    )
    SELECT
      id,
      CASE WHEN fields @> ARRAY['playerCount'] THEN player_count END,
      CASE WHEN fields @> ARRAY['organizer'] THEN organizer END,
      CASE WHEN fields @> ARRAY['notes'] THEN notes END,
      CASE WHEN fields @> ARRAY['country'] THEN country END,
      CASE WHEN fields @> ARRAY['location'] THEN location END,
      fields,
      'accepted',
      'meta-archive',
      now()
    FROM claimed
    WHERE cardinality(fields) > 0
  `.execute(db);
}

/**
 * Drops only the rows {@link up} could have written. An admin edit made after
 * the migration is indistinguishable from one of these, so a rollback that has
 * been live for any length of time gives up real corrections. It is the same
 * trade the forward direction makes and there is no marker column to avoid it.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM meta_event_overlays
    WHERE submitted_by_user_id = 'meta-archive'
      AND provider IS NULL
      AND submission_note IS NULL
      AND name IS NULL
      AND event_date IS NULL
      AND format IS NULL
      AND tier IS NULL
  `.execute(db);
}
