import { WellKnown } from "@openrift/shared";

import { parseDeckImportData } from "./deck-import-parsers";

interface ManualEntryCard {
  name: string;
  quantity: number;
  section: string;
}

export interface ParsedManualDecklist {
  cards: ManualEntryCard[];
  totalCopies: number;
  warnings: string[];
}

/**
 * Parses the same text format the deck importer accepts. Lines without a zone
 * header fall back to the main deck; identical name+zone lines are merged.
 */
export function parseManualDecklist(text: string): ParsedManualDecklist {
  const { entries, warnings } = parseDeckImportData(text, "text");

  const merged = new Map<string, ManualEntryCard>();
  for (const entry of entries) {
    const name = entry.cardName?.trim();
    if (!name) {
      continue;
    }
    const section = entry.explicitZone ?? WellKnown.deckZone.MAIN;
    const key = `${name.toLowerCase()}|${section}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      merged.set(key, { name, quantity: entry.quantity, section });
    }
  }

  const cards = [...merged.values()];
  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  return { cards, totalCopies, warnings };
}
