import type { Kysely } from "kysely";
import { sql } from "kysely";

// Multi-source meta archive (ADR-014, amended 2026-08-18).
//
// The archive was built for one source per event. It has four: uvsgames,
// playriftbound.com, signed-in users, and hand entry. Two sources describing
// one tournament had nowhere to meet, because the live rows carried the source
// key: `meta_events.source_provider` + `source_external_id` under a partial
// unique index, and the same key on `meta_decks` as a triple. A second
// provider's candidate could only accept into a second live event.
//
// This moves to the ADR-008 printings model. `printings` carries no provider
// columns at all; `candidate_printings.printing_id` is a nullable FK, so many
// candidates point at one live printing and an admin assigns the link. The meta
// candidates already have that FK (`meta_event_id`, `deck_id`), so the fan-in
// only needed the live-side key to get out of the way.
//
// Five things happen here:
//
//   1. The five `source_*` columns come off `meta_events` / `meta_decks`.
//      Dropping a column takes its CHECK constraints and partial unique index
//      with it, so they are not dropped by name.
//   2. `meta_events.source_url` becomes `meta_event_sources`, a list, because
//      one event now owes a credit to every source that fed it.
//   3. `candidate_meta_decks` learns to hang off a live event directly, for a
//      user submitting one list against an event that already exists, and
//      gains the ADR-036 submitter columns.
//   4. `meta_credits` records who contributed what, opt-in via a new
//      `users.meta_credit_visibility` read at render time.
//   5. `meta_deck_submissions` is the ADR-036 outcome ledger for those users.
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── meta_event_sources ───────────────────────────────────────────────────
  // Citations, not contributors. A row says "this data came from there" and is
  // public; it never carries a user. Written when a provider's candidate is
  // linked and removed when it is unlinked, so an admin who linked a source and
  // then rejected all of its field values still credits it.
  //
  // provider/external_id are NULL together for a hand-entered citation: an
  // admin transcribing from a VOD or a photo of the standings board has
  // something to cite but no source key.
  await db.schema
    .createTable("meta_event_sources")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("meta_event_id", "uuid", (col) => col.notNull())
    .addColumn("provider", "text")
    .addColumn("external_id", "text")
    // What the event page prints: "uvsgames", "Twitch VOD".
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("source_url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint(
      "chk_meta_event_sources_key_shape",
      sql`(provider IS NULL) = (external_id IS NULL)`,
    )
    .addCheckConstraint("chk_meta_event_sources_provider", sql`provider IS NULL OR provider <> ''`)
    .addCheckConstraint(
      "chk_meta_event_sources_external_id",
      sql`external_id IS NULL OR external_id <> ''`,
    )
    .addCheckConstraint("chk_meta_event_sources_label", sql`length(label) BETWEEN 1 AND 60`)
    .addCheckConstraint(
      "chk_meta_event_sources_source_url",
      sql`source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000`,
    )
    .execute();

  await db.schema
    .alterTable("meta_event_sources")
    .addForeignKeyConstraint(
      "meta_event_sources_meta_event_id_fkey",
      ["meta_event_id"],
      "meta_events",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .createIndex("idx_meta_event_sources_event")
    .on("meta_event_sources")
    .column("meta_event_id")
    .execute();

  // One provider can cite an event once. Hand-entered rows are exempt: an
  // admin may reasonably cite two VODs for one event.
  await sql`
    CREATE UNIQUE INDEX uq_meta_event_sources_key
      ON meta_event_sources (provider, external_id)
      WHERE provider IS NOT NULL
  `.execute(db);

  // Backfill before the columns go. A live event that carried a source key
  // becomes a provider citation labelled with the provider name; one that only
  // carried a hand-typed URL becomes a hand-entered citation.
  await sql`
    INSERT INTO meta_event_sources (meta_event_id, provider, external_id, label, source_url)
    SELECT id, source_provider, source_external_id, source_provider, source_url
    FROM meta_events
    WHERE source_provider IS NOT NULL
  `.execute(db);

  await sql`
    INSERT INTO meta_event_sources (meta_event_id, provider, external_id, label, source_url)
    SELECT id, NULL, NULL, 'Source', source_url
    FROM meta_events
    WHERE source_provider IS NULL AND source_url IS NOT NULL
  `.execute(db);

  // ── Drop the live-side source key ────────────────────────────────────────
  // The link is the candidate-side FK from here on. A re-upload finds its live
  // target through its own candidate row, which is keyed (provider,
  // external_id) and survives every upload.
  for (const column of ["source_provider", "source_external_id", "source_url"]) {
    await db.schema.alterTable("meta_events").dropColumn(column).execute();
  }
  for (const column of ["source_provider", "source_external_id", "source_event_external_id"]) {
    await db.schema.alterTable("meta_decks").dropColumn(column).execute();
  }

  // ── candidate_meta_decks: a second kind of parent ────────────────────────
  // A provider deck hangs off its candidate event. A user submits one list for
  // an event the archive already has, so that deck hangs off the live event
  // instead, and no placeholder candidate event is invented for it.
  await sql`ALTER TABLE candidate_meta_decks ALTER COLUMN candidate_event_id DROP NOT NULL`.execute(
    db,
  );

  await db.schema.alterTable("candidate_meta_decks").addColumn("meta_event_id", "uuid").execute();
  await db.schema
    .alterTable("candidate_meta_decks")
    .addColumn("submitted_by_user_id", "text")
    .execute();
  await db.schema.alterTable("candidate_meta_decks").addColumn("submission_note", "text").execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint(
      "candidate_meta_decks_meta_event_id_fkey",
      ["meta_event_id"],
      "meta_events",
      ["id"],
    )
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addForeignKeyConstraint(
      "candidate_meta_decks_submitted_by_user_id_fkey",
      ["submitted_by_user_id"],
      "users",
      ["id"],
    )
    .onDelete("set null")
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addCheckConstraint(
      "chk_candidate_meta_decks_parent",
      sql`num_nonnulls(candidate_event_id, meta_event_id) = 1`,
    )
    .execute();

  await db.schema
    .alterTable("candidate_meta_decks")
    .addCheckConstraint("chk_candidate_meta_decks_submission_note", sql`submission_note <> ''`)
    .execute();

  // The review screen reads a live event's directly-attached submissions.
  await sql`
    CREATE INDEX idx_candidate_meta_decks_meta_event
      ON candidate_meta_decks (meta_event_id)
      WHERE meta_event_id IS NOT NULL
  `.execute(db);

  // uq_candidate_meta_decks_source covers the provider path; NULLs are distinct
  // there, so submissions need their own key. External ids are per-submission
  // uuids, so this only guards against a double insert.
  await sql`
    CREATE UNIQUE INDEX uq_candidate_meta_decks_submission
      ON candidate_meta_decks (meta_event_id, external_id)
      WHERE meta_event_id IS NOT NULL
  `.execute(db);

  // ── meta_credits ─────────────────────────────────────────────────────────
  // One row per contribution, written in the same transaction as the accept it
  // belongs to. Never for provider ingest or hand entry.
  //
  // The row holds the user id and nothing else. A frozen display name was
  // considered and rejected: a credit points at a person, so it follows their
  // rename, their profile fields, and their deletion without a sweep, and a
  // contributor total stays one bucket per person rather than one per spelling.
  await db.schema
    .createTable("meta_credits")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("meta_event_id", "uuid", (col) => col.notNull())
    // NULL credits the event itself, e.g. a user who proposed it.
    .addColumn("deck_id", "uuid")
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .alterTable("meta_credits")
    .addForeignKeyConstraint("meta_credits_meta_event_id_fkey", ["meta_event_id"], "meta_events", [
      "id",
    ])
    .onDelete("cascade")
    .execute();

  await db.schema
    .alterTable("meta_credits")
    .addForeignKeyConstraint("meta_credits_deck_id_fkey", ["deck_id"], "decks", ["id"])
    .onDelete("cascade")
    .execute();

  // Deleting an account takes its public credit with it.
  await db.schema
    .alterTable("meta_credits")
    .addForeignKeyConstraint("meta_credits_user_id_fkey", ["user_id"], "users", ["id"])
    .onDelete("cascade")
    .execute();

  // NULLS NOT DISTINCT so one user cannot hold two event-level credits for the
  // same event, while still holding one per deck they contributed.
  await sql`
    CREATE UNIQUE INDEX uq_meta_credits_contribution
      ON meta_credits (meta_event_id, user_id, deck_id) NULLS NOT DISTINCT
  `.execute(db);

  await db.schema
    .createIndex("idx_meta_credits_event")
    .on("meta_credits")
    .column("meta_event_id")
    .execute();

  await db.schema
    .createIndex("idx_meta_credits_user")
    .on("meta_credits")
    .column("user_id")
    .execute();

  // ── Credit visibility ────────────────────────────────────────────────────
  // Consent cannot be the credit row's existence, because the name is resolved
  // at render. Rows are always written; the public read drops anyone still on
  // 'hidden'. Opting in later credits every past contribution, opting out
  // removes them all, and neither touches an archive row.
  await db.schema
    .alterTable("users")
    .addColumn("meta_credit_visibility", "text", (col) => col.defaultTo("hidden").notNull())
    .execute();

  await db.schema
    .alterTable("users")
    .addCheckConstraint(
      "chk_users_meta_credit_visibility",
      sql`meta_credit_visibility IN ('hidden', 'name', 'riot_id')`,
    )
    .execute();

  // ── meta_deck_submissions ────────────────────────────────────────────────
  // The ADR-036 outcome ledger, shaped like card_submissions. Provider uploads
  // get none: those are the maintainer's own tooling, and staging's presence
  // semantics suffice. A person who submits needs to see what happened.
  await db.schema
    .createTable("meta_deck_submissions")
    .addColumn("id", "uuid", (col) => col.defaultTo(sql`uuidv7()`).primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    // Cleared when the candidate is accepted or deleted; the ledger row stays.
    .addColumn("candidate_meta_deck_id", "uuid")
    // The event the submission targets, when it targets an existing one.
    .addColumn("meta_event_id", "uuid")
    // What the submitter called the event, so a ledger row still reads right
    // when the target event was never created or has since been deleted.
    .addColumn("event_name", "text", (col) => col.notNull())
    .addColumn("player_name", "text", (col) => col.notNull())
    .addColumn("note", "text")
    .addColumn("status", "text", (col) => col.defaultTo("pending").notNull())
    .addColumn("resolution_reason", "text")
    .addColumn("resolution_note", "text")
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by_user_id", "text")
    .addColumn("accepted_deck_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addCheckConstraint("chk_meta_deck_submissions_provider", sql`provider <> ''`)
    .addCheckConstraint("chk_meta_deck_submissions_external_id", sql`external_id <> ''`)
    .addCheckConstraint(
      "chk_meta_deck_submissions_event_name",
      sql`length(event_name) BETWEEN 1 AND 120`,
    )
    .addCheckConstraint(
      "chk_meta_deck_submissions_player_name",
      sql`length(player_name) BETWEEN 1 AND 80`,
    )
    .addCheckConstraint("chk_meta_deck_submissions_note", sql`note <> ''`)
    .addCheckConstraint("chk_meta_deck_submissions_resolution_note", sql`resolution_note <> ''`)
    .addCheckConstraint(
      "chk_meta_deck_submissions_status",
      sql`status IN ('pending', 'accepted', 'already_correct', 'not_applied', 'rejected')`,
    )
    .addCheckConstraint(
      "chk_meta_deck_submissions_reason",
      sql`resolution_reason IS NULL OR resolution_reason IN ('duplicate', 'already_correct', 'unverified', 'incomplete_list', 'not_an_event')`,
    )
    .addCheckConstraint(
      "chk_meta_deck_submissions_resolved_at",
      sql`(status = 'pending') = (resolved_at IS NULL)`,
    )
    .execute();

  const submissionFks: [string, string, string, "cascade" | "set null"][] = [
    ["meta_deck_submissions_user_id_fkey", "user_id", "users", "cascade"],
    [
      "meta_deck_submissions_candidate_meta_deck_id_fkey",
      "candidate_meta_deck_id",
      "candidate_meta_decks",
      "set null",
    ],
    ["meta_deck_submissions_meta_event_id_fkey", "meta_event_id", "meta_events", "set null"],
    ["meta_deck_submissions_resolved_by_user_id_fkey", "resolved_by_user_id", "users", "set null"],
    ["meta_deck_submissions_accepted_deck_id_fkey", "accepted_deck_id", "decks", "set null"],
  ];
  for (const [name, column, target, onDelete] of submissionFks) {
    await db.schema
      .alterTable("meta_deck_submissions")
      .addForeignKeyConstraint(name, [column], target, ["id"])
      .onDelete(onDelete)
      .execute();
  }

  await sql`
    CREATE UNIQUE INDEX uq_meta_deck_submissions_provider_external
      ON meta_deck_submissions (provider, external_id)
  `.execute(db);

  await sql`
    CREATE INDEX idx_meta_deck_submissions_user_created
      ON meta_deck_submissions (user_id, created_at DESC, id DESC)
  `.execute(db);

  await db.schema
    .createIndex("idx_meta_deck_submissions_user_status")
    .on("meta_deck_submissions")
    .columns(["user_id", "status"])
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON meta_deck_submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("meta_deck_submissions").execute();

  await db.schema.alterTable("users").dropColumn("meta_credit_visibility").execute();

  await db.schema.dropTable("meta_credits").execute();

  await sql`DROP INDEX IF EXISTS uq_candidate_meta_decks_submission`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_candidate_meta_decks_meta_event`.execute(db);
  for (const column of ["submission_note", "submitted_by_user_id", "meta_event_id"]) {
    await db.schema.alterTable("candidate_meta_decks").dropColumn(column).execute();
  }
  // The parent CHECK went with meta_event_id; only the note's own check is left.
  await sql`
    ALTER TABLE candidate_meta_decks
    DROP CONSTRAINT IF EXISTS chk_candidate_meta_decks_submission_note
  `.execute(db);
  await sql`
    DELETE FROM candidate_meta_decks WHERE candidate_event_id IS NULL
  `.execute(db);
  await sql`
    ALTER TABLE candidate_meta_decks ALTER COLUMN candidate_event_id SET NOT NULL
  `.execute(db);

  // Restore the live-side source key and refill it from the citations.
  for (const table of ["meta_events", "meta_decks"]) {
    await db.schema.alterTable(table).addColumn("source_provider", "text").execute();
    await db.schema.alterTable(table).addColumn("source_external_id", "text").execute();
  }
  await db.schema.alterTable("meta_events").addColumn("source_url", "text").execute();
  await db.schema.alterTable("meta_decks").addColumn("source_event_external_id", "text").execute();

  // One column pair cannot hold a list, so an event that gained several
  // citations keeps exactly one of them here and loses the rest. The DISTINCT ON
  // deliberately prefers a provider row over a hand-entered one whatever order
  // they were written in, because the provider key is the half that ingest needs
  // to find this row again; a hand-typed VOD link is not recoverable data.
  await sql`
    UPDATE meta_events e
    SET source_provider = s.provider,
        source_external_id = s.external_id,
        source_url = s.source_url
    FROM (
      SELECT DISTINCT ON (meta_event_id) meta_event_id, provider, external_id, source_url
      FROM meta_event_sources
      ORDER BY meta_event_id, provider NULLS LAST, created_at
    ) s
    WHERE s.meta_event_id = e.id
  `.execute(db);

  // Deck keys are not in the citations, but they are still on the candidate
  // side, which is the whole point of the move: the candidate deck holds the
  // link and its own external id, and its parent candidate event holds the
  // provider and the event external id.
  //
  // This has to run. Without it every archived deck comes back with all three
  // columns NULL, and the pre-255 code that is live again after a rollback finds
  // a deck's provider through exactly those columns — so the next upload matches
  // nothing and proposes a duplicate candidate for every deck in the archive.
  //
  // A user submission attached straight to a live event has no parent candidate
  // event and no provider key, and never had source columns, so the join
  // correctly leaves it out.
  //
  // DISTINCT ON because a deck may legitimately carry two linked candidates
  // after 255 — that is the fan-in this migration exists to allow — and the one
  // column triple can only hold one of them. A plain join would let Postgres
  // pick arbitrarily; oldest candidate first makes it the source that
  // contributed the deck originally, and makes a re-run land the same way.
  await sql`
    UPDATE meta_decks d
    SET source_provider = s.provider,
        source_event_external_id = s.event_external_id,
        source_external_id = s.external_id
    FROM (
      SELECT DISTINCT ON (cd.deck_id)
             cd.deck_id,
             ce.provider,
             ce.external_id AS event_external_id,
             cd.external_id
      FROM candidate_meta_decks cd
      JOIN candidate_meta_events ce ON ce.id = cd.candidate_event_id
      WHERE cd.deck_id IS NOT NULL
      ORDER BY cd.deck_id, cd.created_at, cd.id
    ) s
    WHERE s.deck_id = d.deck_id
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_events_source
      ON meta_events (source_provider, source_external_id)
      WHERE source_provider IS NOT NULL AND source_external_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_meta_decks_source
      ON meta_decks (source_provider, source_event_external_id, source_external_id)
      WHERE source_provider IS NOT NULL
        AND source_event_external_id IS NOT NULL
        AND source_external_id IS NOT NULL
  `.execute(db);

  // Dropping the columns in up() took these with them. Migrations 235, 236 and
  // 253 all drop them by name in their own down(), so a full rollback walk
  // fails unless they are back.
  const restoredChecks: [string, string, string][] = [
    ["meta_events", "chk_meta_events_source_provider", "source_provider <> ''"],
    ["meta_events", "chk_meta_events_source_external_id", "source_external_id <> ''"],
    [
      "meta_events",
      "chk_meta_events_source_url",
      "source_url IS NULL OR length(source_url) BETWEEN 1 AND 2000",
    ],
    [
      "meta_events",
      "chk_meta_events_source_shape",
      "(source_provider IS NULL) = (source_external_id IS NULL)",
    ],
    ["meta_decks", "chk_meta_decks_source_provider", "source_provider <> ''"],
    ["meta_decks", "chk_meta_decks_source_external_id", "source_external_id <> ''"],
    ["meta_decks", "chk_meta_decks_source_event_external_id", "source_event_external_id <> ''"],
    [
      "meta_decks",
      "chk_meta_decks_source_shape",
      "num_nonnulls(source_provider, source_event_external_id, source_external_id) IN (0, 3)",
    ],
  ];
  for (const [table, name, expression] of restoredChecks) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD CONSTRAINT ${sql.ref(name)} CHECK (${sql.raw(expression)})
    `.execute(db);
  }

  await db.schema.dropTable("meta_event_sources").execute();
}
