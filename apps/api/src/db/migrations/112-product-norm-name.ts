import type { Kysely } from "kysely";
import { sql } from "kysely";

// Move the trigram-indexed `norm_name` column from `marketplace_staging` to
// `marketplace_products`. Phase 4 of the unify-marketplace-prices refactor
// retires the staging table; the GIN trigram index that backs the admin fuzzy
// match against product names lives on staging today, so we mirror it onto
// products before swapping readers + dropping staging.
//
// The compute function name is reused from migration 089 (renamed) so the
// trigger expression matches what readers expect.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // Rename the existing compute function to a product-scoped name. It still
  // does the same thing — `lower(regexp_replace(name, '[^a-zA-Z0-9]', ''))`.
  await sql`
    CREATE OR REPLACE FUNCTION marketplace_product_compute_norm_name(product_name text)
    RETURNS text AS $$
      SELECT lower(regexp_replace(product_name, '[^a-zA-Z0-9]', '', 'g'))
    $$ LANGUAGE sql IMMUTABLE
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_products
      ADD COLUMN norm_name text NOT NULL DEFAULT ''
  `.execute(db);

  await sql`
    UPDATE marketplace_products
    SET norm_name = marketplace_product_compute_norm_name(product_name)
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION marketplace_products_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := marketplace_product_compute_norm_name(NEW.product_name);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_marketplace_products_set_norm_name
      BEFORE INSERT OR UPDATE OF product_name ON marketplace_products
      FOR EACH ROW EXECUTE FUNCTION marketplace_products_set_norm_name()
  `.execute(db);

  await sql`
    CREATE INDEX idx_marketplace_products_norm_name_trgm
      ON marketplace_products USING gin (norm_name gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_marketplace_products_norm_name_trgm`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_marketplace_products_set_norm_name ON marketplace_products`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS marketplace_products_set_norm_name()`.execute(db);
  await sql`ALTER TABLE marketplace_products DROP COLUMN IF EXISTS norm_name`.execute(db);
  await sql`DROP FUNCTION IF EXISTS marketplace_product_compute_norm_name(text)`.execute(db);
  // pg_trgm extension intentionally left installed.
}
