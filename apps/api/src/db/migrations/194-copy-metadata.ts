import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * ADR-038: per-copy metadata (condition, grading, notes, links).
 *
 * - `conditions` (Cardmarket scale) and `graders` reference tables, shaped and
 *   protected like the migration-062 reference tables.
 * - `copies` gains nullable metadata columns. A copy is either ungraded with
 *   an optional condition, or graded with grader plus grade and no condition.
 * - `grade` is double precision so postgres.js returns a JS number (numeric
 *   comes back as a string); half steps are exact in binary floats, so the
 *   half-step check is safe.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE conditions (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE graders (
      slug        TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      sort_order  SMALLINT NOT NULL,
      is_well_known BOOLEAN NOT NULL DEFAULT FALSE
    )
  `.execute(db);

  await sql`
    INSERT INTO conditions (slug, label, sort_order, is_well_known) VALUES
      ('mint',         'Mint',         0, TRUE),
      ('near-mint',    'Near Mint',    1, TRUE),
      ('excellent',    'Excellent',    2, TRUE),
      ('good',         'Good',         3, TRUE),
      ('light-played', 'Light Played', 4, TRUE),
      ('played',       'Played',       5, TRUE),
      ('poor',         'Poor',         6, TRUE);

    INSERT INTO graders (slug, label, sort_order, is_well_known) VALUES
      ('psa', 'PSA', 0, TRUE),
      ('bgs', 'BGS', 1, TRUE),
      ('cgc', 'CGC', 2, TRUE),
      ('sgc', 'SGC', 3, TRUE),
      ('tag', 'TAG', 4, TRUE)
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_conditions_protect_well_known
      BEFORE UPDATE OR DELETE ON conditions
      FOR EACH ROW EXECUTE FUNCTION protect_well_known();

    CREATE TRIGGER trg_graders_protect_well_known
      BEFORE UPDATE OR DELETE ON graders
      FOR EACH ROW EXECUTE FUNCTION protect_well_known()
  `.execute(db);

  await sql`
    ALTER TABLE copies
      ADD COLUMN condition     TEXT REFERENCES conditions(slug),
      ADD COLUMN grader        TEXT REFERENCES graders(slug),
      ADD COLUMN grade         DOUBLE PRECISION,
      ADD COLUMN notes_public  TEXT,
      ADD COLUMN notes_private TEXT,
      ADD COLUMN is_altered    BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN links         JSONB NOT NULL DEFAULT '[]',
      ADD CONSTRAINT chk_copies_grade_half_steps
        CHECK (grade IS NULL OR (grade >= 1 AND grade <= 10 AND grade * 2 = trunc(grade * 2))),
      ADD CONSTRAINT chk_copies_grader_with_grade
        CHECK ((grader IS NULL) = (grade IS NULL)),
      ADD CONSTRAINT chk_copies_condition_or_graded
        CHECK (condition IS NULL OR grader IS NULL)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE copies
      DROP CONSTRAINT chk_copies_condition_or_graded,
      DROP CONSTRAINT chk_copies_grader_with_grade,
      DROP CONSTRAINT chk_copies_grade_half_steps,
      DROP COLUMN condition,
      DROP COLUMN grader,
      DROP COLUMN grade,
      DROP COLUMN notes_public,
      DROP COLUMN notes_private,
      DROP COLUMN is_altered,
      DROP COLUMN links
  `.execute(db);

  await sql`
    DROP TRIGGER trg_conditions_protect_well_known ON conditions;
    DROP TRIGGER trg_graders_protect_well_known ON graders;
    DROP TABLE conditions;
    DROP TABLE graders
  `.execute(db);
}
