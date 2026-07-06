import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Keep a renamed friend group reachable under its old slug.
 *
 * `/groups/$slug` URLs are bookmarked and embedded in trade emails that stay
 * valid for 7 days, but a slug rename used to 404 all of them immediately.
 * `previous_slug` records the slug a group last renamed away from; the
 * viewer-facing lookups fall back to it (current slugs always win) and the
 * web routes then redirect to the canonical slug. Only the most recent old
 * slug is kept — a second rename overwrites the alias.
 *
 * @returns Resolves once the column, CHECK, and partial index exist.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE friend_groups
      ADD COLUMN previous_slug text,
      ADD CONSTRAINT chk_friend_groups_previous_slug CHECK (
        previous_slug IS NULL OR previous_slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'
      );

    CREATE INDEX idx_friend_groups_previous_slug
      ON friend_groups (previous_slug)
      WHERE previous_slug IS NOT NULL
  `.execute(db);
}

/** @returns Resolves once the column and its index are dropped. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS idx_friend_groups_previous_slug;
    ALTER TABLE friend_groups DROP COLUMN IF EXISTS previous_slug
  `.execute(db);
}
