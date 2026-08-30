import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * `playloltcg_events.activity_shop_id` is the source's own event key, six
 * digits in every payload observed so far, and the shop registry it sits beside
 * already keys on `integer`. `bigint` bought nothing and cost honesty the same
 * way `overlay_channels.version` did (migration 250): postgres.js hands back
 * int8 as a *string*, so `tables.ts` declaring `number` was a lie that every
 * read had to paper over with a coercion, and the one place that forgot
 * compared strings against a `Set<number>` and never matched. As `integer` the
 * driver returns a real number and the coercions go away.
 *
 * The child key moves first so the foreign key never spans two widths.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE playloltcg_event_checks ALTER COLUMN activity_shop_id TYPE integer
  `.execute(db);
  await sql`
    ALTER TABLE playloltcg_events ALTER COLUMN activity_shop_id TYPE integer
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE playloltcg_events ALTER COLUMN activity_shop_id TYPE bigint
  `.execute(db);
  await sql`
    ALTER TABLE playloltcg_event_checks ALTER COLUMN activity_shop_id TYPE bigint
  `.execute(db);
}
