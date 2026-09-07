import { enumLabel } from "@openrift/shared/enum-label";
import { formatDay } from "@openrift/shared/format-date";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName, straightenApostrophes } from "@openrift/shared/utils";
import { isAlwaysFoilRarity, WellKnown } from "@openrift/shared/well-known";

import { conditionShortCode } from "@/lib/condition-codes";
import { languageNameForCode } from "@/lib/language-names";
import type { StackedEntry } from "@/lib/stacked-entry";

export interface CsvExportLabels {
  sets: Record<string, string>;
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  graders: Record<string, string>;
}

export function csvExportLabels(
  sets: readonly { slug: string; name: string }[],
  labels: {
    rarities: Record<string, string>;
    conditions: Record<string, string>;
    graders: Record<string, string>;
  },
): CsvExportLabels {
  return {
    sets: Object.fromEntries(sets.map((set) => [set.slug, set.name])),
    rarities: labels.rarities,
    conditions: labels.conditions,
    graders: labels.graders,
  };
}

const HEADERS = [
  "Card ID",
  "Card Name",
  "Rarity",
  "Type",
  "Domain",
  "Finish",
  "Art Variant",
  "Overnumbered",
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
  "Foil",
  "Quantity",
  "Language",
  "Condition",
  "Grading Company",
  "Grading Value",
  "Grading Label",
  "Notes",
] as const;

function escapeField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

interface MetadataGroup {
  quantity: number;
  copy: CopyResponse | undefined;
}

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
 * Encodes as `url|label` entries joined by `; `, stripping pipes and
 * semicolons from labels so the encoding stays parseable on import.
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
        printing.isOvernumbered ? "Yes" : "",
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

const PROMO_MARKER = "promo";

function piltoverVariantType(printing: Printing): string {
  if (printing.isOvernumbered) {
    return "Overnumbered";
  }
  if (printing.markers.some((marker) => marker.slug === PROMO_MARKER)) {
    return "Promo";
  }
  if (printing.artVariant === WellKnown.artVariant.ALTART) {
    return "Alt Art";
  }
  if (printing.artVariant === WellKnown.artVariant.ULTIMATE) {
    return "Ultimate";
  }
  return "Standard";
}

/**
 * Piltover's Variant Label is editorial text that mixes several attributes
 * under no single rule, so it can't be reconstructed; this writes the closest
 * equivalent our data supports.
 */
function piltoverVariantLabel(printing: Printing, variantType: string): string {
  const markerLabels = printing.markers.map((marker) => marker.label).join(" ");
  const base = variantType === "Promo" && markerLabels ? markerLabels : variantType;
  return printing.isSigned ? `${base} Signed` : base;
}

/**
 * `Grading Label` is left blank: it is Piltover's own rendering of company
 * plus value ("PSA 9 MINT"), and no grade-name table of ours would stay right.
 */
