import type { Kysely } from "kysely";
import { sql } from "kysely";

// Rename `marketplace_staging_card_overrides` →
// `marketplace_product_card_overrides` and re-key it on
// `marketplace_product_id` instead of the
// `(marketplace, external_id, finish, language)` tuple.
//
// Functionally identical — overrides still map a marketplace SKU to a
// specific card — but the FK to `marketplace_products` makes the
// constraint enforce-able at the DB layer, lets ON DELETE CASCADE handle
// product cleanup, and frees us from the dangling-reference shape staging
// had after a product mapping was edited.

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add the new FK column (nullable while we backfill).
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ADD COLUMN marketplace_product_id uuid
  `.execute(db);

  // 2. Backfill from the SKU tuple.
  await sql`
    UPDATE marketplace_staging_card_overrides ov
    SET marketplace_product_id = mp.id
    FROM marketplace_products mp
    WHERE mp.marketplace = ov.marketplace
      AND mp.external_id = ov.external_id
      AND mp.finish = ov.finish
      AND mp.language IS NOT DISTINCT FROM ov.language
  `.execute(db);

  // 3. Drop overrides whose SKU no longer exists in products. They were
  //    orphaned before this migration and would block the NOT NULL.
  await sql`
    DELETE FROM marketplace_staging_card_overrides
    WHERE marketplace_product_id IS NULL
  `.execute(db);

  // 4. Drop the old PK + SKU columns now that everyone's on the new key.
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT IF EXISTS marketplace_staging_card_overrides_pkey
  `.execute(db);
  await sql`DROP INDEX IF EXISTS marketplace_staging_card_overrides_pkey`.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP COLUMN marketplace,
      DROP COLUMN external_id,
      DROP COLUMN finish,
      DROP COLUMN language
  `.execute(db);

  // 5. Make the new column NOT NULL and lock it as the primary key.
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ALTER COLUMN marketplace_product_id SET NOT NULL
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ADD CONSTRAINT marketplace_product_card_overrides_pkey
      PRIMARY KEY (marketplace_product_id)
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ADD CONSTRAINT marketplace_product_card_overrides_product_fk
      FOREIGN KEY (marketplace_product_id)
      REFERENCES marketplace_products(id)
      ON DELETE CASCADE
  `.execute(db);

  // 6. Rename the table.
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      RENAME TO marketplace_product_card_overrides
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE marketplace_product_card_overrides
      RENAME TO marketplace_staging_card_overrides
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ADD COLUMN marketplace text,
      ADD COLUMN external_id integer,
      ADD COLUMN finish text,
      ADD COLUMN language text
  `.execute(db);

  await sql`
    UPDATE marketplace_staging_card_overrides ov
    SET marketplace = mp.marketplace,
        external_id = mp.external_id,
        finish = mp.finish,
        language = mp.language
    FROM marketplace_products mp
    WHERE ov.marketplace_product_id = mp.id
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      ALTER COLUMN marketplace SET NOT NULL,
      ALTER COLUMN external_id SET NOT NULL,
      ALTER COLUMN finish SET NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT marketplace_product_card_overrides_pkey
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP CONSTRAINT marketplace_product_card_overrides_product_fk
  `.execute(db);
  await sql`
    ALTER TABLE marketplace_staging_card_overrides
      DROP COLUMN marketplace_product_id
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_staging_card_overrides_pkey
      ON marketplace_staging_card_overrides (marketplace, external_id, finish, language)
      NULLS NOT DISTINCT
  `.execute(db);
}
