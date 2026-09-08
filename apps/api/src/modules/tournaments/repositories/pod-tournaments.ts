import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { podRosterRepo } from "./pod-tournaments-roster.js";
import { podRoundsRepo } from "./pod-tournaments-rounds.js";
import { podStandingsRepo } from "./pod-tournaments-standings.js";

/**
 * The pod-engine tables: rounds, pods, pod members, byes, and the roster/team
 * side of `tournament_participants`. The `tournaments` row itself belongs to
 * `tournamentsRepo` — there is one tournament row and one `Tournament` type,
 * and this repo takes ids.
 *
 * Lean model: player aggregates and opponent history are NOT stored; they are
 * derived on read from the finalized rounds via `foldFinalized`. Stored values
 * are the raw facts (pod_members.placement) and the engine's write-once
 * outputs (round/pod penalties). Authorization is the caller's job; the repo is
 * naive.
 */
export function podTournamentsRepo(db: Kysely<Database>) {
  return {
    ...podRosterRepo(db),
    ...podRoundsRepo(db),
    ...podStandingsRepo(db),
  };
}
