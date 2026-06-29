import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 follow-up: let a host hand out staff without knowing anyone's email.
// Two reusable, role-scoped invite links join the existing pickable-from-the-roster
// path: a logged-in person opens the link and confirms (an explicit POST, never a
// GET side effect, so email/link scanners can't auto-claim) to become an organizer
// or judge. One token per role, revocable by rotating it to NULL — mirrors the
// single submission_token column and its uq_tournaments_submission_token index.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tournaments ADD COLUMN organizer_invite_token text`.execute(db);
  await sql`ALTER TABLE tournaments ADD COLUMN judge_invite_token text`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_tournaments_organizer_invite_token ON tournaments (organizer_invite_token) WHERE organizer_invite_token IS NOT NULL`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX uq_tournaments_judge_invite_token ON tournaments (judge_invite_token) WHERE judge_invite_token IS NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX uq_tournaments_judge_invite_token`.execute(db);
  await sql`DROP INDEX uq_tournaments_organizer_invite_token`.execute(db);
  await sql`ALTER TABLE tournaments DROP COLUMN judge_invite_token`.execute(db);
  await sql`ALTER TABLE tournaments DROP COLUMN organizer_invite_token`.execute(db);
}
