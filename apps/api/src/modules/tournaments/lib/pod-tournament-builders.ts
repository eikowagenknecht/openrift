import type { PodTournamentDetailResponse } from "@openrift/shared/types/api/pod-tournament";

import type { Repos } from "../../../deps.js";
import type { Tournament } from "../repositories/tournaments.js";
import { scoringOf } from "./pod-scoring.js";
import { toRoundResponse } from "./pod-tournament-presenters.js";
import { loadTournament } from "./tournament-access.js";
import { toPodPlayer, toPodTournament } from "./tournament-presenters.js";

export async function buildPodRunDetail(
  repos: Repos,
  tournament: Tournament,
): Promise<PodTournamentDetailResponse> {
  const scoring = scoringOf(tournament);
  const [players, standings, roundRows, openRound] = await Promise.all([
    repos.podTournaments.listPlayers(tournament.id),
    repos.podTournaments.computeStandings(tournament.id, scoring),
    repos.podTournaments.loadRounds(tournament.id),
    repos.podTournaments.findOpenRound(tournament.id),
  ]);
  const openRoundSnapshot = openRound
    ? await repos.podTournaments.loadOpenRoundSnapshot(tournament.id, scoring)
    : null;
  return {
    tournament: toPodTournament(tournament),
    players: players.map((player) => toPodPlayer(player)),
    standings,
    rounds: roundRows.map((rows) => toRoundResponse(rows, scoring)),
    openRoundSnapshot,
  };
}

export async function podRunDetailById(
  repos: Repos,
  id: string,
): Promise<PodTournamentDetailResponse> {
  return buildPodRunDetail(repos, await loadTournament(repos, id));
}
