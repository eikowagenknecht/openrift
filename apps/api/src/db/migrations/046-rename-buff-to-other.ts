import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE cards SET type = 'Other' WHERE type = 'Buff'`.execute(db);

  await sql`
    ALTER TABLE cards
    DROP CONSTRAINT chk_cards_type,
    ADD CONSTRAINT chk_cards_type CHECK (
      type = ANY (ARRAY['Legend','Unit','Rune','Spell','Gear','Battlefield','Other'])
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cards
    DROP CONSTRAINT chk_cards_type,
    ADD CONSTRAINT chk_cards_type CHECK (
      type = ANY (ARRAY['Legend','Unit','Rune','Spell','Gear','Battlefield','Buff'])
    )
  `.execute(db);

  await sql`UPDATE cards SET type = 'Buff' WHERE type = 'Other'`.execute(db);
}
