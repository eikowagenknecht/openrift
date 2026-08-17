import type { Kysely } from "kysely";
import { sql } from "kysely";

// An organization's ownership is encoded twice: `organizations.owner_user_id`
// names the primary owner, and `organization_members` rows with `role = 'owner'`
// carry the authority. Several people may hold the owner role — that is the
// intended model — but nothing stopped the pointer naming someone who was not a
// member of the org at all.
//
// Two pieces close that gap:
//
//   1. A composite FK from `organizations (id, owner_user_id)` to
//      `organization_members (org_id, user_id)`, so the primary owner is always
//      a real member. It must be DEFERRABLE INITIALLY DEFERRED for two reasons:
//      creating an org inserts the organization before the owner's membership
//      row (one transaction, so a commit-time check is satisfied), and deleting
//      an org cascades its membership rows away while the organization row is
//      still present mid-statement. Both are consistent at commit, which is when
//      a deferred constraint looks.
//
//   2. `rebalance_organization_owner()` learns that co-owners exist. It used to
//      promote its chosen successor unconditionally, which turned a surviving
//      co-owner's existing `owner` row into a redundant write and, worse,
//      described the handover as a promotion when the successor already held the
//      role. Now it promotes only when the successor does not already own the
//      org; when a co-owner survives, the primary pointer simply moves to them
//      and nobody's role changes.
//
// The successor search itself is unchanged (`owner` > `manager` > `judge`, then
// oldest join first), and it already prefers a surviving owner-role member, so
// the "hand to a co-owner" case falls out of the same query.
//
// Note what this FK does and does not say: it constrains the *pointer*, not the
// role. `owner_user_id` must be a member, but it is not required to be one of
// the `role = 'owner'` members — demoting the primary owner while other owners
// remain is still representable, and is the application's call to make.
//
// The trigger acts only on organizations this user is the *primary* owner of
// (`WHERE owner_user_id = OLD.id`), so deleting a co-owner who is not the
// pointer needs no rebalance at all: their membership row cascades away and the
// remaining owners are untouched.
const REBALANCE_FUNCTION = sql`
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
        -- A surviving co-owner already holds the role; only the pointer moves.
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
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await REBALANCE_FUNCTION.execute(db);

  await sql`
    ALTER TABLE organizations
    ADD CONSTRAINT fk_organizations_owner_membership
    FOREIGN KEY (id, owner_user_id) REFERENCES organization_members (org_id, user_id)
    DEFERRABLE INITIALLY DEFERRED
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE organizations DROP CONSTRAINT fk_organizations_owner_membership`.execute(
    db,
  );

  // Migration 188's original body, which promotes unconditionally.
  await sql`
    CREATE OR REPLACE FUNCTION rebalance_organization_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    $$
  `.execute(db);
}
