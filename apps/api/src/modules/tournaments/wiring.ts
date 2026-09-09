import type { Kysely } from "kysely";

import type { Database } from "../../db/tables.js";
import { deckCheckKeysRepo } from "./repositories/deck-check-keys.js";
import { deckCheckRepo } from "./repositories/deck-check.js";
import { organizationsRepo } from "./repositories/organizations.js";
import { podTournamentsRepo } from "./repositories/pod-tournaments.js";
import { tournamentGroupsRepo } from "./repositories/tournament-groups.js";
import { tournamentsRepo } from "./repositories/tournaments.js";

export interface TournamentsRepos {
  deckCheck: ReturnType<typeof deckCheckRepo>;
  deckCheckKeys: ReturnType<typeof deckCheckKeysRepo>;
  organizations: ReturnType<typeof organizationsRepo>;
  podTournaments: ReturnType<typeof podTournamentsRepo>;
  tournamentGroups: ReturnType<typeof tournamentGroupsRepo>;
  tournaments: ReturnType<typeof tournamentsRepo>;
}

export function createTournamentsRepos(db: Kysely<Database>): TournamentsRepos {
  return {
    deckCheck: deckCheckRepo(db),
    deckCheckKeys: deckCheckKeysRepo(db),
    organizations: organizationsRepo(db),
    podTournaments: podTournamentsRepo(db),
    tournamentGroups: tournamentGroupsRepo(db),
    tournaments: tournamentsRepo(db),
  };
}
