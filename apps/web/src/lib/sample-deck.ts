import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckFormat } from "@openrift/shared/types/enums";

import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportData } from "@/lib/deck-import-parsers";

export const SAMPLE_DECK_NAME = "Sample Deck: Azir";
export const SAMPLE_DECK_FORMAT: DeckFormat = "constructed";
export const SAMPLE_DECK_CODE =
  "CQAAAAAAAAAACAQEAAAQEAIGAAAAGAQAAAADUAGVAECAGAAAEEAJSAIATIAQBIIBAECAAABHAMBAAAAAFMAC2AYDAAAB6ABKADDACAIEAAALAAIDAIAAAAGRAEAKMAQGAMAAAMQAGMAKGAIAVQAQBRIBADKQCAYEAAAKKAIAVUAQBWYBAAAQCBAAACUQCAQDAAAAALIA2EAQBYABAIBQAABNAA2ACAYAAAZA";

/**
 * Returns `null` when any entry fails to resolve (catalog not loaded yet, or
 * the code has drifted from the card data), never a partial deck.
 */
export function buildSampleDeckCards(allPrintings: Printing[]): ImportedDeckCard[] | null {
  const { entries } = parseDeckImportData(SAMPLE_DECK_CODE, "piltover");
  if (entries.length === 0) {
    return null;
  }
  const matched = matchDeckEntries(entries, allPrintings);
  if (matched.some((entry) => !entry.resolvedCard)) {
    return null;
  }
  return dedupeMatchedEntries(matched);
}

export function sampleDeckKeyCards(cards: ImportedDeckCard[]): {
  legend: ImportedDeckCard | null;
  champion: ImportedDeckCard | null;
} {
  return {
    legend: cards.find((card) => card.zone === "legend") ?? null,
    champion: cards.find((card) => card.zone === "champion") ?? null,
  };
}
