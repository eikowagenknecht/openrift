import type { Kysely } from "kysely";
import { sql } from "kysely";

// Allows `marketplace_product_variants.language` to be NULL to represent
// "any language" — used by marketplaces that only expose cross-language
// aggregate prices (Cardmarket). An exact-language variant keeps its code
// (e.g. "EN", "ZH"); an aggregate variant sets language to NULL and the
// query layer does a sibling fan-out so every language of a card sees it.
//
// Because Postgres 15+ supports NULLS NOT DISTINCT on unique indexes, the
// uniqueness `(marketplace_product_id, finish, language)` still holds —
// two (..., NULL) rows are treated as a collision.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop the existing NOT NULL DEFAULT 'EN' so NULL becomes valid.
  await sql`ALTER TABLE marketplace_product_variants ALTER COLUMN language DROP NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_product_variants ALTER COLUMN language DROP DEFAULT`.execute(
    db,
  );

  // Replace the unique constraint with a NULLS NOT DISTINCT unique index.
  // Constraints backed by indexes with NULLS NOT DISTINCT have to be created
  // as indexes first on older Postgres; on 18+ we can use the constraint form
  // directly but keeping it as an index is also fine and keeps this portable.
  await sql`
    ALTER TABLE marketplace_product_variants
      DROP CONSTRAINT marketplace_product_variants_product_finish_language_key
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX marketplace_product_variants_product_finish_language_key
      ON marketplace_product_variants (marketplace_product_id, finish, language)
      NULLS NOT DISTINCT
  `.execute(db);

  // Backfill: cardmarket price guides are cross-language aggregates. Any
  // existing cardmarket variants therefore represent "any language", not
  // the hardcoded "EN" they were stored with.
  await sql`
    UPDATE marketplace_product_variants mpv
    SET language = NULL
    FROM marketplace_products mp
    WHERE mp.id = mpv.marketplace_product_id
      AND mp.marketplace = 'cardmarket'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse the backfill: force any NULL rows back to 'EN' so the NOT NULL
  // constraint can be re-applied cleanly. This is lossy in the technical
  // sense (we forget which rows were "aggregate" vs "exact English") but
  // preserves the pre-079 shape.
  await sql`UPDATE marketplace_product_variants SET language = 'EN' WHERE language IS NULL`.execute(
    db,
  );

  await sql`DROP INDEX marketplace_product_variants_product_finish_language_key`.execute(db);

  await sql`
    ALTER TABLE marketplace_product_variants
      ADD CONSTRAINT marketplace_product_variants_product_finish_language_key
      UNIQUE (marketplace_product_id, finish, language)
  `.execute(db);

  await sql`ALTER TABLE marketplace_product_variants ALTER COLUMN language SET DEFAULT 'EN'`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_product_variants ALTER COLUMN language SET NOT NULL`.execute(
    db,
  );
}
