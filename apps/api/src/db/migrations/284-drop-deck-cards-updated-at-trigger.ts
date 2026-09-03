import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Drops `trg_set_updated_at` from `deck_cards`, which has no `updated_at`
 * column for it to set. Every UPDATE on the table raised "record new has no
 * field updated_at"; nothing updated a deck row in place until 285, so the
 * trigger sat broken since the 001 squash.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON deck_cards`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON deck_cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}
