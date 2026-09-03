import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Repairs archived deck names promotion left ending in an empty bracket pair,
 * e.g. "Master Yi, Wuju Bladesman ()" — a row keyed by source user id has no
 * player name of its own; promotion now resolves it through the source's
 * display names. Only names still ending in the empty pair are touched.
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE decks AS d
      SET name = left(
            rtrim(left(d.name, length(d.name) - 3)) || ' (' || resolved.player_name || ')',
            200
          ),
          updated_at = now()
      FROM (
        SELECT p.deck_id, coalesce(p.player_name, up.display_name) AS player_name
        FROM meta_event_players AS p
        LEFT JOIN uvsgames_players AS up ON up.id = p.uvsgames_player_id
        WHERE p.deck_id IS NOT NULL
      ) AS resolved
      WHERE resolved.deck_id = d.id
        AND d.name LIKE '% ()'
        AND resolved.player_name IS NOT NULL
        AND resolved.player_name <> ''
  `.execute(db);

  // No resolvable player: keep the legend alone, drop the empty pair.
  await sql`
    UPDATE decks
      SET name = rtrim(left(name, length(name) - 3)),
          updated_at = now()
      WHERE name LIKE '% ()'
  `.execute(db);
}

export async function down(): Promise<void> {
  // The names the empty pair replaced carried no information to restore.
}
