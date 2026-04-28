import { straightenApostrophes } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared/types";

import type { DeckCodecCard, EncodeResult } from "./types.js";

/** Display label for each zone in the text export format. */
const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Champion",
  main: "MainDeck",
  battlefield: "Battlefields",
  runes: "Runes",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

/** Ordered zones for text output. */
const ZONE_ORDER: DeckZone[] = ["legend", "champion", "main", "battlefield", "runes", "sideboard"];

/** A card entry with its name, used for text encode. */
export interface TextCodecCard extends DeckCodecCard {
  cardName: string;
}

/**
 * Encodes deck cards into a human-readable text format grouped by zone.
 *
 * @returns The encoded text and any warnings.
 */
export function encodeText(cards: TextCodecCard[]): EncodeResult {
  const warnings: string[] = [];
  const grouped = Map.groupBy(cards, (card) => card.zone);
  const lines: string[] = [];

  for (const zone of ZONE_ORDER) {
    const zoneCards = grouped.get(zone);
    if (!zoneCards || zoneCards.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(`${ZONE_LABELS[zone]}:`);
    for (const card of zoneCards) {
      lines.push(`${card.quantity} ${straightenApostrophes(card.cardName)}`);
    }
  }

  return { code: lines.join("\n"), warnings };
}
