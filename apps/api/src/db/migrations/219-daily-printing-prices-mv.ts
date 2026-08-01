import type { Kysely } from "kysely";
import { sql } from "kysely";

// Give the per-day price walk and the "current value" figure a single source.
//
// Before this migration `mv_latest_printing_prices` picked one SKU per
// (printing, marketplace) with `DISTINCT ON ... ORDER BY (zero_low_cents IS
// NULL), recorded_at DESC`, and `collectionValueTimeSeries` re-implemented the
// same headline CASE by hand with a *different* ordering (no zero_low key,
// grouped per day). Two consequences:
//
//   1. A printing can legitimately have several SKUs bound on one marketplace.
//      The admin mapping UI attaches "bogus" listings on purpose — see
//      computeWeakProductSuggestions in the web app: a Cardmarket SKU whose
//      finish matches no printing on the card is mirrored onto the sibling
//      SKU's printings so its price history isn't orphaned. Neither ordering
//      says which of those SKUs is the price, so the chart and the Stats card
//      disagreed, sometimes by two orders of magnitude (Mind Rune OGN-089
//      priced at the 3.95 foil listing instead of the 0.02 normal one).
//
//   2. Neither ORDER BY is a total order. Sibling SKUs share an exact
//      recorded_at from the batch insert, so the pick is whatever the plan
//      happens to emit first. The daily query is large enough to get a
//      parallel plan and returned a different total on every execution.
//
// Both go away by aggregating instead of picking: the headline for a printing
// is the MIN across its bound SKUs, which is order-independent and matches the
// "buy from the cheapest listing" intent the headline CASE already encodes.
// Empirically MIN agrees with "prefer the SKU whose finish matches the
// printing" on 1329 of the 1345 ambiguous printings, because the bogus
// listings are almost always the expensive side.
//
// The aggregation is three-stage and must stay that way: pick the day's
// snapshot per SKU, carry CardTrader's Zero price forward, then MIN across
// SKUs. A flat MIN over the price table would return each printing's all-time
// floor.
//
// The carry-forward preserves what the old view's leading `(zero_low_cents IS
// NULL)` key did. CardTrader Zero prices exclude the per-seller shipping that
// a raw `low_cents` listing adds, so they're the comparable number and worth
// holding on to when a SKU has no Zero listing on a given day. Today 4509 of
// 4637 CT products have a current Zero price, 71 fall back to an earlier one
// (64 within 29 days, 7 within 54), and 57 have never had one and show
// `low_cents`. Without the carry the chart would jump between two different
// quantities whenever a SKU dropped out of Zero for a day.

const HEADLINE = sql`
  CASE WHEN d.marketplace = 'cardtrader'
       THEN COALESCE(d.zero_carried, d.low_cents)
       WHEN d.marketplace = 'cardmarket'
       THEN COALESCE(d.low_cents, d.market_cents)
       ELSE COALESCE(d.market_cents, d.low_cents)
  END
`;

