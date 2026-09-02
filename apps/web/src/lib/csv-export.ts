import type { CopyResponse, Printing } from "@openrift/shared";
import {
  formatDay,
  isAlwaysFoilRarity,
  legendDisplayName,
  straightenApostrophes,
  WellKnown,
} from "@openrift/shared";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { conditionShortCode } from "@/lib/condition-codes";
import { languageNameForCode } from "@/lib/language-names";

/**
 * The display labels the writers put in text cells, so an export names a set,
 * rarity, condition or grader exactly as the app does. Sets come from the
 * catalog; the rest are the admin-managed enum tables.
 */
export interface CsvExportLabels {
  /** Set slug to display name, e.g. `OGN` to `Origins`. */
  sets: Record<string, string>;
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  graders: Record<string, string>;
}

/**
 * Assembles the writers' labels from the catalog's sets and the enum tables.
 * @returns The label lookups a CSV writer needs.
 */
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

/** The marker slug Piltover treats as its own Variant Type rather than an art variant. */
const PROMO_MARKER = "promo";

/**
 * Piltover's Variant Type. Overnumbered wins over a promo marker (their
 * `OGN-309` is a promo of ours yet types as Overnumbered) and a promo marker
 * wins over the art variant (their `OGN-089b` is alt art yet types as Promo).
 * @returns One of Piltover's Variant Type values.
 */
function piltoverVariantType(printing: Printing): string {
  if (printing.artVariant === WellKnown.artVariant.OVERNUMBERED) {
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
 * Piltover's Variant Label is editorial text of theirs ("OGN Rune", "OGN Foil",
 * "Arcane Box Promo") that mixes set prefix, card type, finish and promo
 * channel under no single rule, so it cannot be reconstructed. This writes the
 * closest thing our own data supports: the variant type, named by the promo's
 * markers where it has them, with signed copies marked as they mark them.
 * @returns The Variant Label cell.
 */
function piltoverVariantLabel(printing: Printing, variantType: string): string {
  const markerLabels = printing.markers.map((marker) => marker.label).join(" ");
  const base = variantType === "Promo" && markerLabels ? markerLabels : variantType;
  return printing.isSigned ? `${base} Signed` : base;
}

/**
 * Generates a CSV string in Piltover Archive's format from stacked copy
 * entries. Their Variant Number is our short code verbatim, including the
 * alt-art letter and the `*` that marks a signed printing, so nothing is
 * encoded into it: finish rides in the `Foil` column and promos in the Variant
 * Type, exactly as their own export writes them.
 *
 * Every text cell is the stored display label, so an admin rename follows the
 * export. `Grading Label` is left to them — it is their rendering of company
 * plus value ("PSA 9 MINT"), and no grade-name table of ours would stay right.
 *
 * With a `copiesById` lookup a printing exports one row per distinct copy
 * metadata (ADR-038), so a graded copy stays its own row instead of merging
 * into the raw ones.
 * @returns CSV text with Piltover Archive headers, one row per printing+metadata.
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
      labels.sets[printing.setSlug],
      printing.shortCode.split("-")[0] ?? "",
      labels.rarities[printing.rarity],
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
        condition === null ? "" : labels.conditions[condition],
        graded ? labels.graders[grader] : "",
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
        set: labels.sets[printing.setSlug],
        color: printing.card.domains.join(" / "),
        rarity: labels.rarities[printing.rarity],
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
  const match = /^(?<set>[A-Z]{3})-(?<code>[A-Z0-9]{3})(?<modifier>[a-z*]?)$/u.exec(shortCode);
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
        set: labels.sets[printing.setSlug],
        cardNumber: printing.shortCode.split("-")[1] ?? "",
        type: printing.card.types.join(" / "),
        rarity: labels.rarities[printing.rarity],
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
