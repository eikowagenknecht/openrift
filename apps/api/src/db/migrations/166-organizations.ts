import type { Kysely } from "kysely";
import { sql } from "kysely";

// Event organizations (ADR-033, Phase 1). A first-class tournament host
// alongside individual users: a local game store or league that runs many
// tournaments under one identity with shared staff. Admin-provisioned (the
// create surface is admin-only) to stop a stranger registering a real store's
// name. `organization_members` carries the org-level authority — both `owner`
// and `manager` are implicitly an `organizer` on every tournament the org hosts.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organizations")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("owner_user_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_organizations_slug", sql`slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'`)
    .addCheckConstraint("chk_organizations_name", sql`length(name) BETWEEN 1 AND 120`)
    .addCheckConstraint(
      "chk_organizations_description",
      sql`description IS NULL OR length(description) <= 4000`,
    )
    .execute();

  await db.schema
    .alterTable("organizations")
    .addForeignKeyConstraint("organizations_owner_fkey", ["owner_user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await db.schema
    .createTable("organization_members")
    .addColumn("org_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("joined_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("organization_members_pkey", ["org_id", "user_id"])
    .addCheckConstraint("chk_organization_members_role", sql`role IN ('owner', 'manager')`)
    .execute();

  await db.schema
    .alterTable("organization_members")
    .addForeignKeyConstraint("organization_members_org_fkey", ["org_id"], "organizations", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("organization_members")
    .addForeignKeyConstraint("organization_members_user_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_organization_members_user")
    .on("organization_members")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_members").execute();
  await db.schema.dropTable("organizations").execute();
}
