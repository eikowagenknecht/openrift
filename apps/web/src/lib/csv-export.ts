import type { CopyResponse } from "@openrift/shared";
import {
  formatDay,
  isAlwaysFoilRarity,
  legendDisplayName,
  straightenApostrophes,
  WellKnown,
} from "@openrift/shared";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { conditionShortCode, piltoverConditionCode } from "@/lib/condition-codes";
import { languageNameForCode } from "@/lib/language-names";

const HEADERS = [
  "Card ID",
  "Card Name",
  "Rarity",
  "Type",
  "Domain",
  "Finish",
  "Art Variant",
  "Promo",
  "Language",
  "Quantity",
  "Condition",
  "Grader",
  "Grade",
  "Altered",
  "Public Notes",
  "Private Notes",
  "Links",
] as const;

/** Piltover Archive column order, matching its CSV export and our import parser. */
const PILTOVER_HEADERS = [
  "Variant Number",
  "Card Name",
  "Set",
  "Set Prefix",
  "Rarity",
  "Variant Type",
  "Variant Label",
  "Quantity",
  "Language",
  "Condition",
] as const;

function escapeField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** One export row's worth of copies sharing identical metadata (ADR-038). */
interface MetadataGroup {
  quantity: number;
  /** A representative copy row, or undefined when no metadata is available. */
  copy: CopyResponse | undefined;
}

/**
 * Splits a stack's copies into groups with identical metadata so each group
 * exports as its own row. Without a `copiesById` lookup the whole stack is one
 * metadata-less group (legacy call shape).
 * @returns The metadata groups, insertion-ordered.
 */
function groupStackByMetadata(
  copyIds: readonly string[],
  copiesById?: ReadonlyMap<string, CopyResponse>,
): MetadataGroup[] {
  if (!copiesById) {
    return [{ quantity: copyIds.length, copy: undefined }];
  }
  const groups = new Map<string, MetadataGroup>();
  for (const copyId of copyIds) {
    const copy = copiesById.get(copyId);
    const key = copy
      ? JSON.stringify([
          copy.condition,
          copy.grader,
          copy.grade,
          copy.isAltered,
          copy.notesPublic,
          copy.notesPrivate,
          copy.links,
        ])
      : "";
    const existing = groups.get(key);
    if (existing) {
      existing.quantity++;
    } else {
      groups.set(key, { quantity: 1, copy });
    }
  }
  return [...groups.values()];
}

/**
 * Encodes a copy's links as a single CSV cell: `url|label` entries joined by
 * `; `. Pipes and semicolons are stripped from labels so the encoding stays
 * parseable on import.
 * @returns The encoded cell value.
 */
function encodeLinks(copy: CopyResponse | undefined): string {
  if (!copy || copy.links.length === 0) {
    return "";
  }
  return copy.links
    .map((link) =>
      link.label ? `${link.url}|${link.label.replaceAll(/[|;]/gu, " ").trim()}` : link.url,
    )
    .join("; ");
}

/**
 * Generates a CSV string from stacked copy entries. With a `copiesById`
 * lookup, a printing exports one row per distinct metadata combination
 * (condition, grading, notes, links — ADR-038) instead of one summed row.
 * @returns CSV text with headers and one row per printing+metadata group.
 */
export function generateExportCSV(
  stacks: StackedEntry[],
  copiesById?: ReadonlyMap<string, CopyResponse>,
): string {
  const lines: string[] = [HEADERS.join(",")];

  for (const stack of stacks) {
    const { printing } = stack;
    for (const group of groupStackByMetadata(stack.copyIds, copiesById)) {
      const { copy } = group;
      const row = [
        printing.shortCode,
        straightenApostrophes(legendDisplayName(printing.card)),
        printing.rarity,
        printing.card.types.join(" / "),
        printing.card.domains.join(" / "),
        printing.finish,
        printing.artVariant,
        printing.markers.map((m) => m.slug).join("+"),
        printing.language,
        String(group.quantity),
        copy?.condition ?? "",
        copy?.grader ?? "",
        copy?.grade === undefined || copy.grade === null ? "" : String(copy.grade),
        copy?.isAltered ? "Yes" : "",
        copy?.notesPublic ?? "",
        copy?.notesPrivate ?? "",
        encodeLinks(copy),
      ].map((field) => escapeField(field));
      lines.push(row.join(","));
    }
  }

  return lines.join("\n");
}

