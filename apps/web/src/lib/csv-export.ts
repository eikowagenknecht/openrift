import { isAlwaysFoilRarity, straightenApostrophes, WellKnown } from "@openrift/shared";

import type { StackedEntry } from "@/hooks/use-stacked-copies";

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

/**
 * Generates a CSV string from stacked copy entries.
 * @returns CSV text with headers and one row per unique printing.
 */
export function generateExportCSV(stacks: StackedEntry[]): string {
  const lines: string[] = [HEADERS.join(",")];

  for (const stack of stacks) {
    const { printing } = stack;
    const row = [
      printing.shortCode,
      straightenApostrophes(printing.card.name),
      printing.rarity,
      printing.card.type,
      printing.card.domains.join(" / "),
      printing.finish,
      printing.artVariant,
      printing.markers.map((m) => m.slug).join("+"),
      printing.language,
      String(stack.copyIds.length),
    ].map((field) => escapeField(field));
    lines.push(row.join(","));
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
 * @returns CSV text with Piltover Archive headers and one row per printing.
 */
export function generatePiltoverArchiveCSV(stacks: StackedEntry[]): string {
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

    const row = [
      variantNumber,
      straightenApostrophes(printing.card.name),
      titleCaseSlug(printing.setSlug),
      setPrefix,
      titleCaseSlug(printing.rarity),
      piltoverVariantType(printing.artVariant),
      labelParts.join(" "),
      String(stack.copyIds.length),
      printing.language,
      "NM",
    ].map((field) => escapeField(field));
    lines.push(row.join(","));
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
