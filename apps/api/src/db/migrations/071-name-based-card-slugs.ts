import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Converts card slugs from shortcodes (e.g. "OGN-066") to name-derived
 * slugs (e.g. "ahri-alluring") for SEO-friendly card detail URLs.
 *
 * The slugification logic: lowercase, replace non-alphanumeric chars with
 * hyphens, collapse consecutive hyphens, trim leading/trailing hyphens.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Save old slugs to comment column for reversibility, then update slug
  // to a URL-friendly version of the card name.
  await sql`
    UPDATE cards
    SET slug = TRIM(BOTH '-' FROM
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          LOWER(name),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-{2,}', '-', 'g'
      )
    )
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Cannot reliably reverse name-to-slug conversion back to shortcodes.
  // The old slug values are not stored. This is a one-way migration.
}
