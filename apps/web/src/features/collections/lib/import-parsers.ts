// oxlint-disable typescript/dot-notation -- record keys are CSV column headers; bracket access stays uniform across headers that do and don't contain spaces

import type { CopyLink } from "@openrift/shared/types/api/collection";
import type { ArtVariant, Finish } from "@openrift/shared/types/enums";
import { isAlwaysFoilRarity, WellKnown } from "@openrift/shared/well-known";

import { conditionSlugFromSource } from "@/features/collections/lib/condition-codes";
import { parseCSV, parseCSVWithHeaders } from "@/features/collections/lib/csv";
import { languageCodeFromSource } from "@/lib/language-names";

/** Applied to every copy the entry expands into. Other tools only export a condition. */
export interface ImportCopyMetadata {
  condition?: string;
  grader?: string;
  grade?: number;
  isAltered?: boolean;
  notesPublic?: string;
  notesPrivate?: string;
  links?: CopyLink[];
}

export interface ImportEntry {
  setPrefix: string;
  finish: Finish;
  artVariant: ArtVariant;
  /** Undefined means the source format has no such column ("don't care"), not "false". */
  isOvernumbered?: boolean;
  quantity: number;
  cardName: string;
  sourceCode: string;
  promoSlug?: string;
  isPromo?: boolean;
  language?: string;
  metadata?: ImportCopyMetadata;
  rawFields: Record<string, string>;
}

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

export type ImportFormat = "openrift" | "piltover-archive" | "riftcore" | "riftmana";

interface ParseResult {
  entries: ImportEntry[];
  errors: string[];
  source: ImportFormat;
  /** Before deduplication. */
  rowCount: number;
}

export function detectImportFormat(text: string): ImportFormat | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith("RIFTCORE COLLECTION EXPORT")) {
    return "riftcore";
  }
  const [firstLine = ""] = trimmed.split("\n");
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

/** Variant Label wins over the variant number's modifier, which only marks signed vs. plain. */
function piltoverArtVariant(variantLabel: string, fromModifier?: ArtVariant): ArtVariant {
  if (variantLabel.trim().toLowerCase() === "ultimate") {
    return WellKnown.artVariant.ULTIMATE;
  }
  return fromModifier ?? WellKnown.artVariant.NORMAL;
}

function piltoverIsOvernumbered(variantType: string): boolean {
  return variantType.trim().toLowerCase().startsWith("overnumbered");
}

/** Graded rows leave Condition blank; Grading Label is skipped as a rendering of company + value. */
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

  const [firstRecord] = records;
  if (firstRecord === undefined) {
    return {
      entries: [],
      errors: ["No data rows found."],
      source: "piltover-archive",
      rowCount: 0,
    };
  }

  const required = ["Variant Number", "Card Name", "Quantity", "Foil"];
  for (const col of required) {
    if (!(col in firstRecord)) {
      errors.push(`Missing required column: "${col}".`);
    }
  }
  if (errors.length > 0) {
    return { entries: [], errors, source: "piltover-archive", rowCount: 0 };
  }

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

    // Promo suffix and metadata are both part of the key: stripped from the short code,
    // OGN-263 and OGN-263-Worlds would otherwise pool, and a PSA 9 into the raw copies.
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
  shortCode: string;
  promoSuffix?: string;
}

function parsePiltoverVariantNumber(variantNumber: string): PiltoverVariantParts | null {
  let code = variantNumber;
  let hasFoilSuffix = false;

  if (code.endsWith("-Foil")) {
    hasFoilSuffix = true;
    code = code.slice(0, -5);
  }

  // e.g. "OGN-001", "SFD-T01", "SFD-R04a", "OGN-123*"
  const standardMatch = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(code);
  if (standardMatch) {
    const [, setPrefix, cardNumber, modifier] = standardMatch;
    if (setPrefix === undefined || cardNumber === undefined || modifier === undefined) {
      return null;
    }
    const { artVariant, shortCode } = resolveCardModifier(setPrefix, cardNumber, modifier);
    return {
      setPrefix,
      artVariant,
      hasFoilSuffix,
      shortCode,
    };
  }

  // e.g. "OGN-001-Nexus", "OGN-027a-Release"
  const suffixMatch =
    /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)-(?<suffix>[A-Za-z]+)$/u.exec(code);
  if (suffixMatch) {
    const [, setPrefix, cardNumber, modifier, promoSuffix] = suffixMatch;
    if (setPrefix === undefined || cardNumber === undefined || modifier === undefined) {
      return null;
    }
    const { artVariant, shortCode } = resolveCardModifier(setPrefix, cardNumber, modifier);
    return {
      setPrefix,
      artVariant,
      hasFoilSuffix,
      shortCode,
      promoSuffix,
    };
  }

  return null;
}

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

