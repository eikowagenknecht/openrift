import { isNotableEventName } from "./uvsgames-catalog.js";

/** An event with no `deck_formats` mapping is never accepted automatically, regardless of the other rules. */

export interface MetaAutoAcceptSettings {
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: boolean;
  autoAcceptOfficial: boolean;
}

export interface MetaAutoAcceptCandidate {
  name: string;
  playerCount: number | null;
  isOfficial: boolean;
  formatMapped: boolean;
}

export type MetaAutoAcceptRule = "official-template" | "player-count" | "notable-name";

/** Checks official-template first: it takes precedence when a candidate matches more than one rule. */
export function autoAcceptRule(
  settings: MetaAutoAcceptSettings,
  candidate: MetaAutoAcceptCandidate,
): MetaAutoAcceptRule | null {
  if (!candidate.formatMapped) {
    return null;
  }
  if (settings.autoAcceptOfficial && candidate.isOfficial) {
    return "official-template";
  }
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold !== null && candidate.playerCount !== null && candidate.playerCount >= threshold) {
    return "player-count";
  }
  if (settings.autoAcceptNotable && isNotableEventName(candidate.name)) {
    return "notable-name";
  }
  return null;
}
