import type { Kysely } from "kysely";
import { sql } from "kysely";

// Backfill synthetic 'added' events for every copies row that lacks one. The
// "Value over time" chart replays collection_events to rebuild composition per
// day; copies without a matching added event are invisible to it, causing the
// chart total to undercount by an order of magnitude on affected accounts.
//
// to_collection_id is a best guess: the from_collection_id of the copy's
// earliest 'moved' event (where it lived just before the first recorded move),
// falling back to its current collection if it never moved. created_at is the
// copy's own creation timestamp so the chart's historical buckets line up.
//
// Idempotent: NOT EXISTS guards against re-inserting on a re-run.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO collection_events
      (user_id, action, printing_id, copy_id,
       to_collection_id, to_collection_name, created_at)
    SELECT
      c.user_id,
      'added',
      c.printing_id,
      c.id,
      COALESCE(fm.from_collection_id, c.collection_id),
      COALESCE(fm.from_collection_name, col.name),
      c.created_at
    FROM copies c
    JOIN collections col ON col.id = c.collection_id
    LEFT JOIN LATERAL (
      SELECT from_collection_id, from_collection_name
      FROM collection_events
      WHERE copy_id = c.id AND action = 'moved'
      ORDER BY created_at ASC
      LIMIT 1
    ) fm ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM collection_events e
      WHERE e.copy_id = c.id AND e.action = 'added'
    )
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Not reversible — synthetic events are indistinguishable from real ones
  // once written.
}
