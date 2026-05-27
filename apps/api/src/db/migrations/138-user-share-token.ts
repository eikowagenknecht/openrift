import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds an opt-in public share token to the users table. NULL = sharing
// disabled; setting a token enables the /users/share/<token> bundle that
// exposes the user's wish + trade lists. See ADR-018.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").addColumn("share_token", "text").execute();

  // Partial unique index: tokens must be unique among the enabled set, NULLs
  // are unconstrained (most users never enable sharing).
  await sql`
    CREATE UNIQUE INDEX uq_users_share_token
      ON users (share_token) WHERE share_token IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_users_share_token`.execute(db);
  await db.schema.alterTable("users").dropColumn("share_token").execute();
}
