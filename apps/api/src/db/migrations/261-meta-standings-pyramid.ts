import type { Kysely } from "kysely";
import { sql } from "kysely";

// The standings pyramid, plus the catalogue mirror the in-app fetcher needs
// (ADR-014, second revision).
//
// The archive was decks-only: one `meta_decks` row per known list, and a
// legend-only entry faked as a deck with `list_status = 'archetype'`. The
// official source publishes the full player list with records for every event
// and the legend for nearly every one, and decklists for almost none, so the
// row that matters is the player, not the list. `meta_event_players` is that
// row; a deck becomes an optional attachment, and `archetype` dissolves into
// "player row with no deck".
//
// The candidate side follows: `candidate_meta_decks` becomes
// `candidate_meta_players`, its free-text `record` becomes win/loss/draw
// columns, `finish_tier` becomes an exact `rank` with a flag for the sources
// that only publish tiers, and its card list becomes nullable because a
// standings-only row has none.
//
// `meta_deck_sources` (migration 256) goes away. It existed because ignoring a
// candidate deleted the candidate row, taking the only surviving source key
// with it. Ignores now keep the row, so the candidate's own
// `(provider, external_id)` is that key again.
//
// Statement order carries the whole data carry: the player rows are created
// with `deck_id` set for every `meta_decks` row, `archetype` ones included,
// because the credit and candidate backfills below find their new player row
// by joining on that deck. Only once those joins have run are the archetype
// rows detached and their decks deleted.

const RECORD_SHAPE = String.raw`^[0-9]+-[0-9]+(-[0-9]+)?$`;

const CANDIDATE_CONSTRAINT_RENAMES = [
  ["candidate_meta_decks_pkey", "candidate_meta_players_pkey"],
  ["uq_candidate_meta_decks_source", "uq_candidate_meta_players_source"],
  ["chk_candidate_meta_decks_cards_shape", "chk_candidate_meta_players_cards_shape"],
  ["chk_candidate_meta_decks_external_id", "chk_candidate_meta_players_external_id"],
  ["chk_candidate_meta_decks_finish_tier", "chk_candidate_meta_players_rank"],
  ["chk_candidate_meta_decks_parent", "chk_candidate_meta_players_parent"],
  ["chk_candidate_meta_decks_player_name", "chk_candidate_meta_players_player_name"],
  ["chk_candidate_meta_decks_submission_note", "chk_candidate_meta_players_submission_note"],
  [
    "candidate_meta_decks_candidate_event_id_fkey",
    "candidate_meta_players_candidate_event_id_fkey",
  ],
  ["candidate_meta_decks_meta_event_id_fkey", "candidate_meta_players_meta_event_id_fkey"],
  [
    "candidate_meta_decks_submitted_by_user_id_fkey",
    "candidate_meta_players_submitted_by_user_id_fkey",
  ],
] as const;

const CANDIDATE_INDEX_RENAMES = [
  ["idx_candidate_meta_decks_meta_event", "idx_candidate_meta_players_meta_event"],
  ["uq_candidate_meta_decks_submission", "uq_candidate_meta_players_submission"],
] as const;

const SUBMISSION_CONSTRAINT_RENAMES = [
  ["meta_deck_submissions_pkey", "meta_submissions_pkey"],
  ["chk_meta_deck_submissions_event_name", "chk_meta_submissions_event_name"],
  ["chk_meta_deck_submissions_external_id", "chk_meta_submissions_external_id"],
  ["chk_meta_deck_submissions_note", "chk_meta_submissions_note"],
  ["chk_meta_deck_submissions_player_name", "chk_meta_submissions_player_name"],
  ["chk_meta_deck_submissions_provider", "chk_meta_submissions_provider"],
  ["chk_meta_deck_submissions_reason", "chk_meta_submissions_reason"],
  ["chk_meta_deck_submissions_resolution_note", "chk_meta_submissions_resolution_note"],
  ["chk_meta_deck_submissions_resolved_at", "chk_meta_submissions_resolved_at"],
  ["chk_meta_deck_submissions_status", "chk_meta_submissions_status"],
  ["meta_deck_submissions_user_id_fkey", "meta_submissions_user_id_fkey"],
  [
    "meta_deck_submissions_candidate_meta_deck_id_fkey",
    "meta_submissions_candidate_meta_player_id_fkey",
  ],
  ["meta_deck_submissions_meta_event_id_fkey", "meta_submissions_meta_event_id_fkey"],
  ["meta_deck_submissions_resolved_by_user_id_fkey", "meta_submissions_resolved_by_user_id_fkey"],
  ["meta_deck_submissions_accepted_deck_id_fkey", "meta_submissions_accepted_deck_id_fkey"],
] as const;

