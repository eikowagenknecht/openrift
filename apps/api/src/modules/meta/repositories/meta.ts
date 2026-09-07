import type { Kysely } from "kysely";

import type { Database } from "../../../db/index.js";
import { metaArchiveRepo } from "./meta-archive.js";
import { metaCreditsRepo } from "./meta-credits.js";
import { metaDecksRepo } from "./meta-decks.js";
import { metaEventsRepo } from "./meta-events.js";
import { metaLegendsRepo } from "./meta-legends.js";
import { metaPlayersRepo } from "./meta-players.js";
import { metaSourcesRepo } from "./meta-sources.js";

/**
 * Queries for the admin-curated meta archive. `meta_event_players` is the
 * anchor: one row per player per event, with an optional `decks` row (owned by
 * {@link META_ARCHIVE_USER_ID}) hanging off it. This repo owns the event rows,
 * the standings rows, and every join that treats the three as one thing.
 */
export function metaRepo(db: Kysely<Database>) {
  return {
    ...metaEventsRepo(db),
    ...metaPlayersRepo(db),
    ...metaDecksRepo(db),
    ...metaLegendsRepo(db),
    ...metaSourcesRepo(db),
    ...metaCreditsRepo(db),
    ...metaArchiveRepo(db),
  };
}
