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
        explicitZone: "champion",
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
  // undefined until the user provides an explicit zone header
  let currentZone: DeckZone | undefined;

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

    const effectiveZone = currentZone ?? "main";
    const quantity = Number(match[1]);
    const cardName = match[2].trim();
    entries.push({
      cardName,
      quantity,
      sourceSlot: ZONE_TO_SOURCE_SLOT[effectiveZone],
      // Only set explicitZone when a zone header was provided by the user.
      // Without it, inferZone() assigns the correct zone based on card type.
      explicitZone: currentZone,
      rawFields: { Name: cardName, Zone: ZONE_DISPLAY_LABELS[effectiveZone] },
    });
  }

  return { entries, warnings };
}

// ---------------------------------------------------------------------------
// TTS format (space-separated short codes)
// ---------------------------------------------------------------------------

/**
 * Strips the trailing art-variant suffix (e.g. "-1") from a TTS short code.
 * TTS exports codes like "OGN-269-1" but the catalog uses "OGN-269".
 * @returns The short code without the variant suffix.
 */
function stripTTSVariant(token: string): string {
  // Match SET-NNN-V where V is the variant number
  const match = token.match(/^([A-Z]+-\d+)-\d+$/);
  return match ? match[1] : token;
}

/** TTS positional boundaries (constructed deck: 1+1+39+3+12 = 56 before sideboard). */
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

const TTS_SLOT_LABELS: Record<SourceSlot, string> = {
  mainDeck: "Main Deck",
  chosenChampion: "Chosen Champion",
  sideboard: "Sideboard",
};

function parseTTSFormat(code: string): DeckParseResult {
  const warnings: string[] = [];
  const tokens = code.split(/\s+/).filter((token) => token !== "");

  // Build entries preserving positional source slot, then group by shortCode + slot
  const grouped = new Map<
    string,
    { shortCode: string; sourceSlot: SourceSlot; quantity: number }
  >();

  for (let index = 0; index < tokens.length; index++) {
    const shortCode = stripTTSVariant(tokens[index]);
    const sourceSlot = ttsSourceSlot(index);
    const key = `${shortCode}::${sourceSlot}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, { shortCode, sourceSlot, quantity: 1 });
    }
  }

  const entries: DeckImportEntry[] = [...grouped.values()].map(
    ({ shortCode, sourceSlot, quantity }) => ({
      shortCode,
      quantity,
      sourceSlot,
      explicitZone: sourceSlot === "chosenChampion" ? ("champion" as const) : undefined,
      rawFields: { "Source Code": shortCode, Slot: TTS_SLOT_LABELS[sourceSlot] },
    }),
  );

  return { entries, warnings };
}
