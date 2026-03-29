import type { ArtVariant, Finish } from "@openrift/shared";

import { parseCSV, parseCSVWithHeaders } from "@/lib/csv";

/** Normalized entry produced by any format parser. */
export interface ImportEntry {
  /** Set prefix, e.g. "OGN". */
  setPrefix: string;
  /** Collector number, e.g. 1. */
  collectorNumber: number;
  /** Card finish. */
  finish: Finish;
  /** Art variant. */
  artVariant: ArtVariant;
  /** How many copies to import. */
  quantity: number;
  /** Card name from the source data, for display. */
  cardName: string;
  /** The raw short code from the source (e.g. "OGN-079a"), used as fallback for matching. */
  sourceCode: string;
}

interface ParseResult {
  entries: ImportEntry[];
  errors: string[];
  source: "piltover-archive" | "riftcore";
}

/**
 * Detects the format and parses the input text.
 * @returns Parsed entries, or an error if the format is unrecognized.
 */
export function parseImportData(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { entries: [], errors: ["No data provided."], source: "piltover-archive" };
  }

  if (trimmed.startsWith("RIFTCORE COLLECTION EXPORT")) {
    return parseRiftCore(trimmed);
  }

  const firstLine = trimmed.split("\n")[0];
  if (firstLine.includes("Variant Number")) {
    return parsePiltoverArchive(trimmed);
  }

  return {
    entries: [],
    errors: [
      "Couldn't recognize this format. We currently support Piltover Archive and RiftCore CSV exports.",
    ],
    source: "piltover-archive",
  };
}

// ---------------------------------------------------------------------------
// Piltover Archive
// ---------------------------------------------------------------------------

/**
 * Parses a Piltover Archive CSV export.
 *
 * Columns: Variant Number, Card Name, Set, Set Prefix, Rarity, Variant Type,
 *          Variant Label, Quantity, Language, Condition, ...
 *
 * Foil is encoded as `-Foil` suffix on Variant Number, or "Foil" in Variant Label.
 * Alt art is encoded as a letter suffix (e.g. `a`) or Variant Type = "Alt Art".
 * Duplicate rows (same variant, different conditions) are summed.
 * @returns Parsed entries and any parse errors.
 */
