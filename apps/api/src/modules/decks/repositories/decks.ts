import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { decksCardsRepo } from "./decks-cards.js";
import { decksCoreRepo } from "./decks-core.js";
import { decksFamiliesRepo } from "./decks-families.js";

export function decksRepo(db: Kysely<Database>) {
  return {
    ...decksCoreRepo(db),
    ...decksCardsRepo(db),
    ...decksFamiliesRepo(db),
  };
}
