import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * API keys for the better-auth `@better-auth/api-key` plugin (script access to
 * admin endpoints, e.g. candidate uploads). Column set mirrors the plugin's
 * `apikey` schema; names are mapped to snake_case via the plugin's `schema`
 * option in auth.ts. `key` stores the hash, `start` the first characters for
 * display. `reference_id` is the owning user (org-owned keys are unused, so
 * the FK to users is safe). Millisecond durations are INTEGER on purpose:
 * postgres.js returns BIGINT as strings, which would break the plugin's
 * rate-limit arithmetic, and our windows fit int4 comfortably.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE api_keys (
      id                      TEXT PRIMARY KEY,
      config_id               TEXT NOT NULL DEFAULT 'default',
      name                    TEXT,
      start                   TEXT,
      prefix                  TEXT,
      key                     TEXT NOT NULL,
      reference_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refill_interval         INTEGER,
      refill_amount           INTEGER,
      last_refill_at          TIMESTAMPTZ,
      enabled                 BOOLEAN NOT NULL DEFAULT true,
      rate_limit_enabled      BOOLEAN NOT NULL DEFAULT true,
      rate_limit_time_window  INTEGER,
      rate_limit_max          INTEGER,
      request_count           INTEGER NOT NULL DEFAULT 0,
      remaining               INTEGER,
      last_request            TIMESTAMPTZ,
      expires_at              TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      permissions             TEXT,
      metadata                TEXT
    )
  `.execute(db);
  await sql`CREATE INDEX idx_api_keys_key ON api_keys (key)`.execute(db);
  await sql`CREATE INDEX idx_api_keys_reference_id ON api_keys (reference_id)`.execute(db);
  await sql`CREATE INDEX idx_api_keys_config_id ON api_keys (config_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE api_keys`.execute(db);
}
