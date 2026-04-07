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
  /** Resolved promo slug for matching (e.g. "nexus", "release"). Provider-specific mapping is done in the parser. */
  promoSlug?: string;
  /** Pass-through of interesting fields from the source CSV, for display in the detail panel. */
  rawFields: Record<string, string>;
}

/**
 * Builds a rawFields record, filtering out empty/undefined values and trimming.
 * Insertion order is preserved for display.
 * @returns A record of non-empty field values.
 */
function buildRawFields(fields: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value?.trim();
    if (trimmed) {
      result[key] = trimmed;
    }
  }
  return result;
}

interface ParseResult {
  entries: ImportEntry[];
  errors: string[];
  source: "openrift" | "piltover-archive" | "riftcore";
  /** Number of data rows in the source CSV (before deduplication). */
  rowCount: number;
}

/**
 * Detects the format and parses the input text.
 * @returns Parsed entries, or an error if the format is unrecognized.
 */
export function parseImportData(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { entries: [], errors: ["No data provided."], source: "piltover-archive", rowCount: 0 };
  }

  if (trimmed.startsWith("RIFTCORE COLLECTION EXPORT")) {
    return parseRiftCore(trimmed);
  }

  const firstLine = trimmed.split("\n")[0];
  if (firstLine.includes("Variant Number")) {
    return parsePiltoverArchive(trimmed);
  }

  if (firstLine.includes("Art Variant")) {
    return parseOpenRift(trimmed);
  }

  return {
    entries: [],
    errors: [
      "Couldn't recognize this format. We currently support OpenRift, Piltover Archive, and RiftCore CSV exports.",
    ],
    source: "piltover-archive",
    rowCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Piltover Archive
// ---------------------------------------------------------------------------

/**
 * Maps a Piltover CSV promo suffix (+ variant label for disambiguation) to
 * the promo type slug used in the OpenRift catalog.
 * @returns The resolved slug, or undefined if the suffix is unrecognized.
 */
function resolvePiltoverPromoSlug(promoSuffix: string, variantLabel: string): string | undefined {
  const suffix = promoSuffix.toLowerCase();
  const label = variantLabel.toLowerCase();

  switch (suffix) {
    case "champion": {
      return "summoner-champion";
    }
    case "competitor": {
      return "competitor";
    }
    case "jdg": {
      return "judge";
    }
    case "learn": {
      return "learn";
    }
    case "launch": {
      return "launch";
    }
    case "nexus": {
      return "nexus";
    }
    case "prerelease":
    case "prerift": {
      return "prerift";
    }
    case "promo": {
      if (label.includes("nexus")) {
        return "nexus";
      }
      return undefined;
    }
    case "regionals": {
      if (label.includes("1st")) {
        return "regionals-1st";
      }
      if (label.includes("top")) {
        return "regionals-top8";
      }
      return undefined;
    }
    case "release": {
      return "release";
    }
    case "riot": {
      return "riot";
    }
    case "skirmish": {
      if (label.includes("top")) {
        return "summoner-top8";
      }
      return "summoner";
    }
    case "worlds": {
      return "worlds";
    }
    default: {
      return undefined;
    }
  }
}

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
    return {
      entries: [],
      errors: ["No data rows found."],
      source: "piltover-archive",
      rowCount: 0,
    };
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
    return { entries: [], errors, source: "piltover-archive", rowCount: 0 };
  }

  // Parse rows and aggregate by variant key
  const aggregated = new Map<string, ImportEntry>();
  let rowCount = 0;

  for (const record of records) {
    const variantNumber = record["Variant Number"] ?? "";
    const cardName = record["Card Name"] ?? "";
    const quantity = Number.parseInt(record["Quantity"] ?? "0", 10);
    const variantLabel = record["Variant Label"] ?? "";

    if (!variantNumber || quantity <= 0) {
      continue;
    }

    rowCount++;

    const parsed = parsePiltoverVariantNumber(variantNumber);

    // Finish: check the -Foil suffix, Variant Label, and rarity (rare/epic/showcase are always foil)
    const rarity = record["Rarity"]?.trim().toLowerCase() ?? "";
    const alwaysFoilRarity = rarity === "rare" || rarity === "epic" || rarity === "showcase";
    const hasFoilSuffix = parsed?.hasFoilSuffix ?? variantNumber.endsWith("-Foil");
    const finish: Finish =
      hasFoilSuffix || variantLabel.toLowerCase().includes("foil") || alwaysFoilRarity
        ? "foil"
        : "normal";

    const rawFields = buildRawFields({
      "Source Code": variantNumber,
      Set: record["Set"],
      Rarity: record["Rarity"],
      Finish: finish === "foil" ? "Foil" : "Normal",
      "Variant Type": record["Variant Type"],
      "Variant Label": variantLabel,
      Language: record["Language"],
      Condition: record["Condition"],
    });

    const entry: ImportEntry = {
      setPrefix: parsed?.setPrefix ?? record["Set Prefix"]?.trim() ?? "",
      collectorNumber: parsed?.collectorNumber ?? 0,
      finish,
      artVariant: parsed?.artVariant ?? "normal",
      quantity,
      cardName,
      sourceCode: parsed?.shortCode ?? variantNumber,
      promoSlug: parsed?.promoSuffix
        ? resolvePiltoverPromoSlug(parsed.promoSuffix, variantLabel)
        : undefined,
      rawFields,
    };

    // Aggregate duplicates (same variant, different conditions)
    const key = `${entry.sourceCode}::${entry.finish}::${entry.promoSlug ?? ""}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      aggregated.set(key, entry);
    }
  }

  return { entries: [...aggregated.values()], errors, source: "piltover-archive", rowCount };
}

interface PiltoverVariantParts {
  setPrefix: string;
  collectorNumber: number;
  artVariant: ArtVariant;
  hasFoilSuffix: boolean;
  /** The base short code without -Foil or promo suffix, e.g. "OGN-079a". */
  shortCode: string;
  /** Raw promo suffix stripped from the variant number (e.g. "Nexus", "Release"), if any. */
  promoSuffix?: string;
}

/**
 * Parses a Piltover Archive variant number like "OGN-001", "OGN-004-Foil",
 * "OGN-079a", or "OGN-001-Nexus".
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

  // Try standard format: SET-CCC[modifier]? (e.g. "OGN-001", "SFD-T01", "SFD-R04a", "OGN-123*")
  const standardMatch = code.match(/^([A-Z]{3})-([A-Z0-9]{3})([a-z*]?)$/);
  if (standardMatch) {
    const { collectorNumber, artVariant, shortCode } = resolveCardModifier(
      standardMatch[1],
      standardMatch[2],
      standardMatch[3],
    );
    return {
      setPrefix: standardMatch[1],
      collectorNumber,
      artVariant,
      hasFoilSuffix,
      shortCode,
    };
  }

  // Try suffixed format: SET-CCC[modifier]?-PromoSuffix (e.g. "OGN-001-Nexus", "OGN-027a-Release")
  const suffixMatch = code.match(/^([A-Z]{3})-([A-Z0-9]{3})([a-z*]?)-([A-Za-z]+)$/);
  if (suffixMatch) {
    const { collectorNumber, artVariant, shortCode } = resolveCardModifier(
      suffixMatch[1],
      suffixMatch[2],
      suffixMatch[3],
    );
    return {
      setPrefix: suffixMatch[1],
      collectorNumber,
      artVariant,
      hasFoilSuffix,
      shortCode,
      promoSuffix: suffixMatch[4],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// OpenRift
// ---------------------------------------------------------------------------

/**
 * Parses an OpenRift CSV export (the format produced by our own export).
 *
 * Columns: Card ID, Card Name, Rarity, Type, Domain, Finish, Art Variant, Promo, Quantity
 *
 * All fields map directly to internal types, so no translation is needed.
 * The Promo column may be empty (non-promo) or contain a promo slug like "nexus".
 * Older exports without the Promo column are also supported.
 * @returns Parsed entries and any parse errors.
 */
function parseOpenRift(text: string): ParseResult {
  const records = parseCSVWithHeaders(text);
  const errors: string[] = [];

  if (records.length === 0) {
    return { entries: [], errors: ["No data rows found."], source: "openrift", rowCount: 0 };
  }

  const required = ["Card ID", "Card Name", "Quantity"];
  const firstRecord = records[0];
  for (const col of required) {
    if (!(col in firstRecord)) {
      errors.push(`Missing required column: "${col}".`);
    }
  }
  if (errors.length > 0) {
    return { entries: [], errors, source: "openrift", rowCount: 0 };
  }

  const entries: ImportEntry[] = [];
  let rowCount = 0;

  for (const record of records) {
    const cardId = record["Card ID"]?.trim() ?? "";
    const cardName = record["Card Name"]?.trim() ?? "";
    const quantity = Number.parseInt(record["Quantity"] ?? "0", 10);

    if (!cardId || quantity <= 0) {
      continue;
    }

    rowCount++;

    const parsed = parseOpenRiftCardId(cardId);
    if (!parsed) {
      errors.push(`Could not parse Card ID: "${cardId}"`);
      continue;
    }

    const finish: Finish = record["Finish"]?.trim() === "foil" ? "foil" : "normal";
    const artVariantRaw = record["Art Variant"]?.trim();
    const artVariant: ArtVariant =
      artVariantRaw === "altart" || artVariantRaw === "overnumbered" ? artVariantRaw : "normal";
    const promoSlug = record["Promo"]?.trim() || undefined;

    entries.push({
      setPrefix: parsed.setPrefix,
      collectorNumber: parsed.collectorNumber,
      finish,
      artVariant,
      quantity,
      cardName,
      sourceCode: cardId,
      promoSlug,
      rawFields: buildRawFields({
        "Source Code": cardId,
        Rarity: record["Rarity"],
        Type: record["Type"],
        Domain: record["Domain"],
        Finish: record["Finish"],
        "Art Variant": record["Art Variant"],
        Promo: record["Promo"],
      }),
    });
  }

  return { entries, errors, source: "openrift", rowCount };
}

/**
 * Parses an OpenRift Card ID like "OGN-001", "OGN-079a", "OGN-123*", or "SFD-T01".
 * Uses the same format as our short codes.
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parseOpenRiftCardId(
  cardId: string,
): { setPrefix: string; collectorNumber: number } | null {
  const match = cardId.match(/^([A-Z]{3})-([A-Z0-9]{3})[a-z*]?$/);
  if (!match) {
    return null;
  }
  const digits = match[2].replaceAll(/[A-Za-z]/g, "");
  return { setPrefix: match[1], collectorNumber: Number.parseInt(digits, 10) };
}

// ---------------------------------------------------------------------------
// Shared card code helpers
// ---------------------------------------------------------------------------

/**
 * Extracts collector number, art variant, and normalized short code from a
 * parsed card code. The card number part is 3 alphanumeric chars (e.g. "001",
 * "T01", "R04") and the modifier is an optional suffix ("a"/"b" = altart,
 * "*" = signed/overnumbered).
 * @returns Resolved card parts.
 */
function resolveCardModifier(
  setPrefix: string,
  cardNumber: string,
  modifier: string,
): { collectorNumber: number; artVariant: ArtVariant; shortCode: string } {
  // Extract the numeric portion from the card number (e.g. "T01" → 1, "001" → 1)
  const digits = cardNumber.replaceAll(/[A-Za-z]/g, "");
  const collectorNumber = Number.parseInt(digits, 10);

  let artVariant: ArtVariant;
  if (modifier === "*") {
    artVariant = "overnumbered";
  } else if (modifier) {
    artVariant = "altart";
  } else {
    artVariant = "normal";
  }

  const shortCode = `${setPrefix}-${cardNumber}${modifier}`;
  return { collectorNumber, artVariant, shortCode };
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
      rowCount: 0,
    };
  }

  const headers = allRows[headerIndex].map((header) => header.trim());
  const cardIdCol = headers.indexOf("Card ID");
  const cardNameCol = headers.indexOf("Card Name");
  const standardQtyCol = headers.indexOf("Standard Qty");
  const foilQtyCol = headers.indexOf("Foil Qty");
  const setCol = headers.indexOf("Set");
  const cardNumberCol = headers.indexOf("Card Number");
  const typeCol = headers.indexOf("Type");
  const rarityCol = headers.indexOf("Rarity");
  const domainCol = headers.indexOf("Domain");

  if (cardIdCol === -1 || cardNameCol === -1) {
    return {
      entries: [],
      errors: ['Missing required columns: "Card ID" and/or "Card Name".'],
      source: "riftcore",
      rowCount: 0,
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

    if (!cardId || cardId.startsWith("Exported from")) {
      continue;
    }

    const parsed = parseRiftCoreCardId(cardId);
    if (!parsed) {
      errors.push(`Could not parse Card ID: "${cardId}"`);
      continue;
    }

    const rarity = (rarityCol === -1 ? "" : (row[rarityCol]?.trim() ?? "")).toLowerCase();
    const alwaysFoil = rarity === "rare" || rarity === "epic" || rarity === "showcase";

    const baseRawFields: Record<string, string | undefined> = {
      "Source Code": cardId,
      Set: setCol === -1 ? undefined : row[setCol],
      "Card Number": cardNumberCol === -1 ? undefined : row[cardNumberCol],
      Type: typeCol === -1 ? undefined : row[typeCol],
      Rarity: rarityCol === -1 ? undefined : row[rarityCol],
      Domain: domainCol === -1 ? undefined : row[domainCol],
    };

    if (standardQty > 0) {
      const finish: Finish = alwaysFoil ? "foil" : "normal";
      entries.push({
        setPrefix: parsed.setPrefix,
        collectorNumber: parsed.collectorNumber,
        finish,
        artVariant: parsed.artVariant,
        quantity: standardQty,
        cardName,
        sourceCode: parsed.shortCode,
        rawFields: buildRawFields({
          ...baseRawFields,
          Finish: finish === "foil" ? "Foil" : "Normal",
        }),
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
        rawFields: buildRawFields({ ...baseRawFields, Finish: "Foil" }),
      });
    }
  }

  return { entries, errors, source: "riftcore", rowCount: allRows.length - headerIndex - 1 };
}

interface RiftCoreCardParts {
  setPrefix: string;
  collectorNumber: number;
  artVariant: ArtVariant;
  /** Normalized short code, e.g. "OGN-030a" (lowercase suffix). */
  shortCode: string;
}

/**
 * Parses a RiftCore Card ID like "OGN-001", "OGN-030A", "SFD-T01", or "OGN-123s".
 * Normalizes letter suffixes to lowercase and "s" to "*" for matching.
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parseRiftCoreCardId(cardId: string): RiftCoreCardParts | null {
  // Match: SET-CCC[modifier]? where CCC is 3 alphanumeric chars (e.g. "001", "T01", "R04")
  // Modifier is an optional letter or * suffix (RiftCore uses uppercase, e.g. "A", "S")
  const match = cardId.match(/^([A-Z]{3})-([A-Z0-9]{3})([A-Za-z*]?)$/);
  if (!match) {
    return null;
  }

  // Normalize modifier to lowercase; RiftCore uses "S" where we use "*"
  const rawModifier = match[3]?.toLowerCase() ?? "";
  const modifier = rawModifier === "s" ? "*" : rawModifier;

  return { setPrefix: match[1], ...resolveCardModifier(match[1], match[2], modifier) };
}