function parsePiltoverArchive(text: string): ParseResult {
  const records = parseCSVWithHeaders(text);
  const errors: string[] = [];

  if (records.length === 0) {
    return { entries: [], errors: ["No data rows found."], source: "piltover-archive" };
  }

  // Validate required columns exist
  const required = ["Variant Number", "Card Name", "Quantity"];
  const firstRecord = records[0];
  for (const col of required) {
    if (!(col in firstRecord)) {
      errors.push(`Missing required column: "${col}".`);
    }
  }
  if (errors.length > 0) {
    return { entries: [], errors, source: "piltover-archive" };
  }

  // Parse rows and aggregate by variant key
  const aggregated = new Map<string, ImportEntry>();

  for (const record of records) {
    const variantNumber = record["Variant Number"] ?? "";
    const cardName = record["Card Name"] ?? "";
    const quantity = Number.parseInt(record["Quantity"] ?? "0", 10);
    const variantLabel = record["Variant Label"] ?? "";

    if (!variantNumber || quantity <= 0) {
      continue;
    }

    const parsed = parsePiltoverVariantNumber(variantNumber);
    if (!parsed) {
      errors.push(`Could not parse variant number: "${variantNumber}"`);
      continue;
    }

    // Finish: check both the -Foil suffix and the Variant Label
    const finish: Finish =
      parsed.hasFoilSuffix || variantLabel.toLowerCase().includes("foil") ? "foil" : "normal";

    const entry: ImportEntry = {
      setPrefix: parsed.setPrefix,
      collectorNumber: parsed.collectorNumber,
      finish,
      artVariant: parsed.artVariant,
      quantity,
      cardName,
      sourceCode: parsed.shortCode,
    };

    // Aggregate duplicates (same variant, different conditions)
    const key = `${entry.sourceCode}::${entry.finish}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      aggregated.set(key, entry);
    }
  }

  return { entries: [...aggregated.values()], errors, source: "piltover-archive" };
}

interface PiltoverVariantParts {
  setPrefix: string;
  collectorNumber: number;
  artVariant: ArtVariant;
  hasFoilSuffix: boolean;
  /** The base short code without -Foil suffix, e.g. "OGN-079a". */
  shortCode: string;
}

/**
 * Parses a Piltover Archive variant number like "OGN-001", "OGN-004-Foil", "OGN-079a".
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parsePiltoverVariantNumber(variantNumber: string): PiltoverVariantParts | null {
  let code = variantNumber;
  let hasFoilSuffix = false;

  // Strip -Foil suffix
  if (code.endsWith("-Foil")) {
    hasFoilSuffix = true;
    code = code.slice(0, -5);
  }

  // Match: SET-NUMBERoptionalLetterSuffix
  const match = code.match(/^([A-Z]{2,4})-(\d+)([a-z]?)$/);
  if (!match) {
    return null;
  }

  const setPrefix = match[1];
  const collectorNumber = Number.parseInt(match[2], 10);
  const letterSuffix = match[3];
  const artVariant: ArtVariant = letterSuffix ? "altart" : "normal";

  return {
    setPrefix,
    collectorNumber,
    artVariant,
    hasFoilSuffix,
    shortCode: code,
  };
}

// ---------------------------------------------------------------------------
// RiftCore
// ---------------------------------------------------------------------------

/**
 * Parses a RiftCore CSV export.
 *
 * First 6 rows are metadata, then CSV with headers:
 * Card ID, Card Name, Set, Card Number, Type, Rarity, Domain,
 * Standard Qty, Foil Qty, Proving Grounds Qty, Total Qty, ...
 *
 * Alt art uses uppercase suffix in Card ID (e.g. "OGN-030A").
 * Normal and foil quantities are separate columns.
 * Proving Grounds Qty is ignored.
 * @returns Parsed entries and any parse errors.
 */
function parseRiftCore(text: string): ParseResult {
  const errors: string[] = [];
  const allRows = parseCSV(text);

  // Find the header row — look for the row containing "Card ID"
  let headerIndex = -1;
  for (let index = 0; index < Math.min(allRows.length, 10); index++) {
    if (allRows[index].some((cell) => cell.trim() === "Card ID")) {
      headerIndex = index;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      entries: [],
      errors: ['Could not find header row with "Card ID" column.'],
      source: "riftcore",
    };
  }

  const headers = allRows[headerIndex].map((header) => header.trim());
  const cardIdCol = headers.indexOf("Card ID");
  const cardNameCol = headers.indexOf("Card Name");
  const standardQtyCol = headers.indexOf("Standard Qty");
  const foilQtyCol = headers.indexOf("Foil Qty");

  if (cardIdCol === -1 || cardNameCol === -1) {
    return {
      entries: [],
      errors: ['Missing required columns: "Card ID" and/or "Card Name".'],
      source: "riftcore",
    };
  }

  const entries: ImportEntry[] = [];

  for (let index = headerIndex + 1; index < allRows.length; index++) {
    const row = allRows[index];
    const cardId = row[cardIdCol]?.trim() ?? "";
    const cardName = row[cardNameCol]?.trim() ?? "";
    const standardQty =
      standardQtyCol === -1 ? 0 : Number.parseInt(row[standardQtyCol]?.trim() ?? "0", 10);
    const foilQty = foilQtyCol === -1 ? 0 : Number.parseInt(row[foilQtyCol]?.trim() ?? "0", 10);

    if (!cardId) {
      continue;
    }

    const parsed = parseRiftCoreCardId(cardId);
    if (!parsed) {
      errors.push(`Could not parse Card ID: "${cardId}"`);
      continue;
    }

    if (standardQty > 0) {
      entries.push({
        setPrefix: parsed.setPrefix,
        collectorNumber: parsed.collectorNumber,
        finish: "normal",
        artVariant: parsed.artVariant,
        quantity: standardQty,
        cardName,
        sourceCode: parsed.shortCode,
      });
    }

    if (foilQty > 0) {
      entries.push({
        setPrefix: parsed.setPrefix,
        collectorNumber: parsed.collectorNumber,
        finish: "foil",
        artVariant: parsed.artVariant,
        quantity: foilQty,
        cardName,
        sourceCode: parsed.shortCode,
      });
    }
  }

  return { entries, errors, source: "riftcore" };
}

interface RiftCoreCardParts {
  setPrefix: string;
  collectorNumber: number;
  artVariant: ArtVariant;
  /** Normalized short code, e.g. "OGN-030a" (lowercase suffix). */
  shortCode: string;
}

/**
 * Parses a RiftCore Card ID like "OGN-001" or "OGN-030A".
 * Normalizes the letter suffix to lowercase for matching.
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parseRiftCoreCardId(cardId: string): RiftCoreCardParts | null {
  // Match: SET-NUMBER with optional uppercase letter suffix
  const match = cardId.match(/^([A-Z]{2,4})-(\d+)([A-Za-z]?)$/);
  if (!match) {
    return null;
  }

  const setPrefix = match[1];
  const collectorNumber = Number.parseInt(match[2], 10);
  const letterSuffix = match[3]?.toLowerCase() ?? "";
  const artVariant: ArtVariant = letterSuffix ? "altart" : "normal";
  const shortCode = `${setPrefix}-${match[2]}${letterSuffix}`;

  return { setPrefix, collectorNumber, artVariant, shortCode };
}
