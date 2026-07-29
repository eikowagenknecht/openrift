import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Make `norm_name` script-aware.
 *
 * The three trigger functions computing `norm_name` used
 * `lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))`, which deletes every
 * non-Latin character. A name written entirely in Chinese, Japanese, Korean,
 * Cyrillic or Greek therefore normalized to `''`, and since `norm_name` is the
 * grouping and matching key, all such names collapsed into one bucket — the
 * admin candidates list rendered seven unrelated legends as a single row.
 *
 * `[[:alnum:]]` keeps letters and digits of any script, matching the TS
 * `normalizeNameForMatching` (`[^\p{L}\p{Nd}\p{Nl}]`) character for character;
 * the parity is asserted by `norm-name-parity.integration.test.ts`. Note the
 * `lower()` moves *inside* `regexp_replace` — casing can introduce a combining
 * mark (`İ` → `i` + U+0307) that the strip has to remove afterwards, and TS
 * lowercases first for the same reason.
 *
 * Existing keys are unaffected except where a name carries a non-ASCII letter,
 * so the backfill is a no-op for pure-ASCII catalogues. `card_name_aliases`
 * is written by the application rather than a trigger, but its `norm_name` is
 * the table's primary key, so it is re-keyed here too — conflicting rows are
 * dropped rather than failing the migration (they are duplicates by
 * definition: two aliases that now normalize alike point at the same key).
 */

/**
 * The Postgres mirror of `normalizeNameForMatching`.
 * @returns A SQL fragment normalizing `column` to its match key.
 */
const NORM = (column: string) =>
  sql`regexp_replace(lower(${sql.ref(column)}), '[^[:alnum:]]', '', 'g')`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION candidate_cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := regexp_replace(lower(NEW.name), '[^[:alnum:]]', '', 'g');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := regexp_replace(lower(NEW.name), '[^[:alnum:]]', '', 'g');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION marketplace_product_compute_norm_name(product_name text)
    RETURNS text AS $$
      SELECT regexp_replace(lower(product_name), '[^[:alnum:]]', '', 'g')
    $$ LANGUAGE sql IMMUTABLE
  `.execute(db);

  // Backfill. Only rows whose key actually changes are touched, so the UPDATE
  // stays cheap and the `updated_at` triggers don't fire across the catalogue.
  await sql`UPDATE cards SET norm_name = ${NORM("name")} WHERE norm_name IS DISTINCT FROM ${NORM("name")}`.execute(
    db,
  );

  await sql`
    UPDATE candidate_cards SET norm_name = ${NORM("name")}
    WHERE norm_name IS DISTINCT FROM ${NORM("name")}
  `.execute(db);

  await sql`
    UPDATE marketplace_products SET norm_name = ${NORM("product_name")}
    WHERE norm_name IS DISTINCT FROM ${NORM("product_name")}
  `.execute(db);

  // Aliases are keyed by norm_name (primary key). Re-normalizing an alias can
  // collide with an existing row; drop the loser instead of aborting.
  await sql`
    DELETE FROM card_name_aliases a
    WHERE regexp_replace(lower(a.norm_name), '[^[:alnum:]]', '', 'g') IS DISTINCT FROM a.norm_name
      AND EXISTS (
        SELECT 1 FROM card_name_aliases b
        WHERE b.norm_name = regexp_replace(lower(a.norm_name), '[^[:alnum:]]', '', 'g')
      )
  `.execute(db);

  await sql`
    UPDATE card_name_aliases SET norm_name = regexp_replace(lower(norm_name), '[^[:alnum:]]', '', 'g')
    WHERE norm_name IS DISTINCT FROM regexp_replace(lower(norm_name), '[^[:alnum:]]', '', 'g')
  `.execute(db);

  // An alias that normalized away entirely carries no matching signal and its
  // empty key would collide with every other such alias.
  await sql`DELETE FROM card_name_aliases WHERE norm_name = ''`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restores the ASCII-only functions. The backfilled keys are not reverted —
  // the trigger rewrites each row's key on its next name update, and a blanket
  // re-strip would re-create the very collisions this migration removed.
  await sql`
    CREATE OR REPLACE FUNCTION candidate_cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION cards_set_norm_name() RETURNS trigger AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION marketplace_product_compute_norm_name(product_name text)
    RETURNS text AS $$
      SELECT lower(regexp_replace(product_name, '[^a-zA-Z0-9]', '', 'g'))
    $$ LANGUAGE sql IMMUTABLE
  `.execute(db);
}
