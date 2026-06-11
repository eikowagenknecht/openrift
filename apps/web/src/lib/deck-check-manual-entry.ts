import { parseDeckImportData } from "./deck-import-parsers";

/** One card line ready to post to the manual deck-check entry endpoint. */
export interface ManualEntryCard {
  name: string;
  quantity: number;
  /** A `deck_zones` slug; the server maps it back through `mapSectionToZone`. */
  section: string;
}

export interface ParsedManualDecklist {
  cards: ManualEntryCard[];
  /** Total physical copies across every line. */
  totalCopies: number;
  warnings: string[];
}

/**
 * Parses a pasted decklist (the same text format the deck importer accepts,
 * with optional zone headers like "Champion:" / "Sideboard:") into the card
 * lines the manual deck-check entry endpoint expects. Lines without a zone
 * header fall back to the main deck. Identical name+zone lines are merged so a
 * pasted list with repeats becomes one row per card.
 * @returns The parsed card lines, their total copy count, and any warnings.
 */
export function parseManualDecklist(text: string): ParsedManualDecklist {
  const { entries, warnings } = parseDeckImportData(text, "text");

  const merged = new Map<string, ManualEntryCard>();
  for (const entry of entries) {
    const name = entry.cardName?.trim();
    if (!name) {
      continue;
    }
    const section = entry.explicitZone ?? "main";
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