// Title-cases a slug like "proving-grounds" → "Proving Grounds".
function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Maps an internal art variant to Piltover Archive's Variant Type label.
function piltoverVariantType(artVariant: string): string {
  switch (artVariant) {
    case WellKnown.artVariant.ALTART: {
      return "Alt Art";
    }
    case WellKnown.artVariant.OVERNUMBERED: {
      return "Overnumbered";
    }
    case WellKnown.artVariant.ULTIMATE: {
      return "Ultimate";
    }
    default: {
      return "Standard";
    }
  }
}

/**
 * Derives a single alphabetic promo suffix token for a Variant Number from a
 * marker label (e.g. "Nexus Night" → "NexusNight"). Piltover's variant-number
 * grammar only allows letters in the suffix, so non-letters are stripped.
 * @returns A letters-only token, or "Promo" when nothing remains.
 */
function promoSuffixToken(label: string): string {
  const token = label.replaceAll(/[^A-Za-z]/gu, "");
  return token || "Promo";
}

/**
 * Generates a CSV string in Piltover Archive's format from stacked copy
 * entries. The output round-trips through {@link parseImportData}: finish is
 * encoded as a `-Foil` suffix on the Variant Number, art variant as the short
 * code's letter/`*` modifier, and promos as an extra `-Label` suffix.
 *
 * Cards whose rarity is always foil (rare/epic/showcase) get no `-Foil` suffix
 * or label — Piltover Archive implies the finish from the rarity and rejects
 * the redundant marker. The importer infers foil the same way, so the round
 * trip is preserved.
 *
 * With a `copiesById` lookup, a printing exports one row per condition
 * (ADR-038). Unrecorded and graded copies fall back to "NM" because the
 * format requires a condition value.
 * @returns CSV text with Piltover Archive headers and one row per printing+condition.
 */
export function generatePiltoverArchiveCSV(
  stacks: StackedEntry[],
  copiesById?: ReadonlyMap<string, CopyResponse>,
): string {
  const lines: string[] = [PILTOVER_HEADERS.join(",")];

  for (const stack of stacks) {
    const { printing } = stack;
    // Only mark foil explicitly when the rarity doesn't already imply it.
    const markFoil =
      printing.finish === WellKnown.finish.FOIL && !isAlwaysFoilRarity(printing.rarity);
    const [primaryMarker] = printing.markers;

    let variantNumber = printing.shortCode;
    if (primaryMarker) {
      variantNumber += `-${promoSuffixToken(primaryMarker.label)}`;
    }
    if (markFoil) {
      variantNumber += "-Foil";
    }

    const labelParts = printing.markers.map((marker) => marker.label);
    if (markFoil) {
      labelParts.push("Foil");
    }

    const setPrefix = printing.shortCode.split("-")[0] ?? "";

    // One row per condition. Piltover's format has no grading concept, so
    // graded copies export under the NM fallback like unrecorded ones.
    const byCondition = new Map<string, number>();
    for (const group of groupStackByMetadata(stack.copyIds, copiesById)) {
      const code = piltoverConditionCode(group.copy?.condition ?? null);
      byCondition.set(code, (byCondition.get(code) ?? 0) + group.quantity);
    }

    for (const [conditionCode, quantity] of byCondition) {
      const row = [
        variantNumber,
        straightenApostrophes(legendDisplayName(printing.card)),
        titleCaseSlug(printing.setSlug),
        setPrefix,
        titleCaseSlug(printing.rarity),
        piltoverVariantType(printing.artVariant),
        labelParts.join(" "),
        String(quantity),
        printing.language,
        conditionCode,
      ].map((field) => escapeField(field));
      lines.push(row.join(","));
    }
  }

  return lines.join("\n");
}

/** RiftMana column order, matching its CSV export and our import parser. */
const RIFTMANA_HEADERS = [
  "Normal Qty",
  "Foil Qty",
  "Card Name",
  "Card ID",
  "Set",
  "Color",
  "Rarity",
  "Normal Price",
  "Foil Price",
  "Normal Condition",
  "Foil Condition",
  "Notes",
  "Language",
] as const;

