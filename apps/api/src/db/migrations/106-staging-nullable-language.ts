import type { Kysely } from "kysely";
import { sql } from "kysely";

// Make marketplace_staging.language nullable to match the semantics we're
// settling on: language = NULL means "not a SKU axis for this marketplace."
// Cardmarket's price guide is cross-language by construction; TCGPlayer sells
// the English SKU only and doesn't expose language as a product dimension.
// Both were storing the placeholder 'EN' on every ingested row, which leaked
// a false positive ("we've identified the English version") through to
// downstream code.
//
// marketplace_staging_card_overrides gets the same treatment — its primary
// key uses (marketplace, external_id, finish, language), and a NULL language
// has to be distinguishable so the PK still dedupes correctly.

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. marketplace_staging ── drop the NOT NULL + default, rewrite the
  //    unique constraint to treat NULL as a real value.
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN language DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN language DROP DEFAULT`.execute(db);

  await sql`
    ALTER TABLE marketplace_staging
      DROP CONSTRAINT marketplace_staging_marketplace_external_id_finish_language_rec
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_staging_marketplace_external_id_finish_language_rec
      ON marketplace_staging (marketplace, external_id, finish, language, recorded_at)
      NULLS NOT DISTINCT
  `.execute(db);

  // 2. Backfill CM/TCG rows to NULL. The ingester code change that writes
  //    NULL going forward ships in the same PR.
  await sql`
    UPDATE marketplace_staging SET language = NULL
    WHERE marketplace IN ('cardmarket', 'tcgplayer')
  `.execute(db);

  // 3. marketplace_staging_card_overrides ── same treatment. The PK uses a
  //    real CONSTRAINT (not a NULLS NOT DISTINCT index), so we have to drop
  //    the PK before the NOT NULL can be lifted — language is part of it.
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT marketplace_staging_card_overrides_pkey
  `.execute(db);
  await sql`ALTER TABLE marketplace_staging_card_overrides ALTER COLUMN language DROP NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_staging_card_overrides ALTER COLUMN language DROP DEFAULT`.execute(
    db,
  );
  await sql`
    CREATE UNIQUE INDEX marketplace_staging_card_overrides_pkey
      ON marketplace_staging_card_overrides (marketplace, external_id, finish, language)
      NULLS NOT DISTINCT
  `.execute(db);

  await sql`
    UPDATE marketplace_staging_card_overrides SET language = NULL
    WHERE marketplace IN ('cardmarket', 'tcgplayer')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Backfill NULL → 'EN' so the NOT NULL can be re-applied.
  await sql`UPDATE marketplace_staging SET language = 'EN' WHERE language IS NULL`.execute(db);
  await sql`
    UPDATE marketplace_staging_card_overrides SET language = 'EN' WHERE language IS NULL
  `.execute(db);

  await sql`DROP INDEX marketplace_staging_marketplace_external_id_finish_language_rec`.execute(db);
  await sql`
    ALTER TABLE marketplace_staging
      ADD CONSTRAINT marketplace_staging_marketplace_external_id_finish_language_rec
      UNIQUE (marketplace, external_id, finish, language, recorded_at)
  `.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN language SET DEFAULT 'EN'`.execute(db);
  await sql`ALTER TABLE marketplace_staging ALTER COLUMN language SET NOT NULL`.execute(db);

  await sql`DROP INDEX marketplace_staging_card_overrides_pkey`.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ADD CONSTRAINT marketplace_staging_card_overrides_pkey
      PRIMARY KEY (marketplace, external_id, finish, language)
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides ALTER COLUMN language SET DEFAULT 'EN'
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides ALTER COLUMN language SET NOT NULL
  `.execute(db);
}
