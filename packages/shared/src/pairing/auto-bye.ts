import type { PairingPlayer } from "./types.js";

/**
 * Ranks by fewest byes, then lowest score, then lowest id. The full standings
 * tiebreak chain is deliberately not replicated here.
 */
export function pickAutoBye(players: PairingPlayer[]): string {
  if (players.length === 0) {
    throw new Error("pickAutoBye: no players to choose from");
  }
  const ranked = players.toSorted((a, b) => {
    if (a.byes !== b.byes) {
      return a.byes - b.byes;
    }
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.id < b.id ? -1 : 1;
  });
  return ranked[0].id;
}
