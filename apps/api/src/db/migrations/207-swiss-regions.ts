import type { Kysely } from "kysely";
import { sql } from "kysely";

// ADR-041 — Swiss 1v1 pairing mode plus the optional region layer.
//
// Swiss rounds ride the existing pod machinery as pods of size 2, so `pods.size`
// widens to (2, 3, 4) and `pairing_style` gains 'swiss'. Swiss match points are
// win/draw configured per tournament (`win_points` / `draw_points`, derived on
// read like the placement tables) and result entry is Bo1 or Bo3
// (`match_format`, fixed once rounds exist, like the pairing style). The region
// layer (`regions_enabled` + `tournament_participants.region`, a custom-tag slug
// from the `region` category) works for both pairing styles.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tournaments")
    .addColumn("match_format", "text", (col) => col.defaultTo("bo1").notNull())
    .addColumn("win_points", "integer", (col) => col.defaultTo(3).notNull())
    .addColumn("draw_points", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("regions_enabled", "boolean", (col) => col.defaultTo(false).notNull())
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint("chk_tournaments_match_format", sql`match_format IN ('bo1', 'bo3')`)
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint("chk_tournaments_win_points", sql`win_points >= 0`)
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint("chk_tournaments_draw_points", sql`draw_points >= 0`)
    .execute();

  await db.schema
    .alterTable("tournaments")
    .dropConstraint("chk_tournaments_pairing_style")
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint(
      "chk_tournaments_pairing_style",
      sql`pairing_style IN ('none', 'pod', 'swiss')`,
    )
    .execute();

  await db.schema.alterTable("pods").dropConstraint("chk_pods_size").execute();
  await db.schema
    .alterTable("pods")
    .addCheckConstraint("chk_pods_size", sql`size IN (2, 3, 4)`)
    .execute();

  await db.schema.alterTable("tournament_participants").addColumn("region", "text").execute();
  await db.schema
    .alterTable("tournament_participants")
    .addCheckConstraint(
      "chk_tournament_participants_region",
      sql`region IS NULL OR char_length(region) BETWEEN 1 AND 50`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Rolling back fails by design if any swiss tournament or 2-player pod exists
  // after this migration — the old CHECKs cannot represent them (same posture
  // as migration 178's down).
  await db.schema
    .alterTable("tournament_participants")
    .dropConstraint("chk_tournament_participants_region")
    .execute();
  await db.schema.alterTable("tournament_participants").dropColumn("region").execute();

  await db.schema.alterTable("pods").dropConstraint("chk_pods_size").execute();
  await db.schema
    .alterTable("pods")
    .addCheckConstraint("chk_pods_size", sql`size IN (3, 4)`)
    .execute();

  await db.schema
    .alterTable("tournaments")
    .dropConstraint("chk_tournaments_pairing_style")
    .execute();
  await db.schema
    .alterTable("tournaments")
    .addCheckConstraint("chk_tournaments_pairing_style", sql`pairing_style IN ('none', 'pod')`)
    .execute();

  await db.schema
    .alterTable("tournaments")
    .dropConstraint("chk_tournaments_match_format")
    .execute();
  await db.schema.alterTable("tournaments").dropConstraint("chk_tournaments_win_points").execute();
  await db.schema.alterTable("tournaments").dropConstraint("chk_tournaments_draw_points").execute();
  await db.schema
    .alterTable("tournaments")
    .dropColumn("match_format")
    .dropColumn("win_points")
    .dropColumn("draw_points")
    .dropColumn("regions_enabled")
    .execute();
}
