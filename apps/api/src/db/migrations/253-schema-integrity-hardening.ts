import type { Kysely } from "kysely";
import { sql } from "kysely";

// Schema-integrity hardening from the 2026-08 database review: close every
// representable-but-invalid state the review found, fix two FK behaviours, and
// finish the index housekeeping migration 251 started.
//
// CHECK constraints (each states a rule every writer already honours; the dev
// data was verified clean before adoption, except where a repair step below
// says otherwise):
//   - card_bans: an unban can't predate the ban. Reachable through the admin
//     flow today (edit banned_at to a future date, then unban stamps today).
//   - list_entries: a `copy` entry is one physical card; the repo hard-codes
//     quantity 1 and every sibling shape rule is already a CHECK.
//   - card_trades: a pending trade must carry its expiry, or the expiry cron
//     (which only sees rows via the partial expiry index) can never close it.
//     Forward direction only — migration 246 deliberately declined the reverse
//     (a non-pending status may gain deadlines later), and this keeps that open.
//   - job_runs: `running` is exactly the state without `finished_at`, and a
//     duration can't be negative. Same coupling style as migration 246's
//     card_trades/deck_check_entries shapes.
//   - card_tokens: a card is never its own token. The two violating dev rows
//     were extraction artifacts (token cards listed as their own token), which
//     looped the "tokens of this card" display back onto itself.
//   - meta_events / meta_decks: source columns are all-or-none. A half-set row
//     satisfies the per-column checks but escapes the partial dedup uniques,
//     so a later upload of the same event duplicates instead of diffing.
//   - Nine slug/label lookup tables get the `<> ''` checks their siblings
//     (languages, keywords, markers, custom_tags) already have.
//
// Foreign keys:
//   - marketplace_ignored_variants → marketplace_products gains ON DELETE
//     CASCADE, matching its two sibling satellites. Without it the admin
//     "clear price data" operation FK-faults whenever any variant of the
//     marketplace was ignored.
//   - tournament_participants.team_id becomes a composite FK through
//     (team_id, tournament_id) → tournament_teams(id, tournament_id), so a
//     participant can never sit on another tournament's team — the same
//     tenancy pattern decks/lists/collections already use. `SET NULL (team_id)`
//     (PG 15+) keeps the delete behaviour while leaving tournament_id alone.
//
// printing_link_overrides learns provider scoping: external ids are
// per-provider everywhere else in the candidate pipeline, and two providers
// with colliding ids (numeric marketplace ids especially) would silently
// overwrite each other's manual pins via the (external_id, finish) upsert.
// Existing rows can't be attributed to a provider (1223 of 1701 no longer
// match any candidate, and the matchable ones often match several providers
// with the same, correct target), so '' is kept as a wildcard sentinel —
// matching the '' finish sentinel this table already uses — and resolution
// prefers a provider-scoped row over the wildcard. New pins always stamp the
// candidate's provider.
//
// Unique indexes for two check-then-insert races:
//   - job_runs: the `running` partial index becomes UNIQUE, so two concurrent
//     triggers of one job kind can't both insert a running row. The repair
//     keeps only the newest running row per kind (a no-op on healthy data;
//     startup's sweepOrphaned handles crashed rows either way).
//   - friend_group_discord_links: one outstanding pending code per group,
//     which createPendingLink previously enforced only by delete-then-insert.
//
// Index housekeeping, same rules as migration 251:
//   Dropped as strict leading prefixes of a same-predicate unique on the same
//   table: idx_deck_cards_deck ⊂ uq_deck_cards, idx_friend_group_members_user
//   ⊂ uq_friend_group_members_user_group, idx_deck_folders_user_id ⊂
//   uq_deck_folders_user_name, idx_candidate_meta_decks_event ⊂
//   uq_candidate_meta_decks_source, idx_deck_matchup_swaps_plan ⊂
//   uq_deck_matchup_swaps_plan_card_direction.
//   idx_candidate_cards_provider_external_id is recreated without its dead
//   `WHERE external_id IS NOT NULL` predicate (the column is NOT NULL).
//   Added: printing_images(image_file_id) — the FK trigger seq-scanned the
//   table once per row of the image_files orphan sweep — and
//   candidate_meta_decks(deck_id), which must exist before the meta archive
//   fills the table, because deck deletion is a routine user action and the
//   FK is ON DELETE SET NULL.

const EMPTY_STRING_CHECKS: { table: string }[] = [
  { table: "art_variants" },
  { table: "card_sizes" },
  { table: "card_types" },
  { table: "conditions" },
  { table: "deck_formats" },
  { table: "deck_zones" },
  { table: "domains" },
  { table: "finishes" },
  { table: "graders" },
];

