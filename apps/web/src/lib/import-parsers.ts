// oxlint-disable typescript/dot-notation -- record keys are CSV column headers; bracket access stays uniform across headers that do and don't contain spaces

import type { ArtVariant, CopyLink, Finish } from "@openrift/shared";
import { isAlwaysFoilRarity, WellKnown } from "@openrift/shared";

import { conditionSlugFromSource } from "@/lib/condition-codes";
import { parseCSV, parseCSVWithHeaders } from "@/lib/csv";
import { languageCodeFromSource } from "@/lib/language-names";

/**
 * Per-copy metadata carried by an import entry (ADR-038). Applied to every
 * copy the entry expands into. Other tools only export a condition; our own
 * format round-trips the full set.
 */
export interface ImportCopyMetadata {
  /** House condition slug (already normalized by the parser). */
  condition?: string;
  grader?: string;
  grade?: number;
  isAltered?: boolean;
  notesPublic?: string;
  notesPrivate?: string;
  links?: CopyLink[];
}

/** Normalized entry produced by any format parser. */
export interface ImportEntry {
  /** Set prefix, e.g. "OGN". */
  setPrefix: string;
  /** Card finish. */
  finish: Finish;
  /** Art variant. */
  artVariant: ArtVariant;
  /**
   * Whether the collector number runs past the set's printed total. Undefined
   * means the source format has no such column ("don't care"), not "false".
   */
  isOvernumbered?: boolean;
  /** How many copies to import. */
  quantity: number;
  /** Card name from the source data, for display. */
  cardName: string;
  /** The raw short code from the source (e.g. "OGN-079a"), used as fallback for matching. */
  sourceCode: string;
  /** Resolved promo slug for matching (e.g. "nexus", "release"). Provider-specific mapping is done in the parser. */
  promoSlug?: string;
  /** True when the source indicates a promo card but doesn't specify which type (e.g. RiftMana's `-p` suffix). */
  isPromo?: boolean;
  /** Two-letter language code from the source CSV (e.g. "EN", "SC"), used to prefer the correct language printing. */
  language?: string;
  /** Per-copy metadata to persist on every imported copy (ADR-038). */
  metadata?: ImportCopyMetadata;
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

/** A recognized CSV export format. */
export type ImportFormat = "openrift" | "piltover-archive" | "riftcore" | "riftmana";

interface ParseResult {
  entries: ImportEntry[];
  errors: string[];
  source: ImportFormat;
  /** Number of data rows in the source CSV (before deduplication). */
  rowCount: number;
}

/**
 * Sniffs the input for one of the known CSV export formats by inspecting the
 * header row. Returns null when the text matches none of them (e.g. a
 * plain-text `<quantity> <name>` deck list), so callers can fall back to a
 * different parser.
 * @returns The detected format, or null when unrecognized.
 */
export function detectImportFormat(text: string): ImportFormat | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith("RIFTCORE COLLECTION EXPORT")) {
    return "riftcore";
  }
  const firstLine = trimmed.split("\n")[0];
  if (firstLine.includes("Variant Number")) {
    return "piltover-archive";
  }
  if (firstLine.includes("Normal Qty")) {
    return "riftmana";
  }
  if (firstLine.includes("Art Variant")) {
    return "openrift";
  }
  return null;
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

  switch (detectImportFormat(trimmed)) {
    case "riftcore": {
      return parseRiftCore(trimmed);
    }
    case "piltover-archive": {
      return parsePiltoverArchive(trimmed);
    }
    case "riftmana": {
      return parseRiftMana(trimmed);
    }
    case "openrift": {
      return parseOpenRift(trimmed);
    }
    default: {
      return {
        entries: [],
        errors: [
          "Couldn't recognize this format. We currently support OpenRift, Piltover Archive, RiftCore, and RiftMana CSV exports.",
        ],
        source: "piltover-archive",
        rowCount: 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Piltover Archive
// ---------------------------------------------------------------------------

/**
 * Parses a Piltover Archive CSV export.
 *
 * Columns: Variant Number, Card Name, Set, Set Prefix, Rarity, Variant Type,
 *          Variant Label, Foil, Quantity, Language, Condition,
 *          Grading Company, Grading Value, Grading Label, Notes
 *
 * The Variant Number is the short code as we store it, letter suffix and
 * signed `*` included, so only the promo/foil-free part needs parsing. Finish
 * comes from the `Foil` column alone — the rarity no longer has to imply it.
 *
 * Rows are summed only when their variant AND their whole copy metadata match,
 * so a graded copy never merges into the raw ones (ADR-038).
 * @returns Parsed entries and any parse errors.
 */
/**
 * Copy metadata from Piltover's grading and notes columns. Grading needs both a
 * company and a finite value, and excludes a condition the way our own contract
 * does — their graded rows leave Condition blank for the same reason.
 * `Grading Label` is skipped: it is their rendering of the other two.
 * @returns The metadata, or undefined when the row carries none.
 */
/**
 * The art variant a Piltover row describes. Their `Variant Label` wins over the
 * variant number's modifier, which only distinguishes alt art from plain: a `*`
 * there marks a *signed* printing and says nothing about the art.
 */
function piltoverArtVariant(variantLabel: string, fromModifier?: ArtVariant): ArtVariant {
  if (variantLabel.trim().toLowerCase() === "ultimate") {
    return WellKnown.artVariant.ULTIMATE;
  }
  return fromModifier ?? WellKnown.artVariant.NORMAL;
}

/**
 * Their `Variant Type` is the only column that names overnumbering, and it says
 * so for their Ultimate card too — which is right, since that print is both.
 */
function piltoverIsOvernumbered(variantType: string): boolean {
  return variantType.trim().toLowerCase().startsWith("overnumbered");
}

function parsePiltoverMetadata(record: Record<string, string>): ImportCopyMetadata | undefined {
  const grader = record["Grading Company"]?.trim().toLowerCase() || undefined;
  const gradeRaw = record["Grading Value"]?.trim();
  const grade = gradeRaw ? Number(gradeRaw) : Number.NaN;
  const graded = grader !== undefined && Number.isFinite(grade);
  const condition = graded ? undefined : conditionSlugFromSource(record["Condition"]);
  const notesPublic = record["Notes"]?.trim() || undefined;

  const metadata: ImportCopyMetadata = {
    ...(condition && { condition }),
    ...(graded && { grader, grade }),
    ...(notesPublic && { notesPublic }),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

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
  const required = ["Variant Number", "Card Name", "Quantity", "Foil"];
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
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
    const quantity = Number.parseInt(record["Quantity"] ?? "0", 10);
    const variantLabel = record["Variant Label"] ?? "";

    if (!variantNumber || quantity <= 0) {
      continue;
    }

    rowCount++;

    const parsed = parsePiltoverVariantNumber(variantNumber);
    const variantType = record["Variant Type"]?.trim() ?? "";
    const finish: Finish = /^(?:true|yes|1)$/iu.test(record["Foil"]?.trim() ?? "")
      ? WellKnown.finish.FOIL
      : WellKnown.finish.NORMAL;

    const rawFields = buildRawFields({
      "Source Code": variantNumber,
      Set: record["Set"],
      Rarity: record["Rarity"],
      Finish: finish === WellKnown.finish.FOIL ? "Foil" : "Normal",
      "Variant Type": record["Variant Type"],
      "Variant Label": variantLabel,
      Language: record["Language"],
      Condition: record["Condition"],
      "Grading Company": record["Grading Company"],
      "Grading Value": record["Grading Value"],
      Notes: record["Notes"],
    });

    const metadata = parsePiltoverMetadata(record);
    const entry: ImportEntry = {
      setPrefix: parsed?.setPrefix ?? record["Set Prefix"]?.trim() ?? "",
      finish,
      artVariant: piltoverArtVariant(variantLabel, parsed?.artVariant),
      isOvernumbered: piltoverIsOvernumbered(variantType),
      quantity,
      cardName,
      sourceCode: parsed?.shortCode ?? variantNumber,
      isPromo: variantType.toLowerCase() === "promo" ? true : undefined,
      language: languageCodeFromSource(record["Language"]),
      metadata,
      rawFields,
    };

    // Aggregate duplicates. The promo suffix is part of the key because it is
    // stripped from the short code, and `OGN-263` and `OGN-263-Worlds` are two
    // different printings that would otherwise pool. So is the metadata, so
    // that a PSA 9 is never summed into the raw copies beside it (ADR-038).
    const promoKey = parsed?.promoSuffix?.toLowerCase() ?? "";
    const languageKey = entry.language ?? "";
    const metadataKey = JSON.stringify(metadata ?? null);
    const key = `${entry.sourceCode}::${entry.finish}::${promoKey}::${languageKey}::${metadataKey}`;
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
  const standardMatch = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(code);
  if (standardMatch) {
    const { artVariant, shortCode } = resolveCardModifier(
      standardMatch[1],
      standardMatch[2],
      standardMatch[3],
    );
    return {
      setPrefix: standardMatch[1],
      artVariant,
      hasFoilSuffix,
      shortCode,
    };
  }

  // Try suffixed format: SET-CCC[modifier]?-PromoSuffix (e.g. "OGN-001-Nexus", "OGN-027a-Release")
  const suffixMatch =
    /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)-(?<suffix>[A-Za-z]+)$/u.exec(code);
  if (suffixMatch) {
    const { artVariant, shortCode } = resolveCardModifier(
      suffixMatch[1],
      suffixMatch[2],
      suffixMatch[3],
    );
    return {
      setPrefix: suffixMatch[1],
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
 * Parses the `Links` export cell: `url|label` entries joined by `;`.
 * @returns The parsed links (capped at 10), or undefined when none survive.
 */
function parseLinksCell(cell: string | undefined): CopyLink[] | undefined {
  const trimmed = cell?.trim();
  if (!trimmed) {
    return undefined;
  }
  const links: CopyLink[] = [];
  for (const part of trimmed.split(";")) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    const pipeIndex = token.indexOf("|");
    const url = (pipeIndex === -1 ? token : token.slice(0, pipeIndex)).trim();
    const label = pipeIndex === -1 ? "" : token.slice(pipeIndex + 1).trim();
    if (!/^https?:\/\//u.test(url)) {
      continue;
    }
    links.push(label ? { url, label } : { url });
  }
  return links.length > 0 ? links.slice(0, 10) : undefined;
}

/**
 * Builds an entry's metadata from our own export columns (ADR-038). Grading
 * only counts when both grader and a finite grade are present, and it takes
 * precedence over a condition (they are mutually exclusive in the contract).
 * @returns The metadata, or undefined when every field is empty.
 */
function parseOpenRiftMetadata(record: Record<string, string>): ImportCopyMetadata | undefined {
  const grader = record["Grader"]?.trim().toLowerCase() || undefined;
  const gradeRaw = record["Grade"]?.trim();
  const grade = gradeRaw ? Number(gradeRaw) : Number.NaN;
  const graded = grader !== undefined && Number.isFinite(grade);
  const condition = graded ? undefined : conditionSlugFromSource(record["Condition"]);
  const isAltered = /^(?:yes|true|1)$/iu.test(record["Altered"]?.trim() ?? "");
  const notesPublic = record["Public Notes"]?.trim() || undefined;
  const notesPrivate = record["Private Notes"]?.trim() || undefined;
  const links = parseLinksCell(record["Links"]);

  const metadata: ImportCopyMetadata = {
    ...(condition && { condition }),
    ...(graded && { grader, grade }),
    ...(isAltered && { isAltered }),
    ...(notesPublic && { notesPublic }),
    ...(notesPrivate && { notesPrivate }),
    ...(links && { links }),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Parses an OpenRift CSV export (the format produced by our own export).
 *
 * Columns: Card ID, Card Name, Rarity, Type, Domain, Finish, Art Variant,
 *          Promo, Language, Quantity, plus the per-copy metadata columns
 *          (Condition, Grader, Grade, Altered, Public Notes, Private Notes,
 *          Links — ADR-038).
 *
 * All fields map directly to internal types, so no translation is needed.
 * The Promo column may be empty (non-promo) or contain a promo slug like "nexus".
 * Older exports without the Promo or metadata columns are also supported.
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
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
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

    const finish: Finish =
      record["Finish"]?.trim() === WellKnown.finish.FOIL
        ? WellKnown.finish.FOIL
        : WellKnown.finish.NORMAL;
    const artVariantRaw = record["Art Variant"]?.trim();
    // Exports written before the Overnumbered column named it as an art
    // variant; drop that fallback once those are out of circulation.
    const overnumberedCell = record["Overnumbered"];
    let isOvernumbered: boolean | undefined;
    if (overnumberedCell !== undefined) {
      isOvernumbered = overnumberedCell.trim().toLowerCase() === "yes";
    } else if (artVariantRaw === "overnumbered") {
      isOvernumbered = true;
    }
    const artVariant: ArtVariant =
      artVariantRaw === WellKnown.artVariant.ALTART ||
      artVariantRaw === WellKnown.artVariant.ULTIMATE
        ? artVariantRaw
        : WellKnown.artVariant.NORMAL;
    const promoSlug = record["Promo"]?.trim() || undefined;

    entries.push({
      setPrefix: parsed.setPrefix,
      finish,
      artVariant,
      isOvernumbered,
      quantity,
      cardName,
      sourceCode: cardId,
      promoSlug,
      language: record["Language"]?.trim() || undefined,
      metadata: parseOpenRiftMetadata(record),
      rawFields: buildRawFields({
        "Source Code": cardId,
        Rarity: record["Rarity"],
        Type: record["Type"],
        Domain: record["Domain"],
        Finish: record["Finish"],
        "Art Variant": record["Art Variant"],
        Promo: record["Promo"],
        Language: record["Language"],
        Condition: record["Condition"],
        Grader: record["Grader"],
        Grade: record["Grade"],
      }),
    });
  }

  return { entries, errors, source: "openrift", rowCount };
}

/**
 * Parses an OpenRift Card ID like "OGN-001", "OGN-079a", "OGN-123*", or "SFD-T01".
 * Uses the same format as our short codes. The collector part is optional:
 * token printings (the OGN "Buff" tokens) have a bare set code as their entire
 * short code, and our own export writes it that way.
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parseOpenRiftCardId(cardId: string): { setPrefix: string } | null {
  const match = /^(?<set>[A-Z]{3})(?:-(?<code>[A-Z0-9]{3})[a-z*]?)?$/u.exec(cardId);
  if (!match) {
    return null;
  }
  return { setPrefix: match[1] };
}

// ---------------------------------------------------------------------------
// Shared card code helpers
// ---------------------------------------------------------------------------

/**
 * Extracts art variant and normalized short code from a parsed card code.
 * Neither the "a"/"b" (altart) nor "*" (signed) modifier says whether the
 * printing is overnumbered; only the collector number against the set's
 * printed total does, which no import format carries.
 */
function resolveCardModifier(
  setPrefix: string,
  cardNumber: string,
  modifier: string,
): { artVariant: ArtVariant; shortCode: string } {
  const artVariant =
    modifier && modifier !== "*" ? WellKnown.artVariant.ALTART : WellKnown.artVariant.NORMAL;
  const shortCode = `${setPrefix}-${cardNumber}${modifier}`;
  return { artVariant, shortCode };
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
      standardQtyCol === -1
        ? 0
        : // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
          Number.parseInt(row[standardQtyCol]?.trim() ?? "0", 10);
    const foilQty =
      foilQtyCol === -1
        ? 0
        : // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
          Number.parseInt(row[foilQtyCol]?.trim() ?? "0", 10);

    if (!cardId || cardId.startsWith("Exported from")) {
      continue;
    }

    const parsed = parseRiftCoreCardId(cardId);
    if (!parsed) {
      errors.push(`Could not parse Card ID: "${cardId}"`);
      continue;
    }

    const rarity = rarityCol === -1 ? "" : (row[rarityCol]?.trim() ?? "");
    const alwaysFoil = isAlwaysFoilRarity(rarity);

    const baseRawFields: Record<string, string | undefined> = {
      "Source Code": cardId,
      Set: setCol === -1 ? undefined : row[setCol],
      "Card Number": cardNumberCol === -1 ? undefined : row[cardNumberCol],
      Type: typeCol === -1 ? undefined : row[typeCol],
      Rarity: rarityCol === -1 ? undefined : row[rarityCol],
      Domain: domainCol === -1 ? undefined : row[domainCol],
    };

    if (standardQty > 0) {
      const finish: Finish = alwaysFoil ? WellKnown.finish.FOIL : WellKnown.finish.NORMAL;
      entries.push({
        setPrefix: parsed.setPrefix,
        finish,
        artVariant: parsed.artVariant,
        quantity: standardQty,
        cardName,
        sourceCode: parsed.shortCode,
        rawFields: buildRawFields({
          ...baseRawFields,
          Finish: finish === WellKnown.finish.FOIL ? "Foil" : "Normal",
        }),
      });
    }

    if (foilQty > 0) {
      entries.push({
        setPrefix: parsed.setPrefix,
        finish: WellKnown.finish.FOIL,
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
  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[A-Za-z*]?)$/u.exec(cardId);
  if (!match) {
    return null;
  }

  // Normalize modifier to lowercase; RiftCore uses "S" where we use "*"
  const rawModifier = match[3]?.toLowerCase() ?? "";
  const modifier = rawModifier === "s" ? "*" : rawModifier;

  return { setPrefix: match[1], ...resolveCardModifier(match[1], match[2], modifier) };
}

// ---------------------------------------------------------------------------
// RiftMana
// ---------------------------------------------------------------------------

/**
 * Parses a RiftMana CSV export.
 *
 * Columns: Normal Qty, Foil Qty, Card Name, Card ID, Set, Color, Rarity,
 *          Normal Price, Foil Price, Normal Condition, Foil Condition, Notes, Language
 *
 * Normal and foil quantities are separate columns. Alt art uses lowercase letter
 * suffix on Card ID (e.g. "OGN-007a"), overnumbered uses "*" (e.g. "OGN-301*").
 * Promo cards have a `-p` or `-P` suffix (e.g. "OGN-001-p", "OGN-XXX-P").
 * Condition columns encode quantity per condition (e.g. "NM:2;HP:3;SEAL:1"),
 * which splits into one entry per recognized condition (ADR-038); tokens we
 * can't map (like "SEAL") import without a recorded condition.
 * @returns Parsed entries and any parse errors.
 */
function parseRiftMana(text: string): ParseResult {
  const records = parseCSVWithHeaders(text);
  const errors: string[] = [];

  if (records.length === 0) {
    return { entries: [], errors: ["No data rows found."], source: "riftmana", rowCount: 0 };
  }

  const required = ["Normal Qty", "Card Name", "Card ID"];
  const firstRecord = records[0];
  for (const col of required) {
    if (!(col in firstRecord)) {
      errors.push(`Missing required column: "${col}".`);
    }
  }
  if (errors.length > 0) {
    return { entries: [], errors, source: "riftmana", rowCount: 0 };
  }

  const entries: ImportEntry[] = [];
  let rowCount = 0;

  for (const record of records) {
    const cardId = record["Card ID"]?.trim() ?? "";
    const cardName = record["Card Name"]?.trim() ?? "";
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
    const normalQty = Number.parseInt(record["Normal Qty"] ?? "0", 10);
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
    const foilQty = Number.parseInt(record["Foil Qty"] ?? "0", 10);

    if (!cardId || (normalQty <= 0 && foilQty <= 0)) {
      continue;
    }

    rowCount++;

    const parsed = parseRiftManaCardId(cardId);
    if (!parsed) {
      errors.push(`Could not parse Card ID: "${cardId}"`);
      continue;
    }

    const rarity = record["Rarity"]?.trim() ?? "";
    const alwaysFoil = isAlwaysFoilRarity(rarity);
    const language = languageCodeFromSource(record["Language"]);

    const baseRawFields: Record<string, string | undefined> = {
      "Source Code": cardId,
      Set: record["Set"],
      Color: record["Color"],
      Rarity: record["Rarity"],
      Language: record["Language"],
    };

    if (normalQty > 0) {
      const finish: Finish = alwaysFoil ? WellKnown.finish.FOIL : WellKnown.finish.NORMAL;
      for (const split of splitQuantityByCondition(normalQty, record["Normal Condition"])) {
        entries.push({
          setPrefix: parsed.setPrefix,
          finish,
          artVariant: parsed.artVariant,
          quantity: split.quantity,
          cardName,
          sourceCode: parsed.shortCode,
          isPromo: parsed.isPromo || undefined,
          language,
          metadata: split.condition ? { condition: split.condition } : undefined,
          rawFields: buildRawFields({
            ...baseRawFields,
            Finish: finish === WellKnown.finish.FOIL ? "Foil" : "Normal",
            Condition: split.sourceLabel,
          }),
        });
      }
    }

    if (foilQty > 0) {
      for (const split of splitQuantityByCondition(foilQty, record["Foil Condition"])) {
        entries.push({
          setPrefix: parsed.setPrefix,
          finish: WellKnown.finish.FOIL,
          artVariant: parsed.artVariant,
          quantity: split.quantity,
          cardName,
          sourceCode: parsed.shortCode,
          isPromo: parsed.isPromo || undefined,
          language,
          metadata: split.condition ? { condition: split.condition } : undefined,
          rawFields: buildRawFields({
            ...baseRawFields,
            Finish: "Foil",
            Condition: split.sourceLabel,
          }),
        });
      }
    }
  }

  return { entries, errors, source: "riftmana", rowCount };
}

/**
 * Splits a RiftMana quantity across its per-condition encoding
 * (e.g. `NM:2;HP:3;SEAL:1`). Tokens whose condition we can't map, and any
 * quantity the encoding doesn't cover, pool into one condition-less split so
 * the total always matches the quantity column. Each split carries the source
 * token it came from (`sourceLabel`) so the detail panel shows this entry's
 * own condition instead of the whole encoded cell.
 * @returns At least one split summing to `totalQuantity`.
 */
function splitQuantityByCondition(
  totalQuantity: number,
  conditionCell: string | undefined,
): { quantity: number; condition?: string; sourceLabel?: string }[] {
  const cell = conditionCell?.trim();
  if (!cell) {
    return [{ quantity: totalQuantity }];
  }
  const splits: { quantity: number; condition?: string; sourceLabel?: string }[] = [];
  let remaining = totalQuantity;
  let unrecognized = 0;
  const unrecognizedTokens: string[] = [];
  for (const part of cell.split(";")) {
    const token = part.trim();
    if (!token || remaining <= 0) {
      continue;
    }
    const [rawCondition, rawQuantity] = token.split(":");
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an imported cell; Number() would yield NaN on trailing text
    const parsedQuantity = Number.parseInt(rawQuantity ?? "", 10);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      continue;
    }
    const quantity = Math.min(parsedQuantity, remaining);
    remaining -= quantity;
    const condition = conditionSlugFromSource(rawCondition);
    if (condition) {
      splits.push({ quantity, condition, sourceLabel: rawCondition.trim() });
    } else {
      unrecognized += quantity;
      unrecognizedTokens.push(rawCondition.trim());
    }
  }
  const leftover = remaining + unrecognized;
  if (leftover > 0) {
    splits.push({
      quantity: leftover,
      sourceLabel: unrecognizedTokens.length > 0 ? unrecognizedTokens.join("; ") : undefined,
    });
  }
  return splits.length > 0 ? splits : [{ quantity: totalQuantity }];
}

interface RiftManaCardParts {
  setPrefix: string;
  artVariant: ArtVariant;
  /** Normalized short code, e.g. "OGN-007a". Promo suffix is stripped. */
  shortCode: string;
  /** True when a `-p`/`-P` promo suffix was stripped. */
  isPromo: boolean;
}

/**
 * Parses a RiftMana Card ID like "OGN-001", "OGN-007a", "OGN-301*",
 * "OGN-XXX-P", or "OGN-001-p". Strips the promo `-p`/`-P` suffix and
 * normalizes the modifier for matching.
 * @returns Parsed parts, or null if the format is unrecognized.
 */
function parseRiftManaCardId(cardId: string): RiftManaCardParts | null {
  let code = cardId;
  let isPromo = false;

  // Strip promo suffix (-p or -P)
  if (/^.+-[pP]$/u.test(code)) {
    isPromo = true;
    code = code.slice(0, -2);
  }

  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(code);
  if (!match) {
    return null;
  }

  return { setPrefix: match[1], isPromo, ...resolveCardModifier(match[1], match[2], match[3]) };
}
