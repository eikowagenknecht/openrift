import type { Kysely } from "kysely";
import { sql } from "kysely";

// Seat order within a pod: pod_members.seat (0-based around the table). Chosen
// at round creation to avoid re-seating the same neighbors as earlier rounds.
// Nullable because rounds persisted before this feature carry no order; those
// pods simply don't contribute to the neighbor history.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("pod_members").addColumn("seat", "integer").execute();
  await db.schema
    .alterTable("pod_members")
    .addCheckConstraint("chk_pod_members_seat", sql`seat IS NULL OR seat BETWEEN 0 AND 3`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("pod_members").dropConstraint("chk_pod_members_seat").execute();
  await db.schema.alterTable("pod_members").dropColumn("seat").execute();
}
