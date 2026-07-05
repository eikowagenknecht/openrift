import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Detach the host from a tournament instead of erasing the event when the
 * host account (or host organization) is deleted.
 *
 * Both host FKs were `ON DELETE CASCADE`, so a solo host deleting their
 * account from the profile danger zone silently erased every tournament they
 * hosted — rounds, pods, deck checks, and all participants' results — for
 * everyone who played in them. The org path had the same hole one hop out:
 * deleting a user cascades their owned organizations, which cascaded the
 * org-hosted tournaments.
 *
 * Now both FKs are `ON DELETE SET NULL` and `chk_tournaments_host` no longer
 * requires the same-side host id to be present: a `host_type = 'user'` row
 * with a NULL `host_user_id` reads as "deleted host" (the public route
 * already renders the "Host" fallback for it). The cross-side column staying
 * NULL is still enforced.
 *
 * @returns Resolves once the FKs and CHECK are swapped.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tournaments
      DROP CONSTRAINT chk_tournaments_host,
      ADD CONSTRAINT chk_tournaments_host CHECK (
        ((host_type = 'user') AND (host_org_id IS NULL))
        OR ((host_type = 'organization') AND (host_user_id IS NULL))
      );

    ALTER TABLE tournaments
      DROP CONSTRAINT tournaments_host_user_fkey,
      ADD CONSTRAINT tournaments_host_user_fkey
        FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE tournaments
      DROP CONSTRAINT tournaments_host_org_fkey,
      ADD CONSTRAINT tournaments_host_org_fkey
        FOREIGN KEY (host_org_id) REFERENCES organizations(id) ON DELETE SET NULL
  `.execute(db);
}

/**
 * @returns Resolves once the original cascading FKs and strict CHECK are
 *   restored. Rows already detached (NULL same-side host id) violate the
 *   strict CHECK, so they are deleted first — matching what the old cascade
 *   would have done to them.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM tournaments
      WHERE (host_type = 'user' AND host_user_id IS NULL)
         OR (host_type = 'organization' AND host_org_id IS NULL);

    ALTER TABLE tournaments
      DROP CONSTRAINT chk_tournaments_host,
      ADD CONSTRAINT chk_tournaments_host CHECK (
        ((host_type = 'user') AND (host_user_id IS NOT NULL) AND (host_org_id IS NULL))
        OR ((host_type = 'organization') AND (host_org_id IS NOT NULL) AND (host_user_id IS NULL))
      );

    ALTER TABLE tournaments
      DROP CONSTRAINT tournaments_host_user_fkey,
      ADD CONSTRAINT tournaments_host_user_fkey
        FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE;

    ALTER TABLE tournaments
      DROP CONSTRAINT tournaments_host_org_fkey,
      ADD CONSTRAINT tournaments_host_org_fkey
        FOREIGN KEY (host_org_id) REFERENCES organizations(id) ON DELETE CASCADE
  `.execute(db);
}
