import type { DeckCodeParseResult } from "../deck-code.js";
import { parsePiltoverDeckCode } from "../deck-code.js";
import { parseTextFormat } from "./text.js";
import { parseTTSFormat } from "./tts.js";
import type { DeckCodeFormat } from "./types.js";

/**
 * Parses a deck code/text in the given format into import entries.
 * @returns Parsed entries and any warnings.
 */
export function parseDeckImportData(code: string, format: DeckCodeFormat): DeckCodeParseResult {
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
