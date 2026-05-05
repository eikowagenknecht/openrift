import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pg_stat_statements`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop extension if exists pg_stat_statements`.execute(db);
}
