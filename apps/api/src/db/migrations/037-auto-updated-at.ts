import type { Kysely } from "kysely";
import { sql } from "kysely";

const TABLES = [
  "accounts",
  "activities",
  "admins",
  "card_sources",
  "cards",
  "collections",
  "copies",
  "deck_cards",
  "decks",
  "feature_flags",
  "marketplace_groups",
  "marketplace_ignored_products",
  "marketplace_sources",
  "marketplace_staging",
  "printing_images",
  "printing_sources",
  "printings",
  "promo_types",
  "sessions",
  "sets",
  "source_settings",
  "sources",
  "trade_list_items",
  "trade_lists",
  "users",
  "verifications",
  "wish_list_items",
  "wish_lists",
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  for (const table of TABLES) {
    await sql`
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON ${sql.table(table)}
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await sql`DROP TRIGGER IF EXISTS trg_set_updated_at ON ${sql.table(table)}`.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS set_updated_at()`.execute(db);
}
