import type { PairingPlayer } from "./types.js";

/**
 * Pick the player who sits out an odd-count Swiss round: fewest byes first,
 * then lowest score, then lowest id for a stable, deterministic result. The
 * full standings tiebreak chain is deliberately not replicated here — byes and
 * score are what fairness of bye distribution actually depends on.
 *
 * @param players The seated (active, not already byed) players; must be non-empty.
 * @returns The id of the player to give the bye.
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