export function generatePiltoverArchiveCSV(
  stacks: StackedEntry[],
  labels: CsvExportLabels,
  copiesById?: ReadonlyMap<string, CopyResponse>,
): string {
  const lines: string[] = [PILTOVER_HEADERS.join(",")];

  for (const stack of stacks) {
    const { printing } = stack;
    const variantType = piltoverVariantType(printing);
    const identity = [
      printing.shortCode,
      straightenApostrophes(legendDisplayName(printing.card)),
      enumLabel(labels.sets, printing.setSlug),
      printing.shortCode.split("-")[0] ?? "",
      enumLabel(labels.rarities, printing.rarity),
      variantType,
      piltoverVariantLabel(printing, variantType),
      // Their format knows only foil or not; metal and metal-deluxe are foil to them.
      printing.finish === WellKnown.finish.NORMAL ? "false" : "true",
    ];

    for (const group of groupStackByMetadata(stack.copyIds, copiesById)) {
      const copy = group.copy;
      const grader = copy?.grader ?? null;
      const grade = copy?.grade ?? null;
      const graded = grader !== null && grade !== null;
      const condition = graded ? null : (copy?.condition ?? null);
      const row = [
        ...identity,
        String(group.quantity),
        languageNameForCode(printing.language),
        condition === null ? "" : enumLabel(labels.conditions, condition),
        graded ? enumLabel(labels.graders, grader) : "",
        graded ? String(grade) : "",
        "",
        copy?.notesPublic ?? "",
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
 * Copies without a recorded condition are left out of the cell; the importer
 * pools any quantity the encoding doesn't cover into a condition-less entry.
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
 * Always-foil rarities (rare/epic/showcase) go in the normal/standard column;
 * both RiftMana and RiftCore infer foil from rarity, so the round trip holds.
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
 * Promo printings get RiftMana's `-p` suffix; the specific promo type is
 * lost, since the format only knows "promo".
 */
export function generateRiftManaCSV(
  stacks: StackedEntry[],
  labels: CsvExportLabels,
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
        set: enumLabel(labels.sets, printing.setSlug),
        color: printing.card.domains.join(" / "),
        rarity: enumLabel(labels.rarities, printing.rarity),
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
 * RiftCore's Card ID spelling: uppercase art modifier ("OGN-030a" →
 * "OGN-030A") and "S" for our "*" ("OGN-123*" → "OGN-123S").
 */
function riftCoreCardId(shortCode: string): string {
  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(shortCode);
  if (!match) {
    return shortCode;
  }
  const [, setPrefix, cardNumber, rawModifier] = match;
  if (setPrefix === undefined || cardNumber === undefined || rawModifier === undefined) {
    return shortCode;
  }
  const modifier = rawModifier === "*" ? "S" : rawModifier.toUpperCase();
  return `${setPrefix}-${cardNumber}${modifier}`;
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
 * The format carries no language, condition, or promo information, so
 * printings of the same card in different languages merge into one row.
 */
export function generateRiftCoreCSV(stacks: StackedEntry[], labels: CsvExportLabels): string {
  const rows = new Map<string, RiftCoreRow>();

  for (const stack of stacks) {
    const { printing } = stack;
    const cardId = riftCoreCardId(printing.shortCode);
    let row = rows.get(cardId);
    if (!row) {
      row = {
        cardId,
        cardName: straightenApostrophes(legendDisplayName(printing.card)),
        set: enumLabel(labels.sets, printing.setSlug),
        cardNumber: printing.shortCode.split("-")[1] ?? "",
        type: printing.card.types.join(" / "),
        rarity: enumLabel(labels.rarities, printing.rarity),
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

export type CsvExportFormat = "openrift" | "piltover" | "riftmana" | "riftcore";

export const CSV_EXPORT_FORMATS: Record<
  CsvExportFormat,
  {
    label: string;
    filenamePrefix: string;
    generate: (
      stacks: StackedEntry[],
      labels: CsvExportLabels,
      copiesById?: ReadonlyMap<string, CopyResponse>,
    ) => string;
  }
> = {
  openrift: {
    label: "OpenRift CSV",
    filenamePrefix: "openrift",
    generate: (stacks, _labels, copiesById) => generateExportCSV(stacks, copiesById),
  },
  piltover: {
    label: "Piltover Archive CSV",
    filenamePrefix: "piltover",
    generate: generatePiltoverArchiveCSV,
  },
  riftmana: { label: "RiftMana CSV", filenamePrefix: "riftmana", generate: generateRiftManaCSV },
  riftcore: {
    label: "RiftCore CSV",
    filenamePrefix: "riftcore",
    generate: (stacks, labels) => generateRiftCoreCSV(stacks, labels),
  },
};

export function csvExportFilename(format: CsvExportFormat, name: string): string {
  const slug =
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-|-$/gu, "") || "export";
  const date = formatDay(new Date());
  return `${CSV_EXPORT_FORMATS[format].filenamePrefix}-${slug}-${date}.csv`;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
