import type { Kysely } from "kysely";
import { sql } from "kysely";

// Ownership of an organization is now derived from `organization_members.role`
// alone. `organizations.owner_user_id` was a "primary owner" pointer layered on
// top of the roles; permission checks always read the role, several owners were
// already the intended model (migration 249), and the pointer could drift from
// the roles it summarized — a role update that demoted the pointed-at member
// left it naming a non-owner while someone else passed every owner check.
//
// What replaces the pointer's one guarantee (migration 249's deferred FK made
// it name a real member):
//
//   1. `assert_organization_has_owner()`, a deferred constraint trigger on
//      both tables (the migration-193 pattern): at commit, every organization
//      row must have at least one `role = 'owner'` member. Fired per affected
//      org on organizations INSERT and on organization_members DELETE / role
//      UPDATE. Org deletion passes because the check first confirms the org
//      row still exists; member rows cascading away with their org are fine.
//
//   2. `rebalance_organization_owner()` now keys on the *role*, not the
//      pointer: when a deleted user was an org's last owner, the best
//      surviving member (manager first, then oldest join) is promoted; when
//      no member survives, the org is deleted outright — previously the
//      `organizations.owner_user_id → users` CASCADE did that implicitly.
//
// The app-level `assertNotLastOwner` guard stays: it turns the would-be
// constraint error into a friendly 400 before the write.
const REBALANCE_FUNCTION = sql`
  CREATE OR REPLACE FUNCTION rebalance_organization_owner() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    org RECORD;
    successor RECORD;
  BEGIN
    FOR org IN
      SELECT om.org_id AS id FROM organization_members om
      WHERE om.user_id = OLD.id AND om.role = 'owner'
        AND NOT EXISTS (
          SELECT 1 FROM organization_members co
          WHERE co.org_id = om.org_id AND co.user_id <> OLD.id AND co.role = 'owner'
        )
    LOOP
      SELECT user_id INTO successor
      FROM organization_members
      WHERE org_id = org.id AND user_id <> OLD.id
      ORDER BY (role = 'manager') DESC, joined_at ASC
      LIMIT 1;

      IF FOUND THEN
        UPDATE organization_members
           SET role = 'owner'
         WHERE org_id = org.id AND user_id = successor.user_id;
      ELSE
        -- The last member of an org is by invariant its last owner; the org
        -- goes with them, as the owner-pointer CASCADE used to arrange.
        DELETE FROM organizations WHERE id = org.id;
      END IF;
    END LOOP;
    RETURN OLD;
  END;
  $$
`;

const OWNER_GUARD_FUNCTION = sql`
  CREATE FUNCTION assert_organization_has_owner() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    target uuid;
  BEGIN
    IF TG_TABLE_NAME = 'organizations' THEN
      target := NEW.id;
    ELSE
      target := COALESCE(OLD.org_id, NEW.org_id);
    END IF;

    IF EXISTS (SELECT 1 FROM organizations o WHERE o.id = target)
       AND NOT EXISTS (
         SELECT 1 FROM organization_members m
         WHERE m.org_id = target AND m.role = 'owner'
       )
    THEN
      RAISE EXCEPTION 'organization % must keep at least one owner', target
        USING ERRCODE = '23514', CONSTRAINT = 'trg_organization_members_owner_guard';
    END IF;
    RETURN NULL;
  END;
  $$
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await REBALANCE_FUNCTION.execute(db);
  await OWNER_GUARD_FUNCTION.execute(db);

  await sql`
    CREATE CONSTRAINT TRIGGER trg_organization_members_owner_guard
    AFTER DELETE OR UPDATE OF role ON organization_members
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION assert_organization_has_owner()
  `.execute(db);
  await sql`
    CREATE CONSTRAINT TRIGGER trg_organizations_owner_guard
    AFTER INSERT ON organizations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION assert_organization_has_owner()
  `.execute(db);

  // Dropping the column drops fk_organizations_owner_membership,
  // organizations_owner_fkey, and idx_organizations_owner with it.
  await sql`ALTER TABLE organizations DROP COLUMN owner_user_id`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE organizations ADD COLUMN owner_user_id text`.execute(db);
  // Repoint at the longest-standing owner; the owner guard means every org has
  // one, so the backfill is total and NOT NULL is safe to restore.
  await sql`
    UPDATE organizations o
    SET owner_user_id = (
      SELECT m.user_id FROM organization_members m
      WHERE m.org_id = o.id AND m.role = 'owner'
      ORDER BY m.joined_at ASC LIMIT 1
    )
  `.execute(db);
  await sql`ALTER TABLE organizations ALTER COLUMN owner_user_id SET NOT NULL`.execute(db);
  await sql`
    ALTER TABLE organizations
    ADD CONSTRAINT organizations_owner_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  `.execute(db);
  await sql`
    ALTER TABLE organizations
    ADD CONSTRAINT fk_organizations_owner_membership
    FOREIGN KEY (id, owner_user_id) REFERENCES organization_members (org_id, user_id)
    DEFERRABLE INITIALLY DEFERRED
  `.execute(db);
  await sql`
    CREATE INDEX idx_organizations_owner ON organizations (owner_user_id)
  `.execute(db);

  await sql`
    DROP TRIGGER trg_organizations_owner_guard ON organizations
  `.execute(db);
  await sql`
    DROP TRIGGER trg_organization_members_owner_guard ON organization_members
  `.execute(db);
  await sql`DROP FUNCTION assert_organization_has_owner()`.execute(db);

  // Migration 249's body, which keys on the pointer.
  await sql`
    CREATE OR REPLACE FUNCTION rebalance_organization_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      org RECORD;
      successor RECORD;
    BEGIN
      FOR org IN SELECT id FROM organizations WHERE owner_user_id = OLD.id LOOP
        SELECT user_id, role INTO successor
        FROM organization_members
        WHERE org_id = org.id AND user_id <> OLD.id
        ORDER BY (role = 'owner') DESC, (role = 'manager') DESC, joined_at ASC
        LIMIT 1;

        IF FOUND THEN
          IF successor.role <> 'owner' THEN
            UPDATE organization_members
               SET role = 'owner'
             WHERE org_id = org.id AND user_id = successor.user_id;
          END IF;
          UPDATE organizations
             SET owner_user_id = successor.user_id
           WHERE id = org.id;
        END IF;
      END LOOP;
      RETURN OLD;
    END;
    $$
  `.execute(db);
}
