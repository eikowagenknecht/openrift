import type { DeckCodecCard, EncodeResult } from "./types.js";

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
