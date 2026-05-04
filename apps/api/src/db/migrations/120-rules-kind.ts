import type { Kysely } from "kysely";
import { sql } from "kysely";

// Splits the rules dataset into two kinds: 'core' (the comprehensive game
// rules) and 'tournament' (event/policy rules). Existing rows are all core.
//
// Rebuilds rule_versions PK as (kind, version) and the rules unique constraint
// + FK to be composite so the same version string can exist independently for
// each kind.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE rule_versions
      ADD COLUMN kind TEXT NOT NULL DEFAULT 'core'
        CHECK (kind IN ('core', 'tournament'))
  `.execute(db);
  await sql`ALTER TABLE rule_versions ALTER COLUMN kind DROP DEFAULT`.execute(db);

  await sql`
    ALTER TABLE rules
      ADD COLUMN kind TEXT NOT NULL DEFAULT 'core'
        CHECK (kind IN ('core', 'tournament'))
  `.execute(db);
  await sql`ALTER TABLE rules ALTER COLUMN kind DROP DEFAULT`.execute(db);

  await sql`ALTER TABLE rules DROP CONSTRAINT rules_version_fkey`.execute(db);
  await sql`ALTER TABLE rules DROP CONSTRAINT rules_version_rule_number_key`.execute(db);
  await sql`
    ALTER TABLE rules
      ADD CONSTRAINT rules_kind_version_rule_number_key
        UNIQUE (kind, version, rule_number)
  `.execute(db);

  await sql`ALTER TABLE rule_versions DROP CONSTRAINT rule_versions_pkey`.execute(db);
  await sql`ALTER TABLE rule_versions ADD PRIMARY KEY (kind, version)`.execute(db);

  await sql`
    ALTER TABLE rules
      ADD CONSTRAINT rules_kind_version_fkey
        FOREIGN KEY (kind, version) REFERENCES rule_versions(kind, version) ON DELETE CASCADE
  `.execute(db);

  await sql`DROP INDEX idx_rules_version_sort`.execute(db);
  await sql`CREATE INDEX idx_rules_kind_version_sort ON rules (kind, version, sort_order)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_rules_kind_version_sort`.execute(db);
  await sql`CREATE INDEX idx_rules_version_sort ON rules (version, sort_order)`.execute(db);

  await sql`ALTER TABLE rules DROP CONSTRAINT rules_kind_version_fkey`.execute(db);

  await sql`ALTER TABLE rule_versions DROP CONSTRAINT rule_versions_pkey`.execute(db);
  await sql`ALTER TABLE rule_versions ADD PRIMARY KEY (version)`.execute(db);

  await sql`ALTER TABLE rules DROP CONSTRAINT rules_kind_version_rule_number_key`.execute(db);
  await sql`
    ALTER TABLE rules
      ADD CONSTRAINT rules_version_rule_number_key UNIQUE (version, rule_number)
  `.execute(db);
  await sql`
    ALTER TABLE rules
      ADD CONSTRAINT rules_version_fkey
        FOREIGN KEY (version) REFERENCES rule_versions(version) ON DELETE CASCADE
  `.execute(db);

  await sql`ALTER TABLE rules DROP COLUMN kind`.execute(db);
  await sql`ALTER TABLE rule_versions DROP COLUMN kind`.execute(db);
}
