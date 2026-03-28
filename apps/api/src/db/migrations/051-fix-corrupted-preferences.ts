import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Fix preferences rows corrupted by double-serialization.
 *
 * postgres.js under Bun returns jsonb as a string. The old code spread that
 * string (`{...current, ...incoming}`), which turned each character into a
 * numbered key ("0", "1", …). Each PATCH save grew the blob ~10× until some
 * rows reached 65 MB, choking the API server.
 *
 * Any row whose `data` exceeds 1 KB is corrupted beyond recovery — reset it
 * to defaults so the user gets a working (if default) experience.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Reset corrupted rows to defaults
  await sql`
    UPDATE user_preferences
    SET data = '{"showImages":true,"fancyFan":true,"foilEffect":"animated","cardTilt":true,"visibleFields":{"number":true,"title":true,"type":true,"rarity":true,"price":true},"theme":"light","marketplaceOrder":["tcgplayer","cardmarket","cardtrader"]}'::jsonb
    WHERE length(data::text) > 1000
  `.execute(db);

  // Prevent this from ever happening again — 8 KB is generous for a
  // preferences object that should be ~200 bytes.
  await sql`
    ALTER TABLE user_preferences
    ADD CONSTRAINT user_preferences_data_max_size
    CHECK (length(data::text) <= 8192)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE user_preferences
    DROP CONSTRAINT IF EXISTS user_preferences_data_max_size
  `.execute(db);
}
