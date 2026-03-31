import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Formats table — centralises format definitions for decks, bans, etc.
  await sql`
    CREATE TABLE formats (
      id         text NOT NULL,
      name       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT formats_pkey PRIMARY KEY (id),
      CONSTRAINT chk_formats_id_not_empty CHECK (id <> ''),
      CONSTRAINT chk_formats_name_not_empty CHECK (name <> '')
    )
  `.execute(db);

  await sql`
    INSERT INTO formats (id, name) VALUES
      ('standard', 'Standard'),
      ('freeform', 'Freeform')
  `.execute(db);

  // Point decks.format at the new table instead of a CHECK constraint
  await sql`
    ALTER TABLE decks
    DROP CONSTRAINT chk_decks_format
  `.execute(db);

  await sql`
    ALTER TABLE decks
    ADD CONSTRAINT decks_format_fkey FOREIGN KEY (format) REFERENCES formats(id)
  `.execute(db);

  // Card bans
  await sql`
    CREATE TABLE card_bans (
      id          uuid DEFAULT uuidv7() NOT NULL,
      card_id     uuid NOT NULL REFERENCES cards(id),
      format_id   text NOT NULL REFERENCES formats(id),
      banned_at   date NOT NULL,
      unbanned_at date,
      reason      text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT card_bans_pkey PRIMARY KEY (id),
      CONSTRAINT chk_card_bans_reason_not_empty CHECK (reason <> '')
    )
  `.execute(db);

  // Only one active ban per card per format
  await sql`
    CREATE UNIQUE INDEX uq_card_bans_active
    ON card_bans (card_id, format_id)
    WHERE unbanned_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE card_bans`.execute(db);

  await sql`
    ALTER TABLE decks
    DROP CONSTRAINT decks_format_fkey
  `.execute(db);

  await sql`
    ALTER TABLE decks
    ADD CONSTRAINT chk_decks_format CHECK (format = ANY (ARRAY['standard'::text, 'freeform'::text]))
  `.execute(db);

  await sql`DROP TABLE formats`.execute(db);
}
