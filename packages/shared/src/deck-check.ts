import type { DeckCheckChangeSummary } from "./types/api/deck-check.js";
import type { DeckZone } from "./types/enums.js";
import { normalizeNameForMatching } from "./utils.js";

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
  legend: "legend",
  legends: "legend",
  champion: "champion",
  champions: "champion",
  chosenchampion: "champion",
  main: "main",
  maindeck: "main",
  deck: "main",
  rune: "runes",
  runes: "runes",
  battlefield: "battlefield",
  battlefields: "battlefield",
  side: "sideboard",
  sideboard: "sideboard",
  overflow: "overflow",
};

/**
 * Maps a provider's free-text section string onto a `deck_zones` slug.
 *
 * @returns The zone slug, or `null` when the section is unknown (the caller rejects the push).
 */
export function mapSectionToZone(section: string): DeckZone | null {
  return SECTION_ZONE_MAP[normalizeNameForMatching(section)] ?? null;
}

function lineKey(line: DeckCheckCardLine): string {
  return [normalizeNameForMatching(line.name), line.zone].join("|");
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
