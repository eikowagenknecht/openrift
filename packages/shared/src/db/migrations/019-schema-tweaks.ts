import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("sets").addColumn("released_at", "date").execute();

  await db.schema
    .alterTable("printings")
    .addColumn("flavor_text", "text", (col) => col.notNull().defaultTo(""))
    .execute();

  await db.schema
    .alterTable("cards")
    .alterColumn("rules_text", (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable("cards")
    .alterColumn("effect_text", (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE cards SET rules_text = '' WHERE rules_text IS NULL`.execute(db);
  await sql`UPDATE cards SET effect_text = '' WHERE effect_text IS NULL`.execute(db);
  await db.schema
    .alterTable("cards")
    .alterColumn("rules_text", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("cards")
    .alterColumn("effect_text", (col) => col.setNotNull())
    .execute();

  await db.schema.alterTable("printings").dropColumn("flavor_text").execute();
  await db.schema.alterTable("sets").dropColumn("released_at").execute();
}
