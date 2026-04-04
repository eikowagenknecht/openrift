import type { DeckZone, SourceSlot } from "@openrift/shared";
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";

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

interface DeckParseResult {
  entries: DeckImportEntry[];
  warnings: string[];
}

export type DeckImportFormat = "piltover" | "text" | "tts";

/**
 * Parses a deck code/text in the given format into import entries.
 * @returns Parsed entries and any warnings.
 */
export function parseDeckImportData(code: string, format: DeckImportFormat): DeckParseResult {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return { entries: [], warnings: ["No data provided."] };
  }

  switch (format) {
    case "piltover": {
      return parsePiltoverDeckCode(trimmed);
    }
    case "text": {
      return parseTextFormat(trimmed);
    }
    case "tts": {
      return parseTTSFormat(trimmed);
    }
  }
}

// ---------------------------------------------------------------------------
// Piltover Archive deck code
// ---------------------------------------------------------------------------

function parsePiltoverDeckCode(code: string): DeckParseResult {
  const warnings: string[] = [];

  try {
    const decoded = getDeckFromCode(code);
    const entries: DeckImportEntry[] = [];

    for (const card of decoded.mainDeck) {
      entries.push({
        shortCode: card.cardCode,
        quantity: card.count,
        sourceSlot: "mainDeck",
        rawFields: { "Source Code": card.cardCode, Slot: "Main Deck" },
      });
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
        rawFields: { "Source Code": decoded.chosenChampion, Slot: "Chosen Champion" },
      });
    }

    return { entries, warnings };
  } catch {
    return { entries: [], warnings: ["Invalid Piltover Archive deck code."] };
  }
}

// ---------------------------------------------------------------------------
// Text format
// ---------------------------------------------------------------------------

/** Reverse map from zone label to DeckZone. */
const LABEL_TO_ZONE: Record<string, DeckZone> = {
  legend: "legend",
  champion: "champion",
  maindeck: "main",
  main: "main",
  battlefields: "battlefield",
  battlefield: "battlefield",
  runes: "runes",
  sideboard: "sideboard",
  overflow: "overflow",
};

/** Maps explicit zones to the SourceSlot used for fallback zone inference. */
const ZONE_TO_SOURCE_SLOT: Record<DeckZone, SourceSlot> = {
  main: "mainDeck",
  legend: "mainDeck",
  champion: "chosenChampion",
  runes: "mainDeck",
  battlefield: "mainDeck",
  sideboard: "sideboard",
  overflow: "mainDeck",
};

const ZONE_DISPLAY_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Champion",
  main: "Main Deck",
  battlefield: "Battlefield",
  runes: "Runes",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

function parseTextFormat(code: string): DeckParseResult {
  const warnings: string[] = [];
  const entries: DeckImportEntry[] = [];
  let currentZone: DeckZone = "main";

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    // Check for zone header (e.g. "MainDeck:" or "Legend:")
    if (line.endsWith(":")) {
      const label = line.slice(0, -1).toLowerCase();
      const zone = LABEL_TO_ZONE[label];
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

    const quantity = Number(match[1]);
    const cardName = match[2].trim();
    entries.push({
      cardName,
      quantity,
      sourceSlot: ZONE_TO_SOURCE_SLOT[currentZone],
      explicitZone: currentZone,
      rawFields: { Name: cardName, Zone: ZONE_DISPLAY_LABELS[currentZone] },
    });
  }

  return { entries, warnings };
}

// ---------------------------------------------------------------------------
// TTS format (space-separated short codes)
// ---------------------------------------------------------------------------

function parseTTSFormat(code: string): DeckParseResult {
  const warnings: string[] = [];
  const counts = new Map<string, number>();

  for (const token of code.split(/\s+/)) {
    if (token === "") {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const entries: DeckImportEntry[] = [...counts.entries()].map(([shortCode, count]) => ({
    shortCode,
    quantity: count,
    sourceSlot: "mainDeck" as const,
    rawFields: { "Source Code": shortCode, Slot: "Main Deck" },
  }));

  return { entries, warnings };
}