/**
 * Encodes per-condition counts as a RiftMana condition cell (e.g. "NM:2;LP:1").
 * Copies without a recorded condition (including graded ones) are left out —
 * the importer pools any quantity the encoding doesn't cover into a
 * condition-less entry, so totals still match.
 * @returns The encoded cell, or "" when no copy has a condition.
 */
function encodeRiftManaConditions(groups: readonly MetadataGroup[]): string {
  const byCode = new Map<string, number>();
  for (const group of groups) {
    const slug = group.copy?.condition;
    if (!slug) {
      continue;
    }
    const code = conditionShortCode(slug);
    byCode.set(code, (byCode.get(code) ?? 0) + group.quantity);
  }
  return [...byCode.entries()].map(([code, quantity]) => `${code}:${quantity}`).join(";");
}

/**
 * True when a printing's quantity belongs in the format's foil column. Cards
 * whose rarity is always foil (rare/epic/showcase) go in the normal/standard
 * column — that's where RiftMana and RiftCore track them, and both importers
 * infer foil from the rarity, so the round trip is preserved.
 * @returns Whether to count the printing in the foil quantity column.
 */
function belongsInFoilColumn(printing: StackedEntry["printing"]): boolean {
  return printing.finish === WellKnown.finish.FOIL && !isAlwaysFoilRarity(printing.rarity);
}

interface RiftManaRow {
  cardName: string;
  cardId: string;
  set: string;
  color: string;
  rarity: string;
  language: string;
  normalQty: number;
  foilQty: number;
  normalGroups: MetadataGroup[];
  foilGroups: MetadataGroup[];
}

/**
 * Generates a CSV string in RiftMana's format from stacked copy entries. The
 * output round-trips through {@link parseImportData}: normal and foil copies
 * of the same printing merge into one row with separate quantity columns, art
 * variants stay encoded in the Card ID's modifier, and promo printings get
 * RiftMana's `-p` suffix (the specific promo type is lost — the format only
 * knows "promo").
 *
 * With a `copiesById` lookup, recorded conditions are encoded in the
 * per-finish condition columns (e.g. "NM:2;LP:1" — ADR-038). The price and
 * notes columns are always left empty.
 * @returns CSV text with RiftMana headers and one row per card+language.
 */
