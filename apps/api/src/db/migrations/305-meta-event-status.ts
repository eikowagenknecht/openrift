import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * A live event's lifecycle, so its page can say "in progress" instead of
 * "no results on file" while the source is still pairing rounds, and when
 * the archive last read the source for it.
 */

const STALE_EVENT_DAYS = 3;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_events
      ADD COLUMN status text NOT NULL DEFAULT 'complete',
      ADD COLUMN source_checked_at timestamptz,
      ADD CONSTRAINT chk_meta_events_status
        CHECK (status IN ('upcoming', 'in_progress', 'complete'))
  `.execute(db);

  // An event the source never closed reads as complete after a few days, the
  // same cutoff the recheck ladder applies.
  await sql`
    UPDATE meta_events AS m
       SET status = CASE u.display_status
                      WHEN 'inProgress' THEN 'in_progress'
                      WHEN 'upcoming' THEN 'upcoming'
                      ELSE 'complete'
                    END
      FROM meta_event_sources AS s
      JOIN uvsgames_events AS u ON u.external_id = s.external_id
     WHERE s.provider = 'uvsgames'
       AND s.meta_event_id = m.id
       AND u.display_status <> 'complete'
       AND u.start_at > now() - make_interval(days => ${sql.lit(STALE_EVENT_DAYS)})
  `.execute(db);

  await sql`
    UPDATE meta_events AS m
       SET status = CASE WHEN p.status = 4 THEN 'in_progress' ELSE 'upcoming' END
      FROM meta_event_sources AS s
      JOIN playloltcg_events AS p ON p.activity_shop_id::text = s.external_id
     WHERE s.provider = 'playloltcg'
       AND s.meta_event_id = m.id
       AND p.status IS NOT NULL
       AND p.status < 5
       AND p.start_at > current_date - ${sql.lit(STALE_EVENT_DAYS)}
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE meta_events
      DROP CONSTRAINT chk_meta_events_status,
      DROP COLUMN status,
      DROP COLUMN source_checked_at
  `.execute(db);
}