const SHAPE_CHECKS: { table: string; name: string; expression: string }[] = [
  {
    table: "card_bans",
    name: "chk_card_bans_dates_ordered",
    expression: "unbanned_at IS NULL OR unbanned_at >= banned_at",
  },
  {
    table: "list_entries",
    name: "chk_list_entries_copy_quantity",
    expression: "kind <> 'copy' OR quantity = 1",
  },
  {
    table: "card_trades",
    name: "chk_card_trades_pending_expiry",
    expression: "status <> 'pending' OR expires_at IS NOT NULL",
  },
  {
    table: "job_runs",
    name: "chk_job_runs_finished_shape",
    expression: "(status = 'running') = (finished_at IS NULL)",
  },
  {
    table: "job_runs",
    name: "chk_job_runs_duration_nonnegative",
    expression: "duration_ms IS NULL OR duration_ms >= 0",
  },
  {
    table: "card_tokens",
    name: "chk_card_tokens_no_self",
    expression: "card_id <> token_card_id",
  },
  {
    table: "meta_events",
    name: "chk_meta_events_source_shape",
    expression: "(source_provider IS NULL) = (source_external_id IS NULL)",
  },
  {
    table: "meta_decks",
    name: "chk_meta_decks_source_shape",
    expression:
      "num_nonnulls(source_provider, source_event_external_id, source_external_id) IN (0, 3)",
  },
];

