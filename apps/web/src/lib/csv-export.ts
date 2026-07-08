import type { CopyResponse } from "@openrift/shared";
import { isAlwaysFoilRarity, straightenApostrophes, WellKnown } from "@openrift/shared";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { piltoverConditionCode } from "@/lib/condition-codes";

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
        straightenApostrophes(printing.card.name),
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
        straightenApostrophes(printing.card.name),
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
