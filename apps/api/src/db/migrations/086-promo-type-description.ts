import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("promo_types").addColumn("description", "text").execute();

  await sql`
    ALTER TABLE promo_types
    ADD CONSTRAINT promo_types_description_check CHECK (description <> '')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("promo_types").dropColumn("description").execute();
}
