import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Carries printing `size` and distribution-channel slugs through the candidate
 * pipeline (ADR-008/036).
 *
 * `candidate_printings` previously had no size or distribution-channel columns,
 * so a user submission or admin upload could not record either and nothing
 * could apply them on accept. These two columns close that gap: `size` mirrors
 * `printings.size` (nullable; accept defaults NULL to 'standard'), and
 * `distribution_channel_slugs` mirrors how `marker_slugs` already rides along
 * as a slug array (NOT NULL, `'{}'` default) so accept can replay it onto the
 * accepted printing's `printing_distribution_channels` join.
 *
 * @returns Resolves once both columns are in place.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE candidate_printings
      ADD COLUMN size TEXT CHECK (size <> ''),
      ADD COLUMN distribution_channel_slugs TEXT[] NOT NULL DEFAULT '{}'
  `.execute(db);
}

/**
 * @returns Resolves once both columns are removed.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE candidate_printings
      DROP COLUMN distribution_channel_slugs,
      DROP COLUMN size
  `.execute(db);
}
