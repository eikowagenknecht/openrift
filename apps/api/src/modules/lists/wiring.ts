import type { Kysely } from "kysely";

import type { Database } from "../../db/tables.js";
import type { ListRuleProviders } from "./repositories/lists-rules.js";
import { listsRepo } from "./repositories/lists.js";
import { moveListEntries } from "./services/lists.js";

export interface ListsRepos {
  lists: ReturnType<typeof listsRepo>;
}

export interface ListsServices {
  moveListEntries: typeof moveListEntries;
}

export function createListsRepos(db: Kysely<Database>, providers: ListRuleProviders): ListsRepos {
  return {
    lists: listsRepo(db, providers),
  };
}

export function createListsServices(): ListsServices {
  return { moveListEntries };
}
