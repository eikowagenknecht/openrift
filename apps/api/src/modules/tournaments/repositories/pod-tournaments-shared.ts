import type { PodPlayerStatus } from "@openrift/shared/types/api/pod-tournament";
import type { Selectable } from "kysely";

import type {
  PodRoundsTable,
  PodsTable,
  TournamentParticipantsTable,
} from "../../../db/tables/tournaments.js";

export type PodPlayer = Selectable<TournamentParticipantsTable>;
/**
 * A participant on the competing roster (active or dropped). The umbrella
 * lifecycle also has requested/invited/no_show participants, but those never
 * appear on the run surface (players, standings, winners) — the pod response
 * schemas reject them, and a leaked `requested` self-registration 500s
 * `runState` output validation. Queries narrow via ROSTER_STATUSES.
 */
export type PodRosterPlayer = PodPlayer & { status: PodPlayerStatus };

export const ROSTER_STATUSES: readonly PodPlayerStatus[] = ["active", "dropped"];
export type PodRound = Selectable<PodRoundsTable>;
export type Pod = Selectable<PodsTable>;
