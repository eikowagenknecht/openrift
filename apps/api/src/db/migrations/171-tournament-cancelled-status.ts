import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 Phase 4: widen the tournament status CHECK to include 'cancelled'.
// The umbrella's lifecycle is setup/running/completed/cancelled (the ADR target
// schema and tables.ts already document `cancelled`), and Phase 4 adds the
// host/organizer cancel action that locks a tournament read-only. The Phase-1
// rename (167) carried over the pod-era constraint, which only allowed
// setup/running/completed; this additive change closes that gap. Existing rows
// remain valid, so the migration is non-destructive.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments DROP CONSTRAINT chk_tournaments_status`.execute(db);
  await sql`
    ALTER TABLE tournaments
      ADD CONSTRAINT chk_tournaments_status
        CHECK (status = ANY (ARRAY['setup'::text, 'running'::text, 'completed'::text, 'cancelled'::text]))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments DROP CONSTRAINT chk_tournaments_status`.execute(db);
  await sql`
    ALTER TABLE tournaments
      ADD CONSTRAINT chk_tournaments_status
        CHECK (status = ANY (ARRAY['setup'::text, 'running'::text, 'completed'::text]))
  `.execute(db);
}
