import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { cardTradeCopiesRepo } from "./card-trades-copies.js";
import { cardTradeEmailsRepo } from "./card-trades-emails.js";
import { cardTradeReadsRepo } from "./card-trades-reads.js";
import { cardTradeTransitionsRepo } from "./card-trades-transitions.js";
import { cardTradeWritesRepo } from "./card-trades-writes.js";

/**
 * Trade execution data access. Pure queries/mutations — the orchestration
 * (validation, reservation transactions, copy-mutation sync) lives in the
 * card-trades *service*. `updated_at` is maintained explicitly here on real
 * transitions only (not on the private sync-applied writes), driving the
 * newest-first ordering of a member's trade list.
 */
export function cardTradesRepo(db: Kysely<Database>) {
  return {
    ...cardTradeWritesRepo(db),
    ...cardTradeReadsRepo(db),
    ...cardTradeEmailsRepo(db),
    ...cardTradeCopiesRepo(db),
    ...cardTradeTransitionsRepo(db),
  };
}
