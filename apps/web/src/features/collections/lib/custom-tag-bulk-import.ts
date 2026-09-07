import { normalizeNameForIdentity } from "@openrift/shared/utils";

import { parseDeckImportData } from "@/features/decks/lib/deck-import-parsers";

export interface MinimalCard {
  id: string;
  name: string;
}

export interface BulkImportPlan {
  cardIds: string[];
  matched: { cardId: string; name: string }[];
  unmatched: string[];
  ambiguous: { name: string; matches: { cardId: string; name: string }[] }[];
  warnings: string[];
}

/**
 * Reuses the deck importer's text parser and `normalizeNameForIdentity`
 * helper, so a card resolvable in the deck importer also resolves here.
 */
export function planCustomTagBulkImport(text: string, allCards: MinimalCard[]): BulkImportPlan {
  const { entries, warnings } = parseDeckImportData(text, "text");

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
    const hits = byNormalizedName.get(normalizeNameForIdentity(name)) ?? [];
    const [card] = hits;
    if (card === undefined) {
      unmatched.push(name);
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push({
        name,
        matches: hits.map((hit) => ({ cardId: hit.id, name: hit.name })),
      });
      continue;
    }
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
