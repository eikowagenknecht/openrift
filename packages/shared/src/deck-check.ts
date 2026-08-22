import type { DeckCheckChangeSummary } from "./types/api/deck-check.js";
import type { DeckZone } from "./types/enums.js";
import { normalizeNameForIdentity } from "./utils.js";
import { WellKnown } from "./well-known.js";

/** One card line of a deck-check entry after section→zone mapping. */
export interface DeckCheckCardLine {
  name: string;
  zone: DeckZone;
  quantity: number;
}

/**
 * Provider-section synonyms, keyed by the normalized (lowercased,
 * non-alphanumeric-stripped) section string. This is the only place the
 * provider-to-OpenRift zone vocabulary lives; an unknown section rejects the
 * whole push with 422 rather than guessing a zone.
 */
const SECTION_ZONE_MAP: Record<string, DeckZone> = {
  legend: WellKnown.deckZone.LEGEND,
  legends: WellKnown.deckZone.LEGEND,
  champion: WellKnown.deckZone.CHAMPION,
  champions: WellKnown.deckZone.CHAMPION,
  chosenchampion: WellKnown.deckZone.CHAMPION,
  main: WellKnown.deckZone.MAIN,
  maindeck: WellKnown.deckZone.MAIN,
  deck: WellKnown.deckZone.MAIN,
  rune: WellKnown.deckZone.RUNES,
  runes: WellKnown.deckZone.RUNES,
  battlefield: WellKnown.deckZone.BATTLEFIELD,
  battlefields: WellKnown.deckZone.BATTLEFIELD,
  side: WellKnown.deckZone.SIDEBOARD,
  sideboard: WellKnown.deckZone.SIDEBOARD,
  overflow: WellKnown.deckZone.OVERFLOW,
};

/**
 * Maps a provider's free-text section string onto a `deck_zones` slug.
 *
 * @returns The zone slug, or `null` when the section is unknown (the caller rejects the push).
 */
export function mapSectionToZone(section: string): DeckZone | null {
  return SECTION_ZONE_MAP[normalizeNameForIdentity(section)] ?? null;
}

/**
 * Where an entry came from: an organizer-system push, hand-entered by a judge,
 * or self-submitted by the player (ADR-026).
 */
export type DeckCheckEntrySource = "api" | "manual" | "self";

/**
 * External-id prefix stamped on entries created by hand in the OpenRift UI.
 * Provider pushes use the organizer system's own ids, which never carry this
 * prefix, so the prefix is a reliable discriminator without a dedicated column.
 */
export const MANUAL_ENTRY_EXTERNAL_ID_PREFIX = "manual:";

/**
 * External-id prefix for player self-submitted entries (ADR-026), derived from
 * the submitting user's id so a second submission upserts the same entry. The
 * ingest API rejects pushed external ids carrying this prefix, so a provider
 * can never upsert onto (or withdraw) a self-submitted entry.
 */
export const SELF_SUBMIT_EXTERNAL_ID_PREFIX = "openrift:";

/**
 * Classifies an entry by its external id.
 * @returns `"manual"` for hand-entered entries, `"self"` for player
 *   self-submissions, `"api"` for provider pushes.
 */
export function deckCheckEntrySource(externalId: string): DeckCheckEntrySource {
  if (externalId.startsWith(MANUAL_ENTRY_EXTERNAL_ID_PREFIX)) {
    return "manual";
  }
  if (externalId.startsWith(SELF_SUBMIT_EXTERNAL_ID_PREFIX)) {
    return "self";
  }
  return "api";
}

function lineKey(line: DeckCheckCardLine): string {
  return [normalizeNameForIdentity(line.name), line.zone].join("|");
}

/**
 * Builds the canonical string a content hash is computed over. Line order in
 * the payload is irrelevant: lines are sorted by (zone, name) and merged
 * by quantity, so a reordered re-push hashes identically.
 *
 * @returns A stable, newline-joined representation of the card lines.
 */
export function buildContentHashInput(lines: DeckCheckCardLine[]): string {
  const merged = new Map<string, DeckCheckCardLine>();
  for (const line of lines) {
    const key = lineKey(line);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }
  return [...merged.entries()]
    .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, line]) => `${key}|${line.quantity}`)
    .join("\n");
}

/**
 * Diffs the stored card lines against a re-pushed list, producing the change
 * summary the checker page shows when a checked entry is invalidated.
 *
 * @returns Added, removed, and quantity-changed lines keyed by (name, zone).
 */
export function diffCardLines(
  oldLines: DeckCheckCardLine[],
  newLines: DeckCheckCardLine[],
): DeckCheckChangeSummary {
  const oldByKey = new Map(oldLines.map((line) => [lineKey(line), line]));
  const newByKey = new Map(newLines.map((line) => [lineKey(line), line]));

  const summary: DeckCheckChangeSummary = { added: [], removed: [], changed: [] };

  for (const [key, line] of newByKey) {
    const before = oldByKey.get(key);
    if (!before) {
      summary.added.push({ name: line.name, zone: line.zone, quantity: line.quantity });
    } else if (before.quantity !== line.quantity) {
      summary.changed.push({
        name: line.name,
        zone: line.zone,
        oldQuantity: before.quantity,
        newQuantity: line.quantity,
      });
    }
  }
  for (const [key, line] of oldByKey) {
    if (!newByKey.has(key)) {
      summary.removed.push({ name: line.name, zone: line.zone, quantity: line.quantity });
    }
  }

  return summary;
}
