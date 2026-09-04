import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Folds `store` and `casual` into one `local` tier, then raises a local
 * event to `competitive` when its player count clears the floor, unless an
 * accepted overlay already claims that event's `tier`.
 */

const COMPETITIVE_PLAYER_FLOOR = 128;

const TIER_CONSTRAINTS = [
  { table: "meta_events", name: "chk_meta_events_tier", nullable: false },
  { table: "meta_event_overlays", name: "chk_meta_event_overlays_tier", nullable: true },
  { table: "uvsgames_event_templates", name: "chk_uvsgames_event_templates_tier", nullable: true },
] as const;

async function retierConstraints(db: Kysely<unknown>, tiers: readonly string[]): Promise<void> {
  const values = sql.join(tiers.map((tier) => sql.lit(tier)));
  for (const { table, name, nullable } of TIER_CONSTRAINTS) {
    await db.schema.alterTable(table).dropConstraint(name).execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(
        name,
        nullable ? sql`tier IS NULL OR tier IN (${values})` : sql`tier IN (${values})`,
      )
      .execute();
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await retierConstraints(db, ["premier", "competitive", "store", "casual", "local"]);

  for (const table of ["meta_events", "meta_event_overlays", "uvsgames_event_templates"]) {
    await sql`
      UPDATE ${sql.table(table)} SET tier = 'local' WHERE tier IN ('store', 'casual')
    `.execute(db);
  }

  await sql`
    UPDATE meta_events SET tier = 'competitive', updated_at = now()
      WHERE tier = 'local'
        AND player_count >= ${sql.lit(COMPETITIVE_PLAYER_FLOOR)}
        AND NOT EXISTS (
          SELECT 1 FROM meta_event_overlays o
            WHERE o.meta_event_id = meta_events.id
              AND o.status = 'accepted'
              AND 'tier' = ANY (o.claimed_fields)
        )
  `.execute(db);

  await db.schema
    .alterTable("meta_events")
    .alterColumn("tier", (col) => col.setDefault("local"))
    .execute();

  await retierConstraints(db, ["premier", "competitive", "local"]);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await retierConstraints(db, ["premier", "competitive", "store", "casual", "local"]);

  // Which of the two a row held before the fold is not recoverable, and neither
  // is the tier a promoted event carried before size raised it.
  for (const table of ["meta_events", "meta_event_overlays", "uvsgames_event_templates"]) {
    await sql`UPDATE ${sql.table(table)} SET tier = 'store' WHERE tier = 'local'`.execute(db);
  }

  await db.schema
    .alterTable("meta_events")
    .alterColumn("tier", (col) => col.setDefault("store"))
    .execute();

  await retierConstraints(db, ["premier", "competitive", "store", "casual"]);
}
