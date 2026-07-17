import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Riftbound's banlists are additive per play mode: a base list applies to all
 * constructed play, and 2v2 carries additional bans on top of it (the first
 * arrived with the newest set). 1v1 and FFA have no extra bans yet, so their
 * format rows are deliberately not added — each is a one-line migration when
 * an actual ban lands, and empty formats only clutter the admin ban dropdown.
 *
 * Two changes:
 * - Rename the `standard` format's display name to "Constructed". Card pages
 *   render "Banned in {name}", and next to a 2v2-specific ban the base list
 *   must read as covering all constructed play, not as a sibling mode.
 * - Insert the `2v2` format to hold the 2v2-only additions.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE formats SET name = 'Constructed' WHERE id = 'standard'`.execute(db);
  await sql`INSERT INTO formats (id, name) VALUES ('2v2', '2v2')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM card_bans WHERE format_id = '2v2'`.execute(db);
  await sql`DELETE FROM formats WHERE id = '2v2'`.execute(db);
  await sql`UPDATE formats SET name = 'Standard' WHERE id = 'standard'`.execute(db);
}
