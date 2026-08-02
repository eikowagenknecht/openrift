import type { PodTournamentDetailResponse } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { scoringOf } from "../repositories/pod-tournaments.js";
import type { Tournament } from "../repositories/tournaments.js";
import { loadTournament } from "./tournament-access.js";
import { toPodPlayer, toPodTournament } from "./tournament-presenters.js";

/**
 * The pod-engine running surface (pairingStyle='pod'), kept apart from the
 * umbrella builders because it reads a different slice of the same tournament
 * row: the engine pairs players into 3/4-player pods and derives standings from
 * finalized rounds via `repos.podTournaments`.
 */

/**
 * Assembles the pod running payload (standings + rounds are derived). The
 * open-round snapshot (organizer warnings + manual editor) is only meaningful
 * while a round is open.
 * @returns The pod tournament detail response.
 */
export async function buildPodRunDetail(
  repos: Repos,
  tournament: Tournament,
): Promise<PodTournamentDetailResponse> {
  const scoring = scoringOf(tournament);
  const [players, standings, rounds, openRound] = await Promise.all([
    repos.podTournaments.listPlayers(tournament.id),
    repos.podTournaments.computeStandings(tournament.id, scoring),
    repos.podTournaments.loadRounds(tournament.id, scoring),
    repos.podTournaments.findOpenRound(tournament.id),
  ]);
  const openRoundSnapshot = openRound
    ? await repos.podTournaments.loadOpenRoundSnapshot(tournament.id, scoring)
    : null;
  return {
    tournament: toPodTournament(tournament),
    players: players.map((player) => toPodPlayer(player)),
    standings,
    rounds,
    openRoundSnapshot,
  };
}

/**
 * Reloads + assembles the pod running payload after a mutation.
 * @returns The fresh pod tournament detail response.
 */
export async function podRunDetailById(
  repos: Repos,
  id: string,
): Promise<PodTournamentDetailResponse> {
  return buildPodRunDetail(repos, await loadTournament(repos, id));
}
