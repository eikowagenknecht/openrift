import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";

import type { DeckZone } from "./types/enums.js";
import { WellKnown } from "./well-known.js";
import type { SourceSlot } from "./zone-inference.js";

/** A single entry produced by any deck format parser. */
export interface DeckImportEntry {
  /** Short code from the source (e.g. "OGN-001"). Present for Piltover/TTS formats. */
  shortCode?: string;
  /** Card name from the source. Present for text format. */
  cardName?: string;
  /** How many copies. */
  quantity: number;
  /** Source slot from the external format, used for zone inference. */
  sourceSlot: SourceSlot;
  /** Explicit zone override (text format provides zones directly). */
  explicitZone?: DeckZone;
  /** Pass-through of interesting fields for display. */
  rawFields: Record<string, string>;
}

/** Result of parsing a deck code: the entries plus any parse warnings. */
export interface DeckCodeParseResult {
  entries: DeckImportEntry[];
  warnings: string[];
}

/**
 * Decodes a deck code, retrying with the uppercased input when the raw string
 * fails — codes are base32 and users occasionally paste them lowercased.
 * @returns The decoded deck, or null when neither variant decodes.
 */
function decodeDeckCodeFlexible(code: string): ReturnType<typeof getDeckFromCode> | null {
  try {
    return getDeckFromCode(code);
  } catch {
    const upper = code.toUpperCase();
    if (upper === code) {
      return null;
    }
    try {
      return getDeckFromCode(upper);
    } catch {
      return null;
    }
  }
}

/**
 * Parses a Piltover Archive deck code into import entries, splitting the
 * chosen champion out of the main deck so it isn't double-counted.
 * @returns Parsed entries and any warnings.
 */
export function parsePiltoverDeckCode(code: string): DeckCodeParseResult {
  const warnings: string[] = [];

  const decoded = decodeDeckCodeFlexible(code);
  if (!decoded) {
    return { entries: [], warnings: ["Invalid Piltover Archive deck code."] };
  }
  const entries: DeckImportEntry[] = [];

  // The library can return the same card multiple times in mainDeck with
  // different counts. Consolidate by card code first, then subtract 1 for
  // the chosen champion so we don't double-count.
  const mainDeckTotals = new Map<string, number>();
  for (const card of decoded.mainDeck) {
    mainDeckTotals.set(card.cardCode, (mainDeckTotals.get(card.cardCode) ?? 0) + card.count);
  }

  for (const [cardCode, total] of mainDeckTotals) {
    const quantity = decoded.chosenChampion === cardCode ? total - 1 : total;
    if (quantity > 0) {
      entries.push({
        shortCode: cardCode,
        quantity,
        sourceSlot: "mainDeck",
        rawFields: { "Source Code": cardCode, Slot: "Main Deck" },
      });
    }
  }

  for (const card of decoded.sideboard) {
    entries.push({
      shortCode: card.cardCode,
      quantity: card.count,
      sourceSlot: "sideboard",
      rawFields: { "Source Code": card.cardCode, Slot: "Sideboard" },
    });
  }

  if (decoded.chosenChampion) {
    entries.push({
      shortCode: decoded.chosenChampion,
      quantity: 1,
      sourceSlot: "chosenChampion",
      explicitZone: WellKnown.deckZone.CHAMPION,
      rawFields: { "Source Code": decoded.chosenChampion, Slot: "Chosen Champion" },
    });
  }

  return { entries, warnings };
}

/**
 * Charset pre-filter for deck-code candidates: base32 (A–Z and 2–7, optional
 * padding), at least 12 chars. Lowercase is allowed here because
 * `decodeDeckCodeFlexible` retries uppercased. This only gates which strings
 * are worth attempting to decode — the decoder has the final say.
 */
const DECK_CODE_CANDIDATE = /^[A-Za-z2-7]{12,}={0,7}$/u;

/**
 * Attempts to decode a candidate string as a Piltover deck code.
 * @returns True when the candidate decodes to a deck.
 */
export function isDeckCode(candidate: string): boolean {
  return DECK_CODE_CANDIDATE.test(candidate) && decodeDeckCodeFlexible(candidate) !== null;
}
