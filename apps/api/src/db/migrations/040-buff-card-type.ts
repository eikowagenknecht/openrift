import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards
    DROP CONSTRAINT chk_cards_type,
    ADD CONSTRAINT chk_cards_type CHECK (
      type = ANY (ARRAY['Legend','Unit','Rune','Spell','Gear','Battlefield','Buff'])
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards
    DROP CONSTRAINT chk_cards_type,
    ADD CONSTRAINT chk_cards_type CHECK (
      type = ANY (ARRAY['Legend','Unit','Rune','Spell','Gear','Battlefield'])
    )
  `.execute(db);
}
