import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE printing_sources ALTER COLUMN art_variant DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN artist DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN printed_rules_text DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE card_sources ALTER COLUMN rules_text DROP NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE printing_sources SET art_variant = '' WHERE art_variant IS NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN art_variant SET NOT NULL`.execute(db);
  await sql`UPDATE printing_sources SET artist = '' WHERE artist IS NULL`.execute(db);
  await sql`ALTER TABLE printing_sources ALTER COLUMN artist SET NOT NULL`.execute(db);
  await sql`UPDATE printing_sources SET printed_rules_text = '' WHERE printed_rules_text IS NULL`.execute(
    db,
  );
  await sql`ALTER TABLE printing_sources ALTER COLUMN printed_rules_text SET NOT NULL`.execute(db);
  await sql`UPDATE card_sources SET rules_text = '' WHERE rules_text IS NULL`.execute(db);
  await sql`ALTER TABLE card_sources ALTER COLUMN rules_text SET NOT NULL`.execute(db);
}
