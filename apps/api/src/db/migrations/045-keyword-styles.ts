import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE keyword_styles (
      name       TEXT PRIMARY KEY CHECK (name <> ''),
      color      TEXT NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
      dark_text  BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER keyword_styles_set_updated_at
    BEFORE UPDATE ON keyword_styles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  await sql`
    INSERT INTO keyword_styles (name, color, dark_text) VALUES
      ('Accelerate',    '#24705f', false),
      ('Action',        '#24705f', false),
      ('Ambush',        '#24705f', false),
      ('Assault',       '#cd346f', false),
      ('Backline',      '#cd346f', false),
      ('Buff',          '#707070', false),
      ('Deathknell',    '#95b229', true),
      ('Deflect',       '#95b229', true),
      ('Equip',         '#707070', false),
      ('Ganking',       '#95b229', true),
      ('Hidden',        '#24705f', false),
      ('Hunt',          '#95b229', true),
      ('Legion',        '#24705f', false),
      ('Level',         '#95b229', true),
      ('Mighty',        '#707070', false),
      ('Predict',       '#707070', false),
      ('Quick-Draw',    '#24705f', false),
      ('Reaction',      '#24705f', false),
      ('Repeat',        '#24705f', false),
      ('Shield',        '#cd346f', false),
      ('Stun',          '#707070', false),
      ('Tank',          '#cd346f', false),
      ('Temporary',     '#95b229', true),
      ('Unique',        '#24705f', false),
      ('Vision',        '#707070', false),
      ('Weaponmaster',  '#707070', false)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS keyword_styles`.execute(db);
}
