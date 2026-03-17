import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Create the `printing_link_overrides` table.
 *
 * Stores manual printing-source → printing links keyed by the stable
 * (source_entity_id, finish) pair so they survive card-source
 * delete-and-re-upload cycles.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE printing_link_overrides (
      source_entity_id  text        NOT NULL,
      finish            text        NOT NULL,
      printing_slug     text        NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_entity_id, finish)
    )
  `.execute(db);

  await sql`
    ALTER TABLE printing_link_overrides
    ADD CONSTRAINT chk_plo_no_empty_source_entity_id CHECK (source_entity_id <> '')
  `.execute(db);

  await sql`
    ALTER TABLE printing_link_overrides
    ADD CONSTRAINT chk_plo_no_empty_printing_slug CHECK (printing_slug <> '')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE printing_link_overrides`.execute(db);
}
