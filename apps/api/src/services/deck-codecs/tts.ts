import type { DecodedCardEntry, DeckCodecCard, EncodeResult } from "./types.js";

/**
 * Encodes deck cards into TTS (Tabletop Simulator) format: space-separated
 * short codes with each code repeated by its quantity.
 *
 * @returns The encoded TTS string and any warnings.
 */
export function encodeTTS(cards: DeckCodecCard[]): EncodeResult {
  const warnings: string[] = [];
  const codes: string[] = [];

  for (const card of cards) {
    if (card.zone === "overflow") {
      continue;
    }

    if (!card.shortCode) {
      warnings.push(`Skipped card ${card.cardId}: no canonical printing found`);
      continue;
    }

    for (let index = 0; index < card.quantity; index++) {
      codes.push(card.shortCode);
    }
  }

  return { code: codes.join(" "), warnings };
}

/**
 * Decodes a TTS format string (space-separated short codes) into card entries.
 * Counts duplicate codes and treats all cards as mainDeck source slot.
 *
 * @returns Decoded card entries for DB resolution and zone inference.
 */
export function decodeTTS(code: string): { cards: DecodedCardEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const counts = new Map<string, number>();

  for (const token of code.trim().split(/\s+/)) {
    if (token === "") {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const cards: DecodedCardEntry[] = [...counts.entries()].map(([cardCode, count]) => ({
    cardCode,
    count,
    sourceSlot: "mainDeck" as const,
  }));

  return { cards, warnings };
}
