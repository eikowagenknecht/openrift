import { isNotableEventName } from "./uvsgames-catalog.js";

/**
 * The rule-gated exception to "curated, never unreviewed" (ADR-014). Each rule
 * is an admin toggle, and a catalogue row that matches any enabled one goes live
 * without a click. Every rule is additionally gated on the format mapping: an
 * event we cannot file under a `deck_formats` slug is never accepted
 * automatically, because guessing wrong there is invisible in the archive.
 */

export interface MetaAutoAcceptSettings {
  /** NULL turns the rule off, rather than a threshold nothing meets. */
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: boolean;
  autoAcceptOfficial: boolean;
}

export interface MetaAutoAcceptCandidate {
  name: string;
  playerCount: number | null;
  /** Whether the event runs a template an admin is watching. */
  isOfficial: boolean;
  /** Whether the source's format mapped to a `deck_formats` slug. */
  formatMapped: boolean;
}

/** Which rule let an event through, for the job summary and the admin log. */
export type MetaAutoAcceptRule = "official-template" | "player-count" | "notable-name";

/**
 * The official template is checked first because it is the strongest signal:
 * the organizer picked that template and an admin decided it is worth watching,
 * where a name is free text.
 *
 * @returns The first rule that matches, or null when the event stays in the
 * human queue.
 */
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
