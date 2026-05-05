import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_rules_search`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX idx_rules_search ON rules USING GIN (to_tsvector('english', content))`.execute(
    db,
  );
}
