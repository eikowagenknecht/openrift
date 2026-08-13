import type { Kysely } from "kysely";
import { sql } from "kysely";

// Release dates are per language, not per set: a set ships in English months
// before it reaches French or Korean, and may never reach some languages at
// all. `sets.released_at` / `sets.released` are replaced by one row per
// (set, language).
//
// `released` is gone as stored data — it is derived from the date, so the two
// can no longer disagree. A row's `released_at` holds the FIRST day of the
// known period and `precision` says how wide that period is, so a set we only
// date to "Q2 2026" is still expressible. A NULL date means announced with no
// date yet, which always reads as unreleased: anything actually on shelves can
// be given at least year precision, so NULL can only mean "not out".
//
// An absent row means the set is not announced for that language. That does
// not distinguish "not announced" from "never coming" — deliberately, until
// a language is actually confirmed as skipped.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType("release_precision")
    .asEnum(["day", "month", "quarter", "year"])
    .execute();

  await db.schema
    .createTable("set_releases")
    .addColumn("set_id", "uuid", (col) => col.notNull().references("sets.id").onDelete("cascade"))
    .addColumn("language", "text", (col) =>
      col.notNull().references("languages.code").onUpdate("cascade"),
    )
    .addColumn("released_at", "date")
    .addColumn("precision", sql`release_precision`)
    .addColumn("created_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`now()`).notNull())
    .addPrimaryKeyConstraint("set_releases_pkey", ["set_id", "language"])
    .addCheckConstraint(
      "chk_set_releases_precision",
      sql`(released_at IS NULL) = (precision IS NULL)`,
    )
    // The stored date is always the first day of its period. Enforcing that
    // here keeps the "last day of the period" maths (which derives released)
    // and the display formatter from having to guess what the date means.
    .addCheckConstraint(
      "chk_set_releases_period_start",
      sql`
        released_at IS NULL
        OR precision = 'day'
        OR (precision = 'month' AND extract(day from released_at) = 1)
        OR (
          precision = 'quarter'
          AND extract(day from released_at) = 1
          AND extract(month from released_at) IN (1, 4, 7, 10)
        )
        OR (precision = 'year' AND extract(doy from released_at) = 1)
      `,
    )
    .execute();

  await sql`
    CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON set_releases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Backfill: every language a set already has printings in gets a row, so
  // nothing silently disappears from the admin UI. The old global date carries
  // over at day precision. Wrong for the non-English languages (they did not
  // ship on the English date), but no more wrong than the single global date
  // was, and it gives admins rows to correct.
  //
  // The date is dropped (leaving the language announced but undated) whenever
  // keeping it would change what users see today: a set with no date at all,
  // and a set flagged NOT released whose date has already passed — that one
  // would flip to released under the derived rule. Both stay previews until
  // someone enters the real date.
  await sql`
    INSERT INTO set_releases (set_id, language, released_at, precision)
    SELECT DISTINCT
      p.set_id,
      p.language,
      CASE
        WHEN s.released_at IS NOT NULL AND (s.released OR s.released_at > current_date)
        THEN s.released_at
      END,
      CASE
        WHEN s.released_at IS NOT NULL AND (s.released OR s.released_at > current_date)
        THEN 'day'::release_precision
      END
    FROM printings p
    JOIN sets s ON s.id = p.set_id
  `.execute(db);

  await db.schema.alterTable("sets").dropColumn("released_at").execute();
  await db.schema.alterTable("sets").dropColumn("released").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sets")
    .addColumn("released_at", "date")
    .addColumn("released", sql`boolean`, (col) => col.notNull().defaultTo(true))
    .execute();

  // Collapse back to one global date: the earliest known release across
  // languages, and released if any language's date has passed.
  await sql`
    UPDATE sets s
    SET released_at = r.first_release,
        released = r.any_released
    FROM (
      SELECT set_id,
             min(released_at) AS first_release,
             bool_or(released_at IS NOT NULL AND released_at <= current_date) AS any_released
      FROM set_releases
      GROUP BY set_id
    ) r
    WHERE r.set_id = s.id
  `.execute(db);

  await db.schema.dropTable("set_releases").execute();
  await db.schema.dropType("release_precision").execute();
}
