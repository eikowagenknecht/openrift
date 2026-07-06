import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Rebalance organization ownership when the owner's account is deleted,
 * instead of cascading the organization away.
 *
 * `organizations.owner_user_id` is `ON DELETE CASCADE`, so an owner deleting
 * their account silently destroyed the whole organization — other members'
 * memberships and the org's deck-check API keys included — even when
 * co-owners existed. Migration 186 patched the tournament hop of this hole
 * (org-hosted tournaments now detach); this closes the org itself, mirroring
 * `rebalance_friend_group_owner` (134).
 *
 * A BEFORE DELETE trigger on `users` promotes the best surviving member of
 * each owned org (owner > manager > judge role, oldest first) to
 * `owner_user_id` before the cascade fires; the FK then no longer references
 * the deleted user, so the org survives (the `set_updated_at` trigger stamps
 * the change). An org with no other members is still cascade-deleted — it
 * dies with its last member. API-level "leave org" flows are unaffected:
 * they are guarded by the keep-at-least-one-owner check and never delete the
 * users row.
 *
 * @returns Resolves once the trigger and function exist.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE FUNCTION rebalance_organization_owner() RETURNS trigger AS $$
    DECLARE
      org RECORD;
      successor RECORD;
    BEGIN
      FOR org IN SELECT id FROM organizations WHERE owner_user_id = OLD.id LOOP
        SELECT user_id INTO successor
        FROM organization_members
        WHERE org_id = org.id AND user_id <> OLD.id
        ORDER BY (role = 'owner') DESC, (role = 'manager') DESC, joined_at ASC
        LIMIT 1;

        IF FOUND THEN
          UPDATE organizations
             SET owner_user_id = successor.user_id
           WHERE id = org.id;
          UPDATE organization_members
             SET role = 'owner'
           WHERE org_id = org.id AND user_id = successor.user_id;
        END IF;
      END LOOP;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_rebalance_organization_owner
      BEFORE DELETE ON users
      FOR EACH ROW EXECUTE FUNCTION rebalance_organization_owner()
  `.execute(db);
}

/**
 * @returns Resolves once the trigger and function are dropped, restoring the
 *   plain owner cascade.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_rebalance_organization_owner ON users`.execute(db);
  await sql`DROP FUNCTION IF EXISTS rebalance_organization_owner()`.execute(db);
}
