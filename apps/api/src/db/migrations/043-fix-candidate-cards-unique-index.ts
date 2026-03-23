import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Fix unique constraints on candidate_cards and candidate_printings.
 *
 * candidate_cards: The old index enforced uniqueness on (provider, short_code),
 * but short_code is a cleaned/normalized identifier that can legitimately
 * collide when multiple source entries map to the same base card. The ingestion
 * logic uses external_id as the stable identity key, so the unique constraint
 * should be on (provider, external_id) instead.
 *
 * candidate_printings: Had no unique constraint at all (dropped in migration
 * 041). Add one on (candidate_card_id, external_id) to prevent duplicate
 * printings from slipping in.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── candidate_cards ──
  // Drop the old short_code-based unique index
  await sql`DROP INDEX IF EXISTS idx_candidate_cards_provider_short_code`.execute(db);

  // Create the new external_id-based unique index
  await sql`CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id
    ON candidate_cards (provider, external_id)
    WHERE external_id IS NOT NULL`.execute(db);

  // Keep a non-unique index on (provider, short_code) for lookups
  await sql`CREATE INDEX idx_candidate_cards_provider_short_code
    ON candidate_cards (provider, short_code)
    WHERE short_code IS NOT NULL`.execute(db);

  // ── candidate_printings ──
  await sql`CREATE UNIQUE INDEX idx_candidate_printings_card_external_id
    ON candidate_printings (candidate_card_id, external_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── candidate_printings ──
  await sql`DROP INDEX IF EXISTS idx_candidate_printings_card_external_id`.execute(db);

  // ── candidate_cards ──
  await sql`DROP INDEX IF EXISTS idx_candidate_cards_provider_short_code`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_candidate_cards_provider_external_id`.execute(db);

  // Restore the old unique index on short_code
  await sql`CREATE UNIQUE INDEX idx_candidate_cards_provider_short_code
    ON candidate_cards (provider, short_code)
    WHERE short_code IS NOT NULL`.execute(db);
}