const DROPPED_PREFIX_INDEXES: { name: string; table: string; definition: string }[] = [
  { name: "idx_deck_cards_deck", table: "deck_cards", definition: "deck_id" },
  { name: "idx_friend_group_members_user", table: "friend_group_members", definition: "user_id" },
  { name: "idx_deck_folders_user_id", table: "deck_folders", definition: "user_id" },
  {
    name: "idx_candidate_meta_decks_event",
    table: "candidate_meta_decks",
    definition: "candidate_event_id",
  },
  { name: "idx_deck_matchup_swaps_plan", table: "deck_matchup_swaps", definition: "plan_id" },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Repairs (before the constraints that would reject the rows) ───────────
  await sql`DELETE FROM card_tokens WHERE card_id = token_card_id`.execute(db);
  await sql`UPDATE list_entries SET quantity = 1 WHERE kind = 'copy' AND quantity <> 1`.execute(db);
  await sql`
    UPDATE job_runs SET duration_ms = 0 WHERE duration_ms < 0
  `.execute(db);
  await sql`
    UPDATE job_runs
    SET finished_at = COALESCE(finished_at, now()),
        status = 'failed',
        error_message = COALESCE(error_message, 'repaired by migration 253')
    WHERE (status = 'running') <> (finished_at IS NULL)
  `.execute(db);
  // Keep only the newest running row per kind so the unique index can build.
  await sql`
    UPDATE job_runs
    SET status = 'failed', finished_at = now(),
        error_message = 'superseded duplicate running row (migration 253)'
    WHERE status = 'running' AND id NOT IN (
      SELECT DISTINCT ON (kind) id FROM job_runs
      WHERE status = 'running'
      ORDER BY kind, started_at DESC
    )
  `.execute(db);
  // Keep only the newest pending code per group, same reasoning.
  await sql`
    DELETE FROM friend_group_discord_links
    WHERE code IS NOT NULL AND id NOT IN (
      SELECT DISTINCT ON (group_id) id FROM friend_group_discord_links
      WHERE code IS NOT NULL
      ORDER BY group_id, created_at DESC
    )
  `.execute(db);

  // ── CHECK constraints ─────────────────────────────────────────────────────
  for (const check of SHAPE_CHECKS) {
    await sql`
      ALTER TABLE ${sql.table(check.table)}
      ADD CONSTRAINT ${sql.ref(check.name)} CHECK (${sql.raw(check.expression)})
    `.execute(db);
  }
  for (const { table } of EMPTY_STRING_CHECKS) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD CONSTRAINT ${sql.ref(`chk_${table}_slug_not_empty`)} CHECK (slug <> '')
    `.execute(db);
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD CONSTRAINT ${sql.ref(`chk_${table}_label_not_empty`)} CHECK (label <> '')
    `.execute(db);
  }

  // ── Foreign keys ──────────────────────────────────────────────────────────
  await sql`
    ALTER TABLE marketplace_ignored_variants
    DROP CONSTRAINT marketplace_ignored_variants_product_id_fkey,
    ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey
      FOREIGN KEY (marketplace_product_id) REFERENCES marketplace_products(id) ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE tournament_teams
    ADD CONSTRAINT uq_tournament_teams_id_tournament UNIQUE (id, tournament_id)
  `.execute(db);
  await sql`
    ALTER TABLE tournament_participants
    DROP CONSTRAINT tournament_participants_team_fkey,
    ADD CONSTRAINT tournament_participants_team_fkey
      FOREIGN KEY (team_id, tournament_id)
      REFERENCES tournament_teams(id, tournament_id) ON DELETE SET NULL (team_id)
  `.execute(db);

  // ── printing_link_overrides provider scoping ──────────────────────────────
  await sql`
    ALTER TABLE printing_link_overrides
    ADD COLUMN provider text DEFAULT '' NOT NULL
  `.execute(db);
  await sql`ALTER TABLE printing_link_overrides ALTER COLUMN provider DROP DEFAULT`.execute(db);
  await sql`
    ALTER TABLE printing_link_overrides
    DROP CONSTRAINT printing_link_overrides_pkey,
    ADD CONSTRAINT printing_link_overrides_pkey PRIMARY KEY (external_id, finish, provider)
  `.execute(db);

  // ── Unique indexes closing check-then-insert races ────────────────────────
  await sql`DROP INDEX idx_job_runs_running`.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_job_runs_running ON job_runs (kind) WHERE (status = 'running')
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_fg_discord_links_pending
    ON friend_group_discord_links (group_id) WHERE (code IS NOT NULL)
  `.execute(db);

  // ── Index housekeeping ────────────────────────────────────────────────────
  for (const index of DROPPED_PREFIX_INDEXES) {
    await sql`DROP INDEX ${sql.ref(index.name)}`.execute(db);
  }
  await sql`DROP INDEX idx_candidate_cards_provider_external_id`.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id
    ON candidate_cards (provider, external_id)
  `.execute(db);
  await sql`
    CREATE INDEX idx_printing_images_image_file ON printing_images (image_file_id)
  `.execute(db);
  await sql`
    CREATE INDEX idx_candidate_meta_decks_deck
    ON candidate_meta_decks (deck_id) WHERE (deck_id IS NOT NULL)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_candidate_meta_decks_deck`.execute(db);
  await sql`DROP INDEX idx_printing_images_image_file`.execute(db);
  await sql`DROP INDEX idx_candidate_cards_provider_external_id`.execute(db);
  await sql`
    CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id
    ON candidate_cards (provider, external_id) WHERE (external_id IS NOT NULL)
  `.execute(db);
  for (const index of DROPPED_PREFIX_INDEXES) {
    await sql`
      CREATE INDEX ${sql.ref(index.name)} ON ${sql.table(index.table)} (${sql.raw(index.definition)})
    `.execute(db);
  }

  await sql`DROP INDEX uq_fg_discord_links_pending`.execute(db);
  await sql`DROP INDEX idx_job_runs_running`.execute(db);
  await sql`
    CREATE INDEX idx_job_runs_running ON job_runs (kind) WHERE (status = 'running')
  `.execute(db);

  await sql`
    ALTER TABLE printing_link_overrides
    DROP CONSTRAINT printing_link_overrides_pkey
  `.execute(db);
  // Wildcard and provider-scoped rows can share (external_id, finish); keep
  // the provider-scoped one, which is what resolution preferred.
  await sql`
    DELETE FROM printing_link_overrides plo
    WHERE plo.provider = '' AND EXISTS (
      SELECT 1 FROM printing_link_overrides other
      WHERE other.external_id = plo.external_id
        AND other.finish = plo.finish AND other.provider <> ''
    )
  `.execute(db);
  await sql`
    DELETE FROM printing_link_overrides plo
    WHERE plo.provider <> '' AND ctid NOT IN (
      SELECT DISTINCT ON (external_id, finish) ctid FROM printing_link_overrides
      ORDER BY external_id, finish, provider
    )
  `.execute(db);
  await sql`
    ALTER TABLE printing_link_overrides
    ADD CONSTRAINT printing_link_overrides_pkey PRIMARY KEY (external_id, finish),
    DROP COLUMN provider
  `.execute(db);

  await sql`
    ALTER TABLE tournament_participants
    DROP CONSTRAINT tournament_participants_team_fkey,
    ADD CONSTRAINT tournament_participants_team_fkey
      FOREIGN KEY (team_id) REFERENCES tournament_teams(id) ON DELETE SET NULL
  `.execute(db);
  await sql`
    ALTER TABLE tournament_teams DROP CONSTRAINT uq_tournament_teams_id_tournament
  `.execute(db);

  await sql`
    ALTER TABLE marketplace_ignored_variants
    DROP CONSTRAINT marketplace_ignored_variants_product_id_fkey,
    ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey
      FOREIGN KEY (marketplace_product_id) REFERENCES marketplace_products(id)
  `.execute(db);

  for (const { table } of EMPTY_STRING_CHECKS) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      DROP CONSTRAINT ${sql.ref(`chk_${table}_label_not_empty`)}
    `.execute(db);
    await sql`
      ALTER TABLE ${sql.table(table)}
      DROP CONSTRAINT ${sql.ref(`chk_${table}_slug_not_empty`)}
    `.execute(db);
  }
  for (const check of SHAPE_CHECKS) {
    await sql`
      ALTER TABLE ${sql.table(check.table)} DROP CONSTRAINT ${sql.ref(check.name)}
    `.execute(db);
  }
}
