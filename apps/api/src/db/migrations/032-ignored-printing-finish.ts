import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * 1. Add a nullable `finish` column to `ignored_printing_sources`.
 *    - NULL finish → ignore all finishes for that (source, source_entity_id)
 *    - Non-NULL finish → ignore only that specific finish
 *
 * 2. Drop the unused `reason` column from both ignore tables.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Add finish to ignored_printing_sources ──────────────────────────────

  await sql`
    ALTER TABLE ignored_printing_sources
    ADD COLUMN finish text
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    ADD CONSTRAINT chk_ignored_printing_sources_no_empty_finish CHECK (finish <> '')
  `.execute(db);

  await sql`
    DROP INDEX idx_ignored_printing_sources_source_entity
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_printing_sources_source_entity_finish
    ON ignored_printing_sources (source, source_entity_id, COALESCE(finish, ''))
  `.execute(db);

  // ── Drop reason from both tables ────────────────────────────────────────

  await sql`
    ALTER TABLE ignored_card_sources
    DROP CONSTRAINT chk_ignored_card_sources_no_empty_reason
  `.execute(db);

  await sql`
    ALTER TABLE ignored_card_sources
    DROP COLUMN reason
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    DROP CONSTRAINT chk_ignored_printing_sources_no_empty_reason
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    DROP COLUMN reason
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Restore reason on both tables ───────────────────────────────────────

  await sql`
    ALTER TABLE ignored_printing_sources
    ADD COLUMN reason text
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    ADD CONSTRAINT chk_ignored_printing_sources_no_empty_reason CHECK (reason <> '')
  `.execute(db);

  await sql`
    ALTER TABLE ignored_card_sources
    ADD COLUMN reason text
  `.execute(db);

  await sql`
    ALTER TABLE ignored_card_sources
    ADD CONSTRAINT chk_ignored_card_sources_no_empty_reason CHECK (reason <> '')
  `.execute(db);

  // ── Remove finish from ignored_printing_sources ─────────────────────────

  await sql`
    DROP INDEX idx_ignored_printing_sources_source_entity_finish
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_printing_sources_source_entity
    ON ignored_printing_sources (source, source_entity_id)
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    DROP CONSTRAINT chk_ignored_printing_sources_no_empty_finish
  `.execute(db);

  await sql`
    ALTER TABLE ignored_printing_sources
    DROP COLUMN finish
  `.execute(db);
}
