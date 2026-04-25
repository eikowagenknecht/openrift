import type { Kysely } from "kysely";
import { sql } from "kysely";

// Unify marketplace_staging + marketplace_snapshots into one price table keyed
// on marketplace_product_id. Today prices live in two places:
//
//   marketplace_staging   — every fetched SKU, keyed (marketplace, external_id,
//                           finish, language, recorded_at). Duplicates every
//                           SKU column from marketplace_products.
//   marketplace_snapshots — bound variants only, keyed (variant_id, recorded_at).
//                           Duplicates price data across sibling variants of
//                           the same product (one row per (variant, recorded_at)
//                           even when 3 printings share the same marketplace SKU).
//
// That split is responsible for two bugs: (a) history is lost when a second
// printing is bound to an existing product (the new mpv row starts with no
// snapshots because the staging row was deleted on the first assign), and
// (b) per-fetch storage grows as N_variants × N_fetches rather than
// N_products × N_fetches.
//
// Phase 1 of the unification adds a single SKU-keyed prices table and
// backfills it from both sources. Old tables stay live and dual-written;
// writers + readers are switched in later phases. Phase 4 drops the old
// tables.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE marketplace_product_prices (
      marketplace_product_id uuid NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
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
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY (marketplace_product_id, recorded_at),
      CONSTRAINT chk_marketplace_product_prices_market_cents_non_negative CHECK (market_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_low_cents_non_negative CHECK (low_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_mid_cents_non_negative CHECK (mid_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_high_cents_non_negative CHECK (high_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_trend_cents_non_negative CHECK (trend_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_avg1_cents_non_negative CHECK (avg1_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_avg7_cents_non_negative CHECK (avg7_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_avg30_cents_non_negative CHECK (avg30_cents >= 0),
      CONSTRAINT chk_marketplace_product_prices_zero_low_cents_non_negative CHECK (zero_low_cents >= 0)
    )
  `.execute(db);

  // Backfill pass 1: staging rows. Staging is SKU-grained, so the join to
  // products uses (marketplace, external_id, finish, language). Migration 106
  // made staging.language NULL for CM/TCG to match marketplace_products, so
  // IS NOT DISTINCT FROM lines up both sides.
  await sql`
    INSERT INTO marketplace_product_prices (
      marketplace_product_id, recorded_at, market_cents, low_cents, mid_cents,
      high_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, zero_low_cents
    )
    SELECT
      mp.id,
      s.recorded_at,
      s.market_cents,
      s.low_cents,
      s.mid_cents,
      s.high_cents,
      s.trend_cents,
      s.avg1_cents,
      s.avg7_cents,
      s.avg30_cents,
      s.zero_low_cents
    FROM marketplace_staging s
    JOIN marketplace_products mp
      ON mp.marketplace = s.marketplace
      AND mp.external_id = s.external_id
      AND mp.finish = s.finish
      AND mp.language IS NOT DISTINCT FROM s.language
    ON CONFLICT (marketplace_product_id, recorded_at) DO NOTHING
  `.execute(db);

  // Backfill pass 2: snapshots. Join through variants to find the product id.
  // Sibling variants of the same product carry duplicate snapshot rows with
  // identical prices (the refresh pipeline fans out to every variant), so a
  // DISTINCT ON + ORDER BY collapses duplicates deterministically before the
  // insert. ON CONFLICT DO NOTHING so any row already covered by staging
  // (pass 1, staging wins) is left alone.
  await sql`
    INSERT INTO marketplace_product_prices (
      marketplace_product_id, recorded_at, market_cents, low_cents, mid_cents,
      high_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents, zero_low_cents
    )
    SELECT DISTINCT ON (mpv.marketplace_product_id, snap.recorded_at)
      mpv.marketplace_product_id,
      snap.recorded_at,
      snap.market_cents,
      snap.low_cents,
      snap.mid_cents,
      snap.high_cents,
      snap.trend_cents,
      snap.avg1_cents,
      snap.avg7_cents,
      snap.avg30_cents,
      snap.zero_low_cents
    FROM marketplace_snapshots snap
    JOIN marketplace_product_variants mpv ON mpv.id = snap.variant_id
    ORDER BY mpv.marketplace_product_id, snap.recorded_at, snap.id
    ON CONFLICT (marketplace_product_id, recorded_at) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE marketplace_product_prices`.execute(db);
}
