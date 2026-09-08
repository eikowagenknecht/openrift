import type { PodScoring } from "../repositories/pod-tournaments-shared.js";
import type { Tournament } from "../repositories/tournaments.js";

export function scoringOf(tournament: Tournament): PodScoring {
  return {
    scheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    winPoints: tournament.winPoints,
    drawPoints: tournament.drawPoints,
    playMode: tournament.playMode,
  };
}
