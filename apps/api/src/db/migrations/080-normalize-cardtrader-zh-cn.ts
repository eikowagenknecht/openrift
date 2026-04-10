import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Backfill CardTrader staging rows written before `normalizeCtLanguage` landed.
 *
 * The ingest boundary now normalizes CardTrader's `zh-CN` code to `ZH` so
 * staging rows line up with our printings. Historical rows still carry the
 * pre-normalization value and, because the mapping overview dedupes by
 * (external_id, finish, language), those stale rows surface as phantom
 * duplicate products in the admin UI.
 *
 * Any row at `(marketplace, external_id, finish, recorded_at)` that already
 * has a normalized `ZH` sibling is dropped first to avoid violating the
 * unique constraint; the remaining `ZH-CN` rows are then rewritten to `ZH`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM marketplace_staging zhcn
    USING marketplace_staging zh
    WHERE zhcn.marketplace = 'cardtrader'
      AND zhcn.language = 'ZH-CN'
      AND zh.marketplace = 'cardtrader'
      AND zh.language = 'ZH'
      AND zh.external_id = zhcn.external_id
      AND zh.finish = zhcn.finish
      AND zh.recorded_at = zhcn.recorded_at
  `.execute(db);

  await sql`
    UPDATE marketplace_staging
    SET language = 'ZH'
    WHERE marketplace = 'cardtrader'
      AND language = 'ZH-CN'
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Not reversible — the original `ZH-CN` vs `ZH` split cannot be recovered
  // after merging; both values now point at the same staging row.
}
