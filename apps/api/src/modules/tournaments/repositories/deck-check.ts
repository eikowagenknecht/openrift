import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { deckCheckCatalogRepo } from "./deck-check-catalog.js";
import { deckCheckEntriesRepo } from "./deck-check-entries.js";
import { deckCheckEntryCardsRepo } from "./deck-check-entry-cards.js";
import { deckCheckEventsRepo } from "./deck-check-events.js";
import { deckCheckLegendImagesRepo } from "./deck-check-legend-images.js";

/**
 * Data access for the deck-check subsystem: deck-check tournaments, entries
 * keyed off a unified `tournament_participants` identity, and catalog
 * resolution. The host-scoped push keys live in `deck-check-keys.ts`.
 */
export function deckCheckRepo(db: Kysely<Database>) {
  return {
    ...deckCheckEventsRepo(db),
    ...deckCheckEntriesRepo(db),
    ...deckCheckLegendImagesRepo(db),
    ...deckCheckEntryCardsRepo(db),
    ...deckCheckCatalogRepo(db),
  };
}
