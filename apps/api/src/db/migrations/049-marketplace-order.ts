import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE user_preferences
    ADD COLUMN marketplace_order jsonb NOT NULL DEFAULT '["tcgplayer","cardmarket","cardtrader"]'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE user_preferences DROP COLUMN marketplace_order`.execute(db);
}
