import type { DeckCodeParseResult, DeckImportEntry } from "../deck-code.js";
import { ZONE_LABELS } from "../deck-zones.js";
import type { DeckZone } from "../types/enums.js";
import { straightenApostrophes } from "../utils.js";
import { WellKnown } from "../well-known.js";
import { sourceSlotForZone } from "../zone-inference.js";
import type { DeckCodecCard, EncodeResult } from "./types.js";

/** `aliases` must be lowercase: lookups only lowercase the incoming header, not aliases. */
const TEXT_ZONE_SECTIONS: readonly {
  zone: DeckZone;
  header: string;
  aliases: readonly string[];
}[] = [
  { zone: WellKnown.deckZone.LEGEND, header: "Legend", aliases: [] },
  { zone: WellKnown.deckZone.CHAMPION, header: "Champion", aliases: [] },
  {
    zone: WellKnown.deckZone.MAIN,
    header: "MainDeck",
    aliases: ["main deck", "main", "mainboard"],
  },
  { zone: WellKnown.deckZone.BATTLEFIELD, header: "Battlefields", aliases: ["battlefield"] },
  { zone: WellKnown.deckZone.RUNES, header: "Runes", aliases: ["rune pool"] },
  { zone: WellKnown.deckZone.SIDEBOARD, header: "Sideboard", aliases: [] },
  { zone: WellKnown.deckZone.OVERFLOW, header: "Overflow", aliases: [] },
];

/** Overflow is excluded: it is never part of an exported deck, only accepted on read. */
const ZONE_ORDER: readonly DeckZone[] = TEXT_ZONE_SECTIONS.filter(
  (section) => section.zone !== WellKnown.deckZone.OVERFLOW,
).map((section) => section.zone);

const ZONE_HEADERS: Record<string, string> = Object.fromEntries(
  TEXT_ZONE_SECTIONS.map((section) => [section.zone, section.header]),
);

const HEADER_TO_ZONE: Record<string, DeckZone> = Object.fromEntries(
  TEXT_ZONE_SECTIONS.flatMap((section) =>
    [section.header.toLowerCase(), ...section.aliases].map((spelling) => [spelling, section.zone]),
  ),
);

/** Callers that only have names (e.g. an extension extracting a decklist) can encode without the resolved-card fields. */
export type TextEncodableCard = Pick<DeckCodecCard, "cardName" | "quantity" | "zone">;

export function encodeText(cards: TextEncodableCard[]): EncodeResult {
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
    lines.push(`${ZONE_HEADERS[zone]}:`);
    for (const card of zoneCards) {
      lines.push(`${card.quantity} ${straightenApostrophes(card.cardName)}`);
    }
  }

  return { code: lines.join("\n"), warnings };
}

/**
 * Zone headers come in two spellings: our own `Legend:` and the markdown
 * strikethrough `~~Legend~~` that topdeck.gg exports.
 */
function headerTextOf(line: string): string | undefined {
  if (line.startsWith("~~") && line.endsWith("~~") && line.length > 4) {
    return line.slice(2, -2).trim();
  }
  if (line.endsWith(":")) {
    return line.slice(0, -1).trim();
  }
  return undefined;
}

/**
 * Lines are `{quantity} {card name}` under an optional zone header; a bare
 * line with no leading count is treated as quantity 1.
 */
export function parseTextFormat(code: string): DeckCodeParseResult {
  const warnings: string[] = [];
  const entries: DeckImportEntry[] = [];
  let currentZone: DeckZone | undefined;

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    const headerText = headerTextOf(line);
    if (headerText !== undefined) {
      const zone = HEADER_TO_ZONE[headerText.toLowerCase()];
      if (zone) {
        currentZone = zone;
      } else {
        // Unknown header clears the current zone; it must not inherit the prior zone.
        currentZone = undefined;
        warnings.push(`Unknown zone header: ${line}`);
      }
      continue;
    }

    const match = /^(?<quantity>\d+)\s+(?<name>.+)$/u.exec(line);
    const effectiveZone = currentZone ?? WellKnown.deckZone.MAIN;
    const quantity = match ? Number(match[1]) : 1;
    const cardName = match ? match[2].trim() : line;
    entries.push({
      cardName,
      quantity,
      sourceSlot: sourceSlotForZone(effectiveZone),
      // Only set explicitZone when a zone header was provided by the user.
      // Without it, inferZone() assigns the correct zone based on card type.
      explicitZone: currentZone,
      rawFields: { "Parsed Name": cardName, Zone: ZONE_LABELS[effectiveZone] },
    });
  }

  return { entries, warnings };
}
