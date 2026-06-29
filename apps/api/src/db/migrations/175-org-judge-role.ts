import type { Kysely } from "kysely";
import { sql } from "kysely";

// Widen the organization member role CHECK to include 'judge'. Owners and
// managers are implicit organizers on every tournament the org hosts; an org
// 'judge' is an implicit judge instead (deck check only) and has no org-admin
// authority. This lets an org keep people who are always allowed to judge its
// tournaments but nothing else. Existing rows (owner/manager) stay valid, so the
// change is additive and non-destructive.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE organization_members DROP CONSTRAINT chk_organization_members_role`.execute(
    db,
  );
  await sql`
    ALTER TABLE organization_members
      ADD CONSTRAINT chk_organization_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text, 'judge'::text]))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE organization_members DROP CONSTRAINT chk_organization_members_role`.execute(
    db,
  );
  await sql`
    ALTER TABLE organization_members
      ADD CONSTRAINT chk_organization_members_role
        CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text]))
  `.execute(db);
}
