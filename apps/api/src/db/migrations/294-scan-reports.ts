import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE scan_reports (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      reference text NOT NULL UNIQUE,
      note text,
      user_agent text,
      journal jsonb NOT NULL,
      CONSTRAINT chk_scan_reports_reference CHECK (reference <> ''),
      CONSTRAINT chk_scan_reports_journal_shape CHECK (jsonb_typeof(journal) = 'array')
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_scan_reports_user_created ON scan_reports (user_id, created_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE scan_reports`.execute(db);
}