/** Grading counts only when grader and a finite grade are both present, and takes precedence over condition. */
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

/** Older exports without the Promo or metadata columns are also supported. */
function parseOpenRift(text: string): ParseResult {
  const records = parseCSVWithHeaders(text);
  const errors: string[] = [];

  const [firstRecord] = records;
  if (firstRecord === undefined) {
    return { entries: [], errors: ["No data rows found."], source: "openrift", rowCount: 0 };
  }

  const required = ["Card ID", "Card Name", "Quantity"];
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

/** Collector part is optional: token printings (the OGN "Buff" tokens) use a bare set code. */
function parseOpenRiftCardId(cardId: string): { setPrefix: string } | null {
  const match = /^(?<set>[A-Z]{3})(?:-(?<code>[A-Z0-9]{3})[a-z*]?)?$/u.exec(cardId);
  const setPrefix = match?.[1];
  if (setPrefix === undefined) {
    return null;
  }
  return { setPrefix };
}

/** Neither modifier says whether the printing is overnumbered; no import format carries that. */
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

/** First 6 rows are metadata before the CSV header. Proving Grounds Qty is intentionally ignored. */
function parseRiftCore(text: string): ParseResult {
  const errors: string[] = [];
  const allRows = parseCSV(text);

  let headerIndex = -1;
  let headerRow: string[] = [];
  for (const [index, row] of allRows.slice(0, 10).entries()) {
    if (row.some((cell) => cell.trim() === "Card ID")) {
      headerIndex = index;
      headerRow = row;
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

  const headers = headerRow.map((header) => header.trim());
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

  for (const row of allRows.slice(headerIndex + 1)) {
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
  shortCode: string;
}

function parseRiftCoreCardId(cardId: string): RiftCoreCardParts | null {
  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[A-Za-z*]?)$/u.exec(cardId);
  if (!match) {
    return null;
  }

  // RiftCore uses uppercase "S" where we use "*"
  const rawModifier = match[3]?.toLowerCase() ?? "";
  const modifier = rawModifier === "s" ? "*" : rawModifier;

  const [, setPrefix, cardNumber] = match;
  if (setPrefix === undefined || cardNumber === undefined) {
    return null;
  }

  return { setPrefix, ...resolveCardModifier(setPrefix, cardNumber, modifier) };
}

/** Condition tokens we can't map (like "SEAL") import without a recorded condition. */
function parseRiftMana(text: string): ParseResult {
  const records = parseCSVWithHeaders(text);
  const errors: string[] = [];

  const [firstRecord] = records;
  if (firstRecord === undefined) {
    return { entries: [], errors: ["No data rows found."], source: "riftmana", rowCount: 0 };
  }

  const required = ["Normal Qty", "Card Name", "Card ID"];
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

/** Unmapped tokens and any uncovered quantity pool into one condition-less split. */
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
    const [rawCondition = "", rawQuantity] = token.split(":");
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
  shortCode: string;
  isPromo: boolean;
}

function parseRiftManaCardId(cardId: string): RiftManaCardParts | null {
  let code = cardId;
  let isPromo = false;

  if (/^.+-[pP]$/u.test(code)) {
    isPromo = true;
    code = code.slice(0, -2);
  }

  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(code);
  if (!match) {
    return null;
  }

  const [, setPrefix, cardNumber, modifier] = match;
  if (setPrefix === undefined || cardNumber === undefined || modifier === undefined) {
    return null;
  }

  return { setPrefix, isPromo, ...resolveCardModifier(setPrefix, cardNumber, modifier) };
}
