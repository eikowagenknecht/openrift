import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { listsCoreRepo } from "./lists-core.js";
import { listEntriesRepo } from "./lists-entries.js";
import { listRulesRepo } from "./lists-rules.js";
import type { ListRuleProviders } from "./lists-rules.js";
import { listsSharingRepo } from "./lists-sharing.js";

export function listsRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    ...listsCoreRepo(db),
    ...listsSharingRepo(db),
    ...listRulesRepo(db, providers),
    ...listEntriesRepo(db),
  };
}
