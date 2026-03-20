import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("cards").addColumn("comment", "text").execute();

  await sql`
    ALTER TABLE cards
    ADD CONSTRAINT chk_cards_no_empty_comment CHECK (comment <> '')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cards DROP CONSTRAINT chk_cards_no_empty_comment`.execute(db);

  await db.schema.alterTable("cards").dropColumn("comment").execute();
}
