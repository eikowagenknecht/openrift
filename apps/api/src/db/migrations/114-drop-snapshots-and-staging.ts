import type { Kysely } from "kysely";
import { sql } from "kysely";

// Final phase of the unify-marketplace-prices refactor: drop the legacy
// `marketplace_snapshots` and `marketplace_staging` tables. All readers and
// writers were repointed at `marketplace_products` + `marketplace_product_prices`
// in earlier phases, and the trigram-indexed `norm_name` lives on
// `marketplace_products` since migration 112.
//
// `down` is intentionally lossy — the dropped data is not recoverable from
// `marketplace_product_prices` alone (snapshots split history per-variant;
// staging carried `created_at` plus the synthetic `norm_name` index that
// migration 112 mirrored onto products). Use the `down` only for testing
// schema reversibility, not for production rollback.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS marketplace_snapshots`.execute(db);

  await sql`DROP TRIGGER IF EXISTS trg_marketplace_staging_set_norm_name ON marketplace_staging`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS marketplace_staging_set_norm_name()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS marketplace_staging_compute_norm_name(text)`.execute(db);
  await sql`DROP TABLE IF EXISTS marketplace_staging`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate empty shells so the schema dump matches what migration 109 left
  // behind; data is not restored.
  await sql`
    CREATE TABLE marketplace_snapshots (
      id uuid DEFAULT uuidv7() PRIMARY KEY,
      variant_id uuid NOT NULL REFERENCES marketplace_product_variants(id) ON DELETE CASCADE,
      recorded_at timestamp with time zone NOT NULL DEFAULT now(),
      market_cents integer,
      low_cents integer,
      mid_cents integer,
      high_cents integer,
      trend_cents integer,
      avg1_cents integer,
      avg7_cents integer,
      avg30_cents integer,
      zero_low_cents integer,
      UNIQUE (variant_id, recorded_at)
    )
  `.execute(db);
  await sql`
    CREATE INDEX idx_marketplace_snapshots_variant_id_recorded_at
      ON marketplace_snapshots (variant_id, recorded_at)
  `.execute(db);

  await sql`
    CREATE TABLE marketplace_staging (
      id uuid DEFAULT uuidv7() PRIMARY KEY,
      marketplace text NOT NULL,
      external_id integer NOT NULL,
      group_id integer NOT NULL,
      product_name text NOT NULL,
      finish text NOT NULL,
      language text,
      recorded_at timestamp with time zone NOT NULL,
      market_cents integer,
      low_cents integer,
      mid_cents integer,
      high_cents integer,
      trend_cents integer,
      avg1_cents integer,
      avg7_cents integer,
      avg30_cents integer,
      zero_low_cents integer,
      norm_name text NOT NULL DEFAULT '',
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX marketplace_staging_marketplace_external_id_finish_language_rec
      ON marketplace_staging (marketplace, external_id, finish, language, recorded_at)
      NULLS NOT DISTINCT
  `.execute(db);
}
