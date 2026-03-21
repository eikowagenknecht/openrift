import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Remove the rarity segment from printing slugs.
 *
 * Old slug format: {shortCode}:{rarity}:{finish}:{promo}
 * New slug format: {shortCode}:{finish}:{promo}
 *
 * Rehosted image file paths are NOT updated here — use the admin images page
 * "Rename Files" function to batch-rename files on disk and update URLs.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE printings
    SET slug =
      split_part(slug, ':', 1) || ':' ||
      split_part(slug, ':', 3) || ':' ||
      split_part(slug, ':', 4)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Restore rarity into slug from the printings.rarity column.
  await sql`
    UPDATE printings
    SET slug =
      split_part(slug, ':', 1) || ':' ||
      lower(rarity) || ':' ||
      split_part(slug, ':', 2) || ':' ||
      split_part(slug, ':', 3)
  `.execute(db);
}