const SUBMISSION_INDEX_RENAMES = [
  ["uq_meta_deck_submissions_provider_external", "uq_meta_submissions_provider_external"],
  ["idx_meta_deck_submissions_user_created", "idx_meta_submissions_user_created"],
  ["idx_meta_deck_submissions_user_status", "idx_meta_submissions_user_status"],
] as const;

const IGNORED_CONSTRAINT_RENAMES = [
  ["ignored_candidate_meta_decks_pkey", "ignored_candidate_meta_players_pkey"],
  ["chk_ignored_candidate_meta_decks_provider", "chk_ignored_candidate_meta_players_provider"],
  [
    "chk_ignored_candidate_meta_decks_event_external_id",
    "chk_ignored_candidate_meta_players_event_external_id",
  ],
  [
    "chk_ignored_candidate_meta_decks_external_id",
    "chk_ignored_candidate_meta_players_external_id",
  ],
] as const;

type Renames = readonly (readonly [string, string])[];

async function renameConstraints(
  db: Kysely<unknown>,
  table: string,
  renames: Renames,
): Promise<void> {
  for (const [from, to] of renames) {
    await sql`
      ALTER TABLE ${sql.table(table)} RENAME CONSTRAINT ${sql.ref(from)} TO ${sql.ref(to)}
    `.execute(db);
  }
}

async function renameIndexes(db: Kysely<unknown>, renames: Renames): Promise<void> {
  for (const [from, to] of renames) {
    await sql`ALTER INDEX ${sql.ref(from)} RENAME TO ${sql.ref(to)}`.execute(db);
  }
}

