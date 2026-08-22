import { normalizeNameForIdentity } from "@openrift/shared";

import { parseDeckImportData } from "@/lib/deck-import-parsers";

export interface MinimalCard {
  id: string;
  name: string;
}

export interface BulkImportPlan {
  /** Card ids resolved to a unique catalog card. Safe to send to the API. */
  cardIds: string[];
  /** Catalog-side matches for display (sorted by input order, deduped). */
  matched: { cardId: string; name: string }[];
  /** Input names with no catalogue hit. */
  unmatched: string[];
  /** Input names that hit multiple distinct cards — surfaced, not silently picked. */
  ambiguous: { name: string; matches: { cardId: string; name: string }[] }[];
  /** Warnings from the underlying decklist parser (e.g. unparseable lines). */
  warnings: string[];
}

/**
 * Parses a decklist-style block (`<n> <card name>` per line) and resolves
 * each line to a catalogue card id. Reuses the deck importer's text parser
 * and the same `normalizeNameForIdentity` helper deck-import matching uses,
 * so a card resolvable in the deck importer also resolves here.
 *
 * @param text     Raw input from the textarea.
 * @param allCards Flat card catalogue used to build the name index.
 * @returns A plan: the card ids to send, plus per-line reporting for the UI.
 */
export function planCustomTagBulkImport(text: string, allCards: MinimalCard[]): BulkImportPlan {
  const { entries, warnings } = parseDeckImportData(text, "text");

  // Build normalizedName → cards. Use array (not single) so colliding names
  // surface as ambiguous instead of last-write-wins silently picking one.
  const byNormalizedName = new Map<string, MinimalCard[]>();
  for (const card of allCards) {
    const key = normalizeNameForIdentity(card.name);
    const existing = byNormalizedName.get(key);
    if (existing) {
      existing.push(card);
    } else {
      byNormalizedName.set(key, [card]);
    }
  }

  const matched: { cardId: string; name: string }[] = [];
  const seenIds = new Set<string>();
  const unmatched: string[] = [];
  const ambiguous: BulkImportPlan["ambiguous"] = [];

  for (const entry of entries) {
    const name = entry.cardName;
    if (!name) {
      continue;
    }
    const hits = byNormalizedName.get(normalizeNameForIdentity(name));
    if (!hits || hits.length === 0) {
      unmatched.push(name);
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push({
        name,
        matches: hits.map((card) => ({ cardId: card.id, name: card.name })),
      });
      continue;
    }
    const card = hits[0];
    if (!seenIds.has(card.id)) {
      seenIds.add(card.id);
      matched.push({ cardId: card.id, name: card.name });
    }
  }

  return {
    cardIds: matched.map((m) => m.cardId),
    matched,
    unmatched,
    ambiguous,
    warnings,
  };
}
