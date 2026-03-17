import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * 1. Make `source_entity_id` NOT NULL on `card_sources` and `printing_sources`.
 * 2. Create `ignored_card_sources` and `ignored_printing_sources` tables so
 *    nonsense entries can be permanently skipped during re-imports.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Clean up rows with NULL source_entity_id before adding NOT NULL ─────────
  await sql`DELETE FROM printing_sources WHERE card_source_id IN (SELECT id FROM card_sources WHERE source_entity_id IS NULL)`.execute(
    db,
  );
  await sql`DELETE FROM card_sources WHERE source_entity_id IS NULL`.execute(db);
  await sql`DELETE FROM printing_sources WHERE source_entity_id IS NULL`.execute(db);

  // ── Make source_entity_id NOT NULL ──────────────────────────────────────────

  await sql`
    ALTER TABLE card_sources
    ALTER COLUMN source_entity_id SET NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE printing_sources
    ALTER COLUMN source_entity_id SET NOT NULL
  `.execute(db);

  // ── Ignored card sources ────────────────────────────────────────────────────

  await sql`
    CREATE TABLE ignored_card_sources (
      id uuid DEFAULT uuidv7() NOT NULL PRIMARY KEY,
      source text NOT NULL,
      source_entity_id text NOT NULL,
      reason text,
      created_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT chk_ignored_card_sources_source_not_empty CHECK (source <> ''),
      CONSTRAINT chk_ignored_card_sources_entity_id_not_empty CHECK (source_entity_id <> ''),
      CONSTRAINT chk_ignored_card_sources_no_empty_reason CHECK (reason <> '')
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_card_sources_source_entity
    ON ignored_card_sources (source, source_entity_id)
  `.execute(db);

  // ── Ignored printing sources ────────────────────────────────────────────────

  await sql`
    CREATE TABLE ignored_printing_sources (
      id uuid DEFAULT uuidv7() NOT NULL PRIMARY KEY,
      source text NOT NULL,
      source_entity_id text NOT NULL,
      reason text,
      created_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT chk_ignored_printing_sources_source_not_empty CHECK (source <> ''),
      CONSTRAINT chk_ignored_printing_sources_entity_id_not_empty CHECK (source_entity_id <> ''),
      CONSTRAINT chk_ignored_printing_sources_no_empty_reason CHECK (reason <> '')
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_ignored_printing_sources_source_entity
    ON ignored_printing_sources (source, source_entity_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS ignored_printing_sources`.execute(db);
  await sql`DROP TABLE IF EXISTS ignored_card_sources`.execute(db);

  await sql`
    ALTER TABLE printing_sources
    ALTER COLUMN source_entity_id DROP NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE card_sources
    ALTER COLUMN source_entity_id DROP NOT NULL
  `.execute(db);
}
