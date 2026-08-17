import type { Kysely } from "kysely";
import { sql } from "kysely";

// Three leftovers from the schema review, none of which change any row's meaning.
//
// `overlay_channels.version` is a poll counter the OBS browser source compares
// against; it is bumped by one per payload write, of which there is at most one
// per stream event. `bigint` bought nothing and cost honesty: postgres.js hands
// back int8 as a *string*, so the repository's `Generated<number>` was a lie
// papered over by a `Number(row.version)` coercion at every read. As `integer`
// the driver returns a real number and the coercion goes away.
//
// Three tables still defaulted their uuid primary key to `gen_random_uuid()`.
// Everything else in the schema moved to `uuidv7()`, whose time-ordered keys keep
// inserts appending to the right edge of the index instead of scattering. These
// three were missed. Existing v4 keys stay as they are — the column is a uuid
// either way and nothing reads a version out of it.
//
// `card_name_aliases_set_norm_name()` called itself a safety net for raw values
// and then returned NEW untouched, and was attached to nothing. `norm_name` is
// this table's primary key, so an unnormalised value silently creates a lookup
// key nothing can ever match. It now applies the same normalisation as
// `cards_set_norm_name()` and is attached as a real trigger. Unlike `cards`,
// which derives the key from a separate `name` column, this table stores only
// the key, so the trigger normalises the column in place — idempotent, and every
// existing row already satisfies it.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE overlay_channels ALTER COLUMN version TYPE integer`.execute(db);

  await sql`ALTER TABLE job_runs ALTER COLUMN id SET DEFAULT uuidv7()`.execute(db);
  await sql`ALTER TABLE printing_events ALTER COLUMN id SET DEFAULT uuidv7()`.execute(db);
  await sql`ALTER TABLE rules ALTER COLUMN id SET DEFAULT uuidv7()`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION card_name_aliases_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := regexp_replace(lower(NEW.norm_name), '[^[:alnum:]]', '', 'g');
      RETURN NEW;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_card_name_aliases_norm_name
    BEFORE INSERT OR UPDATE OF norm_name ON card_name_aliases
    FOR EACH ROW EXECUTE FUNCTION card_name_aliases_set_norm_name()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS trg_card_name_aliases_norm_name ON card_name_aliases
  `.execute(db);
  await sql`
    CREATE OR REPLACE FUNCTION card_name_aliases_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- norm_name is set directly by the application; this trigger is a safety net
      -- in case someone inserts with a raw value that needs normalising.
      RETURN NEW;
    END;
    $$
  `.execute(db);

  await sql`ALTER TABLE rules ALTER COLUMN id SET DEFAULT gen_random_uuid()`.execute(db);
  await sql`ALTER TABLE printing_events ALTER COLUMN id SET DEFAULT gen_random_uuid()`.execute(db);
  await sql`ALTER TABLE job_runs ALTER COLUMN id SET DEFAULT gen_random_uuid()`.execute(db);

  await sql`ALTER TABLE overlay_channels ALTER COLUMN version TYPE bigint`.execute(db);
}
