import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Sync-engine support queries (ADR-027 step 2). Electric tags every change on
 * its replication stream with the originating Postgres transaction id;
 * mutation endpoints capture that id inside their transaction and return it,
 * so the client can drop its optimistic state the moment the same change
 * arrives back through the shape stream.
 *
 * @returns An object with sync query methods bound to the given `db`.
 */
export function syncRepo(db: Kysely<Database>) {
  return {
    /**
     * The current transaction's id as a 32-bit Postgres xid. Must be called on
     * transaction-bound repos (inside `transact`) — on a plain connection each
     * statement gets its own transaction and the returned id would never match
     * the mutation's. The `::xid` cast drops the epoch from `xid8`, matching
     * the value Electric puts in its `txids` message headers.
     *
     * @returns The transaction id as a number.
     */
    async currentTransactionId(): Promise<number> {
      const result = await sql<{
        txid: string;
      }>`SELECT pg_current_xact_id()::xid::text AS txid`.execute(db);
      return Number(result.rows[0].txid);
    },
  };
}
