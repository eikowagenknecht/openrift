import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 follow-up: multi-day tournaments and "end early" need a stored end
// instant. `ends_at` is nullable — a null end means the tournament auto-completes
// 24h after `starts_at` (derived in the web layer), while a set end pins the
// close (multi-day) or marks an early finish.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments ADD COLUMN ends_at timestamptz`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments DROP COLUMN ends_at`.execute(db);
}