export function generateRiftManaCSV(
  stacks: StackedEntry[],
  copiesById?: ReadonlyMap<string, CopyResponse>,
): string {
  const rows = new Map<string, RiftManaRow>();

  for (const stack of stacks) {
    const { printing } = stack;
    const cardId = printing.markers.length > 0 ? `${printing.shortCode}-p` : printing.shortCode;
    const key = `${cardId}::${printing.language}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        cardName: straightenApostrophes(legendDisplayName(printing.card)),
        cardId,
        set: titleCaseSlug(printing.setSlug),
        color: printing.card.domains.join(" / "),
        rarity: titleCaseSlug(printing.rarity),
        language: languageNameForCode(printing.language),
        normalQty: 0,
        foilQty: 0,
        normalGroups: [],
        foilGroups: [],
      };
      rows.set(key, row);
    }
    const groups = groupStackByMetadata(stack.copyIds, copiesById);
    if (belongsInFoilColumn(printing)) {
      row.foilQty += stack.copyIds.length;
      row.foilGroups.push(...groups);
    } else {
      row.normalQty += stack.copyIds.length;
      row.normalGroups.push(...groups);
    }
  }

  const lines: string[] = [RIFTMANA_HEADERS.join(",")];
  for (const row of rows.values()) {
    lines.push(
      [
        String(row.normalQty),
        String(row.foilQty),
        row.cardName,
        row.cardId,
        row.set,
        row.color,
        row.rarity,
        "",
        "",
        encodeRiftManaConditions(row.normalGroups),
        encodeRiftManaConditions(row.foilGroups),
        "",
        row.language,
      ]
        .map((field) => escapeField(field))
        .join(","),
    );
  }
  return lines.join("\n");
}

/** RiftCore column order, matching its CSV export and our import parser. */
const RIFTCORE_HEADERS = [
  "Card ID",
  "Card Name",
  "Set",
  "Card Number",
  "Type",
  "Rarity",
  "Domain",
  "Standard Qty",
  "Foil Qty",
  "Proving Grounds Qty",
  "Total Qty",
] as const;

/**
 * Converts our short code to RiftCore's Card ID spelling: uppercase art
 * modifier ("OGN-030a" → "OGN-030A") and "S" for our "*" ("OGN-123*" →
 * "OGN-123S"). Short codes that don't match the standard grammar (e.g. the
 * bare set prefix of token printings) pass through unchanged.
 * @returns The RiftCore Card ID.
 */
function riftCoreCardId(shortCode: string): string {
  const match = shortCode.match(/^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u);
  if (!match) {
    return shortCode;
  }
  const modifier = match[3] === "*" ? "S" : match[3].toUpperCase();
  return `${match[1]}-${match[2]}${modifier}`;
}

interface RiftCoreRow {
  cardId: string;
  cardName: string;
  set: string;
  cardNumber: string;
  type: string;
  rarity: string;
  domain: string;
  standardQty: number;
  foilQty: number;
}

/**
 * Generates a CSV string in RiftCore's format from stacked copy entries. The
 * output round-trips through {@link parseImportData}: the file leads with the
 * `RIFTCORE COLLECTION EXPORT` marker line the importer detects, then the
 * header row, then one row per card with separate Standard/Foil quantity
 * columns (Proving Grounds Qty is always 0).
 *
 * The format carries no language, condition, or promo information, so those
 * are dropped: printings of the same card in different languages merge into
 * one row.
 * @returns CSV text with the RiftCore preamble, headers, and one row per card.
 */
export function generateRiftCoreCSV(stacks: StackedEntry[]): string {
  const rows = new Map<string, RiftCoreRow>();

  for (const stack of stacks) {
    const { printing } = stack;
    const cardId = riftCoreCardId(printing.shortCode);
    let row = rows.get(cardId);
    if (!row) {
      row = {
        cardId,
        cardName: straightenApostrophes(legendDisplayName(printing.card)),
        set: titleCaseSlug(printing.setSlug),
        cardNumber: printing.shortCode.split("-")[1] ?? "",
        type: printing.card.types.join(" / "),
        rarity: titleCaseSlug(printing.rarity),
        domain: printing.card.domains.join(" / "),
        standardQty: 0,
        foilQty: 0,
      };
      rows.set(cardId, row);
    }
    if (belongsInFoilColumn(printing)) {
      row.foilQty += stack.copyIds.length;
    } else {
      row.standardQty += stack.copyIds.length;
    }
  }

  const lines: string[] = ["RIFTCORE COLLECTION EXPORT", RIFTCORE_HEADERS.join(",")];
  for (const row of rows.values()) {
    lines.push(
      [
        row.cardId,
        row.cardName,
        row.set,
        row.cardNumber,
        row.type,
        row.rarity,
        row.domain,
        String(row.standardQty),
        String(row.foilQty),
        "0",
        String(row.standardQty + row.foilQty),
      ]
        .map((field) => escapeField(field))
        .join(","),
    );
  }
  return lines.join("\n");
}

/** A CSV format the app can export collections and lists to. */
export type CsvExportFormat = "openrift" | "piltover" | "riftmana" | "riftcore";

/** Display label, filename prefix, and writer for each export format. */
export const CSV_EXPORT_FORMATS: Record<
  CsvExportFormat,
  {
    label: string;
    filenamePrefix: string;
    generate: (stacks: StackedEntry[], copiesById?: ReadonlyMap<string, CopyResponse>) => string;
  }
> = {
  openrift: { label: "OpenRift CSV", filenamePrefix: "openrift", generate: generateExportCSV },
  piltover: {
    label: "Piltover Archive CSV",
    filenamePrefix: "piltover",
    generate: generatePiltoverArchiveCSV,
  },
  riftmana: { label: "RiftMana CSV", filenamePrefix: "riftmana", generate: generateRiftManaCSV },
  riftcore: {
    label: "RiftCore CSV",
    filenamePrefix: "riftcore",
    generate: (stacks) => generateRiftCoreCSV(stacks),
  },
};

/**
 * Builds the download filename for an export: `<format>-<name>-<date>.csv`
 * with the name kebab-cased.
 * @returns The filename.
 */
export function csvExportFilename(format: CsvExportFormat, name: string): string {
  const slug =
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-|-$/gu, "") || "export";
  const date = formatDay(new Date());
  return `${CSV_EXPORT_FORMATS[format].filenamePrefix}-${slug}-${date}.csv`;
}

/**
 * Triggers a browser download of the given text content as a CSV file.
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
