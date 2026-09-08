import type { Selectable } from "kysely";

import type {
  TournamentParticipantsTable,
  TournamentsTable,
} from "../../../db/tables/tournaments.js";

export type Tournament = Selectable<TournamentsTable>;
export type TournamentParticipant = Selectable<TournamentParticipantsTable>;
