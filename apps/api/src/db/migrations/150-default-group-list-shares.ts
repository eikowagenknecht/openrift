import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Group list-visibility becomes opt-out (amends ADR-013): every member's
 * wish/trade lists are shared with all of their groups by default, and the
 * app now creates share rows automatically on list creation and group join.
 * This backfills the rows for existing memberships so groups that never
 * understood the manual share step start seeing matches.
 *
 * `organize` lists stay opt-in and are not touched. Existing shares are
 * preserved (`ON CONFLICT DO NOTHING` keeps their original `shared_at`).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO friend_group_list_shares (group_id, list_id, user_id)
    SELECT m.group_id, l.id, m.user_id
    FROM friend_group_members m
    JOIN lists l ON l.user_id = m.user_id
    WHERE l.intent IN ('wish', 'trade')
    ON CONFLICT (group_id, list_id) DO NOTHING
  `.execute(db);
}

/**
 * Irreversible by design: backfilled rows are indistinguishable from shares
 * users created manually, so deleting them would destroy explicit opt-ins.
 */
// oxlint-disable-next-line no-empty-function -- intentional no-op, see above
export async function down(_db: Kysely<unknown>): Promise<void> {}
