import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE lists ADD COLUMN cardmarket_sync boolean NOT NULL DEFAULT false
  `.execute(db);

  await sql`
    ALTER TABLE lists ADD CONSTRAINT chk_lists_cardmarket_sync_trade_only
      CHECK (intent = 'trade' OR cardmarket_sync = false)
  `.execute(db);

  await sql`
    CREATE TABLE cardmarket_sync_state (
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      printing_id uuid NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
      condition text NOT NULL REFERENCES conditions(slug),
      is_altered boolean NOT NULL,
      intent_base integer NOT NULL DEFAULT 0,
      observed_base integer NOT NULL DEFAULT 0,
      unmanaged integer NOT NULL DEFAULT 0,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, printing_id, condition, is_altered),
      CONSTRAINT chk_cardmarket_sync_state_counts
        CHECK (intent_base >= 0 AND observed_base >= 0 AND unmanaged >= 0)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_cardmarket_sync_state_user ON cardmarket_sync_state (user_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE cardmarket_sync_state`.execute(db);
  await sql`ALTER TABLE lists DROP CONSTRAINT chk_lists_cardmarket_sync_trade_only`.execute(db);
  await sql`ALTER TABLE lists DROP COLUMN cardmarket_sync`.execute(db);
}
