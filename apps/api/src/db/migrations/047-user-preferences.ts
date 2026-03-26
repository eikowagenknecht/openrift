import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE user_preferences (
      user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      show_images      BOOLEAN NOT NULL DEFAULT true,
      rich_effects     BOOLEAN NOT NULL DEFAULT true,
      card_field_number  BOOLEAN NOT NULL DEFAULT true,
      card_field_title   BOOLEAN NOT NULL DEFAULT true,
      card_field_type    BOOLEAN NOT NULL DEFAULT true,
      card_field_rarity  BOOLEAN NOT NULL DEFAULT true,
      card_field_price   BOOLEAN NOT NULL DEFAULT true,
      theme            TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER user_preferences_set_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS user_preferences`.execute(db);
}
