import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // pg_trgm powers the GIN index used for substring fuzzy matching of
  // marketplace product names against card aliases.
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // Computes the same lower(regexp_replace(..., '[^a-zA-Z0-9]', '', 'g'))
  // form used by card_name_aliases.norm_name, so the two are directly comparable.
  await sql`
    CREATE OR REPLACE FUNCTION marketplace_staging_compute_norm_name(product_name text)
    RETURNS text AS $$
      SELECT lower(regexp_replace(product_name, '[^a-zA-Z0-9]', '', 'g'))
    $$ LANGUAGE sql IMMUTABLE
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_staging
      ADD COLUMN norm_name text NOT NULL DEFAULT ''
  `.execute(db);

  await sql`
    UPDATE marketplace_staging
    SET norm_name = marketplace_staging_compute_norm_name(product_name)
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION marketplace_staging_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := marketplace_staging_compute_norm_name(NEW.product_name);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_marketplace_staging_set_norm_name
      BEFORE INSERT OR UPDATE OF product_name ON marketplace_staging
      FOR EACH ROW EXECUTE FUNCTION marketplace_staging_set_norm_name()
  `.execute(db);

  // GIN trigram index accelerates both prefix (LIKE 'alias%') and substring
  // (LIKE '%alias%') matches against norm_name in stagingCandidatesForCard.
  await sql`
    CREATE INDEX idx_marketplace_staging_norm_name_trgm
      ON marketplace_staging USING gin (norm_name gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_marketplace_staging_norm_name_trgm`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_marketplace_staging_set_norm_name ON marketplace_staging`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS marketplace_staging_set_norm_name()`.execute(db);
  await sql`ALTER TABLE marketplace_staging DROP COLUMN IF EXISTS norm_name`.execute(db);
  await sql`DROP FUNCTION IF EXISTS marketplace_staging_compute_norm_name(text)`.execute(db);
  // pg_trgm extension intentionally left installed — other migrations may rely on it later.
}
