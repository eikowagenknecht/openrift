import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Rename the `ZH` language to `SC`, the code Riot prints on the physical cards
 * for Simplified Chinese.
 *
 * `ZH` was always a simplified-Chinese row wearing a code that spans both
 * scripts, which forced every boundary adapter to assume "our ZH means
 * simplified" (Cardmarket id 6, CardTrader's `zh-CN`). `SC` says it outright.
 *
 * `languages.code` is the PK, so the rename has to reach four tables. Two are
 * real FKs: `keyword_translations` was already `ON UPDATE CASCADE`, and this
 * migration adds the same to `printings_language_fk` (previously NO ACTION,
 * which would have rejected the UPDATE outright). Cascading beats the
 * insert-new/backfill/delete-old alternative: deleting the old row would fire
 * `keyword_translations`' `ON DELETE CASCADE` and silently take every Chinese
 * keyword translation with it, and a fresh row would lose the chip color that
 * `203-language-color` backfilled.
 *
 * The other two carry `language` with no FK at all, so Postgres will not follow
 * the rename and they are backfilled by hand: `candidate_printings` and
 * `marketplace_products`. Stale codes there fail silently (candidates stop
 * matching printings at review time; products stop joining and their prices
 * vanish from the UI), which is why they are handled here rather than left to
 * the next ingest.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Cascade the PK rename into `printings`. Without this the UPDATE below
  // fails on the FK; with it, both FK-backed tables follow automatically.
  await sql`ALTER TABLE printings DROP CONSTRAINT printings_language_fk`.execute(db);
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT printings_language_fk
        FOREIGN KEY (language) REFERENCES languages(code) ON UPDATE CASCADE
  `.execute(db);

  // Cascades to `printings` and `keyword_translations`; keeps sort_order and
  // the chip color from 203. The name follows the code: "Chinese" was as
  // script-ambiguous as `ZH` was.
  await sql`
    UPDATE languages
    SET code = 'SC', name = 'Simplified Chinese'
    WHERE code = 'ZH'
  `.execute(db);

  // No FK: hand-backfill. Defensive dedupe first — `marketplace_products_sku_key`
  // is UNIQUE (marketplace, external_id, finish, language) NULLS NOT DISTINCT,
  // so a pre-existing SC row at the same SKU would collide with the rewrite.
  // Prices are re-fetched on the next refresh, so dropping the stale duplicate
  // is lossless.
  await sql`
    DELETE FROM marketplace_products zh
    USING marketplace_products sc
    WHERE zh.language = 'ZH'
      AND sc.language = 'SC'
      AND sc.marketplace = zh.marketplace
      AND sc.external_id = zh.external_id
      AND sc.finish = zh.finish
  `.execute(db);
  await sql`UPDATE marketplace_products SET language = 'SC' WHERE language = 'ZH'`.execute(db);

  // No FK: hand-backfill.
  await sql`UPDATE candidate_printings SET language = 'SC' WHERE language = 'ZH'`.execute(db);

  // `user_preferences.data->'languages'` is a jsonb array of codes with no
  // schema-level trace of the FK. A stale "ZH" here matches no printing, so the
  // user's card grid would come up empty with an active filter and no error.
  // (localStorage holds the same array and can't be reached from a migration —
  // `sanitize-preferences.ts` remaps it on read.)
  await sql`
    UPDATE user_preferences
    SET data = jsonb_set(
      data,
      '{languages}',
      (
        SELECT jsonb_agg(CASE WHEN elem = '"ZH"'::jsonb THEN '"SC"'::jsonb ELSE elem END)
        FROM jsonb_array_elements(data -> 'languages') AS elem
      )
    )
    WHERE data -> 'languages' @> '["ZH"]'::jsonb
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE user_preferences
    SET data = jsonb_set(
      data,
      '{languages}',
      (
        SELECT jsonb_agg(CASE WHEN elem = '"SC"'::jsonb THEN '"ZH"'::jsonb ELSE elem END)
        FROM jsonb_array_elements(data -> 'languages') AS elem
      )
    )
    WHERE data -> 'languages' @> '["SC"]'::jsonb
  `.execute(db);

  await sql`UPDATE candidate_printings SET language = 'ZH' WHERE language = 'SC'`.execute(db);
  // The dedupe DELETE in `up` is not restored — those rows were redundant
  // duplicates of a surviving SC row and the next price refresh re-creates them.
  await sql`UPDATE marketplace_products SET language = 'ZH' WHERE language = 'SC'`.execute(db);

  await sql`
    UPDATE languages
    SET code = 'ZH', name = 'Chinese'
    WHERE code = 'SC'
  `.execute(db);

  await sql`ALTER TABLE printings DROP CONSTRAINT printings_language_fk`.execute(db);
  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT printings_language_fk
        FOREIGN KEY (language) REFERENCES languages(code)
  `.execute(db);
}
