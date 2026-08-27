import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Clears the rows left behind by invite-by-email, which was removed in the
 * commit before this one.
 *
 * `friend_group_invites.direction` carries two values. `'request'` is a person
 * asking to join through the group's code and stays exactly as it was;
 * `'invite'` was an admin adding someone by email address, and that route was
 * the only thing that ever wrote one. With the route gone, no `'invite'` row
 * can appear again, and the ones already stored are unreachable: the surfaces
 * that offered them (the accept/decline card, the header badge) go in the same
 * change.
 *
 * They are deleted rather than left to rot because a stale row actively blocks
 * its own user. `UNIQUE (group_id, user_id)` covers both directions at once,
 * and `createInvite` inserts `ON CONFLICT DO NOTHING`, so someone holding an
 * `'invite'` row for a group who then tries to join it by code has their
 * request silently swallowed: no row is written, no admin ever sees them, and
 * the UI reports nothing wrong.
 *
 * The column and its CHECK stay. `'request'` still needs a discriminant if
 * invites ever come back in a form that actually sends mail.
 *
 * @returns Resolves once the unreachable invite rows are gone.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM friend_group_invites WHERE direction = 'invite'`.execute(db);
}

/**
 * Deleted rows are not recoverable, and the feature that produced them no
 * longer exists, so rolling back restores the schema (unchanged) and nothing
 * else.
 *
 * @returns Resolves immediately.
 */
export function down(): Promise<void> {
  return Promise.resolve();
}
