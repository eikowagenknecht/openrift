import type { Kysely } from "kysely";
import { sql } from "kysely";

// Replaces source provenance metadata on rule_versions with a free-form
// `comments` field. Comments render as markdown above the rule list.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE rule_versions DROP COLUMN source_type`.execute(db);
  await sql`ALTER TABLE rule_versions DROP COLUMN source_url`.execute(db);
  await sql`ALTER TABLE rule_versions DROP COLUMN published_at`.execute(db);
  await sql`ALTER TABLE rule_versions ADD COLUMN comments TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE rule_versions DROP COLUMN comments`.execute(db);
  await sql`
    ALTER TABLE rule_versions
      ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'
        CHECK (source_type IN ('pdf', 'text', 'html', 'manual'))
  `.execute(db);
  await sql`ALTER TABLE rule_versions ALTER COLUMN source_type DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE rule_versions ADD COLUMN source_url TEXT`.execute(db);
  await sql`ALTER TABLE rule_versions ADD COLUMN published_at DATE`.execute(db);
}
