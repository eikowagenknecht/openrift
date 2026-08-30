import type { Kysely } from "kysely";
import { sql } from "kysely";

// The catalogue mirror becomes what it always was, one source's event listing,
// and the two vocabularies the source publishes become admin-curated tables.
//
// `meta_catalog_events` was named and keyed for a second provider that does not
// exist and has no crawl scheduler to run it. Its shape is uvsgames' listing
// row, field for field, so it is renamed to `uvsgames_events` and keyed on the
// source's own id alone. Candidates keep their `provider` column: those really
// do arrive from several sources, including user submissions.
//
// The two new tables replace constants that were compiled into the code. Which
// event templates are the official programme's, and which source format strings
// map to a `deck_formats` slug, are both facts about the source that change
// without a deploy: a new template appears the week a new event series starts.
// Rows are discovered rather than declared, and the admin supplies only the
// judgment, a watch flag for a template and a mapping for a format.
//
// Absence is meaningful in both tables. A template with no row is unwatched; a
// format with no row maps to nothing, so an event carrying it is never accepted
// automatically.

const CHECK_SUFFIXES = [
  "check_stage",
  "content_hash",
  "display_status",
  "external_id",
  "name",
  "player_count",
] as const;

// Postgres 18 catalogues NOT NULL constraints under names of their own, which
// keep the old table name until they are renamed alongside the CHECKs.
const NOT_NULL_COLUMNS = [
  "content_hash",
  "display_status",
  "external_id",
  "first_seen_at",
  "last_seen_at",
  "name",
  "start_at",
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE meta_catalog_events RENAME TO uvsgames_events`.execute(db);

  // Dropping the column takes the composite primary key and the provider CHECK
  // with it; the template index is dropped explicitly because it is rebuilt
  // below without the leading column.
  await sql`DROP INDEX idx_meta_catalog_events_template`.execute(db);
  await sql`ALTER TABLE uvsgames_events DROP COLUMN provider`.execute(db);
  await sql`ALTER TABLE uvsgames_events ADD CONSTRAINT uvsgames_events_pkey PRIMARY KEY (external_id)`.execute(
    db,
  );

  for (const suffix of CHECK_SUFFIXES) {
    await sql`
      ALTER TABLE uvsgames_events
        RENAME CONSTRAINT ${sql.raw(`chk_meta_catalog_events_${suffix}`)}
                       TO ${sql.raw(`chk_uvsgames_events_${suffix}`)}
    `.execute(db);
  }

  for (const column of NOT_NULL_COLUMNS) {
    await sql`
      ALTER TABLE uvsgames_events
        RENAME CONSTRAINT ${sql.raw(`meta_catalog_events_${column}_not_null`)}
                       TO ${sql.raw(`uvsgames_events_${column}_not_null`)}
    `.execute(db);
  }

  await sql`ALTER INDEX idx_meta_catalog_events_start RENAME TO idx_uvsgames_events_start`.execute(
    db,
  );
  await sql`ALTER INDEX idx_meta_catalog_events_recheck RENAME TO idx_uvsgames_events_recheck`.execute(
    db,
  );

  await sql`
    CREATE INDEX idx_uvsgames_events_template
      ON uvsgames_events (event_configuration_template)
      WHERE event_configuration_template IS NOT NULL
  `.execute(db);

  // ── uvsgames_event_templates ─────────────────────────────────────────────
  // The source publishes its whole template vocabulary, names included, at
  // /api/v2/event-configuration-templates/?game_slug=riftbound, so the sync
  // fills this table and the admin only decides which templates to watch.
  // `source_name` is nullable for the one case the endpoint cannot answer: a
  // template id an event still carries after the source retired it, which the
  // crawl discovers from `uvsgames_events` and nothing can name.
  await sql`
    CREATE TABLE uvsgames_event_templates (
      template_id text PRIMARY KEY,
      source_name text,
      watched boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_event_templates_template_id CHECK (template_id <> ''),
      CONSTRAINT chk_uvsgames_event_templates_source_name
        CHECK (source_name IS NULL OR (length(source_name) >= 1 AND length(source_name) <= 200))
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON uvsgames_event_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Only the judgment is seeded. The next sync fills the name.
  await sql`
    INSERT INTO uvsgames_event_templates (template_id, watched)
    VALUES ('0cbcab3e-be80-4d1d-a450-9485e584906d', true)
  `.execute(db);

  // ── uvsgames_format_mappings ─────────────────────────────────────────────
  // The source's format vocabulary, mapped to ours. A row exists only for a
  // format that maps: the archive would rather leave a sealed event in the
  // human queue than file it as constructed, so an unmapped format is the
  // default and deleting a row un-maps it.
  await sql`
    CREATE TABLE uvsgames_format_mappings (
      source_format text PRIMARY KEY,
      mapped_format text NOT NULL REFERENCES deck_formats(slug),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_uvsgames_format_mappings_source_format CHECK (source_format <> '')
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON uvsgames_format_mappings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    INSERT INTO uvsgames_format_mappings (source_format, mapped_format)
    VALUES ('Constructed', 'constructed')
  `.execute(db);
}

// Restores the provider dimension with the only value it ever held, so the
// composite key and the old names come back exactly as they were. The two
// vocabulary tables are dropped: their content is one seeded row each plus
// whatever an admin curated, and the code that reads them goes with this.
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE uvsgames_format_mappings`.execute(db);
  await sql`DROP TABLE uvsgames_event_templates`.execute(db);

  await sql`DROP INDEX idx_uvsgames_events_template`.execute(db);
  await sql`ALTER TABLE uvsgames_events DROP CONSTRAINT uvsgames_events_pkey`.execute(db);
  await sql`ALTER TABLE uvsgames_events ADD COLUMN provider text NOT NULL DEFAULT 'uvsgames'`.execute(
    db,
  );
  await sql`ALTER TABLE uvsgames_events ALTER COLUMN provider DROP DEFAULT`.execute(db);
  await sql`
    ALTER TABLE uvsgames_events
      ADD CONSTRAINT meta_catalog_events_pkey PRIMARY KEY (provider, external_id)
  `.execute(db);
  await sql`
    ALTER TABLE uvsgames_events
      ADD CONSTRAINT chk_meta_catalog_events_provider CHECK (provider <> '')
  `.execute(db);

  for (const suffix of CHECK_SUFFIXES) {
    await sql`
      ALTER TABLE uvsgames_events
        RENAME CONSTRAINT ${sql.raw(`chk_uvsgames_events_${suffix}`)}
                       TO ${sql.raw(`chk_meta_catalog_events_${suffix}`)}
    `.execute(db);
  }

  for (const column of NOT_NULL_COLUMNS) {
    await sql`
      ALTER TABLE uvsgames_events
        RENAME CONSTRAINT ${sql.raw(`uvsgames_events_${column}_not_null`)}
                       TO ${sql.raw(`meta_catalog_events_${column}_not_null`)}
    `.execute(db);
  }

  await sql`ALTER INDEX idx_uvsgames_events_start RENAME TO idx_meta_catalog_events_start`.execute(
    db,
  );
  await sql`ALTER INDEX idx_uvsgames_events_recheck RENAME TO idx_meta_catalog_events_recheck`.execute(
    db,
  );

  await sql`
    CREATE INDEX idx_meta_catalog_events_template
      ON uvsgames_events (provider, event_configuration_template)
      WHERE event_configuration_template IS NOT NULL
  `.execute(db);

  await sql`ALTER TABLE uvsgames_events RENAME TO meta_catalog_events`.execute(db);
}
