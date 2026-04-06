import type { DecodedCardEntry, DeckCodecCard, EncodeResult } from "./types.js";

/**
 * Strips the trailing art-variant suffix (e.g. "-1") from a TTS short code.
 * TTS uses codes like "OGN-269-1" but the catalog uses "OGN-269".
 * @returns The short code without the variant suffix.
 */
function stripTTSVariant(token: string): string {
  const match = token.match(/^([A-Z]+-\d+)-\d+$/);
  return match ? match[1] : token;
}

/** TTS zone order: legend, champion, main, battlefield, runes, sideboard. */
const TTS_ZONE_ORDER: Record<string, number> = {
  legend: 0,
  champion: 1,
  main: 2,
  battlefield: 3,
  runes: 4,
  sideboard: 5,
};

/**
 * Encodes deck cards into TTS (Tabletop Simulator) format: space-separated
 * short codes with each code repeated by its quantity.
 * Output order: legend, champion, main deck, battlefields, runes, sideboard.
 *
 * @returns The encoded TTS string and any warnings.
 */
export function encodeTTS(cards: DeckCodecCard[]): EncodeResult {
  const warnings: string[] = [];
  const codes: string[] = [];

  const sorted = cards.toSorted(
    (cardA, cardB) => (TTS_ZONE_ORDER[cardA.zone] ?? 99) - (TTS_ZONE_ORDER[cardB.zone] ?? 99),
  );

  for (const card of sorted) {
    if (card.zone === "overflow") {
      continue;
    }

    if (!card.shortCode) {
      warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
      continue;
    }

    for (let index = 0; index < card.quantity; index++) {
      codes.push(`${card.shortCode}-1`);
    }
  }

  return { code: codes.join(" "), warnings };
}

type SourceSlot = DecodedCardEntry["sourceSlot"];

/** TTS positional boundaries (standard deck: 1+1+39+3+12 = 56 before sideboard). */
const TTS_SIDEBOARD_START = 56;

/**
 * Infers the TTS source slot from positional index.
 * Order: legend (0), chosen champion (1), main deck (2-40),
 * battlefields (41-43), runes (44-55), sideboard (56+).
 * @returns The inferred source slot.
 */
function ttsSourceSlot(index: number): SourceSlot {
  if (index === 1) {
    return "chosenChampion";
  }
  if (index >= TTS_SIDEBOARD_START) {
    return "sideboard";
  }
  return "mainDeck";
}

/**
 * Decodes a TTS format string (space-separated short codes) into card entries.
 * Uses positional order to infer zones: legend, champion, main, battlefield, runes, sideboard.
 *
 * @returns Decoded card entries for DB resolution and zone inference.
 */
export function decodeTTS(code: string): { cards: DecodedCardEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const tokens = code
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

  const grouped = new Map<string, { cardCode: string; sourceSlot: SourceSlot; count: number }>();

  for (let index = 0; index < tokens.length; index++) {
    const cardCode = stripTTSVariant(tokens[index]);
    const sourceSlot = ttsSourceSlot(index);
    const key = `${cardCode}::${sourceSlot}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { cardCode, sourceSlot, count: 1 });
    }
  }

  const cards: DecodedCardEntry[] = [...grouped.values()].map(
    ({ cardCode, sourceSlot, count }) => ({
      cardCode,
      count,
      sourceSlot,
    }),
  );

  return { cards, warnings };
}