function reversed(renames: Renames): Renames {
  return renames.map(([from, to]) => [to, from] as const);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── meta_catalog_events ──────────────────────────────────────────────────
  // A slim projection of the source's whole event listing, ~266k rows. The raw
  // listing row is never kept: an order of magnitude more storage for no read
  // path. Crawl bookkeeping lives on the row because the crawl is windowed and
  // has no other place to remember where it has been.
  await db.schema
    .createTable("meta_catalog_events")
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("start_at", "timestamptz", (col) => col.notNull())
    .addColumn("end_at_estimate", "timestamptz")
    // Source vocabulary, not ours: upcoming / inProgress / complete.
    .addColumn("display_status", "text", (col) => col.notNull())
    // Source vocabulary; PUBLISHED is what unlocks the per-deck fetches.
    .addColumn("decklist_status", "text")
    .addColumn("player_count", "integer")
    .addColumn("event_type", "text")
    // Source vocabulary, mapped to deck_formats.slug at accept. An event whose
    // format does not map is never auto-accepted.
    .addColumn("event_format", "text")
    .addColumn("store_name", "text")
    .addColumn("location", "text")
    // The venue's IANA zone. `meta_events.event_date` is the venue-local day of
    // start_at, and taking the UTC day instead files an evening event in the
    // Americas under the next day.
    .addColumn("timezone", "text")
    // Hash of the projection above, so an unchanged listing row costs one
    // last_seen_at write instead of a full update.
    .addColumn("content_hash", "text", (col) => col.notNull())
    .addColumn("first_seen_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("last_seen_at", "timestamptz", (col) => col.notNull())
    // The source deletes events. A row a covering crawl no longer returns is
    // flagged here, never removed.
    .addColumn("missing_since", "timestamptz")
    .addColumn("next_check_at", "timestamptz")
    .addColumn("check_stage", "smallint", (col) => col.defaultTo(0).notNull())
    .addPrimaryKeyConstraint("meta_catalog_events_pkey", ["provider", "external_id"])
    .addCheckConstraint("chk_meta_catalog_events_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_meta_catalog_events_external_id", sql`external_id <> ''`)
    .addCheckConstraint("chk_meta_catalog_events_name", sql`name <> ''`)
    .addCheckConstraint("chk_meta_catalog_events_display_status", sql`display_status <> ''`)
    .addCheckConstraint("chk_meta_catalog_events_content_hash", sql`content_hash <> ''`)
    // Unlike meta_events, zero is legal: a scheduled event nobody registered
    // for is a real catalogue row.
    .addCheckConstraint(
      "chk_meta_catalog_events_player_count",
      sql`player_count IS NULL OR player_count >= 0`,
    )
    .addCheckConstraint("chk_meta_catalog_events_check_stage", sql`check_stage >= 0`)
    .execute();

  await sql`
    CREATE INDEX idx_meta_catalog_events_start ON meta_catalog_events (start_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_catalog_events_recheck
      ON meta_catalog_events (next_check_at)
      WHERE next_check_at IS NOT NULL
  `.execute(db);

  // ── meta_sync_settings ───────────────────────────────────────────────────
  // The auto-accept rules, admin-edited. One row: these are global switches,
  // not per-provider, and the sync scheduler is built for one source.
  await db.schema
    .createTable("meta_sync_settings")
    .addColumn("id", "integer", (col) => col.primaryKey())
    // NULL turns the rule off, rather than a sentinel threshold nothing meets.
    .addColumn("auto_accept_min_players", "integer")
    .addColumn("auto_accept_notable", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_sync_settings_singleton", sql`id = 1`)
    .addCheckConstraint(
      "chk_meta_sync_settings_min_players",
      sql`auto_accept_min_players IS NULL OR auto_accept_min_players > 0`,
    )
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_sync_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    INSERT INTO meta_sync_settings (id, auto_accept_min_players, auto_accept_notable)
    VALUES (1, NULL, false)
  `.execute(db);

  // ── meta_event_players ───────────────────────────────────────────────────
  await db.schema
    .createTable("meta_event_players")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("meta_event_id", "uuid", (col) => col.notNull())
    .addColumn("rank", "integer", (col) => col.notNull())
    // The exact final standing where the source publishes one. A source that
    // only reports cut buckets sets this, and the rank displays as "T8".
    .addColumn("rank_is_tier", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    .addColumn("wins", "smallint")
    .addColumn("losses", "smallint")
    .addColumn("draws", "smallint")
    // The legend lives here even when a deck exists, so the play-rate stat
    // reads one column whether or not the list was ever published.
    .addColumn("legend_card_id", "uuid")
    .addColumn("champion_card_id", "uuid")
    .addColumn("deck_id", "uuid")
    .addColumn("list_status", "text", (col) => col.defaultTo("none").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_event_players_rank", sql`"rank" >= 1`)
    .addCheckConstraint(
      "chk_meta_event_players_player_name",
      sql`length(player_name) BETWEEN 1 AND 80`,
    )
    .addCheckConstraint(
      "chk_meta_event_players_list_status",
      sql`list_status IN ('none', 'partial', 'full')`,
    )
    .execute();

  // Ties are legal, so (meta_event_id, rank) is indexed but never unique.
  await db.schema
    .alterTable("meta_event_players")
    .addUniqueConstraint("uq_meta_event_players_deck", ["deck_id"])
    .execute();

  await db.schema
    .alterTable("meta_event_players")
    .addForeignKeyConstraint(
      "meta_event_players_meta_event_id_fkey",
      ["meta_event_id"],
      "meta_events",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  for (const column of ["legend_card_id", "champion_card_id"]) {
    await db.schema
      .alterTable("meta_event_players")
      .addForeignKeyConstraint(`meta_event_players_${column}_fkey`, [column], "cards", ["id"])
      .onDelete("set null")
      .execute();
  }

  // RESTRICT, not CASCADE: deleting an archived deck must not silently take a
  // standings row with it. The admin path clears deck_id and list_status
  // first, then deletes the deck.
  await db.schema
    .alterTable("meta_event_players")
    .addForeignKeyConstraint("meta_event_players_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("idx_meta_event_players_event")
    .on("meta_event_players")
    .columns(["meta_event_id", "rank"])
    .execute();

  await db.schema
    .createIndex("idx_meta_event_players_legend")
    .on("meta_event_players")
    .column("legend_card_id")
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_event_players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Every meta_decks row becomes a player row, deck attached — the archetype
  // ones too, so the joins below can find them. The deck/status coupling CHECK
  // is added after they are detached, further down.
  await sql`
    INSERT INTO meta_event_players (
      meta_event_id, "rank", rank_is_tier, player_name, wins, losses, draws,
      legend_card_id, champion_card_id, deck_id, list_status, created_at, updated_at
    )
    SELECT
      md.meta_event_id,
      md.finish_tier,
      true,
      md.player_name,
      CASE WHEN md.record ~ ${RECORD_SHAPE} THEN split_part(md.record, '-', 1)::smallint END,
      CASE WHEN md.record ~ ${RECORD_SHAPE} THEN split_part(md.record, '-', 2)::smallint END,
      CASE WHEN md.record ~ ${RECORD_SHAPE} AND split_part(md.record, '-', 3) <> ''
           THEN split_part(md.record, '-', 3)::smallint END,
      (SELECT dc.card_id FROM deck_cards dc
        WHERE dc.deck_id = md.deck_id AND dc.zone = 'legend' LIMIT 1),
      (SELECT dc.card_id FROM deck_cards dc
        WHERE dc.deck_id = md.deck_id AND dc.zone = 'champion' LIMIT 1),
      md.deck_id,
      CASE WHEN md.list_status = 'archetype' THEN 'none' ELSE md.list_status END,
      md.created_at,
      md.updated_at
    FROM meta_decks md
  `.execute(db);

  // ── meta_credits ─────────────────────────────────────────────────────────
  await db.schema.alterTable("meta_credits").addColumn("meta_event_player_id", "uuid").execute();

  await db.schema
    .alterTable("meta_credits")
    .addForeignKeyConstraint(
      "meta_credits_meta_event_player_id_fkey",
      ["meta_event_player_id"],
      "meta_event_players",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await sql`
    UPDATE meta_credits c
    SET meta_event_player_id = p.id
    FROM meta_event_players p
    WHERE p.deck_id = c.deck_id
  `.execute(db);

  // Takes uq_meta_credits_contribution with it.
  await db.schema.alterTable("meta_credits").dropColumn("deck_id").execute();

  await sql`
    CREATE UNIQUE INDEX uq_meta_credits_contribution
      ON meta_credits (meta_event_id, user_id, meta_event_player_id) NULLS NOT DISTINCT
  `.execute(db);

  // ── candidate_meta_decks → candidate_meta_players ────────────────────────
  await db.schema
    .alterTable("candidate_meta_decks")
    .addColumn("meta_event_player_id", "uuid")
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint(
      "candidate_meta_players_meta_event_player_id_fkey",
      ["meta_event_player_id"],
      "meta_event_players",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await sql`
    UPDATE candidate_meta_decks c
    SET meta_event_player_id = p.id
    FROM meta_event_players p
    WHERE p.deck_id = c.deck_id
  `.execute(db);

  // Takes candidate_meta_decks_deck_id_fkey and idx_candidate_meta_decks_deck.
  await db.schema.alterTable("candidate_meta_decks").dropColumn("deck_id").execute();

  // Every row that exists predates exact ranks, so its finish_tier was tier
  // semantics. New rows say so themselves, hence the false default.
  await sql`
    ALTER TABLE candidate_meta_decks ADD COLUMN rank_is_tier boolean NOT NULL DEFAULT true
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks ALTER COLUMN rank_is_tier SET DEFAULT false
  `.execute(db);

  await db.schema.alterTable("candidate_meta_decks").renameColumn("finish_tier", "rank").execute();

  for (const column of ["wins", "losses", "draws"]) {
    await db.schema.alterTable("candidate_meta_decks").addColumn(column, "smallint").execute();
  }

  await sql`
    UPDATE candidate_meta_decks
    SET wins = split_part(record, '-', 1)::smallint,
        losses = split_part(record, '-', 2)::smallint,
        draws = CASE WHEN split_part(record, '-', 3) <> ''
                     THEN split_part(record, '-', 3)::smallint END
    WHERE record ~ ${RECORD_SHAPE}
  `.execute(db);

  await db.schema.alterTable("candidate_meta_decks").dropColumn("record").execute();

  // Accept already derives a deck name from the legend and the player whenever
  // the source ships none (`deriveDeckName`), so the column only ever held a
  // name no source provided.
  await db.schema.alterTable("candidate_meta_decks").dropColumn("name").execute();

  for (const column of ["legend_name", "champion_name"]) {
    await db.schema.alterTable("candidate_meta_decks").addColumn(column, "text").execute();
  }
  for (const column of ["legend_card_id", "champion_card_id"]) {
    await db.schema.alterTable("candidate_meta_decks").addColumn(column, "uuid").execute();
    await db.schema
      .alterTable("candidate_meta_decks")
      .addForeignKeyConstraint(`candidate_meta_players_${column}_fkey`, [column], "cards", ["id"])
      .onDelete("set null")
      .execute();
  }

  // The stored card lines are the ingest's own shape: name / zone / quantity /
  // cardId, cardId being the name matcher's verdict or null.
  await sql`
    UPDATE candidate_meta_decks c SET
      legend_name = (
        SELECT entry->>'name' FROM jsonb_array_elements(c.cards) entry
         WHERE entry->>'zone' = 'legend' LIMIT 1),
      legend_card_id = (
        SELECT card.id FROM jsonb_array_elements(c.cards) entry
          JOIN cards card ON card.id = (entry->>'cardId')::uuid
         WHERE entry->>'zone' = 'legend' LIMIT 1),
      champion_name = (
        SELECT entry->>'name' FROM jsonb_array_elements(c.cards) entry
         WHERE entry->>'zone' = 'champion' LIMIT 1),
      champion_card_id = (
        SELECT card.id FROM jsonb_array_elements(c.cards) entry
          JOIN cards card ON card.id = (entry->>'cardId')::uuid
         WHERE entry->>'zone' = 'champion' LIMIT 1)
    WHERE jsonb_typeof(c.cards) = 'array'
  `.execute(db);

  // A standings-only row has no list at all, which is not the same statement
  // as an empty one.
  await sql`ALTER TABLE candidate_meta_decks ALTER COLUMN cards DROP NOT NULL`.execute(db);

  await sql`
    ALTER TABLE candidate_meta_decks DROP CONSTRAINT chk_candidate_meta_decks_list_status
  `.execute(db);
  await sql`
    UPDATE candidate_meta_decks SET list_status = 'none' WHERE list_status = 'archetype'
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks
    ADD CONSTRAINT chk_candidate_meta_players_list_status
      CHECK (list_status IN ('none', 'partial', 'full'))
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks ALTER COLUMN list_status SET DEFAULT 'none'
  `.execute(db);

  await db.schema.alterTable("candidate_meta_decks").renameTo("candidate_meta_players").execute();
  await renameConstraints(db, "candidate_meta_players", CANDIDATE_CONSTRAINT_RENAMES);
  await renameIndexes(db, CANDIDATE_INDEX_RENAMES);

  // ── meta_deck_submissions → meta_submissions ─────────────────────────────
  // A submission is a player's entry now, not a deck, so the ledger loses the
  // "deck" in its name along with the column it pointed with.
  await db.schema.alterTable("meta_deck_submissions").renameTo("meta_submissions").execute();
  await db.schema
    .alterTable("meta_submissions")
    .renameColumn("candidate_meta_deck_id", "candidate_meta_player_id")
    .execute();
  await renameConstraints(db, "meta_submissions", SUBMISSION_CONSTRAINT_RENAMES);
  await renameIndexes(db, SUBMISSION_INDEX_RENAMES);

  // ── ignored_candidate_meta_decks → ignored_candidate_meta_players ────────
  await db.schema
    .alterTable("ignored_candidate_meta_decks")
    .renameTo("ignored_candidate_meta_players")
    .execute();
  await renameConstraints(db, "ignored_candidate_meta_players", IGNORED_CONSTRAINT_RENAMES);

  // ── Detach the archetype rows ────────────────────────────────────────────
  // Every backfill that needed their decks has run.
  await sql`UPDATE meta_event_players SET deck_id = NULL WHERE list_status = 'none'`.execute(db);

  await db.schema
    .alterTable("meta_event_players")
    .addCheckConstraint(
      "chk_meta_event_players_deck_status",
      sql`(deck_id IS NULL) = (list_status = 'none')`,
    )
    .execute();

  // Archive-owned and now unreferenced: an archetype deck held a legend and
  // maybe a champion, both of which are columns on the player row. Deleting
  // the deck cascades its deck_cards and its meta_decks row.
  await sql`
    DELETE FROM decks
    WHERE id IN (SELECT deck_id FROM meta_decks WHERE list_status = 'archetype')
  `.execute(db);

  // ── Superseded tables ────────────────────────────────────────────────────
  await db.schema.dropTable("meta_deck_sources").execute();
  await db.schema.dropTable("meta_decks").execute();

  // ── candidate_meta_events: the deep-fetch payload ────────────────────────
  // Overwritten on every fetch, so a mapping fix can be re-run without going
  // back to the source. No version history: current-source-vs-live is the
  // comparison that matters, and the candidate row already provides it.
  await db.schema.alterTable("candidate_meta_events").addColumn("raw", "jsonb").execute();
  await db.schema
    .alterTable("candidate_meta_events")
    .addCheckConstraint(
      "chk_candidate_meta_events_raw_shape",
      sql`raw IS NULL OR jsonb_typeof(raw) = 'object'`,
    )
    .execute();
  // NULL for push providers, which arrive rather than being fetched.
  await db.schema
    .alterTable("candidate_meta_events")
    .addColumn("fetched_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("candidate_meta_events").dropColumn("fetched_at").execute();
  await db.schema.alterTable("candidate_meta_events").dropColumn("raw").execute();

  // ── meta_decks ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("meta_decks")
    .addColumn("deck_id", "uuid", (col) => col.primaryKey())
    .addColumn("meta_event_id", "uuid", (col) => col.notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    .addColumn("finish_tier", "integer", (col) => col.notNull())
    .addColumn("record", "text")
    .addColumn("list_status", "text", (col) => col.defaultTo("full").notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_decks_player_name", sql`length(player_name) BETWEEN 1 AND 80`)
    .addCheckConstraint("chk_meta_decks_finish_tier", sql`finish_tier >= 1`)
    .addCheckConstraint(
      "chk_meta_decks_record",
      sql`record IS NULL OR length(record) BETWEEN 1 AND 20`,
    )
    .addCheckConstraint(
      "chk_meta_decks_list_status",
      sql`list_status IN ('full', 'partial', 'archetype')`,
    )
    .execute();

  await db.schema
    .alterTable("meta_decks")
    .addForeignKeyConstraint("meta_decks_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("meta_decks")
    .addForeignKeyConstraint("meta_decks_meta_event_id_fkey", ["meta_event_id"], "meta_events", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_meta_decks_event_finish")
    .on("meta_decks")
    .columns(["meta_event_id", "finish_tier"])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // A deckless player row cannot resurrect a deck that was deleted, so this is
  // schema fidelity rather than data fidelity: each one gets an empty
  // archive-owned deck and an 'archetype' meta_decks row, which is the shape
  // the pre-261 code reads. The deck reuses the player's own uuid, which is
  // what lets the rows below find each other without a mapping table.
  await sql`
    INSERT INTO decks (id, user_id, name, format, is_public)
    SELECT p.id, 'meta-archive', p.player_name, e.format, true
    FROM meta_event_players p
    JOIN meta_events e ON e.id = p.meta_event_id
    WHERE p.deck_id IS NULL
  `.execute(db);

  await sql`
    INSERT INTO meta_decks (
      deck_id, meta_event_id, player_name, finish_tier, record, list_status, created_at, updated_at
    )
    SELECT
      COALESCE(p.deck_id, p.id),
      p.meta_event_id,
      p.player_name,
      p."rank",
      CASE WHEN p.wins IS NOT NULL AND p.losses IS NOT NULL
           THEN p.wins || '-' || p.losses
                || CASE WHEN p.draws IS NOT NULL THEN '-' || p.draws ELSE '' END
      END,
      CASE WHEN p.list_status = 'none' THEN 'archetype' ELSE p.list_status END,
      p.created_at,
      p.updated_at
    FROM meta_event_players p
  `.execute(db);

  // ── meta_credits ─────────────────────────────────────────────────────────
  await db.schema.alterTable("meta_credits").addColumn("deck_id", "uuid").execute();

  await db.schema
    .alterTable("meta_credits")
    .addForeignKeyConstraint("meta_credits_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await sql`
    UPDATE meta_credits c
    SET deck_id = COALESCE(p.deck_id, p.id)
    FROM meta_event_players p
    WHERE p.id = c.meta_event_player_id
  `.execute(db);

  // Takes the uq_meta_credits_contribution built on it.
  await db.schema.alterTable("meta_credits").dropColumn("meta_event_player_id").execute();

  await sql`
    CREATE UNIQUE INDEX uq_meta_credits_contribution
      ON meta_credits (meta_event_id, user_id, deck_id) NULLS NOT DISTINCT
  `.execute(db);

  // ── candidate_meta_players → candidate_meta_decks ────────────────────────
  await renameConstraints(db, "candidate_meta_players", reversed(CANDIDATE_CONSTRAINT_RENAMES));
  await renameIndexes(db, reversed(CANDIDATE_INDEX_RENAMES));
  await db.schema.alterTable("candidate_meta_players").renameTo("candidate_meta_decks").execute();

  await sql`
    ALTER TABLE candidate_meta_decks ALTER COLUMN list_status SET DEFAULT 'full'
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks DROP CONSTRAINT chk_candidate_meta_players_list_status
  `.execute(db);
  await sql`
    UPDATE candidate_meta_decks SET list_status = 'archetype' WHERE list_status = 'none'
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks
    ADD CONSTRAINT chk_candidate_meta_decks_list_status
      CHECK (list_status IN ('full', 'partial', 'archetype'))
  `.execute(db);

  await sql`UPDATE candidate_meta_decks SET cards = '[]'::jsonb WHERE cards IS NULL`.execute(db);
  await sql`ALTER TABLE candidate_meta_decks ALTER COLUMN cards SET NOT NULL`.execute(db);

  for (const column of ["champion_card_id", "champion_name", "legend_card_id", "legend_name"]) {
    await db.schema.alterTable("candidate_meta_decks").dropColumn(column).execute();
  }

  await db.schema.alterTable("candidate_meta_decks").addColumn("name", "text").execute();
  await db.schema
    .alterTable("candidate_meta_decks")
    .addCheckConstraint(
      "chk_candidate_meta_decks_name",
      sql`name IS NULL OR length(name) BETWEEN 1 AND 120`,
    )
    .execute();

  await db.schema.alterTable("candidate_meta_decks").addColumn("record", "text").execute();
  await sql`
    UPDATE candidate_meta_decks
    SET record = wins || '-' || losses
                 || CASE WHEN draws IS NOT NULL THEN '-' || draws ELSE '' END
    WHERE wins IS NOT NULL AND losses IS NOT NULL
  `.execute(db);
  await db.schema
    .alterTable("candidate_meta_decks")
    .addCheckConstraint(
      "chk_candidate_meta_decks_record",
      sql`record IS NULL OR length(record) BETWEEN 1 AND 20`,
    )
    .execute();
  for (const column of ["draws", "losses", "wins"]) {
    await db.schema.alterTable("candidate_meta_decks").dropColumn(column).execute();
  }

  await db.schema.alterTable("candidate_meta_decks").renameColumn("rank", "finish_tier").execute();
  await db.schema.alterTable("candidate_meta_decks").dropColumn("rank_is_tier").execute();

  await db.schema.alterTable("candidate_meta_decks").addColumn("deck_id", "uuid").execute();
  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint("candidate_meta_decks_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("set null")
    .execute();
  await sql`
    UPDATE candidate_meta_decks c
    SET deck_id = COALESCE(p.deck_id, p.id)
    FROM meta_event_players p
    WHERE p.id = c.meta_event_player_id
  `.execute(db);
  await sql`
    CREATE INDEX idx_candidate_meta_decks_deck
    ON candidate_meta_decks (deck_id) WHERE (deck_id IS NOT NULL)
  `.execute(db);

  await db.schema.alterTable("candidate_meta_decks").dropColumn("meta_event_player_id").execute();

  // ── meta_submissions → meta_deck_submissions ─────────────────────────────
  await renameConstraints(db, "meta_submissions", reversed(SUBMISSION_CONSTRAINT_RENAMES));
  await renameIndexes(db, reversed(SUBMISSION_INDEX_RENAMES));
  await db.schema
    .alterTable("meta_submissions")
    .renameColumn("candidate_meta_player_id", "candidate_meta_deck_id")
    .execute();
  await db.schema.alterTable("meta_submissions").renameTo("meta_deck_submissions").execute();

  // ── ignored_candidate_meta_players → ignored_candidate_meta_decks ────────
  await renameConstraints(
    db,
    "ignored_candidate_meta_players",
    reversed(IGNORED_CONSTRAINT_RENAMES),
  );
  await db.schema
    .alterTable("ignored_candidate_meta_players")
    .renameTo("ignored_candidate_meta_decks")
    .execute();

  await db.schema.dropTable("meta_event_players").execute();
  await db.schema.dropTable("meta_sync_settings").execute();
  await db.schema.dropTable("meta_catalog_events").execute();

  // ── meta_deck_sources (migration 256) ────────────────────────────────────
  await db.schema
    .createTable("meta_deck_sources")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("deck_id", "uuid", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("event_external_id", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_deck_sources_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_meta_deck_sources_event_external_id", sql`event_external_id <> ''`)
    .addCheckConstraint("chk_meta_deck_sources_external_id", sql`external_id <> ''`)
    .execute();

  await db.schema
    .alterTable("meta_deck_sources")
    .addForeignKeyConstraint("meta_deck_sources_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_meta_deck_sources_deck")
    .on("meta_deck_sources")
    .column("deck_id")
    .execute();

  await db.schema
    .createIndex("uq_meta_deck_sources_key")
    .unique()
    .on("meta_deck_sources")
    .columns(["provider", "event_external_id", "external_id"])
    .execute();

  await sql`
    INSERT INTO meta_deck_sources (deck_id, provider, event_external_id, external_id)
    SELECT DISTINCT ON (ce.provider, ce.external_id, cd.external_id)
           cd.deck_id, ce.provider, ce.external_id, cd.external_id
      FROM candidate_meta_decks cd
      JOIN candidate_meta_events ce ON ce.id = cd.candidate_event_id
     WHERE cd.deck_id IS NOT NULL
  `.execute(db);
}
