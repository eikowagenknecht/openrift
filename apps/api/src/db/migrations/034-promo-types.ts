import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create the promo_types lookup table
  await sql`
    CREATE TABLE promo_types (
      id uuid DEFAULT uuidv7() NOT NULL PRIMARY KEY,
      slug text NOT NULL UNIQUE CHECK (slug <> ''),
      label text NOT NULL CHECK (label <> ''),
      sort_order int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // 2. Seed with a generic "promo" type for existing data
  await sql`
    INSERT INTO promo_types (slug, label) VALUES ('promo', 'Promo')
  `.execute(db);

  // 3. Add promo_type_id FK column to printings
  await sql`
    ALTER TABLE printings
    ADD COLUMN promo_type_id uuid REFERENCES promo_types(id)
  `.execute(db);

  // 4. Backfill: existing is_promo=true rows get the generic "promo" type
  await sql`
    UPDATE printings
    SET promo_type_id = (SELECT id FROM promo_types WHERE slug = 'promo')
    WHERE is_promo = true
  `.execute(db);

  // 5. Drop old unique constraint and re-create with promo_type_id
  await sql`
    ALTER TABLE printings DROP CONSTRAINT uq_printings_variant
  `.execute(db);
  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT uq_printings_variant
    UNIQUE (source_id, art_variant, is_signed, promo_type_id, rarity, finish)
  `.execute(db);

  // 6. Drop the old is_promo column
  await sql`
    ALTER TABLE printings DROP COLUMN is_promo
  `.execute(db);

  // 7. Same for printing_sources (staging table)
  await sql`
    ALTER TABLE printing_sources
    ADD COLUMN promo_type_id uuid REFERENCES promo_types(id)
  `.execute(db);
  await sql`
    UPDATE printing_sources
    SET promo_type_id = (SELECT id FROM promo_types WHERE slug = 'promo')
    WHERE is_promo = true
  `.execute(db);
  await sql`
    ALTER TABLE printing_sources DROP COLUMN is_promo
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // 1. Re-add is_promo to printing_sources
  await sql`
    ALTER TABLE printing_sources
    ADD COLUMN is_promo boolean
  `.execute(db);
  await sql`
    UPDATE printing_sources
    SET is_promo = (promo_type_id IS NOT NULL)
  `.execute(db);
  await sql`
    ALTER TABLE printing_sources DROP COLUMN promo_type_id
  `.execute(db);

  // 2. Re-add is_promo to printings
  await sql`
    ALTER TABLE printings
    ADD COLUMN is_promo boolean NOT NULL DEFAULT false
  `.execute(db);
  await sql`
    UPDATE printings
    SET is_promo = (promo_type_id IS NOT NULL)
  `.execute(db);

  // 3. Restore original unique constraint
  await sql`
    ALTER TABLE printings DROP CONSTRAINT uq_printings_variant
  `.execute(db);
  await sql`
    ALTER TABLE printings
    ADD CONSTRAINT uq_printings_variant
    UNIQUE (source_id, art_variant, is_signed, is_promo, rarity, finish)
  `.execute(db);

  // 4. Drop promo_type_id column
  await sql`
    ALTER TABLE printings DROP COLUMN promo_type_id
  `.execute(db);

  // 5. Drop the promo_types table
  await sql`DROP TABLE promo_types`.execute(db);
}
