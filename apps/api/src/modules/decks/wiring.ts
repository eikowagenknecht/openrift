import type { Kysely } from "kysely";

import type { Database } from "../../db/tables.js";
import { deckFoldersRepo } from "./repositories/deck-folders.js";
import { deckFormatsRepo } from "./repositories/deck-formats.js";
import { deckPlansRepo } from "./repositories/deck-plans.js";
import { deckZonesRepo } from "./repositories/deck-zones.js";
import { decksRepo } from "./repositories/decks.js";

export interface DecksRepos {
  deckFolders: ReturnType<typeof deckFoldersRepo>;
  deckFormats: ReturnType<typeof deckFormatsRepo>;
  deckPlans: ReturnType<typeof deckPlansRepo>;
  deckZones: ReturnType<typeof deckZonesRepo>;
  decks: ReturnType<typeof decksRepo>;
}

export function createDecksRepos(db: Kysely<Database>): DecksRepos {
  return {
    deckFolders: deckFoldersRepo(db),
    deckFormats: deckFormatsRepo(db),
    deckPlans: deckPlansRepo(db),
    deckZones: deckZonesRepo(db),
    decks: decksRepo(db),
  };
}