const LEGACY_HEADLINE = sql`
  CASE WHEN mp.marketplace = 'cardtrader'
       THEN COALESCE(pp.zero_low_cents, pp.low_cents)
       WHEN mp.marketplace = 'cardmarket'
       THEN COALESCE(pp.low_cents, pp.market_cents)
       ELSE COALESCE(pp.market_cents, pp.low_cents)
  END
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  // Stage 1: one row per (SKU, day). Within a day the `(zero_low_cents IS
  // NULL)` key prefers a Zero-bearing snapshot over a later non-Zero one.
  // Stage 2: carry the last known Zero price forward across days, via the
  // gaps-and-islands trick — a running COUNT over a nullable column only
  // increments on non-nulls, so every row shares an island with the most
  // recent non-null before it, and FIRST_VALUE reads that value back. Rows
  // before a SKU's first Zero snapshot get NULL and fall through to low_cents.
  // Stage 3: cheapest bound SKU per (printing, marketplace, day).
  await sql`
    CREATE MATERIALIZED VIEW mv_daily_printing_prices AS
    WITH daily_sku AS (
      SELECT DISTINCT ON (pp.marketplace_product_id, date_trunc('day', pp.recorded_at)::date)
        pp.marketplace_product_id               AS marketplace_product_id,
        mp.marketplace                          AS marketplace,
        date_trunc('day', pp.recorded_at)::date AS day,
        pp.zero_low_cents                       AS zero_low_cents,
        pp.low_cents                            AS low_cents,
        pp.market_cents                         AS market_cents
      FROM marketplace_product_prices pp
      JOIN marketplace_products       mp ON mp.id = pp.marketplace_product_id
      ORDER BY
        pp.marketplace_product_id,
        date_trunc('day', pp.recorded_at)::date,
        (pp.zero_low_cents IS NULL),
        pp.recorded_at DESC
    ),
    islands AS (
      SELECT
        s.*,
        COUNT(s.zero_low_cents) OVER (
          PARTITION BY s.marketplace_product_id
          ORDER BY s.day
          ROWS UNBOUNDED PRECEDING
        ) AS zero_island
      FROM daily_sku s
    ),
    carried AS (
      SELECT
        i.marketplace_product_id,
        i.marketplace,
        i.day,
        i.low_cents,
        i.market_cents,
        FIRST_VALUE(i.zero_low_cents) OVER (
          PARTITION BY i.marketplace_product_id, i.zero_island
          ORDER BY i.day
        ) AS zero_carried
      FROM islands i
    )
    SELECT
      mpv.printing_id AS printing_id,
      d.marketplace   AS marketplace,
      d.day           AS day,
      MIN(${HEADLINE})::int AS headline_cents
    FROM carried d
    JOIN marketplace_product_variants mpv
      ON mpv.marketplace_product_id = d.marketplace_product_id
    WHERE ${HEADLINE} IS NOT NULL
    GROUP BY mpv.printing_id, d.marketplace, d.day
    WITH NO DATA
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_daily_printing_prices_pk
      ON mv_daily_printing_prices (printing_id, marketplace, day)
  `.execute(db);

  // Serves both the per-printing walk in collectionValueTimeSeries and the
  // latest-day DISTINCT ON below.
  await sql`
    CREATE INDEX idx_mv_daily_printing_prices_latest
      ON mv_daily_printing_prices (marketplace, printing_id, day DESC)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`.execute(db);

  // Redefine the latest view on top of the daily one so "today's chart point"
  // and "the Stats card figure" are the same row rather than two expressions
  // kept in sync by hand. One row per group at every stage, so no ties.
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (d.printing_id, d.marketplace)
      d.printing_id    AS printing_id,
      d.marketplace    AS marketplace,
      d.headline_cents AS headline_cents
    FROM mv_daily_printing_prices d
    ORDER BY d.printing_id, d.marketplace, d.day DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_latest_printing_prices`.execute(db);
  await sql`DROP MATERIALIZED VIEW IF EXISTS mv_daily_printing_prices`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW mv_latest_printing_prices AS
    SELECT DISTINCT ON (mpv.printing_id, mp.marketplace)
      mpv.printing_id      AS printing_id,
      mp.marketplace       AS marketplace,
      ${LEGACY_HEADLINE}   AS headline_cents
    FROM marketplace_product_variants mpv
    JOIN marketplace_products         mp ON mp.id = mpv.marketplace_product_id
    JOIN marketplace_product_prices   pp ON pp.marketplace_product_id = mp.id
    WHERE ${LEGACY_HEADLINE} IS NOT NULL
    ORDER BY mpv.printing_id, mp.marketplace, (pp.zero_low_cents IS NULL), pp.recorded_at DESC
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk
      ON mv_latest_printing_prices (printing_id, marketplace)
  `.execute(db);

  await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`.execute(db);
}
