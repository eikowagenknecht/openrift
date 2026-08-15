import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Moves the three trade-email kill switches from `feature_flags` to
 * `site_settings` (ADR-030).
 *
 * They were never rollout gates: the emails shipped on, and the switches exist
 * to stop a send path that is misbehaving. A feature flag is temporary by
 * design and gets deleted once its feature lands, so standing operational
 * config does not belong there. As api-scoped settings they stay server-only —
 * the public `/api/v1/site-settings` route reads the `web` scope alone.
 *
 * The state carries over rather than being seeded flat: a flag someone had
 * already turned off becomes `"false"`, so this migration cannot silently
 * resume a send path that was deliberately stopped. A key with no flag row
 * gets no setting row either, which both sides read as "on".
 */
const KEYS = sql`('trade-request-email', 'trade-match-digest', 'trade-status-email')`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO site_settings (key, value, scope)
    SELECT key, CASE WHEN enabled THEN 'true' ELSE 'false' END, 'api'
    FROM feature_flags
    WHERE key IN ${KEYS}
    ON CONFLICT (key) DO NOTHING
  `.execute(db);

  // user_feature_flags.flag_key cascades, so any per-user override goes too.
  await sql`DELETE FROM feature_flags WHERE key IN ${KEYS}`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO feature_flags (key, enabled, description)
    SELECT
      key,
      value <> 'false',
      CASE key
        WHEN 'trade-request-email' THEN 'Instant trade-request emails (ADR-030). On by default — turn OFF to stop sending'
        WHEN 'trade-match-digest' THEN 'Daily trade match digest (ADR-030). On by default — turn OFF to stop sending'
        ELSE 'Trade status emails: accepted / declined / cancelled (ADR-030). On by default — turn OFF to stop sending'
      END
    FROM site_settings
    WHERE key IN ${KEYS}
    ON CONFLICT (key) DO NOTHING
  `.execute(db);

  await sql`DELETE FROM site_settings WHERE key IN ${KEYS}`.execute(db);
}
