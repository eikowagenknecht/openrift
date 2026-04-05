import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE rule_versions (
      version         TEXT PRIMARY KEY,
      source_type     TEXT NOT NULL CHECK (source_type IN ('pdf', 'text', 'html', 'manual')),
      source_url      TEXT,
      published_at    DATE,
      imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE rules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version         TEXT NOT NULL REFERENCES rule_versions(version) ON DELETE CASCADE,
      rule_number     TEXT NOT NULL CHECK (rule_number <> ''),
      sort_order      INTEGER NOT NULL,
      depth           SMALLINT NOT NULL CHECK (depth >= 0 AND depth <= 3),
      rule_type       TEXT NOT NULL CHECK (rule_type IN ('title', 'subtitle', 'text')),
      content         TEXT NOT NULL,
      change_type     TEXT NOT NULL DEFAULT 'added' CHECK (change_type IN ('added', 'modified', 'removed')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (version, rule_number)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_rules_version_sort ON rules (version, sort_order)`.execute(db);
  await sql`CREATE INDEX idx_rules_search ON rules USING GIN (to_tsvector('english', content))`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS rules`.execute(db);
  await sql`DROP TABLE IF EXISTS rule_versions`.execute(db);
}
