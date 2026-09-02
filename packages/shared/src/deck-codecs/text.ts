import type { DeckCodeParseResult, DeckImportEntry } from "../deck-code.js";
import { ZONE_LABELS } from "../deck-zones.js";
import type { DeckZone } from "../types/enums.js";
import { straightenApostrophes } from "../utils.js";
import { WellKnown } from "../well-known.js";
import { sourceSlotForZone } from "../zone-inference.js";
import type { DeckCodecCard, EncodeResult } from "./types.js";

/**
 * The zone-header vocabulary of the text interchange format, owned in one
 * place so the writer and the reader cannot drift apart. `header` is what
 * `encodeText` writes; `aliases` are extra spellings the reader accepts from
 * other tools and from earlier versions of our own exporter.
 *
 * Header matching is case-insensitive, so aliases are listed lowercased.
 */
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

/**
 * Zones written by `encodeText`, in output order. Overflow is a holding area
 * inside the builder, never part of an exported deck — the reader still
 * accepts its header so a hand-written list round-trips.
 */
const ZONE_ORDER: readonly DeckZone[] = TEXT_ZONE_SECTIONS.filter(
  (section) => section.zone !== WellKnown.deckZone.OVERFLOW,
).map((section) => section.zone);

/** Header written for each zone. */
const ZONE_HEADERS: Record<string, string> = Object.fromEntries(
  TEXT_ZONE_SECTIONS.map((section) => [section.zone, section.header]),
);

/** Every accepted header spelling, lowercased, mapped back to its zone. */
const HEADER_TO_ZONE: Record<string, DeckZone> = Object.fromEntries(
  TEXT_ZONE_SECTIONS.flatMap((section) =>
    [section.header.toLowerCase(), ...section.aliases].map((spelling) => [spelling, section.zone]),
  ),
);

/**
 * The subset of a deck card the text format actually writes. Callers that
 * only have names (e.g. the browser extension extracting a decklist from a
 * page) can encode without inventing the resolved-card fields.
 */
export type TextEncodableCard = Pick<DeckCodecCard, "cardName" | "quantity" | "zone">;

/**
 * Encodes deck cards into a human-readable text format grouped by zone.
 *
 * @returns The encoded text and any warnings.
 */
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
 * strikethrough `~~Legend~~` that topdeck.gg exports. Both are recognised
 * everywhere, so a list pasted from either tool reads the same.
 *
 * @returns The header text without its delimiters, or undefined when the line
 * is not a header at all.
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
 * Parses the text format back into import entries. Lines are `{quantity}
 * {card name}` under an optional zone header; a bare line with no leading
 * count is treated as quantity 1 so plain name lists paste in unchanged.
 * @returns Parsed entries and any warnings.
 */
export function parseTextFormat(code: string): DeckCodeParseResult {
  const warnings: string[] = [];
  const entries: DeckImportEntry[] = [];
  // undefined until the user provides an explicit zone header
  let currentZone: DeckZone | undefined;

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    // Check for zone header (e.g. "MainDeck:", "Legend:" or "~~Mainboard~~")
    const headerText = headerTextOf(line);
    if (headerText !== undefined) {
      const zone = HEADER_TO_ZONE[headerText.toLowerCase()];
      if (zone) {
        currentZone = zone;
      } else {
        // Unknown header — clear the current zone so subsequent cards fall back
        // to type-based inference instead of silently inheriting the prior zone.
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
