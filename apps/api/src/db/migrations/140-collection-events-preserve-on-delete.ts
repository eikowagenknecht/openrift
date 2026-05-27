import type { Kysely } from "kysely";
import { sql } from "kysely";

// Allow collection_events to outlive their collections by relaxing
// chk_collection_events_collection_presence — a row is now valid if the
// required side has either the collection id (FK live) or just the name
// snapshot (FK already nulled by ON DELETE SET NULL). Combined with
// removing the purge call in services/collections.ts, this means deleting
// a collection no longer wipes history for cards that have since moved
// elsewhere, which was causing the value-over-time chart to undercount.
//
// Also re-runs the migration-139 backfill so any data already wiped by
// the old purge behavior gets healed in the same step.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE collection_events
      DROP CONSTRAINT chk_collection_events_collection_presence
  `.execute(db);

  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT chk_collection_events_collection_presence
        CHECK (
          (action = 'added'
            AND (to_collection_id IS NOT NULL OR to_collection_name IS NOT NULL)) OR
          (action = 'removed'
            AND (from_collection_id IS NOT NULL OR from_collection_name IS NOT NULL)) OR
          (action = 'moved'
            AND (from_collection_id IS NOT NULL OR from_collection_name IS NOT NULL)
            AND (to_collection_id IS NOT NULL OR to_collection_name IS NOT NULL))
        )
  `.execute(db);

  // Heal any copies whose 'added' event was wiped by the old purge
  // behavior since migration 139 ran. Same query as migration 139, but
  // re-running it here covers data deleted between the two migrations.
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

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE collection_events
      DROP CONSTRAINT chk_collection_events_collection_presence
  `.execute(db);

  await sql`
    ALTER TABLE collection_events
      ADD CONSTRAINT chk_collection_events_collection_presence
        CHECK (
          (action = 'added' AND to_collection_id IS NOT NULL) OR
          (action = 'removed' AND from_collection_id IS NOT NULL) OR
          (action = 'moved' AND from_collection_id IS NOT NULL AND to_collection_id IS NOT NULL)
        )
  `.execute(db);
}
