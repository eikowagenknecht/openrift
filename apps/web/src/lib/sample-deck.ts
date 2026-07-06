import type { DeckFormat, Printing } from "@openrift/shared";

import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportData } from "@/lib/deck-import-parsers";

// A ready-to-play Constructed list (Azir, Order/Calm) encoded as a Piltover
// deck code. "Try a sample deck" on the empty /decks page decodes it against
// the catalog and drops the visitor into a fully populated builder, so the
// energy curve, validation, and ownership state are visible before they have
// built anything themselves.
export const SAMPLE_DECK_NAME = "Sample Deck: Azir";
export const SAMPLE_DECK_FORMAT: DeckFormat = "constructed";
export const SAMPLE_DECK_CODE =
  "CQAAAAAAAAAACAQEAAAQEAIGAAAAGAQAAAADUAGVAECAGAAAEEAJSAIATIAQBIIBAECAAABHAMBAAAAAFMAC2AYDAAAB6ABKADDACAIEAAALAAIDAIAAAAGRAEAKMAQGAMAAAMQAGMAKGAIAVQAQBRIBADKQCAYEAAAKKAIAVUAQBWYBAAAQCBAAACUQCAQDAAAAALIA2EAQBYABAIBQAABNAA2ACAYAAAZA";

/**
 * Decode the bundled sample deck code against the catalog. Returns `null`
 * when any entry fails to resolve (catalog not loaded yet, or the code has
 * drifted from the card data) so callers never import a partial deck.
 * @returns The deck-card rows, or `null` if the sample can't be fully built.
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

/**
 * Pick the legend and champion rows out of the sample deck's cards, for
 * rendering a deck-tile-style preview of the sample.
 * @returns The key card ids with their preferred printings (null when absent).
 */
export function sampleDeckKeyCards(cards: ImportedDeckCard[]): {
  legend: ImportedDeckCard | null;
  champion: ImportedDeckCard | null;
} {
  return {
    legend: cards.find((card) => card.zone === "legend") ?? null,
    champion: cards.find((card) => card.zone === "champion") ?? null,
  };
}
