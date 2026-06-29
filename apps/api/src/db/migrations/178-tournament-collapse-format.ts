import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-033 — collapse the redundant `format` / `pairing_style` pair into a single
// pairing axis, and drop the "must do something" rule. `format` only ever mirrored
// `pairing_style` 1:1 ('none'↔'none', 'pod_rounds'↔'pod'), so it's removed; the
// surviving `pairing_style` ('none' | 'pod', extensible to swiss/cut later) is now
// the single source of truth. `chk_tournaments_nonempty` is dropped too: a
// tournament with no pairings and no decklist (a roster/schedule-only event) is a
// legitimate use, not an error. The one real coupling — deck check needs a
// decklist (`chk_tournaments_deck_check`) — is left untouched here; migration 179
// removes it together with the deck-check toggle.
export async function up(db: Kysely<unknown>): Promise<void> {
  const dropConstraint = (name: string): Promise<unknown> =>
    db.schema.alterTable("tournaments").dropConstraint(name).execute();

  await dropConstraint("chk_tournaments_format_pairing");
  await dropConstraint("chk_tournaments_nonempty");
  await dropConstraint("chk_tournaments_format");
  await db.schema.alterTable("tournaments").dropColumn("format").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add `format` and rebuild it from `pairing_style`. The default seeds every
  // existing row as 'pod_rounds'; the UPDATE then corrects the no-pairings rows
  // before the coupling/nonempty CHECKs go back on. Rolling back fails by design
  // if any empty tournament (no pairings, no decklist) was created after this
  // migration — the old nonempty rule cannot represent it.
  await db.schema
    .alterTable("tournaments")
    .addColumn("format", "text", (col) => col.defaultTo("pod_rounds").notNull())
    .execute();
  await sql`
    UPDATE tournaments
    SET format = CASE WHEN pairing_style = 'pod' THEN 'pod_rounds' ELSE 'none' END
  `.execute(db);

  const addCheck = (name: string, check: ReturnType<typeof sql>): Promise<unknown> =>
    db.schema.alterTable("tournaments").addCheckConstraint(name, check).execute();

  await addCheck("chk_tournaments_format", sql`format IN ('none', 'pod_rounds')`);
  await addCheck(
    "chk_tournaments_format_pairing",
    sql`(format = 'none'       AND pairing_style = 'none') OR
        (format = 'pod_rounds' AND pairing_style = 'pod')`,
  );
  await addCheck("chk_tournaments_nonempty", sql`format <> 'none' OR deck_submission <> 'none'`);
}
