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

/** Aliases for headers used by third-party deck exporters (e.g. riftdecks.com). */
const ZONE_ALIASES: [string, DeckZone][] = [
  ["main deck", "main"],
  ["battlefield", "battlefield"],
  ["rune pool", "runes"],
];

/** Reverse map from label back to zone, including third-party aliases. */
const LABEL_TO_ZONE = new Map<string, DeckZone>([
  ...Object.entries(ZONE_LABELS).map(
    ([zone, label]) => [label.toLowerCase(), zone as DeckZone] as const,
  ),
  ...ZONE_ALIASES,
]);

/** A card entry with its name, used for text encode. */
export interface TextCodecCard extends DeckCodecCard {
  cardName: string;
}

/** A decoded text entry before DB resolution. */
interface TextDecodedEntry {
  cardName: string;
  count: number;
  zone: DeckZone;
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

/**
 * Decodes a human-readable text format into card entries with explicit zones.
 *
 * @returns Parsed entries with card names, quantities, and zones.
 */
export function decodeText(code: string): { cards: TextDecodedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const cards: TextDecodedEntry[] = [];
  let currentZone: DeckZone = "main";

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    // Check for zone header (e.g. "MainDeck:" or "Legend:")
    if (line.endsWith(":")) {
      const label = line.slice(0, -1).toLowerCase();
      const zone = LABEL_TO_ZONE.get(label);
      if (zone) {
        currentZone = zone;
      } else {
        warnings.push(`Unknown zone header: ${line}`);
      }
      continue;
    }

    // Parse card line: "{quantity} {card name}"
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      warnings.push(`Skipped unparseable line: ${line}`);
      continue;
    }

    const count = Number(match[1]);
    const cardName = match[2].trim();
    cards.push({ cardName, count, zone: currentZone });
  }

  return { cards, warnings };
}
