import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE promo_types DROP COLUMN sort_order`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE promo_types ADD COLUMN sort_order integer NOT NULL DEFAULT 0`.execute(db);
}
