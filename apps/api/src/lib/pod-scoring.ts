import type { PodScoringScheme, TournamentPlayMode } from "@openrift/shared";

import type { Tournament } from "../repositories/tournaments.js";

/**
 * FFA placement scheme for 3/4-pods, win/draw points for Swiss (2-pods), and
 * the bye points shared by both.
 */
export interface PodScoring {
  scheme: PodScoringScheme;
  byePoints: number;
  winPoints: number;
  drawPoints: number;
  playMode: TournamentPlayMode;
}

export function scoringOf(tournament: Tournament): PodScoring {
  return {
    scheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    winPoints: tournament.winPoints,
    drawPoints: tournament.drawPoints,
    playMode: tournament.playMode,
  };
}
