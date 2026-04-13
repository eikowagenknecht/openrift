import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO feature_flags (key, description, enabled)
    VALUES ('price-history', 'Show the Value Over Time chart on the collection stats page', false)
    ON CONFLICT (key) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM feature_flags WHERE key = 'price-history'`.execute(db);
}
