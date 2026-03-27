import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add the consolidated jsonb column
  await sql`
    ALTER TABLE user_preferences
    ADD COLUMN data jsonb NOT NULL DEFAULT '{"showImages":true,"richEffects":true,"visibleFields":{"number":true,"title":true,"type":true,"rarity":true,"price":true},"marketplaceOrder":["tcgplayer","cardmarket","cardtrader"]}'::jsonb
  `.execute(db);

  // Migrate existing rows, fixing double-encoded marketplace_order
  await sql`
    UPDATE user_preferences
    SET data = jsonb_build_object(
      'showImages', show_images,
      'richEffects', rich_effects,
      'visibleFields', jsonb_build_object(
        'number', card_field_number,
        'title', card_field_title,
        'type', card_field_type,
        'rarity', card_field_rarity,
        'price', card_field_price
      ),
      'theme', theme,
      'marketplaceOrder', CASE
        WHEN jsonb_typeof(marketplace_order) = 'string'
        THEN (marketplace_order #>> '{}')::jsonb
        ELSE marketplace_order
      END
    )
  `.execute(db);

  // Drop old columns
  await sql`
    ALTER TABLE user_preferences
      DROP COLUMN show_images,
      DROP COLUMN rich_effects,
      DROP COLUMN card_field_number,
      DROP COLUMN card_field_title,
      DROP COLUMN card_field_type,
      DROP COLUMN card_field_rarity,
      DROP COLUMN card_field_price,
      DROP COLUMN theme,
      DROP COLUMN marketplace_order
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add individual columns
  await sql`
    ALTER TABLE user_preferences
      ADD COLUMN show_images boolean NOT NULL DEFAULT true,
      ADD COLUMN rich_effects boolean NOT NULL DEFAULT true,
      ADD COLUMN card_field_number boolean NOT NULL DEFAULT true,
      ADD COLUMN card_field_title boolean NOT NULL DEFAULT true,
      ADD COLUMN card_field_type boolean NOT NULL DEFAULT true,
      ADD COLUMN card_field_rarity boolean NOT NULL DEFAULT true,
      ADD COLUMN card_field_price boolean NOT NULL DEFAULT true,
      ADD COLUMN theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
      ADD COLUMN marketplace_order jsonb NOT NULL DEFAULT '["tcgplayer","cardmarket","cardtrader"]'
  `.execute(db);

  // Migrate data back to individual columns
  await sql`
    UPDATE user_preferences SET
      show_images = (data->>'showImages')::boolean,
      rich_effects = (data->>'richEffects')::boolean,
      card_field_number = (data->'visibleFields'->>'number')::boolean,
      card_field_title = (data->'visibleFields'->>'title')::boolean,
      card_field_type = (data->'visibleFields'->>'type')::boolean,
      card_field_rarity = (data->'visibleFields'->>'rarity')::boolean,
      card_field_price = (data->'visibleFields'->>'price')::boolean,
      theme = COALESCE(data->>'theme', 'light'),
      marketplace_order = data->'marketplaceOrder'
  `.execute(db);

  // Drop the consolidated column
  await sql`ALTER TABLE user_preferences DROP COLUMN data`.execute(db);
}
